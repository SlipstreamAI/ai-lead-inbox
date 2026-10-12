const { ROUTES } = require("./lead-logic");

const JEV_ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const JEV_MODEL = "jev-1.13.0";
const SCORE_LEVELS = 10;
const DEFAULT_CONFIDENCE_THRESHOLD = 0.6;
const NOUL_YES = 0.5;

const SCORE_CRITERIA = [
  "Not a real project inquiry.",
  "Very weak: no budget, no timeline, and no clear need.",
  "Curious only, or a free inbox with an unclear need.",
  "Some fit, but the budget or the timeline is missing.",
  "Modest budget and a slow timeline.",
  "A real inbound request with a mid-range budget.",
  "Qualified: a decision maker planning this quarter.",
  "Strong: a decision maker who wants this within the month.",
  "High budget and a this-week timeline.",
  "Immediate: a senior buyer with a clear automation need and budget.",
];

const ROUTE_CRITERIA = {
  avery: "Hot lead. Avery Chen, Senior AE, replies within 15 minutes. The sender can buy and the need is real.",
  jordan: "Warm lead. Jordan Hale, account executive, replies within four hours.",
  nurture: "Cold lead. Nurture sequence and the daily digest. Do not book a sales call.",
  review: "A human should hold this. Spam, a disposable inbox, a guest-post or backlink pitch, or not a genuine inquiry.",
};

const INTENT_CRITERIA = {
  automation: "They want a workflow, n8n, Zapier, Make, or similar automation built.",
  crm: "They want leads filed into a CRM, HubSpot, Salesforce, Airtable, or a spreadsheet.",
  inbound: "They want help with inbound leads, response time, or the pipeline.",
  partnership: "Guest post, backlink, sponsorship, or any non-buying pitch.",
  other: "None of the other intents fit.",
};

const ROUTE_TIER = {
  avery: "hot",
  jordan: "warm",
  nurture: "cold",
  review: "disqualified",
};

function typesafeKey() {
  return (process.env.TYPESAFE_API_KEY || "").trim();
}

function confidenceThreshold() {
  const raw = process.env.JEV_CONFIDENCE_THRESHOLD;
  if (raw == null || String(raw).trim() === "") return DEFAULT_CONFIDENCE_THRESHOLD;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) return DEFAULT_CONFIDENCE_THRESHOLD;
  return value;
}

function timeoutMs() {
  const raw = Number(process.env.JEV_TIMEOUT_MS || process.env.LLM_TIMEOUT_MS || 20000);
  return Number.isFinite(raw) && raw > 0 ? raw : 20000;
}

function buildJevBody(lead) {
  return {
    model: JEV_MODEL,
    state: {
      name: lead.name,
      email: lead.email,
      company: lead.company,
      role: lead.role,
      website: lead.website,
      message: lead.message,
      budgetUsd: lead.budgetUsd,
      budgetLabel: lead.budgetLabel,
      timeline: lead.timeline,
      source: lead.source,
    },
    questions: {
      score: {
        type: "score",
        instructions:
          "How strong a sales lead is this inbound form submission, from not-a-lead up to a senior buyer who needs a response this week?",
        criteria: SCORE_CRITERIA,
      },
      route: {
        type: "choice",
        instructions: "Which owner should take the first response to this lead?",
        criteria: ROUTE_CRITERIA,
      },
      intent: {
        type: "choice",
        instructions: "What is the sender's primary intent?",
        criteria: INTENT_CRITERIA,
      },
      spam: {
        type: "noul",
        instructions:
          "This submission is spam, a guest-post or backlink pitch, a crypto airdrop, a follower offer, or not a genuine project inquiry.",
      },
      urgent: {
        type: "noul",
        instructions: "The sender needs a response this week or describes an urgent operational problem.",
      },
      needs_human: {
        type: "noul",
        instructions: "A person should review this lead before any sales owner is assigned.",
      },
    },
  };
}

function unitInterval(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1;
}

function readChoice(answer, allowed) {
  if (!answer || answer.type !== "choice") return null;
  if (!Object.prototype.hasOwnProperty.call(allowed, answer.choice)) return null;
  if (!unitInterval(answer.confidence)) return null;
  return answer;
}

function readScore(answer) {
  if (!answer || answer.type !== "score") return null;
  if (typeof answer.score !== "number" || !Number.isFinite(answer.score)) return null;
  if (!unitInterval(answer.confidence)) return null;
  return answer;
}

function readNoul(answer) {
  if (!answer || answer.type !== "noul" || !unitInterval(answer.noul)) return null;
  return answer.noul;
}

