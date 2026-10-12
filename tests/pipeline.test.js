const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lead-crm-"));
process.env.DATA_DIR = dir;
process.env.LLM_MODE = "mock";
delete process.env.SLACK_WEBHOOK_URL;
delete process.env.LLM_API_KEY;
delete process.env.TYPESAFE_API_KEY;

const fixtures = require("../src/lib/fixtures.json");
const { leadsToCsv, csvEscape, normalizeEnrichment } = require("../src/lib/lead-logic");
const { runPipeline } = require("../src/lib/pipeline");
const { listLeads, getAlertForLead, csvPath, closeDb } = require("../src/lib/crm");
const { enrichLead } = require("../src/lib/llm");

let chain = Promise.resolve();
function serial(name, fn) {
  test(name, () => {
    const run = chain.then(fn);
    chain = run.then(
      () => {},
      () => {},
    );
    return run;
  });
}

serial("mock pipeline files a lead, a csv row, and a stored Slack alert", async () => {
  const fixture = fixtures.find((item) => item.key === "hot");
  const result = await runPipeline(fixture.input, {
    id: fixture.id,
    now: fixture.sampleNow,
    rand: 0.25,
    origin: "typescript",
  });
  assert.equal(result.ok, true);
  assert.equal(result.lead.id, "lead_sample_hot");
  assert.equal(result.lead.tier, "hot");
  assert.equal(result.lead.llmProvider, "mock");
  assert.equal(result.lead.origin, "typescript");
  assert.equal(result.alert.delivery, "mock");
  assert.equal(result.alert.deliveryStatus, "stored");
  assert.match(result.alert.payload.text, /Priya Shah/);
  assert.ok(result.alert.payload.blocks.length >= 3);

  const stored = await listLeads();
  assert.equal(stored.length, 1);
  const alert = await getAlertForLead(stored[0].id);
  assert.equal(alert.channel, "#hot-leads");
  const csv = fs.readFileSync(csvPath(), "utf8");
  assert.ok(csv.charCodeAt(0) === 0xfeff);
  assert.match(csv, /Lead ID,Created At,Full Name/);
  assert.match(csv, /priya@helioclinic.com/);
  assert.match(csv, /Avery Chen/);
  closeDb();
});

serial("the same fixture run twice updates one CRM row", async () => {
  const fixture = fixtures.find((item) => item.key === "cold");
  await runPipeline(fixture.input, { id: fixture.id, now: fixture.sampleNow });
  await runPipeline(fixture.input, { id: fixture.id, now: fixture.sampleNow });
  const cold = (await listLeads()).filter((item) => item.id === fixture.id);
  assert.equal(cold.length, 1);
  assert.equal(cold[0].tier, "cold");
  closeDb();
});

serial("openai mode without a key fails before anything is written", async () => {
  process.env.LLM_MODE = "openai";
  delete process.env.LLM_API_KEY;
  const before = (await listLeads()).length;
  const result = await runPipeline(fixtures[0].input, { id: "lead_should_not_exist" });
  assert.equal(result.ok, false);
  assert.match(result.errors.llm, /LLM_API_KEY/);
  const after = await listLeads();
  assert.equal(after.some((item) => item.id === "lead_should_not_exist"), false);
  assert.equal(after.length, before);
  process.env.LLM_MODE = "mock";
  closeDb();
});

serial("enrichLead in mock mode does not call the network", async () => {
  const { validateLead, scoreLead, routeLead } = require("../src/lib/lead-logic");
  const validated = validateLead(fixtures[1].input);
  const scored = scoreLead(validated.lead);
  const routing = routeLead(validated.lead, scored);
  const enrichment = await enrichLead(validated.lead, scored, routing);
  assert.equal(enrichment.provider, "mock");
  assert.equal(enrichment.industry, "Logistics");
});

test("csv quoting wraps commas, quotes, and newlines", () => {
  assert.equal(csvEscape("plain"), "plain");
  assert.equal(csvEscape('she said "hi"'), '"she said ""hi"""');
  assert.equal(csvEscape("a, b"), '"a, b"');
  const csv = leadsToCsv([
    {
      id: "lead_x",
      createdAt: "2026-04-14T00:00:00.000Z",
      name: "Ada, Owner",
      email: "ada@acme.com",
      company: "Acme",
      role: "Founder",
      website: "",
      message: "Line one\nLine two",
      budgetUsd: null,
      budgetLabel: "Not specified",
      timeline: "exploring",
      source: "test",
      score: 10,
      tier: "cold",
      owner: "Nurture sequence",
      ownerRole: "Marketing",
      channel: "#nurture-digest",
      slaMinutes: 1440,
      routeReason: "Score under 40.",
      industry: "Professional services",
      companySize: "Unknown",
      intentSummary: "Curious.",
      painPoints: ["one", "two"],
      personalizationHooks: ["Founder"],
      nextAction: "Wait",
      draftSubject: "Hello",
      draftBody: "Body",
      llmProvider: "mock",
      llmModel: "mock-lead-autopilot-v1",
      alertStatus: "stored",
      origin: "typescript",
      steps: [],
      breakdown: {},
      flags: [],
      budgetBand: "unknown",
    },
  ]);
  assert.match(csv, /"Ada, Owner"/);
  assert.match(csv, /"Line one\nLine two"/);
  assert.match(csv, /one \| two/);
});

test("normalizeEnrichment rejects a model payload that dropped the draft", () => {
  assert.throws(() => normalizeEnrichment({ industry: "Healthcare" }, "openai", "gpt-4o-mini"), /missing/);
});
