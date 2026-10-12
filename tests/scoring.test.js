const test = require("node:test");
const assert = require("node:assert/strict");
const { validateLead, scoreLead, routeLead, mockEnrich } = require("../src/lib/lead-logic");
const fixtures = require("../src/lib/fixtures.json");

function lead(overrides) {
  const validated = validateLead({
    name: "Ada Owner",
    email: "ada@acme.com",
    company: "Acme",
    role: "Analyst",
    website: "",
    message: "Hello there, we are just saying hi today.",
    budget: "unknown",
    timeline: "exploring",
    ...overrides,
  });
  assert.equal(validated.ok, true, JSON.stringify(validated.errors));
  return validated.lead;
}

test("budget bands land on the published point values", () => {
  assert.equal(scoreLead(lead({ budget: 18000 })).breakdown.budget, 30);
  assert.equal(scoreLead(lead({ budget: 15000 })).breakdown.budget, 30);
  assert.equal(scoreLead(lead({ budget: 14999 })).breakdown.budget, 22);
  assert.equal(scoreLead(lead({ budget: 5000 })).breakdown.budget, 22);
  assert.equal(scoreLead(lead({ budget: 4999 })).breakdown.budget, 14);
  assert.equal(scoreLead(lead({ budget: 1500 })).breakdown.budget, 14);
  assert.equal(scoreLead(lead({ budget: 1499 })).breakdown.budget, 6);
  assert.equal(scoreLead(lead({ budget: "unknown" })).breakdown.budget, 4);
  assert.equal(scoreLead(lead({ budget: "15000_plus" })).breakdown.budget, 30);
  assert.equal(scoreLead(lead({ budget: "under_1500" })).breakdown.budget, 6);
});

test("timeline, email, seniority, intent, and website add the published points", () => {
  const scored = scoreLead(
    lead({
      timeline: "asap",
      email: "ada@gmail.com",
      role: "Head of Operations",
      website: "acme.com",
      message: "We need an n8n workflow that writes leads into HubSpot.",
    }),
  );
  assert.equal(scored.breakdown.timeline, 25);
  assert.equal(scored.breakdown.emailDomain, 4);
  assert.equal(scored.breakdown.seniority, 12);
  assert.equal(scored.breakdown.intent, 10);
  assert.equal(scored.breakdown.website, 5);
});

test("a work-email founder with a this-week budget clears hot at the boundary", () => {
  const scored = scoreLead(
    lead({
      budget: 15000,
      timeline: "this_quarter",
      role: "Analyst",
      website: "acme.com",
      message: "Hello there, we are just saying hi today.",
    }),
  );
  assert.equal(scored.score, 70);
  assert.equal(routeLead(lead({
    budget: 15000,
    timeline: "this_quarter",
    role: "Analyst",
    website: "acme.com",
    message: "Hello there, we are just saying hi today.",
  }), scored).tier, "hot");
});

test("one point under 70 stays warm and routes to Jordan", () => {
  const built = lead({
    budget: 15000,
    timeline: "this_quarter",
    role: "Analyst",
    website: "",
    message: "Hello there, we are just saying hi today.",
  });
  const scored = scoreLead(built);
  const routing = routeLead(built, scored);
  assert.equal(scored.score, 65);
  assert.equal(routing.tier, "warm");
  assert.equal(routing.owner, "Jordan Hale");
  assert.equal(routing.channel, "#inbound");
  assert.equal(routing.slaMinutes, 240);
});

test("score 40 is warm and score 39 is cold", () => {
  const warmLead = lead({
    budget: 500,
    timeline: "this_year",
    role: "Manager",
    website: "",
    message: "Please add this contact to the CRM.",
  });
  const warmScore = scoreLead(warmLead);
  assert.equal(warmScore.score, 40);
  assert.equal(routeLead(warmLead, warmScore).tier, "warm");

  const coldLead = lead({
    budget: "unknown",
    timeline: "this_quarter",
    role: "Analyst",
    website: "",
    message: "Hello there, we are just saying hi today.",
  });
  const coldScore = scoreLead(coldLead);
  assert.equal(coldScore.score, 39);
  const coldRoute = routeLead(coldLead, coldScore);
  assert.equal(coldRoute.tier, "cold");
  assert.equal(coldRoute.owner, "Nurture sequence");
  assert.equal(coldRoute.channel, "#nurture-digest");
  assert.equal(coldRoute.slaMinutes, 1440);
});

