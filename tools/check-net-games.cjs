"use strict";
// Plays real networked matches of every room game through the actual room code and the
// real party server (in memory). Each player only sees its own snapshot and clicks its
// own rendered buttons, so this exercises sync, turn order, hidden info and game endings.
// Usage: node tools/check-net-games.cjs [ids,comma,separated] [players]
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const { createMockServer } = require("./party-mock.cjs");
const dir = path.join(__dirname, "../game-night");
const files = ["shared.js", "party-transport.js", "online-core.js", "online-cards.js", "online-boards.js", "online-extras.js", "online-competitive.js", "online-deduction.js", "online-creative.js", "strategy-pack.js", "party-pack.js", "party-night-data.js", "party-night.js"];
for (const f of fs.readdirSync(dir)) if (/^room-.*\.js$/.test(f)) files.push(f);
const sources = files.map((f) => [f, fs.readFileSync(path.join(dir, f), "utf8")]);
const server = createMockServer({ latency: 1 });
// SPEED=20 makes game clocks (timers, fuses, deadlines) run 20× faster inside the rooms.
const SPEED = +(process.env.SPEED || 1), t0 = Date.now();
class FastDate extends Date { constructor(...a) { super(...(a.length ? a : [FastDate.now()])); } static now() { return t0 + (Date.now() - t0) * SPEED; } }

