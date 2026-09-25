/**
 * zoho-desk-proxy — server-side proxy for Zoho Desk API.
 *
 * Zoho Desk does not allow direct browser requests (CORS).
 * This edge function runs server-side so the browser never calls desk.zoho.com directly.
 *
 * Request body:
 *   path        — Zoho Desk path, e.g. "/tickets" or "/tickets/123/comments"
 *   method      — HTTP verb: GET | POST | PUT | PATCH
 *   body        — optional request body (for POST/PUT/PATCH)
 *   accessToken — Zoho OAuth token (from localStorage); falls back to zoho_tokens table
 *   orgId       — Zoho Desk organisation ID; falls back to ZOHO_DESK_ORG_ID secret
 */

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

// Always use Zoho US datacenter for Desk API calls
const DESK_BASE = 'https://desk.zoho.com/api/v1';

interface ProxyRequest {
  path: string;
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  body?: unknown;
  accessToken?: string;
  orgId?: string;
  /** Zoho OAuth client credentials — passed from the browser so the proxy
   *  can refresh the token without needing server-side secrets. */
  clientId?: string;
  clientSecret?: string;
}

async function getTokenFromDb(
  passedClientId?: string,
  passedClientSecret?: string,
): Promise<{ token: string; refreshed: boolean } | null> {
  const supabaseUrl      = Deno.env.get('SUPABASE_URL')!;
  const serviceRoleKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase         = createClient(supabaseUrl, serviceRoleKey);

  const { data: row } = await supabase
    .from('zoho_tokens')
    .select('access_token, refresh_token, expires_at, accounts_domain')
    .limit(1)
    .maybeSingle();

  if (!row?.access_token) return null;

  // Check if still valid (add 60-second buffer so we refresh before it expires)
  const expired = row.expires_at
    ? new Date(row.expires_at).getTime() - 60_000 < Date.now()
    : true;
  if (!expired) return { token: row.access_token, refreshed: false };

  // Resolve client credentials — prefer server secrets, fall back to what
  // the browser passed (already in the JS bundle so no extra exposure).
  const clientId     = Deno.env.get('ZOHO_CLIENT_ID')     || passedClientId     || '';
  const clientSecret = Deno.env.get('ZOHO_CLIENT_SECRET') || passedClientSecret || '';

  if (!clientId || !clientSecret || !row.refresh_token) {
    console.warn('zoho-desk-proxy: cannot refresh — missing client credentials or refresh_token');
    return { token: row.access_token, refreshed: false };
  }

  console.log('zoho-desk-proxy: access token expired, refreshing…');
  const accountsDomain = row.accounts_domain || 'accounts.zoho.com';
  const refreshRes = await fetch(`https://${accountsDomain}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type:    'refresh_token',
      client_id:     clientId,
      client_secret: clientSecret,
      refresh_token: row.refresh_token,
    }).toString(),
  });
  const refreshData = await refreshRes.json();

  if (refreshData.access_token) {
    console.log('zoho-desk-proxy: token refreshed successfully');
    await supabase.from('zoho_tokens').update({
      access_token: refreshData.access_token,
      expires_at: refreshData.expires_in
        ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
        : null,
    }).eq('access_token', row.access_token);
    return { token: refreshData.access_token, refreshed: true };
  }

  console.error('zoho-desk-proxy: token refresh failed', refreshData);
  return { token: row.access_token, refreshed: false };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { path, method = 'GET', body, accessToken, orgId, clientId, clientSecret }: ProxyRequest = await req.json();

    if (!path) {
      return new Response(
        JSON.stringify({ error: 'path is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Resolve access token — always use DB (auto-refresh if expired)
    let token = accessToken || '';
    if (!token) {
      const stored = await getTokenFromDb(clientId, clientSecret);
      if (!stored) {
        return new Response(
          JSON.stringify({ error: 'No Zoho access token available. Please generate a Zoho token first.' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
      token = stored.token;
    }

    // Resolve org ID
    const effectiveOrgId = orgId || Deno.env.get('ZOHO_DESK_ORG_ID') || '';
    if (!effectiveOrgId) {
      return new Response(
        JSON.stringify({ error: 'Zoho Desk org ID not configured. Set ZOHO_DESK_ORG_ID in Supabase Function secrets.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const url = `${DESK_BASE}${path}`;
    console.log('zoho-desk-proxy:', method, url);

    const fetchInit: RequestInit = {
      method,
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'orgId': effectiveOrgId,
        'Content-Type': 'application/json',
      },
    };

    if (body !== undefined && method !== 'GET') {
      fetchInit.body = JSON.stringify(body);
    }

    const deskRes  = await fetch(url, fetchInit);
    const rawText  = await deskRes.text();

    // Handle empty body (e.g. 204 No Content or Zoho 4xx with no payload)
    if (!rawText.trim()) {
      return new Response(
        JSON.stringify({ error: `Zoho Desk returned empty response (HTTP ${deskRes.status})` }),
        { status: deskRes.ok ? 200 : deskRes.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let deskData: unknown;
    try {
      deskData = JSON.parse(rawText);
    } catch {
      return new Response(
        JSON.stringify({ error: `Zoho Desk response is not JSON: ${rawText.slice(0, 200)}` }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify(deskData), {
      status: deskRes.ok ? 200 : deskRes.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('zoho-desk-proxy error:', message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
