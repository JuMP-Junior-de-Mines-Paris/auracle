-- supabase/migrations/013_prospection.sql
-- Phase 3, lots B et C — suivi des démarches (F-25, F-26, F-27, F-30).
--
-- Le principe : le statut cesse d'être une valeur qu'on écrase, il devient
-- la CONSÉQUENCE de la dernière interaction enregistrée. On n'écrit plus
-- « ce contact est contacté », on écrit « le 3 septembre, Léah lui a envoyé
-- un e-mail, relance le 17 » — et le statut s'en déduit. Plus rien ne peut
-- être affirmé sans trace.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Pipeline élargi
--    Les quatre statuts d'origine ne décrivaient ni la relance, ni le
--    refus, ni le réveil différé : un contact restait bloqué en
--    « contacté » indéfiniment.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.prospect_statuses (
  code   text primary key,
  label  text not null,
  rank   int  not null,
  is_open boolean not null default true   -- false = voie de sortie
);

insert into public.prospect_statuses (code, label, rank, is_open) values
  ('a_contacter',    'À contacter',    10, true),
  ('contacte',       'Contacté',       20, true),
  ('relance',        'Relancé',        30, true),
  ('en_discussion',  'En discussion',  40, true),
  ('rdv_planifie',   'RDV planifié',   50, true),
  ('converti',       'Converti',       60, false),
  ('sans_reponse',   'Sans réponse',   70, false),
  ('refuse',         'Refusé',         80, false),
  ('a_recontacter',  'À recontacter',  90, false)
on conflict (code) do update set label = excluded.label, rank = excluded.rank, is_open = excluded.is_open;

-- Report des valeurs existantes. L'ancienne contrainte CHECK doit sauter
-- d'abord, sinon la mise à jour se heurte à elle. 003 l'a créée via
-- ADD COLUMN ... CHECK, donc sous un nom auto-généré : on le découvre au
-- lieu de le deviner.
do $$
declare c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace ns on ns.oid = rel.relnamespace
    where ns.nspname = 'public' and rel.relname = 'contacts'
      and con.contype = 'c'
      and pg_get_constraintdef(con.oid) ilike '%status%'
  loop
    execute format('alter table public.contacts drop constraint %I', c.conname);
  end loop;
end $$;

update public.contacts set status = case status
  when 'à contacter' then 'a_contacter'
  when 'contacté'    then 'contacte'
  when 'répondu'     then 'en_discussion'
  when 'travaillé'   then 'converti'
  else status
end
where status is not null;

alter table public.contacts drop constraint if exists contacts_status_fkey;
alter table public.contacts
  add constraint contacts_status_fkey foreign key (status) references public.prospect_statuses(code);


