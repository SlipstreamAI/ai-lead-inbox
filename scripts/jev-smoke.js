#!/usr/bin/env node
const fixtures = require("../src/lib/fixtures.json");
const { validateLead, scoreLead } = require("../src/lib/lead-logic");
const { scoreLeadWithJev, JEV_ENDPOINT, JEV_MODEL } = require("../src/lib/jev");

async function main() {
  if (!(process.env.TYPESAFE_API_KEY || "").trim()) {
    console.error("Set TYPESAFE_API_KEY to run the live Jev smoke test.");
    console.error("Example: TYPESAFE_API_KEY=your-key npm run jev:smoke");
    process.exit(1);
  }
  const fixture = fixtures.find((item) => item.key === "hot");
  const validated = validateLead(fixture.input);
  if (!validated.ok) {
    console.error(validated.errors);
    process.exit(1);
  }
  const decision = await scoreLeadWithJev(validated.lead, scoreLead(validated.lead));
  console.log(`POST ${JEV_ENDPOINT}`);
  console.log(`model ${JEV_MODEL}`);
  console.log(`lead ${validated.lead.name} <${validated.lead.email}>`);
  if (!decision) {
    console.error("Jev did not return a usable decision. The app would fall back to the local rubric.");
    process.exit(1);
  }
  const jev = decision.jev;
  console.log(`score ${decision.scored.score} (raw ${jev.rawScore}, confidence ${jev.scoreConfidence})`);
  console.log(`route ${jev.route} → ${decision.routing.owner} (${decision.routing.tier}, confidence ${jev.routeConfidence})`);
  console.log(`intent ${jev.intent} (confidence ${jev.intentConfidence})`);
  console.log(`spam ${jev.gates.spam} · urgent ${jev.gates.urgent} · needs_human ${jev.gates.needsHuman}`);
  console.log(`held ${jev.heldForReview}`);
  console.log(decision.routing.reason);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