function mapScore(raw) {
  const top = SCORE_LEVELS - 1;
  const clamped = Math.max(0, Math.min(top, raw));
  return Math.round((clamped / top) * 100);
}

function addFlag(flags, flag) {
  if (!flags.includes(flag)) flags.push(flag);
}

function decisionFromResponse(rubric, payload) {
  const answers = payload && payload.answers;
  if (!answers || typeof answers !== "object") return null;
  const scoreAnswer = readScore(answers.score);
  const routeAnswer = readChoice(answers.route, ROUTE_CRITERIA);
  const intentAnswer = readChoice(answers.intent, INTENT_CRITERIA);
  const spam = readNoul(answers.spam);
  const urgent = readNoul(answers.urgent);
  const needsHuman = readNoul(answers.needs_human);
  if (!scoreAnswer || !routeAnswer || !intentAnswer || spam == null || urgent == null || needsHuman == null) {
    return null;
  }

  const threshold = confidenceThreshold();
  const holds = [];
  if (scoreAnswer.confidence < threshold) {
    holds.push(`score confidence ${scoreAnswer.confidence.toFixed(2)} is below ${threshold.toFixed(2)}`);
  }
  if (routeAnswer.confidence < threshold) {
    holds.push(`route confidence ${routeAnswer.confidence.toFixed(2)} is below ${threshold.toFixed(2)}`);
  }
  if (intentAnswer.confidence < threshold) {
    holds.push(`intent confidence ${intentAnswer.confidence.toFixed(2)} is below ${threshold.toFixed(2)}`);
  }
  if (spam >= NOUL_YES) holds.push(`spam noul ${spam.toFixed(2)}`);
  if (needsHuman >= NOUL_YES) holds.push(`needs a human noul ${needsHuman.toFixed(2)}`);

  const held = holds.length > 0 || routeAnswer.choice === "review";
  const tierKey = held ? "disqualified" : ROUTE_TIER[routeAnswer.choice];
  const selected = ROUTES[tierKey];
  let reason;
  if (holds.length) {
    reason = `Held for human review. ${holds.join("; ")}.`;
  } else if (routeAnswer.choice === "review") {
    reason = `Jev routed this to human review (route confidence ${routeAnswer.confidence.toFixed(2)}).`;
  } else {
    reason = `Jev routed this to ${selected.owner} (route confidence ${routeAnswer.confidence.toFixed(2)}, score confidence ${scoreAnswer.confidence.toFixed(2)}).`;
  }

  const flags = [...(rubric.flags || [])];
  addFlag(flags, "jev");
  if (urgent >= NOUL_YES) addFlag(flags, "urgent");
  if (spam >= NOUL_YES) addFlag(flags, "spam_noul");
  if (needsHuman >= NOUL_YES) addFlag(flags, "needs_human");
  if (holds.some((item) => item.includes("confidence"))) addFlag(flags, "low_confidence");

  const jev = {
    used: true,
    model: typeof payload.model === "string" && payload.model ? payload.model : JEV_MODEL,
    rawScore: scoreAnswer.score,
    scoreConfidence: scoreAnswer.confidence,
    route: routeAnswer.choice,
    routeConfidence: routeAnswer.confidence,
    intent: intentAnswer.choice,
    intentConfidence: intentAnswer.confidence,
    gates: { spam, urgent, needsHuman },
    confidenceThreshold: threshold,
    heldForReview: held,
    holdReasons: holds,
    probabilities: {
      score: scoreAnswer.probabilities || {},
      route: routeAnswer.probabilities || {},
      intent: intentAnswer.probabilities || {},
    },
  };
  if (payload.usage && typeof payload.usage === "object") jev.usage = payload.usage;

  return {
    scored: {
      score: mapScore(scoreAnswer.score),
      breakdown: rubric.breakdown,
      flags,
    },
    routing: { ...selected, reason },
    jev,
  };
}

async function scoreLeadWithJev(lead, rubric) {
  const apiKey = typesafeKey();
  if (!apiKey) return null;
  const body = buildJevBody(lead);
  let response;
  try {
    response = await fetch(JEV_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs()),
    });
  } catch {
    return null;
  }
  if (!response || !response.ok) return null;
  let payload;
  try {
    payload = JSON.parse(await response.text());
  } catch {
    return null;
  }
  return decisionFromResponse(rubric, payload);
}

module.exports = {
  JEV_ENDPOINT,
  JEV_MODEL,
  SCORE_LEVELS,
  scoreLeadWithJev,
  buildJevBody,
  confidenceThreshold,
};
