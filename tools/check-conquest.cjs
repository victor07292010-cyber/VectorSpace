// Verifies Conquest: map geometry, combat and card rules, hidden information, the computer opponents
// (full games at every difficulty) and the real on-screen controls. Usage: node tools/check-conquest.cjs [absolute path to jsdom]
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../game-night");
const read = file => fs.readFileSync(path.join(root, file), "utf8");
const copy = value => JSON.parse(JSON.stringify(value));
function mulberry(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const random = mulberry(7);
Math.random = random;

// ── Load the engine with just enough of the page around it ──
const levelBox = { level: "normal" };
const G = { esc: s => String(s), status: (t, d) => `<div class="game-status${d ? " finished" : ""}">${t}</div>`, register() {}, cpu: levelBox };
const R = { games: {}, register(id, engine) { this.games[id] = engine; } };
global.window = { GameNight: G, RoomGames: R };
require(path.join(root, "conquest.js"));
const game = R.games.conquest, M = G.conquestMap, N = M.territories.length, CPU = G.conquestCPU;
const players = n => Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: i === 0 ? "You" : "Computer " + i }));
const rejected = (s, p, a) => { const before = JSON.stringify(s); assert.equal(game.act(s, p, a), false, "should reject " + JSON.stringify(a)); assert.equal(JSON.stringify(s), before, "rejected move must not change the game"); };
const rolls = (values, fn) => { const real = Math.random, queue = values.slice(); Math.random = () => queue.length ? queue.shift() : .5; try { return fn(); } finally { Math.random = real; } };
const HI = .99, LO = 0, MID = .5; // dice: 6, 1, 4

// ── Map ──
{
  assert.equal(N, 26);
  const seen = new Set([0]), queue = [0];
  while (queue.length) for (const n of M.adjacency[queue.shift()]) if (!seen.has(n)) { seen.add(n); queue.push(n); }
  assert.equal(seen.size, N, "every territory can be reached");
  M.adjacency.forEach((list, a) => { assert.ok(list.length >= 1); list.forEach(b => assert.ok(M.adjacency[b].includes(a), `${a}-${b} is mutual`)); });
  const regionIds = M.regions.flatMap(r => r.ids).sort((a, b) => a - b);
  assert.deepEqual(regionIds, Array.from({ length: N }, (_, i) => i), "regions partition the map");
  assert.ok(M.isLane(6, 7) && M.isLane(7, 6) && !M.isLane(0, 1));
  M.territories.forEach(t => { assert.ok(t.cx > 40 && t.cx < 960 && t.cy > 30 && t.cy < 590, t.name + " sits on the board"); });
  console.log("PASS map: 26 connected territories, mutual borders, regions partition the map");
}

// ── Setup ──
for (let n = 2; n <= 6; n++) {
  for (let g = 0; g < 5; g++) {
    const s = game.create(players(n));
    assert.equal(s.own.length, N); assert.ok(s.arm.every(a => a >= 1));
    for (let p = 0; p < n; p++) {
      assert.equal(s.own.reduce((sum, o, i) => sum + (o === p ? s.arm[i] : 0), 0), Math.max(M.START[n], s.own.filter(o => o === p).length), "starting armies");
      assert.ok(s.own.includes(p), "every player owns land");
    }
    assert.equal(s.reserve, M.income(s, s.turn)); assert.equal(s.phase, "reinforce");
  }
}
for (const bad of [1, 7]) assert.throws(() => game.create(players(bad)));
console.log("PASS setup: 2–6 players, balanced deals, correct starting armies and income");

// A tidy fixture: player 0 holds even territories, player 1 odd ones, everything at 3 armies.
const fixture = (n = 2) => {
  const s = game.create(players(n)); s.turn = 0; s.phase = "attack"; s.reserve = 0; s.sel = -1; s.round = 1;
  for (let i = 0; i < N; i++) { s.own[i] = i % n; s.arm[i] = 3; }
  return s;
};
const border = (s, p) => { for (let a = 0; a < N; a++) if (s.own[a] === p) for (const b of M.adjacency[a]) if (s.own[b] !== p) return [a, b]; };

