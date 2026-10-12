import { NextResponse } from "next/server";
import { connection } from "next/server";
import { enrichLead } from "@/lib/llm";
import type { Lead, Routing, ScoredLead } from "@/lib/lead-logic";

export async function POST(request: Request) {
  await connection();
  let body: { lead?: Lead; scored?: ScoredLead; routing?: Routing };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: { body: "Send JSON with lead, scored, and routing." } }, { status: 400 });
  }
  if (!body.lead || !body.scored || !body.routing) {
    return NextResponse.json(
      { ok: false, errors: { body: "lead, scored, and routing are required." } },
      { status: 400 },
    );
  }
  try {
    const enrichment = await enrichLead(body.lead, body.scored, body.routing);
    return NextResponse.json({ ok: true, enrichment });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Enrichment failed.";
    return NextResponse.json({ ok: false, errors: { llm: message } }, { status: 502 });
  }
}
