# Google Refresh Token Generator

This application includes a built-in tool to generate Google OAuth refresh tokens needed for Google Calendar and Google Meet integration.

## How to Use

### 1. Access the Token Generator

1. Sign in as an **Administrator**
2. Open the hamburger menu (top-left corner)
3. Click on **"Generate Google Token"** (only visible to administrators)

### 2. Generate the Token

1. The tool will explain what permissions are needed:
   - Manage Google Calendar events
   - Create Google Meet meetings

2. Click **"Start Google Authorization"**

3. You'll be redirected to Google's OAuth consent screen

4. Sign in with your Google account (if not already signed in)

5. Review and accept the requested permissions

6. You'll be redirected back to the application with your refresh token

### 3. Save the Token

1. The refresh token will be displayed in a text area

2. Click **"Copy Complete .env Line"** to copy the entire line

3. Open your `.env` file in the project root

4. Paste the line (it will look like):
   ```
   GOOGLE_REFRESH_TOKEN=your_long_token_here
   ```

5. Save the `.env` file

6. **Restart your development server** for the changes to take effect

## Important Notes

### Security
- **Never commit your refresh token to version control**
- Keep your `.env` file in `.gitignore`
- Treat the refresh token like a password

### Token Expiration
- Refresh tokens generally don't expire unless:
  - You revoke access in your Google account
  - The token hasn't been used for 6 months
  - You change your Google account password

### Troubleshooting

#### "No refresh token received" error
This can happen if you've already authorized the application before. To fix:
1. Visit [Google Account Permissions](https://myaccount.google.com/permissions)
2. Find your application
3. Click "Remove access"
4. Try generating the token again

#### Missing credentials error
Make sure these environment variables are set in your `.env` file:
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `VITE_GOOGLE_CLIENT_ID` (same value as GOOGLE_CLIENT_ID)
- `VITE_GOOGLE_CLIENT_SECRET` (same value as GOOGLE_CLIENT_SECRET)

## Required Scopes

The token generator requests these Google API scopes:
- `https://www.googleapis.com/auth/calendar` - Full calendar access
- `https://www.googleapis.com/auth/calendar.events` - Calendar events
- `https://www.googleapis.com/auth/meetings.space.created` - Create Google Meet meetings

## OAuth2 Flow

The tool implements the standard OAuth2 authorization code flow:
1. User is redirected to Google's authorization URL
2. User consents to the requested permissions
3. Google redirects back with an authorization code
4. The code is exchanged for tokens (access token + refresh token)
5. The refresh token is displayed to the user

## Support

If you encounter issues:
1. Check that your Google Cloud Project has the required APIs enabled:
   - Google Calendar API
   - Google Meet API (if using Meet)
2. Verify your OAuth2 credentials are correct
3. Ensure the redirect URI in Google Cloud Console matches your application URL
