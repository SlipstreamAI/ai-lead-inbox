#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");

const writeSample = process.argv.includes("--write-sample");
if (writeSample) {
  process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "lead-sample-"));
}
process.env.LLM_MODE = process.env.LLM_MODE || "mock";
delete process.env.SLACK_WEBHOOK_URL;

const fixtures = require("../src/lib/fixtures.json");
const { runPipeline } = require("../src/lib/pipeline");
const { csvPath, closeDb } = require("../src/lib/crm");

async function main() {
  const leads = [];
  const alerts = [];
  for (const fixture of fixtures) {
    const result = await runPipeline(fixture.input, {
      id: fixture.id,
      now: fixture.sampleNow,
      rand: 0.42,
      origin: "typescript",
      alertId: `alert_sample_${fixture.key}`,
    });
    if (!result.ok) {
      console.error(fixture.key, result.errors);
      process.exitCode = 1;
      continue;
    }
    leads.push(result.lead);
    alerts.push({
      key: fixture.key,
      id: result.alert.id,
      delivery: result.alert.delivery,
      deliveryStatus: result.alert.deliveryStatus,
      deliveryDetail: result.alert.deliveryDetail,
      payload: result.alert.payload,
    });
    console.log(`${fixture.key}\t${result.lead.tier}\t${result.lead.score}\t${result.lead.owner}`);
  }

  const output = {
    mode: "mock",
    model: "mock-lead-autopilot-v1",
    note: "Captured from node cli/autopilot.js --write-sample. No network calls.",
    leads,
    alerts,
  };

  if (writeSample) {
    const samplesDir = path.join(__dirname, "..", "samples");
    fs.mkdirSync(samplesDir, { recursive: true });
    fs.writeFileSync(path.join(samplesDir, "e2e-run.json"), `${JSON.stringify(output, null, 2)}\n`);
    fs.copyFileSync(csvPath(), path.join(samplesDir, "leads.csv"));
    const hot = alerts.find((item) => item.key === "hot");
    fs.writeFileSync(path.join(samplesDir, "slack-alert.json"), `${JSON.stringify(hot.payload, null, 2)}\n`);
    console.log("Wrote samples/e2e-run.json, samples/leads.csv, and samples/slack-alert.json");
  }
  closeDb();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
