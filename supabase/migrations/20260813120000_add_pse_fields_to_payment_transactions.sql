-- PSE / bank-transfer details on recorded payments.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'payment_transactions'
      AND column_name = 'pse_type'
  ) THEN
    ALTER TABLE public.payment_transactions
      ADD COLUMN pse_type text,
      ADD COLUMN user_type smallint,
      ADD COLUMN user_legal_id_type text,
      ADD COLUMN user_legal_id text,
      ADD COLUMN financial_institution_code text,
      ADD COLUMN payment_description text;
  END IF;
END $$;

COMMENT ON COLUMN public.payment_transactions.pse_type IS
  'Bank transfer type; must be PSE for Colombian PSE payments.';
COMMENT ON COLUMN public.payment_transactions.user_type IS
  '0 = individual (persona natural), 1 = business (persona jurídica).';
COMMENT ON COLUMN public.payment_transactions.user_legal_id_type IS
  'Identification acronym, e.g. CC, NIT, CE, PP, TI.';
COMMENT ON COLUMN public.payment_transactions.user_legal_id IS
  'Identification card or tax registration number.';
COMMENT ON COLUMN public.payment_transactions.financial_institution_code IS
  'PSE unique identifier code for the selected bank.';
COMMENT ON COLUMN public.payment_transactions.payment_description IS
  'Reason for the bank-transfer transaction.';
