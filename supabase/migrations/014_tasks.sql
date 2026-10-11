-- supabase/migrations/014_tasks.sql
-- Phase 4 — tâches assignables (F-11).
--
-- Les jalons se limitaient à un titre, une date et une case cochée : pas de
-- responsable, pas de priorité, pas de sous-tâche, et rien en dehors d'une
-- mission. Le suivi du quotidien n'avait nulle part où vivre.

begin;

create table if not exists public.tasks (
  id           uuid        primary key default gen_random_uuid(),
  title        text        not null check (btrim(title) <> ''),
  description  text,
  -- Nulle : une tâche peut être interne au bureau, sans mission.
  mission_id   uuid        references public.missions(id) on delete cascade,
  milestone_id uuid        references public.milestones(id) on delete set null,
  parent_id    uuid        references public.tasks(id) on delete cascade,
  assigned_to  uuid        references public.profiles(id) on delete set null,
  status       text        not null default 'a_faire'
                           check (status in ('a_faire', 'en_cours', 'en_revue', 'termine', 'annule')),
  priority     text        not null default 'normale'
                           check (priority in ('basse', 'normale', 'haute', 'urgente')),
  due_date     date,
  done_at      timestamptz,
  position     int         not null default 0,   -- ordre dans une colonne du kanban
  created_by   uuid        references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz,
  updated_by   uuid        references public.profiles(id) on delete set null
);

create index if not exists tasks_mission_idx  on public.tasks (mission_id, status, position);
create index if not exists tasks_assignee_idx on public.tasks (assigned_to, status);
create index if not exists tasks_due_idx      on public.tasks (due_date) where status not in ('termine', 'annule');
create index if not exists tasks_parent_idx   on public.tasks (parent_id);

drop trigger if exists touch_updated on public.tasks;
create trigger touch_updated before update on public.tasks
  for each row execute function public.touch_updated();

-- done_at suit le statut sans que le client ait à y penser.
create or replace function public.sync_task_done()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'termine' and coalesce(old.status, '') <> 'termine' then
    new.done_at := now();
  elsif new.status <> 'termine' then
    new.done_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_task_done on public.tasks;
create trigger sync_task_done before insert or update on public.tasks
  for each row execute function public.sync_task_done();

alter table public.tasks enable row level security;

-- Lecture ouverte : la charge de l'équipe se voit. L'écriture suit la
-- mission (can_edit_mission), le responsable de la tâche, ou son auteur.
create or replace function public.can_edit_task(t public.tasks)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.has_perm('missions.edit_all')
      or t.assigned_to = auth.uid()
      or t.created_by  = auth.uid()
      or (t.mission_id is not null and public.can_edit_mission(t.mission_id));
$$;

grant execute on function public.can_edit_task(public.tasks) to authenticated;

drop policy if exists "tasks: select" on public.tasks;
drop policy if exists "tasks: insert" on public.tasks;
drop policy if exists "tasks: update" on public.tasks;
drop policy if exists "tasks: delete" on public.tasks;

create policy "tasks: select" on public.tasks
  for select to authenticated using (true);

create policy "tasks: insert" on public.tasks
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and (mission_id is null or public.can_edit_mission(mission_id) or public.has_perm('missions.create'))
  );

create policy "tasks: update" on public.tasks
  for update to authenticated
  using      (public.can_edit_task(tasks)) with check (public.can_edit_task(tasks));

create policy "tasks: delete" on public.tasks
  for delete to authenticated
  using (created_by = auth.uid() or public.has_perm('missions.edit_all'));

-- Mes tâches, rangées par échéance — l'écran du matin.
create or replace view public.my_tasks as
  select t.*,
         m.title as mission_title,
         case
           when t.due_date is null              then 'sans_echeance'
           when t.due_date <  current_date      then 'en_retard'
           when t.due_date =  current_date      then 'aujourdhui'
           when t.due_date <= current_date + 7  then 'cette_semaine'
           else 'plus_tard'
         end as echeance
  from public.tasks t
  left join public.missions m on m.id = t.mission_id
  where t.assigned_to = auth.uid()
    and t.status not in ('termine', 'annule');

commit;