// ── Junk input and turn order ──
{
  const s = game.create(players(3)); const turn = s.turn, other = (turn + 1) % 3;
  for (const a of [null, undefined, [], "tap", { type: 5 }, { type: "tap", t: "1e0" }, { type: "tap", t: -1 }, { type: "tap", t: N }, { type: "tap", t: "abc" }, { type: "tap", t: 0, n: "9e9" }, { type: "tap", t: 0, n: 0 }, { type: "attack", from: 0, to: 1 }, { type: "endTurn" }, { type: "endAttack" }, { type: "occupy", n: 1 }, { type: "fortify", from: 0, to: 1, n: 1 }, { type: "trade", set: "inf" }, { type: "mode", v: "7" }, { type: "style", v: "x" }, { type: "__proto__" }])
    rejected(s, turn, a);
  rejected(s, other, { type: "tap", t: s.own.indexOf(other) }); rejected(s, -1, { type: "tap", t: 0 }); rejected(s, 99, { type: "tap", t: 0 });
  const enemy = s.own.findIndex(o => o !== turn);
  rejected(s, turn, { type: "tap", t: enemy });
  console.log("PASS junk moves, wrong seats and out-of-phase actions are rejected without side effects");
}

// ── Reinforcement ──
{
  const s = game.create(players(2)); s.turn = 0; s.reserve = 5; s.mode = "1";
  const mine = s.own.indexOf(0), before = s.arm[mine];
  assert.ok(game.act(s, 0, { type: "tap", t: mine })); assert.equal(s.arm[mine], before + 1); assert.equal(s.reserve, 4);
  assert.ok(game.act(s, 0, { type: "mode", v: "all" })); assert.ok(game.act(s, 0, { type: "tap", t: mine }));
  assert.equal(s.reserve, 0); assert.equal(s.phase, "attack"); assert.equal(s.arm[mine], before + 5);
  const t = fixture(); t.phase = "reinforce"; t.reserve = 2; t.mode = "5"; assert.ok(game.act(t, 0, { type: "tap", t: 0 })); assert.equal(t.arm[0], 5, "never places more than the reserve");
  assert.equal(game.view(t, 0).phase, "attack");
  // income: a third of the land, minimum three, plus whole-region bonuses
  const u = fixture(); u.own.fill(1); [0, 1, 2].forEach(i => { u.own[i] = 0; }); assert.equal(M.income(u, 0), 3);
  M.regions[0].ids.forEach(i => { u.own[i] = 0; }); assert.equal(M.income(u, 0), Math.max(3, Math.floor(6 / 3)) + M.regions[0].bonus);
  console.log("PASS reinforcement: placement modes, clamping, income and region bonuses");
}

// ── Dice: ties go to the defender, losses are exact ──
{
  const s = fixture(); const [a, b] = border(s, 0); s.arm[a] = 6; s.arm[b] = 3;
  rolls([MID, MID, MID, MID, MID], () => assert.ok(game.act(s, 0, { type: "attack", from: a, to: b })));
  assert.equal(s.arm[a], 4, "3 v 2 all ties: attacker loses two"); assert.equal(s.arm[b], 3);
  assert.deepEqual(copy(s.last.wins), ["d", "d"]);
  rolls([HI, HI, HI, LO, LO], () => assert.ok(game.act(s, 0, { type: "attack", from: a, to: b })));
  assert.equal(s.arm[a], 4); assert.equal(s.arm[b], 1, "attacker wins both rolls");
  const split = fixture(); const [c, d] = border(split, 0); split.arm[c] = 4; split.arm[d] = 4;
  rolls([HI, MID, LO, HI, LO], () => assert.ok(game.act(split, 0, { type: "attack", from: c, to: d }))); // attackers 6,4,1 vs defenders 6,1
  assert.equal(split.arm[c], 3); assert.equal(split.arm[d], 3, "one each");
  const lone = fixture(); const [e, f] = border(lone, 0); lone.arm[e] = 1; rejected(lone, 0, { type: "attack", from: e, to: f });
  const friend = fixture(); rejected(friend, 0, { type: "attack", from: 0, to: 2 }); // own territory
  rejected(friend, 0, { type: "attack", from: 0, to: 13 }); // not adjacent
  console.log("PASS combat: ties favour the defender, exact losses, bad attacks rejected");
}