-- ─────────────────────────────────────────────────────────────────────
-- 2. Interactions — la table centrale, en ajout seul
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.contact_interactions (
  id            uuid        primary key default gen_random_uuid(),
  contact_id    uuid        not null references public.contacts(id) on delete cascade,
  list_id       uuid        references public.prospecting_lists(id) on delete set null,
  channel       text        not null default 'email'
                            check (channel in ('email','linkedin','telephone','evenement','autre')),
  direction     text        not null default 'sortant'
                            check (direction in ('sortant','entrant')),
  occurred_at   timestamptz not null default now(),
  outcome       text        references public.prospect_statuses(code),
  summary       text,
  next_action_at date,
  next_action    text,
  created_by    uuid        references public.profiles(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists ci_contact_idx  on public.contact_interactions (contact_id, occurred_at desc);
create index if not exists ci_list_idx     on public.contact_interactions (list_id, occurred_at desc);
create index if not exists ci_next_idx     on public.contact_interactions (next_action_at) where next_action_at is not null;
create index if not exists ci_author_idx   on public.contact_interactions (created_by, occurred_at desc);

alter table public.contact_interactions enable row level security;

drop policy if exists "ci: select" on public.contact_interactions;
drop policy if exists "ci: insert" on public.contact_interactions;
drop policy if exists "ci: update" on public.contact_interactions;
drop policy if exists "ci: delete" on public.contact_interactions;

create policy "ci: select" on public.contact_interactions
  for select to authenticated using (true);

create policy "ci: insert" on public.contact_interactions
  for insert to authenticated
  with check (auth.uid() = created_by and public.has_perm('contacts.write'));

-- Corriger sa propre saisie reste possible ; réécrire celle d'un autre non.
create policy "ci: update" on public.contact_interactions
  for update to authenticated
  using      (auth.uid() = created_by or public.has_perm('lists.manage_all'))
  with check (auth.uid() = created_by or public.has_perm('lists.manage_all'));

create policy "ci: delete" on public.contact_interactions
  for delete to authenticated
  using (auth.uid() = created_by or public.has_perm('lists.manage_all'));


-- ─────────────────────────────────────────────────────────────────────
-- 3. Le statut découle de l'interaction
--    Un trigger reporte le résultat sur le contact et sur la campagne.
--    Le champ status reste donc lisible tel quel par l'existant, mais
--    plus personne ne l'écrit à la main.
-- ─────────────────────────────────────────────────────────────────────

alter table public.contacts add column if not exists last_contacted_at timestamptz;
alter table public.contacts add column if not exists next_action_at date;

create or replace function public.apply_interaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  update public.contacts c set
    status            = coalesce(new.outcome, c.status),
    last_contacted_at = greatest(coalesce(c.last_contacted_at, new.occurred_at), new.occurred_at),
    next_action_at    = new.next_action_at
  where c.id = new.contact_id;

  -- Le même contact peut vivre deux campagnes à des stades différents :
  -- l'état de campagne est porté par la jonction (F-27).
  if new.list_id is not null then
    update public.prospecting_list_contacts plc set
      status         = coalesce(new.outcome, plc.status),
      next_action_at = new.next_action_at
    where plc.list_id = new.list_id and plc.contact_id = new.contact_id;
  end if;

  return new;
end;
$$;

drop trigger if exists apply_interaction on public.contact_interactions;
create trigger apply_interaction
  after insert on public.contact_interactions
  for each row execute function public.apply_interaction();


-- ─────────────────────────────────────────────────────────────────────
-- 4. État par campagne (F-27)
-- ─────────────────────────────────────────────────────────────────────

alter table public.prospecting_list_contacts add column if not exists status text references public.prospect_statuses(code);
alter table public.prospecting_list_contacts add column if not exists assigned_to uuid references public.profiles(id) on delete set null;
alter table public.prospecting_list_contacts add column if not exists next_action_at date;
alter table public.prospecting_list_contacts add column if not exists added_by uuid references public.profiles(id) on delete set null;
alter table public.prospecting_list_contacts add column if not exists added_at timestamptz not null default now();

create index if not exists plc_status_idx   on public.prospecting_list_contacts (list_id, status);
create index if not exists plc_assigned_idx on public.prospecting_list_contacts (assigned_to);


-- ─────────────────────────────────────────────────────────────────────
-- 5. Attribution — anti-collision (F-26)
--    L'unicité partielle est la garantie : la base refuse la double prise
--    en main. Ce n'est pas une convention d'équipe qu'on peut oublier.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.contact_assignments (
  id          uuid        primary key default gen_random_uuid(),
  contact_id  uuid        not null references public.contacts(id) on delete cascade,
  assigned_to uuid        not null references public.profiles(id) on delete cascade,
  assigned_by uuid        references public.profiles(id) on delete set null,
  assigned_at timestamptz not null default now(),
  released_at timestamptz
);

create unique index if not exists contact_assignment_active_unique
  on public.contact_assignments (contact_id) where released_at is null;

create index if not exists ca_assignee_idx on public.contact_assignments (assigned_to) where released_at is null;

alter table public.contact_assignments enable row level security;

drop policy if exists "ca: select" on public.contact_assignments;
drop policy if exists "ca: insert" on public.contact_assignments;
drop policy if exists "ca: update" on public.contact_assignments;

create policy "ca: select" on public.contact_assignments
  for select to authenticated using (true);

create policy "ca: insert" on public.contact_assignments
  for insert to authenticated
  with check (
    public.has_perm('contacts.write')
    and (assigned_to = auth.uid() or public.has_perm('contacts.assign_others'))
  );

-- Libérer : le titulaire, ou quelqu'un qui a le droit de réattribuer.
create policy "ca: update" on public.contact_assignments
  for update to authenticated
  using      (assigned_to = auth.uid() or public.has_perm('contacts.assign_others'))
  with check (assigned_to = auth.uid() or public.has_perm('contacts.assign_others'));

-- Prise en main : refuse explicitement plutôt que de laisser remonter une
-- violation d'index, pour que le front puisse nommer le titulaire.
create or replace function public.claim_contact(p_contact_id uuid, p_force boolean default false)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare holder uuid; holder_name text; new_id uuid;
begin
  select a.assigned_to into holder
  from public.contact_assignments a
  where a.contact_id = p_contact_id and a.released_at is null;

  if holder is not null and holder <> auth.uid() then
    if not p_force or not public.has_perm('contacts.assign_others') then
      select trim(coalesce(p.prenom,'') || ' ' || coalesce(p.nom,'')) into holder_name
      from public.profiles p where p.id = holder;
      raise exception 'Contact déjà pris en charge par %', coalesce(nullif(holder_name,''), 'un autre membre')
        using errcode = '55006';
    end if;
    update public.contact_assignments set released_at = now()
    where contact_id = p_contact_id and released_at is null;
  elsif holder = auth.uid() then
    return p_contact_id;   -- déjà le sien, rien à faire
  end if;

  insert into public.contact_assignments (contact_id, assigned_to, assigned_by)
  values (p_contact_id, auth.uid(), auth.uid())
  returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.claim_contact(uuid, boolean) to authenticated;

create or replace function public.release_contact(p_contact_id uuid)
returns void
language sql
security invoker
set search_path = public, pg_temp
as $$
  update public.contact_assignments set released_at = now()
  where contact_id = p_contact_id and released_at is null;
$$;

grant execute on function public.release_contact(uuid) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 6. Vues de travail
-- ─────────────────────────────────────────────────────────────────────

-- Le contact avec son responsable actuel et sa dernière interaction.
create or replace view public.contacts_prospection as
  select c.*,
         a.assigned_to,
         p.prenom  as assignee_prenom,
         p.nom     as assignee_nom,
         a.assigned_at,
         li.occurred_at as last_interaction_at,
         li.channel     as last_channel,
         li.summary     as last_summary
  from public.contacts c
  left join public.contact_assignments a
         on a.contact_id = c.id and a.released_at is null
  left join public.profiles p on p.id = a.assigned_to
  left join lateral (
    select i.occurred_at, i.channel, i.summary
    from public.contact_interactions i
    where i.contact_id = c.id
    order by i.occurred_at desc
    limit 1
  ) li on true;

-- File de relances, transverse aux campagnes. Volontairement NON filtrée
-- sur auth.uid() : le bureau doit voir les relances en souffrance de tout
-- le monde. Le client filtre sur assigned_to pour « mes relances ».
create or replace view public.followups as
  select c.id, c.prenom, c.nom, c.entreprise_actuelle, c.email, c.status,
         c.next_action_at,
         a.assigned_to,
         case
           when c.next_action_at < current_date then 'en_retard'
           when c.next_action_at = current_date then 'aujourdhui'
           else 'a_venir'
         end as echeance
  from public.contacts c
  join public.contact_assignments a
    on a.contact_id = c.id and a.released_at is null
  where c.next_action_at is not null
    and c.do_not_contact = false;

commit;
