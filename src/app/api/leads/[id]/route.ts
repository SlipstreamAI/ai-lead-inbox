import { NextResponse } from "next/server";
import { connection } from "next/server";
import { getAlertForLead, getLead } from "@/lib/crm";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  await connection();
  const { id } = await context.params;
  const lead = await getLead(id);
  if (!lead) {
    return NextResponse.json({ ok: false, errors: { id: "No lead with that id." } }, { status: 404 });
  }
  return NextResponse.json({ ok: true, lead, alert: await getAlertForLead(id) });
}
