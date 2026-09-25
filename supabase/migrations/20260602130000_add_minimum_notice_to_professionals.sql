-- Minimum booking notice (hours) for each professional. NULL or negative → app default 24.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'professionals'
      AND column_name = 'minimum_notice'
  ) THEN
    ALTER TABLE public.professionals
      ADD COLUMN minimum_notice integer;
  END IF;
END $$;

COMMENT ON COLUMN public.professionals.minimum_notice IS
  'Minimum booking notice in hours. When NULL or < 0 the client UI uses 24 hours.';
