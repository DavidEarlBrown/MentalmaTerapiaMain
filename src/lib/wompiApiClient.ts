/**
 * wompiApiClient — all Wompi REST API calls in one place.
 *
 * Sensitive operations (integrity hash generation, secret-key calls) are
 * routed through the `wompi-proxy` Supabase Edge Function so the browser
 * never sees WOMPI_INTEGRITY_SECRET or WOMPI_PRIVATE_KEY.
 *
 * Public surface
 * ──────────────
 *  getWompiCheckoutParams()    — obtain server-signed checkout parameters
 *  verifyWompiTransaction()    — look up a transaction by ID
 *  redirectToWompiCheckout()   — navigate browser to Wompi hosted page
 *  buildWompiRedirectUrl()     — return the Wompi URL without navigating
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface WompiCheckoutRequest {
  reference: string;
  amountInCents: number; // always in COP cents
  currency: string;      // always "COP" for Wompi Colombia
  clientEmail?: string;
  clientName?: string;
  clientPhone?: string;
  redirectUrl: string;
}

export interface WompiCheckoutResult {
  publicKey: string;
  currency: string;
  amountInCents: number;
  reference: string;
  redirectUrl: string;
  integrityHash: string;
  customerEmail?: string;
  customerName?: string;
  customerPhone?: string;
}

export type WompiStatus =
  | 'APPROVED'
  | 'DECLINED'
  | 'VOIDED'
  | 'ERROR'
  | 'PENDING';

export interface WompiTransaction {
  transactionId: string;
  status: WompiStatus;
  reference: string;
  amountInCents: number;
  currency: string;
}

/** Currency rates vs USD — used to convert display amounts to COP. */
export interface CurrencyRate {
  code: string;
  name: string;
  symbol: string;
  rate: number; // units per 1 USD
}

export const WOMPI_CURRENCIES: CurrencyRate[] = [
  { code: 'COP', name: 'Colombian Peso',  symbol: '$',  rate: 3950.00 },
  { code: 'USD', name: 'US Dollar',       symbol: '$',  rate: 1.00   },
  { code: 'EUR', name: 'Euro',            symbol: '€',  rate: 0.92   },
  { code: 'GBP', name: 'British Pound',   symbol: '£',  rate: 0.79   },
  { code: 'MXN', name: 'Mexican Peso',    symbol: '$',  rate: 17.15  },
  { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', rate: 1.36   },
  { code: 'BRL', name: 'Brazilian Real',  symbol: 'R$', rate: 4.97   },
  { code: 'ARS', name: 'Argentine Peso',  symbol: '$',  rate: 875.00 },
  { code: 'PEN', name: 'Peruvian Sol',    symbol: 'S/', rate: 3.72   },
  { code: 'CLP', name: 'Chilean Peso',    symbol: '$',  rate: 950.00 },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function proxyBaseUrl(): string {
  return `${import.meta.env.VITE_SUPABASE_URL as string}/functions/v1/wompi-proxy`;
}

/**
 * Convert an amount in a display currency to COP cents (Wompi always
 * transacts in COP).
 */
export function toCOPCents(amount: number, fromCurrencyCode: string): number {
  const copRate = WOMPI_CURRENCIES.find(c => c.code === 'COP')?.rate ?? 3950;
  const fromRate = WOMPI_CURRENCIES.find(c => c.code === fromCurrencyCode)?.rate ?? 1;
  return Math.round((amount / fromRate) * copRate) * 100;
}

/**
 * Format a COP cents value back to a readable Colombian peso string.
 */
export function formatCOP(cents: number): string {
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(
    cents / 100,
  );
}

// ── Core API calls ────────────────────────────────────────────────────────────

/**
 * Request server-signed checkout parameters from the wompi-proxy edge function.
 * The integrity hash is generated server-side so WOMPI_INTEGRITY_SECRET never
 * leaves the Supabase function.
 */
export async function getWompiCheckoutParams(
  params: WompiCheckoutRequest,
): Promise<WompiCheckoutResult> {
  const res = await fetch(`${proxyBaseUrl()}/checkout-params`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Wompi proxy returned non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(
      (data.error as string | undefined) ?? `Wompi proxy error ${res.status}`,
    );
  }

  return data as unknown as WompiCheckoutResult;
}

/**
 * Verify a completed Wompi transaction by ID.
 * Returns the transaction status: APPROVED | DECLINED | VOIDED | ERROR | PENDING.
 */
export async function verifyWompiTransaction(
  transactionId: string,
): Promise<WompiTransaction> {
  const res = await fetch(
    `${proxyBaseUrl()}/verify?transaction_id=${encodeURIComponent(transactionId)}`,
  );

  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    throw new Error(`Wompi verify returned non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    throw new Error(
      (data.error as string | undefined) ?? `Wompi verify error ${res.status}`,
    );
  }

  return data as unknown as WompiTransaction;
}

export interface WompiCardTokenResult {
  token: string;
  lastFour: string;
  brand: string;
}

/**
 * Tokenize a card with Wompi POST /v1/tokens/cards using the public key.
 * Card number and CVC are sent only to Wompi and are not stored locally.
 */
export async function tokenizeWompiCard(card: {
  number: string;
  cvc: string;
  exp_month: string;
  exp_year: string;
  card_holder: string;
}): Promise<WompiCardTokenResult> {
  const keyRes = await fetch(`${proxyBaseUrl()}/public-key`);
  const keyData = await keyRes.json().catch(() => ({})) as {
    publicKey?: string;
    baseUrl?: string;
    error?: string;
  };
  if (!keyRes.ok || !keyData.publicKey || !keyData.baseUrl) {
    throw new Error(keyData.error || 'Could not load Wompi public key');
  }

  const number = card.number.replace(/\s+/g, '');
  const res = await fetch(`${keyData.baseUrl}/tokens/cards`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${keyData.publicKey}`,
    },
    body: JSON.stringify({
      number,
      cvc: card.cvc,
      exp_month: card.exp_month.padStart(2, '0'),
      exp_year: card.exp_year.slice(-2),
      card_holder: card.card_holder.trim(),
    }),
  });

  const payload = await res.json().catch(() => ({})) as {
    status?: string;
    data?: { id?: string; last_four?: string; brand?: string };
    error?: { reason?: string; messages?: unknown };
  };

  const token = payload.data?.id || '';
  if (!res.ok || !token.startsWith('tok_')) {
    const reason = payload.error?.reason
      || (typeof payload.error?.messages === 'string' ? payload.error.messages : '')
      || 'Card tokenization failed';
    throw new Error(reason);
  }

  return {
    token,
    lastFour: payload.data?.last_four || number.slice(-4),
    brand: payload.data?.brand || '',
  };
}