function world() {
  const store = new Map();
  const c = vm.createContext({ console: { ...console, error() {} }, crypto: require("node:crypto").webcrypto, URL, WebSocket: server.MockWebSocket, setTimeout, clearTimeout, setInterval, clearInterval, Date: FastDate, Math, JSON, sessionStorage: { getItem: (k) => store.get(k), setItem: (k, v) => store.set(k, v) }, localStorage: { getItem: () => null, setItem() {} } });
  c.window = c; c.addEventListener = () => {}; c.VECTORSPACE_PARTY_SERVER = "ws://party.mock";
  for (const [f, src] of sources) vm.runInContext(src, c, { filename: f });
  return c;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(check, label, ms = 8000) { const t = Date.now(); while (!check()) { if (Date.now() - t > ms) throw Error("Timed out: " + label); await sleep(5); } }

const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attrs = (src) => { const o = {}; src.replace(/([\w-]+)(?:="([^"]*)")?/g, (_, k, v) => { o[k] = v === undefined ? "" : unesc(v); }); return o; };
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const words = ["apple", "tiger", "pizza", "ocean", "rocket", "castle", "banana", "guitar", "Paris", "42", "7", "100", "yes", "no"];

// Builds one action exactly like online-ui.js does for a click, from a player's own view.
function chooseAction(c, v) {
  if (v.canDraw && Math.random() < 0.5) return { type: "stroke", round: v.round, points: [[Math.random(), Math.random()], [Math.random(), Math.random()]], color: v.ink || "#26334a", width: 5 };
  const html = c.RoomGames.games[c.GameNightRoom.data().snapshot.gameId].render(v);
  const buttons = [];
  for (const m of html.matchAll(/<button\b([^>]*)>/g)) { const a = attrs(m[1]); if (a["data-move"] !== undefined && a.disabled === undefined) buttons.push(a); }
  let pool = buttons.filter((b) => !["force", "giveup", "skip", "vote_now", "cashout"].includes(b["data-move"]));
  if (!pool.length || Math.random() < 0.03) pool = buttons.filter((b) => b["data-move"] !== "cashout");
  if (!pool.length) pool = buttons;
  if (!pool.length) return null;
  const b = pool.find((x) => x["data-move"] === "play" && Math.random() < 0.4) || pick(pool);
  const a = {};
  for (const [k, val] of Object.entries(b)) if (k.startsWith("data-") && k !== "data-move") a[camel(k.slice(5))] = val;
  a.type = b["data-move"];
  for (const m of html.matchAll(/<input\b([^>]*)>/g)) { const f = attrs(m[1]); if (f["data-field"] === undefined) continue; if (f.type === "checkbox") { if (Math.random() < 0.5) a[f["data-field"]] = f.value ?? "on"; } else if (f.type === "range" || f.type === "number") { const lo = +(f.min || 0), hi = +(f.max || lo + 20); a[f["data-field"]] = String(lo + Math.floor(Math.random() * (hi - lo + 1))); } else a[f["data-field"]] = pick(words); }
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) { const f = attrs(m[1]); if (f["data-field"] !== undefined) { const opts = [...m[2].matchAll(/<option value="([^"]*)"/g)].map((x) => unesc(x[1])); if (opts.length) a[f["data-field"]] = pick(opts); } }
  return a;
}

async function match(id, n, maxMoves) {
  const worlds = Array.from({ length: n }, world), rooms = worlds.map((w) => w.GameNightRoom);
  const [host, ...guests] = rooms;
  host.create("P0", id); await until(() => host.data().status === "connected", "host");
  for (let i = 0; i < guests.length; i++) { guests[i].join("P" + (i + 1), host.data().code); await until(() => guests[i].data().status === "connected", "join"); }
  await until(() => rooms.every((r) => r.data().snapshot?.players.length === n), "everyone listed");
  if (host.data().snapshot.gameId !== id) host.choose(id);
  await until(() => rooms.every((r) => r.data().snapshot.gameId === id), "choice");
  for (const g of guests) g.ready(true);
  await until(() => host.data().snapshot.players.every((p) => p.ready), "ready");
  host.start(); await until(() => rooms.every((r) => r.data().snapshot.phase === "playing"), "start");
  let moves = 0, errors = [];
  while (moves < maxMoves) {
    const s = host.data().snapshot;
    if (s.done || s.game?.done) break;
    const i = Math.floor(Math.random() * n), r = rooms[i], d = r.data();
    if (!d.snapshot?.game) { await sleep(2); continue; }
    const a = chooseAction(worlds[i], d.snapshot.game);
    if (a) { r.move(a); moves++; }
    await sleep(Math.random() < 0.3 ? 4 : 1);
    for (const x of rooms) { const e = x.data().error || ""; if (/could not be completed/.test(e)) errors.push(e); }
    if (errors.length) break;
  }
  const same = () => rooms.every((r) => JSON.stringify(r.data().snapshot.game?.winners) === JSON.stringify(host.data().snapshot.game?.winners) && r.data().snapshot.revision === host.data().snapshot.revision);
  try { await until(same, "screens settle", 1500); } catch {}
  const done = !!host.data().snapshot.game?.done;
  // Every player's final screen must agree with the host about the result.
  const agree = rooms.every((r) => JSON.stringify(r.data().snapshot.game?.winners) === JSON.stringify(host.data().snapshot.game?.winners));
  if (process.env.DEBUG) { const g = host.data().snapshot.game; console.log(JSON.stringify({ phase: g.phase, stage: g.stage, turn: g.turn, msg: g.message, tokens: g.tokens, scores: g.scores })); }
  rooms.forEach((r) => r.leave());
  return { done, moves, errors, agree };
}

(async () => {
  const probe = world();
  const all = Object.keys(probe.RoomGames.games);
  const ids = process.argv[2] ? process.argv[2].split(",") : all;
  let failed = 0;
  for (const id of ids) {
    const g = probe.RoomGames.games[id];
    const n = Math.max(g.min, Math.min(g.max, +(process.argv[3] || 3)));
    try {
      const res = await match(id, n, +(process.env.MOVES || 2500));
      const ok = !res.errors.length && res.agree;
      if (!ok) failed++;
      console.log(`${ok ? (res.done ? "✓" : "·") : "✗"} ${id.padEnd(20)} ${n}p ${res.done ? "finished" : "still going"} after ${res.moves} moves${res.errors.length ? " ERROR " + res.errors[0] : ""}${res.agree ? "" : " SCREENS DISAGREE"}`);
    } catch (e) { failed++; console.log(`✗ ${id.padEnd(20)} ${e.message}`); }
  }
  console.log(failed ? `${failed} games had problems.` : `All ${ids.length} games ran over the network without errors.`);
  process.exitCode = failed ? 1 : 0;
  setTimeout(() => process.exit(), 50);
})();
