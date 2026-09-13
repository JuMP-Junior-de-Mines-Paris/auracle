-- ═══════════════════════════════════════════════════════════════════
--  JuMP Oracle — bloc 1/2 : socle de permissions et nouveaux modules
--  Généré par supabase/bundle.py — ne pas éditer à la main.
--
--  À coller dans le SQL Editor Supabase et exécuter d'un bloc.
--  Chaque migration garde sa propre transaction : si l'une échoue, les
--  précédentes restent acquises et le message dit laquelle reprendre.
--
--  Contient : 007, 008, 009, 010, 011, 013, 014, 015, 016, 017, 018, 019, 020
--
--  APRÈS : attribuer les vrais rôles depuis /admin, puis nettoyer
--  /annuaire/doublons, puis exécuter le bloc 2.
-- ═══════════════════════════════════════════════════════════════════


-- ───────────────────────────────────────────────────────────────
--  007_security_hotfix.sql
-- ───────────────────────────────────────────────────────────────

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
  -- role::text et non role = 'admin' : sur cette base l'énumération a été
  -- étendue avec des libellés français et ne contient PLUS 'admin', si bien
  -- que la comparaison directe échoue au typage (22P02) avant même de lire
  -- une ligne. Le cast compare des chaînes et fonctionne quelles que soient
  -- les valeurs de l'enum.
  --
  -- Conséquence assumée : entre 007 et 008, plus personne n'est admin, donc
  -- personne ne bénéficie de l'exception. C'est sans danger — 007 sert à
  -- FERMER deux trous, pas à ouvrir des droits — et 008, qui suit
  -- immédiatement, redéfinit cette fonction sur la vraie matrice.
  select exists (
    select 1 from public.profiles
    where id = uid and role::text = 'admin'
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

do $$ begin raise notice '  ✓ 007_security_hotfix.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  008_rbac_roles.sql
-- ───────────────────────────────────────────────────────────────

-- supabase/migrations/008_rbac_roles.sql
-- Phase 1 de l'audit — socle de permissions.
--
-- Remplace l'énumération figée (admin / project_manager / consultant) par les
-- neuf rôles réels du bureau, et surtout : découple le rôle de la permission.
--
--   roles             la place dans le bureau, ce qui s'affiche sur la fiche membre
--   permissions       le catalogue de ce qu'on peut faire, un code par action
--   role_permissions  la correspondance — c'est de la DONNÉE, pas du code
--
-- Pourquoi une table et non un enum : le bureau tourne tous les ans, un rôle
-- peut apparaître, et les droits se rediscutent. Avec neuf rôles écrits en dur
-- dans une vingtaine de policies, chaque ajustement redevient une migration.
-- Ici, la matrice se modifie depuis la console d'admin, sans toucher au SQL.
--
-- Prérequis : 007_security_hotfix.sql appliquée.
-- À exécuter dans le SQL Editor Supabase.

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. Catalogue des rôles
-- ─────────────────────────────────────────────────────────────────────

-- `groupe` reflète l'organisation réelle de la JuMP :
--   bureau         président, vice-président, secrétaire, trésorier — tous les droits
--   bureau_etendu  les vice et les respos — des droits ciblés sur leur domaine
--   membre         le reste, dont les chefs de projet
-- Le groupe sert à l'affichage et à la lecture de la matrice ; il ne confère
-- aucun droit par lui-même. Tout passe par role_permissions, sans exception.
create table if not exists public.roles (
  code   text primary key,
  label  text not null,
  groupe text not null default 'membre'
         check (groupe in ('bureau', 'bureau_etendu', 'membre')),
  rank   int  not null default 100   -- ordre d'affichage, hiérarchie du bureau
);

alter table public.roles add column if not exists groupe text not null default 'membre';

insert into public.roles (code, label, groupe, rank) values
  ('president',          'Président·e',                          'bureau',        10),
  ('vice_president',     'Vice-président·e',                     'bureau',        20),
  ('secretaire_general', 'Secrétaire général·e',                 'bureau',        30),
  ('tresorier',          'Trésorier·ère',                        'bureau',        40),
  ('vice_tresorier',     'Vice-trésorier·ère',                   'bureau_etendu', 50),
  ('respo_dev_co',       'Responsable développement commercial', 'bureau_etendu', 60),
  ('respo_qualite',      'Responsable qualité',                  'bureau_etendu', 70),
  ('respo_com',          'Responsable communication',            'bureau_etendu', 75),
  ('respo_info',         'Responsable informatique',             'bureau_etendu', 80),
  ('chef_de_projet',     'Chef·fe de projet',                    'membre',        90)
on conflict (code) do update
  set label = excluded.label, groupe = excluded.groupe, rank = excluded.rank;

-- respo_com ne figurait pas dans la liste donnée à l'oral, mais la base en
-- contient un : l'inspection de profiles a relevé onze libellés distincts,
-- dont « Respo Com ». Placé au bureau étendu comme les autres responsables ;
-- à déplacer depuis la console si ce n'est pas la bonne lecture.


-- ─────────────────────────────────────────────────────────────────────
-- 2. Catalogue des permissions
--    Un code par action transverse. Ce qui relève de la propriété
--    (éditer SA mission, SA liste) reste géré par appartenance, pas ici.
--    'admin.full' est un joker : il vaut toutes les permissions.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.permissions (
  code     text primary key,
  label    text not null,
  category text not null
);

insert into public.permissions (code, label, category) values
  ('admin.full',              'Tous les droits',                        'Système'),
  ('permissions.manage',      'Modifier la matrice des permissions',    'Système'),
  ('audit.read',              'Consulter le journal d''activité',       'Système'),

  ('members.create',          'Créer un compte membre',                 'Membres'),
  ('members.set_role',        'Changer le rôle d''un membre',           'Membres'),
  ('members.reset_password',  'Réinitialiser un mot de passe',          'Membres'),
  ('members.deactivate',      'Désactiver un membre',                   'Membres'),

  ('contacts.write',          'Créer et modifier un contact',           'Annuaire'),
  ('contacts.delete',         'Supprimer un contact',                   'Annuaire'),
  ('contacts.import',         'Importer un fichier CSV',                'Annuaire'),
  ('contacts.merge',          'Fusionner des doublons',                 'Annuaire'),
  ('contacts.assign_others',  'Réattribuer un contact pris par un autre','Annuaire'),
  ('lists.manage_all',        'Gérer toutes les listes de prospection', 'Annuaire'),

  ('missions.create',         'Créer une mission',                      'Missions'),
  ('missions.edit_all',       'Modifier toutes les missions',           'Missions'),
  ('missions.delete',         'Supprimer une mission',                  'Missions'),
  ('missions.budget_read',    'Voir les budgets',                       'Missions'),
  ('missions.budget_write',   'Modifier les budgets',                   'Missions'),

  ('quality.review',          'Valider la qualité d''une mission',      'Qualité'),
  ('ce.write',                'Rédiger une convention d''étude',        'Qualité'),
  ('ce.finalize',             'Passer une convention en définitif',     'Qualité')
on conflict (code) do update set label = excluded.label, category = excluded.category;


-- ─────────────────────────────────────────────────────────────────────
-- 3. Correspondance rôle → permissions
--    Valeurs de départ, à ajuster depuis la console d'admin. Rien ici
--    n'est gravé : c'est le point de la table.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.role_permissions (
  role_code       text not null references public.roles(code)       on delete cascade,
  permission_code text not null references public.permissions(code) on delete cascade,
  primary key (role_code, permission_code)
);

-- ── Bureau : tous les droits, par le joker ────────────────────────────
insert into public.role_permissions (role_code, permission_code)
select code, 'admin.full' from public.roles where groupe = 'bureau'
on conflict do nothing;

-- ── Bureau étendu : des droits ciblés sur leur domaine ────────────────
insert into public.role_permissions (role_code, permission_code) values
  -- Vice-trésorier : l'argent, et rien que l'argent
  ('vice_tresorier', 'missions.budget_read'),
  ('vice_tresorier', 'missions.budget_write'),
  ('vice_tresorier', 'audit.read'),

  -- Développement commercial : propriétaire de l'annuaire et de la prospection
  ('respo_dev_co', 'contacts.write'),
  ('respo_dev_co', 'contacts.delete'),
  ('respo_dev_co', 'contacts.import'),
  ('respo_dev_co', 'contacts.merge'),
  ('respo_dev_co', 'contacts.assign_others'),
  ('respo_dev_co', 'lists.manage_all'),
  ('respo_dev_co', 'missions.create'),
  ('respo_dev_co', 'missions.budget_read'),
  ('respo_dev_co', 'audit.read'),

  -- Qualité : regard transverse, sans pouvoir d'écriture sur les missions
  ('respo_qualite', 'quality.review'),
  ('respo_qualite', 'ce.write'),
  ('respo_qualite', 'ce.finalize'),
  ('respo_qualite', 'missions.budget_read'),
  ('respo_qualite', 'audit.read'),

  -- Informatique : l'administration courante de l'outil — comptes, mots de
  -- passe, hygiène des données. Volontairement PAS permissions.manage :
  -- pouvoir modifier la matrice revient à pouvoir tout s'accorder, ce qui
  -- annulerait la règle « seul le bureau a tous les droits ».
  ('respo_info', 'members.create'),
  ('respo_info', 'members.reset_password'),
  ('respo_info', 'members.deactivate'),
  ('respo_info', 'contacts.import'),
  ('respo_info', 'contacts.merge'),
  ('respo_info', 'audit.read'),

  -- ── Membres ────────────────────────────────────────────────────────
  -- Chef de projet : ses missions (par appartenance) + la prospection courante
  ('chef_de_projet', 'contacts.write'),
  ('chef_de_projet', 'missions.create'),
  ('chef_de_projet', 'ce.write')
on conflict do nothing;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Bascule de profiles.role : enum → text référencé
--    La colonne garde son nom, seules les valeurs changent : le front
--    continue de lire `role` comme une chaîne, rien ne casse.
-- ─────────────────────────────────────────────────────────────────────

-- Deux fonctions de 007 dépendent du type user_role et empêcheraient de le
-- supprimer plus bas ; on les retire avant. current_user_role() est
-- recréée en text à la section 5, set_member_role() à la section 6.
drop function if exists public.set_member_role(uuid, user_role);
drop function if exists public.current_user_role();

-- Postgres refuse de changer le type d'une colonne dont dépend une policy.
-- « contacts: admin delete » (schema.sql) lit profiles.role ; elle doit
-- sauter d'abord. 009 la remplace par un test sur has_perm('contacts.delete').
-- Entre les deux, contacts n'a plus de policy DELETE, donc plus personne ne
-- supprime de contact — un manque de droits, jamais un excès.
drop policy if exists "contacts: admin delete" on public.contacts;

-- Si une AUTRE policy dépend encore de la colonne, on s'arrête en la
-- nommant plutôt que de laisser Postgres répondre par un 0A000 obscur.
do $$
declare restantes text;
begin
  select string_agg(format('%s.%s', tablename, policyname), ', ')
    into restantes
  from pg_policies
  where schemaname = 'public'
    and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) ~ 'profiles\.role';

  if restantes is not null then
    raise exception E'Ces policies dépendent encore de profiles.role et empêchent le changement de type : %.\nSupprimez-les (elles seront recréées en 009) avant de rejouer.', restantes;
  end if;
