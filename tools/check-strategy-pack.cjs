// Complete rules, public/private views, and offline UI checks for the strategy pack.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { JSDOM } = require(process.argv[2] || "jsdom");
const base = path.resolve(__dirname, "../game-night");
const sources = ["shared.js", "strategy-pack.js"].map(file => fs.readFileSync(path.join(base, file), "utf8"));
const copy = value => JSON.parse(JSON.stringify(value));
let seed = 9182026;
const random = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const math = Object.create(Math); math.random = random;
const context = vm.createContext({ Math: math, console, RoomGames: { games: {}, register(id, game) { this.games[id] = game; } } });
context.window = context;
sources.forEach(code => vm.runInContext(code, context));
const engines = context.RoomGames.games, choose = context.GameNight.strategyCPU.choose;
const ids = ["checkers", "mancala", "dominoes", "hex", "nim"];
const players = n => Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "Player " + (i + 1) }));
function freeze(value) { if (value && typeof value === "object") { Object.values(value).forEach(freeze); Object.freeze(value); } return value; }
function rejected(game, state, actor, action) {
  const before = copy(state);
  assert.equal(game.act(state, actor, action), false, "Illegal action rejected");
  assert.deepEqual(copy(state), before, "Rejected action leaves state intact");
}
let matches = 0, actions = 0;
for (const id of ids) {
  const game = engines[id];
  const count = { checkers: 12, mancala: 20, dominoes: 60, hex: 12, nim: 70 }[id];
  for (let run = 0; run < count; run++) {
    const seats = game.min + run % (game.max - game.min + 1), state = game.create(players(seats));
    rejected(game, state, 0, { type: "invalid" });
    rejected(game, state, 1, choose(id, { ...game.view(state, 0), me: 0 }, random));
    rejected(game, state, -1, { type: "take", pile: 0, count: 1 });
    for (let step = 0; !state.done; step++) {
      assert.ok(step < 2000, id + " terminates");
      const actor = state.turn, view = freeze(game.view(state, actor));
      const action = choose(id, view, random);
      assert.ok(action, id + " supplies a move");
      assert.equal(game.act(state, actor, action), true, id + ": " + JSON.stringify(action));
      actions++;
      if (id === "mancala") assert.equal(state.pits.reduce((a, b) => a + b), 48, "Stone conservation");
      if (id === "dominoes") {
        assert.equal(state.hands.reduce((n, hand) => n + hand.length, 0) + state.boneyard.length + state.chain.length, 28, "Tile conservation");
        assert.ok(state.chain.every((tile, i) => !i || state.chain[i - 1].right === tile.left), "Every domino connects");
        assert.equal(Object.hasOwn(game.view(state, actor), "hands"), false);
        assert.equal(Object.hasOwn(game.view(state, actor), "boneyard"), false);
      }
      assert.equal(typeof game.render(game.view(state, actor)), "string");
      assert.equal(typeof game.render(game.spectatorView(state)), "string");
    }
    assert.ok(state.winners.length > 0 && state.winners.every(p => p >= 0 && p < seats));
    assert.equal(choose(id, game.view(state, state.turn), random), null);
    rejected(game, state, state.turn, { type: "place", index: 0 });
    matches++;
  }
  assert.throws(() => game.create(players(game.min - 1)));
  assert.throws(() => game.create(players(game.max + 1)));
  console.log(`PASS ${id}: ${count} complete matches, legal moves, termination, spectators`);
}

