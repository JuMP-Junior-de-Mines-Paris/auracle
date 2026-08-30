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
