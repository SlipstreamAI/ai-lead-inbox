const {
  validateLead,
  scoreLead,
  routeLead,
  assembleRecord,
  buildSlackPayload,
  createId,
} = require("./lead-logic");
const { saveLead, saveAlert, getLead } = require("./crm");
const { enrichLead, llmMode } = require("./llm");

function step(name, detail, started) {
  return { name, status: "ok", detail, ms: Date.now() - started };
}

async function deliverAlert({ payload, webhookUrl }) {
  const envUrl = (process.env.SLACK_WEBHOOK_URL || "").trim();
  const url = (webhookUrl || envUrl).trim();
  if (!url) {
    return {
      delivery: "mock",
      deliveryStatus: "stored",
      deliveryDetail: "Stored in the local alert inbox. Set SLACK_WEBHOOK_URL to post it to Slack.",
    };
  }
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    const detail = await response.text();
    return {
      delivery: "webhook",
      deliveryStatus: "failed",
      deliveryDetail: `Slack webhook returned ${response.status}. ${detail.slice(0, 180)}`,
    };
  }
  return {
    delivery: "webhook",
    deliveryStatus: "delivered",
    deliveryDetail: "Posted to the Slack-compatible webhook.",
  };
}

async function runPipeline(input, options = {}) {
  const steps = [];
  let started = Date.now();
  const validated = validateLead(input);
  if (!validated.ok) {
    return { ok: false, errors: validated.errors, steps };
  }
  steps.push(step("Intake", "Accepted the form payload", started));

  started = Date.now();
  const scored = scoreLead(validated.lead);
  steps.push(step("Score", `${scored.score} / 100`, started));

  started = Date.now();
  const routing = routeLead(validated.lead, scored);
  steps.push(step("Route", `${routing.tier} → ${routing.owner}`, started));

  started = Date.now();
  let enrichment;
  try {
    enrichment = options.enrichment || (await enrichLead(validated.lead, scored, routing));
  } catch (error) {
    steps.push({
      name: "Enrich",
      status: "error",
      detail: error instanceof Error ? error.message : "Enrichment failed.",
      ms: Date.now() - started,
    });
    return { ok: false, errors: { llm: error instanceof Error ? error.message : "Enrichment failed." }, steps };
  }
  steps.push(step("Enrich", `${enrichment.provider} · ${enrichment.model}`, started));

  const createdAt = options.now ? new Date(options.now).toISOString() : new Date().toISOString();
  const id = options.id || createId("lead", Date.parse(createdAt), options.rand ?? Math.random());
  const alertId = options.alertId || createId("alert", Date.parse(createdAt) + 1, options.rand ?? Math.random());
  const record = assembleRecord(validated.lead, scored, routing, enrichment, {
    id,
    createdAt,
    origin: options.origin || "typescript",
    steps,
    alertStatus: "pending",
    alertId,
  });
  const alertPayload = buildSlackPayload(record);

  started = Date.now();
  await saveLead(record);
  steps.push(step("CRM write", "SQLite row and leads.csv", started));

  started = Date.now();
  const delivery = await deliverAlert({ payload: alertPayload, webhookUrl: options.webhookUrl });
  steps.push(step("Alert", delivery.deliveryDetail, started));
  record.steps = steps;
  record.alertStatus = delivery.deliveryStatus;
  await saveLead(record);
  await saveAlert({
    id: alertId,
    leadId: record.id,
    createdAt,
    channel: record.channel,
    payload: alertPayload,
    ...delivery,
  });

  return { ok: true, lead: await getLead(record.id), alert: { id: alertId, payload: alertPayload, ...delivery } };
}

module.exports = { runPipeline, deliverAlert, llmMode };
