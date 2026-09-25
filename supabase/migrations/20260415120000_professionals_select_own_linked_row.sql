/*
  # Professionals can read their own profile row

  Authenticated users were only allowed to SELECT from `public.professionals` when
  `is_active = true`. A professional with `is_active = false` could not resolve their
  own `professionals.id` in the app (SessionBooking and similar), so client requests
  were filtered down to an empty list even when `user_id` matched `auth.uid()`.

  This policy ORs with the existing "active only" policy so linked accounts can always
  read the row where `user_id = auth.uid()`.
*/

DROP POLICY IF EXISTS "Professionals can read own profile row" ON public.professionals;

CREATE POLICY "Professionals can read own profile row"
  ON public.professionals
  FOR SELECT
  TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid());
