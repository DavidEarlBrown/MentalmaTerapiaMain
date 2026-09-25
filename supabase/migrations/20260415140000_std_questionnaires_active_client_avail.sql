/*
  # std_questionnaires: active + client_avail

  - `active` — when false, questionnaire is hidden from selection lists in the app.
  - `client_avail` — when false, clients see "Not Downloadable by Client" and cannot submit.

  Defaults keep existing behavior until rows are toggled in admin.
*/

ALTER TABLE public.std_questionnaires
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;

ALTER TABLE public.std_questionnaires
  ADD COLUMN IF NOT EXISTS client_avail boolean NOT NULL DEFAULT true;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'standard_questionnaires'
  ) THEN
    ALTER TABLE public.standard_questionnaires
      ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true;
    ALTER TABLE public.standard_questionnaires
      ADD COLUMN IF NOT EXISTS client_avail boolean NOT NULL DEFAULT true;
  END IF;
END $$;
