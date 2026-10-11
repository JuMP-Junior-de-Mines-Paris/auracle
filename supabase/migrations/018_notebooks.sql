-- supabase/migrations/018_notebooks.sql
-- Carnets partagés — prise de notes et todos à plusieurs.
--
-- Conçu pour se greffer sur l'existant plutôt que de le dédoubler :
--   les notes    -> table `notes`, qui est déjà polymorphe (015)
--   les todos    -> table `tasks`, dont mission_id est déjà nullable (014)
-- Un carnet n'apporte donc qu'un contenant et une règle de visibilité. La
-- conséquence utile : une tâche notée en réunion de bureau apparaît dans
-- « Mes tâches » de la personne, au lieu de dormir dans un compte rendu.
--
-- La visibilité suit les cercles de l'organisation (008), parce que c'est
-- ainsi que l'information circule réellement : le bureau, puis le bureau
-- étendu, puis tout le monde.

begin;

create table if not exists public.notebooks (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null check (btrim(title) <> ''),
  description text,
  icon        text,                       -- un emoji, pour reconnaître d'un coup d'œil
  visibility  text        not null default 'bureau'
              check (visibility in ('prive', 'bureau', 'bureau_etendu', 'tous')),
  archived    boolean     not null default false,
  created_by  uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz,
  updated_by  uuid        references public.profiles(id) on delete set null
);

create index if not exists notebooks_visibility_idx on public.notebooks (visibility) where not archived;
create index if not exists notebooks_author_idx     on public.notebooks (created_by);

drop trigger if exists touch_updated on public.notebooks;
create trigger touch_updated before update on public.notebooks
  for each row execute function public.touch_updated();

-- Invitation nominative, pour les exceptions : associer un chef de projet à
-- un carnet de bureau le temps d'un sujet, sans ouvrir le carnet à tous.
create table if not exists public.notebook_shares (
  notebook_id uuid        not null references public.notebooks(id) on delete cascade,
  profile_id  uuid        not null references public.profiles(id)  on delete cascade,
  can_write   boolean     not null default true,
  shared_by   uuid        references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  primary key (notebook_id, profile_id)
);

create index if not exists notebook_shares_profile_idx on public.notebook_shares (profile_id);


-- ─────────────────────────────────────────────────────────────────────
-- Qui voit quoi
--   security definer : ces fonctions lisent notebooks et profiles depuis
--   les policies de ces mêmes tables ; sans ça, récursion infinie.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.can_read_notebook(nb_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.notebooks n
    left join public.profiles p on p.id = auth.uid()
    left join public.roles    r on r.code = p.role
    where n.id = nb_id
      and (
        n.created_by = auth.uid()
        or n.visibility = 'tous'
        or (n.visibility = 'bureau'        and r.groupe = 'bureau')
        or (n.visibility = 'bureau_etendu' and r.groupe in ('bureau', 'bureau_etendu'))
        or exists (
          select 1 from public.notebook_shares s
          where s.notebook_id = n.id and s.profile_id = auth.uid()
        )
      )
  ) or public.has_perm('admin.full');
$$;

create or replace function public.can_write_notebook(nb_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.notebooks n
    left join public.profiles p on p.id = auth.uid()
    left join public.roles    r on r.code = p.role
    where n.id = nb_id
      and not n.archived
      and (
        n.created_by = auth.uid()
        or n.visibility = 'tous'
        or (n.visibility = 'bureau'        and r.groupe = 'bureau')
        or (n.visibility = 'bureau_etendu' and r.groupe in ('bureau', 'bureau_etendu'))
        or exists (
          select 1 from public.notebook_shares s
          where s.notebook_id = n.id and s.profile_id = auth.uid() and s.can_write
        )
      )
  ) or public.has_perm('admin.full');
$$;