end $$;

alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;

-- Report des valeurs réellement présentes en base.
--
-- L'énumération d'origine annonçait admin / project_manager / consultant,
-- mais la base a divergé : quelqu'un a ajouté des valeurs à l'enum, et les
-- vingt-et-un membres portent des libellés français (« Respo SI »,
-- « Trésorière », « Cheffe de Projet »…). Mapper sur les anciennes valeurs
-- n'aurait rien trouvé, et la règle de repli aurait basculé tout le bureau
-- en chef de projet.
--
-- Comparaison sans accents ni casse : « Trésorière » et « Tresoriere »
-- doivent tomber au même endroit, et le féminin comme le masculin aussi.
create extension if not exists unaccent;

update public.profiles p set role = m.code
from (values
  ('president',          array['president', 'presidente']),
  ('vice_president',     array['vice-president', 'vice-presidente', 'vice president']),
  ('secretaire_general', array['secretaire general', 'secretaire generale', 'secretaire']),
  ('tresorier',          array['tresorier', 'tresoriere']),
  ('vice_tresorier',     array['vice-tresorier', 'vice-tresoriere', 'vice tresorier', 'vice tresoriere']),
  ('respo_dev_co',       array['respo devco', 'respo dev co', 'responsable developpement commercial']),
  ('respo_qualite',      array['respo qualite', 'responsable qualite']),
  ('respo_com',          array['respo com', 'responsable communication']),
  ('respo_info',         array['respo si', 'respo info', 'responsable informatique', 'admin']),
  ('chef_de_projet',     array['chef de projet', 'cheffe de projet', 'project_manager', 'consultant'])
) as m(code, libelles)
where lower(unaccent(btrim(p.role))) = any(m.libelles)
  and p.role is distinct from m.code;

