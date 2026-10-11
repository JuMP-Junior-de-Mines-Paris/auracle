-- supabase/migrations/015_notes.sql
-- Phase 5 — notes transverses (F-12).
--
-- contact_notes fonctionnait bien mais ne servait qu'aux contacts : rien
-- d'équivalent sur les missions, les clients ou les membres. La table
-- devient polymorphe, et l'ancienne y est reversée sans rien perdre.

begin;

create table if not exists public.notes (
  id          uuid        primary key default gen_random_uuid(),
  entity_type text        not null check (entity_type in ('contact', 'mission', 'task', 'member', 'list')),
  entity_id   uuid        not null,
  content     text        not null check (btrim(content) <> ''),
  pinned      boolean     not null default false,
  mentions    uuid[]      not null default '{}',
  created_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by  uuid        references public.profiles(id) on delete set null
);

-- Pas de clé étrangère : entity_id pointe vers cinq tables différentes.
-- La contrepartie est qu'une note peut survivre à sa cible ; le ménage se
-- fait par purge_orphan_notes(), plus bas.
create index if not exists notes_entity_idx   on public.notes (entity_type, entity_id, created_at desc);
create index if not exists notes_pinned_idx   on public.notes (entity_type, entity_id) where pinned;
create index if not exists notes_author_idx   on public.notes (created_by, created_at desc);
create index if not exists notes_mentions_idx on public.notes using gin (mentions);

drop trigger if exists touch_updated on public.notes;
create trigger touch_updated before update on public.notes
  for each row execute function public.touch_updated();

alter table public.notes enable row level security;

drop policy if exists "notes: select" on public.notes;
drop policy if exists "notes: insert" on public.notes;
drop policy if exists "notes: update" on public.notes;
drop policy if exists "notes: delete" on public.notes;

create policy "notes: select" on public.notes
  for select to authenticated using (true);

create policy "notes: insert" on public.notes
  for insert to authenticated with check (auth.uid() = created_by);

create policy "notes: update" on public.notes
  for update to authenticated
  using (auth.uid() = created_by) with check (auth.uid() = created_by);

-- Le bureau peut modérer ; chacun supprime les siennes.
create policy "notes: delete" on public.notes
  for delete to authenticated
  using (auth.uid() = created_by or public.is_admin());


-- ─────────────────────────────────────────────────────────────────────
-- Reprise de contact_notes
--    L'ancienne table est conservée (renommée) plutôt que supprimée : si
--    la reprise s'avérait fautive, les données d'origine sont encore là.
-- ─────────────────────────────────────────────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'contact_notes') then

    insert into public.notes (id, entity_type, entity_id, content, created_by, created_at)
      select n.id, 'contact', n.contact_id, n.content, n.created_by, n.created_at
      from public.contact_notes n
      -- Seulement les notes dont le contact existe encore : entity_id n'a
      -- pas de clé étrangère, autant ne pas y verser d'orphelins.
      where exists (select 1 from public.contacts c where c.id = n.contact_id)
    on conflict (id) do nothing;

    alter table public.contact_notes rename to contact_notes_legacy;
  end if;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- Fil d'activité : notes et journal fusionnés pour une fiche
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.entity_activity(p_type text, p_id uuid, lim int default 50)
returns table (
  kind        text,
  occurred_at timestamptz,
  actor       uuid,
  actor_name  text,
  content     text,
  details     jsonb
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select 'note'::text, n.created_at, n.created_by,
         trim(coalesce(p.prenom,'') || ' ' || coalesce(p.nom,'')),
         n.content,
         jsonb_build_object('pinned', n.pinned)
  from public.notes n
  left join public.profiles p on p.id = n.created_by
  where n.entity_type = p_type and n.entity_id = p_id

  union all

  -- Le journal n'est visible qu'avec audit.read ; sans la permission, la
  -- moitié « activité » du fil est simplement vide.
  select 'audit'::text, a.occurred_at, a.actor,
         trim(coalesce(p.prenom,'') || ' ' || coalesce(p.nom,'')),
         a.action,
         a.changed
  from public.audit_log a
  left join public.profiles p on p.id = a.actor
  where a.row_id = p_id
    and a.table_name = case p_type
          when 'contact' then 'contacts'
          when 'mission' then 'missions'
          when 'list'    then 'prospecting_lists'
          when 'member'  then 'profiles'
          else null end
    and public.has_perm('audit.read')

  order by 2 desc
  limit lim;
$$;

grant execute on function public.entity_activity(text, uuid, int) to authenticated;

-- Ménage des notes dont la cible a disparu. À passer ponctuellement.
create or replace function public.purge_orphan_notes()
returns int
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare n int;
begin
  if not public.is_admin() then
    raise exception 'Réservé au bureau' using errcode = '42501';
  end if;

  with morts as (
    delete from public.notes nt
    where (nt.entity_type = 'contact' and not exists (select 1 from public.contacts  c where c.id = nt.entity_id))
       or (nt.entity_type = 'mission' and not exists (select 1 from public.missions  m where m.id = nt.entity_id))
       or (nt.entity_type = 'task'    and not exists (select 1 from public.tasks     t where t.id = nt.entity_id))
       or (nt.entity_type = 'member'  and not exists (select 1 from public.profiles  p where p.id = nt.entity_id))
       or (nt.entity_type = 'list'    and not exists (select 1 from public.prospecting_lists l where l.id = nt.entity_id))
    returning 1
  )
  select count(*) into n from morts;

  return n;
end;
$$;

grant execute on function public.purge_orphan_notes() to authenticated;

commit;
