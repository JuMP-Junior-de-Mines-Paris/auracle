-- supabase/migrations/004_contact_mpa_profile.sql
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mpa_profile text;
