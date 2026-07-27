import { NextRequest, NextResponse } from 'next/server';
import type { Skill } from '@/lib/types';
import { RECOMMENDATION_SCHEMA, buildSystemPrompt, buildUserPrompt, safeParseRecommendation } from '@/lib/llmProviders';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface AnalyzeBody { sowText?: string; skills?: Skill[]; }

async function analyzeWithOllama(sowText: string, skills: Skill[]) {
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
        format: RECOMMENDATION_SCHEMA,
        messages: [
          { role: 'system', content: buildSystemPrompt() },
          { role: 'user', content: buildUserPrompt(sowText, skills) }
        ]
      })
    });
  } catch (e) {
    const message2 = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: `Could not reach Ollama at ${baseUrl}. Make sure Ollama is running (\`ollama serve\`). (${message2})` },
      { status: 502 }
    );
  }
  if (!resp.ok) {
    const body = await resp.text().catch(() => '');
    return NextResponse.json(
      { error: `Ollama returned HTTP ${resp.status} from ${baseUrl}. Confirm the model "${model}" is pulled (\`ollama pull ${model}\`). ${body.slice(0, 300)}` },
      { status: 502 }
    );
  }
  try {
    const json = await resp.json();
    const content: string | undefined = json?.message?.content;
    if (!content) return NextResponse.json({ error: 'Ollama returned no content.' }, { status: 502 });
    const recommendation = safeParseRecommendation(content);
    return NextResponse.json({ recommendation });
  } catch (e) {
    const message2 = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json(
      { error: `Ollama responded but the output didn't match the expected format (${message2}). Small local models occasionally do this - try again, or switch OLLAMA_MODEL to a larger model.` },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  let body: AnalyzeBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { sowText, skills } = body;
  if (!sowText || typeof sowText !== 'string' || !sowText.trim()) {
    return NextResponse.json({ error: 'sowText is required' }, { status: 400 });
  }
  if (!Array.isArray(skills)) {
    return NextResponse.json({ error: 'skills must be an array' }, { status: 400 });
  }
  return analyzeWithOllama(sowText, skills);
}
