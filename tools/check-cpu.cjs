// Run with: node tools/check-cpu.cjs [path-to-jsdom]
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
const { JSDOM } = require(process.argv[2] || "jsdom");
const base = path.resolve(__dirname, "../game-night");
const files = [
  "shared.js",
  "online-competitive.js",
  "online-creative.js",
  "cpu-games.js",
];
const source = Object.fromEntries(
  files.map((file) => [file, fs.readFileSync(path.join(base, file), "utf8")]),
);
const ids = [
  "guess-who",
  "dots-boxes",
  "reversi",
  "liars-dice",
  "rock-paper-scissors",
];
const players = [
  { id: "human", name: "Human" },
  { id: "cpu", name: "Computer" },
];
const copy = (value) => JSON.parse(JSON.stringify(value));
let seed = 19092026;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const engines = {},
  math = Object.create(Math);
math.random = random;
const context = vm.createContext({
  Math: math,
  console,
  RoomGames: {
    games: engines,
    register(id, game) {
      engines[id] = game;
    },
  },
});
context.window = context;
for (const file of files)
  vm.runInContext(source[file], context, { filename: file });
const choose = context.GameNightCPU.choose;
function freeze(value) {
  if (value && typeof value === "object") {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
let matches = 0,
  actions = 0;

// Run both seats exclusively through their public/private-player views. No AI
// action may mutate its view, and every proposed action must be engine-legal.
for (const id of ids) {
  const game = engines[id];
  for (let run = 0; run < (id === "reversi" ? 10 : 50); run++) {
    const state = game.create(players);
    for (let step = 0; !state.done; step++) {
      assert.ok(step < 400, `${id} terminates`);
      let actor = state.turn,
        action;
      if (state.phase === "reveal") {
        actor = 0;
        action = { type: "next", round: state.round };
      } else if (id === "guess-who" && state.phase === "setup")
        actor = state.secrets[0] === null ? 0 : 1;
      else if (id === "rock-paper-scissors")
        actor = state.choices[0] === null ? 0 : 1;
      const view = freeze(game.view(state, actor));
      action ||= choose(id, view, random);
      assert.ok(action, `${id} has an action`);
      assert.equal(
        game.act(state, actor, action),
        true,
        `${id}: ${JSON.stringify(action)}`,
      );
      actions++;
      assert.equal(typeof game.render(game.view(state, 0)), "string");
    }
    assert.ok(state.winners.length > 0);
    assert.equal(choose(id, game.view(state, 1), random), null);
    if (id === "dots-boxes")
      assert.equal(
        state.scores.reduce((a, b) => a + b),
        9,
      );
    if (id === "rock-paper-scissors") assert.equal(state.round, 5);
    if (id === "liars-dice")
      assert.equal(state.counts.filter((n) => n > 0).length, 1);
    matches++;
  }
  console.log(`PASS ${id}: complete CPU matches and legal moves`);
}

// Different hidden opponent choices produce the same CPU action with the same
// random draw. Views are all that cross the strategy boundary.
for (const id of ["guess-who", "liars-dice", "rock-paper-scissors"]) {
  const game = engines[id],
    state = game.create(players),
    other = copy(state);
  if (id === "guess-who") {
    state.secrets[0] = 0;
    other.secrets[0] = 23;
  }
  if (id === "liars-dice") {
    state.turn = other.turn = 1;
    state.dice[0] = [1, 1, 1, 1, 1];
    other.dice[0] = [6, 6, 6, 6, 6];
  }
  if (id === "rock-paper-scissors") {
    state.choices[0] = "rock";
    other.choices[0] = "paper";
  }
  assert.deepEqual(
    copy(game.view(state, 1)),
    copy(game.view(other, 1)),
    `${id}: hidden opponent choice stays hidden`,
  );
  assert.deepEqual(
    copy(choose(id, game.view(state, 1), () => 0.42)),
    copy(choose(id, game.view(other, 1), () => 0.42)),
  );
}
const rps = engines["rock-paper-scissors"],
  rpsView = rps.view(rps.create(players), 1),
  frequency = { rock: 0, paper: 0, scissors: 0 };
for (let i = 0; i < 900; i++)
  frequency[choose("rock-paper-scissors", rpsView, random).choice]++;
for (const count of Object.values(frequency))
  assert.ok(count > 240 && count < 360, "Random throws do not favor a move");
console.log("PASS secret-blind decisions and independent random throws");

function setup() {
  const dom = new JSDOM('<main id="root"></main>', {
    runScripts: "outside-only",
    url: "file:///vectorspace/index.html",
  });
  const w = dom.window,
    tasks = new Map();
  let taskId = 0,
    latest,
    errors = [];
  w.Math.random = random;
  w.setTimeout = (fn) => {
    const id = ++taskId;
    tasks.set(id, fn);
    return id;
  };
  w.clearTimeout = (id) => tasks.delete(id);
  w.addEventListener("error", (event) => errors.push(event.error));
  w.RoomGames = {
    games: {},
    register(id, game) {
      this.games[id] = game;
    },
  };
  for (const file of files) w.eval(source[file]);
  const root = w.document.querySelector("#root");
  function mount(id) {
    const game = w.RoomGames.games[id],
      originalCreate = game.create,
      originalAct = game.act;
    game.create = (...args) => (latest = originalCreate(...args));
    game.act = (state, player, action) => {
      const accepted = originalAct(state, player, action);
      if (accepted) latest = state;
      return accepted;
    };
    return w.GameNight.games[id].mount(root);
  }
  function tick() {
    const first = tasks.entries().next().value;
    if (!first) return false;
    tasks.delete(first[0]);
    first[1]();
    assert.deepEqual(errors, []);
    return true;
  }
  function click(action) {
    for (const field of root.querySelectorAll("[data-field]"))
      if (action[field.dataset.field] !== undefined)
        field.value = String(action[field.dataset.field]);
    const button = [
      ...root.querySelectorAll(`[data-move="${action.type}"]`),
    ].find(
      (b) =>
        !b.disabled &&
        Object.entries(b.dataset).every(
          ([key, value]) =>
            key === "move" ||
            action[key] === undefined ||
            String(action[key]) === value,
        ),
    );
    assert.ok(button, `Enabled UI control for ${JSON.stringify(action)}`);
    button.click();
    assert.deepEqual(errors, []);
    assert.equal(
      root.querySelector('[role="alert"]'),
      null,
      "The UI accepts the selected legal move",
    );
  }
  return {
    w,
    root,
    mount,
    tick,
    click,
    tasks,
    latest: () => latest,
    close: () => w.close(),
  };
}

// Complete matches through actual buttons/selects and timer-driven CPU turns.
for (const id of ids) {
  const ui = setup(),
    cleanup = ui.mount(id),
    game = ui.w.RoomGames.games[id];
  for (let step = 0; !ui.latest().done; step++) {
    assert.ok(step < 500, `${id}: UI finishes`);
    const state = ui.latest();
    const view = game.view(state, 0);
    let action = ui.w.GameNightCPU.choose(id, view, random);
    if (state.phase === "reveal") action = { type: "next", round: state.round };
    if (action) ui.click(action);
    else assert.ok(ui.tick(), `${id}: a CPU turn is scheduled`);
  }
  assert.ok(
    ui.root.querySelector(".game-status.finished"),
    `${id}: final result displayed`,
  );
  cleanup();
  assert.equal(ui.tasks.size, 0);
  ui.close();
  console.log(`PASS ${id}: complete offline DOM match`);
}

// An automatic setup choice must not erase a human's unfinished selection.
{
  const ui = setup(),
    cleanup = ui.mount("guess-who");
  const select = ui.root.querySelector('[data-field="character"]');
  select.value = "7";
  select.focus();
  ui.tick();
  assert.equal(ui.root.querySelector('[data-field="character"]').value, "7");
  assert.equal(ui.w.document.activeElement.dataset.field, "character");
  ui.click({ type: "lock", character: 7 });
  assert.equal(ui.latest().phase, "play");
  cleanup();
  ui.close();
}

// Route cleanup cancels pending CPU work. Even an already-queued callback must
// never repaint a newly mounted page or remove its event handler.
for (const id of ["guess-who", "rock-paper-scissors", "dots-boxes"]) {
  const ui = setup(),
    cleanup = ui.mount(id);
  if (id === "dots-boxes") ui.click({ type: "edge", edge: 0 });
  assert.equal(ui.tasks.size, 1);
  const stale = [...ui.tasks.values()][0];
  cleanup();
  assert.equal(ui.tasks.size, 0);
  ui.root.innerHTML = "Next page";
  stale();
  assert.equal(ui.root.textContent, "Next page");
  assert.equal(ui.root.onclick, null);
  ui.close();
}
console.log(
  `PASS timer cleanup, selection preservation, and ${matches} complete CPU matches (${actions} legal actions)`,
);
