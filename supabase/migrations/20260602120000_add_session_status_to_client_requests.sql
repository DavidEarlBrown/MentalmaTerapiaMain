-- Numeric session lifecycle status on client requests.
-- 0 Pending, 1 paid, 2 Canceled no payment, 3 Canceled Payment, 4 refund, 5 Completed

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'client_requests'
      AND column_name = 'session_status'
  ) THEN
    ALTER TABLE public.client_requests
      ADD COLUMN session_status smallint NOT NULL DEFAULT 0
      CHECK (session_status >= 0 AND session_status <= 5);
  END IF;
END $$;

COMMENT ON COLUMN public.client_requests.session_status IS
  '0 Pending, 1 paid, 2 Canceled no payment, 3 Canceled Payment, 4 refund, 5 Completed';
