import { NextResponse } from "next/server";
import { connection } from "next/server";
import { JEV_MODEL } from "@/lib/jev";

export async function GET() {
  await connection();
  const mode = (process.env.LLM_MODE || "mock").toLowerCase() === "openai" ? "openai" : "mock";
  return NextResponse.json({
    ok: true,
    service: "ai-lead-inbox",
    llmMode: mode,
    model: mode === "openai" ? process.env.LLM_MODEL || "gpt-4o-mini" : "mock-lead-autopilot-v1",
    slack: (process.env.SLACK_WEBHOOK_URL || "").trim() ? "webhook" : "mock",
    openaiKeySet: Boolean((process.env.LLM_API_KEY || "").trim()),
    typesafeKeySet: Boolean((process.env.TYPESAFE_API_KEY || "").trim()),
    jevModel: JEV_MODEL,
  });
}
