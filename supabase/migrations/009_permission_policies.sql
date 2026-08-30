-- supabase/migrations/009_permission_policies.sql
-- Phase 1 (suite) — brancher les politiques RLS sur les permissions.
--
-- 008 a posé le modèle rôle → permission. Ici on remplace, dans chaque
-- politique d'écriture, le test « es-tu le créateur ? » par « es-tu le
-- créateur, OU as-tu la permission qui va bien ? ».
--
-- Règle de lecture : une politique cite TOUJOURS une permission, jamais un
-- nom de rôle. C'est ce qui permet de rediscuter la matrice sans migration.
--
-- Prérequis : 007 et 008 appliquées.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. contacts
--    Lecture ouverte à tout membre. Écriture sous contacts.write,
--    suppression sous contacts.delete.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "contacts: auth select" on public.contacts;
drop policy if exists "contacts: auth insert" on public.contacts;
drop policy if exists "contacts: auth update" on public.contacts;
drop policy if exists "contacts: admin delete" on public.contacts;

create policy "contacts: select" on public.contacts
  for select to authenticated using (true);

create policy "contacts: insert" on public.contacts
  for insert to authenticated with check (public.has_perm('contacts.write'));

create policy "contacts: update" on public.contacts
  for update to authenticated
  using      (public.has_perm('contacts.write'))
  with check (public.has_perm('contacts.write'));

create policy "contacts: delete" on public.contacts
  for delete to authenticated using (public.has_perm('contacts.delete'));


