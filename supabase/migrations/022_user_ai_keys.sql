-- supabase/migrations/022_user_ai_keys.sql
-- Clé d'API Gemini de chaque membre, pour rédiger les textes du CE.
--
-- Chaque membre utilise SA clé (Réglages > Intelligence artificielle) : les
-- quotas et la facturation sont les siens, le bureau ne paie rien.
--
-- La clé est chiffrée par le backend (Fernet, secret AI_KEYS_SECRET) AVANT
-- d'arriver ici : un export de la base ou un accès à l'éditeur SQL ne donne
-- que du texte illisible. Aucune policy n'est créée volontairement : ni le
-- navigateur ni un autre membre ne peuvent lire cette table, même la sienne.
-- Seul le backend (clé service-role) y accède, et ne renvoie jamais la clé.

begin;

create table if not exists public.user_ai_keys (
  user_id       uuid        primary key references public.profiles(id) on delete cascade,
  provider      text        not null default 'gemini' check (provider in ('gemini')),
  key_encrypted text        not null,
  -- Quatre derniers caractères, pour que le membre reconnaisse sa clé.
  key_hint      text        not null,
  updated_at    timestamptz not null default now()
);

alter table public.user_ai_keys enable row level security;

revoke all on public.user_ai_keys from anon, authenticated;

commit;
