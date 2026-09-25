import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface TokenRequest {
  grant_type: "authorization_code" | "refresh_token" | "get_organizations" | "check_connection" | "refresh_from_db";
  client_id?: string;
  client_secret?: string;
  code?: string;
  refresh_token?: string;
  access_token?: string;
  organization_id?: string;
  redirect_uri?: string;
  accounts_domain?: string;
  books_domain?: string;
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const body: TokenRequest = await req.json();
    console.log("zoho-token: received request with grant_type:", body.grant_type);

    if (body.grant_type === "check_connection") {
      return await handleCheckConnection();
    }

    if (body.grant_type === "refresh_from_db") {
      return await handleRefreshFromDb();
    }


    if (body.grant_type === "get_organizations") {
      if (!body.access_token) {
        console.log("zoho-token: missing access_token for get_organizations");
        return new Response(
          JSON.stringify({ error: "access_token is required for get_organizations" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const booksDomain = body.books_domain || "books.zoho.com";
      console.log("zoho-token: using books domain:", booksDomain);

      const orgUrl = body.organization_id
        ? `https://${booksDomain}/api/v3/organizations?organization_id=${body.organization_id}`
        : `https://${booksDomain}/api/v3/organizations`;

      console.log("zoho-token: calling Zoho Books organizations API:", orgUrl);

      const orgResponse = await fetch(orgUrl, {
        method: "GET",
        headers: {
          Authorization: `Zoho-oauthtoken ${body.access_token}`,
          "Content-Type": "application/json",
        },
      });

      const orgData = await orgResponse.json();
      console.log("zoho-token: organizations response status:", orgResponse.status);
      console.log("zoho-token: organizations response data:", JSON.stringify(orgData));

      return new Response(JSON.stringify(orgData), {
        status: orgResponse.ok ? 200 : orgResponse.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!body.client_id || !body.client_secret) {
      console.log("zoho-token: missing client_id or client_secret");
      return new Response(
        JSON.stringify({ error: "client_id and client_secret are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.grant_type === "authorization_code" && !body.code) {
      return new Response(
        JSON.stringify({ error: "code (grant token) is required for authorization_code grant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (body.grant_type === "refresh_token" && !body.refresh_token) {
      return new Response(
        JSON.stringify({ error: "refresh_token is required for refresh_token grant" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const params = new URLSearchParams();
    params.append("grant_type", body.grant_type);
    params.append("client_id", body.client_id);
    params.append("client_secret", body.client_secret);

    if (body.grant_type === "authorization_code" && body.code) {
      params.append("code", body.code);
      if (body.redirect_uri) {
        params.append("redirect_uri", body.redirect_uri);
        console.log("zoho-token: including redirect_uri in token exchange:", body.redirect_uri);
      }
    }

    if (body.grant_type === "refresh_token" && body.refresh_token) {
      params.append("refresh_token", body.refresh_token);
    }

    const accountsDomain = body.accounts_domain || "accounts.zoho.com";
    const tokenUrl = `https://${accountsDomain}/oauth/v2/token`;
    console.log("zoho-token: calling Zoho OAuth token endpoint:", tokenUrl, "grant_type:", body.grant_type);

    const zohoResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const zohoData = await zohoResponse.json();
    console.log("zoho-token: token response status:", zohoResponse.status);
    console.log("zoho-token: token response data:", JSON.stringify(zohoData));

    if (zohoData.access_token) {
      try {
        await storeTokensInDb(zohoData, accountsDomain, body.organization_id || "");
        console.log("zoho-token: tokens stored in database");
      } catch (dbErr) {
        console.log("zoho-token: failed to store tokens in db:", dbErr);
      }
    }

    return new Response(JSON.stringify(zohoData), {
      status: zohoResponse.ok ? 200 : zohoResponse.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.log("zoho-token: error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function storeTokensInDb(tokenData: Record<string, unknown>, accountsDomain: string, organizationId: string) {
  const supabase = getSupabaseClient();

  const { data: existing } = await supabase
    .from("zoho_tokens")
    .select("id, organization_id")
    .limit(1)
    .maybeSingle();

  const expiresAt = typeof tokenData.expires_in === "number"
    ? new Date(Date.now() + (tokenData.expires_in as number) * 1000).toISOString()
    : null;

  const tokenRow: Record<string, unknown> = {
    access_token: tokenData.access_token as string,
    token_type: (tokenData.token_type as string) || "Bearer",
    expires_at: expiresAt,
    accounts_domain: accountsDomain,
    updated_at: new Date().toISOString(),
  };

  if (tokenData.refresh_token) {
    tokenRow.refresh_token = tokenData.refresh_token as string;
  }

  if (organizationId) {
    tokenRow.organization_id = organizationId;
  }

  if (existing?.id) {
    await supabase.from("zoho_tokens").update(tokenRow).eq("id", existing.id);
  } else {
    if (!tokenRow.refresh_token) tokenRow.refresh_token = "";
    if (!tokenRow.organization_id) tokenRow.organization_id = organizationId || "";
    await supabase.from("zoho_tokens").insert(tokenRow);
  }
}

async function handleCheckConnection(): Promise<Response> {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from("zoho_tokens")
      .select("id, access_token, refresh_token, expires_at, organization_id, updated_at")
      .limit(1)
      .maybeSingle();

    if (error) {
      console.log("zoho-token: check_connection db error:", error);
      return new Response(
        JSON.stringify({ connected: false, error: error.message }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!data || !data.refresh_token) {
      return new Response(
        JSON.stringify({ connected: false }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isExpired = data.expires_at ? new Date(data.expires_at) < new Date() : true;

    return new Response(
      JSON.stringify({
        connected: true,
        has_refresh_token: !!data.refresh_token,
        has_access_token: !!data.access_token,
        is_expired: isExpired,
        organization_id: data.organization_id,
        updated_at: data.updated_at,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ connected: false, error: message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}

async function handleRefreshFromDb(): Promise<Response> {
  try {
    const supabase = getSupabaseClient();
    const { data: tokenRow, error } = await supabase
      .from("zoho_tokens")
      .select("*")
      .limit(1)
      .maybeSingle();

    if (error || !tokenRow || !tokenRow.refresh_token) {
      console.log("zoho-token: refresh_from_db - no stored refresh token");
      return new Response(
        JSON.stringify({ error: "No stored refresh token found" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const isExpired = tokenRow.expires_at ? new Date(tokenRow.expires_at) < new Date() : true;

    if (!isExpired && tokenRow.access_token) {
      console.log("zoho-token: refresh_from_db - token still valid, returning cached");
      return new Response(
        JSON.stringify({
          access_token: tokenRow.access_token,
          token_type: tokenRow.token_type || "Bearer",
          organization_id: tokenRow.organization_id,
          from_cache: true,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("zoho-token: refresh_from_db - token expired, refreshing...");

    const clientId = Deno.env.get("ZOHO_CLIENT_ID") || "";
    const clientSecret = Deno.env.get("ZOHO_CLIENT_SECRET") || "";

    let effectiveClientId = clientId;
    let effectiveClientSecret = clientSecret;

    if (!effectiveClientId || !effectiveClientSecret) {
      console.log("zoho-token: refresh_from_db - no server-side credentials, will need client to provide them");
      return new Response(
        JSON.stringify({
          error: "needs_client_credentials",
          refresh_token: tokenRow.refresh_token,
          accounts_domain: tokenRow.accounts_domain,
          organization_id: tokenRow.organization_id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const params = new URLSearchParams();
    params.append("grant_type", "refresh_token");
    params.append("client_id", effectiveClientId);
    params.append("client_secret", effectiveClientSecret);
    params.append("refresh_token", tokenRow.refresh_token);

    const accountsDomain = tokenRow.accounts_domain || "accounts.zoho.com";
    const tokenUrl = `https://${accountsDomain}/oauth/v2/token`;
    console.log("zoho-token: refresh_from_db - refreshing at:", tokenUrl);

    const zohoResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const zohoData = await zohoResponse.json();
    console.log("zoho-token: refresh_from_db - response:", JSON.stringify(zohoData));

    if (zohoData.access_token) {
      await storeTokensInDb(zohoData, accountsDomain, tokenRow.organization_id || "");
      return new Response(
        JSON.stringify({
          access_token: zohoData.access_token,
          token_type: zohoData.token_type || "Bearer",
          organization_id: tokenRow.organization_id,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: zohoData.error || "Refresh failed" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.log("zoho-token: refresh_from_db error:", message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
}
