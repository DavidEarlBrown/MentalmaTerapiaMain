import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface RequestBody {
  prompt: string;
  context?: string;
  profession?: { name_en: string; name_es: string; description_en?: string; description_es?: string } | null;
  language?: 'en' | 'es';
}

Deno.serve(async (req: Request) => {
  console.log("Deno.serve:  Ask-Mari function invoked, method:", req.method);
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }
  
  try {
    console.log("getting key");
    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    console.log("Gemini API Key exists:", !!geminiApiKey);

    if (!geminiApiKey) {
      console.error("GEMINI_API_KEY not configured");

      return new Response(
        JSON.stringify({ error: "GEMINI_API_KEY not configured" }),
        {
          status: 500,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const requestText = await req.text();
    console.log("Raw request body:", requestText);

    let requestBody: RequestBody;
    try {
      requestBody = JSON.parse(requestText);
    } catch (parseError) {
      console.error("Failed to parse JSON:", parseError);
      return new Response(
        JSON.stringify({ error: "Invalid JSON in request body" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const { prompt, context, profession, language } = requestBody;
    console.log("Received prompt:", prompt);
    console.log("Prompt type:", typeof prompt);
    console.log("Prompt length:", prompt?.length);
    console.log("Has context:", !!context);
    console.log("Profession:", profession?.name_en);

    if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
      console.error("Invalid or missing prompt. Prompt value:", prompt);

      return new Response(
        JSON.stringify({ error: "Prompt is required and must be a non-empty string" }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const professionName = profession
      ? (language === 'es' ? profession.name_es : profession.name_en)
      : null;
    const professionContext = profession
      ? ` This platform serves ${professionName} professionals exclusively.${profession.description_en ? ` ${profession.description_en}` : ''} Tailor all recommendations to ${professionName} practice.`
      : '';

    const defaultContext = professionName
      ? `You are MarI, an AI assistant helping users select the right ${professionName} professional or specialty for their needs.${professionContext} Provide thoughtful, empathetic recommendations based on the user's description.`
      : "You are MarI, an AI assistant helping users select the right professional or specialty for their mental health needs. Provide thoughtful, empathetic recommendations based on the user's description of their issues.";

    const systemPrompt = context ? `${context}${professionContext}` : defaultContext;

    console.log("Calling Gemini API...");
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiApiKey}`;
    const geminiResponse = await fetch(geminiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              {
                text: `${systemPrompt}\n\nUser question: ${prompt}`,
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 1024,
        },
      }),
    });

    if (!geminiResponse.ok) {
      const errorText = await geminiResponse.text();
      console.error("Gemini API error:", errorText);
      return new Response(
        JSON.stringify({ error: "Failed to get response from Gemini API" }),
        {
          status: geminiResponse.status,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
          },
        }
      );
    }

    const geminiData = await geminiResponse.json();
    const aiResponse = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || "I apologize, but I couldn't generate a response. Please try again.";
    console.log("Successfully got response from Gemini");

    return new Response(
      JSON.stringify({ response: aiResponse }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error("Error in ask-mari function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "An unexpected error occurred" }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});