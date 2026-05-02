-- 1. Tags column on contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[] DEFAULT '{}';

-- 2. Email column on profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS email text;

-- Backfill email for existing members
UPDATE profiles p
SET email = u.email
FROM auth.users u
WHERE p.id = u.id AND p.email IS NULL;

-- Update sign-up trigger to capture email
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles (id, email) VALUES (new.id, new.email);
  RETURN new;
END;
$$;

-- 3. list_shares table
CREATE TABLE IF NOT EXISTS list_shares (
  list_id     UUID REFERENCES prospecting_lists(id) ON DELETE CASCADE,
  shared_with UUID REFERENCES profiles(id) ON DELETE CASCADE,
  shared_by   UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (list_id, shared_with)
);

ALTER TABLE list_shares ENABLE ROW LEVEL SECURITY;

CREATE POLICY "list_shares: owner manage"
  ON list_shares FOR ALL
  USING (shared_by = auth.uid())
  WITH CHECK (
    shared_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM prospecting_lists
      WHERE id = list_id AND created_by = auth.uid()
    )
  );

CREATE POLICY "list_shares: recipient read"
  ON list_shares FOR SELECT
  USING (shared_with = auth.uid());

-- 4. Allow all authenticated users to read all profiles
CREATE POLICY "profiles: authenticated read all"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

-- 5. RPC: bulk-add a tag to multiple contacts (idempotent)
CREATE OR REPLACE FUNCTION add_tag_to_contacts(contact_ids UUID[], tag_name TEXT)
RETURNS void LANGUAGE sql SECURITY INVOKER AS $$
  UPDATE contacts
  SET tags = array_append(tags, TRIM(tag_name))
  WHERE id = ANY(contact_ids)
    AND NOT (TRIM(tag_name) = ANY(COALESCE(tags, '{}')));
$$;

-- 6. RPC: remove a tag from a single contact
CREATE OR REPLACE FUNCTION remove_tag_from_contact(contact_id UUID, tag_name TEXT)
RETURNS void LANGUAGE sql SECURITY INVOKER AS $$
  UPDATE contacts
  SET tags = array_remove(tags, TRIM(tag_name))
  WHERE id = contact_id;
$$;