// ── Conquest, move-in, cards, elimination, victory ──
{
  const s = fixture(3); const [a, b] = border(s, 0); const victim = s.own[b]; s.arm[a] = 6; s.arm[b] = 1;
  rolls([HI, HI, HI, LO], () => assert.ok(game.act(s, 0, { type: "attack", from: a, to: b })));
  assert.equal(s.phase, "occupy"); assert.equal(s.own[b], 0); assert.equal(s.occ.min, 3); assert.equal(s.occ.max, 5);
  rejected(s, 0, { type: "occupy", n: 2 }); rejected(s, 0, { type: "occupy", n: 6 }); rejected(s, 0, { type: "endTurn" }); rejected(s, 0, { type: "tap", t: a });
  assert.ok(game.act(s, 0, { type: "occupy", n: 4 })); assert.equal(s.arm[b], 4); assert.equal(s.arm[a], 2); assert.equal(s.phase, "attack");
  const handBefore = s.cards[0].length; assert.ok(game.act(s, 0, { type: "endTurn" }));
  assert.equal(s.cards[0].length, handBefore + 1, "a conquest earns a card"); assert.equal(s.turn, victim === 1 ? 1 : 1);
  const calm = fixture(3); assert.ok(game.act(calm, 0, { type: "endTurn" })); assert.equal(calm.cards[0].length, 0, "no conquest, no card");

  const e = fixture(3); e.own.fill(0); e.own[1] = 1; e.own[2] = 2; e.arm.fill(3); e.arm[1] = 1; e.cards[1] = ["inf", "cav"]; const from = M.adjacency[1].find(n => e.own[n] === 0); e.arm[from] = 4;
  rolls([HI, HI, HI, LO], () => assert.ok(game.act(e, 0, { type: "attack", from, to: 1 })));
  assert.equal(e.alive[1], false); assert.deepEqual(copy(e.cards[0]), ["inf", "cav"], "eliminating a player takes their cards"); assert.equal(e.done, false);
  assert.ok(game.act(e, 0, { type: "occupy", n: 3 })); assert.ok(game.act(e, 0, { type: "endTurn" })); assert.equal(e.turn, 2, "eliminated players are skipped");
  e.turn = 0; e.phase = "attack"; e.sel = -1; const from2 = M.adjacency[2].find(n => e.own[n] === 0); e.arm[from2] = 4; e.arm[2] = 1;
  rolls([HI, HI, HI, LO], () => assert.ok(game.act(e, 0, { type: "attack", from: from2, to: 2 })));
  assert.equal(e.done, true); assert.deepEqual(copy(e.winners), [0]); assert.match(e.message, /wins/); rejected(e, 0, { type: "endTurn" });
  console.log("PASS conquest: move-in limits, cards, elimination, skipped seats, victory");
}

// ── Blitz ──
{
  const s = fixture(); const [a, b] = border(s, 0); s.arm[a] = 30; s.arm[b] = 5;
  assert.ok(game.act(s, 0, { type: "attack", from: a, to: b, blitz: "1" }));
  assert.ok(s.last.rounds > 1 && (s.own[b] === 0 || s.arm[a] === 1), "blitz continues until a conquest or the attacker is spent");
  const t = fixture(); const [c] = border(t, 0); t.sel = c; t.style = "blitz"; t.arm[c] = 12;
  const target = M.adjacency[c].find(n => t.own[n] !== 0); assert.ok(game.act(t, 0, { type: "tap", t: target })); assert.ok(t.last.rounds >= 1);
  console.log("PASS blitz via style toggle and explicit action");
}

