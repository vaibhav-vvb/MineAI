/// <reference lib="deno.ns" />

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* -------------------- CORS -------------------- */
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/* -------------------- EMBEDDINGS (UNCHANGED) -------------------- */
async function generateEmbedding(text: string): Promise<number[]> {
  const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
  if (!GEMINI_API_KEY) return [];

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1/models/text-embedding-004:embedContent?key=${GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts: [{ text }] },
      }),
    }
  );

  if (!response.ok) return [];
  const data = await response.json();
  return data.embedding?.values ?? [];
}

/* -------------------- RAG CONTEXT -------------------- */
async function retrieveContext(
  supabase: any,
  queryEmbedding: number[],
  matchThreshold = 0.7,
  matchCount = 5
) {
  if (!queryEmbedding.length) return [];

  const { data } = await supabase.rpc("match_document_chunks", {
    query_embedding: `[${queryEmbedding.join(",")}]`,
    match_threshold: matchThreshold,
    match_count: matchCount,
  });

  return data ?? [];
}

function buildContextString(chunks: any[]): string {
  if (!chunks.length) return "";
  return `
--- RELEVANT CONTEXT ---
${chunks.map((c: any) => c.content).join("\n\n")}
--- END CONTEXT ---
`;
}

/* -------------------- MAIN HANDLER -------------------- */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    /* ---------- ENV ---------- */
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
    const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY");
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");

    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !OPENROUTER_API_KEY) {
      throw new Error("Missing environment variables");
    }

    /* ---------- AUTH ---------- */
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Invalid JWT" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });

    const { data: { user } } = await supabaseClient.auth.getUser();
    if (!user) {
      return new Response(
        JSON.stringify({ error: "Invalid JWT" }),
        { status: 401, headers: corsHeaders }
      );
    }

    /* ---------- REQUEST ---------- */
    const { messages, conversationId } = await req.json();
    const userMessage = messages.filter((m: any) => m.role === "user").pop();

    /* ---------- CONVERSATION MEMORY ---------- */
let conversationHistory: any[] = [];

if (conversationId) {
  const { data: history } = await supabaseClient
    .from("messages")
    .select("role, content")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(8); // last 8 messages only

  conversationHistory = history || [];
}

    /* ---------- RAG ---------- */
    let context = "";
    if (SUPABASE_SERVICE_ROLE_KEY && userMessage) {
      const serviceClient = createClient(
        SUPABASE_URL,
        SUPABASE_SERVICE_ROLE_KEY
      );
      const embedding = await generateEmbedding(userMessage.content);
      const chunks = await retrieveContext(serviceClient, embedding);
      context = buildContextString(chunks);
    }

    /* ---------- SYSTEM PROMPT ---------- */
const systemPrompt = `
You are MineAI, an expert assistant specialized in the MINING DOMAIN.

Your scope includes ALL mining-related topics, such as:
- Types of mining (opencast, underground, placer, in-situ, etc.)
- Types of mines and minerals (coal, iron ore, bauxite, limestone, etc.)
- Major mines and mining regions in India
- Mining processes and basics
- Mine safety principles and DGMS standards
- Environmental aspects of mining
- Indian mining laws and regulations
- MMDR Act, Mines Act, DGMS rules
- Environmental compliance (EIA, Forest, Wildlife)
- Royalty, DMF, NMET concepts
- Mining-related labor welfare

Your expertise covers:
- Mines Act, 1952 and MMDR Act with all amendments
- Mineral Concession Rules and Auction procedures
- DGMS safety regulations and technical circulars
- Environmental laws (EIA, Forest Conservation, Wildlife Protection)
- Royalty, DMF, NMET calculations and financial requirements
- Mining accounting standards (Ind AS 106)
- State-specific mining policies and rules
- Labor laws and worker welfare regulations

Guidelines:
- When context from the knowledge base is provided, use it as the PRIMARY source for your answer
- Always cite the source document name, section, and page number when referencing information from the context
- Format citations like: "According to [Document Name], Section X (Page Y)..."
- Provide accurate, trustworthy answers based on official acts, rules, notifications, and guidelines
- Use simple, clear language while explaining complex regulatory requirements
- If the provided context doesn't contain relevant information, clearly state that and provide general guidance
- If you lack sufficient legal context, clearly state "Insufficient legal context to provide a definitive answer"
- Be helpful and educational while maintaining legal accuracy
- Support queries in English and can explain concepts in simple terms

LANGUAGE & COMMUNICATION RULES:

1. Default language:
   - Respond in ENGLISH unless the user uses or requests another language.

2. If the user asks in an Indian language (Hindi, Tamil, Telugu, Marathi, Bengali, etc.):
   - Respond in the SAME language.

3. If the user explicitly says:
   - "Explain in Hindi / Tamil / Telugu / Marathi / Bengali / Gujarati / Kannada / Malayalam / Punjabi / Odia / Urdu"
   → Answer the SAME mining question in that language.

MINING QUESTION HANDLING:

1. If the user greets you (hi, hello, good morning):
   - Respond politely
   - Introduce yourself as MineAI
   - Invite mining-related questions

2. If the user asks a GENERAL mining question:
   - Answer clearly in SIMPLE language
   - No legal citation required unless relevant
   - Use examples where helpful

3. If the user asks a LEGAL or REGULATORY mining question:
   - Use the provided RAG context as the PRIMARY source
   - Cite Acts, Rules, Sections, Page Numbers when available
   - Do NOT hallucinate laws

4. If the question is NOT related to mining:
   - Respond ONLY with:
     "I can only answer questions related to mining and the mining industry."

5. If no relevant mining information is found:
   - Say:
     "No mining-related information found for this query."

STRICT CONSTRAINTS:
- Never answer non-mining topics (coding, politics, entertainment, medical, etc.)
- Do not hallucinate legal sections or rules
- Keep explanations simple, accurate, and educational

${context}
`;


    /* ---------- OPENROUTER CHAT (FINAL FIX) ---------- */

    const openRouterMessages = [
  { role: "system", content: systemPrompt },

  // previous conversation messages (memory)
  ...conversationHistory.map((msg: any) => ({
    role: msg.role,
    content: msg.content,
  })),

  // current user message
  { role: "user", content: userMessage.content },
];

    const aiResponse = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-3.5-turbo",
          // messages: [
          //   { role: "system", content: systemPrompt },
          //   { role: "user", content: userMessage.content },
          // ],
          messages: openRouterMessages,
          temperature: 0.2,
        }),
      }
    );

    if (!aiResponse.ok) {
      throw new Error(await aiResponse.text());
    }

    const aiResult = await aiResponse.json();
    const answer =
      aiResult.choices?.[0]?.message?.content ??
      "Unable to generate response.";

    /* ---------- SAVE ---------- */
    if (conversationId) {
      await supabaseClient.from("messages").insert([
        { conversation_id: conversationId, role: "user", content: userMessage.content },
        { conversation_id: conversationId, role: "assistant", content: answer },
      ]);
    }

    return new Response(JSON.stringify({ answer }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("Edge Function Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: corsHeaders }
    );
  }
});