export interface WompiCardChargeRequest {
  token: string;
  installments: number;
  amountInCents: number;
  currency: string;
  reference: string;
  clientEmail: string;
  clientName?: string;
  redirectUrl?: string;
}

export interface WompiCardChargeResult {
  transactionId: string;
  status: string;
  reference: string;
}

export interface WompiPseChargeRequest {
  amountInCents: number;
  currency: string;
  reference: string;
  clientEmail: string;
  clientName?: string;
  clientPhone?: string;
  redirectUrl: string;
  userType: 0 | 1;
  userLegalIdType: string;
  userLegalId: string;
  financialInstitutionCode: string;
  paymentDescription: string;
}

export interface WompiPseChargeResult {
  transactionId: string;
  status: string;
  reference: string;
  asyncPaymentUrl?: string;
}

/**
 * Charge a previously tokenized card. The token must start with tok_.
 */
export async function createWompiCardTransaction(
  params: WompiCardChargeRequest,
): Promise<WompiCardChargeResult> {
  const res = await fetch(`${proxyBaseUrl()}/card-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({})) as {
    transactionId?: string;
    status?: string;
    reference?: string;
    error?: string;
  };
  if (!res.ok || !data.transactionId) {
    throw new Error(data.error || `Wompi card charge failed (${res.status})`);
  }
  return {
    transactionId: data.transactionId,
    status: data.status || '',
    reference: data.reference || params.reference,
  };
}

/**
 * Create a Wompi PSE transaction. The user must be redirected to asyncPaymentUrl
 * to complete the bank transfer, then returns to redirectUrl with ?id=.
 */
export async function createWompiPseTransaction(
  params: WompiPseChargeRequest,
): Promise<WompiPseChargeResult> {
  const res = await fetch(`${proxyBaseUrl()}/pse-transaction`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  const data = await res.json().catch(() => ({})) as {
    transactionId?: string;
    status?: string;
    reference?: string;
    asyncPaymentUrl?: string;
    error?: string;
  };
  if (!res.ok || !data.transactionId) {
    throw new Error(data.error || `Wompi PSE charge failed (${res.status})`);
  }
  return {
    transactionId: data.transactionId,
    status: data.status || '',
    reference: data.reference || params.reference,
    asyncPaymentUrl: data.asyncPaymentUrl,
  };
}

// ── Navigation helpers ────────────────────────────────────────────────────────

/**
 * Build the URL for Wompi's hosted checkout page from signed parameters.
 */
export function buildWompiCheckoutUrl(cp: WompiCheckoutResult): string {
  const qp = new URLSearchParams({
    'public-key':      cp.publicKey,
    currency:          cp.currency,
    'amount-in-cents': cp.amountInCents.toString(),
    reference:         cp.reference,
    'redirect-url':    cp.redirectUrl,
  });
  if (cp.customerEmail) qp.append('customer-data:email', cp.customerEmail);
  if (cp.customerName)  qp.append('customer-data:full-name', cp.customerName);
  if (cp.integrityHash) qp.append('signature:integrity', cp.integrityHash);
  return `https://checkout.wompi.co/p/?${qp.toString()}`;
}

/**
 * Redirect the browser to Wompi's hosted checkout page.
 * The user will be returned to `redirectUrl` with `?id=<transactionId>` appended.
 */
export function redirectToWompiCheckout(cp: WompiCheckoutResult): void {
  window.location.href = buildWompiCheckoutUrl(cp);
}
