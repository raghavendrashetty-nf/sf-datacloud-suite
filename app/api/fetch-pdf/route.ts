import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { url } = await req.json();
    if (!url || typeof url !== 'string') return NextResponse.json({ error: 'Missing url' }, { status: 400 });
    if (!/^https?:\/\//i.test(url)) return NextResponse.json({ error: 'URL must start with http(s)://' }, { status: 400 });
    const upstream = await fetch(url, { headers: { 'User-Agent': 'sf-datacloud-suite/4.7' } });
    if (!upstream.ok) return NextResponse.json({ error: `Upstream returned ${upstream.status}` }, { status: 502 });
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, { status: 200, headers: { 'Content-Type': 'application/pdf', 'Cache-Control': 'no-store' } });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? 'Fetch failed' }, { status: 500 });
  }
}