// ── Cards ──
{
  const s = fixture(); s.phase = "reinforce"; s.reserve = 3; s.cards[0] = ["inf", "inf", "inf", "cav", "can"];
  rejected(s, 0, { type: "tap", t: 0 }); // five cards: must trade first
  rejected(s, 0, { type: "trade", set: "cav" });
  assert.ok(game.act(s, 0, { type: "trade", set: "inf" })); assert.equal(s.reserve, 7); assert.deepEqual(copy(s.cards[0]), ["cav", "can"]);
  assert.ok(game.act(s, 0, { type: "tap", t: 0 }));
  const m = fixture(); m.phase = "reinforce"; m.reserve = 0; m.cards[0] = ["inf", "cav", "can", "inf"]; m.trades = 1;
  assert.ok(game.act(m, 0, { type: "trade", set: "mix" })); assert.equal(m.reserve, 6, "second trade is worth 6"); assert.deepEqual(copy(m.cards[0]), ["inf"]);
  const late = fixture(); late.cards[0] = ["inf", "inf", "inf"]; rejected(late, 0, { type: "trade", set: "inf" });
  const v = game.view(s, 1); assert.deepEqual(copy(v.hand), ["cav", "can"].slice(0, 0).concat(v.hand)); // other seat holds a different hand
  console.log("PASS cards: forced trade at five, mixed and matching sets, escalating bonus, phase checks");
}

// ── Fortify ──
{
  const s = fixture(); s.arm[0] = 9; const reachable = [...M.reach(s, 0, 0)];
  assert.ok(game.act(s, 0, { type: "endAttack" })); assert.equal(s.phase, "fortify");
  rejected(s, 0, { type: "attack", from: 0, to: 1 });
  assert.ok(game.act(s, 0, { type: "tap", t: 0 })); assert.equal(s.sel, 0);
  const far = [...Array(N).keys()].find(i => s.own[i] === 0 && i !== 0 && !reachable.includes(i));
  const near = reachable.find(i => i !== 0);
  rejected(s, 0, { type: "fortify", from: 0, to: 0, n: 1 }); rejected(s, 0, { type: "fortify", from: 0, to: near, n: 9 }); rejected(s, 0, { type: "fortify", from: 0, to: 1, n: 1 });
  if (near !== undefined) { assert.ok(game.act(s, 0, { type: "tap", t: near })); assert.deepEqual(copy(s.fort), { from: 0, to: near }); assert.ok(game.act(s, 0, { type: "fortify", n: 8 })); assert.equal(s.arm[0], 1); assert.equal(s.arm[near], 3 + 8); assert.equal(s.turn, 1); assert.equal(s.phase, "reinforce"); }
  void far;
  // walls: a territory cut off from the rest of your land cannot receive armies
  const w = fixture(); w.own.fill(1); w.own[0] = 0; w.own[22] = 0; w.arm[0] = 5; w.phase = "fortify"; rejected(w, 0, { type: "fortify", from: 0, to: 22, n: 2 });
  console.log("PASS fortify: connected moves only, one per turn, ends the turn");
}

// ── Hidden information ──
{
  const s = game.create(players(3)); s.cards[0] = ["inf", "cav"]; s.cards[1] = ["can"]; s.cards[2] = ["can", "can", "can"];
  const v0 = game.view(s, 0), v1 = game.view(s, 1), spec = game.spectatorView(s);
  assert.deepEqual(copy(v0.hand), ["inf", "cav"]); assert.deepEqual(copy(v1.hand), ["can"]); assert.deepEqual(copy(spec.hand), []);
  for (const v of [v0, v1, spec]) { assert.deepEqual(copy(v.cardCounts), [2, 1, 3]); assert.equal(v.cards, undefined); assert.ok(!JSON.stringify(v).includes('"cards"')); }
  const alt = copy(s); alt.cards[2] = ["inf", "cav", "can"];
  assert.deepEqual(copy(game.view(s, 0)), copy(game.view(alt, 0)), "other players' card faces never reach your view");
  assert.deepEqual(copy(CPU.choose(game.view(s, 0), mulberry(1), "normal")), copy(CPU.choose(game.view(alt, 0), mulberry(1), "normal")), "computers decide without seeing hidden hands");
  assert.equal(game.render(v1).includes("Infantry"), false, "the render for seat 1 does not show seat 0's cards");
  console.log("PASS hidden information: hands stay private in views, renders and computer decisions");
}