// Specific rules which random matches could fail to exercise.
{
  const game = engines.checkers, s = game.create(players(2));
  s.board.fill(0); s.board[42] = 1; s.board[35] = 2; s.board[21] = 2; s.board[3] = 2;
  rejected(game, s, 0, { type: "move", from: 42, to: 33 }); // Must jump.
  assert.ok(game.act(s, 0, { type: "move", from: 42, to: 28 }));
  assert.equal(s.turn, 0); assert.equal(s.chain, 28);
  rejected(game, s, 0, { type: "move", from: 28, to: 19 });
  assert.ok(game.act(s, 0, { type: "move", from: 28, to: 14 }));
  assert.equal(s.turn, 1); assert.equal(s.board[35] + s.board[21], 0);
  const promotion = game.create(players(2)); promotion.board.fill(0); promotion.board[17] = 1; promotion.board[10] = 2; promotion.board[12] = 2;
  assert.ok(game.act(promotion, 0, { type: "move", from: 17, to: 3 }));
  assert.equal(promotion.board[3], -1); assert.equal(promotion.turn, 1); assert.equal(promotion.chain, -1);
}
{
  const game = engines.mancala, s = game.create(players(2));
  assert.ok(game.act(s, 0, { type: "sow", pit: 2 })); assert.equal(s.turn, 0); assert.equal(s.pits[6], 1);
  const capture = game.create(players(2)); capture.pits = [0, 1, 0, 1, 0, 0, 0, 1, 1, 1, 4, 0, 0, 0];
  assert.ok(game.act(capture, 0, { type: "sow", pit: 1 })); assert.equal(capture.pits[6], 5); assert.equal(capture.pits[10], 0);
  rejected(game, game.create(players(2)), 0, { type: "sow", pit: 7 });
}
{
  const game = engines.dominoes, s = game.create(players(4));
  rejected(game, s, 0, { type: "draw" }); rejected(game, s, 0, { type: "pass" });
  rejected(game, s, 0, { type: "play", tile: 100, side: "right" });
  const alternate = copy(s); alternate.hands[1] = [{ id: 48, a: 6, b: 6 }];
  // Keep public counts constant while changing the secret tile values.
  alternate.hands[1] = s.hands[1].map((_, i) => ({ id: 40 + i, a: 6, b: 6 }));
  assert.deepEqual(copy(game.view(s, 0)), copy(game.view(alternate, 0)));
  assert.deepEqual(copy(choose("dominoes", game.view(s, 0), () => .5)), copy(choose("dominoes", game.view(alternate, 0), () => .5)));
  assert.deepEqual(copy(game.spectatorView(s).hand), []);
  const blocked = game.create(players(3)); blocked.chain = [{ left: 6, right: 6 }]; blocked.left = blocked.right = 6; blocked.boneyard = [];
  blocked.hands = [[{ id: 1, a: 0, b: 1 }], [{ id: 8, a: 1, b: 1 }], [{ id: 2, a: 0, b: 2 }]];
  for (let p = 0; p < 3; p++) assert.ok(game.act(blocked, p, { type: "pass" }));
  assert.deepEqual(copy(blocked.winners), [0]);
}
{
  const game = engines.hex, s = game.create(players(2));
  s.board = Array(49).fill(0); for (let i = 0; i < 6; i++) s.board[i * 7] = 1;
  assert.ok(game.act(s, 0, { type: "place", index: 42 })); assert.ok(s.done); assert.equal(s.path.length, 7);
  const horizontal = game.create(players(2)); horizontal.turn = 1; for (let i = 0; i < 6; i++) horizontal.board[21 + i] = 2;
  assert.ok(game.act(horizontal, 1, { type: "place", index: 27 })); assert.deepEqual(copy(horizontal.winners), [1]);
  rejected(game, game.create(players(2)), 0, { type: "place", index: "1e0" });
}
{
  const game = engines.nim, s = game.create(players(8));
  rejected(game, s, 0, { type: "take", pile: 0, count: 4 }); rejected(game, s, 0, { type: "take", pile: 0, count: 0 });
  for (let p = 0; p < 8; p++) assert.ok(game.act(s, p, { type: "take", pile: 3, count: 1 }));
  assert.equal(s.turn, 0);
  const v = game.view(game.create(players(2)), 0), action = choose("nim", v, random); v.piles[action.pile] -= action.count;
  assert.equal(v.piles.reduce((a, b) => a ^ b, 0), 0, "CPU leaves a balanced Nim position");
}
console.log("PASS mandatory captures, promotion, extra turns, captures, blocked hands, hidden data, both Hex directions, 8-seat Nim");

function setup(id) {
  const dom = new JSDOM('<div id="root"></div>', { runScripts: "outside-only", url: "file:///VectorSpace/index.html" });
  const w = dom.window, tasks = new Map(), errors = []; let nextId = 0, latest;
  w.Math.random = random;
  w.setTimeout = fn => { const key = ++nextId; tasks.set(key, fn); return key; };
  w.clearTimeout = key => tasks.delete(key);
  w.addEventListener("error", e => errors.push(e.error));
  w.RoomGames = { games: {}, register(name, engine) { this.games[name] = engine; } };
  sources.forEach(source => w.eval(source));
  const engine = w.RoomGames.games[id], render = engine.render;
  engine.render = v => { latest = copy(v); return render.call(engine, v); };
  const root = w.document.querySelector("#root"), cleanup = w.GameNight.games[id].mount(root);
  function click(action) {
    const b = [...root.querySelectorAll(`[data-move="${action.type}"]`)].find(button => !button.disabled && Object.entries(button.dataset).every(([key, value]) => key === "move" || String(action[key]) === value));
    assert.ok(b, "UI control for " + JSON.stringify(action)); b.click(); assert.deepEqual(errors, []);
  }
  function tick() { const task = tasks.entries().next().value; assert.ok(task, "Computer turn scheduled"); tasks.delete(task[0]); task[1](); assert.deepEqual(errors, []); }
  return { root, w, tasks, cleanup, click, tick, latest: () => latest, close: () => dom.window.close() };
}
for (const id of ids) {
  const ui = setup(id);
  for (let step = 0; !ui.latest().done; step++) {
    assert.ok(step < 2000, id + " UI terminates");
    const action = ui.w.GameNight.strategyCPU.choose(id, ui.latest(), random);
    if (action) {
      if (id === "checkers" && ui.latest().selected !== action.from) ui.click({ type: "select", from: action.from });
      ui.click(action);
    } else ui.tick();
  }
  assert.ok(ui.root.querySelector(".game-status.finished"));
  ui.cleanup(); assert.equal(ui.tasks.size, 0); assert.equal(ui.root.onclick, null); ui.close();
  console.log("PASS " + id + ": complete offline DOM match");
}
for (const id of ids) {
  const ui = setup(id);
  for (let n = 0; ui.latest().turn === 0 && n < 30; n++) {
    const action = ui.w.GameNight.strategyCPU.choose(id, ui.latest(), random);
    if (id === "checkers" && ui.latest().selected !== action.from) ui.click({ type: "select", from: action.from });
    ui.click(action);
  }
  assert.equal(ui.tasks.size, 1); const stale = [...ui.tasks.values()][0];
  ui.cleanup(); assert.equal(ui.tasks.size, 0); ui.root.innerHTML = "Next page"; stale();
  assert.equal(ui.root.textContent, "Next page"); assert.equal(ui.root.onclick, null); ui.close();
}
console.log(`PASS ${matches} full strategy matches, ${actions} engine actions, five DOM matches, and timer cleanup`);
