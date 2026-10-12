import { NextResponse } from "next/server";
import { connection } from "next/server";
import { listLeads } from "@/lib/crm";
import { runPipeline } from "@/lib/pipeline";

export async function GET() {
  await connection();
  return NextResponse.json({ ok: true, leads: await listLeads() });
}

export async function POST(request: Request) {
  await connection();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: { body: "Send a JSON lead." } }, { status: 400 });
  }
  const result = await runPipeline(body, { origin: "typescript" });
  if (!result.ok) {
    return NextResponse.json(result, { status: result.errors.llm ? 502 : 400 });
  }
  return NextResponse.json(result, { status: 201 });
}
