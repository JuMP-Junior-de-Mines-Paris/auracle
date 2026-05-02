-- supabase/migrations/005_contact_notes.sql
CREATE TABLE contact_notes (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid        NOT NULL REFERENCES contacts(id)  ON DELETE CASCADE,
  content    text        NOT NULL,
  created_by uuid        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "contact_notes_select" ON contact_notes
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "contact_notes_insert" ON contact_notes
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "contact_notes_delete" ON contact_notes
  FOR DELETE TO authenticated USING (auth.uid() = created_by);
