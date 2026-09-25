/*
  # Allow professionals to manage their own available_slots

  After standardize_rls_policies, only admins (users.role = 'admin') could INSERT or
  DELETE available_slots. Psychologists/professionals adding time slots hit RLS failures.

  Professionals linked via professionals.user_id (or matching email) can insert, update,
  and delete unbooked slots for their own professional_id.
*/

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE id = auth.uid()
      AND (
        lower(coalesce(role, '')) IN ('admin', 'administrator')
        OR user_type = 'Administrator'
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_professional_slots(target_professional_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_app_admin()
  OR EXISTS (
    SELECT 1
    FROM public.professionals p
    WHERE p.id = target_professional_id
      AND (
        (p.user_id IS NOT NULL AND p.user_id = auth.uid())
        OR (
          COALESCE(trim(p.email), '') <> ''
          AND lower(trim(p.email)) = lower(trim(COALESCE(auth.jwt() ->> 'email', '')))
        )
      )
  );
$$;

-- Refresh admin slot policies to use is_app_admin()
DROP POLICY IF EXISTS "Admins can read all slots" ON public.available_slots;
DROP POLICY IF EXISTS "Admins can insert slots" ON public.available_slots;
DROP POLICY IF EXISTS "Admins can update slots" ON public.available_slots;
DROP POLICY IF EXISTS "Admins can delete slots" ON public.available_slots;

CREATE POLICY "Admins can read all slots"
  ON public.available_slots FOR SELECT TO authenticated
  USING (public.is_app_admin());

CREATE POLICY "Admins can insert slots"
  ON public.available_slots FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin());

CREATE POLICY "Admins can update slots"
  ON public.available_slots FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE POLICY "Admins can delete slots"
  ON public.available_slots FOR DELETE TO authenticated
  USING (public.is_app_admin());

-- Professional self-service slot management
DROP POLICY IF EXISTS "Professionals can insert own slots" ON public.available_slots;
DROP POLICY IF EXISTS "Professionals can update own slots" ON public.available_slots;
DROP POLICY IF EXISTS "Professionals can delete own unbooked slots" ON public.available_slots;

CREATE POLICY "Professionals can insert own slots"
  ON public.available_slots FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_professional_slots(professional_id));

CREATE POLICY "Professionals can update own slots"
  ON public.available_slots FOR UPDATE TO authenticated
  USING (public.can_manage_professional_slots(professional_id))
  WITH CHECK (public.can_manage_professional_slots(professional_id));

CREATE POLICY "Professionals can delete own unbooked slots"
  ON public.available_slots FOR DELETE TO authenticated
  USING (
    public.can_manage_professional_slots(professional_id)
    AND is_booked = false
  );