-- Tout ce qui n'a pas été reconnu arrête la migration, au lieu d'être
-- écrasé silencieusement : un rôle inconnu est une information, pas un
-- déchet. Ajoutez-le à la table roles puis à la table de correspondance.
do $$
declare restants text;
begin
  select string_agg(distinct coalesce(role::text, '(nul)'), ', ')
    into restants
  from public.profiles
  where role is null or role::text not in (select code from public.roles);

  if restants is not null then
    raise exception E'Rôles non reconnus en base : %.\nAjoutez-les à public.roles et à la correspondance ci-dessus avant de rejouer.', restants;
  end if;
end $$;

alter table public.profiles alter column role set not null;
alter table public.profiles alter column role set default 'chef_de_projet';

alter table public.profiles drop constraint if exists profiles_role_fkey;
alter table public.profiles
  add constraint profiles_role_fkey foreign key (role) references public.roles(code);

drop type if exists user_role;


-- ─────────────────────────────────────────────────────────────────────
-- 5. Le test de permission
--    Une seule fonction, appelée par toutes les policies et par le front.
--    security definer : lit profiles et la matrice en contournant la RLS,
--    ce qui évite la récursion quand une policy de profiles l'appelle.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.has_perm(perm text, uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_code = p.role
    where p.id = uid
      and rp.permission_code in (perm, 'admin.full')
  );
$$;

revoke all     on function public.has_perm(text, uuid) from public, anon;
grant  execute on function public.has_perm(text, uuid) to authenticated;

-- is_admin() de 007 change de définition, pas de signature : les policies
-- écrites en 007 continuent de fonctionner sans être retouchées.
create or replace function public.is_admin(uid uuid default auth.uid())
returns boolean
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select public.has_perm('admin.full', uid);
$$;

-- Recréée en text : 007 la renvoyait en user_role, type qui n'existe plus.
create or replace function public.current_user_role()
returns text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

revoke all     on function public.current_user_role() from public, anon;
grant  execute on function public.current_user_role() to authenticated;

-- Toutes les permissions du membre courant, en un appel — alimente le
-- hook usePermissions() côté React.
create or replace function public.my_permissions()
returns setof text
language sql
security definer
stable
set search_path = public, pg_temp
as $$
  select distinct rp.permission_code
  from public.profiles p
  join public.role_permissions rp on rp.role_code = p.role
  where p.id = auth.uid();
$$;

