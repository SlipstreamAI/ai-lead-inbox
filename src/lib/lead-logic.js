// Shared lead logic for the TypeScript pipeline, the CLI, and the n8n Code
// nodes. Keep this file free of Node-only APIs so it can be embedded as-is.

const FREE_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.co.uk",
  "hotmail.com",
  "outlook.com",
  "live.com",
  "icloud.com",
  "me.com",
  "aol.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "mail.com",
  "msn.com",
]);

const DISPOSABLE_EMAIL_DOMAINS = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "tempmail.com",
  "10minutemail.com",
  "yopmail.com",
  "trashmail.com",
]);

const SPAM_PATTERNS = [
  /\bguest posts?\b/i,
  /\bbacklinks?\b/i,
  /\bcrypto airdrop\b/i,
  /\bbuy followers\b/i,
];

const BUDGET_BANDS = {
  under_1500: 800,
  "1500_4999": 1500,
  "5000_14999": 5000,
  "15000_plus": 15000,
  unknown: null,
};

const TIMELINE_ALIASES = {
  asap: "asap",
  immediate: "asap",
  immediately: "asap",
  this_week: "asap",
  "this week": "asap",
  this_month: "this_month",
  "this month": "this_month",
  this_quarter: "this_quarter",
  "this quarter": "this_quarter",
  this_year: "this_year",
  "this year": "this_year",
  exploring: "exploring",
  "just exploring": "exploring",
  someday: "exploring",
};

const TIMELINE_LABELS = {
  asap: "This week",
  this_month: "This month",
  this_quarter: "This quarter",
  this_year: "This year",
  exploring: "Exploring",
};

const TIER_LABELS = {
  hot: "Hot",
  warm: "Warm",
  cold: "Cold",
  disqualified: "Review",
};

const BREAKDOWN_META = [
  { key: "budget", label: "Budget", max: 30 },
  { key: "timeline", label: "Timeline", max: 25 },
  { key: "emailDomain", label: "Work email", max: 15 },
  { key: "seniority", label: "Role", max: 15 },
  { key: "intent", label: "Intent in the note", max: 10 },
  { key: "website", label: "Website", max: 5 },
];

const CSV_HEADERS = [
  "Lead ID",
  "Created At",
  "Full Name",
  "Email",
  "Company",
  "Role",
  "Website",
  "Need",
  "Monthly Budget USD",
  "Budget Label",
  "Timeline",
  "Source",
  "Score",
  "Tier",
  "Owner",
  "Owner Role",
  "Slack Channel",
  "SLA Minutes",
  "Route Reason",
  "Industry",
  "Company Size",
  "Intent",
  "Pain Points",
  "Personalization Hooks",
  "Next Action",
  "Draft Subject",
  "Draft Body",
  "LLM Provider",
  "LLM Model",
  "Alert Status",
  "Origin",
];

