-- supabase/migrations/016_search_index.sql
-- Correction de search_contacts() : les index trigrammes posés en 011
-- existaient bien, mais la fonction ne les utilisait pas.
--
-- Mesuré sur les 15 737 fiches réelles :
--   ilike sur UNE colonne indexée   -> Bitmap Index Scan,  1,1 ms
--   le même ilike en OR sur cinq    -> Seq Scan        , 67,0 ms
--
-- Le planificateur ne combine pas quatre index GIN distincts derrière un OR :
-- il estime le parcours séquentiel moins cher et abandonne les index. Poser
-- les index ne suffisait donc pas — il fallait une seule colonne à
-- interroger.
--
-- D'où une colonne générée qui concatène ce sur quoi on cherche, avec son
-- unique index. Effet de bord assumé : « total paris » trouve désormais la
-- personne qui travaille chez Total à Paris, ce qui est plutôt souhaitable
-- pour de la prospection.

begin;

alter table public.contacts
  add column if not exists search_blob text
  generated always as (
    public.immutable_unaccent(lower(
      coalesce(prenom, '') || ' ' || coalesce(nom, '') || ' ' ||
      coalesce(entreprise_actuelle, '') || ' ' || coalesce(titre_poste, '') || ' ' ||
      coalesce(ville, '') || ' ' || coalesce(email, '')
    ))
  ) stored;

create index if not exists contacts_search_blob_trgm_idx
  on public.contacts using gin (search_blob gin_trgm_ops);

-- Les quatre index par colonne deviennent inutiles à la recherche : ils
-- coûtaient de l'écriture à chaque import sans plus rien servir.
drop index if exists public.contacts_fullname_trgm_idx;
drop index if exists public.contacts_entreprise_trgm_idx;
drop index if exists public.contacts_ville_trgm_idx;
drop index if exists public.contacts_titre_trgm_idx;

create or replace function public.search_contacts(
  q                text    default null,
  status_filter    text    default null,
  only_null_status boolean default false,
  lim              int     default 50,
  off              int     default 0
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
        -- Un seul prédicat, sur une seule colonne indexée : c'est ce qui
        -- permet au planificateur de choisir le GIN trigramme.
        or c.search_blob like '%' || public.immutable_unaccent(lower(btrim(q))) || '%'
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

commit;
