const { mockEnrich, buildEnrichmentPrompt, normalizeEnrichment, extractJsonObject } = require("./lead-logic");

function llmMode() {
  return (process.env.LLM_MODE || "mock").trim().toLowerCase() === "openai" ? "openai" : "mock";
}

function llmModel() {
  if (llmMode() === "openai") return process.env.LLM_MODEL || "gpt-4o-mini";
  return "mock-lead-autopilot-v1";
}

async function enrichLead(lead, scored, routing) {
  if (llmMode() !== "openai") {
    return mockEnrich(lead, scored, routing);
  }
  const apiKey = (process.env.LLM_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("LLM_MODE=openai but LLM_API_KEY is empty. Add a key or switch LLM_MODE=mock.");
  }
  const base = (process.env.LLM_BASE_URL || "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL || "gpt-4o-mini";
  const prompts = buildEnrichmentPrompt(lead, scored, routing);
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 20000);
  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: prompts.system },
        { role: "user", content: prompts.user },
      ],
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const raw = await response.text();
  if (!response.ok) {
    throw new Error(`LLM request failed (${response.status}): ${raw.slice(0, 400)}`);
  }
  let body;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new Error("LLM response was not JSON.");
  }
  const content = body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  const parsed = extractJsonObject(content);
  return normalizeEnrichment(parsed, "openai", model);
}

module.exports = { enrichLead, llmMode, llmModel };
