import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { google } from "npm:googleapis@140";
import { createClient } from "npm:@supabase/supabase-js@2.76.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CreateMeetingRequest {
  action?: string;
  client_email: string;
  meeting_date: string;
  client_name: string;
  professional_name?: string;
  professional_email?: string;
  booking_user_email?: string;
  booking_user_name?: string;
  specialty?: string;
  description: string;
  platform?: 'google' | 'zoom';
}

interface StoreTokenRequest {
  action: 'store-token';
  refresh_token: string;
  access_token?: string;
  expires_in?: number;
  client_id?: string;
  client_secret?: string;
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  return createClient(supabaseUrl, serviceRoleKey);
}

async function handleStoreToken(body: StoreTokenRequest): Promise<Response> {
  if (!body.refresh_token) {
    return new Response(
      JSON.stringify({ error: "refresh_token is required" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = getSupabaseClient();
  const expiresAt = body.expires_in
    ? new Date(Date.now() + body.expires_in * 1000).toISOString()
    : null;

  const tokenData: Record<string, unknown> = {
    refresh_token: body.refresh_token,
    access_token: body.access_token || '',
    expires_at: expiresAt,
    updated_at: new Date().toISOString(),
  };

  if (body.client_id) tokenData.client_id = body.client_id;
  if (body.client_secret) tokenData.client_secret = body.client_secret;

  const { data: existing } = await supabase
    .from("google_tokens")
    .select("id")
    .limit(1)
    .maybeSingle();

  let result;
  if (existing?.id) {
    result = await supabase.from("google_tokens").update(tokenData).eq("id", existing.id);
  } else {
    result = await supabase.from("google_tokens").insert(tokenData);
  }

  if (result.error) {
    console.error("google-meet: failed to store token:", result.error);
    return new Response(
      JSON.stringify({ error: "Failed to store token", details: result.error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  console.log("google-meet: token stored successfully via edge function");
  return new Response(
    JSON.stringify({ success: true }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
  );
}

async function getCredentials(): Promise<{ refreshToken: string; clientId: string; clientSecret: string; source: string } | null> {
  const supabase = getSupabaseClient();
  const { data: tokenRow, error } = await supabase
    .from("google_tokens")
    .select("refresh_token, client_id, client_secret")
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("google-meet: error reading google_tokens table:", error.message);
  }

  const envClientId = Deno.env.get("GOOGLE_CLIENT_ID") || "";
  const envClientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET") || "";

  const clientId = tokenRow?.client_id || envClientId;
  const clientSecret = tokenRow?.client_secret || envClientSecret;

  if (!clientId || !clientSecret) {
    console.error("google-meet: no GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET found in DB or env secrets");
    return null;
  }

  if (tokenRow?.refresh_token) {
    const source = tokenRow?.client_id ? "database" : "database+env";
    console.log("google-meet: using refresh token from database, client credentials from", tokenRow?.client_id ? "database" : "env");
    return { refreshToken: tokenRow.refresh_token, clientId, clientSecret, source };
  }

  const envRefreshToken = Deno.env.get("GOOGLE_REFRESH_TOKEN");
  if (envRefreshToken) {
    console.log("google-meet: using refresh token from GOOGLE_REFRESH_TOKEN env var");
    return { refreshToken: envRefreshToken, clientId, clientSecret, source: "env" };
  }

  console.error("google-meet: no refresh token found in database or env vars");
  return null;
}

async function getFreshAccessToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string
): Promise<string | null> {
  console.log("google-meet: requesting fresh access token from Google...");

  const params = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  const data = await response.json();
  console.log("google-meet: token response status:", response.status);

  if (!data.access_token) {
    console.error("google-meet: failed to get access token:", data.error, data.error_description);
    return null;
  }

  const supabase = getSupabaseClient();
  const expiresAt = data.expires_in
    ? new Date(Date.now() + data.expires_in * 1000).toISOString()
    : null;

  const { data: existing } = await supabase
    .from("google_tokens")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await supabase.from("google_tokens").update({
      access_token: data.access_token,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    }).eq("id", existing.id);
  } else {
    await supabase.from("google_tokens").insert({
      access_token: data.access_token,
      refresh_token: refreshToken,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    });
  }

  console.log("google-meet: got fresh access token, stored in db");
  return data.access_token;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const body = await req.json();

    if (body.action === 'store-token') {
      return await handleStoreToken(body as StoreTokenRequest);
    }

    if (body.action === 'cancel-event') {
      const { calendar_event_id } = body;
      if (!calendar_event_id) {
        return new Response(
          JSON.stringify({ error: "calendar_event_id is required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const creds = await getCredentials();
      if (!creds) {
        return new Response(
          JSON.stringify({ error: "Google Calendar not configured", setupRequired: true }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const accessToken = await getFreshAccessToken(creds.clientId, creds.clientSecret, creds.refreshToken);
      if (!accessToken) {
        return new Response(
          JSON.stringify({ error: "Failed to refresh Google access token", setupRequired: true }),
          { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const oauth2Client = new google.auth.OAuth2(creds.clientId, creds.clientSecret, "http://localhost");
      oauth2Client.setCredentials({ access_token: accessToken });
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });

      try {
        await calendar.events.delete({
          calendarId: "primary",
          eventId: calendar_event_id,
          sendUpdates: "all",
        });
        console.log("google-meet: calendar event deleted:", calendar_event_id);
        return new Response(
          JSON.stringify({ success: true, cancelled: true }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (deleteError: any) {
        const status = deleteError?.response?.status;
        // 404 means already deleted or never existed — treat as success
        if (status === 404 || status === 410) {
          return new Response(
            JSON.stringify({ success: true, cancelled: false, reason: "event_not_found" }),
            { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        console.error("google-meet: error deleting event:", deleteError?.message);
        return new Response(
          JSON.stringify({ error: "Failed to cancel calendar event", details: deleteError?.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const {
      client_email,
      meeting_date,
      client_name,
      professional_name,
      professional_email,
      booking_user_email,
      booking_user_name,
      specialty,
      description,
      platform
    } = body as CreateMeetingRequest;

    if (!client_email || !meeting_date) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: client_email and meeting_date" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const creds = await getCredentials();

    if (!creds) {
      return new Response(
        JSON.stringify({
          error: "Google Meet API not configured. Please set up OAuth credentials via the Google Token Generator.",
          setupRequired: true
        }),
        {
          status: 503,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const freshAccessToken = await getFreshAccessToken(
      creds.clientId,
      creds.clientSecret,
      creds.refreshToken
    );

    if (!freshAccessToken) {
      return new Response(
        JSON.stringify({
          error: `Failed to refresh Google access token (source: ${creds.source}). The refresh token may have been revoked. Please re-authorize via Google Token Generator.`,
          setupRequired: true,
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const oauth2Client = new google.auth.OAuth2(
      creds.clientId,
      creds.clientSecret,
      "http://localhost"
    );
    oauth2Client.setCredentials({
      access_token: freshAccessToken,
    });

    const calendar = google.calendar({ version: "v3", auth: oauth2Client });

    const meetingDateTime = new Date(meeting_date);
    const selectedPlatform = platform || 'google';
    const platformName = selectedPlatform === 'zoom' ? 'Zoom' : 'Google Meet';
    const meetingTitle = `Psychology Session - ${client_name}${specialty ? ` (${specialty})` : ''}`;

    const attendees = [
      { email: client_email, displayName: client_name },
    ];

    if (professional_email) {
      attendees.push({ email: professional_email, displayName: professional_name || 'Professional' });
    }

    if (booking_user_email && booking_user_email !== client_email && booking_user_email !== professional_email) {
      attendees.push({ email: booking_user_email, displayName: booking_user_name || 'Booking Coordinator' });
    }

    let eventDescription = `Psychology consultation session scheduled via PsyConnect platform.\n\n`;
    eventDescription += `Platform: ${platformName}\n`;
    eventDescription += `Client: ${client_name} (${client_email})\n`;
    if (professional_name) {
      eventDescription += `Professional: ${professional_name}${professional_email ? ` (${professional_email})` : ''}\n`;
    }
    if (specialty) {
      eventDescription += `Specialty: ${specialty}\n`;
    }
    if (booking_user_name || booking_user_email) {
      eventDescription += `Booked by: ${booking_user_name || ''}${booking_user_email ? ` (${booking_user_email})` : ''}\n`;
    }
    eventDescription += `\nDescription:\n${description}`;

    if (selectedPlatform === 'zoom') {
      eventDescription += `\n\nNote: This session will be conducted via Zoom. The meeting host will provide the Zoom link before the session.`;
    }

    const event: Record<string, unknown> = {
      summary: meetingTitle,
      description: eventDescription,
      start: {
        dateTime: meetingDateTime.toISOString(),
        timeZone: "UTC",
      },
      end: {
        dateTime: new Date(meetingDateTime.getTime() + 60 * 60 * 1000).toISOString(),
        timeZone: "UTC",
      },
      attendees: attendees,
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 24 * 60 },
          { method: "popup", minutes: 30 },
        ],
      },
    };

    if (selectedPlatform === 'google') {
      event.conferenceData = {
        createRequest: {
          requestId: crypto.randomUUID(),
          conferenceSolutionKey: {
            type: "hangoutsMeet",
          },
        },
      };
    }

    const response = await calendar.events.insert({
      calendarId: "primary",
      conferenceDataVersion: 1,
      sendUpdates: "all",
      requestBody: event,
    });

    const eventData = response.data;
    const meetingLink = eventData.conferenceData?.entryPoints?.find(
      (ep: any) => ep.entryPointType === "video"
    )?.uri;
    const meetingCode = eventData.conferenceData?.conferenceId;

    return new Response(
      JSON.stringify({
        success: true,
        meetingUri: meetingLink || eventData.hangoutLink || null,
        meetingCode: meetingCode || null,
        calendarEventId: eventData.id,
        calendarEventLink: eventData.htmlLink,
        calendarEventCreated: true,
        platform: selectedPlatform,
        platformName: platformName,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    let errorDetails = "Unknown error";
    let statusCode = 500;

    try {
      const responseData = error?.response?.data;
      const googleError = responseData?.error;

      if (typeof googleError === 'object' && googleError !== null) {
        const code = googleError.code || responseData?.code || error?.code;
        const message = googleError.message || googleError.status || responseData?.error_description;
        const errors = googleError.errors || [];
        errorDetails = `${code || 'unknown'} ${message || 'unknown'} - ${JSON.stringify(errors)}`;
        statusCode = typeof code === 'number' ? code : (error?.response?.status || 500);
      } else if (typeof googleError === 'string') {
        errorDetails = `${googleError} - ${responseData?.error_description || ''}`;
        statusCode = error?.response?.status || 500;
      } else if (error?.message) {
        errorDetails = error.message;
      }

      if (error?.status) {
        statusCode = error.status;
      }
    } catch {
      errorDetails = error?.message || String(error);
    }

    console.error("Error in google-meet function:", errorDetails, "| Raw:", JSON.stringify(error?.response?.data || error?.message || error));

    return new Response(
      JSON.stringify({
        error: "Google Calendar API error",
        details: errorDetails,
      }),
      {
        status: statusCode,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
