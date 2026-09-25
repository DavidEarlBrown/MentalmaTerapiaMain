-- Auto-cancel unpaid pending client requests after a hold window (default 15 minutes).
-- Sets statusvalue/session_status = 2 ("Canceled no payment") and status = 'cancelled'
-- so soft-reserved time slots are released for other clients.

CREATE OR REPLACE FUNCTION public.expire_unpaid_pending_client_requests(
  p_minutes integer DEFAULT 15
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff timestamptz := now() - make_interval(mins => GREATEST(p_minutes, 1));
  v_count integer := 0;
  v_has_statusvalue boolean;
  v_has_session_status boolean;
  v_note text;
  v_lifecycle_filter text;
  v_set_extra text := '';
  v_sql text;
BEGIN
  v_note := format(
    '[auto] Unpaid hold expired after %s minutes — cancelled, slot released.',
    p_minutes
  );

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_requests' AND column_name = 'statusvalue'
  ) INTO v_has_statusvalue;

  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'client_requests' AND column_name = 'session_status'
  ) INTO v_has_session_status;

  IF v_has_statusvalue THEN
    v_lifecycle_filter := 'coalesce(cr.statusvalue, 0) = 0';
    v_set_extra := v_set_extra || ', statusvalue = 2';
  ELSIF v_has_session_status THEN
    v_lifecycle_filter := 'coalesce(cr.session_status, 0) = 0';
  ELSE
    v_lifecycle_filter := 'true';
  END IF;

  IF v_has_session_status THEN
    v_set_extra := v_set_extra || ', session_status = 2';
  END IF;

  v_sql := format($f$
    WITH paid AS (
      SELECT DISTINCT client_request_id
      FROM public.payment_transactions
      WHERE client_request_id IS NOT NULL
        AND lower(coalesce(payment_status, '')) = 'completed'
    ),
    stale AS (
      SELECT cr.id
      FROM public.client_requests cr
      LEFT JOIN paid p ON p.client_request_id = cr.id
      WHERE lower(coalesce(cr.status, '')) = 'pending'
        AND cr.created_at <= $1
        AND p.client_request_id IS NULL
        AND %s
    )
    UPDATE public.client_requests cr
    SET
      status = 'cancelled',
      notes = CASE
        WHEN nullif(trim(coalesce(cr.notes, '')), '') IS NULL THEN $2
        ELSE trim(cr.notes) || E'\n' || $2
      END
      %s
    FROM stale s
    WHERE cr.id = s.id
  $f$, v_lifecycle_filter, v_set_extra);

  EXECUTE v_sql USING v_cutoff, v_note;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN coalesce(v_count, 0);
END;
$$;

COMMENT ON FUNCTION public.expire_unpaid_pending_client_requests(integer) IS
  'Cancels unpaid pending client_requests older than p_minutes (default 15). Status → cancelled / statusvalue 2.';

GRANT EXECUTE ON FUNCTION public.expire_unpaid_pending_client_requests(integer) TO anon, authenticated, service_role;
