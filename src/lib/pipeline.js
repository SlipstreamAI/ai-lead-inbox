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
const { scoreLeadWithJev } = require("./jev");

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

  const rubric = scoreLead(validated.lead);
  let scored = rubric;
  let routing = routeLead(validated.lead, rubric);
  let jevDecision = null;
  if ((process.env.TYPESAFE_API_KEY || "").trim()) {
    const jevStarted = Date.now();
    try {
      jevDecision = await scoreLeadWithJev(validated.lead, rubric);
    } catch {
      jevDecision = null;
    }
    if (jevDecision) {
      scored = jevDecision.scored;
      routing = jevDecision.routing;
      steps.push(
        step(
          "Jev",
          `${jevDecision.jev.model} · route confidence ${jevDecision.jev.routeConfidence.toFixed(2)}`,
          jevStarted,
        ),
      );
    } else {
      steps.push({
        name: "Jev",
        status: "ok",
        detail: "Call failed. Fell back to the local rubric.",
        ms: Date.now() - jevStarted,
      });
    }
  }

  started = Date.now();
  steps.push(step("Score", `${scored.score} / 100`, started));

  started = Date.now();
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
  if (jevDecision) record.jev = jevDecision.jev;
  const alertPayload = buildSlackPayload(record);
  if (record.jev && record.jev.used) {
    const routeConfidence = record.jev.routeConfidence.toFixed(2);
    alertPayload.text += ` — Jev route confidence ${routeConfidence}`;
    alertPayload.blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: [
          `*Jev ${record.jev.model}*`,
          `score ${record.jev.scoreConfidence.toFixed(2)} · route ${routeConfidence} · intent ${record.jev.intent} ${record.jev.intentConfidence.toFixed(2)}`,
          `spam ${record.jev.gates.spam.toFixed(2)} · urgent ${record.jev.gates.urgent.toFixed(2)} · needs a human ${record.jev.gates.needsHuman.toFixed(2)}`,
        ].join("\n"),
      },
    });
  }

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
