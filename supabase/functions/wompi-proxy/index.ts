/**
 * Mentalma_Wompi_Server — Supabase Edge Function
 *
 * Proxies sensitive Wompi operations so that the integrity secret and
 * server-side verification never touch the browser.
 *
 * Endpoints
 * ─────────
 *  POST /wompi-proxy/checkout-params
 *    Body: { reference, amountInCents, currency, clientEmail?, clientName?, clientPhone?, redirectUrl }
 *    Returns: { publicKey, currency, amountInCents, reference, redirectUrl,
 *               integrityHash, customerEmail?, customerName?, customerPhone? }
 *
 *  GET /wompi-proxy/public-key
 *    Returns: { publicKey, baseUrl } for browser card tokenization
 *
 *  POST /wompi-proxy/card-transaction
 *    Body: { token, installments, amountInCents, currency, reference, clientEmail, clientName?, redirectUrl? }
 *    Creates a CARD transaction with the private key (token from POST /v1/tokens/cards)
 *
 *  POST /wompi-proxy/pse-transaction
 *    Body: { amountInCents, currency, reference, clientEmail, redirectUrl,
 *            userType, userLegalIdType, userLegalId, financialInstitutionCode, paymentDescription }
 *    Creates a PSE transaction and returns asyncPaymentUrl for bank redirect
 *
 *  GET /wompi-proxy/verify?transaction_id=<id>
 *    Returns: { transactionId, status, reference, amountInCents, currency }
 *
 * Supabase secrets required (set via `supabase secrets set`):
 *   WOMPI_PUBLIC_KEY        — pub_test_... or pub_prod_...
 *   WOMPI_PRIVATE_KEY       — prv_test_... or prv_prod_... (CARD and PSE transactions)
 *   WOMPI_INTEGRITY_SECRET  — events/webhooks integrity secret from Wompi dashboard
 *   WOMPI_ENV               — "sandbox" (default) or "production"
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// ── SHA-256 hex helper ────────────────────────────────────────────────────────

async function sha256Hex(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(text));
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// ── Wompi base URL ────────────────────────────────────────────────────────────

function wompiBaseUrl(): string {
  const env = Deno.env.get('WOMPI_ENV') ?? 'sandbox';
  return env === 'production'
    ? 'https://production.wompi.co/v1'
    : 'https://sandbox.wompi.co/v1';
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  const url = new URL(req.url);

  // Normalise path: strip leading /functions/v1/wompi-proxy or /wompi-proxy
  let path = url.pathname
    .replace(/^\/functions\/v1\/wompi-proxy/, '')
    .replace(/^\/wompi-proxy/, '')
    .replace(/^\//, '');

  // ── POST /checkout-params ────────────────────────────────────────────────

  if (path === 'checkout-params' && req.method === 'POST') {
    const publicKey = Deno.env.get('WOMPI_PUBLIC_KEY');
    const secret = Deno.env.get('WOMPI_INTEGRITY_SECRET') ?? '';

    if (!publicKey || publicKey.includes('REPLACE')) {
      return new Response(
        JSON.stringify({ error: 'WOMPI_PUBLIC_KEY is not configured on the server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body: {
      reference?: string;
      amountInCents?: number;
      currency?: string;
      clientEmail?: string;
      clientName?: string;
      clientPhone?: string;
      redirectUrl?: string;
    };

    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { reference, amountInCents, currency, clientEmail, clientName, clientPhone, redirectUrl } = body;

    if (!reference || !amountInCents || !currency || !redirectUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: reference, amountInCents, currency, redirectUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Generate integrity hash server-side — secret never leaves this function
    const integrityHash = await sha256Hex(`${reference}${amountInCents}${currency}${secret}`);

    const result = {
      publicKey,
      currency,
      amountInCents,
      reference,
      redirectUrl,
      integrityHash,
      ...(clientEmail && { customerEmail: clientEmail }),
      ...(clientName && { customerName: clientName }),
      ...(clientPhone && { customerPhone: clientPhone.replace(/\D/g, '') }),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // ── GET /public-key ──────────────────────────────────────────────────────

  if (path === 'public-key' && req.method === 'GET') {
    const publicKey = Deno.env.get('WOMPI_PUBLIC_KEY');
    if (!publicKey || publicKey.includes('REPLACE')) {
      return new Response(
        JSON.stringify({ error: 'WOMPI_PUBLIC_KEY is not configured on the server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    return new Response(
      JSON.stringify({ publicKey, baseUrl: wompiBaseUrl() }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── POST /card-transaction ───────────────────────────────────────────────

  if (path === 'card-transaction' && req.method === 'POST') {
    const publicKey = Deno.env.get('WOMPI_PUBLIC_KEY');
    const privateKey = Deno.env.get('WOMPI_PRIVATE_KEY');
    if (!publicKey || publicKey.includes('REPLACE')) {
      return new Response(
        JSON.stringify({ error: 'WOMPI_PUBLIC_KEY is not configured on the server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!privateKey || privateKey.includes('REPLACE')) {
      return new Response(
        JSON.stringify({ error: 'WOMPI_PRIVATE_KEY is not configured on the server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body: {
      token?: string;
      installments?: number;
      amountInCents?: number;
      currency?: string;
      reference?: string;
      clientEmail?: string;
      clientName?: string;
      redirectUrl?: string;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = (body.token || '').trim();
    const installments = Math.max(1, Number(body.installments) || 1);
    const { amountInCents, currency, reference, clientEmail, redirectUrl } = body;

    if (!token.startsWith('tok_')) {
      return new Response(
        JSON.stringify({ error: 'token must start with tok_' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!amountInCents || !currency || !reference || !clientEmail) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: token, amountInCents, currency, reference, clientEmail' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const baseUrl = wompiBaseUrl();

    let acceptanceToken = '';
    try {
      const merchantRes = await fetch(`${baseUrl}/merchants/${publicKey}`);
      const merchantJson = await merchantRes.json() as {
        data?: { presigned_acceptance?: { acceptance_token?: string } };
      };
      acceptanceToken = merchantJson.data?.presigned_acceptance?.acceptance_token || '';
    } catch {
      console.error('Wompi merchant lookup failed');
      return new Response(
        JSON.stringify({ error: 'Failed to load Wompi acceptance token' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!acceptanceToken) {
      return new Response(
        JSON.stringify({ error: 'Wompi acceptance token was not available' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const txBody: Record<string, unknown> = {
      acceptance_token: acceptanceToken,
      amount_in_cents: amountInCents,
      currency,
      customer_email: clientEmail,
      reference,
      payment_method: {
        type: 'CARD',
        token,
        installments,
      },
    };
    if (redirectUrl) txBody.redirect_url = redirectUrl;

    let wompiRes: Response;
    try {
      wompiRes = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${privateKey}`,
        },
        body: JSON.stringify(txBody),
      });
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to reach Wompi API' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const wompiJson = await wompiRes.json().catch(() => ({})) as {
      data?: { id?: string; status?: string; reference?: string };
      error?: { reason?: string; type?: string };
    };

    if (!wompiRes.ok) {
      return new Response(
        JSON.stringify({
          error: wompiJson.error?.reason || 'Wompi card transaction failed',
        }),
        { status: wompiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        transactionId: wompiJson.data?.id,
        status: wompiJson.data?.status,
        reference: wompiJson.data?.reference,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── POST /pse-transaction ────────────────────────────────────────────────

  if (path === 'pse-transaction' && req.method === 'POST') {
    const publicKey = Deno.env.get('WOMPI_PUBLIC_KEY');
    const privateKey = Deno.env.get('WOMPI_PRIVATE_KEY');
    if (!publicKey || publicKey.includes('REPLACE')) {
      return new Response(
        JSON.stringify({ error: 'WOMPI_PUBLIC_KEY is not configured on the server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!privateKey || privateKey.includes('REPLACE')) {
      return new Response(
        JSON.stringify({ error: 'WOMPI_PRIVATE_KEY is not configured on the server.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let body: {
      amountInCents?: number;
      currency?: string;
      reference?: string;
      clientEmail?: string;
      clientName?: string;
      clientPhone?: string;
      redirectUrl?: string;
      userType?: number;
      userLegalIdType?: string;
      userLegalId?: string;
      financialInstitutionCode?: string;
      paymentDescription?: string;
    };
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({ error: 'Invalid JSON body' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const amountInCents = Number(body.amountInCents) || 0;
    const currency = (body.currency || 'COP').toUpperCase();
    const reference = (body.reference || '').trim();
    const clientEmail = (body.clientEmail || '').trim();
    const redirectUrl = (body.redirectUrl || '').trim();
    const userType = body.userType === 1 ? 1 : 0;
    const userLegalIdType = (body.userLegalIdType || '').trim();
    const userLegalId = (body.userLegalId || '').trim();
    const financialInstitutionCode = String(body.financialInstitutionCode || '').trim();
    const paymentDescription = (body.paymentDescription || '').trim();

    if (!amountInCents || !reference || !clientEmail || !redirectUrl) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: amountInCents, reference, clientEmail, redirectUrl' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!userLegalIdType || !userLegalId || !financialInstitutionCode || !paymentDescription) {
      return new Response(
        JSON.stringify({ error: 'Missing PSE fields: userLegalIdType, userLegalId, financialInstitutionCode, paymentDescription' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const baseUrl = wompiBaseUrl();

    let acceptanceToken = '';
    try {
      const merchantRes = await fetch(`${baseUrl}/merchants/${publicKey}`);
      const merchantJson = await merchantRes.json() as {
        data?: { presigned_acceptance?: { acceptance_token?: string } };
      };
      acceptanceToken = merchantJson.data?.presigned_acceptance?.acceptance_token || '';
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to load Wompi acceptance token' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    if (!acceptanceToken) {
      return new Response(
        JSON.stringify({ error: 'Wompi acceptance token was not available' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const txBody: Record<string, unknown> = {
      acceptance_token: acceptanceToken,
      amount_in_cents: amountInCents,
      currency,
      customer_email: clientEmail,
      reference,
      redirect_url: redirectUrl,
      payment_method: {
        type: 'PSE',
        user_type: userType,
        user_legal_id_type: userLegalIdType,
        user_legal_id: userLegalId,
        financial_institution_code: financialInstitutionCode,
        payment_description: paymentDescription,
      },
    };
    if (body.clientName || body.clientPhone) {
      txBody.customer_data = {
        ...(body.clientName ? { full_name: body.clientName } : {}),
        ...(body.clientPhone ? { phone_number: body.clientPhone.replace(/\D/g, '') } : {}),
      };
    }

    let wompiRes: Response;
    try {
      wompiRes = await fetch(`${baseUrl}/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${privateKey}`,
        },
        body: JSON.stringify(txBody),
      });
    } catch {
      return new Response(
        JSON.stringify({ error: 'Failed to reach Wompi API' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const wompiJson = await wompiRes.json().catch(() => ({})) as {
      data?: {
        id?: string;
        status?: string;
        reference?: string;
        payment_method?: { extra?: { async_payment_url?: string } };
      };
      error?: { reason?: string; type?: string; messages?: unknown };
    };

    if (!wompiRes.ok) {
      const message = wompiJson.error?.reason
        || (typeof wompiJson.error?.messages === 'string' ? wompiJson.error.messages : '')
        || 'Wompi PSE transaction failed';
      return new Response(
        JSON.stringify({ error: message }),
        { status: wompiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({
        transactionId: wompiJson.data?.id,
        status: wompiJson.data?.status,
        reference: wompiJson.data?.reference,
        asyncPaymentUrl: wompiJson.data?.payment_method?.extra?.async_payment_url || '',
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── GET /verify?transaction_id=<id> ──────────────────────────────────────

  if (path === 'verify' && req.method === 'GET') {
    const transactionId = url.searchParams.get('transaction_id');

    if (!transactionId) {
      return new Response(
        JSON.stringify({ error: 'transaction_id query parameter is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const baseUrl = wompiBaseUrl();

    let wompiRes: Response;
    try {
      wompiRes = await fetch(`${baseUrl}/transactions/${transactionId}`);
    } catch (err) {
      console.error('Wompi API fetch error:', err);
      return new Response(
        JSON.stringify({ error: 'Failed to reach Wompi API' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!wompiRes.ok) {
      const errText = await wompiRes.text();
      console.error('Wompi API error response:', errText);
      return new Response(
        JSON.stringify({ error: 'Wompi API returned an error', detail: errText }),
        { status: wompiRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const wompiData = await wompiRes.json() as {
      data?: {
        id: string;
        status: string;
        reference: string;
        amount_in_cents: number;
        currency: string;
      };
    };

    const tx = wompiData.data;

    return new Response(
      JSON.stringify({
        transactionId: tx?.id,
        status: tx?.status,           // APPROVED | DECLINED | VOIDED | ERROR | PENDING
        reference: tx?.reference,
        amountInCents: tx?.amount_in_cents,
        currency: tx?.currency,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  // ── 404 ───────────────────────────────────────────────────────────────────

  return new Response(
    JSON.stringify({ error: `Unknown path: ${path}` }),
    { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
