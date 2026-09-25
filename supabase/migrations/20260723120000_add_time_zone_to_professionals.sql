/*
  # Add time_zone column to professionals table

  Ensures the time_zone column exists so that professional timezone
  preferences can be stored and retrieved reliably.

  Uses IF NOT EXISTS so it is safe to run on databases where the
  column was already added manually.
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'professionals'
      AND column_name  = 'time_zone'
  ) THEN
    ALTER TABLE public.professionals
      ADD COLUMN time_zone text NOT NULL DEFAULT 'America/Bogota';
  END IF;
END $$;

COMMENT ON COLUMN public.professionals.time_zone IS
  'IANA timezone for the professional (e.g. America/Bogota). Used for scheduling calculations.';
