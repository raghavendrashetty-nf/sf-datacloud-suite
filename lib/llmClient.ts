// Server-side only. Provider-agnostic "free model" caller - auto-selects Gemini (works
// anywhere, incl. Railway) when GEMINI_API_KEY is set, otherwise falls back to local Ollama
// for dev. Extracted from the Solution Recommender's original analyze route so any feature
// needing a structured-JSON LLM call (Solution Recommender, Org Scanner review, etc.) can
// reuse the exact same, already-debugged provider logic instead of duplicating it.
import { GoogleGenAI, ApiError } from '@google/genai';

export type LLMResult = { ok: true; text: string } | { ok: false; error: string; status: number };

async function callGemini(systemPrompt: string, userPrompt: string, schema: object): Promise<LLMResult> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model,
      contents: userPrompt,
      config: {
        systemInstruction: systemPrompt,
        responseMimeType: 'application/json',
        responseJsonSchema: schema
      }
    });
    if (!response.text) return { ok: false, error: 'Gemini returned no text output.', status: 502 };
    return { ok: true, text: response.text };
  } catch (e) {
    if (e instanceof ApiError) {
      // Gemini returns 400 (not 401/403) for an invalid API key - match on the
      // reason string rather than assuming a conventional auth status code.
      if (e.status === 401 || e.status === 403 || /API_KEY_INVALID|API key not valid/i.test(e.message)) {
        return { ok: false, error: 'Gemini API key was rejected. Check GEMINI_API_KEY.', status: 401 };
      }
      if (e.status === 429) {
        return { ok: false, error: 'Gemini free-tier rate limit reached. Try again shortly.', status: 429 };
      }
      return { ok: false, error: `Gemini API error: ${e.message}`, status: e.status || 502 };
    }
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: `Failed to analyze: ${message}`, status: 500 };
  }
}

async function callOllama(systemPrompt: string, userPrompt: string, schema: object): Promise<LLMResult> {
  const baseUrl = process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434';
  const model = process.env.OLLAMA_MODEL ?? 'llama3.2';
  let resp: Response;
  try {
    resp = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        stream: false,
        // Passing the actual JSON schema (not just the string "json") constrains Ollama's
        // token sampling to the exact shape - far more reliable for small local models than
        // relying on the prompt's English description alone.
        format: schema,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      })
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return { ok: false, error: `Could not reach Ollama at ${baseUrl}. Make sure Ollama is running (\`ollama serve\`). (${message})`, status: 502 };
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return {
      ok: false,
      error: `Ollama returned HTTP ${resp.status} from ${baseUrl}. Confirm the model "${model}" is pulled (\`ollama pull ${model}\`). ${body.slice(0, 300)}`,
      status: 502
    };
  }
  try {
    const json = await resp.json();
    const content: string | undefined = json?.message?.content;
    if (!content) return { ok: false, error: 'Ollama returned no content.', status: 502 };
    return { ok: true, text: content };
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return {
      ok: false,
      error: `Ollama responded but the output didn't match the expected format (${message}). Small local models occasionally do this - try again, or switch OLLAMA_MODEL to a larger model.`,
      status: 502
    };
  }
}

// Gemini's free tier works anywhere (incl. Railway, where localhost Ollama isn't reachable).
// Prefer it automatically when configured; otherwise fall back to local Ollama for dev.
export async function runFreeLLM(systemPrompt: string, userPrompt: string, schema: object): Promise<LLMResult> {
  if (process.env.GEMINI_API_KEY) return callGemini(systemPrompt, userPrompt, schema);
  return callOllama(systemPrompt, userPrompt, schema);
}
