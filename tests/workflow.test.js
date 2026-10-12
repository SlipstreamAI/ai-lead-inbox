const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { buildWorkflow, logicSource, render } = require("../scripts/build-workflow");
const fixtures = require("../src/lib/fixtures.json");
const { validateLead, scoreLead, routeLead } = require("../src/lib/lead-logic");

const workflowPath = path.join(__dirname, "..", "n8n", "ai-lead-inbox.workflow.json");

test("the exported workflow matches the builder", () => {
  assert.equal(fs.readFileSync(workflowPath, "utf8"), render());
});

test("the workflow imports as a connected graph and keeps secrets out", () => {
  const workflow = buildWorkflow();
  assert.equal(workflow.name, "AI Lead Inbox -> CRM Autopilot");
  const names = new Set(workflow.nodes.map((node) => node.name));
  assert.equal(names.size, workflow.nodes.length);
  for (const [source, outputs] of Object.entries(workflow.connections)) {
    assert.ok(names.has(source), source);
    for (const branch of outputs.main) {
      for (const link of branch) {
        assert.ok(names.has(link.node), link.node);
        assert.equal(link.type, "main");
      }
    }
  }
  const webhook = workflow.nodes.find((node) => node.name === "Lead webhook");
  assert.equal(webhook.parameters.path, "lead");
  assert.equal(webhook.parameters.httpMethod, "POST");
  assert.equal(webhook.parameters.responseMode, "responseNode");
  const openai = workflow.nodes.find((node) => node.name === "OpenAI direct");
  assert.equal(openai.disabled, true);
  assert.equal(openai.credentials.httpHeaderAuth.id, "PLACEHOLDER_OPENAI_HEADER_AUTH");
  const raw = JSON.stringify(workflow);
  assert.equal(/sk-[a-zA-Z0-9]{8,}/.test(raw), false);
  assert.equal(/xox[baprs]-/.test(raw), false);
  assert.equal(raw.includes("BEGIN PRIVATE"), false);
});

test("embedded scoring matches the module used by the app", () => {
  const workflow = JSON.parse(fs.readFileSync(workflowPath, "utf8"));
  const markerStart = "// LEAD_LOGIC_START";
  const markerEnd = "// LEAD_LOGIC_END";
  for (const name of ["Score and route", "Assemble record"]) {
    const node = workflow.nodes.find((item) => item.name === name);
    const code = node.parameters.jsCode;
    const start = code.indexOf(markerStart);
    const end = code.indexOf(markerEnd);
    assert.ok(start >= 0 && end > start, name);
    assert.equal(code.slice(start + markerStart.length, end).trim(), logicSource());
  }
  const scoreNode = workflow.nodes.find((item) => item.name === "Score and route");
  const extracted = scoreNode.parameters.jsCode.split(markerEnd)[0].split(markerStart)[1];
  const context = { console, URL };
  vm.runInNewContext(
    `${extracted}\nthis.scoreLead = scoreLead;\nthis.routeLead = routeLead;\nthis.validateLead = validateLead;`,
    context,
  );
  for (const fixture of fixtures) {
    const fromModule = validateLead(fixture.input);
    const fromWorkflow = context.validateLead(fixture.input);
    assert.equal(JSON.stringify(fromWorkflow), JSON.stringify(fromModule));
    const moduleScore = scoreLead(fromModule.lead);
    const workflowScore = context.scoreLead(fromWorkflow.lead);
    assert.equal(JSON.stringify(workflowScore), JSON.stringify(moduleScore));
    assert.equal(
      JSON.stringify(context.routeLead(fromWorkflow.lead, workflowScore)),
      JSON.stringify(routeLead(fromModule.lead, moduleScore)),
    );
  }
});
