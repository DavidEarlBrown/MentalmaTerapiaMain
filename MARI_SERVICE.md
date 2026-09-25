# MarI AI Assistant Service

The MarI AI Assistant service provides AI-powered recommendations and advice for mental health support. The service is now available as a reusable utility throughout the application.

## Architecture

The MarI service consists of three layers:

1. **Edge Function** (`supabase/functions/ask-mari/index.ts`) - Supabase Edge Function that interfaces with the Gemini API
2. **Service Layer** (`src/lib/mariService.ts`) - Reusable TypeScript functions to call the Edge Function
3. **Hook Layer** (`src/hooks/useMari.ts`) - React hook for easy integration in components
4. **Component Layer** (`src/components/MariAssistant.tsx`) - Ready-to-use UI component

## Usage

### Option 1: Using the React Hook (Recommended)

```typescript
import { useMari } from '../hooks/useMari';

function MyComponent() {
  const { loading, error, response, ask, askForPsychologistRecommendation } = useMari();

  const handleAsk = async () => {
    try {
      const result = await ask("I'm feeling anxious lately");
      console.log(result);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div>
      <button onClick={handleAsk} disabled={loading}>
        Ask MarI
      </button>
      {loading && <p>Loading...</p>}
      {error && <p>Error: {error}</p>}
      {response && <p>{response}</p>}
    </div>
  );
}
```

### Option 2: Using the Service Layer Directly

```typescript
import { askMari, askMariForPsychologistRecommendation } from '../lib/mariService';

// Simple question
const response = await askMari({
  prompt: "What is cognitive behavioral therapy?",
  context: "Provide a brief explanation for someone new to therapy"
});

// Psychologist recommendation
const psychologists = [
  { name: "Dr. Smith", specialty: "Anxiety" },
  { name: "Dr. Jones", specialty: "Depression" }
];

const recommendation = await askMariForPsychologistRecommendation(
  "I've been feeling very anxious in social situations",
  psychologists
);
```

### Option 3: Using the Pre-built Component

```typescript
import { MariAssistant } from '../components/MariAssistant';

function MyPage() {
  const psychologists = [
    { name: "Dr. Smith", specialty: "Anxiety" },
    { name: "Dr. Jones", specialty: "Depression" }
  ];

  return (
    <div>
      <h1>Get Help</h1>
      <MariAssistant psychologists={psychologists} />
    </div>
  );
}
```

## Available Functions

### Service Layer Functions

#### `askMari(request: AskMariRequest): Promise<string>`
Basic function to ask MarI any question.

```typescript
const response = await askMari({
  prompt: "Your question here",
  context: "Optional context to guide the response"
});
```

#### `askMariForPsychologistRecommendation(issue: string, psychologists: Array): Promise<string>`
Get recommendations for which psychologist to see based on an issue.

```typescript
const recommendation = await askMariForPsychologistRecommendation(
  "I'm having trouble sleeping and feeling stressed",
  psychologists
);
```

#### `askMariForGeneralAdvice(question: string): Promise<string>`
Get general mental health advice and guidance.

```typescript
const advice = await askMariForGeneralAdvice(
  "What are some techniques to manage stress?"
);
```

#### `askMariAboutSpecialty(issue: string, specialties: string[]): Promise<string>`
Get recommendations for which specialty would be most appropriate.

```typescript
const specialtyRec = await askMariAboutSpecialty(
  "I've been feeling very sad lately",
  ["Anxiety", "Depression", "Trauma", "Relationships"]
);
```

## Hook API

The `useMari` hook provides:

- `loading: boolean` - Request in progress
- `error: string | null` - Error message if request failed
- `response: string | null` - The AI response
- `ask(prompt, context?)` - Basic ask function
- `askForPsychologistRecommendation(issue, psychologists)` - Get psychologist recommendations
- `askForGeneralAdvice(question)` - Get general advice
- `askAboutSpecialty(issue, specialties)` - Get specialty recommendations
- `reset()` - Clear response and error

## Configuration

The service requires the following environment variables:

- `VITE_SUPABASE_URL` - Your Supabase project URL
- `VITE_SUPABASE_ANON_KEY` - Your Supabase anonymous key
- `GEMINI_API_KEY` - Your Google Gemini API key (configured in Supabase)

## Example: Integration in Booking Flow

```typescript
import { MariAssistant } from '../components/MariAssistant';
import { usePsychologists } from '../hooks/usePsychologists';

function BookingPage() {
  const { psychologists } = usePsychologists();

  return (
    <div>
      <h1>Book a Session</h1>

      <section>
        <h2>Need help choosing?</h2>
        <MariAssistant psychologists={psychologists} />
      </section>

      <section>
        <h2>Available Psychologists</h2>
        {/* Psychologist list */}
      </section>
    </div>
  );
}
```

## Benefits of This Architecture

1. **Reusable**: Can be called from any component or service
2. **Type-safe**: Full TypeScript support
3. **Flexible**: Multiple convenience functions for different use cases
4. **Testable**: Easy to mock and test
5. **Maintainable**: Clear separation of concerns
6. **Scalable**: Easy to add new AI-powered features

## Adding New AI Features

To add a new AI feature, add a function to `src/lib/mariService.ts`:

```typescript
export async function askMariCustomFeature(params: YourParams): Promise<string> {
  const context = "Your custom system prompt here";

  return askMari({
    prompt: params.question,
    context,
  });
}
```

Then optionally add it to the hook in `src/hooks/useMari.ts` for easier React integration.