test("hot routing names Avery, #hot-leads, and a 15 minute SLA", () => {
  const fixture = fixtures.find((item) => item.key === "hot");
  const validated = validateLead(fixture.input);
  assert.equal(validated.ok, true);
  const scored = scoreLead(validated.lead);
  const routing = routeLead(validated.lead, scored);
  assert.equal(scored.score, 100);
  assert.equal(routing.tier, "hot");
  assert.equal(routing.owner, "Avery Chen");
  assert.equal(routing.ownerRole, "Senior AE");
  assert.equal(routing.channel, "#hot-leads");
  assert.equal(routing.slaMinutes, 15);
});

test("disposable email or a spam pitch is held even when the rest looks urgent", () => {
  const spam = lead({
    email: "seo@mailinator.com",
    role: "Founder",
    budget: 20000,
    timeline: "asap",
    website: "rankfarm.com",
    message: "Guest post opportunity with backlinks for your readers.",
  });
  const scored = scoreLead(spam);
  const routing = routeLead(spam, scored);
  assert.ok(scored.flags.includes("disposable_email"));
  assert.ok(scored.flags.includes("spam_pattern"));
  assert.equal(scored.score, 0);
  assert.equal(routing.tier, "disqualified");
  assert.equal(routing.owner, "Review queue");
  assert.equal(routing.channel, "#review-queue");
  assert.equal(routing.slaMinutes, 1440);
});

test("a corporate address is worth more than a free inbox", () => {
  const free = scoreLead(lead({ email: "ada@gmail.com" }));
  const work = scoreLead(lead({ email: "ada@acme.com" }));
  assert.equal(free.breakdown.emailDomain, 4);
  assert.equal(work.breakdown.emailDomain, 15);
});

test("mock enrichment is deterministic and follows the tier", () => {
  const fixture = fixtures.find((item) => item.key === "hot");
  const validated = validateLead(fixture.input);
  const scored = scoreLead(validated.lead);
  const routing = routeLead(validated.lead, scored);
  const first = mockEnrich(validated.lead, scored, routing);
  const second = mockEnrich(validated.lead, scored, routing);
  assert.deepEqual(first, second);
  assert.equal(first.provider, "mock");
  assert.equal(first.model, "mock-lead-autopilot-v1");
  assert.equal(first.industry, "Healthcare");
  assert.equal(first.companySize, "201-1,000");
  assert.match(first.draftBody, /^Hi Priya,/);
  assert.match(first.draftSubject, /Helio Clinic/);
  assert.match(first.recommendedNextAction, /15 minutes/);
});

test("a held lead gets an internal note, not a customer email", () => {
  const fixture = fixtures.find((item) => item.key === "review");
  const validated = validateLead(fixture.input);
  const scored = scoreLead(validated.lead);
  const routing = routeLead(validated.lead, scored);
  const enrichment = mockEnrich(validated.lead, scored, routing);
  assert.equal(routing.tier, "disqualified");
  assert.match(enrichment.draftBody, /Do not send/);
  assert.doesNotMatch(enrichment.draftBody, /^Hi /);
});

test("the warm and cold samples land on the expected tiers", () => {
  for (const [key, tier, industry] of [
    ["warm", "warm", "Logistics"],
    ["cold", "cold", "Professional services"],
  ]) {
    const fixture = fixtures.find((item) => item.key === key);
    const validated = validateLead(fixture.input);
    const scored = scoreLead(validated.lead);
    const routing = routeLead(validated.lead, scored);
    assert.equal(routing.tier, tier, key);
    assert.equal(mockEnrich(validated.lead, scored, routing).industry, industry, key);
  }
});

test("validation rejects a blank form and a junk website", () => {
  const blank = validateLead({});
  assert.equal(blank.ok, false);
  assert.ok(blank.errors.name);
  assert.ok(blank.errors.email);
  assert.ok(blank.errors.message);
  assert.ok(blank.errors.budget);
  assert.ok(blank.errors.timeline);
  const site = validateLead({
    name: "Ada Owner",
    email: "ada@acme.com",
    company: "Acme",
    role: "Analyst",
    website: "not a url",
    message: "Hello there, we are just saying hi today.",
    budget: "unknown",
    timeline: "exploring",
  });
  assert.equal(site.ok, false);
  assert.ok(site.errors.website);
});
