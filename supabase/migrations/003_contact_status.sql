-- supabase/migrations/003_contact_status.sql
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS status text
  CHECK (status IN ('à contacter', 'contacté', 'répondu', 'travaillé'));
