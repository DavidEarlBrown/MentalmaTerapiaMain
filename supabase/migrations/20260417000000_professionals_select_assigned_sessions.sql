/*
  # Professionals can read sessions assigned to them

  Non-admin therapists use the browser Supabase client to load sessions filtered by
  `professional_id`. The restrictive policy from standardize_rls_policies only allows
  `sessions.user_id = auth.uid()`, which is the *client* on the booking — so professionals
  saw an empty list while administrators still matched "Admins can read all sessions".

  This policy ORs with existing SELECT policies: a row is visible if the signed-in user
  is linked to `sessions.professional_id` via `professionals.user_id` or the same email
  as in the JWT (mirrors ProfessionalAppointments lookup when `user_id` is not set).
*/

DROP POLICY IF EXISTS "Professionals can read assigned sessions" ON public.sessions;

CREATE POLICY "Professionals can read assigned sessions"
  ON public.sessions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professionals p
      WHERE p.id = sessions.professional_id
        AND (
          (p.user_id IS NOT NULL AND p.user_id = auth.uid())
          OR (
            COALESCE(trim(p.email), '') <> ''
            AND lower(trim(p.email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
          )
        )
    )
  );
