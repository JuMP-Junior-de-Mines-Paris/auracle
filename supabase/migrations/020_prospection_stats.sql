-- supabase/migrations/020_prospection_stats.sql
-- Lecture de la progression de la prospection, globale et par membre.
--
-- Règle d'attribution, une fois pour toutes : un contact est rattaché à
-- l'auteur de sa DERNIÈRE démarche. C'est la lecture la plus juste — celui
-- qui a repris un contact délaissé en porte l'état courant — et la seule
-- qui ne compte jamais deux fois la même fiche.
--
-- Tout est agrégé en base : l'interface ne rapatrie pas 15 737 lignes pour
-- compter dessus.

begin;

create or replace function public.prospection_by_member()
returns table (
  membre_id          uuid,
  membre_nom         text,
  role_code          text,
  demarches          bigint,   -- nombre d'actions effectuées
  contacts_touches   bigint,   -- fiches dont il porte la dernière démarche
  en_cours           bigint,   -- contacté ou relancé
  en_discussion      bigint,
  rdv                bigint,
  convertis          bigint,
  perdus             bigint,   -- refusé ou sans réponse
  relances_en_retard bigint,
  derniere_activite  timestamptz
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with derniere as (
    select distinct on (i.contact_id) i.contact_id, i.created_by
    from public.contact_interactions i
    order by i.contact_id, i.occurred_at desc
  ),
  volume as (
    select created_by, count(*) as n, max(occurred_at) as derniere
    from public.contact_interactions
    group by created_by
  )
  select
    p.id,
    nullif(btrim(coalesce(p.prenom, '') || ' ' || coalesce(p.nom, '')), ''),
    p.role,
    coalesce(v.n, 0),
    count(d.contact_id),
    count(*) filter (where c.status in ('contacte', 'relance')),
    count(*) filter (where c.status = 'en_discussion'),
    count(*) filter (where c.status = 'rdv_planifie'),
    count(*) filter (where c.status = 'converti'),
    count(*) filter (where c.status in ('refuse', 'sans_reponse')),
    count(*) filter (where c.next_action_at < current_date and c.status not in ('converti', 'refuse')),
    v.derniere
  from public.profiles p
  left join derniere d on d.created_by = p.id
  left join public.contacts c on c.id = d.contact_id
  left join volume   v on v.created_by = p.id
  group by p.id, p.prenom, p.nom, p.role, v.n, v.derniere
  -- Tout le bureau apparaît, même à zéro : une ligne vide est une
  -- information, pas un trou à masquer.
  order by coalesce(v.n, 0) desc, p.nom;
$$;

grant execute on function public.prospection_by_member() to authenticated;


-- L'entonnoir global, dans l'ordre du pipeline.
create or replace function public.prospection_funnel()
returns table (code text, label text, rank int, n bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select s.code, s.label, s.rank, count(c.id)
  from public.prospect_statuses s
  left join public.contacts c on c.status = s.code
  group by s.code, s.label, s.rank
  order by s.rank;
$$;

grant execute on function public.prospection_funnel() to authenticated;


-- Le rythme, semaine par semaine. Les semaines sans activité sont générées
-- plutôt qu'omises : un trou dans l'effort doit se voir.
create or replace function public.prospection_activity(semaines int default 12)
returns table (semaine date, demarches bigint, membres_actifs bigint, contacts_touches bigint)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with bornes as (
    select generate_series(
      date_trunc('week', current_date)::date - ((greatest(semaines, 1) - 1) * 7),
      date_trunc('week', current_date)::date,
      interval '7 days'
    )::date as semaine
  )
  select
    b.semaine,
    count(i.id),
    count(distinct i.created_by),
    count(distinct i.contact_id)
  from bornes b
  left join public.contact_interactions i
         on date_trunc('week', i.occurred_at)::date = b.semaine
  group by b.semaine
  order by b.semaine;
$$;

grant execute on function public.prospection_activity(int) to authenticated;


-- Les chiffres de tête, en un appel.
create or replace function public.prospection_overview()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select jsonb_build_object(
    'contacts_total',     (select count(*) from public.contacts),
    'contacts_touches',   (select count(distinct contact_id) from public.contact_interactions),
    'demarches',          (select count(*) from public.contact_interactions),
    'en_discussion',      (select count(*) from public.contacts where status in ('en_discussion', 'rdv_planifie')),
    'convertis',          (select count(*) from public.contacts where status = 'converti'),
    'relances_en_retard', (select count(*) from public.contacts
                            where next_action_at < current_date
                              and status not in ('converti', 'refuse')),
    'membres_actifs_30j', (select count(distinct created_by) from public.contact_interactions
                            where occurred_at > now() - interval '30 days'),
    'demarches_30j',      (select count(*) from public.contact_interactions
                            where occurred_at > now() - interval '30 days')
  );
$$;

grant execute on function public.prospection_overview() to authenticated;

commit;
