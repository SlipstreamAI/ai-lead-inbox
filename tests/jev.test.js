const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const os = require("os");
const path = require("path");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lead-jev-"));
process.env.DATA_DIR = dir;
process.env.LLM_MODE = "mock";
delete process.env.SLACK_WEBHOOK_URL;
delete process.env.LLM_API_KEY;
delete process.env.TYPESAFE_API_KEY;
delete process.env.JEV_CONFIDENCE_THRESHOLD;

const fixtures = require("../src/lib/fixtures.json");
const { validateLead, scoreLead, routeLead } = require("../src/lib/lead-logic");
const { scoreLeadWithJev, JEV_ENDPOINT, JEV_MODEL, SCORE_LEVELS } = require("../src/lib/jev");
const { runPipeline } = require("../src/lib/pipeline");
const { closeDb } = require("../src/lib/crm");

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

const cold = fixtures.find((item) => item.key === "cold");

function sampleLead() {
  const validated = validateLead(cold.input);
  assert.equal(validated.ok, true);
  return validated.lead;
}

function jevPayload(patch = {}) {
  const answers = {
    score: {
      type: "score",
      score: 9,
      confidence: 0.91,
      probabilities: { 0: 0, 9: 1 },
      legend: { 0: "low", 9: "high" },
    },
    route: {
      type: "choice",
      choice: "avery",
      confidence: 0.88,
      probabilities: { avery: 0.91, jordan: 0.09, nurture: 0, review: 0 },
    },
    intent: {
      type: "choice",
      choice: "automation",
      confidence: 0.8,
      probabilities: { automation: 0.85, crm: 0.1, inbound: 0.05, partnership: 0, other: 0 },
    },
    spam: { type: "noul", noul: 0.02 },
    urgent: { type: "noul", noul: 0.91 },
    needs_human: { type: "noul", noul: 0.1 },
    ...patch,
  };
  return {
    model: JEV_MODEL,
    answers,
    usage: { input_tokens: 334, output_tokens: 50 },
  };
}

function mockFetch(payload, capture) {
  global.fetch = async (url, init) => {
    capture.calls.push({ url, init });
    if (payload instanceof Error) throw payload;
    if (payload && payload.httpStatus) {
      return { ok: false, status: payload.httpStatus, text: async () => payload.body || "nope" };
    }
    return {
      ok: true,
      status: 200,
      text: async () => (typeof payload === "string" ? payload : JSON.stringify(payload)),
    };
  };
}

serial("a missing TYPESAFE_API_KEY skips Jev and does not call the network", async () => {
  delete process.env.TYPESAFE_API_KEY;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("network");
  };
  const lead = sampleLead();
  const rubric = scoreLead(lead);
  const decision = await scoreLeadWithJev(lead, rubric);
  assert.equal(decision, null);
  assert.equal(called, false);
  assert.equal(routeLead(lead, rubric).owner, "Nurture sequence");
});

serial("one Jev call scores, routes, classifies intent, and reads the noul gates", async () => {
  process.env.TYPESAFE_API_KEY = "test-key-not-real";
  const capture = { calls: [] };
  mockFetch(jevPayload(), capture);
  const lead = sampleLead();
  const rubric = scoreLead(lead);
  const decision = await scoreLeadWithJev(lead, rubric);

  assert.equal(capture.calls.length, 1);
  assert.equal(capture.calls[0].url, JEV_ENDPOINT);
  const init = capture.calls[0].init;
  assert.equal(init.method, "POST");
  assert.equal(init.headers.Authorization, "Bearer test-key-not-real");
  assert.equal(init.headers["Content-Type"], "application/json");
  const body = JSON.parse(init.body);
  assert.equal(body.model, "jev-1.13.0");
  assert.equal(body.state.email, lead.email);
  assert.equal(body.state.message, lead.message);
  assert.equal(JSON.stringify(body).includes("test-key-not-real"), false);
  assert.equal(body.questions.score.type, "score");
  assert.ok(Array.isArray(body.questions.score.criteria));
  assert.equal(body.questions.score.criteria.length, SCORE_LEVELS);
  assert.ok(SCORE_LEVELS >= 2 && SCORE_LEVELS <= 10);
  assert.equal(body.questions.route.type, "choice");
  assert.equal(typeof body.questions.route.criteria.avery, "string");
  assert.equal(typeof body.questions.route.criteria.jordan, "string");
  assert.equal(typeof body.questions.route.criteria.nurture, "string");
  assert.equal(typeof body.questions.route.criteria.review, "string");
  assert.equal(body.questions.intent.type, "choice");
  assert.equal(typeof body.questions.intent.criteria.automation, "string");
  assert.equal(body.questions.spam.type, "noul");
  assert.equal(body.questions.spam.criteria, undefined);
  assert.equal(body.questions.urgent.type, "noul");
  assert.equal(body.questions.urgent.criteria, undefined);
  assert.equal(body.questions.needs_human.type, "noul");
  assert.equal(body.questions.needs_human.criteria, undefined);

  assert.equal(decision.scored.score, 100);
  assert.equal(decision.routing.tier, "hot");
  assert.equal(decision.routing.owner, "Avery Chen");
  assert.equal(decision.routing.channel, "#hot-leads");
  assert.equal(decision.jev.used, true);
  assert.equal(decision.jev.model, "jev-1.13.0");
  assert.equal(decision.jev.rawScore, 9);
  assert.equal(decision.jev.scoreConfidence, 0.91);
  assert.equal(decision.jev.route, "avery");
  assert.equal(decision.jev.routeConfidence, 0.88);
  assert.equal(decision.jev.intent, "automation");
  assert.equal(decision.jev.intentConfidence, 0.8);
  assert.equal(decision.jev.gates.spam, 0.02);
  assert.equal(decision.jev.gates.urgent, 0.91);
  assert.equal(decision.jev.gates.needsHuman, 0.1);
  assert.equal(decision.jev.heldForReview, false);
  assert.ok(decision.scored.flags.includes("urgent"));
  assert.equal(decision.scored.flags.includes("low_confidence"), false);
});