const ROUTES = {
  disqualified: {
    tier: "disqualified",
    owner: "Review queue",
    ownerRole: "Ops",
    channel: "#review-queue",
    slaMinutes: 1440,
  },
  hot: {
    tier: "hot",
    owner: "Avery Chen",
    ownerRole: "Senior AE",
    channel: "#hot-leads",
    slaMinutes: 15,
  },
  warm: {
    tier: "warm",
    owner: "Jordan Hale",
    ownerRole: "Account executive",
    channel: "#inbound",
    slaMinutes: 240,
  },
  cold: {
    tier: "cold",
    owner: "Nurture sequence",
    ownerRole: "Marketing",
    channel: "#nurture-digest",
    slaMinutes: 1440,
  },
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function cleanLine(value) {
  return String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanMessage(value) {
  return String(value ?? "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function emailDomain(email) {
  const parts = String(email || "").toLowerCase().split("@");
  if (parts.length !== 2) return "";
  return parts[1].replace(/\.+$/, "");
}

function isFreeEmail(email) {
  return FREE_EMAIL_DOMAINS.has(emailDomain(email));
}

function isDisposableEmail(email) {
  return DISPOSABLE_EMAIL_DOMAINS.has(emailDomain(email));
}

function isSpamMessage(message) {
  return SPAM_PATTERNS.some((pattern) => pattern.test(message || ""));
}

function bandKeyFromAmount(amount) {
  if (amount == null) return "unknown";
  if (amount >= 15000) return "15000_plus";
  if (amount >= 5000) return "5000_14999";
  if (amount >= 1500) return "1500_4999";
  return "under_1500";
}

function budgetLabel(amount) {
  if (amount == null) return "Not specified";
  if (amount >= 15000) return "$15,000+";
  if (amount >= 5000) return "$5,000–$14,999";
  if (amount >= 1500) return "$1,500–$4,999";
  return "Under $1,500";
}

function parseBudget(value) {
  if (value == null || value === "") {
    return { error: "Choose a monthly budget, or say you are not sure yet." };
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    if (value < 0) return { error: "Budget cannot be negative." };
    const amount = Math.round(value);
    return { amount, band: bandKeyFromAmount(amount) };
  }
  const text = String(value).trim().toLowerCase();
  if (Object.prototype.hasOwnProperty.call(BUDGET_BANDS, text)) {
    const amount = BUDGET_BANDS[text];
    return { amount, band: text };
  }
  const digits = text.replace(/[$,\s]/g, "").replace(/\+$/, "");
  if (/^\d+(\.\d+)?$/.test(digits)) {
    const amount = Math.round(Number(digits));
    return { amount, band: bandKeyFromAmount(amount) };
  }
  return { error: "Choose a monthly budget, or say you are not sure yet." };
}

function parseTimeline(value) {
  const text = cleanLine(value).toLowerCase();
  if (!text) return { error: "Choose a timeline." };
  const timeline = TIMELINE_ALIASES[text];
  if (!timeline) return { error: "Choose a timeline the autopilot understands." };
  return { timeline };
}

function parseWebsite(value) {
  const raw = cleanLine(value);
  if (!raw) return { website: "" };
  const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  let url;
  try {
    url = new URL(withScheme);
  } catch {
    return { error: "That website does not look like a domain." };
  }
  if (!url.hostname.includes(".") || !/^[\w.-]+$/.test(url.hostname)) {
    return { error: "That website does not look like a domain." };
  }
  const path = url.pathname === "/" ? "" : url.pathname.replace(/\/$/, "");
  return { website: `https://${url.hostname}${path}` };
}

function validateLead(input) {
  const source = input && typeof input === "object" ? input : {};
  const errors = {};
  const name = cleanLine(source.name);
  const email = cleanLine(source.email).toLowerCase();
  const company = cleanLine(source.company);
  const role = cleanLine(source.role);
  const message = cleanMessage(source.message);
  const originSource = cleanLine(source.source || "web_form").slice(0, 40) || "web_form";

  if (name.length < 2) errors.name = "Add the person's name.";
  if (name.length > 80) errors.name = "Keep the name under 80 characters.";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Add a real email address.";
  }
  if (company.length < 2) errors.company = "Add a company or project name.";
  if (company.length > 80) errors.company = "Keep the company name under 80 characters.";
  if (role.length < 2) errors.role = "Add a role, even if it is Founder or Student.";
  if (role.length > 80) errors.role = "Keep the role under 80 characters.";
  if (message.length < 12) errors.message = "Tell us what should happen after the form is submitted.";
  if (message.length > 2000) errors.message = "Keep the note under 2,000 characters.";

  const budget = parseBudget(source.budget);
  if (budget.error) errors.budget = budget.error;
  const timeline = parseTimeline(source.timeline);
  if (timeline.error) errors.timeline = timeline.error;
  const website = parseWebsite(source.website);
  if (website.error) errors.website = website.error;

  if (Object.keys(errors).length) return { ok: false, errors };

  return {
    ok: true,
    lead: {
      name,
      email,
      company,
      role,
      website: website.website,
      message,
      budgetUsd: budget.amount,
      budgetBand: budget.band,
      budgetLabel: budgetLabel(budget.amount),
      timeline: timeline.timeline,
      source: originSource,
    },
  };
}

function scoreBudget(amount) {
  if (amount == null) return 4;
  if (amount >= 15000) return 30;
  if (amount >= 5000) return 22;
  if (amount >= 1500) return 14;
  return 6;
}

function scoreTimeline(timeline) {
  const points = { asap: 25, this_month: 22, this_quarter: 16, this_year: 8, exploring: 4 };
  return points[timeline] ?? 2;
}

function scoreEmail(email) {
  if (!String(email || "").includes("@")) return 0;
  if (isDisposableEmail(email)) return 0;
  if (isFreeEmail(email)) return 4;
  return 15;
}

function scoreSeniority(role) {
  const text = String(role || "").toLowerCase();
  if (/(founder|co-founder|cofounder|\bceo\b|\bowner\b|\bpresident\b|\bpartner\b|managing director)/.test(text)) {
    return 15;
  }
  if (/(\bvp\b|vice president|\bdirector\b|head of|\bchief\b)/.test(text)) return 12;
  if (/(\bmanager\b|\blead\b)/.test(text)) return 8;
  return 4;
}

function scoreIntent(message) {
  const text = String(message || "");
  let points = 0;
  if (/\b(automation|workflow|n8n|zapier|make\.com|integromat)\b/i.test(text)) points += 4;
  if (/\b(crm|hubspot|salesforce|airtable|google sheets?|spreadsheets?)\b/i.test(text)) points += 3;
  if (/\b(leads?|inbound|pipeline)\b/i.test(text)) points += 3;
  return Math.min(10, points);
}

function scoreLead(lead) {
  const breakdown = {
    budget: scoreBudget(lead.budgetUsd),
    timeline: scoreTimeline(lead.timeline),
    emailDomain: scoreEmail(lead.email),
    seniority: scoreSeniority(lead.role),
    intent: scoreIntent(lead.message),
    website: lead.website ? 5 : 0,
    penalties: 0,
  };
  const flags = [];
  if (!String(lead.email || "").includes("@")) {
    flags.push("invalid_email");
    breakdown.penalties += 30;
  } else if (isDisposableEmail(lead.email)) {
    flags.push("disposable_email");
    breakdown.penalties += 40;
  }
  if (isSpamMessage(lead.message)) {
    flags.push("spam_pattern");
    breakdown.penalties += 50;
  }
  const positive =
    breakdown.budget +
    breakdown.timeline +
    breakdown.emailDomain +
    breakdown.seniority +
    breakdown.intent +
    breakdown.website;
  const score = clamp(positive - breakdown.penalties, 0, 100);
  return { score, breakdown, flags };
}

function routeLead(lead, scored) {
  const flags = scored.flags || [];
  if (flags.includes("spam_pattern") || flags.includes("disposable_email") || flags.includes("invalid_email")) {
    return {
      ...ROUTES.disqualified,
      reason: `Held for review (${flags.join(", ")}). ${lead.email} is not routed to sales.`,
    };
  }
  if (scored.score >= 70) {
    return {
      ...ROUTES.hot,
      reason: "Score 70 or higher. A senior AE owns the first response.",
    };
  }
  if (scored.score >= 40) {
    return {
      ...ROUTES.warm,
      reason: "Score 40 to 69. Standard inbound response within four hours.",
    };
  }
  return {
    ...ROUTES.cold,
    reason: "Score under 40. File it and include it in the daily nurture digest.",
  };
}

function inferIndustry(lead) {
  const haystack = `${lead.company} ${lead.message} ${lead.website}`;
  const rules = [
    [/clinic|dental|patient|health|hospital|therapy/i, "Healthcare"],
    [/realtor|real estate|property|brokerage|mortgage/i, "Real estate"],
    [/parcel|logistics|shipping|freight|warehouse/i, "Logistics"],
    [/shopify|ecommerce|e-commerce|online store|\bdtc\b/i, "Ecommerce"],
    [/law firm|attorney|legal|counsel/i, "Legal services"],
    [/agency|marketing|demand gen|\bads\b/i, "Marketing agency"],
    [/saas|software|platform|devtools/i, "B2B software"],
  ];
  for (const [pattern, industry] of rules) {
    if (pattern.test(haystack)) return industry;
  }
  return "Professional services";
}

function inferCompanySize(amount) {
  if (amount == null) return "Unknown";
  if (amount >= 15000) return "201-1,000";
  if (amount >= 5000) return "51-200";
  if (amount >= 1500) return "11-50";
  return "1-10";
}

function inferPainPoints(lead, routing) {
  const text = lead.message || "";
  const rules = [
    [/shared inbox|\binbox\b/i, "new inquiries land in a shared inbox and sit there"],
    [/spreadsheet|google sheet|copy|manual|by hand/i, "lead fields are copied by hand into a sheet or CRM"],
    [/hubspot|salesforce|\bcrm\b/i, "the CRM record is missing the context sales needs"],
    [/slack|notify|alert|ping/i, "the right person hears about the lead too late"],
    [/follow-?up|response time|\bslow\b/i, "first response depends on whoever notices the form"],
    [/n8n|zapier|make\.com|integromat/i, "an existing automation stack still needs a judgment step"],
    [/score|qualif/i, "every lead is treated the same, whether or not it is real"],
  ];
  const found = [];
  for (const [pattern, pain] of rules) {
    if (pattern.test(text) && !found.includes(pain)) found.push(pain);
  }
  if (found.length) return found.slice(0, 3);
  const fallback = {
    hot: "the team needs a person on the lead immediately, and the handoff is still manual",
    warm: "inbound requests arrive, but the path into the CRM is still fuzzy",
    cold: "there is curiosity about automation, without a live process to fix yet",
    disqualified: "the submission does not look like a real project inquiry",
  };
  return [fallback[routing.tier] || fallback.warm];
}

function timelineClause(timeline) {
  const clauses = {
    asap: "needs a working version this week",
    this_month: "wants this live within the month",
    this_quarter: "is planning the rollout this quarter",
    this_year: "is scoping the work for later in the year",
    exploring: "is exploring and has not picked a start date",
  };
  return clauses[timeline] || "did not share a timeline";
}

function mockEnrich(lead, scored, routing) {
  const industry = inferIndustry(lead);
  const painPoints = inferPainPoints(lead, routing);
  const personalizationHooks = [];
  if (lead.role && lead.company) personalizationHooks.push(`${lead.role} at ${lead.company}`);
  personalizationHooks.push(TIMELINE_LABELS[lead.timeline] || "Timeline not set");
  if (lead.budgetUsd != null) personalizationHooks.push(`Budget band ${lead.budgetLabel}`);
  if (painPoints[0]) personalizationHooks.push(painPoints[0]);

  const intentSummary = `${lead.company}, a ${industry.toLowerCase()} team, ${timelineClause(lead.timeline)}. ${lead.name} (${lead.role}) wrote in because ${painPoints[0]}.`;
  const next = {
    hot: `Call ${lead.name.split(/\s+/)[0]} within 15 minutes. Use the draft, then offer to stand up the form → CRM → Slack path on their stack.`,
    warm: `Reply within four hours. Offer Jordan Hale's 30-minute working session and send the draft as written.`,
    cold: "Do not book a sales call. Add the contact to the nurture sequence and mention them in the daily digest.",
    disqualified: "Do not email the sender. An operator clears or drops the row from #review-queue.",
  };

  const draft = buildDraft(lead, routing, painPoints, industry);
  return {
    industry,
    companySize: inferCompanySize(lead.budgetUsd),
    intentSummary,
    painPoints,
    personalizationHooks: personalizationHooks.slice(0, 4),
    recommendedNextAction: next[routing.tier] || next.warm,
    draftSubject: draft.draftSubject,
    draftBody: draft.draftBody,
    provider: "mock",
    model: "mock-lead-autopilot-v1",
    scoreUsed: scored.score,
  };
}

function buildDraft(lead, routing, painPoints, industry) {
  if (routing.tier === "disqualified") {
    return {
      draftSubject: `Hold: ${lead.company}`,
      draftBody: [
        "Internal note. Do not send this to the submitter.",
        "",
        `${lead.name} <${lead.email}> was held: ${routing.reason}`,
        `Company: ${lead.company}.`,
        "Leave the row in #review-queue until an operator clears it.",
      ].join("\n"),
    };
  }
  const first = lead.name.split(/\s+/)[0];
  const painSentence = painPoints[0]
    ? `The sticking point you described: ${painPoints[0]}.`
    : "The sticking point is the handoff from the form to someone who can answer.";
  const close = {
    hot: "I can put a working version on a call this week: the form is scored, the CRM row is written, and Slack pings the owner. If that is the right shape, we wire it to your stack before the week is out.",
    warm: "If you want, we can spend half an hour mapping this onto n8n, Make, or Zapier and leave you with the CRM row and the alert actually firing.",
    cold: "No need to book anything. When the timing is real, the same path — score, file, draft, alert — is a small build.",
  };
  const subject = {
    hot: `${lead.company}'s lead inbox, scored before anyone is pinged`,
    warm: `From ${lead.company}'s form to the CRM, without the copy-paste`,
    cold: `A note on ${lead.company}'s inbound, for whenever you pick it up`,
  };
  return {
    draftSubject: subject[routing.tier],
    draftBody: [
      `Hi ${first},`,
      "",
      `Thanks for the note about ${lead.company}. ${painSentence}`,
      "",
      `For a ${industry.toLowerCase()} team, I would keep the first version deliberately small. One public form. A score with the reason attached. A CRM row in a sheet, Airtable, or the system you already use. A draft reply. A Slack alert to ${routing.owner}.`,
      "",
      close[routing.tier],
      "",
      "— Northline",
    ].join("\n"),
  };
}

function buildEnrichmentPrompt(lead, scored, routing) {
  return {
    system: [
      "You qualify inbound leads for Northline, an automation studio.",
      "Return one JSON object and nothing else.",
      "Use exactly these keys: industry, companySize, intentSummary, painPoints, personalizationHooks, recommendedNextAction, draftSubject, draftBody.",
      "painPoints and personalizationHooks are arrays of short strings.",
      "draftBody is a short email the studio can send, signed — Northline.",
      "Do not invent a budget or a timeline the lead did not provide.",
      "If the tier is disqualified, draftBody is an internal note that begins with 'Internal note. Do not send this to the submitter.'",
    ].join(" "),
    user: JSON.stringify({
      lead,
      score: scored.score,
      breakdown: scored.breakdown,
      flags: scored.flags,
      routing,
    }),
  };
}

function normalizeEnrichment(parsed, provider, model) {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Enrichment was not a JSON object.");
  }
  const required = [
    "industry",
    "companySize",
    "intentSummary",
    "painPoints",
    "personalizationHooks",
    "recommendedNextAction",
    "draftSubject",
    "draftBody",
  ];
  const missing = required.filter((key) => parsed[key] == null || parsed[key] === "");
  if (missing.length) {
    throw new Error(`Enrichment JSON is missing: ${missing.join(", ")}.`);
  }
  if (!Array.isArray(parsed.painPoints) || !Array.isArray(parsed.personalizationHooks)) {
    throw new Error("painPoints and personalizationHooks must be arrays.");
  }
  return {
    industry: String(parsed.industry),
    companySize: String(parsed.companySize),
    intentSummary: String(parsed.intentSummary),
    painPoints: parsed.painPoints.map(String),
    personalizationHooks: parsed.personalizationHooks.map(String),
    recommendedNextAction: String(parsed.recommendedNextAction),
    draftSubject: String(parsed.draftSubject),
    draftBody: String(parsed.draftBody),
    provider,
    model,
  };
}

function extractJsonObject(content) {
  const raw = String(content || "").trim();
  const fenced = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    return JSON.parse(fenced);
  } catch {
    const start = fenced.indexOf("{");
    const end = fenced.lastIndexOf("}");
    if (start >= 0 && end > start) return JSON.parse(fenced.slice(start, end + 1));
    throw new Error("The model did not return JSON.");
  }
}

