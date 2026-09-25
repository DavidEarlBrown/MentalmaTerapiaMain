-- EventsMaster: stores sports/tournament match events with results
CREATE TABLE IF NOT EXISTS "EventsMaster" (
  id           uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name   text NOT NULL DEFAULT '',
  event_date   timestamptz,
  team_one_name  text NOT NULL DEFAULT '',
  team_two_name  text NOT NULL DEFAULT '',
  team_one_result integer,
  team_two_result integer,
  -- Penalty winner is only populated when both results are equal after extra time.
  -- Stores the identifier of the winning team: 'team_one' | 'team_two'
  penalty_winner  text CHECK (penalty_winner IN ('team_one', 'team_two') OR penalty_winner IS NULL),
  status       text NOT NULL DEFAULT 'scheduled'
               CHECK (status IN ('scheduled', 'in_progress', 'completed', 'cancelled')),
  notes        text NOT NULL DEFAULT '',
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_events_master_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_events_master_updated_at
  BEFORE UPDATE ON "EventsMaster"
  FOR EACH ROW EXECUTE FUNCTION update_events_master_updated_at();

-- Allow authenticated users to read
ALTER TABLE "EventsMaster" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "EventsMaster: admin full access"
  ON "EventsMaster"
  FOR ALL
  USING (true)
  WITH CHECK (true);
