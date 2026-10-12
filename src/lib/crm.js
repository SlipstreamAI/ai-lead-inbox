const fs = require("fs");
const path = require("path");
const { leadsToCsv } = require("./lead-logic");

let db = null;
let dbPath = "";

function dataDir() {
  return process.env.DATA_DIR || path.join(process.cwd(), "data");
}

function csvPath() {
  return path.join(dataDir(), "leads.csv");
}

async function getDb() {
  const dir = dataDir();
  fs.mkdirSync(dir, { recursive: true });
  const nextPath = path.join(dir, "crm.sqlite");
  if (db && dbPath === nextPath) return db;
  if (db) {
    db.close();
    db = null;
  }
  const { DatabaseSync } = await import("node:sqlite");
  db = new DatabaseSync(nextPath);
  dbPath = nextPath;
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS alerts (
      id TEXT PRIMARY KEY,
      lead_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      channel TEXT NOT NULL,
      payload TEXT NOT NULL,
      delivery TEXT NOT NULL,
      delivery_status TEXT NOT NULL,
      delivery_detail TEXT NOT NULL
    );
  `);
  return db;
}

function closeDb() {
  if (db) db.close();
  db = null;
  dbPath = "";
}

function parseLead(row) {
  return JSON.parse(row.payload);
}

async function listLeads() {
  const database = await getDb();
  const rows = database.prepare("SELECT payload FROM leads ORDER BY created_at DESC").all();
  return rows.map(parseLead);
}

async function getLead(id) {
  const database = await getDb();
  const row = database.prepare("SELECT payload FROM leads WHERE id = ?").get(id);
  return row ? parseLead(row) : null;
}

async function writeCsv(records) {
  const rows = records || (await listLeads());
  fs.mkdirSync(dataDir(), { recursive: true });
  fs.writeFileSync(csvPath(), leadsToCsv(rows), "utf8");
}

async function saveLead(record) {
  const database = await getDb();
  database
    .prepare(
      `INSERT INTO leads (id, created_at, payload) VALUES (?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET created_at = excluded.created_at, payload = excluded.payload`,
    )
    .run(record.id, record.createdAt, JSON.stringify(record));
  await writeCsv();
  return await getLead(record.id);
}

async function listAlerts() {
  const database = await getDb();
  const rows = database
    .prepare(
      `SELECT id, lead_id, created_at, channel, payload, delivery, delivery_status, delivery_detail
       FROM alerts ORDER BY created_at DESC`,
    )
    .all();
  return rows.map((row) => ({
    id: row.id,
    leadId: row.lead_id,
    createdAt: row.created_at,
    channel: row.channel,
    payload: JSON.parse(row.payload),
    delivery: row.delivery,
    deliveryStatus: row.delivery_status,
    deliveryDetail: row.delivery_detail,
  }));
}

async function getAlertForLead(leadId) {
  const database = await getDb();
  const row = database
    .prepare(
      `SELECT id, lead_id, created_at, channel, payload, delivery, delivery_status, delivery_detail
       FROM alerts WHERE lead_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(leadId);
  if (!row) return null;
  return {
    id: row.id,
    leadId: row.lead_id,
    createdAt: row.created_at,
    channel: row.channel,
    payload: JSON.parse(row.payload),
    delivery: row.delivery,
    deliveryStatus: row.delivery_status,
    deliveryDetail: row.delivery_detail,
  };
}

async function saveAlert(alert) {
  const database = await getDb();
  database
    .prepare(
      `INSERT INTO alerts (id, lead_id, created_at, channel, payload, delivery, delivery_status, delivery_detail)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         payload = excluded.payload,
         delivery = excluded.delivery,
         delivery_status = excluded.delivery_status,
         delivery_detail = excluded.delivery_detail`,
    )
    .run(
      alert.id,
      alert.leadId,
      alert.createdAt,
      alert.channel,
      JSON.stringify(alert.payload),
      alert.delivery,
      alert.deliveryStatus,
      alert.deliveryDetail,
    );
  const lead = await getLead(alert.leadId);
  if (lead) {
    lead.alertId = alert.id;
    lead.alertStatus = alert.deliveryStatus;
    await saveLead(lead);
  }
  return await getAlertForLead(alert.leadId);
}

module.exports = {
  dataDir,
  csvPath,
  getDb,
  closeDb,
  listLeads,
  getLead,
  saveLead,
  listAlerts,
  getAlertForLead,
  saveAlert,
  writeCsv,
};