function createId(prefix, now = Date.now(), rand = Math.random()) {
  const time = Math.floor(now).toString(36);
  const noise = Math.floor(rand * 1679616)
    .toString(36)
    .padStart(4, "0");
  return `${prefix}_${time}${noise}`;
}

function assembleRecord(lead, scored, routing, enrichment, meta) {
  return {
    id: meta.id,
    createdAt: meta.createdAt,
    name: lead.name,
    email: lead.email,
    company: lead.company,
    role: lead.role,
    website: lead.website,
    message: lead.message,
    budgetUsd: lead.budgetUsd,
    budgetBand: lead.budgetBand,
    budgetLabel: lead.budgetLabel,
    timeline: lead.timeline,
    source: lead.source || "web_form",
    score: scored.score,
    breakdown: scored.breakdown,
    flags: scored.flags,
    tier: routing.tier,
    owner: routing.owner,
    ownerRole: routing.ownerRole,
    channel: routing.channel,
    slaMinutes: routing.slaMinutes,
    routeReason: routing.reason,
    industry: enrichment.industry,
    companySize: enrichment.companySize,
    intentSummary: enrichment.intentSummary,
    painPoints: enrichment.painPoints,
    personalizationHooks: enrichment.personalizationHooks,
    nextAction: enrichment.recommendedNextAction,
    draftSubject: enrichment.draftSubject,
    draftBody: enrichment.draftBody,
    llmProvider: enrichment.provider,
    llmModel: enrichment.model,
    alertStatus: meta.alertStatus || "pending",
    alertId: meta.alertId || "",
    origin: meta.origin || "typescript",
    steps: meta.steps || [],
  };
}

