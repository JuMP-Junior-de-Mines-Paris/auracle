-- supabase/schema.sql

-- Role enum
create type user_role as enum ('admin', 'project_manager', 'consultant');

-- profiles — extends auth.users, one row per member
create table profiles (
  id      uuid references auth.users(id) on delete cascade primary key,
  role    user_role not null default 'consultant',
  prenom  text not null default '',
  nom     text not null default ''
);

-- contacts — the full directory model
create table contacts (
  id                       uuid primary key default gen_random_uuid(),
  id_profil                text,
  prenom                   text,
  nom                      text,
  pays                     text,
  ville                    text,
  annee_obtention_diplome  integer,
  diplomes                 text,
  entreprise_actuelle      text,
  titre_poste              text,
  email                    text,
  telephone                text,
  linkedin                 text,
  created_by               uuid references profiles(id),
  created_at               timestamptz default now()
);

-- prospecting_lists
create table prospecting_lists (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  created_by uuid references profiles(id),
  created_at timestamptz default now()
);

-- prospecting_list_contacts — junction table
create table prospecting_list_contacts (
  list_id    uuid references prospecting_lists(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  primary key (list_id, contact_id)
);

-- ── RLS ──────────────────────────────────────────────────────────────
alter table profiles                enable row level security;
alter table contacts                enable row level security;
alter table prospecting_lists       enable row level security;
alter table prospecting_list_contacts enable row level security;

-- profiles: each user reads/updates only their own row
create policy "profiles: own read"
  on profiles for select using (auth.uid() = id);
create policy "profiles: own update"
  on profiles for update using (auth.uid() = id);

-- contacts: all authenticated users can read, insert, update
create policy "contacts: auth select"
  on contacts for select using (auth.role() = 'authenticated');
create policy "contacts: auth insert"
  on contacts for insert with check (auth.role() = 'authenticated');
create policy "contacts: auth update"
  on contacts for update using (auth.role() = 'authenticated');
-- only admins can delete
create policy "contacts: admin delete"
  on contacts for delete using (
    exists (select 1 from profiles where id = auth.uid() and role = 'admin')
  );

-- prospecting_lists + junction: all authenticated users full access
create policy "lists: auth all"
  on prospecting_lists for all using (auth.role() = 'authenticated');
create policy "list_contacts: auth all"
  on prospecting_list_contacts for all using (auth.role() = 'authenticated');

-- ── Trigger: auto-create profile on sign-up ───────────────────────────
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
