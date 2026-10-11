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
