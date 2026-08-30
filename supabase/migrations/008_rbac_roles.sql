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
  ('respo_info',         'Responsable informatique',             'bureau_etendu', 80),
  ('chef_de_projet',     'Chef·fe de projet',                    'membre',        90)
on conflict (code) do update
  set label = excluded.label, groupe = excluded.groupe, rank = excluded.rank;


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

alter table public.profiles alter column role drop default;
alter table public.profiles alter column role type text using role::text;

-- Report des anciennes valeurs.
--   admin → president : seul le bureau détient admin.full, donc c'est le seul
--   report qui laisse quelqu'un capable d'administrer l'outil. Les autres
--   rôles du bureau s'attribuent ensuite depuis la console.
update public.profiles set role = 'president'      where role = 'admin';
update public.profiles set role = 'chef_de_projet' where role in ('project_manager', 'consultant');
update public.profiles set role = 'chef_de_projet' where role is null or role not in (select code from public.roles);

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