revoke all     on function public.my_permissions() from public, anon;
grant  execute on function public.my_permissions() to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 6. Changement de rôle, version neuf rôles
--    Le garde-fou ne porte plus sur « soi-même » mais sur le vrai risque :
--    ne plus laisser personne détenir admin.full.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.set_member_role(target_id uuid, new_role text)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not public.has_perm('members.set_role') then
    raise exception 'Vous n''avez pas le droit de changer un rôle'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.roles where code = new_role) then
    raise exception 'Rôle inconnu : %', new_role using errcode = '22023';
  end if;

  update public.profiles set role = new_role where id = target_id;

  if not found then
    raise exception 'Membre introuvable' using errcode = 'P0002';
  end if;

  -- Vérifié après coup, donc annulé par le rollback si la condition tombe.
  if not exists (
    select 1
    from public.profiles p
    join public.role_permissions rp on rp.role_code = p.role
    where rp.permission_code = 'admin.full'
  ) then
    raise exception 'Opération refusée : plus aucun membre n''aurait tous les droits'
      using errcode = '42501';
  end if;
end;
$$;

revoke all     on function public.set_member_role(uuid, text) from public, anon;
grant  execute on function public.set_member_role(uuid, text) to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 7. RLS sur les trois nouvelles tables
--    Lecture ouverte à tous les membres : le front a besoin de la matrice
--    pour afficher ou masquer les commandes. Écriture réservée à
--    permissions.manage.
-- ─────────────────────────────────────────────────────────────────────

alter table public.roles            enable row level security;
alter table public.permissions      enable row level security;
alter table public.role_permissions enable row level security;

drop policy if exists "roles: read"   on public.roles;
drop policy if exists "roles: manage" on public.roles;
create policy "roles: read"   on public.roles for select to authenticated using (true);
create policy "roles: manage" on public.roles for all    to authenticated
  using (public.has_perm('permissions.manage')) with check (public.has_perm('permissions.manage'));

drop policy if exists "permissions: read"   on public.permissions;
drop policy if exists "permissions: manage" on public.permissions;
create policy "permissions: read"   on public.permissions for select to authenticated using (true);
create policy "permissions: manage" on public.permissions for all    to authenticated
  using (public.has_perm('permissions.manage')) with check (public.has_perm('permissions.manage'));

drop policy if exists "role_permissions: read"   on public.role_permissions;
drop policy if exists "role_permissions: manage" on public.role_permissions;
create policy "role_permissions: read"   on public.role_permissions for select to authenticated using (true);
create policy "role_permissions: manage" on public.role_permissions for all    to authenticated
  using (public.has_perm('permissions.manage')) with check (public.has_perm('permissions.manage'));

-- La matrice ne se modifie que par ces policies, jamais par écriture directe
-- d'un membre sur son propre rôle : profiles.role reste verrouillé par 007.


-- ─────────────────────────────────────────────────────────────────────
-- 8. Filet de sécurité
--    Si le report de la section 4 n'a laissé personne avec admin.full,
--    plus personne ne peut administrer l'outil et la console d'admin
--    serait inaccessible à tous. On préfère annuler la migration.
-- ─────────────────────────────────────────────────────────────────────

do $$
declare n int;
begin
  select count(*) into n
  from public.profiles p
  join public.role_permissions rp on rp.role_code = p.role
  where rp.permission_code = 'admin.full';

  if n = 0 then
    raise exception
      'Migration annulée : aucun membre ne détiendrait tous les droits. '
      'Vérifiez que profiles contient bien au moins un ancien admin.';
  end if;

  raise notice 'OK — % membre(s) détiennent tous les droits.', n;
end $$;

commit;


-- ─────────────────────────────────────────────────────────────────────
-- Après application — à faire dans l'ordre
-- ─────────────────────────────────────────────────────────────────────
--
--   1. Attribuer son vrai rôle à chaque membre. À ce stade tout le monde est
--      soit president (les anciens admin), soit chef_de_projet :
--
--        select id, prenom, nom, email, role from profiles order by nom;
--        select set_member_role('<uuid>', 'tresorier');
--
--      Composer le bureau d'abord (président, vice-président, secrétaire,
--      trésorier), sinon la contrainte du filet ci-dessus se rappellera à vous
--      au premier retrait de rôle.
--
--   2. Vérifier qui détient tous les droits :
--
--        select p.prenom, p.nom, r.label
--        from profiles p
--        join roles r            on r.code = p.role
--        join role_permissions rp on rp.role_code = p.role
--        where rp.permission_code = 'admin.full';
--
--   3. Contrôler ses propres permissions :
--
--        select * from my_permissions();
--
--   4. Relire la matrice de départ et l'ajuster :
--
--        select r.groupe, r.label, p.category, p.label
--        from role_permissions rp
--        join roles r       on r.code = rp.role_code
--        join permissions p on p.code = rp.permission_code
--        order by r.rank, p.category, p.label;

do $$ begin raise notice '  ✓ 008_rbac_roles.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  009_permission_policies.sql
-- ───────────────────────────────────────────────────────────────

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
     -- Même exception qu'au trigger de 007 : pas de JWT = accès SQL direct.
     and auth.uid() is not null
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

do $$ begin raise notice '  ✓ 009_permission_policies.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  010_audit_log.sql
-- ───────────────────────────────────────────────────────────────

