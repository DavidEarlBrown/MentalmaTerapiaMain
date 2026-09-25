-- Wompi CARD tokenization fields on recorded payments.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_transactions'
      AND column_name = 'wompi_token'
  ) THEN
    ALTER TABLE public.payment_transactions
      ADD COLUMN wompi_type text,
      ADD COLUMN wompi_token text,
      ADD COLUMN installments integer;
  END IF;
END $$;

COMMENT ON COLUMN public.payment_transactions.wompi_type IS
  'Wompi payment source type; must be CARD for credit-card charges.';
COMMENT ON COLUMN public.payment_transactions.wompi_token IS
  'Wompi card token from POST /v1/tokens/cards; starts with tok_.';
COMMENT ON COLUMN public.payment_transactions.installments IS
  'Chosen split-payment installment count for the CARD charge.';
