-- supabase/migrations/011_contacts_dedup.sql
-- Phase 3, lot A — dédoublonnage de l'annuaire (F-24, F-07, F-14, F-21).
--
-- La table contacts ne portait AUCUNE contrainte d'unicité : ni id_profil,
-- ni email, ni linkedin. Réimporter le même export Mines recréait la base
-- en double.
--
-- Cette migration est NON DESTRUCTIVE : elle ajoute les clés de comparaison,
-- les index, la détection et la fusion — mais ne pose PAS les contraintes
-- d'unicité et ne fusionne rien d'elle-même. Les doublons existants se
-- traitent depuis /annuaire/doublons, puis 012 verrouille.

begin;

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() n'est pas marquée immutable (elle dépend d'un dictionnaire),
-- or une colonne générée l'exige. Wrapper immutable, en figeant le
-- dictionnaire : c'est le contournement standard.
create or replace function public.immutable_unaccent(txt text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$ select public.unaccent('public.unaccent'::regdictionary, txt) $$;


-- ─────────────────────────────────────────────────────────────────────
-- 1. Clés de comparaison
--    Trois clés, chacune appliquée seulement quand elle est renseignée :
--    l'export Mines donne id_profil de façon fiable mais un contact saisi
--    à la main n'en a pas ; l'e-mail manque très souvent ; le LinkedIn est
--    parfois le seul identifiant stable.
-- ─────────────────────────────────────────────────────────────────────

-- Le segment /in/<slug> d'une URL LinkedIn, sans casse ni paramètres.
alter table public.contacts
  add column if not exists linkedin_slug text
  generated always as (
    nullif(lower(substring(linkedin from '/in/([^/?#]+)')), '')
  ) stored;

-- Nom complet normalisé : sans accents, sans casse, espaces resserrés.
alter table public.contacts
  add column if not exists fullname_norm text
  generated always as (
    nullif(
      regexp_replace(
        public.immutable_unaccent(lower(coalesce(prenom, '') || ' ' || coalesce(nom, ''))),
        '\s+', ' ', 'g'
      ),
      ' '
    )
  ) stored;

-- Email normalisé, pour comparer sans se soucier de la casse.
alter table public.contacts
  add column if not exists email_norm text
  generated always as (nullif(lower(trim(email)), '')) stored;

-- Drapeau « ne plus jamais contacter », prioritaire sur toutes les campagnes.
alter table public.contacts add column if not exists do_not_contact boolean not null default false;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Index (F-14, F-21)
--    La recherche faisait quatre ilike '%…%' en OR sur une table sans le
--    moindre index, doublés d'un count exact qui la reparcourait.
-- ─────────────────────────────────────────────────────────────────────

create index if not exists contacts_fullname_trgm_idx   on public.contacts using gin (fullname_norm gin_trgm_ops);
create index if not exists contacts_entreprise_trgm_idx on public.contacts using gin (entreprise_actuelle gin_trgm_ops);
create index if not exists contacts_ville_trgm_idx      on public.contacts using gin (ville gin_trgm_ops);
create index if not exists contacts_titre_trgm_idx      on public.contacts using gin (titre_poste gin_trgm_ops);
create index if not exists contacts_status_idx          on public.contacts (status);
create index if not exists contacts_tags_idx            on public.contacts using gin (tags);
create index if not exists contacts_email_norm_idx      on public.contacts (email_norm);
create index if not exists contacts_linkedin_slug_idx   on public.contacts (linkedin_slug);
create index if not exists contacts_id_profil_idx       on public.contacts (id_profil);


-- ─────────────────────────────────────────────────────────────────────
-- 3. Recherche paramétrée (F-07)
--    Le terme était interpolé brut dans une chaîne de filtre PostgREST :
--    chercher « Dupont, Jean » cassait le filtre. Ici il est un paramètre,
--    jamais concaténé.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.search_contacts(
  q            text default null,
  status_filter text default null,
  only_null_status boolean default false,
  lim          int default 50,
  off          int default 0
)
returns table (contact public.contacts, total bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtered as (
    select c.*
    from public.contacts c
    where (
        q is null or btrim(q) = ''
        or c.fullname_norm      ilike '%' || public.immutable_unaccent(lower(btrim(q))) || '%'
        or c.entreprise_actuelle ilike '%' || btrim(q) || '%'
        or c.titre_poste         ilike '%' || btrim(q) || '%'
        or c.ville               ilike '%' || btrim(q) || '%'
        or c.email_norm          ilike '%' || lower(btrim(q)) || '%'
      )
      and (not only_null_status or c.status is null)
      and (status_filter is null or c.status = status_filter)
  )
  select f::public.contacts, count(*) over () as total
  from filtered f
  order by f.nom, f.prenom
  limit lim offset off;
$$;

grant execute on function public.search_contacts(text, text, boolean, int, int) to authenticated;

-- Les cinq compteurs de l'annuaire en une requête au lieu de cinq (F-21).
create or replace function public.contact_status_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(coalesce(status, '__null__'), n), '{}'::jsonb) || jsonb_build_object('__total__', (select count(*) from public.contacts))
  from (select status, count(*) as n from public.contacts group by status) s;
$$;

grant execute on function public.contact_status_counts() to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Détection des doublons
--    Deux niveaux : l'égalité sur une clé forte (certain), et la
--    similarité de nom à entreprise égale (probable).
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.find_duplicate_candidates(
  p_contact_id uuid    default null,
  p_prenom     text    default null,
  p_nom        text    default null,
  p_email      text    default null,
  p_linkedin   text    default null,
  p_entreprise text    default null,
  p_telephone  text    default null
)
returns table (
  id         uuid,
  prenom     text,
  nom        text,
  email      text,
  entreprise_actuelle text,
  linkedin   text,
  motif      text,
  score      real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with cible as (
    select
      nullif(lower(trim(p_email)), '')                              as email_n,
      nullif(lower(substring(p_linkedin from '/in/([^/?#]+)')), '') as slug,
      nullif(regexp_replace(public.immutable_unaccent(lower(coalesce(p_prenom,'') || ' ' || coalesce(p_nom,''))), '\s+', ' ', 'g'), ' ') as name_n,
      nullif(regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g'), '')  as tel_n,
      nullif(trim(p_entreprise), '')                                as entreprise
  )
  select c.id, c.prenom, c.nom, c.email, c.entreprise_actuelle, c.linkedin,
         case
           when c.email_norm    is not null and c.email_norm    = t.email_n then 'même e-mail'
           when c.linkedin_slug is not null and c.linkedin_slug = t.slug    then 'même profil LinkedIn'
           when t.tel_n is not null
                and nullif(regexp_replace(coalesce(c.telephone,''), '[^0-9]', '', 'g'), '') = t.tel_n
                then 'même téléphone'
           else 'nom proche, même entreprise'
         end as motif,
         case
           when c.email_norm = t.email_n or c.linkedin_slug = t.slug then 1.0::real
           else similarity(c.fullname_norm, t.name_n)
         end as score
  from public.contacts c, cible t
  where (p_contact_id is null or c.id <> p_contact_id)
    and (
      (t.email_n is not null and c.email_norm = t.email_n)
      or (t.slug is not null and c.linkedin_slug = t.slug)
      or (t.tel_n is not null
          and nullif(regexp_replace(coalesce(c.telephone,''), '[^0-9]', '', 'g'), '') = t.tel_n)
      or (
        t.name_n is not null
        and c.fullname_norm % t.name_n
        and similarity(c.fullname_norm, t.name_n) > 0.55
        -- La similarité de nom seule produit trop de faux positifs sur une
        -- promo entière : on exige la même entreprise pour la retenir.
        and t.entreprise is not null
        and c.entreprise_actuelle is not null
        and public.immutable_unaccent(lower(c.entreprise_actuelle))
            = public.immutable_unaccent(lower(t.entreprise))
      )
    )
  order by score desc, c.nom
  limit 25;
$$;

grant execute on function public.find_duplicate_candidates(uuid, text, text, text, text, text, text) to authenticated;

-- Grappes déjà présentes en base, pour la page de nettoyage.
create or replace view public.duplicate_clusters as
  select 'email'::text as cle, email_norm as valeur,
         count(*) as n, array_agg(id order by created_at) as contact_ids
  from public.contacts where email_norm is not null
  group by email_norm having count(*) > 1
union all
  select 'linkedin', linkedin_slug, count(*), array_agg(id order by created_at)
  from public.contacts where linkedin_slug is not null
  group by linkedin_slug having count(*) > 1
union all
  select 'id_profil', id_profil, count(*), array_agg(id order by created_at)
  from public.contacts where id_profil is not null and btrim(id_profil) <> ''
  group by id_profil having count(*) > 1;


-- ─────────────────────────────────────────────────────────────────────
-- 5. Fusion
--    La fiche maître absorbe les champs vides des autres, récupère notes,
--    tags et appartenances aux listes, puis les doublons sont supprimés.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.merge_contacts(master_id uuid, duplicate_ids uuid[])
returns void
language plpgsql
-- security definer : la fonction EST le contrôle d'accès (elle exige
-- contacts.merge ci-dessous). En invoker, son DELETE final retomberait sur
-- la RLS de contacts, qui demande contacts.delete — une permission
-- différente : la fusion s'exécuterait sans supprimer les doublons.
security definer
set search_path = public, pg_temp
as $$
declare d uuid;
begin
  if not public.has_perm('contacts.merge') then
    raise exception 'Vous n''avez pas le droit de fusionner des contacts'
      using errcode = '42501';
  end if;

  if master_id = any(duplicate_ids) then
    raise exception 'La fiche maître ne peut pas figurer parmi les doublons'
      using errcode = '22023';
  end if;

  -- Compléter les trous de la fiche maître avec ce que les doublons savent.
  update public.contacts m set
    id_profil               = coalesce(m.id_profil, s.id_profil),
    pays                    = coalesce(m.pays, s.pays),
    ville                   = coalesce(m.ville, s.ville),
    annee_obtention_diplome = coalesce(m.annee_obtention_diplome, s.annee_obtention_diplome),
    diplomes                = coalesce(m.diplomes, s.diplomes),
    entreprise_actuelle     = coalesce(m.entreprise_actuelle, s.entreprise_actuelle),
    titre_poste             = coalesce(m.titre_poste, s.titre_poste),
    email                   = coalesce(m.email, s.email),
    telephone               = coalesce(m.telephone, s.telephone),
    linkedin                = coalesce(m.linkedin, s.linkedin),
    mpa_profile             = coalesce(m.mpa_profile, s.mpa_profile),
    status                  = coalesce(m.status, s.status),
    do_not_contact          = m.do_not_contact or s.dnc,
    tags                    = (
      select coalesce(array_agg(distinct x), '{}')
      from unnest(coalesce(m.tags, '{}') || coalesce(s.tags, '{}')) x
    )
  from (
    select
      min(id_profil)               as id_profil,
      min(pays)                    as pays,
      min(ville)                   as ville,
      min(annee_obtention_diplome) as annee_obtention_diplome,
      min(diplomes)                as diplomes,
      min(entreprise_actuelle)     as entreprise_actuelle,
      min(titre_poste)             as titre_poste,
      min(email)                   as email,
      min(telephone)               as telephone,
      min(linkedin)                as linkedin,
      min(mpa_profile)             as mpa_profile,
      min(status)                  as status,
      bool_or(do_not_contact)      as dnc,
      coalesce((select array_agg(distinct t) from public.contacts c2, unnest(coalesce(c2.tags,'{}')) t
                where c2.id = any(duplicate_ids)), '{}') as tags
    from public.contacts
    where id = any(duplicate_ids)
  ) s
  where m.id = master_id;

  -- Rapatrier ce qui pend aux doublons.
  update public.contact_notes set contact_id = master_id where contact_id = any(duplicate_ids);

  foreach d in array duplicate_ids loop
    -- La jonction a une clé primaire (list_id, contact_id) : réaffecter en
    -- masse violerait l'unicité quand les deux fiches sont dans la même
    -- liste. On insère en ignorant les conflits, puis on supprime.
    insert into public.prospecting_list_contacts (list_id, contact_id)
      select list_id, master_id from public.prospecting_list_contacts where contact_id = d
      on conflict do nothing;
    delete from public.prospecting_list_contacts where contact_id = d;
  end loop;

  delete from public.contacts where id = any(duplicate_ids);
end;
$$;

grant execute on function public.merge_contacts(uuid, uuid[]) to authenticated;

commit;


-- ─────────────────────────────────────────────────────────────────────
-- Après application
-- ─────────────────────────────────────────────────────────────────────
--   select * from duplicate_clusters order by n desc;   -- l'ampleur du travail
--   -- puis nettoyer depuis /annuaire/doublons, et enfin appliquer 012.
