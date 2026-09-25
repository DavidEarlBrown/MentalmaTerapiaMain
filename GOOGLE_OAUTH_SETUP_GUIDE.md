# Google OAuth Setup Guide for Calendar Integration

This guide explains how to configure Google OAuth credentials to enable Google Calendar integration with automatic Google Meet and Zoom session scheduling.

## Prerequisites

- A Google account with access to Google Cloud Console
- Admin access to your Supabase project

## Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click on the project dropdown at the top
3. Click "New Project"
4. Enter a project name (e.g., "PsyConnect Calendar")
5. Click "Create"

## Step 2: Enable Google Calendar API

1. In your Google Cloud project, navigate to "APIs & Services" > "Library"
2. Search for "Google Calendar API"
3. Click on "Google Calendar API"
4. Click "Enable"

## Step 3: Configure OAuth Consent Screen

1. Navigate to "APIs & Services" > "OAuth consent screen"
2. Select "External" user type (or "Internal" if using Google Workspace)
3. Click "Create"
4. Fill in the required information:
   - **App name**: PsyConnect (or your app name)
   - **User support email**: Your email address
   - **Developer contact email**: Your email address
5. Click "Save and Continue"
6. On the Scopes page, click "Add or Remove Scopes"
7. Add these scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
8. Click "Update" and then "Save and Continue"
9. Add test users (your email and any other users who will test)
10. Click "Save and Continue"

## Step 4: Create OAuth 2.0 Credentials

1. Navigate to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select "Web application" as the application type
4. Enter a name (e.g., "PsyConnect Web Client")
5. Add Authorized redirect URIs:
   - `http://localhost:3000` (for local testing)
   - `https://your-production-domain.com` (your production URL)
   - `http://localhost` (for OAuth flow)
6. Click "Create"
7. **IMPORTANT**: Save the displayed credentials:
   - **Client ID**: Copy this value
   - **Client Secret**: Copy this value

## Step 5: Generate Refresh Token

You need to generate a refresh token to allow the application to access Google Calendar on behalf of the service account.

### Option A: Using OAuth Playground (Recommended)

1. Go to [Google OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the gear icon (⚙️) in the top right
3. Check "Use your own OAuth credentials"
4. Enter your Client ID and Client Secret from Step 4
5. Close the configuration
6. In the left panel, find "Calendar API v3"
7. Select these scopes:
   - `https://www.googleapis.com/auth/calendar`
   - `https://www.googleapis.com/auth/calendar.events`
8. Click "Authorize APIs"
9. Sign in with the Google account that will host the calendar
10. Grant the requested permissions
11. Click "Exchange authorization code for tokens"
12. **IMPORTANT**: Copy the "Refresh token" value

### Option B: Manual OAuth Flow

If you prefer a programmatic approach, you can use the following Node.js script:

```javascript
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'http://localhost'
);

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ],
  prompt: 'consent'
});

console.log('Authorize this app by visiting:', authUrl);
// Visit the URL, authorize, and copy the code from the redirect URL

// Exchange code for tokens
const code = 'PASTE_CODE_FROM_REDIRECT_URL_HERE';
oauth2Client.getToken(code, (err, tokens) => {
  if (err) {
    console.error('Error retrieving access token', err);
    return;
  }
  console.log('Refresh Token:', tokens.refresh_token);
});
```

## Step 6: Configure Environment Variables in Supabase

Your Supabase Edge Functions require the following environment variables:

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Navigate to "Project Settings" > "Edge Functions" > "Environment Variables"
4. Add the following secrets:

```bash
GOOGLE_CLIENT_ID=your_client_id_from_step_4
GOOGLE_CLIENT_SECRET=your_client_secret_from_step_4
GOOGLE_REFRESH_TOKEN=your_refresh_token_from_step_5
```

**Note**: The secrets are automatically configured and available to your edge functions.

## Step 7: Test the Integration

1. Build and run your application
2. Navigate to the "                 Sessions" panel in the admin section
3. Select a pending client request
4. Choose either "Google Meet" or "Zoom" as the platform
5. Set a date and time
6. Click "Book Session"
7. Check that:
   - A calendar event is created in Google Calendar
   - Both client and psychologist receive calendar invitations
   - If Google Meet was selected, a Meet link is generated
   - If Zoom was selected, the calendar indicates Zoom will be used
   - Confirmation email is sent to the client

## How It Works

### Google Meet Sessions
- Creates a Google Calendar event with Google Meet conference link
- Automatically generates a unique Meet link
- Sends calendar invitations to both client and psychologist
- Includes meeting link and code in confirmation email

### Zoom Sessions
- Creates a Google Calendar event without a conference link
- Adds a note in the event description indicating Zoom will be used
- Sends calendar invitations as reminders
- Psychologist must provide Zoom link separately before the session

## Troubleshooting

### Error: "Google Meet API not configured"
- Verify all three environment variables are set in Supabase
- Check that the values are correct (no extra spaces)
- Redeploy your edge functions after adding variables

### Error: "Invalid credentials"
- Ensure Client ID and Client Secret are correct
- Verify the refresh token was generated with the correct scopes
- Try regenerating the refresh token

### Calendar events not appearing
- Check that the Google Calendar API is enabled
- Verify the refresh token has not expired
- Ensure the account used has calendar access

### No calendar invitations sent
- Verify the `sendUpdates: "all"` parameter is set in the API call
- Check that client and psychologist email addresses are valid
- Look for emails in spam folders

## Security Best Practices

1. **Never commit credentials to version control**
   - Keep your `.env` file in `.gitignore`
   - Use Supabase secrets for production

2. **Restrict OAuth scopes**
   - Only request calendar-related scopes
   - Don't request unnecessary permissions

3. **Rotate credentials regularly**
   - Generate new Client ID/Secret periodically
   - Update refresh tokens when needed

4. **Monitor API usage**
   - Check Google Cloud Console for quota limits
   - Set up alerts for unusual activity

## Additional Resources

- [Google Calendar API Documentation](https://developers.google.com/calendar/api/v3/reference)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Edge Functions Environment Variables](https://supabase.com/docs/guides/functions/secrets)

## Support

If you encounter issues:
1. Check the Supabase edge function logs for error messages
2. Verify all API calls are working in Google Cloud Console
3. Review the Google Calendar API quota limits
4. Test OAuth credentials using OAuth Playground
