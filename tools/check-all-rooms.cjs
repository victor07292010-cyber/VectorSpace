"use strict";
// Fuzz test for every online room game: plays complete games through each game's own
// rendered buttons and fields (exactly like the room UI), checks views stay JSON-safe,
// renders never throw or print undefined/NaN, junk moves are rejected, and games finish.
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = path.join(__dirname, "..", "game-night");
const store = new Map();
// A fake clock so timed games (tick) move forward quickly and deterministically.
let fakeNow = Date.now();
class FakeDate extends Date { constructor(...a) { super(...(a.length ? a : [fakeNow])); } static now() { return fakeNow; } }
const ctx = vm.createContext({ console, Math, JSON, Date: FakeDate, setTimeout, clearTimeout, setInterval, clearInterval, crypto: require("crypto").webcrypto, localStorage: { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) }, sessionStorage: { getItem: () => null, setItem() {} } });
ctx.window = ctx; ctx.addEventListener = () => {};
const files = ["shared.js", "online-core.js", "online-cards.js", "online-boards.js", "online-extras.js", "online-competitive.js", "online-deduction.js", "online-creative.js", "strategy-pack.js", "party-pack.js", "party-night-data.js", "party-night.js"];
for (const f of fs.readdirSync(dir)) if (/^room-.*\.js$/.test(f)) files.push(f);
for (const f of files) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
const games = ctx.RoomGames.games, D = ctx.PartyNightData || {};
const assert = (c, m) => { if (!c) throw new Error(m); };
const unesc = (s) => s.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const attrs = (src) => { const o = {}; src.replace(/([\w-]+)(?:="([^"]*)")?/g, (_, k, v) => { o[k] = v === undefined ? "" : unesc(v); }); return o; };
const camel = (k) => k.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
function controls(html) {
  const buttons = [], fields = [];
  for (const m of html.matchAll(/<button\b([^>]*)>/g)) { const a = attrs(m[1]); if (a["data-move"] !== undefined && a.disabled === undefined) buttons.push(a); }
  for (const m of html.matchAll(/<input\b([^>]*)>/g)) { const a = attrs(m[1]); if (a["data-field"] !== undefined) fields.push({ kind: a.type === "checkbox" ? "check" : a.type === "number" ? "number" : a.type === "range" ? "range" : "text", name: a["data-field"], a }); }
  for (const m of html.matchAll(/<select\b([^>]*)>([\s\S]*?)<\/select>/g)) { const a = attrs(m[1]); if (a["data-field"] !== undefined) fields.push({ kind: "select", name: a["data-field"], options: [...m[2].matchAll(/<option value="([^"]*)"/g)].map((x) => unesc(x[1])) }); }
  return { buttons, fields };
}
const r = (n) => Math.floor(Math.random() * n), pick = (a) => a[r(a.length)];
const words = [...new Set(JSON.stringify(D).match(/[A-Za-z][A-Za-z' -]{1,30}/g))];
function strings(state) { const out = []; JSON.stringify(state, (k, v) => { if (typeof v === "string" && v.length < 60) out.push(v); if (typeof v === "number") out.push(String(v)); return v; }); return out; }
function textFor(state, f) {
  const roll = Math.random();
  if (typeof state.prompt === "string" && /^[A-Z]{3,5}$/.test(state.prompt) && roll < 0.5) return [...state.prompt].map((c) => c + "ack").join(" ");
  if (state.letter && roll < 0.6) { const w = words.filter((x) => x[0].toUpperCase() === String(state.letter).toUpperCase()); if (w.length) return pick(w); }
  if (roll < 0.45) return pick(strings(state));
  if (roll < 0.75) return pick(words);
  if (roll < 0.85) return String(r(2000));
  if (roll < 0.9) return "";
  return pick(["zz", "lol", "a b c", "<b>x</b>", "   ", "1e9", "-4", "the thing"]);
}
function actionFrom(state, btn, fields) {
  const a = {};
  for (const [k, v] of Object.entries(btn)) if (k.startsWith("data-") && k !== "data-move") a[camel(k.slice(5))] = v;
  a.type = btn["data-move"];
  if ("timed" in a) { delete a.timed; a.ms = String(120 + r(900)); }
  for (const f of fields) {
    if (f.kind === "check") { if (Math.random() < 0.5) a[f.name] = f.a.value ?? "on"; continue; }
    if (f.kind === "select") { a[f.name] = pick(f.options); continue; }
    if (f.kind === "number" || f.kind === "range") { const pool = strings(state).filter((x) => /^\d+$/.test(x)); a[f.name] = Math.random() < 0.5 && pool.length ? pick(pool) : String(r(1000)); continue; }
    a[f.name] = textFor(state, f);
  }
  return a;
}

const stats = {};
function play(id, n) {
  const e = games[id];
  let s = e.create(Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: ["Ana", "Bo", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal"][i] })));
  JSON.stringify(s);
  let steps = 0, accepted = 0, stall = 0;
  while (!s.done && steps < (process.env.STEPS ? +process.env.STEPS : 15000)) {
    steps++;
    fakeNow += 50 + r(400);
    if (typeof e.tick === "function") { const c = JSON.parse(JSON.stringify(s)); if (e.tick(c, fakeNow)) { s = c; JSON.stringify(s); if (s.done) break; } }
    const seat = r(n), v = e.view(s, seat);
    JSON.parse(JSON.stringify(v));
    const html = e.render(v);
    assert(typeof html === "string" && !/undefined|NaN|\[object Object\]/.test(html.replace(/<[^>]+>/g, "")), `${id}: render text looks broken: ${(html.replace(/<[^>]+>/g, " ").match(/.{0,40}(undefined|NaN|\[object Object\]).{0,40}/) || [])[0]}`);
    let action;
    if (v.canDraw && Math.random() < 0.6) action = { type: "stroke", round: v.round, points: Array.from({ length: 1 + r(5) }, () => [Math.random(), Math.random()]), color: v.ink, width: 5 };
    else {
      const { buttons, fields } = controls(html);
      if (!buttons.length) { stall++; continue; }
      let pool = buttons;
      if (Math.random() < 0.85) pool = buttons.filter((b) => b["data-move"] !== "force" && b["data-move"] !== "giveup" && b["data-move"] !== "skip" && b["data-move"] !== "cashout");
      if (!pool.length) pool = buttons;
      if (pool.some((b) => b["data-move"] === "trust") && Math.random() < 0.8) pool = pool.filter((b) => b["data-move"] !== "call");
      const play = pool.find((b) => b["data-move"] === "play");
      action = actionFrom(s, play && Math.random() < 0.5 ? play : pick(pool), fields);
    }
    const copy = JSON.parse(JSON.stringify(s));
    if (e.act(copy, seat, action)) { s = copy; accepted++; JSON.stringify(s); }
    if (Math.random() < 0.02) { // junk actions must be rejected without throwing
      const junk = pick([null, 5, "x", [], { type: 3 }, { type: "nope" }, { type: "vote", option: "99" }, { type: "answer", text: null }, { type: "next" }]);
      const c2 = JSON.parse(JSON.stringify(s));
      assert(e.act(c2, seat, junk) === false || junk?.type === "vote" || junk?.type === "next", `${id}: junk accepted ${JSON.stringify(junk)}`);
    }
  }
  for (let i = -1; i < n; i++) e.render(e.view(s, i));
  const st = stats[id] ||= { runs: 0, done: 0, steps: 0, wins: 0 };
  st.runs++; st.steps += steps; if (s.done) { st.done++; assert(Array.isArray(s.winners) && s.winners.every((w) => Number.isInteger(w) && w >= 0 && w < n), `${id}: winners`); if (s.winners.length) st.wins++; }
}
const only = process.argv[2] ? process.argv[2].split(",") : null, runs = +(process.argv[3] || 4);
for (const id of Object.keys(games)) {
  if (only && !only.includes(id)) continue;
  const e = games[id];
  assert(e.title && e.min >= 1 && e.max <= 8, `${id}: metadata`);
  const counts = [...new Set([e.min, Math.min(e.max, Math.max(e.min, 4)), e.max])];
  for (const n of counts) for (let k = 0; k < runs; k++) {
    try { play(id, n); } catch (err) { console.error(`✗ ${id} (${n} players): ${String(err.stack).split("\n").slice(0, 3).join(" | ")}`); process.exitCode = 1; break; }
  }
}
let bad = 0;
for (const [id, st] of Object.entries(stats)) { const ok = st.done === st.runs; if (!ok) bad++; if (!ok || process.env.VERBOSE) console.log(`${ok ? "✓" : "✗"} ${id.padEnd(20)} finished ${st.done}/${st.runs}  avg ${Math.round(st.steps / st.runs)} steps`); }
console.log(`${Object.keys(stats).length} room games fuzzed; ${bad} did not always finish.`);
if (bad) process.exitCode = 1;
