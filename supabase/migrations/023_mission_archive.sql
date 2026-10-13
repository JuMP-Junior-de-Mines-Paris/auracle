-- supabase/migrations/023_mission_archive.sql
-- Archives : chaque convention d'étude enregistrée devient une mission
-- archivée, rangée dans la catégorie « convention_etude ».
--
-- La catégorie dit d'où vient la mission ; le statut 'archived' (déjà
-- prévu en 002) dit qu'elle est rangée. Une mission créée à la main reste
-- 'mission'.

alter table public.missions
  add column if not exists category text not null default 'mission'
  check (category in ('mission', 'convention_etude'));

create index if not exists missions_archive_idx
  on public.missions (category, created_at desc)
  where status = 'archived';

-- Une convention = une mission. Enregistrer deux fois la même convention
-- met à jour la même mission : le backend s'appuie sur cette unicité.
create unique index if not exists ce_documents_mission_uidx
  on public.ce_documents (mission_id)
  where mission_id is not null;

notify pgrst, 'reload schema';
