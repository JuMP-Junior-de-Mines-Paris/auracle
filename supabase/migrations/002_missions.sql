-- supabase/migrations/002_missions.sql
-- Tables are created first, then cross-referencing policies are added after
-- all tables exist (missions_update references mission_team).

-- ─────────────────────────────────────────────
-- 1. Tables
-- ─────────────────────────────────────────────

CREATE TABLE missions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  client_name text,
  client_contact_name text,
  client_contact_email text,
  chef_de_projet uuid REFERENCES profiles(id),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'completed', 'archived')),
  start_date date,
  end_date date,
  budget numeric,
  created_by uuid NOT NULL REFERENCES profiles(id) DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mission_team (
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  PRIMARY KEY (mission_id, profile_id)
);

CREATE TABLE milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  title text NOT NULL,
  due_date date,
  done boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE meetings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
  title text NOT NULL,
  date date NOT NULL,
  notes text,
  attendees text[],
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ─────────────────────────────────────────────
-- 2. RLS
-- ─────────────────────────────────────────────

ALTER TABLE missions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mission_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE milestones ENABLE ROW LEVEL SECURITY;
ALTER TABLE meetings ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────
-- 3. Policies (all tables exist by now)
-- ─────────────────────────────────────────────

CREATE POLICY "missions_select" ON missions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "missions_insert" ON missions
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);

CREATE POLICY "missions_update" ON missions
  FOR UPDATE TO authenticated USING (
    auth.uid() = created_by
    OR auth.uid() = chef_de_projet
    OR EXISTS (SELECT 1 FROM mission_team WHERE mission_id = id AND profile_id = auth.uid())
  );

CREATE POLICY "missions_delete" ON missions
  FOR DELETE TO authenticated USING (
    auth.uid() = created_by OR auth.uid() = chef_de_projet
  );

CREATE POLICY "mission_team_select" ON mission_team
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "mission_team_modify" ON mission_team
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM missions m WHERE m.id = mission_id
      AND (m.created_by = auth.uid() OR m.chef_de_projet = auth.uid())
    )
  );

CREATE POLICY "milestones_select" ON milestones
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "milestones_modify" ON milestones
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM missions m WHERE m.id = mission_id AND (
        m.created_by = auth.uid()
        OR m.chef_de_projet = auth.uid()
        OR EXISTS (SELECT 1 FROM mission_team mt WHERE mt.mission_id = m.id AND mt.profile_id = auth.uid())
      )
    )
  );

CREATE POLICY "meetings_select" ON meetings
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "meetings_modify" ON meetings
  FOR ALL TO authenticated USING (
    EXISTS (
      SELECT 1 FROM missions m WHERE m.id = mission_id AND (
        m.created_by = auth.uid()
        OR m.chef_de_projet = auth.uid()
        OR EXISTS (SELECT 1 FROM mission_team mt WHERE mt.mission_id = m.id AND mt.profile_id = auth.uid())
      )
    )
  );
