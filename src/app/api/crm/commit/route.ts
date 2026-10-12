import { NextResponse } from "next/server";
import { connection } from "next/server";
import { saveLead } from "@/lib/crm";
import { assertStoredRecord } from "@/lib/lead-logic";

export async function POST(request: Request) {
  await connection();
  let body: { record?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: { body: "Send JSON with a record." } }, { status: 400 });
  }
  try {
    const record = assertStoredRecord(body.record);
    record.origin = record.origin || "n8n";
    record.alertStatus = record.alertStatus || "pending";
    const lead = await saveLead(record);
    return NextResponse.json({ ok: true, lead }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not store the lead.";
    return NextResponse.json({ ok: false, errors: { record: message } }, { status: 400 });
  }
}
