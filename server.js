import express from "express";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import zlib from "zlib";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const INGEST_TOKEN = process.env.INGEST_TOKEN || "dev-token";
// DATA_DIR should point at a Railway volume for persistence across deploys.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const STORE = path.join(DATA_DIR, "store.json");
const SEED = path.join(__dirname, "data", "seed.json");

fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(STORE)) fs.copyFileSync(SEED, STORE);

// Restore the (large) frontend from its gzipped copy to dodge transfer corruption.
const IDX = path.join(__dirname, "public", "index.html");
const IDXGZ = path.join(__dirname, "public", "index.html.gz");
if (fs.existsSync(IDXGZ)) fs.writeFileSync(IDX, zlib.gunzipSync(fs.readFileSync(IDXGZ)));

const app = express();
app.use(express.json({ limit: "8mb" }));
app.use(express.static(path.join(__dirname, "public")));

const read = () => JSON.parse(fs.readFileSync(STORE, "utf8"));
const write = (d) => fs.writeFileSync(STORE, JSON.stringify(d, null, 2));
const slug = (s) =>
  String(s || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9\-_.]/g, "") || "client-" + Date.now();
const parseHandle = (s) =>
  String(s || "").trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/[/?#].*$/, "").replace(/^@/, "");

// Full store for the frontend
app.get("/api/store", (req, res) => res.json(read()));

// Add a client (owned account). Returns the created/existing client id.
app.post("/api/clients", (req, res) => {
  const name = (req.body?.name || "").trim();
  const handle = parseHandle(req.body?.handle);
  if (!name || !handle) return res.status(400).json({ error: "name and handle required" });
  const store = read();
  const id = slug(name);
  if (!store.clients.find((c) => c.id === id))
    store.clients.push({ id, name, ownedHandle: handle, competitors: [], pending: true });
  if (!store.accounts[handle]) store.accounts[handle] = { handle, side: "owned", name, followers: null };
  write(store);
  res.json({ ok: true, id });
});

// Add a competitor to a client
app.post("/api/competitors", (req, res) => {
  const client = req.body?.client;
  const handle = parseHandle(req.body?.handle);
  if (!client || !handle) return res.status(400).json({ error: "client and handle required" });
  const store = read();
  const c = store.clients.find((x) => x.id === client);
  if (!c) return res.status(404).json({ error: "client not found" });
  if (!c.competitors.includes(handle)) c.competitors.push(handle);
  if (!store.accounts[handle]) store.accounts[handle] = { handle, side: "competitor", name: handle, followers: null };
  write(store);
  res.json({ ok: true, competitors: c.competitors });
});

// Pipeline pushes fresh data here (owned pulled via Composio, competitors via snapshot).
// Body: { client, accounts?, posts, replaceClient?: true }
app.post("/api/ingest", (req, res) => {
  if ((req.headers.authorization || "") !== `Bearer ${INGEST_TOKEN}`)
    return res.status(401).json({ error: "unauthorized" });
  const { client, accounts, posts, replaceClient } = req.body || {};
  if (!client || !Array.isArray(posts)) return res.status(400).json({ error: "client and posts[] required" });
  const store = read();
  if (accounts && typeof accounts === "object") store.accounts = { ...store.accounts, ...accounts };
  const c = store.clients.find((x) => x.id === client);
  if (c) delete c.pending;
  if (replaceClient) store.posts = store.posts.filter((p) => p.client !== client);
  const idx = new Map(store.posts.map((p, i) => [p.id, i]));
  for (const p of posts) {
    p.client = client;
    if (idx.has(p.id)) store.posts[idx.get(p.id)] = p;
    else store.posts.push(p);
  }
  store.updatedAt = new Date().toISOString();
  write(store);
  res.json({ ok: true, count: posts.length, updatedAt: store.updatedAt });
});

app.get("/healthz", (req, res) => res.json({ ok: true }));
app.listen(PORT, () => console.log(`Watad Signal on :${PORT}`));
