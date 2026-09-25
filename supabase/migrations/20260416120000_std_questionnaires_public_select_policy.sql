/*
  # std_questionnaires: public read for catalog + flags

  Clients and anonymous users must be able to SELECT rows so the app can read
  `active` and `client_avail`. If RLS is enabled on `std_questionnaires` but no
  broad SELECT policy exists, PostgREST returns no rows and the UI falls back
  to defaults (everything looks active / client-available).

  This policy is added only when the table already has row-level security on.
*/

DO $$
DECLARE
  rls_on boolean;
BEGIN
  SELECT c.relrowsecurity
  INTO rls_on
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relname = 'std_questionnaires';

  IF rls_on IS TRUE THEN
    DROP POLICY IF EXISTS "Anyone can view std questionnaires" ON public.std_questionnaires;
    CREATE POLICY "Anyone can view std questionnaires"
      ON public.std_questionnaires
      FOR SELECT
      TO anon, authenticated
      USING (true);
  END IF;
END $$;