revoke all on function public.can_read_notebook(uuid), public.can_write_notebook(uuid) from public, anon;
grant execute on function public.can_read_notebook(uuid), public.can_write_notebook(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- RLS des carnets
-- ─────────────────────────────────────────────────────────────────────

alter table public.notebooks       enable row level security;
alter table public.notebook_shares enable row level security;

drop policy if exists "notebooks: select" on public.notebooks;
drop policy if exists "notebooks: insert" on public.notebooks;
drop policy if exists "notebooks: update" on public.notebooks;
drop policy if exists "notebooks: delete" on public.notebooks;

create policy "notebooks: select" on public.notebooks
  for select to authenticated using (public.can_read_notebook(id));

create policy "notebooks: insert" on public.notebooks
  for insert to authenticated with check (auth.uid() = created_by);

-- Renommer, changer la visibilité ou archiver reste au créateur : sinon
-- n'importe quel lecteur pourrait refermer le carnet sur les autres.
create policy "notebooks: update" on public.notebooks
  for update to authenticated
  using      (created_by = auth.uid() or public.has_perm('admin.full'))
  with check (created_by = auth.uid() or public.has_perm('admin.full'));

create policy "notebooks: delete" on public.notebooks
  for delete to authenticated
  using (created_by = auth.uid() or public.has_perm('admin.full'));

drop policy if exists "notebook_shares: select" on public.notebook_shares;
drop policy if exists "notebook_shares: manage" on public.notebook_shares;

create policy "notebook_shares: select" on public.notebook_shares
  for select to authenticated
  using (profile_id = auth.uid() or public.can_read_notebook(notebook_id));

create policy "notebook_shares: manage" on public.notebook_shares
  for all to authenticated
  using (exists (select 1 from public.notebooks n
                 where n.id = notebook_id and (n.created_by = auth.uid() or public.has_perm('admin.full'))))
  with check (exists (select 1 from public.notebooks n
                      where n.id = notebook_id and (n.created_by = auth.uid() or public.has_perm('admin.full'))));


-- ─────────────────────────────────────────────────────────────────────
-- Rattachement des notes et des tâches
-- ─────────────────────────────────────────────────────────────────────

-- 'notebook' rejoint les cibles possibles d'une note.
alter table public.notes drop constraint if exists notes_entity_type_check;
alter table public.notes
  add constraint notes_entity_type_check
  check (entity_type in ('contact', 'mission', 'task', 'member', 'list', 'notebook'));

alter table public.tasks add column if not exists notebook_id uuid references public.notebooks(id) on delete cascade;
create index if not exists tasks_notebook_idx on public.tasks (notebook_id) where notebook_id is not null;

-- Jusqu'ici toute note et toute tâche étaient lisibles par tout membre.
-- C'était acceptable tant qu'elles pendaient à un contact ou une mission,
-- que tout le monde voit déjà. Un carnet de bureau, non : ses notes et ses
-- todos doivent suivre sa visibilité.
drop policy if exists "notes: select" on public.notes;
create policy "notes: select" on public.notes
  for select to authenticated
  using (entity_type <> 'notebook' or public.can_read_notebook(entity_id));

drop policy if exists "notes: insert" on public.notes;
create policy "notes: insert" on public.notes
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and (entity_type <> 'notebook' or public.can_write_notebook(entity_id))
  );

drop policy if exists "tasks: select" on public.tasks;
create policy "tasks: select" on public.tasks
  for select to authenticated
  using (notebook_id is null or public.can_read_notebook(notebook_id));

drop policy if exists "tasks: insert" on public.tasks;
create policy "tasks: insert" on public.tasks
  for insert to authenticated
  with check (
    auth.uid() = created_by
    and (notebook_id is null or public.can_write_notebook(notebook_id))
    and (mission_id is null or public.can_edit_mission(mission_id) or public.has_perm('missions.create'))
  );


-- ─────────────────────────────────────────────────────────────────────
-- Vue de liste : le carnet avec de quoi le situer sans l'ouvrir
-- ─────────────────────────────────────────────────────────────────────

create or replace view public.notebooks_overview as
  select n.*,
         p.prenom  as auteur_prenom,
         p.nom     as auteur_nom,
         (select count(*) from public.notes nt
           where nt.entity_type = 'notebook' and nt.entity_id = n.id)        as nb_notes,
         (select count(*) from public.tasks t
           where t.notebook_id = n.id and t.status not in ('termine','annule')) as nb_todos_ouverts,
         (select count(*) from public.tasks t where t.notebook_id = n.id)    as nb_todos,
         greatest(
           n.updated_at,
           (select max(nt.created_at) from public.notes nt
             where nt.entity_type = 'notebook' and nt.entity_id = n.id),
           n.created_at
         ) as derniere_activite
  from public.notebooks n
  left join public.profiles p on p.id = n.created_by;

commit;