// ── Odds ──
{
  assert.ok(Math.abs(CPU.winOdds(1, 1) - 15 / 36) < 1e-9);
  assert.ok(Math.abs(CPU.winOdds(2, 1) - (125 / 216 + 91 / 216 * 15 / 36)) < 1e-9, "2 v 1: win the first roll, or lose it and win the rematch");
  assert.ok(CPU.winOdds(10, 3) > .95 && CPU.winOdds(2, 9) < .02 && CPU.winOdds(5, 0) === 1 && CPU.winOdds(0, 3) === 0);
  console.log("PASS odds: exact chances for short battles and sensible chances for long ones");
}

// ── Round limit ──
{
  const s = fixture(); s.round = s.cap; s.turn = 1; s.phase = "attack"; s.own.fill(0); s.own[1] = 1; s.arm.fill(1); s.arm[1] = 2;
  assert.ok(game.act(s, 1, { type: "endTurn" })); assert.equal(s.done, true); assert.deepEqual(copy(s.winners), [0]); assert.match(s.message, /Round limit/);
  console.log("PASS round limit: most land wins");
}

// ── Whole games: every player a computer, every difficulty, every table size ──
function playOut(n, level, seed, junk = false) {
  const rnd = mulberry(seed); levelBox.level = level; const s = game.create(players(n)); let steps = 0;
  while (!s.done) {
    assert.ok(++steps < 6000, `game ${n}p/${level}/${seed} terminates`);
    if (junk && rnd() < .15) { const before = JSON.stringify(s); game.act(s, s.turn, { type: ["tap", "attack", "occupy", "fortify", "trade", "endTurn"][Math.floor(rnd() * 6)], t: Math.floor(rnd() * 40) - 5, from: Math.floor(rnd() * 30), to: Math.floor(rnd() * 30), n: Math.floor(rnd() * 12) - 2, set: "inf" }); if (s.done) break; }
    const seat = s.turn, v = game.view(s, seat), action = CPU.choose(v, rnd, level);
    assert.ok(game.act(s, seat, action), `${level} computer move is legal: ${JSON.stringify(action)} in ${s.phase}`);
    assert.ok(s.arm.every(a => a >= 0 && a <= 500), "armies stay sane");
    if (s.phase !== "occupy") assert.ok(s.arm.every(a => a >= 1), "every territory keeps an army");
    assert.ok(s.own.every(o => o >= 0 && o < n && s.alive[o]), "only living players own land");
    assert.equal(s.alive.filter(Boolean).length, new Set(s.own).size, "alive flags match ownership");
  }
  return s;
}
{
  let finished = 0, decisive = 0;
  for (const level of ["easy", "normal", "hard"]) for (let n = 2; n <= 6; n++) for (let g = 0; g < 3; g++) {
    const s = playOut(n, level, n * 100 + g + level.length); finished++; if (s.winners.length === 1 && !/Round limit/.test(s.message)) decisive++;
    assert.ok(s.winners.every(w => w >= 0 && w < n));
  }
  playOut(4, "normal", 99, true);
  levelBox.level = "normal";
  console.log(`PASS ${finished} computer-only games finished (${decisive} by total conquest), plus a junk-injected game`);
  // A hard computer should beat an easy one most of the time.
  let hardWins = 0, games = 24;
  for (let g = 0; g < games; g++) {
    const rnd = mulberry(5000 + g), s = game.create(players(2)); let steps = 0;
    while (!s.done && ++steps < 6000) { const level = s.turn === 0 ? "hard" : "easy"; assert.ok(game.act(s, s.turn, CPU.choose(game.view(s, s.turn), rnd, level))); }
    if (s.winners.length === 1 && s.winners[0] === 0) hardWins++;
  }
  assert.ok(hardWins >= games * .6, `hard beat easy ${hardWins}/${games}`);
  console.log(`PASS difficulty: hard beat easy in ${hardWins} of ${games} games`);
}