-- supabase/migrations/010_audit_log.sql
-- Phase 2 — traçabilité (F-08, F-13).
--
-- Rien n'enregistrait qui modifiait quoi. Sur un outil partagé par vingt
-- personnes renouvelées chaque année, c'est le premier réflexe en cas
-- d'erreur ou de litige.
--
-- Deux mécanismes, volontairement séparés :
--   updated_at / updated_by  l'état courant d'une ligne — « à jour ? par qui ? »
--   audit_log                l'historique — « qu'est-ce qui a changé, quand ? »

begin;

-- ─────────────────────────────────────────────────────────────────────
-- 1. updated_at / updated_by sur les tables métier
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.touch_updated()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  -- auth.uid() est nul en accès SQL direct : on garde alors l'ancienne valeur
  -- plutôt que d'effacer l'auteur réel du dernier changement applicatif.
  new.updated_by := coalesce(auth.uid(), old.updated_by);
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'contacts', 'prospecting_lists', 'missions', 'milestones', 'meetings',
    'mission_team', 'contact_notes', 'profiles'
  ] loop
    execute format('alter table public.%I add column if not exists updated_at timestamptz', t);
    execute format('alter table public.%I add column if not exists updated_by uuid references public.profiles(id) on delete set null', t);
    execute format('drop trigger if exists touch_updated on public.%I', t);
    execute format(
      'create trigger touch_updated before update on public.%I for each row execute function public.touch_updated()', t);
  end loop;
end $$;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Journal d'activité
--    Alimenté par trigger, donc impossible à contourner depuis le client.
-- ─────────────────────────────────────────────────────────────────────

create table if not exists public.audit_log (
  id          bigserial   primary key,
  table_name  text        not null,
  row_id      uuid,
  action      text        not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  actor       uuid        references public.profiles(id) on delete set null,
  changed     jsonb       not null default '{}',   -- seulement les colonnes modifiées
  occurred_at timestamptz not null default now()
);

create index if not exists audit_log_occurred_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_actor_idx    on public.audit_log (actor, occurred_at desc);
create index if not exists audit_log_row_idx      on public.audit_log (table_name, row_id, occurred_at desc);

alter table public.audit_log enable row level security;

drop policy if exists "audit_log: read" on public.audit_log;
create policy "audit_log: read" on public.audit_log
  for select to authenticated using (public.has_perm('audit.read'));

-- Aucune policy d'écriture : seuls les triggers (security definer) écrivent.

create or replace function public.write_audit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  diff    jsonb := '{}';
  new_j   jsonb;
  old_j   jsonb;
  k       text;
