import { NextResponse } from "next/server";
import { connection } from "next/server";
import fixtures from "@/lib/fixtures.json";
import type { LeadRecord } from "@/lib/lead-logic";
import { runPipeline } from "@/lib/pipeline";

export async function GET() {
  await connection();
  return NextResponse.json({
    ok: true,
    fixtures: fixtures.map((fixture) => ({
      key: fixture.key,
      label: fixture.label,
      blurb: fixture.blurb,
      input: fixture.input,
    })),
  });
}

export async function POST() {
  await connection();
  const leads: LeadRecord[] = [];
  for (const fixture of fixtures) {
    const result = await runPipeline(fixture.input, {
      id: fixture.id,
      now: fixture.sampleNow,
      rand: 0.42,
      origin: "typescript",
      alertId: `alert_sample_${fixture.key}`,
    });
    if (!result.ok) {
      return NextResponse.json(result, { status: 500 });
    }
    leads.push(result.lead);
  }
  return NextResponse.json({ ok: true, leads });
}