serial("confidence under the threshold is held for human review", async () => {
  process.env.TYPESAFE_API_KEY = "test-key-not-real";
  process.env.JEV_CONFIDENCE_THRESHOLD = "0.6";
  const capture = { calls: [] };
  mockFetch(
    jevPayload({
      route: {
        type: "choice",
        choice: "avery",
        confidence: 0.42,
        probabilities: { avery: 0.5, jordan: 0.4, nurture: 0.1, review: 0 },
      },
    }),
    capture,
  );
  const lead = sampleLead();
  const decision = await scoreLeadWithJev(lead, scoreLead(lead));
  assert.equal(decision.routing.tier, "disqualified");
  assert.equal(decision.routing.owner, "Review queue");
  assert.equal(decision.routing.channel, "#review-queue");
  assert.equal(decision.jev.heldForReview, true);
  assert.equal(decision.jev.confidenceThreshold, 0.6);
  assert.match(decision.routing.reason, /0\.42/);
  assert.match(decision.routing.reason, /0\.60/);
  assert.ok(decision.scored.flags.includes("low_confidence"));
  delete process.env.JEV_CONFIDENCE_THRESHOLD;
});

serial("a spam noul or a needs-a-human noul holds the lead even when confidence is high", async () => {
  process.env.TYPESAFE_API_KEY = "test-key-not-real";
  const capture = { calls: [] };
  mockFetch(jevPayload({ spam: { type: "noul", noul: 0.9 } }), capture);
  const lead = sampleLead();
  const spam = await scoreLeadWithJev(lead, scoreLead(lead));
  assert.equal(spam.routing.owner, "Review queue");
  assert.ok(spam.scored.flags.includes("spam_noul"));
  assert.match(spam.routing.reason, /spam/i);

  mockFetch(jevPayload({ needs_human: { type: "noul", noul: 0.64 } }), capture);
  const human = await scoreLeadWithJev(lead, scoreLead(lead));
  assert.equal(human.routing.owner, "Review queue");
  assert.ok(human.scored.flags.includes("needs_human"));
  assert.match(human.routing.reason, /human/i);
});

serial("an HTTP failure or a malformed Jev body falls back instead of throwing", async () => {
  process.env.TYPESAFE_API_KEY = "test-key-not-real";
  const lead = sampleLead();
  const rubric = scoreLead(lead);
  const capture = { calls: [] };
  mockFetch({ httpStatus: 401, body: "unauthorized" }, capture);
  assert.equal(await scoreLeadWithJev(lead, rubric), null);

  mockFetch("not-json", capture);
  assert.equal(await scoreLeadWithJev(lead, rubric), null);

  mockFetch(new Error("socket hang up"), capture);
  assert.equal(await scoreLeadWithJev(lead, rubric), null);

  mockFetch(jevPayload({ route: { type: "choice", choice: "billing", confidence: 1, probabilities: { billing: 1 } } }), capture);
  assert.equal(await scoreLeadWithJev(lead, rubric), null);
});

serial("the pipeline uses Jev when the key is set and the rubric when the call fails", async () => {
  const lead = sampleLead();
  const rubric = scoreLead(lead);
  const expected = routeLead(lead, rubric);
  delete process.env.TYPESAFE_API_KEY;
  let called = false;
  global.fetch = async () => {
    called = true;
    throw new Error("network");
  };
  const plain = await runPipeline(cold.input, { id: "lead_jev_plain", now: cold.sampleNow, rand: 0.2 });
  assert.equal(plain.ok, true);
  assert.equal(called, false);
  assert.equal(plain.lead.score, rubric.score);
  assert.equal(plain.lead.owner, expected.owner);
  assert.equal(plain.lead.jev, undefined);
  closeDb();

  process.env.TYPESAFE_API_KEY = "test-key-not-real";
  const capture = { calls: [] };
  mockFetch(jevPayload(), capture);
  const live = await runPipeline(cold.input, { id: "lead_jev_live", now: cold.sampleNow, rand: 0.2 });
  assert.equal(live.ok, true);
  assert.equal(capture.calls.length, 1);
  assert.equal(live.lead.score, 100);
  assert.equal(live.lead.owner, "Avery Chen");
  assert.equal(live.lead.tier, "hot");
  assert.equal(live.lead.jev.used, true);
  assert.equal(live.lead.jev.routeConfidence, 0.88);
  assert.equal(live.lead.jev.intent, "automation");
  assert.match(live.alert.payload.text, /Jev/);
  assert.match(live.alert.payload.text, /0\.88|88%/);
  assert.ok(live.lead.steps.some((step) => step.name === "Jev" && step.status === "ok"));
  closeDb();

  mockFetch(new Error("timeout"), capture);
  const fellBack = await runPipeline(cold.input, { id: "lead_jev_fallback", now: cold.sampleNow, rand: 0.2 });
  assert.equal(fellBack.ok, true);
  assert.equal(fellBack.lead.score, rubric.score);
  assert.equal(fellBack.lead.owner, expected.owner);
  assert.equal(fellBack.lead.jev, undefined);
  assert.ok(fellBack.lead.steps.some((step) => step.name === "Jev" && /rubric/i.test(step.detail)));
  delete process.env.TYPESAFE_API_KEY;
  closeDb();
});

test.after(() => {
  delete process.env.TYPESAFE_API_KEY;
  delete global.fetch;
});