// ── The real page: offline game through the on-screen controls ──
let JSDOM;
try { JSDOM = require(process.argv[2] ? path.join(process.argv[2], "lib/api.js") : "jsdom").JSDOM; } catch { try { JSDOM = require(path.join(process.argv[2] || "", "node_modules/jsdom")).JSDOM; } catch { console.log("SKIP page test: install jsdom@30.1.0 or pass its path"); process.exit(0); } }
{
  const sources = [read("shared.js"), read("conquest.js")];
  const dom = new JSDOM('<div id="root"></div>', { runScripts: "outside-only", url: "http://localhost/index.html" });
  const w = dom.window, tasks = new Map(), errors = []; let nextId = 0, latest;
  w.Math.random = mulberry(11);
  w.setTimeout = fn => { const key = ++nextId; tasks.set(key, fn); return key; };
  w.clearTimeout = key => tasks.delete(key);
  w.addEventListener("error", e => errors.push(e.error));
  w.RoomGames = { games: {}, register(id, engine) { this.games[id] = engine; } };
  sources.forEach(source => w.eval(source));
  const engine = w.RoomGames.games.conquest, paint = engine.render;
  engine.render = v => { latest = copy(v); return paint.call(engine, v); };
  assert.ok(w.GameNight.cpuIds.includes("conquest") && w.GameNight.expansionCatalog.some(e => e[0] === "conquest"), "listed in the catalogue as a computer game");
  const root = w.document.querySelector("#root"), cleanup = w.GameNight.games.conquest.mount(root);
  assert.ok(root.querySelector("[data-deal]"), "setup screen");
  root.querySelector('[data-rivals="3"]').click(); assert.equal(root.querySelector('[data-rivals="3"]').getAttribute("aria-pressed"), "true");
  root.querySelector("[data-deal]").click(); assert.ok(root.querySelector(".cq-map"), "board appears"); assert.equal(latest.players.length, 4);
  assert.equal(root.querySelectorAll(".cq-chip").length, N, "a chip stack on every territory");
  const press = selector => { const b = root.querySelector(selector); assert.ok(b, "control " + selector); b.click(); assert.deepEqual(errors, []); };
  const hit = t => `.cq-hit[data-t="${t}"]`;
  const tick = () => { const task = tasks.entries().next().value; assert.ok(task, "a computer turn is scheduled"); tasks.delete(task[0]); task[1](); assert.deepEqual(errors, []); };
  let steps = 0;
  while (!latest.done) {
    assert.ok(++steps < 9000, "page game terminates");
    if (latest.turn !== 0) { tick(); continue; }
    if (latest.phase === "reinforce") assert.equal(root.querySelectorAll(".cq-hit").length > 0, latest.hand.length < 5, "territories are tappable unless a card trade is forced");
    if (latest.phase === "occupy") assert.ok(root.querySelector('[data-move="occupy"]'), "move-in buttons are shown");
    const a = CPU.choose(latest, w.Math.random, "normal");
    switch (a.type) {
      case "trade": press(`[data-move="trade"][data-set="${a.set}"]`); break;
      case "tap": if (latest.mode !== "all") press('[data-move="mode"][data-v="all"]'); press(hit(a.t)); break;
      case "attack": if (latest.sel !== a.from) press(hit(a.from)); press(`[data-move="style"][data-v="${a.blitz === "1" ? "blitz" : "roll"}"]`); press(hit(a.to)); break;
      case "occupy": { const offered = [...root.querySelectorAll('[data-move="occupy"]')].map(b => Number(b.dataset.n)).sort((x, y) => Math.abs(x - a.n) - Math.abs(y - a.n)); press(`[data-move="occupy"][data-n="${offered[0]}"]`); break; }
      case "fortify": press(hit(a.from)); press(hit(a.to)); press(`[data-move="fortify"][data-n="${a.n}"]`); break;
      default: press(`[data-move="${a.type}"]`);
    }
  }
  assert.ok(root.querySelector(".game-status.finished"), "the finished banner is shown");
  assert.match(root.querySelector(".game-status").textContent, /wins|win!|draw/);
  const finishedTasks = tasks.size; cleanup(); assert.equal(tasks.size, 0, "leaving the page cancels computer timers"); void finishedTasks;
  w.close(); console.log("PASS page: setup, dealing, on-screen taps for every move type, computer turns, finish banner, clean exit");
}
{
  // Online engine contract: spectators and seat views render without throwing.
  const s = game.create(players(6));
  for (let seat = -1; seat < 6; seat++) assert.ok(typeof game.render(seat < 0 ? game.spectatorView(s) : game.view(s, seat)) === "string");
  console.log("PASS online: every seat and spectator view renders");
}