-- ─────────────────────────────────────────────────────────────────────
-- 2. missions
--    Créer demande missions.create. Modifier : être créateur ou chef de
--    projet de CETTE mission, ou détenir missions.edit_all.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.can_edit_mission(mid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.has_perm('missions.edit_all')
      or exists (
        select 1 from public.missions m
        where m.id = mid
          and (m.created_by = auth.uid() or m.chef_de_projet = auth.uid())
      );
$$;

revoke all     on function public.can_edit_mission(uuid) from public, anon;
grant  execute on function public.can_edit_mission(uuid) to authenticated;

drop policy if exists "missions_select" on public.missions;
drop policy if exists "missions_insert" on public.missions;
drop policy if exists "missions_update" on public.missions;
drop policy if exists "missions_delete" on public.missions;

create policy "missions: select" on public.missions
  for select to authenticated using (true);

create policy "missions: insert" on public.missions
  for insert to authenticated
  with check (auth.uid() = created_by and public.has_perm('missions.create'));

create policy "missions: update" on public.missions
  for update to authenticated
  using (
    created_by = auth.uid()
    or chef_de_projet = auth.uid()
    or public.has_perm('missions.edit_all')
  )
  with check (
    created_by = auth.uid()
    or chef_de_projet = auth.uid()
    or public.has_perm('missions.edit_all')
  );

-- Suppression resserrée : ce n'est plus au chef de projet de supprimer.
create policy "missions: delete" on public.missions
  for delete to authenticated using (public.has_perm('missions.delete'));


-- ─────────────────────────────────────────────────────────────────────
-- 3. Sous-objets d'une mission — équipe, jalons, réunions
--    Tous alignés sur can_edit_mission().
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "mission_team_select" on public.mission_team;
drop policy if exists "mission_team_modify" on public.mission_team;
create policy "mission_team: select" on public.mission_team
  for select to authenticated using (true);
create policy "mission_team: modify" on public.mission_team
  for all to authenticated
  using      (public.can_edit_mission(mission_id))
  with check (public.can_edit_mission(mission_id));

drop policy if exists "milestones_select" on public.milestones;
drop policy if exists "milestones_modify" on public.milestones;
create policy "milestones: select" on public.milestones
  for select to authenticated using (true);
create policy "milestones: modify" on public.milestones
  for all to authenticated
  using      (public.can_edit_mission(mission_id))
  with check (public.can_edit_mission(mission_id));

drop policy if exists "meetings_select" on public.meetings;
drop policy if exists "meetings_modify" on public.meetings;
create policy "meetings: select" on public.meetings
  for select to authenticated using (true);
create policy "meetings: modify" on public.meetings
  for all to authenticated
  using      (public.can_edit_mission(mission_id))
  with check (public.can_edit_mission(mission_id));


-- ─────────────────────────────────────────────────────────────────────
-- 4. contact_notes
--    Chacun écrit les siennes ; le bureau peut modérer.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "contact_notes_delete" on public.contact_notes;
create policy "contact_notes: delete" on public.contact_notes
  for delete to authenticated
  using (auth.uid() = created_by or public.is_admin());


-- ─────────────────────────────────────────────────────────────────────
-- 5. Listes de prospection — ajout de lists.manage_all
--    007 avait ouvert au propriétaire, aux destinataires et aux admins.
--    Le responsable développement commercial doit aussi passer partout.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.can_read_list(lid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.has_perm('lists.manage_all')
      or exists (
        select 1
        from public.prospecting_lists l
        where l.id = lid
          and (
            l.created_by = auth.uid()
            or exists (
              select 1 from public.list_shares s
              where s.list_id = l.id and s.shared_with = auth.uid()
            )
          )
      );
$$;

drop policy if exists "lists: select own, shared or admin" on public.prospecting_lists;
drop policy if exists "lists: update owner or admin"       on public.prospecting_lists;
drop policy if exists "lists: delete owner or admin"       on public.prospecting_lists;

create policy "lists: select" on public.prospecting_lists
  for select to authenticated using (public.can_read_list(id));

create policy "lists: update" on public.prospecting_lists
  for update to authenticated
  using      (created_by = auth.uid() or public.has_perm('lists.manage_all'))
  with check (created_by = auth.uid() or public.has_perm('lists.manage_all'));

create policy "lists: delete" on public.prospecting_lists
  for delete to authenticated
  using (created_by = auth.uid() or public.has_perm('lists.manage_all'));


-- ─────────────────────────────────────────────────────────────────────
-- 6. Conventions d'étude
--    Rédiger demande ce.write. Passer en « final » demande ce.finalize :
--    une transition d'état ne s'exprimant pas en RLS (pas d'accès à OLD),
--    elle est gardée par un trigger.
-- ─────────────────────────────────────────────────────────────────────

drop policy if exists "ce_documents: creator insert" on public.ce_documents;
drop policy if exists "ce_documents: creator update" on public.ce_documents;

create policy "ce_documents: insert" on public.ce_documents
  for insert to authenticated
  with check (auth.uid() = created_by and public.has_perm('ce.write'));

create policy "ce_documents: update" on public.ce_documents
  for update to authenticated
  using      (public.has_perm('ce.write'))
  with check (public.has_perm('ce.write'));

create or replace function public.guard_ce_finalize()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'final' and old.status is distinct from 'final'
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.has_perm('ce.finalize')
  then
    raise exception 'Vous n''avez pas le droit de passer une convention en définitif'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_ce_finalize on public.ce_documents;
create trigger guard_ce_finalize
  before update on public.ce_documents
  for each row execute function public.guard_ce_finalize();

commit;


-- ─────────────────────────────────────────────────────────────────────
-- Reste à faire — non couvert ici, et volontairement
-- ─────────────────────────────────────────────────────────────────────
--
--   missions.budget_read / budget_write ne sont PAS appliquées en base.
--   PostgreSQL ne sait pas conditionner l'accès à une colonne au résultat
--   d'une fonction : les privilèges de colonne sont statiques. Les masquer
--   réellement demande une vue (missions_sans_budget) et un basculement de
--   tous les `select *` du front, ce qui dépasse cette migration.
--
--   En l'état, le front masque le budget sans la permission — c'est du
--   confort d'affichage, pas une garantie. Un membre curieux peut encore
--   lire la colonne via l'API. À traiter en phase 07.
--
--
-- Vérification — avec un compte chef_de_projet
-- ─────────────────────────────────────────────────────────────────────
--
--   select * from my_permissions();          -- contacts.write, missions.create, ce.write
--   delete from contacts where id = '<uuid>';       -- 0 ligne : refusé
--   delete from missions where id = '<uuid>';       -- 0 ligne : refusé
--   insert into missions (title, created_by) values ('Test', auth.uid());  -- OK
