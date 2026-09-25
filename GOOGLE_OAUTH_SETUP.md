# Google OAuth Setup Guide

## Overview

Google Sign-In has been added to the sign-in screen using Supabase Auth. Users can now sign in with their Google account instead of manually entering credentials.

## Setup Required

To enable Google OAuth, you need to configure it in your Supabase project:

### 1. Enable Google Provider in Supabase

1. Go to your Supabase Dashboard: https://supabase.com/dashboard
2. Select your project
3. Navigate to **Authentication** → **Providers**
4. Find **Google** in the list
5. Toggle it to **Enabled**

### 2. Configure Google OAuth Credentials

You have two options:

#### Option A: Use Supabase's Default Credentials (Easiest)

For development and testing, you can use Supabase's default Google OAuth credentials:

1. In the Google provider settings, leave the default credentials
2. Click **Save**

**Note:** This is only for development. For production, use your own credentials.

#### Option B: Use Your Own Google OAuth Credentials (Production)

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API:
   - Go to **APIs & Services** → **Library**
   - Search for "Google+ API"
   - Click **Enable**

4. Create OAuth 2.0 Credentials:
   - Go to **APIs & Services** → **Credentials**
   - Click **Create Credentials** → **OAuth client ID**
   - Choose **Web application**
   - Add authorized redirect URIs:
     ```
     https://<your-project-ref>.supabase.co/auth/v1/callback
     ```
   - Click **Create**

5. Copy the **Client ID** and **Client Secret**

6. Back in Supabase Dashboard:
   - Navigate to **Authentication** → **Providers** → **Google**
   - Paste your **Client ID**
   - Paste your **Client Secret**
   - Click **Save**

### 3. Configure Site URL

1. In Supabase Dashboard, go to **Authentication** → **URL Configuration**
2. Set **Site URL** to your application URL:
   - Development: `http://localhost:5173` (or your dev server port)
   - Production: `https://yourdomain.com`
3. Add redirect URLs if needed

## How It Works

### User Flow

1. **New User (First Time)**:
   - User clicks "Sign in with Google"
   - Redirected to Google for authentication
   - After approval, returns to your app
   - System checks if user exists in database
   - If not, shows registration form with pre-filled data from Google
   - User completes registration
   - User is signed in

2. **Existing User**:
   - User clicks "Sign in with Google"
   - Redirected to Google for authentication
   - After approval, returns to your app
   - System finds existing user in database
   - User is automatically signed in

### Technical Implementation

```typescript
// Sign in with Google
const { error } = await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: window.location.origin,
  },
});

// Listen for auth state changes
supabase.auth.onAuthStateChange((_event, session) => {
  if (session?.user) {
    handleGoogleSignIn(session);
  }
});
```

### Data Mapping

When a user signs in with Google, the following data is extracted:

| Google Data | Mapped To |
|-------------|-----------|
| email | email, username (part before @) |
| name | full_name |
| phone | phone |
| profile_picture | (available in session.user.user_metadata) |

## Security

- OAuth tokens are managed by Supabase Auth
- User sessions are secure and encrypted
- Google credentials are never stored in your database
- Only email and profile data is retrieved

## Testing

1. Start your development server
2. Navigate to the sign-in page
3. Click "Sign in with Google"
4. You should be redirected to Google
5. After signing in with Google, you'll be redirected back
6. Check that the form is either:
   - Pre-filled with your Google data (new user)
   - Auto-submitted (existing user)

## Troubleshooting

### "Invalid redirect URI" Error

**Cause:** The redirect URI in Google Console doesn't match your Supabase callback URL

**Solution:**
1. Check your Supabase project URL
2. Add the exact callback URL to Google Console:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```

### "Provider not enabled" Error

**Cause:** Google provider is not enabled in Supabase

**Solution:**
1. Go to Supabase Dashboard → Authentication → Providers
2. Enable Google provider
3. Save changes

### Sign-in Button Does Nothing

**Cause:** Missing Supabase environment variables

**Solution:**
1. Check that `.env` file contains:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_anon_key
   ```
2. Restart development server

### User Data Not Appearing

**Cause:** User table lookup failing

**Solution:**
1. Check that users table exists in Supabase
2. Verify RLS policies allow reading user data
3. Check browser console for errors

## Files Modified

1. **src/components/SignInForm.tsx** - Added Google OAuth button and logic
2. **src/lib/supabaseClient.ts** - Created Supabase client instance
3. **src/App.css** - Added Google button and divider styles

## Additional Features

### Session Persistence

Sessions are automatically persisted in localStorage by Supabase. Users remain signed in across page refreshes.

### Sign Out

To add sign out functionality:

```typescript
const signOut = async () => {
  const { error } = await supabase.auth.signOut();
  if (error) console.error('Error signing out:', error);
};
```

### Access User Data

```typescript
const { data: { user } } = await supabase.auth.getUser();
console.log(user); // Contains email, metadata, etc.
```

## Best Practices

1. **Production**: Always use your own Google OAuth credentials
2. **Security**: Never commit OAuth secrets to version control
3. **UX**: Show loading states during OAuth flow
4. **Error Handling**: Provide clear error messages to users
5. **Privacy**: Clearly communicate what data is collected from Google

## Next Steps

1. Configure Google OAuth in Supabase Dashboard
2. Test sign-in flow
3. Customize the registration form if needed
4. Add sign-out functionality
5. Consider adding other OAuth providers (GitHub, Facebook, etc.)

## Resources

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Google OAuth Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Supabase Google Auth Guide](https://supabase.com/docs/guides/auth/social-login/auth-google)