function buildSlackPayload(record) {
  const label = record.tier === "disqualified" ? "Review hold" : `${TIER_LABELS[record.tier] || record.tier} lead`;
  const text = `${label}: ${record.name} at ${record.company} — score ${record.score} — ${record.owner} — ${record.slaMinutes}m SLA`;
  return {
    text,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: `${label} · ${record.score}`, emoji: false },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*Contact*\n${record.name}\n${record.email}` },
          { type: "mrkdwn", text: `*Company*\n${record.company}\n${record.role}` },
          { type: "mrkdwn", text: `*Owner*\n${record.owner}\n${record.slaMinutes} min SLA` },
          { type: "mrkdwn", text: `*Channel*\n${record.channel}` },
        ],
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Intent*\n${record.intentSummary}` },
      },
      {
        type: "section",
        text: { type: "mrkdwn", text: `*Draft*\n${record.draftSubject}` },
      },
    ],
  };
}

function csvEscape(value) {
  if (value == null) return "";
  const stringValue = Array.isArray(value) ? value.join(" | ") : String(value);
  if (/[",\n\r]/.test(stringValue)) return `"${stringValue.replace(/"/g, '""')}"`;
  return stringValue;
}

function recordToCsvValues(record) {
  return [
    record.id,
    record.createdAt,
    record.name,
    record.email,
    record.company,
    record.role,
    record.website,
    record.message,
    record.budgetUsd ?? "",
    record.budgetLabel,
    record.timeline,
    record.source,
    record.score,
    record.tier,
    record.owner,
    record.ownerRole,
    record.channel,
    record.slaMinutes,
    record.routeReason,
    record.industry,
    record.companySize,
    record.intentSummary,
    record.painPoints,
    record.personalizationHooks,
    record.nextAction,
    record.draftSubject,
    record.draftBody,
    record.llmProvider,
    record.llmModel,
    record.alertStatus,
    record.origin,
  ];
}

function leadsToCsv(records) {
  const lines = [CSV_HEADERS.map(csvEscape).join(",")];
  for (const record of records) {
    lines.push(recordToCsvValues(record).map(csvEscape).join(","));
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

function assertStoredRecord(record) {
  if (!record || typeof record !== "object") {
    throw new Error("A lead record is required.");
  }
  const required = ["id", "createdAt", "name", "email", "company", "score", "tier", "owner", "channel", "draftBody"];
  const missing = required.filter((key) => record[key] == null || record[key] === "");
  if (missing.length) throw new Error(`Lead record is missing: ${missing.join(", ")}.`);
  if (!Object.prototype.hasOwnProperty.call(TIER_LABELS, record.tier)) {
    throw new Error(`Unknown tier: ${record.tier}.`);
  }
  if (typeof record.score !== "number" || record.score < 0 || record.score > 100) {
    throw new Error("Score must be a number from 0 to 100.");
  }
  return record;
}

const api = {
  FREE_EMAIL_DOMAINS,
  DISPOSABLE_EMAIL_DOMAINS,
  TIMELINE_LABELS,
  TIER_LABELS,
  BREAKDOWN_META,
  CSV_HEADERS,
  ROUTES,
  validateLead,
  scoreLead,
  routeLead,
  mockEnrich,
  buildEnrichmentPrompt,
  normalizeEnrichment,
  extractJsonObject,
  createId,
  assembleRecord,
  buildSlackPayload,
  csvEscape,
  leadsToCsv,
  assertStoredRecord,
  budgetLabel,
  inferIndustry,
};

// NODE_EXPORTS
if (typeof module !== "undefined" && module.exports) {
  module.exports = api;
}