begin
  if tg_op = 'INSERT' then
    new_j := to_jsonb(new);
    -- À la création, tout est nouveau : on ne garde qu'un repère lisible.
    diff := jsonb_strip_nulls(jsonb_build_object(
      'titre', coalesce(new_j->>'title', new_j->>'name',
                        trim(coalesce(new_j->>'prenom', '') || ' ' || coalesce(new_j->>'nom', '')))
    ));
  elsif tg_op = 'DELETE' then
    old_j := to_jsonb(old);
    diff := jsonb_strip_nulls(jsonb_build_object(
      'titre', coalesce(old_j->>'title', old_j->>'name',
                        trim(coalesce(old_j->>'prenom', '') || ' ' || coalesce(old_j->>'nom', '')))
    ));
  else
    new_j := to_jsonb(new);
    old_j := to_jsonb(old);
    -- Ne consigner que ce qui bouge réellement, et ignorer le bruit des
    -- colonnes d'horodatage qui changent à chaque écriture.
    for k in select jsonb_object_keys(new_j) loop
      if k not in ('updated_at', 'updated_by')
         and (new_j -> k) is distinct from (old_j -> k) then
        diff := diff || jsonb_build_object(k, jsonb_build_object('de', old_j -> k, 'vers', new_j -> k));
      end if;
    end loop;

    if diff = '{}'::jsonb then
      return new;   -- rien de significatif : pas de ligne de journal
    end if;
  end if;

  insert into public.audit_log (table_name, row_id, action, actor, changed)
  values (
    tg_table_name,
    coalesce((to_jsonb(case when tg_op = 'DELETE' then old else new end) ->> 'id')::uuid, null),
    tg_op,
    auth.uid(),
    diff
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array[
    'contacts', 'prospecting_lists', 'missions', 'profiles', 'role_permissions'
  ] loop
    execute format('drop trigger if exists write_audit on public.%I', t);
    execute format(
      'create trigger write_audit after insert or update or delete on public.%I
       for each row execute function public.write_audit()', t);
  end loop;
end $$;

-- role_permissions n'a pas de colonne id : le trigger insérera row_id = null,
-- ce qui est correct — c'est la matrice entière qui fait foi, pas une ligne.

commit;

do $$ begin raise notice '  ✓ 010_audit_log.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  011_contacts_dedup.sql
-- ───────────────────────────────────────────────────────────────

-- supabase/migrations/011_contacts_dedup.sql
-- Phase 3, lot A — dédoublonnage de l'annuaire (F-24, F-07, F-14, F-21).
--
-- La table contacts ne portait AUCUNE contrainte d'unicité : ni id_profil,
-- ni email, ni linkedin. Réimporter le même export Mines recréait la base
-- en double.
--
-- Cette migration est NON DESTRUCTIVE : elle ajoute les clés de comparaison,
-- les index, la détection et la fusion — mais ne pose PAS les contraintes
-- d'unicité et ne fusionne rien d'elle-même. Les doublons existants se
-- traitent depuis /annuaire/doublons, puis 012 verrouille.

begin;

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- unaccent() n'est pas marquée immutable (elle dépend d'un dictionnaire),
-- or une colonne générée l'exige. Wrapper immutable, en figeant le
-- dictionnaire : c'est le contournement standard.
create or replace function public.immutable_unaccent(txt text)
returns text
language sql
immutable
strict
parallel safe
set search_path = public, pg_temp
as $$ select public.unaccent('public.unaccent'::regdictionary, txt) $$;


-- ─────────────────────────────────────────────────────────────────────
-- 1. Clés de comparaison
--    Trois clés, chacune appliquée seulement quand elle est renseignée :
--    l'export Mines donne id_profil de façon fiable mais un contact saisi
--    à la main n'en a pas ; l'e-mail manque très souvent ; le LinkedIn est
--    parfois le seul identifiant stable.
-- ─────────────────────────────────────────────────────────────────────

-- Le segment /in/<slug> d'une URL LinkedIn, sans casse ni paramètres.
alter table public.contacts
  add column if not exists linkedin_slug text
  generated always as (
    nullif(lower(substring(linkedin from '/in/([^/?#]+)')), '')
  ) stored;

-- Nom complet normalisé : sans accents, sans casse, espaces resserrés.
alter table public.contacts
  add column if not exists fullname_norm text
  generated always as (
    nullif(
      regexp_replace(
        public.immutable_unaccent(lower(coalesce(prenom, '') || ' ' || coalesce(nom, ''))),
        '\s+', ' ', 'g'
      ),
      ' '
    )
  ) stored;

-- Email normalisé, pour comparer sans se soucier de la casse.
alter table public.contacts
  add column if not exists email_norm text
  generated always as (nullif(lower(trim(email)), '')) stored;

-- Drapeau « ne plus jamais contacter », prioritaire sur toutes les campagnes.
alter table public.contacts add column if not exists do_not_contact boolean not null default false;

-- schema.sql déclare created_by sur contacts, mais la table déployée ne l'a
-- pas : le dépôt et la base ont divergé. upsert_contact() écrit cette
-- colonne, on la crée donc ici plutôt que de renoncer à savoir qui a saisi
-- une fiche. Les 15 737 fiches existantes restent à null, ce qui est exact —
-- elles ont été chargées hors application.
alter table public.contacts add column if not exists created_by uuid references public.profiles(id) on delete set null;


-- ─────────────────────────────────────────────────────────────────────
-- 2. Index (F-14, F-21)
--    La recherche faisait quatre ilike '%…%' en OR sur une table sans le
--    moindre index, doublés d'un count exact qui la reparcourait.
-- ─────────────────────────────────────────────────────────────────────

create index if not exists contacts_fullname_trgm_idx   on public.contacts using gin (fullname_norm gin_trgm_ops);
create index if not exists contacts_entreprise_trgm_idx on public.contacts using gin (entreprise_actuelle gin_trgm_ops);
create index if not exists contacts_ville_trgm_idx      on public.contacts using gin (ville gin_trgm_ops);
create index if not exists contacts_titre_trgm_idx      on public.contacts using gin (titre_poste gin_trgm_ops);
create index if not exists contacts_status_idx          on public.contacts (status);
create index if not exists contacts_tags_idx            on public.contacts using gin (tags);
create index if not exists contacts_email_norm_idx      on public.contacts (email_norm);
create index if not exists contacts_linkedin_slug_idx   on public.contacts (linkedin_slug);
create index if not exists contacts_id_profil_idx       on public.contacts (id_profil);


-- ─────────────────────────────────────────────────────────────────────
-- 3. Recherche paramétrée (F-07)
--    Le terme était interpolé brut dans une chaîne de filtre PostgREST :
--    chercher « Dupont, Jean » cassait le filtre. Ici il est un paramètre,
--    jamais concaténé.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.search_contacts(
  q            text default null,
  status_filter text default null,
  only_null_status boolean default false,
  lim          int default 50,
  off          int default 0
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
        or c.fullname_norm      ilike '%' || public.immutable_unaccent(lower(btrim(q))) || '%'
        or c.entreprise_actuelle ilike '%' || btrim(q) || '%'
        or c.titre_poste         ilike '%' || btrim(q) || '%'
        or c.ville               ilike '%' || btrim(q) || '%'
        or c.email_norm          ilike '%' || lower(btrim(q)) || '%'
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

-- Les cinq compteurs de l'annuaire en une requête au lieu de cinq (F-21).
create or replace function public.contact_status_counts()
returns jsonb
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select coalesce(jsonb_object_agg(coalesce(status, '__null__'), n), '{}'::jsonb) || jsonb_build_object('__total__', (select count(*) from public.contacts))
  from (select status, count(*) as n from public.contacts group by status) s;
$$;

grant execute on function public.contact_status_counts() to authenticated;


-- ─────────────────────────────────────────────────────────────────────
-- 4. Détection des doublons
--    Deux niveaux : l'égalité sur une clé forte (certain), et la
--    similarité de nom à entreprise égale (probable).
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.find_duplicate_candidates(
  p_contact_id uuid    default null,
  p_prenom     text    default null,
  p_nom        text    default null,
  p_email      text    default null,
  p_linkedin   text    default null,
  p_entreprise text    default null,
  p_telephone  text    default null
)
returns table (
  id         uuid,
  prenom     text,
  nom        text,
  email      text,
  entreprise_actuelle text,
  linkedin   text,
  motif      text,
  score      real
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with cible as (
    select
      nullif(lower(trim(p_email)), '')                              as email_n,
      nullif(lower(substring(p_linkedin from '/in/([^/?#]+)')), '') as slug,
      nullif(regexp_replace(public.immutable_unaccent(lower(coalesce(p_prenom,'') || ' ' || coalesce(p_nom,''))), '\s+', ' ', 'g'), ' ') as name_n,
      nullif(regexp_replace(coalesce(p_telephone, ''), '[^0-9]', '', 'g'), '')  as tel_n,
      nullif(trim(p_entreprise), '')                                as entreprise
  )
  select c.id, c.prenom, c.nom, c.email, c.entreprise_actuelle, c.linkedin,
         case
           when c.email_norm    is not null and c.email_norm    = t.email_n then 'même e-mail'
           when c.linkedin_slug is not null and c.linkedin_slug = t.slug    then 'même profil LinkedIn'
           when t.tel_n is not null
                and nullif(regexp_replace(coalesce(c.telephone,''), '[^0-9]', '', 'g'), '') = t.tel_n
                then 'même téléphone'
           else 'nom proche, même entreprise'
         end as motif,
         case
           when c.email_norm = t.email_n or c.linkedin_slug = t.slug then 1.0::real
           else similarity(c.fullname_norm, t.name_n)
         end as score
  from public.contacts c, cible t
  where (p_contact_id is null or c.id <> p_contact_id)
    and (
      (t.email_n is not null and c.email_norm = t.email_n)
      or (t.slug is not null and c.linkedin_slug = t.slug)
      or (t.tel_n is not null
          and nullif(regexp_replace(coalesce(c.telephone,''), '[^0-9]', '', 'g'), '') = t.tel_n)
      or (
        t.name_n is not null
        and c.fullname_norm % t.name_n
        and similarity(c.fullname_norm, t.name_n) > 0.55
        -- La similarité de nom seule produit trop de faux positifs sur une
        -- promo entière : on exige la même entreprise pour la retenir.
        and t.entreprise is not null
        and c.entreprise_actuelle is not null
        and public.immutable_unaccent(lower(c.entreprise_actuelle))
            = public.immutable_unaccent(lower(t.entreprise))
      )
    )
  order by score desc, c.nom
  limit 25;
$$;

grant execute on function public.find_duplicate_candidates(uuid, text, text, text, text, text, text) to authenticated;

-- Grappes déjà présentes en base, pour la page de nettoyage.
create or replace view public.duplicate_clusters as
  select 'email'::text as cle, email_norm as valeur,
         count(*) as n, array_agg(id order by created_at) as contact_ids
  from public.contacts where email_norm is not null
  group by email_norm having count(*) > 1
union all
  select 'linkedin', linkedin_slug, count(*), array_agg(id order by created_at)
  from public.contacts where linkedin_slug is not null
  group by linkedin_slug having count(*) > 1
union all
  select 'id_profil', id_profil, count(*), array_agg(id order by created_at)
  from public.contacts where id_profil is not null and btrim(id_profil) <> ''
  group by id_profil having count(*) > 1;


-- ─────────────────────────────────────────────────────────────────────
-- 5. Fusion
--    La fiche maître absorbe les champs vides des autres, récupère notes,
--    tags et appartenances aux listes, puis les doublons sont supprimés.
-- ─────────────────────────────────────────────────────────────────────

create or replace function public.merge_contacts(master_id uuid, duplicate_ids uuid[])
returns void
language plpgsql
-- security definer : la fonction EST le contrôle d'accès (elle exige
-- contacts.merge ci-dessous). En invoker, son DELETE final retomberait sur
-- la RLS de contacts, qui demande contacts.delete — une permission
-- différente : la fusion s'exécuterait sans supprimer les doublons.
security definer
set search_path = public, pg_temp
as $$
declare d uuid;
begin
  if not public.has_perm('contacts.merge') then
    raise exception 'Vous n''avez pas le droit de fusionner des contacts'
      using errcode = '42501';
  end if;

  if master_id = any(duplicate_ids) then
    raise exception 'La fiche maître ne peut pas figurer parmi les doublons'
      using errcode = '22023';
  end if;

  -- Compléter les trous de la fiche maître avec ce que les doublons savent.
  update public.contacts m set
    id_profil               = coalesce(m.id_profil, s.id_profil),
    pays                    = coalesce(m.pays, s.pays),
    ville                   = coalesce(m.ville, s.ville),
    annee_obtention_diplome = coalesce(m.annee_obtention_diplome, s.annee_obtention_diplome),
    diplomes                = coalesce(m.diplomes, s.diplomes),
    entreprise_actuelle     = coalesce(m.entreprise_actuelle, s.entreprise_actuelle),
    titre_poste             = coalesce(m.titre_poste, s.titre_poste),
    email                   = coalesce(m.email, s.email),
    telephone               = coalesce(m.telephone, s.telephone),
    linkedin                = coalesce(m.linkedin, s.linkedin),
    mpa_profile             = coalesce(m.mpa_profile, s.mpa_profile),
    status                  = coalesce(m.status, s.status),
    do_not_contact          = m.do_not_contact or s.dnc,
    tags                    = (
      select coalesce(array_agg(distinct x), '{}')
      from unnest(coalesce(m.tags, '{}') || coalesce(s.tags, '{}')) x
    )
  from (
    select
      min(id_profil)               as id_profil,
      min(pays)                    as pays,
      min(ville)                   as ville,
      min(annee_obtention_diplome) as annee_obtention_diplome,
      min(diplomes)                as diplomes,
      min(entreprise_actuelle)     as entreprise_actuelle,
      min(titre_poste)             as titre_poste,
      min(email)                   as email,
      min(telephone)               as telephone,
      min(linkedin)                as linkedin,
      min(mpa_profile)             as mpa_profile,
      min(status)                  as status,
      bool_or(do_not_contact)      as dnc,
      coalesce((select array_agg(distinct t) from public.contacts c2, unnest(coalesce(c2.tags,'{}')) t
                where c2.id = any(duplicate_ids)), '{}') as tags
    from public.contacts
    where id = any(duplicate_ids)
  ) s
  where m.id = master_id;

  -- Rapatrier ce qui pend aux doublons.
  update public.contact_notes set contact_id = master_id where contact_id = any(duplicate_ids);

  foreach d in array duplicate_ids loop
    -- La jonction a une clé primaire (list_id, contact_id) : réaffecter en
    -- masse violerait l'unicité quand les deux fiches sont dans la même
    -- liste. On insère en ignorant les conflits, puis on supprime.
    insert into public.prospecting_list_contacts (list_id, contact_id)
      select list_id, master_id from public.prospecting_list_contacts where contact_id = d
      on conflict do nothing;
    delete from public.prospecting_list_contacts where contact_id = d;
  end loop;

  delete from public.contacts where id = any(duplicate_ids);
end;
$$;

grant execute on function public.merge_contacts(uuid, uuid[]) to authenticated;

commit;


-- ─────────────────────────────────────────────────────────────────────
-- Après application
-- ─────────────────────────────────────────────────────────────────────
--   select * from duplicate_clusters order by n desc;   -- l'ampleur du travail
--   -- puis nettoyer depuis /annuaire/doublons, et enfin appliquer 012.

do $$ begin raise notice '  ✓ 011_contacts_dedup.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  013_prospection.sql
-- ───────────────────────────────────────────────────────────────

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

do $$ begin raise notice '  ✓ 013_prospection.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  014_tasks.sql
-- ───────────────────────────────────────────────────────────────

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

do $$ begin raise notice '  ✓ 014_tasks.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  015_notes.sql
-- ───────────────────────────────────────────────────────────────

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

do $$ begin raise notice '  ✓ 015_notes.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  016_search_index.sql
-- ───────────────────────────────────────────────────────────────

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

do $$ begin raise notice '  ✓ 016_search_index.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  017_signup_trigger.sql
-- ───────────────────────────────────────────────────────────────

-- supabase/migrations/017_signup_trigger.sql
-- Restaure la création automatique du profil à l'inscription.
--
-- Découvert en testant sur la vraie base : la fonction handle_new_user()
-- existe bien, mais le trigger qui l'appelle N'EXISTE PAS. schema.sql le
-- déclare, il n'a jamais été déployé — ou il a sauté depuis.
--
-- Conséquence mesurée : un compte créé n'obtient aucune ligne dans
-- profiles. Sans profil, has_perm() ne joint rien, my_permissions() renvoie
-- une liste vide, et le membre se retrouve sans le moindre droit — y
-- compris celui de créer une mission. Le symptôme est muet : l'application
-- s'ouvre, et tout est simplement refusé.

begin;

-- La version d'origine n'insérait que l'id ; on reprend aussi l'e-mail, et
-- on se garde d'un conflit si la ligne existe déjà (compte recréé).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email)
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Rattrapage des comptes déjà créés sans profil. Le rôle par défaut
-- (chef_de_projet) est le moins-disant : mieux vaut un membre qui réclame
-- des droits qu'un membre qui en a trop.
insert into public.profiles (id, email)
select u.id, u.email
from auth.users u
where not exists (select 1 from public.profiles p where p.id = u.id)
on conflict (id) do nothing;

do $$
declare orphelins int;
begin
  select count(*) into orphelins
  from auth.users u
  where not exists (select 1 from public.profiles p where p.id = u.id);

  if orphelins > 0 then
    raise exception 'Il reste % compte(s) sans profil après rattrapage', orphelins;
  end if;
  raise notice 'Tous les comptes ont un profil.';
end $$;

commit;

do $$ begin raise notice '  ✓ 017_signup_trigger.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  018_notebooks.sql
-- ───────────────────────────────────────────────────────────────

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

do $$ begin raise notice '  ✓ 018_notebooks.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  019_directory_outreach.sql
-- ───────────────────────────────────────────────────────────────

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

do $$ begin raise notice '  ✓ 019_directory_outreach.sql appliquée'; end $$;


-- ───────────────────────────────────────────────────────────────
--  020_prospection_stats.sql
-- ───────────────────────────────────────────────────────────────

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

do $$ begin raise notice '  ✓ 020_prospection_stats.sql appliquée'; end $$;
