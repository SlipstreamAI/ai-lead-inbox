const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const logicPath = path.join(root, "src", "lib", "lead-logic.js");
const outPath = path.join(root, "n8n", "ai-lead-inbox.workflow.json");

function logicSource() {
  const raw = fs.readFileSync(logicPath, "utf8");
  const marker = "// NODE_EXPORTS";
  const end = raw.indexOf(marker);
  if (end < 0) throw new Error("lead-logic.js is missing the NODE_EXPORTS marker");
  return raw.slice(0, end).trim();
}

function withLogic(prefix, suffix) {
  return `${prefix}\n// LEAD_LOGIC_START\n${logicSource()}\n// LEAD_LOGIC_END\n${suffix}`;
}

function buildWorkflow() {
  const scoreCode = withLogic(
    [
      "// Edit pipelineBaseUrl if n8n is not on the docker compose network.",
      "// Inside compose the Next.js app is http://web:4317. On the host, use http://127.0.0.1:4317.",
      "const CONFIG = {",
      '  pipelineBaseUrl: "http://web:4317",',
      "};",
      "",
    ].join("\n"),
    [
      'const incoming = $input.first().json;',
      "const body =",
      '  incoming.body && typeof incoming.body === "object" && !Array.isArray(incoming.body)',
      "    ? incoming.body",
      "    : incoming;",
      "const validated = validateLead(body);",
      "if (!validated.ok) {",
      '  return [{ json: { ok: "no", errors: validated.errors, config: CONFIG } }];',
      "}",
      "const scored = scoreLead(validated.lead);",
      "const routing = routeLead(validated.lead, scored);",
      "const prompts = buildEnrichmentPrompt(validated.lead, scored, routing);",
      "return [{",
      "  json: {",
      '    ok: "yes",',
      "    config: CONFIG,",
      "    lead: validated.lead,",
      "    scored,",
      "    routing,",
      "    prompts,",
      "  },",
      "}];",
      "",
    ].join("\n"),
  );

  const assembleCode = withLogic(
    "",
    [
      "const prior = $('Score and route').first().json;",
      "const response = $input.first().json;",
      "const enrichment = response.enrichment;",
      "if (!enrichment || !enrichment.draftBody) {",
      '  throw new Error("AI enrich did not return enrichment.draftBody.");',
      "}",
      "const record = assembleRecord(prior.lead, prior.scored, prior.routing, enrichment, {",
      '  id: createId("lead"),',
      "  createdAt: new Date().toISOString(),",
      '  origin: "n8n",',
      "  steps: [",
      '    { name: "Intake", status: "ok", detail: "n8n webhook", ms: 0 },',
      '    { name: "Score", status: "ok", detail: String(prior.scored.score) + " / 100", ms: 0 },',
      '    { name: "Route", status: "ok", detail: prior.routing.tier + " → " + prior.routing.owner, ms: 0 },',
      '    { name: "Enrich", status: "ok", detail: enrichment.provider + " · " + enrichment.model, ms: 0 },',
      "  ],",
      "});",
      "const alert = buildSlackPayload(record);",
      "return [{ json: { record, alert, config: prior.config } }];",
      "",
    ].join("\n"),
  );

  return {
    name: "AI Lead Inbox -> CRM Autopilot",
    nodes: [
      {
        parameters: {
          content:
            "## AI Lead Inbox → CRM Autopilot\n\nA public form posts here. This workflow scores the lead with the same rules as `src/lib/lead-logic.js`, asks the app's AI step to enrich it, writes the CRM row, and posts a Slack-style alert.\n\n**Mock mode needs no API key.** The AI enrich node calls `POST /api/llm/enrich` on the Next.js app. With `LLM_MODE=mock` (the default) that step is deterministic.\n\n1. Import this file.\n2. Open **Score and route** and confirm `pipelineBaseUrl` (compose: `http://web:4317`, host: `http://127.0.0.1:4317`).\n3. Publish the workflow.\n4. Production URL: `POST /webhook/lead`.",
          height: 360,
          width: 460,
          color: 4,
        },
        id: "a1000000-0000-4000-8000-000000000001",
        name: "How this runs",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [-40, -20],
      },
      {
        parameters: {
          content:
            "## Credentials are placeholders\n\nThe live path uses no stored secrets. Scoring is in the Code node. Enrichment, CRM, and the alert are HTTP calls to the app.\n\n**Live model.** Set `LLM_MODE=openai`, `LLM_BASE_URL`, `LLM_API_KEY`, and `LLM_MODEL` on the web service. Or disable **AI enrich**, enable **OpenAI direct**, and connect it between **Valid lead?** and **Assemble record**. Attach a Header Auth credential:\n\n- Name: `Authorization`\n- Value: `Bearer <your key>`\n\nThe credential on that node is `PLACEHOLDER_OPENAI_HEADER_AUTH`. Do not paste a key into this JSON.\n\n**Slack.** Set `SLACK_WEBHOOK_URL` on the web service. The alert node keeps posting to the app, and the app forwards the same payload. To post from n8n itself, point **Post Slack-style alert** at your incoming webhook URL. The body is already Slack Block Kit.\n\n**Google Sheets / Airtable.** Replace **Write CRM row** with the Sheets or Airtable node. The record fields match `samples/leads.csv`.",
          height: 460,
          width: 460,
          color: 6,
        },
        id: "a1000000-0000-4000-8000-000000000002",
        name: "Swap in your accounts",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [1680, 520],
      },
      {
        parameters: {
          content:
            "## Make and Zapier\n\n| Step | Make | Zapier |\n| --- | --- | --- |\n| Trigger | Custom webhook | Webhooks by Zapier, Catch Hook |\n| Score and route | Tools → Run JavaScript, paste `scoreLead` / `routeLead` from `src/lib/lead-logic.js` | Code by Zapier (JavaScript) |\n| Enrich | HTTP → the app `/api/llm/enrich`, or the OpenAI module with JSON response | OpenAI, or Webhooks POST to `/api/llm/enrich` |\n| CRM | Google Sheets Add Row, or Airtable Create Record | Google Sheets or Airtable |\n| Alert | HTTP POST the Slack incoming webhook | Slack: Send Channel Message |\n\nRoute with a Router (Make) or Paths (Zapier) on `tier`: hot ≥ 70, warm ≥ 40, cold, and disqualified when flags are present.",
          height: 340,
          width: 520,
          color: 3,
        },
        id: "a1000000-0000-4000-8000-000000000003",
        name: "Make and Zapier",
        type: "n8n-nodes-base.stickyNote",
        typeVersion: 1,
        position: [-40, 420],
      },
      {
        parameters: {
          httpMethod: "POST",
          path: "lead",
          responseMode: "responseNode",
          options: {},
        },
        id: "b2000000-0000-4000-8000-000000000001",
        name: "Lead webhook",
        type: "n8n-nodes-base.webhook",
        typeVersion: 2,
        position: [480, 220],
        webhookId: "c0ffee00-1111-4111-8111-000000000001",
      },
      {
        parameters: {
          mode: "runOnceForAllItems",
          language: "javaScript",
          jsCode: scoreCode,
        },
        id: "b2000000-0000-4000-8000-000000000002",
        name: "Score and route",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [740, 220],
      },
      {
        parameters: {
          conditions: {
            options: {
              caseSensitive: true,
              leftValue: "",
              typeValidation: "strict",
              version: 2,
            },
            conditions: [
              {
                id: "d4000000-0000-4000-8000-000000000001",
                leftValue: "={{ $json.ok }}",
                rightValue: "yes",
                operator: {
                  type: "string",
                  operation: "equals",
                },
              },
            ],
            combinator: "and",
          },
          options: {},
        },
        id: "b2000000-0000-4000-8000-000000000003",
        name: "Valid lead?",
        type: "n8n-nodes-base.if",
        typeVersion: 2.2,
        position: [1000, 220],
      },
      {
        parameters: {
          respondWith: "json",
          responseBody: "={{ JSON.stringify({ ok: false, errors: $json.errors }) }}",
          options: {
            responseCode: 400,
          },
        },
        id: "b2000000-0000-4000-8000-000000000004",
        name: "Reject invalid lead",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.1,
        position: [1240, 420],
      },
      {
        parameters: {
          method: "POST",
          url: "={{ $json.config.pipelineBaseUrl + '/api/llm/enrich' }}",
          sendBody: true,
          specifyBody: "json",
          jsonBody:
            "={{ JSON.stringify({ lead: $json.lead, scored: $json.scored, routing: $json.routing }) }}",
          options: {
            timeout: 30000,
          },
        },
        id: "b2000000-0000-4000-8000-000000000005",
        name: "AI enrich",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1240, 120],
      },
      {
        parameters: {
          method: "POST",
          url: "https://api.openai.com/v1/chat/completions",
          authentication: "genericCredentialType",
          genericAuthType: "httpHeaderAuth",
          sendBody: true,
          specifyBody: "json",
          jsonBody:
            "={{ JSON.stringify({ model: 'gpt-4o-mini', temperature: 0, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: $json.prompts.system }, { role: 'user', content: $json.prompts.user }] }) }}",
          options: {},
        },
        id: "b2000000-0000-4000-8000-000000000006",
        name: "OpenAI direct",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1240, 680],
        disabled: true,
        credentials: {
          httpHeaderAuth: {
            id: "PLACEHOLDER_OPENAI_HEADER_AUTH",
            name: "OpenAI-compatible Authorization header (placeholder)",
          },
        },
        notes:
          "Disabled. Enable and wire it in place of AI enrich when you want n8n to call an OpenAI-compatible API directly. Attach the placeholder Header Auth credential. Never put the key in this file.",
        notesInFlow: true,
      },
      {
        parameters: {
          mode: "runOnceForAllItems",
          language: "javaScript",
          jsCode: assembleCode,
        },
        id: "b2000000-0000-4000-8000-000000000007",
        name: "Assemble record",
        type: "n8n-nodes-base.code",
        typeVersion: 2,
        position: [1500, 120],
      },
      {
        parameters: {
          method: "POST",
          url: "={{ $json.config.pipelineBaseUrl + '/api/crm/commit' }}",
          sendBody: true,
          specifyBody: "json",
          jsonBody: "={{ JSON.stringify({ record: $json.record }) }}",
          options: {
            timeout: 30000,
          },
        },
        id: "b2000000-0000-4000-8000-000000000008",
        name: "Write CRM row",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [1760, 120],
      },
      {
        parameters: {
          method: "POST",
          url: "={{ $('Assemble record').first().json.config.pipelineBaseUrl + '/api/alerts' }}",
          sendBody: true,
          specifyBody: "json",
          jsonBody:
            "={{ JSON.stringify({ leadId: $json.lead.id, channel: $('Assemble record').first().json.record.channel, payload: $('Assemble record').first().json.alert }) }}",
          options: {
            timeout: 30000,
          },
        },
        id: "b2000000-0000-4000-8000-000000000009",
        name: "Post Slack-style alert",
        type: "n8n-nodes-base.httpRequest",
        typeVersion: 4.2,
        position: [2020, 120],
      },
      {
        parameters: {
          respondWith: "json",
          responseBody: "={{ JSON.stringify($json) }}",
          options: {
            responseCode: 200,
          },
        },
        id: "b2000000-0000-4000-8000-000000000010",
        name: "Reply to caller",
        type: "n8n-nodes-base.respondToWebhook",
        typeVersion: 1.1,
        position: [2280, 120],
      },
    ],
    connections: {
      "Lead webhook": {
        main: [[{ node: "Score and route", type: "main", index: 0 }]],
      },
      "Score and route": {
        main: [[{ node: "Valid lead?", type: "main", index: 0 }]],
      },
      "Valid lead?": {
        main: [
          [{ node: "AI enrich", type: "main", index: 0 }],
          [{ node: "Reject invalid lead", type: "main", index: 0 }],
        ],
      },
      "AI enrich": {
        main: [[{ node: "Assemble record", type: "main", index: 0 }]],
      },
      "Assemble record": {
        main: [[{ node: "Write CRM row", type: "main", index: 0 }]],
      },
      "Write CRM row": {
        main: [[{ node: "Post Slack-style alert", type: "main", index: 0 }]],
      },
      "Post Slack-style alert": {
        main: [[{ node: "Reply to caller", type: "main", index: 0 }]],
      },
    },
    pinData: {},
    settings: {
      executionOrder: "v1",
    },
    staticData: null,
    meta: {
      templateCredsSetupCompleted: true,
    },
    tags: [],
  };
}

function render() {
  return `${JSON.stringify(buildWorkflow(), null, 2)}\n`;
}

function main() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const next = render();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(outPath) ? fs.readFileSync(outPath, "utf8") : "";
    if (current !== next) {
      console.error("n8n/ai-lead-inbox.workflow.json is stale. Run npm run workflow:build.");
      process.exit(1);
    }
    console.log("workflow json matches src/lib/lead-logic.js");
    return;
  }
  fs.writeFileSync(outPath, next);
  console.log(`Wrote ${path.relative(root, outPath)}`);
}

module.exports = { buildWorkflow, render, logicSource };

if (require.main === module) main();
