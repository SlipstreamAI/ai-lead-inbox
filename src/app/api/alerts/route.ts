import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getLead, listAlerts, saveAlert } from "@/lib/crm";
import { buildSlackPayload, createId, type SlackPayload } from "@/lib/lead-logic";
import { deliverAlert } from "@/lib/pipeline";

export async function GET() {
  await connection();
  return NextResponse.json({ ok: true, alerts: await listAlerts() });
}

export async function POST(request: Request) {
  await connection();
  let body: { leadId?: string; channel?: string; payload?: SlackPayload };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: { body: "Send JSON." } }, { status: 400 });
  }
  if (!body.leadId) {
    return NextResponse.json({ ok: false, errors: { leadId: "leadId is required." } }, { status: 400 });
  }
  const lead = await getLead(body.leadId);
  if (!lead) {
    return NextResponse.json({ ok: false, errors: { leadId: "No lead with that id." } }, { status: 404 });
  }
  const payload = body.payload || buildSlackPayload(lead);
  const delivery = await deliverAlert({ payload });
  const alert = await saveAlert({
    id: createId("alert"),
    leadId: lead.id,
    createdAt: new Date().toISOString(),
    channel: body.channel || lead.channel,
    payload,
    ...delivery,
  });
  return NextResponse.json({ ok: true, lead: await getLead(lead.id), alert });
}
