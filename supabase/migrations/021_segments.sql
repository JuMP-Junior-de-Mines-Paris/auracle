-- supabase/migrations/021_segments.sql
-- Segmentation de l'annuaire — « trier les contacts en fonction des
-- rôles/entreprises » (todo.md).
--
-- Le problème réel : 15 736 fiches jamais démarchées. Le goulot n'est pas
-- de contacter, c'est de CHOISIR qui. Les champs s'y prêtent — la promotion
-- est renseignée à 100 %, le diplôme ne compte que 67 valeurs distinctes.
--
-- Un segment est un jeu de critères ENREGISTRÉ, pas une liste figée : il se
-- recalcule à chaque ouverture, donc un contact enrichi demain y entre sans
-- qu'on y touche. Pour travailler une campagne, on en verse le résultat
-- dans une liste de prospection, qui elle porte un état par contact.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Filtrage par critères
--    Un seul paramètre jsonb plutôt que quinze paramètres nommés : la
--    liste des critères va continuer de s'allonger, et un segment
--    enregistré doit pouvoir stocker exactement ce qu'on a filtré.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.contacts_matching(criteria jsonb default '{}'::jsonb)
returns setof public.contacts
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select c.*
  from public.contacts c
  where
    -- Texte libre, sur la colonne de recherche indexée (016).
    (coalesce(btrim(criteria->>'q'), '') = ''
     or c.search_blob like '%' || public.immutable_unaccent(lower(btrim(criteria->>'q'))) || '%')

    -- Promotion : bornes incluses, indépendantes l'une de l'autre.
    and (criteria->>'promo_min' is null or c.annee_obtention_diplome >= (criteria->>'promo_min')::int)
    and (criteria->>'promo_max' is null or c.annee_obtention_diplome <= (criteria->>'promo_max')::int)

    -- Listes de valeurs : correspondance partielle, parce que les libellés
    -- saisis à la main varient (« Total », « TotalEnergies », « TOTAL SA »).
    and (criteria->'entreprises' is null or jsonb_array_length(criteria->'entreprises') = 0
         or c.entreprise_actuelle ilike any (
              select '%' || x || '%' from jsonb_array_elements_text(criteria->'entreprises') x))
    and (criteria->'diplomes' is null or jsonb_array_length(criteria->'diplomes') = 0
         or c.diplomes ilike any (
              select '%' || x || '%' from jsonb_array_elements_text(criteria->'diplomes') x))
    and (criteria->'villes' is null or jsonb_array_length(criteria->'villes') = 0
         or c.ville ilike any (
              select '%' || x || '%' from jsonb_array_elements_text(criteria->'villes') x))
    and (criteria->'postes' is null or jsonb_array_length(criteria->'postes') = 0
         or c.titre_poste ilike any (
              select '%' || x || '%' from jsonb_array_elements_text(criteria->'postes') x))
    and (criteria->'pays' is null or jsonb_array_length(criteria->'pays') = 0
         or c.pays ilike any (
              select '%' || x || '%' from jsonb_array_elements_text(criteria->'pays') x))

    -- État de prospection.
    and (criteria->'statuts' is null or jsonb_array_length(criteria->'statuts') = 0
         or c.status = any (select jsonb_array_elements_text(criteria->'statuts')))
    and (coalesce((criteria->>'sans_statut')::boolean, false) = false or c.status is null)

    -- Qui a démarché, ou personne.
    and (criteria->>'demarche_par' is null
         or exists (select 1 from public.contact_interactions i
                    where i.contact_id = c.id and i.created_by = (criteria->>'demarche_par')::uuid))
    and (coalesce((criteria->>'jamais_demarche')::boolean, false) = false
         or not exists (select 1 from public.contact_interactions i where i.contact_id = c.id))

    -- Joignabilité : sans LinkedIn ni e-mail, une fiche n'est pas actionnable.
    and (coalesce((criteria->>'avec_linkedin')::boolean, false) = false or c.linkedin_slug is not null)
    and (coalesce((criteria->>'avec_email')::boolean, false) = false or c.email_norm is not null)

    -- Appartenance à une campagne.
    and (criteria->>'dans_liste' is null
         or exists (select 1 from public.prospecting_list_contacts p
                    where p.contact_id = c.id and p.list_id = (criteria->>'dans_liste')::uuid))
    and (criteria->>'hors_liste' is null
         or not exists (select 1 from public.prospecting_list_contacts p
                        where p.contact_id = c.id and p.list_id = (criteria->>'hors_liste')::uuid))

    -- Le « ne plus contacter » n'est jamais dans un segment de prospection,
    -- sauf à le demander explicitement.
    and (coalesce((criteria->>'inclure_exclus')::boolean, false) = true or c.do_not_contact = false);
$$;

grant execute on function public.contacts_matching(jsonb) to authenticated;

-- Combien de fiches, sans les rapatrier : c'est ce qu'affiche l'aperçu
-- pendant qu'on règle les curseurs.
create or replace function public.count_contacts(criteria jsonb default '{}'::jsonb)
returns bigint
language sql
stable
security invoker
set search_path = public, pg_temp
as $$ select count(*) from public.contacts_matching(criteria); $$;

grant execute on function public.count_contacts(jsonb) to authenticated;

