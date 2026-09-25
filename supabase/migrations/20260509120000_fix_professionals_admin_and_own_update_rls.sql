/*
  # Fix professionals UPDATE policies for admins and linked professionals

  Admin policies only checked users.role = 'admin', but many administrators use
  user_type = 'Administrator' without role set — updates matched 0 rows silently.

  Also allow professionals to update their own linked profile row (including email).
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

DROP POLICY IF EXISTS "Admins can read all professionals" ON public.professionals;
DROP POLICY IF EXISTS "Admins can insert professionals" ON public.professionals;
DROP POLICY IF EXISTS "Admins can update professionals" ON public.professionals;
DROP POLICY IF EXISTS "Admins can delete professionals" ON public.professionals;

CREATE POLICY "Admins can read all professionals"
  ON public.professionals FOR SELECT TO authenticated
  USING (public.is_app_admin());

CREATE POLICY "Admins can insert professionals"
  ON public.professionals FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin());

CREATE POLICY "Admins can update professionals"
  ON public.professionals FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE POLICY "Admins can delete professionals"
  ON public.professionals FOR DELETE TO authenticated
  USING (public.is_app_admin());

DROP POLICY IF EXISTS "Professionals can update own profile row" ON public.professionals;

CREATE POLICY "Professionals can update own profile row"
  ON public.professionals FOR UPDATE TO authenticated
  USING (user_id IS NOT NULL AND user_id = auth.uid())
  WITH CHECK (user_id IS NOT NULL AND user_id = auth.uid());
