-- supabase/migrations/019_directory_outreach.sql
-- Faire apparaître dans l'annuaire QUI a contacté chaque personne.
--
-- L'information existe depuis 013 — contact_interactions.created_by — mais
-- elle n'était visible qu'en ouvrant une fiche. Or c'est précisément ce
-- qu'on veut savoir AVANT d'écrire à quelqu'un, pas après.
--
-- search_contacts() renvoie donc, pour chaque ligne : le dernier à avoir
-- contacté la personne, quand, par quel canal, combien de démarches en
-- tout, et qui en est responsable.

begin;

-- Le type de retour change : il faut supprimer avant de recréer.
drop function if exists public.search_contacts(text, text, boolean, int, int);

create function public.search_contacts(
  q                text        default null,
  status_filter    text        default null,
  only_null_status boolean     default false,
  contacted_by     uuid        default null,   -- fiches démarchées par cette personne
  only_uncontacted boolean     default false,  -- fiches que personne n'a jamais démarchées
  lim              int         default 50,
  off              int         default 0
)
returns table (
  contact            jsonb,
  total              bigint,
  assignee_id        uuid,
  assignee_nom       text,
  last_contact_at    timestamptz,
  last_contact_by    uuid,
  last_contact_nom   text,
  last_channel       text,
  nb_interactions    bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with filtre as (
    select c.id, c.nom, c.prenom, count(*) over () as total
    from public.contacts c
    where (
        q is null or btrim(q) = ''
        -- Un seul prédicat sur une seule colonne indexée : c'est ce qui
        -- laisse le planificateur choisir le GIN trigramme (cf. 016).
        or c.search_blob like '%' || public.immutable_unaccent(lower(btrim(q))) || '%'
      )
      and (not only_null_status or c.status is null)
      and (status_filter is null or c.status = status_filter)
      and (
        contacted_by is null
        or exists (select 1 from public.contact_interactions i
                   where i.contact_id = c.id and i.created_by = contacted_by)
      )
      and (
        not only_uncontacted
        or not exists (select 1 from public.contact_interactions i where i.contact_id = c.id)
      )
    order by c.nom, c.prenom
    limit lim offset off
  )
  -- Les jointures d'enrichissement viennent APRÈS la limite : elles ne
  -- portent que sur les cinquante lignes affichées, jamais sur 15 737.
  select
    to_jsonb(c.*)                                             as contact,
    f.total,
    a.assigned_to                                             as assignee_id,
    nullif(btrim(coalesce(pa.prenom,'') || ' ' || coalesce(pa.nom,'')), '') as assignee_nom,
    li.occurred_at                                            as last_contact_at,
    li.created_by                                             as last_contact_by,
    nullif(btrim(coalesce(pi.prenom,'') || ' ' || coalesce(pi.nom,'')), '') as last_contact_nom,
    li.channel                                                as last_channel,
    coalesce(ni.n, 0)                                         as nb_interactions
  from filtre f
  join public.contacts c on c.id = f.id
  left join public.contact_assignments a
         on a.contact_id = c.id and a.released_at is null
  left join public.profiles pa on pa.id = a.assigned_to
  left join lateral (
    select i.occurred_at, i.created_by, i.channel
    from public.contact_interactions i
    where i.contact_id = c.id
    order by i.occurred_at desc
    limit 1
  ) li on true
  left join public.profiles pi on pi.id = li.created_by
  left join lateral (
    select count(*) as n from public.contact_interactions i where i.contact_id = c.id
  ) ni on true
  order by c.nom, c.prenom;
$$;

grant execute on function public.search_contacts(text, text, boolean, uuid, boolean, int, int) to authenticated;

-- Qui a démarché qui, pour les compteurs de l'annuaire et le tableau de bord.
create or replace function public.outreach_summary()
returns table (
  membre_id     uuid,
  membre_nom    text,
  contacts_touches bigint,
  demarches     bigint,
  derniere      timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    p.id,
    nullif(btrim(coalesce(p.prenom,'') || ' ' || coalesce(p.nom,'')), ''),
    count(distinct i.contact_id),
    count(*),
    max(i.occurred_at)
  from public.contact_interactions i
  join public.profiles p on p.id = i.created_by
  group by p.id, p.prenom, p.nom
  order by count(distinct i.contact_id) desc;
$$;

grant execute on function public.outreach_summary() to authenticated;

-- Combien de fiches ont été démarchées, tous membres confondus.
create or replace function public.contact_status_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    coalesce(jsonb_object_agg(coalesce(status, '__null__'), n), '{}'::jsonb)
    || jsonb_build_object(
         '__total__',     (select count(*) from public.contacts),
         '__contactes__', (select count(distinct contact_id) from public.contact_interactions)
       )
  from (select status, count(*) as n from public.contacts group by status) s;
$$;

commit;
