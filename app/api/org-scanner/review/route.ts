import { NextRequest, NextResponse } from 'next/server';
import type { Skill } from '@/lib/types';
import type { ScanCategoryResult } from '@/lib/dataCloudClient';
import { REVIEW_SCHEMA, buildReviewSystemPrompt, buildReviewUserPrompt, safeParseReview } from '@/lib/orgReview';
import { runFreeLLM } from '@/lib/llmClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface ReviewBody { scanResults?: ScanCategoryResult[]; skills?: Skill[]; sowText?: string; }

export async function POST(req: NextRequest) {
  let body: ReviewBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const { scanResults, skills, sowText } = body;
  if (!Array.isArray(scanResults) || scanResults.length === 0) {
    return NextResponse.json({ error: 'scanResults is required - run a scan first' }, { status: 400 });
  }
  if (!Array.isArray(skills)) {
    return NextResponse.json({ error: 'skills must be an array' }, { status: 400 });
  }

  const result = await runFreeLLM(
    buildReviewSystemPrompt(),
    buildReviewUserPrompt(scanResults, skills, sowText && sowText.trim() ? sowText : undefined),
    REVIEW_SCHEMA
  );
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });

  try {
    const review = safeParseReview(result.text);
    return NextResponse.json({ review });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error';
    return NextResponse.json({ error: `Failed to parse model response: ${message}` }, { status: 502 });
  }
}
