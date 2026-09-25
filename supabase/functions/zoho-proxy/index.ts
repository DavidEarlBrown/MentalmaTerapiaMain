import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ProxyRequest {
  endpoint: string;
  method: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
  accessToken?: string;
  useStoredToken?: boolean;
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
}

function getApiDomain(accountsDomain: string): string {
  const tld = accountsDomain.replace("accounts.zoho.", "");
  return `www.zohoapis.${tld}`;
}

async function getValidAccessToken(supabase: ReturnType<typeof createClient>): Promise<{ token: string; organizationId: string; apiDomain: string } | null> {
  const { data: tokenRow, error } = await supabase
    .from("zoho_tokens")
    .select("*")
    .limit(1)
    .maybeSingle();

  if (error || !tokenRow) {
    console.log("zoho-proxy: no token row found in db");
    return null;
  }

  const isExpired = tokenRow.expires_at ? new Date(tokenRow.expires_at) < new Date() : true;

  const apiDomain = getApiDomain(tokenRow.accounts_domain || "accounts.zoho.com");

  if (!isExpired && tokenRow.access_token) {
    console.log("zoho-proxy: using cached access token from db");
    return { token: tokenRow.access_token, organizationId: tokenRow.organization_id || "", apiDomain };
  }

  if (!tokenRow.refresh_token) {
    console.log("zoho-proxy: no refresh token available");
    return null;
  }

  console.log("zoho-proxy: access token expired, refreshing...");

  const clientId = Deno.env.get("ZOHO_CLIENT_ID") || "";
  const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET") || "";

  if (!clientId || !clientSecret) {
    console.log("zoho-proxy: no server-side Zoho credentials for auto-refresh, returning stored token as fallback");
    if (tokenRow.access_token) {
      return { token: tokenRow.access_token, organizationId: tokenRow.organization_id || "", apiDomain };
    }
    return null;
  }

  const params = new URLSearchParams();
  params.append("grant_type", "refresh_token");
  params.append("client_id", clientId);
  params.append("client_secret", clientSecret);
  params.append("refresh_token", tokenRow.refresh_token);

  const accountsDomain = tokenRow.accounts_domain || "accounts.zoho.com";
  const tokenUrl = `https://${accountsDomain}/oauth/v2/token`;

  const refreshResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const refreshData = await refreshResponse.json();
  console.log("zoho-proxy: refresh response:", JSON.stringify(refreshData));

  if (refreshData.access_token) {
    const expiresAt = refreshData.expires_in
      ? new Date(Date.now() + refreshData.expires_in * 1000).toISOString()
      : null;

    await supabase
      .from("zoho_tokens")
      .update({
        access_token: refreshData.access_token,
        token_type: refreshData.token_type || "Bearer",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", tokenRow.id);

    console.log("zoho-proxy: refreshed and stored new access token");
    return { token: refreshData.access_token, organizationId: tokenRow.organization_id || "", apiDomain };
  }

  console.log("zoho-proxy: refresh failed:", refreshData.error);
  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { endpoint, method, body, accessToken, useStoredToken }: ProxyRequest =
      await req.json();

    if (!endpoint) {
      return new Response(
        JSON.stringify({ error: "endpoint is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let effectiveToken = accessToken || "";
    let organizationId = "";
    let apiDomain = "www.zohoapis.com";

    if (useStoredToken || !effectiveToken) {
      const supabase = getSupabaseClient();
      const stored = await getValidAccessToken(supabase);
      if (stored) {
        effectiveToken = stored.token;
        organizationId = stored.organizationId;
        apiDomain = stored.apiDomain;
        console.log("zoho-proxy: using stored token, org:", organizationId, "api:", apiDomain);
      }
    }

    if (!effectiveToken) {
      return new Response(
        JSON.stringify({ error: "No valid access token available. Please connect Zoho first." }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const url = `https://${apiDomain}/books/v3${endpoint}`;
    console.log("zoho-proxy: calling", method || "GET", url);

    const headers: Record<string, string> = {
      Authorization: `Zoho-oauthtoken ${effectiveToken}`,
      "Content-Type": "application/json",
    };

    const fetchOptions: RequestInit = {
      method: method || "GET",
      headers,
    };

    if (body && (method === "POST" || method === "PUT")) {
      fetchOptions.body = JSON.stringify(body);
    }

    const zohoResponse = await fetch(url, fetchOptions);
    const zohoData = await zohoResponse.json();

    if (zohoData.code === 57 || zohoData.code === 6100 ||
        (zohoData.message && /invalid.*token|token.*expired|oauth/i.test(zohoData.message))) {
      console.log("zoho-proxy: token error from Zoho, attempting auto-refresh...");

      const supabase = getSupabaseClient();
      const refreshed = await getValidAccessToken(supabase);

      if (refreshed && refreshed.token !== effectiveToken) {
        console.log("zoho-proxy: retrying with refreshed token");
        headers.Authorization = `Zoho-oauthtoken ${refreshed.token}`;
        const retryUrl = `https://${refreshed.apiDomain}/books/v3${endpoint}`;

        const retryResponse = await fetch(retryUrl, {
          method: method || "GET",
          headers,
          body: body && (method === "POST" || method === "PUT") ? JSON.stringify(body) : undefined,
        });

        const retryData = await retryResponse.json();
        return new Response(JSON.stringify(retryData), {
          status: retryResponse.ok ? 200 : retryResponse.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify(zohoData), {
      status: zohoResponse.ok ? 200 : zohoResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.log("zoho-proxy: error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
