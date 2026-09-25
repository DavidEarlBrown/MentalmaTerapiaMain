# MarI Service Refactoring Summary

## What Was Done

The `ask-mari` Supabase Edge Function has been refactored to be accessible as a reusable service throughout the application, rather than being tightly coupled to the Supabase functions directory.

## Changes Made

### 1. Created Service Layer (`src/lib/mariService.ts`)
A TypeScript service that provides clean, typed functions to interact with the MarI Edge Function:
- `askMari()` - Basic function to ask any question
- `askMariForPsychologistRecommendation()` - Get psychologist recommendations
- `askMariForGeneralAdvice()` - Get general mental health advice
- `askMariAboutSpecialty()` - Get specialty recommendations

### 2. Created React Hook (`src/hooks/useMari.ts`)
A custom React hook that wraps the service layer and provides:
- Loading state management
- Error handling
- Response state
- Easy-to-use methods for all service functions

### 3. Created Reusable Component (`src/components/MariAssistant.tsx`)
A ready-to-use UI component that can be dropped into any page:
- Accepts psychologists and specialties as props
- Provides multiple action buttons based on context
- Beautiful, responsive UI
- Fully integrated with language context

### 4. Added Styling (`src/App.css`)
Complete styling for the MarI Assistant component with:
- Clean card-based layout
- Gradient buttons with hover effects
- Error and response display areas
- Mobile-responsive design

### 5. Created Documentation (`MARI_SERVICE.md`)
Comprehensive documentation including:
- Architecture overview
- Usage examples for all three layers (service, hook, component)
- API reference
- Configuration requirements
- Integration examples

## Benefits

### Before (Supabase-only)
```typescript
// Could only call from edge functions or direct API calls
const response = await fetch(`${supabaseUrl}/functions/v1/ask-mari`, {
  method: 'POST',
  headers: { ... },
  body: JSON.stringify({ prompt: "..." })
});
```

### After (Reusable Service)
```typescript
// Option 1: Simple service call
import { askMari } from './lib/mariService';
const response = await askMari({ prompt: "..." });

// Option 2: React hook with state management
import { useMari } from './hooks/useMari';
const { ask, loading, response, error } = useMari();
await ask("...");

// Option 3: Drop-in component
import { MariAssistant } from './components/MariAssistant';
<MariAssistant psychologists={psychologists} />
```

## File Structure

```
project/
├── supabase/
│   └── functions/
│       └── ask-mari/
│           └── index.ts          # Edge Function (unchanged)
│
├── src/
│   ├── lib/
│   │   └── mariService.ts        # NEW: Service layer
│   ├── hooks/
│   │   └── useMari.ts            # NEW: React hook
│   ├── components/
│   │   ├── MariAssistant.tsx     # NEW: UI component
│   │   ├── AboutUs.tsx           # NEW: About Us page
│   │   └── Help.tsx              # NEW: Help page
│   └── App.css                   # UPDATED: Added MarI styles
│
└── MARI_SERVICE.md               # NEW: Documentation
```

## Usage Examples

### In a Booking Form
```typescript
import { MariAssistant } from '../components/MariAssistant';

function BookingForm() {
  return (
    <div>
      <h2>Need help choosing?</h2>
      <MariAssistant psychologists={psychologists} />
      {/* Rest of form */}
    </div>
  );
}
```

### In a Help Section
```typescript
import { useMari } from '../hooks/useMari';

function HelpSection() {
  const { askForGeneralAdvice, loading, response } = useMari();

  return (
    <div>
      <button onClick={() => askForGeneralAdvice("How do I know if I need therapy?")}>
        Get Advice
      </button>
      {response && <p>{response}</p>}
    </div>
  );
}
```

### Direct API Call
```typescript
import { askMariAboutSpecialty } from '../lib/mariService';

const recommendation = await askMariAboutSpecialty(
  "I've been feeling anxious in crowds",
  ["Anxiety", "Depression", "Trauma"]
);
```

## Key Advantages

1. **Reusability** - Can be used anywhere in the application
2. **Type Safety** - Full TypeScript support with proper types
3. **Maintainability** - Clear separation of concerns
4. **Testability** - Easy to mock and test each layer
5. **Developer Experience** - Multiple ways to use based on needs
6. **Consistency** - Centralized error handling and state management

## Next Steps (Optional Enhancements)

1. Add caching layer for common questions
2. Implement streaming responses for longer answers
3. Add conversation history tracking
4. Create additional specialized functions for specific use cases
5. Add analytics/telemetry for MarI usage
