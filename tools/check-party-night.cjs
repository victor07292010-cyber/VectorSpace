"use strict";
// Fuzz test for the twenty Party Night room games.
// Plays every game many times through its own rendered buttons and fields (like the room UI does),
// checks views stay JSON-safe, renders never throw, and every game reaches a finish.
const fs = require("fs"), path = require("path"), vm = require("vm");
const dir = path.join(__dirname, "..", "game-night");
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const games = {};
const window = { RoomGames: { games, register(id, e) { games[id] = e; } }, GameNight: { esc, status: (m, d) => `<p class="status${d ? " done" : ""}">${esc(m)}</p>`, expansionCatalog: [] } };
const ctx = vm.createContext({ window, console, Math, JSON, Array, Object, Number, String, Set, Map, Error });
for (const f of ["party-night-data.js", "party-night.js"]) vm.runInContext(fs.readFileSync(path.join(dir, f), "utf8"), ctx, { filename: f });
const D = window.PartyNightData, G = window.GameNight;
const ids = G.partyNightIds;
const assert = (c, m) => { if (!c) throw new Error(m); };
assert(Array.isArray(ids) && ids.length === 20, "20 party night ids");
assert(G.expansionCatalog.length === 20, "20 catalog entries");
ids.forEach((id) => assert(games[id], `engine registered: ${id}`));

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
  for (const f of fields) {
    if (f.kind === "check") { if (Math.random() < 0.5) a[f.name] = f.a.value ?? "on"; continue; }
    if (f.kind === "select") { a[f.name] = pick(f.options); continue; }
    if (f.kind === "number" || f.kind === "range") { const pool = strings(state).filter((x) => /^\d+$/.test(x)); a[f.name] = Math.random() < 0.5 && pool.length ? pick(pool) : String(r(1000)); continue; }
    a[f.name] = textFor(state, f);
  }
  return a;
}

// Secrets that a given seat must not be able to see in its view (views are all that leave the host).
function privacy(id, s, viewer, v) {
  const j = JSON.stringify(v), live = !s.done && s.phase !== "reveal";
  const fail = (what) => { throw new Error(`${id}: seat ${viewer} can see ${what} (phase ${s.phase})`); };
  if (["mind-meld", "this-or-that", "most-likely", "ballpark", "buzz-off", "math-dash", "emoji-decoder", "rank-em"].includes(id) && s.phase === "answer") {
    if (v.answers !== null) fail("everyone's answers");
    if (v.prompt && (v.prompt.answer != null || v.prompt.correct != null)) fail("the answer key");
    if (id === "emoji-decoder" && j.toLowerCase().includes(JSON.stringify(s.prompt.answers[0].toLowerCase())) && s.answers[viewer] === null) fail("the emoji answer");
  }
  if (id === "dictionary-bluff" && s.phase !== "reveal" && !s.done && v.prompt.meaning) fail("the real definition");
  if (["punchline", "acro-night", "dictionary-bluff"].includes(id) && s.phase === "vote" && v.options.some((o) => o.owner !== null)) fail("who wrote what");
  if (id === "doodle-decoy" && viewer === s.decoy && (s.phase === "draw" || s.phase === "vote") && (v.word || j.includes(JSON.stringify(s.word)))) fail("the secret word as the Decoy");
  if (id === "off-the-map" && viewer === s.spy && !s.done && (v.place || v.role)) fail("the location as the Spy");
  if (id === "heist-crew" && live && s.roles[viewer] !== "mole" && (v.moles !== null || /mole/.test(j.replace(/"role":"[a-z]+"/, "").replace(/"moles":null/, "")))) fail("the moles");
  if (id === "fib-pile" && ("hands" in v || "pile" in v)) fail("other hands or the pile");
  if (id === "no-say" && s.phase === "clue" && viewer !== s.turn && v.card) fail("the card");
  if (id === "tall-tale" && s.phase === "pick" && viewer !== s.turn && v.lie !== null) fail("which tale is the lie");
  if (id === "folded-story" && s.phase === "write" && v.stories) fail("the stories");
}
const stats = {};
function play(id, n) {
  const e = games[id];
  let s = e.create(Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: ["Ana", "Bo", "Cy", "Dee", "Eli", "Fay", "Gus", "Hal"][i] })));
  JSON.stringify(s);
  let steps = 0, accepted = 0, stall = 0;
  while (!s.done && steps < 15000) {
    steps++;
    const seat = r(n), v = e.view(s, seat);
    JSON.parse(JSON.stringify(v));
    privacy(id, s, seat, v);
    const html = e.render(v);
    assert(typeof html === "string" && !/undefined|NaN|\[object Object\]/.test(html.replace(/<[^>]+>/g, "")), `${id}: render text looks broken: ${(html.replace(/<[^>]+>/g, " ").match(/.{0,40}(undefined|NaN|\[object Object\]).{0,40}/) || [])[0]}`);
    let action;
    if (v.canDraw && Math.random() < 0.6) action = { type: "stroke", round: v.round, points: Array.from({ length: 1 + r(5) }, () => [Math.random(), Math.random()]), color: v.ink, width: 5 };
    else {
      const { buttons, fields } = controls(html);
      if (!buttons.length) { stall++; continue; }
      let pool = buttons;
      if (Math.random() < 0.85) pool = buttons.filter((b) => b["data-move"] !== "force" && b["data-move"] !== "giveup" && b["data-move"] !== "skip") .concat([]);
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
const only = process.argv[2];
for (const id of ids) {
  if (only && id !== only) continue;
  const e = games[id];
  assert(e.title && e.rules && e.min >= 2 && e.max <= 8, `${id}: metadata`);
  for (let n = e.min; n <= e.max; n++) for (let k = 0; k < 6; k++) {
    try { play(id, n); } catch (err) { console.error(`✗ ${id} (${n} players): ${err.stack.split("\n").slice(0, 3).join(" | ")}`); process.exitCode = 1; break; }
  }
}
let bad = 0;
for (const [id, st] of Object.entries(stats)) { const ok = st.done === st.runs; if (!ok) bad++; console.log(`${ok ? "✓" : "✗"} ${id.padEnd(16)} finished ${st.done}/${st.runs}  avg ${Math.round(st.steps / st.runs)} steps`); }
if (bad) { process.exitCode = 1; console.log(`${bad} games did not always finish`); } else if (!process.exitCode) console.log("Party Night checks passed.");
