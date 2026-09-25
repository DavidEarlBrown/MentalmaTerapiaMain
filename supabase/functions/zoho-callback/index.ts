import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const code = url.searchParams.get("code");
    const accountsDomain = url.searchParams.get("accounts-server") || "accounts.zoho.com";
    const state = url.searchParams.get("state") || "";

    console.log("zoho-callback: received callback with code:", code ? "present" : "missing");
    console.log("zoho-callback: accounts domain:", accountsDomain);
    console.log("zoho-callback: state:", state);

    if (!code) {
      const error = url.searchParams.get("error");
      console.log("zoho-callback: no code received, error:", error);
      return buildRedirectResponse(state, false, error || "No authorization code received");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const { data: existingTokens } = await supabase
      .from("zoho_tokens")
      .select("id, organization_id")
      .limit(1)
      .maybeSingle();

    const clientId = existingTokens?.organization_id
      ? await getClientCredentials(supabase)
      : null;

    let zohoClientId = "";
    let zohoClientSecret = "";
    let organizationId = "";
    let redirectUri = "";

    if (state) {
      try {
        const stateData = JSON.parse(atob(state));
        zohoClientId = stateData.client_id || "";
        zohoClientSecret = stateData.client_secret || "";
        organizationId = stateData.organization_id || "";
        redirectUri = stateData.redirect_uri || "";
        console.log("zoho-callback: parsed state data, org:", organizationId);
      } catch (e) {
        console.log("zoho-callback: failed to parse state:", e);
      }
    }

    if (!zohoClientId || !zohoClientSecret) {
      if (clientId) {
        zohoClientId = clientId.client_id;
        zohoClientSecret = clientId.client_secret;
        organizationId = organizationId || clientId.organization_id;
      } else {
        return buildRedirectResponse(state, false, "Missing client credentials");
      }
    }

    const params = new URLSearchParams();
    params.append("grant_type", "authorization_code");
    params.append("client_id", zohoClientId);
    params.append("client_secret", zohoClientSecret);
    params.append("code", code);
    if (redirectUri) {
      params.append("redirect_uri", redirectUri);
    }

    const tokenUrl = `https://${accountsDomain}/oauth/v2/token`;
    console.log("zoho-callback: exchanging code at:", tokenUrl);

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    });

    const tokenData = await tokenResponse.json();
    console.log("zoho-callback: token response status:", tokenResponse.status);
    console.log("zoho-callback: token response:", JSON.stringify(tokenData));

    if (tokenData.error) {
      return buildRedirectResponse(state, false, `Token exchange failed: ${tokenData.error}`);
    }

    if (!tokenData.access_token) {
      return buildRedirectResponse(state, false, "No access token received from Zoho");
    }

    const expiresAt = tokenData.expires_in
      ? new Date(Date.now() + tokenData.expires_in * 1000).toISOString()
      : null;

    const tokenRow = {
      access_token: tokenData.access_token,
      refresh_token: tokenData.refresh_token || "",
      token_type: tokenData.token_type || "Bearer",
      expires_at: expiresAt,
      accounts_domain: accountsDomain,
      organization_id: organizationId,
      updated_at: new Date().toISOString(),
    };

    if (existingTokens?.id) {
      const { error: updateError } = await supabase
        .from("zoho_tokens")
        .update(tokenRow)
        .eq("id", existingTokens.id);

      if (updateError) {
        console.log("zoho-callback: error updating tokens:", updateError);
        return buildRedirectResponse(state, false, "Failed to store tokens");
      }
      console.log("zoho-callback: updated existing token row");
    } else {
      const { error: insertError } = await supabase
        .from("zoho_tokens")
        .insert(tokenRow);

      if (insertError) {
        console.log("zoho-callback: error inserting tokens:", insertError);
        return buildRedirectResponse(state, false, "Failed to store tokens");
      }
      console.log("zoho-callback: inserted new token row");
    }

    return buildRedirectResponse(state, true, "Zoho connected successfully");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.log("zoho-callback: error:", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

async function getClientCredentials(supabase: ReturnType<typeof createClient>) {
  const { data } = await supabase
    .from("zoho_tokens")
    .select("organization_id")
    .limit(1)
    .maybeSingle();

  return data ? { client_id: "", client_secret: "", organization_id: data.organization_id } : null;
}

function buildRedirectResponse(state: string, success: boolean, message: string): Response {
  let appUrl = "";
  try {
    if (state) {
      const stateData = JSON.parse(atob(state));
      appUrl = stateData.app_url || "";
    }
  } catch {
    console.log("zoho-callback: could not parse app_url from state");
  }

  if (!appUrl) {
    const html = `<!DOCTYPE html><html><body>
      <h2>${success ? "Success" : "Error"}</h2>
      <p>${message}</p>
      <p>You can close this window.</p>
      <script>
        if (window.opener) {
          window.opener.postMessage({ type: 'zoho-oauth-callback', success: ${success}, message: '${message.replace(/'/g, "\\'")}' }, '*');
          setTimeout(() => window.close(), 2000);
        }
      </script>
    </body></html>`;

    return new Response(html, {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
  }

  const separator = appUrl.includes("?") ? "&" : "?";
  const redirectUrl = `${appUrl}${separator}zoho_connected=${success}&zoho_message=${encodeURIComponent(message)}`;

  return new Response(null, {
    status: 302,
    headers: { Location: redirectUrl },
  });
}
