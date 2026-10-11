-- supabase/migrations/012_contacts_unique.sql
-- Phase 3, lot A (fin) — verrouiller l'unicité des contacts.
--
-- À APPLIQUER APRÈS avoir vidé /annuaire/doublons. Si des doublons
-- subsistent, la migration s'arrête avec le détail plutôt que d'échouer
-- sur un message d'index illisible.
--
-- Trois index uniques PARTIELS : une clé ne contraint que les fiches où
-- elle est renseignée. Un contact sans e-mail n'est donc jamais bloqué.

begin;

do $$
declare
  n_email    int;
  n_linkedin int;
  n_profil   int;
begin
  select count(*) into n_email    from public.duplicate_clusters where cle = 'email';
  select count(*) into n_linkedin from public.duplicate_clusters where cle = 'linkedin';
  select count(*) into n_profil   from public.duplicate_clusters where cle = 'id_profil';

  if n_email + n_linkedin + n_profil > 0 then
    raise exception E'Doublons restants : % sur l''e-mail, % sur LinkedIn, % sur id_profil.\nNettoyez-les depuis /annuaire/doublons (ou merge_contacts()) avant d''appliquer cette migration.\n  select * from duplicate_clusters order by n desc;',
      n_email, n_linkedin, n_profil;
  end if;
end $$;

create unique index if not exists contacts_email_unique
  on public.contacts (email_norm) where email_norm is not null;

create unique index if not exists contacts_linkedin_unique
  on public.contacts (linkedin_slug) where linkedin_slug is not null;

create unique index if not exists contacts_id_profil_unique
  on public.contacts (id_profil) where id_profil is not null and btrim(id_profil) <> '';


-- ─────────────────────────────────────────────────────────────────────
-- Import CSV — insertion idempotente (F-28)
--
-- Réimporter le même export met désormais à jour au lieu de dupliquer.
-- La résolution suit l'ordre de fiabilité des clés : id_profil, puis
-- e-mail, puis LinkedIn.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.upsert_contact(payload jsonb)
returns table (id uuid, action text)
language plpgsql
-- Même raison que merge_contacts : la fonction porte le contrôle
-- (contacts.import), l'écriture ne doit pas redemander contacts.write.
security definer
set search_path = public, pg_temp
as $$
declare
  existing uuid;
  v_email  text := nullif(lower(trim(payload->>'email')), '');
  v_slug   text := nullif(lower(substring(payload->>'linkedin' from '/in/([^/?#]+)')), '');
  v_profil text := nullif(btrim(payload->>'id_profil'), '');
begin
  if not public.has_perm('contacts.import') then
    raise exception 'Vous n''avez pas le droit d''importer des contacts'
      using errcode = '42501';
  end if;

  select c.id into existing from public.contacts c
   where (v_profil is not null and c.id_profil = v_profil)
      or (v_email  is not null and c.email_norm = v_email)
      or (v_slug   is not null and c.linkedin_slug = v_slug)
   limit 1;

  if existing is null then
    insert into public.contacts (
      id_profil, prenom, nom, pays, ville, annee_obtention_diplome, diplomes,
      entreprise_actuelle, titre_poste, email, telephone, linkedin, created_by
    )
    select v_profil,
           payload->>'prenom', payload->>'nom', payload->>'pays', payload->>'ville',
           nullif(payload->>'annee_obtention_diplome', '')::numeric::int,
           payload->>'diplomes', payload->>'entreprise_actuelle', payload->>'titre_poste',
           nullif(trim(payload->>'email'), ''), payload->>'telephone',
           nullif(trim(payload->>'linkedin'), ''), auth.uid()
    returning contacts.id into existing;

    return query select existing, 'cree'::text;
  else
    -- Ne jamais écraser une donnée existante par une valeur vide : un
    -- export partiel ne doit pas appauvrir une fiche enrichie à la main.
    update public.contacts c set
      prenom                  = coalesce(nullif(payload->>'prenom', ''), c.prenom),
      nom                     = coalesce(nullif(payload->>'nom', ''), c.nom),
      pays                    = coalesce(nullif(payload->>'pays', ''), c.pays),
      ville                   = coalesce(nullif(payload->>'ville', ''), c.ville),
      annee_obtention_diplome = coalesce(nullif(payload->>'annee_obtention_diplome', '')::numeric::int, c.annee_obtention_diplome),
      diplomes                = coalesce(nullif(payload->>'diplomes', ''), c.diplomes),
      entreprise_actuelle     = coalesce(nullif(payload->>'entreprise_actuelle', ''), c.entreprise_actuelle),
      titre_poste             = coalesce(nullif(payload->>'titre_poste', ''), c.titre_poste),
      email                   = coalesce(nullif(trim(payload->>'email'), ''), c.email),
      telephone               = coalesce(nullif(payload->>'telephone', ''), c.telephone),
      linkedin                = coalesce(nullif(trim(payload->>'linkedin'), ''), c.linkedin),
      id_profil               = coalesce(c.id_profil, v_profil)
    where c.id = existing;

    return query select existing, 'maj'::text;
  end if;
end;
$$;

grant execute on function public.upsert_contact(jsonb) to authenticated;

commit;
