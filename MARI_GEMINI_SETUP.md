# MarI Gemini Integration - Setup Guide

## Current Issue

Gemini is not being invoked when using the ClientRequest form with MariAssistant because the **GEMINI_API_KEY is not configured in Supabase's edge function environment**.

## Why It's Not Working

1. **Local .env file** contains `GEMINI_API_KEY` but this is only for local development
2. **Edge functions run on Supabase servers** and need secrets configured separately
3. The edge function is trying to read `Deno.env.get("GEMINI_API_KEY")` but it's not set

## The Fix

You need to configure the GEMINI_API_KEY as a secret in Supabase:

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to your Supabase project dashboard: https://supabase.com/dashboard
2. Navigate to **Edge Functions** → **Settings**
3. Find the **Secrets** section
4. Add a new secret:
   - **Key:** `GEMINI_API_KEY`
   - **Value:** `your_gemini_api_key` (from [Google AI Studio](https://aistudio.google.com/apikey))
5. Click **Save**
6. The edge function will automatically have access to this secret

### Option 2: Via Supabase CLI

```bash
supabase secrets set GEMINI_API_KEY=your_gemini_api_key
```
     
## How to Verify It's Working

After setting the secret:

1. Open your application
2. Go to **Client Info** section
3. Fill in your name and issue
4. Click the AI button next to "Select Specialty" or "Select a Psychologist"
5. Type a question like "I'm feeling anxious"
6. Click "Recommend Specialty" or "Recommend Psychologist"
7. Check the browser console (F12) for any errors
8. You should see a response from MarI

## Technical Flow

```
User fills form
    ↓
Clicks AI button
    ↓
Opens MariAssistant modal
    ↓
User types question
    ↓
Clicks "Recommend" button
    ↓
useMari hook calls mariService.ts
    ↓
mariService calls /functions/v1/ask-mari
    ↓
Edge function reads GEMINI_API_KEY from Supabase secrets
    ↓
Edge function calls Gemini API
    ↓
Response sent back to UI
    ↓
User sees MarI's recommendation
```

## Debugging

The edge function now has console.log statements to help debug:

- "Ask-Mari function invoked"
- "Gemini API Key exists: true/false"
- "Received prompt: ..."
- "Calling Gemini API..."
- "Successfully got response from Gemini"

To view logs:
1. Go to Supabase Dashboard → Edge Functions
2. Click on **ask-mari** function
3. View the **Logs** tab

## Common Errors

### Error: "GEMINI_API_KEY not configured"
**Solution:** The secret is not set in Supabase. Follow the setup steps above.

### Error: "Failed to get response from Gemini API"
**Possible causes:**
- Invalid API key
- API key quota exceeded
- Network issue
- Gemini API endpoint changed

**Solution:** Verify the API key is correct and active in Google AI Studio.

### Error: "Prompt is required"
**Possible causes:**
- Empty question field
- Request body not sent correctly

**Solution:** Ensure you type a question before clicking the button.

## File Structure

```
src/
├── components/
│   ├── MariAssistant.tsx         # React UI component
│   └── ClientRequestForm.tsx     # Form with AI buttons
├── hooks/
│   └── useMari.ts                # React hook for state management
└── lib/
    └── mariService.ts            # API calls to edge function

supabase/
└── functions/
    └── ask-mari/
        └── index.ts              # Edge function (server-side)
```

## Important Notes

1. **Local .env is NOT used by edge functions** - they run on Supabase servers
2. **Secrets are encrypted** and secure in Supabase
3. **Never commit API keys** to git - they're in .env (gitignored)
4. **verifyJWT is false** - allows unauthenticated access (public feature)
5. **CORS headers are configured** - allows browser requests

## Testing Locally

To test edge functions locally with Supabase CLI:

```bash
# Set secrets locally
supabase secrets set GEMINI_API_KEY=your_key_here --env-file .env.local

# Start local Supabase
supabase start

# Serve functions locally
supabase functions serve

# Test the function
curl -X POST http://localhost:54321/functions/v1/ask-mari \
  -H "Content-Type: application/json" \
  -d '{"prompt": "I feel anxious", "context": "test"}'
```

## Next Steps

1. ✅ Set GEMINI_API_KEY in Supabase dashboard
2. ✅ Test the AI buttons in ClientRequest form
3. ✅ Check logs if there are errors
4. ✅ Verify responses are being returned

Once the secret is set, MarI should work perfectly!