-- Une page de résultats, enrichie comme l'annuaire (019).
create or replace function public.search_segment(
  criteria jsonb default '{}'::jsonb,
  lim int default 50,
  off int default 0
)
returns table (
  contact jsonb, total bigint,
  last_contact_at timestamptz, last_contact_by uuid, last_contact_nom text,
  last_channel text, nb_interactions bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with page as (
    select m.id, m.nom, m.prenom, count(*) over () as total
    from public.contacts_matching(criteria) m
    order by m.nom, m.prenom
    limit lim offset off
  )
  select to_jsonb(c.*), p.total,
         li.occurred_at, li.created_by,
         nullif(btrim(coalesce(pr.prenom,'') || ' ' || coalesce(pr.nom,'')), ''),
         li.channel, coalesce(ni.n, 0)
  from page p
  join public.contacts c on c.id = p.id
  left join lateral (
    select i.occurred_at, i.created_by, i.channel from public.contact_interactions i
    where i.contact_id = c.id order by i.occurred_at desc limit 1
  ) li on true
  left join public.profiles pr on pr.id = li.created_by
  left join lateral (
    select count(*) n from public.contact_interactions i where i.contact_id = c.id
  ) ni on true
  order by c.nom, c.prenom;
$$;

grant execute on function public.search_segment(jsonb, int, int) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 2. De quoi construire les filtres
--    Les valeurs réellement présentes, avec leur poids : proposer
--    « Mines Paris » quand 400 fiches le portent vaut mieux qu'un champ
--    texte vide où l'on devine l'orthographe.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.contact_facets(lim int default 25)
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'promo', (select jsonb_build_object(
                'min', min(annee_obtention_diplome),
                'max', max(annee_obtention_diplome))
              from public.contacts where annee_obtention_diplome is not null),
    'diplomes',    (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                      select jsonb_build_object('valeur', diplomes, 'n', count(*)) x
                      from public.contacts where diplomes is not null
                      group by diplomes order by count(*) desc limit lim) t),
    'entreprises', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                      select jsonb_build_object('valeur', entreprise_actuelle, 'n', count(*)) x
                      from public.contacts where entreprise_actuelle is not null
                      group by entreprise_actuelle order by count(*) desc limit lim) t),
    'villes',      (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                      select jsonb_build_object('valeur', ville, 'n', count(*)) x
                      from public.contacts where ville is not null
                      group by ville order by count(*) desc limit lim) t),
    'pays',        (select coalesce(jsonb_agg(x), '[]'::jsonb) from (
                      select jsonb_build_object('valeur', pays, 'n', count(*)) x
                      from public.contacts where pays is not null
                      group by pays order by count(*) desc limit lim) t)
  );
$$;

grant execute on function public.contact_facets(int) to authenticated;

-- 016 avait supprimé ces index parce que search_contacts les noyait dans un
-- OR sur cinq colonnes. La segmentation filtre chaque champ SÉPARÉMENT, et
-- là l'index sert : on les remet, pour ce nouvel usage.
create index if not exists contacts_entreprise_trgm_idx on public.contacts using gin (entreprise_actuelle gin_trgm_ops);
create index if not exists contacts_ville_trgm_idx      on public.contacts using gin (ville gin_trgm_ops);
create index if not exists contacts_diplomes_trgm_idx   on public.contacts using gin (diplomes gin_trgm_ops);
create index if not exists contacts_promo_idx           on public.contacts (annee_obtention_diplome);


-- ─────────────────────────────────────────────────────────────────────
-- 3. Segments enregistrés
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.segments (
  id          uuid        primary key default gen_random_uuid(),
  name        text        not null check (btrim(name) <> ''),
  description text,
  criteria    jsonb       not null default '{}'::jsonb,
  partage     boolean     not null default true,   -- visible par tous les membres
  created_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by  uuid        references public.profiles(id) on delete set null
);

create index if not exists segments_author_idx on public.segments (created_by);

drop trigger if exists touch_updated on public.segments;
create trigger touch_updated before update on public.segments
  for each row execute function public.touch_updated();

alter table public.segments enable row level security;

drop policy if exists "segments: select" on public.segments;
drop policy if exists "segments: insert" on public.segments;
drop policy if exists "segments: update" on public.segments;
drop policy if exists "segments: delete" on public.segments;

create policy "segments: select" on public.segments
  for select to authenticated using (partage or created_by = auth.uid());

create policy "segments: insert" on public.segments
  for insert to authenticated with check (auth.uid() = created_by);

create policy "segments: update" on public.segments
  for update to authenticated
  using      (created_by = auth.uid() or public.has_perm('lists.manage_all'))
  with check (created_by = auth.uid() or public.has_perm('lists.manage_all'));

create policy "segments: delete" on public.segments
  for delete to authenticated
  using (created_by = auth.uid() or public.has_perm('lists.manage_all'));


-- Verser un segment dans une campagne : c'est là que le dynamique devient
-- du travail, chaque contact recevant son état propre.
create or replace function public.segment_to_list(p_segment uuid, p_list uuid)
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare crit jsonb; n int;
begin
  select criteria into crit from public.segments where id = p_segment;
  if crit is null then
    raise exception 'Segment introuvable' using errcode = 'P0002';
  end if;

  with ajoutes as (
    insert into public.prospecting_list_contacts (list_id, contact_id, added_by, status)
    select p_list, m.id, auth.uid(), 'a_contacter'
    from public.contacts_matching(crit) m
    on conflict (list_id, contact_id) do nothing
    returning 1
  )
  select count(*) into n from ajoutes;

  return n;
end;
$$;

grant execute on function public.segment_to_list(uuid, uuid) to authenticated;

commit;
