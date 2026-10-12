import { NextResponse } from "next/server";
import { connection } from "next/server";

export async function POST(request: Request) {
  await connection();
  const url = process.env.N8N_WEBHOOK_URL || "http://127.0.0.1:5678/webhook/lead";
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, errors: { body: "Send a JSON lead." } }, { status: 400 });
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30000),
    });
    const raw = await response.text();
    let parsed: unknown = { raw };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { ok: response.ok, raw };
    }
    return NextResponse.json(parsed, { status: response.status || 502 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "n8n request failed.";
    return NextResponse.json(
      {
        ok: false,
        errors: {
          n8n: `Could not reach the n8n webhook at ${url}. ${message} Start the stack with docker compose, import n8n/ai-lead-inbox.workflow.json, and publish it. The in-app pipeline does not need n8n.`,
        },
      },
      { status: 502 },
    );
  }
}
