-- supabase/migrations/007_security_hotfix.sql
-- Phase 0 de l'audit — colmatage des deux failles critiques.
--
--   F-01  Tout membre pouvait se promouvoir admin : la policy "profiles: own update"
--         autorisait l'écriture de sa propre ligne sans WITH CHECK ni restriction de
--         colonne, donc `role` incluse.
--   F-02  Toute liste de prospection était lisible, modifiable et supprimable par
--         n'importe quel membre : "lists: auth all" ne testait que l'authentification.
--
-- À exécuter dans le SQL Editor Supabase. Idempotent : réexécutable sans effet de bord.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Helpers de rôle
--    security definer : la fonction lit profiles en contournant la RLS, ce qui
--    évite la récursion infinie quand une policy de profiles l'appelle.
--    search_path figé : sans ça, un search_path hostile détourne la résolution
--    des noms à l'intérieur d'une fonction security definer.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = uid and role = 'admin'
  );
$$;

revoke all     on function public.is_admin(uuid) from public, anon;
grant  execute on function public.is_admin(uuid) to authenticated;

create or replace function public.current_user_role()
returns user_role
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all     on function public.current_user_role() from public, anon;
grant  execute on function public.current_user_role() to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 2. F-01 — Verrouiller profiles.role
--    Trois verrous superposés, chacun suffisant seul :
--      a. la policy retrouve un WITH CHECK ;
--      b. le privilège UPDATE est restreint aux colonnes d'identité ;
--      c. un trigger refuse tout changement de rôle hors admin, quel que
--         soit le chemin emprunté.
-- ─────────────────────────────────────────────────────────────────────

-- (a)
drop policy if exists "profiles: own update" on public.profiles;

create policy "profiles: own update"
  on public.profiles for update to authenticated
  using      (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- (b) privilèges au niveau colonne : `role` sort du périmètre écrivable
revoke update on public.profiles from authenticated;
grant  update (prenom, nom, email) on public.profiles to authenticated;

-- (c) garde-fou définitif. Volontairement security invoker : is_admin() gère
--     déjà le contournement de RLS, inutile d'élargir la surface.
--     Le service_role est laissé passer, sinon la console d'admin (phase 02)
--     et les scripts backend ne pourraient plus rien écrire.
create or replace function public.guard_profile_role()
returns trigger
language plpgsql
as $$
begin
  if new.role is distinct from old.role
     -- auth.uid() nul = accès SQL direct (SQL Editor, psql, migration). Ce
     -- contexte est déjà privilégié ; garder le verrou n'y protège de rien
     -- et bloquerait les migrations de données qui touchent à `role`.
     and auth.uid() is not null
     and coalesce(auth.role(), '') <> 'service_role'
     and not public.is_admin()
  then
    raise exception 'Seul un administrateur peut modifier le rôle d''un membre'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_profile_role on public.profiles;
create trigger guard_profile_role
  before update on public.profiles
  for each row execute function public.guard_profile_role();

-- Le point (b) ferme aussi la porte aux admins via PostgREST : le changement de
-- rôle passe désormais exclusivement par cette RPC, qui trace l'intention.
create or replace function public.set_member_role(target_id uuid, new_role user_role)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.is_admin() then
    raise exception 'Réservé aux administrateurs'
      using errcode = '42501';
  end if;

  -- Empêche le dernier admin de se verrouiller dehors. Pour passer la main :
  -- promouvoir son successeur d'abord, se faire rétrograder par lui ensuite.
  if target_id = auth.uid() and new_role <> 'admin' then
    raise exception 'Un administrateur ne peut pas se retirer ses propres droits'
      using errcode = '42501';
  end if;

  update public.profiles set role = new_role where id = target_id;

  if not found then
    raise exception 'Membre introuvable' using errcode = 'P0002';
  end if;
end;
$$;

revoke all     on function public.set_member_role(uuid, user_role) from public, anon;
grant  execute on function public.set_member_role(uuid, user_role) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 3. F-02 — Cloisonner les listes de prospection
--    Sémantique retenue :
--      · propriétaire  → tout, y compris renommer et supprimer
--      · destinataire  → lire la liste, ajouter et retirer des contacts
--      · admin         → tout
--    Le partage devient donc collaboratif sur le contenu, mais la liste
--    elle-même reste sous la main de son créateur.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.can_read_list(lid uuid)
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
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
  ) or public.is_admin();
$$;

revoke all     on function public.can_read_list(uuid) from public, anon;
grant  execute on function public.can_read_list(uuid) to authenticated;

-- 3a. prospecting_lists : une policy par verbe, au lieu du FOR ALL fourre-tout
drop policy if exists "lists: auth all" on public.prospecting_lists;

create policy "lists: select own, shared or admin"
  on public.prospecting_lists for select to authenticated
  using (
    created_by = auth.uid()
    or exists (
      select 1 from public.list_shares s
      where s.list_id = prospecting_lists.id and s.shared_with = auth.uid()
    )
    or public.is_admin()
  );

create policy "lists: insert own"
  on public.prospecting_lists for insert to authenticated
  with check (created_by = auth.uid());

create policy "lists: update owner or admin"
  on public.prospecting_lists for update to authenticated
  using      (created_by = auth.uid() or public.is_admin())
  with check (created_by = auth.uid() or public.is_admin());

create policy "lists: delete owner or admin"
  on public.prospecting_lists for delete to authenticated
  using (created_by = auth.uid() or public.is_admin());

-- 3b. la jonction suit les droits de la liste parente
drop policy if exists "list_contacts: auth all" on public.prospecting_list_contacts;

create policy "list_contacts: select via list"
  on public.prospecting_list_contacts for select to authenticated
  using (public.can_read_list(list_id));

create policy "list_contacts: insert via list"
  on public.prospecting_list_contacts for insert to authenticated
  with check (public.can_read_list(list_id));

create policy "list_contacts: delete via list"
  on public.prospecting_list_contacts for delete to authenticated
  using (public.can_read_list(list_id));

-- 3c. les partages : le propriétaire gère les siens, l'admin voit et défait tout
drop policy if exists "list_shares: owner manage" on public.list_shares;

create policy "list_shares: owner manage"
  on public.list_shares for all to authenticated
  using (shared_by = auth.uid() or public.is_admin())
  with check (
    public.is_admin()
    or (
      shared_by = auth.uid()
      and exists (
        select 1 from public.prospecting_lists l
        where l.id = list_shares.list_id and l.created_by = auth.uid()
      )
    )
  );

commit;


-- ─────────────────────────────────────────────────────────────────────
-- Vérification — à passer connecté comme un membre NON admin.
-- Les trois requêtes doivent échouer ou ne rien renvoyer.
-- ─────────────────────────────────────────────────────────────────────
--
--   -- 1. escalade de privilège : doit lever 42501
--   update profiles set role = 'admin' where id = auth.uid();
--
--   -- 2. liste d'autrui : doit renvoyer 0 ligne
--   select count(*) from prospecting_lists where created_by <> auth.uid();
--
--   -- 3. suppression de la liste d'autrui : doit renvoyer 0 ligne supprimée
--   delete from prospecting_lists where created_by <> auth.uid() returning id;
--
--   -- 4. contrôle positif : renommer sa propre liste doit fonctionner
--   update prospecting_lists set name = name where created_by = auth.uid();
