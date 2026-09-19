// Complete game simulations and private-view checks for the additional room games.
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const assert = require("node:assert/strict");
let seed = 18762026;
const random = () =>
  (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
const math = Object.create(Math);
math.random = random;
const engines = {};
const context = vm.createContext({
  console,
  Math: math,
  RoomGames: {
    register(id, game) {
      engines[id] = game;
    },
  },
});
context.window = context;
for (const file of ["shared.js", "online-extras.js", "online-competitive.js"]) {
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../game-night", file), "utf8"),
    context,
    { filename: file },
  );
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const players = (count) =>
  Array.from({ length: count }, (_, i) => ({
    id: "p" + i,
    name: "Player " + (i + 1),
  }));
const pick = (items) => items[Math.floor(random() * items.length)];
let accepted = 0;
function move(game, state, player, action) {
  assert.equal(game.act(state, player, action), true, JSON.stringify(action));
  accepted++;
}
function reject(game, state, player, action) {
  const before = JSON.stringify(state);
  assert.equal(
    game.act(state, player, action),
    false,
    "Reject " + JSON.stringify(action),
  );
  assert.equal(JSON.stringify(state), before, "Rejected move is atomic");
}
function renderAll(game, state) {
  for (let p = 0; p < state.players.length; p++)
    assert.equal(typeof game.render(game.view(state, p)), "string");
}

// Every line is claimed once, boxes have four edges, and scoring retains the turn.
for (let count = 2; count <= 4; count++)
  for (let run = 0; run < 40; run++) {
    const game = engines["dots-boxes"],
      state = game.create(players(count));
    reject(game, state, 1, { type: "edge", edge: 0 });
    reject(game, state, 0, { type: "edge", edge: -1 });
    for (let step = 0; !state.done; step++) {
      assert.ok(step < 24);
      const p = state.turn,
        before = state.scores[p];
      const edge = pick(
        state.edges.map((v, i) => (v === -1 ? i : -1)).filter((i) => i >= 0),
      );
      move(game, state, p, { type: "edge", edge: String(edge) });
      if (!state.done)
        assert.equal(
          state.turn,
          state.scores[p] > before ? p : (p + 1) % count,
        );
      reject(game, state, state.turn, { type: "edge", edge });
      state.boxes.forEach((owner, i) => {
        if (owner < 0) return;
        const r = Math.floor(i / 3),
          c = i % 3;
        assert.ok(
          [r * 3 + c, (r + 1) * 3 + c, 12 + r * 4 + c, 13 + r * 4 + c].every(
            (e) => state.edges[e] >= 0,
          ),
        );
      });
    }
    assert.equal(
      state.scores.reduce((a, b) => a + b),
      9,
    );
    state.scores.forEach((score, p) =>
      assert.equal(score, state.boxes.filter((owner) => owner === p).length),
    );
    assert.ok(
      state.winners.every((p) => state.scores[p] === Math.max(...state.scores)),
    );
    renderAll(game, state);
  }

// Opening legal moves, complete boards, and automatic passes/end conditions.
let reversiPasses = 0;
for (let run = 0; run < 100; run++) {
  const game = engines.reversi,
    state = game.create(players(2));
  assert.deepEqual(clone(game.view(state, 0).legal), [19, 26, 37, 44]);
  reject(game, state, 0, { type: "disc", index: 0 });
  reject(game, state, 1, { type: "disc", index: 19 });
  for (let step = 0; !state.done; step++) {
    assert.ok(step < 60);
    const p = state.turn,
      filled = state.board.filter(Boolean).length;
    const legal = game.view(state, p).legal;
    assert.ok(legal.length);
    move(game, state, p, { type: "disc", index: pick(legal) });
    assert.equal(state.board.filter(Boolean).length, filled + 1);
    if (!state.done && state.turn === p) reversiPasses++;
  }
  const scores = game.view(state, 0).scores;
  assert.ok(state.winners.every((p) => scores[p] === Math.max(...scores)));
  assert.equal(game.view(state, 0).legal.length, 0);
  reject(game, state, state.turn, { type: "disc", index: 0 });
  renderAll(game, state);
}
assert.ok(reversiPasses > 0, "Exercise automatic passes");

// Simultaneous throws stay private until everyone commits; scores span five rounds.
for (let count = 2; count <= 8; count++) {
  const game = engines["rock-paper-scissors"],
    state = game.create(players(count));
  const expected = Array(count).fill(0),
    beats = { rock: "scissors", paper: "rock", scissors: "paper" };
  for (let round = 1; round <= 5; round++) {
    const choices = players(count).map(() =>
      pick(["rock", "paper", "scissors"]),
    );
    reject(game, state, 0, { type: "throw", round: round + 1, choice: "rock" });
    reject(game, state, 0, { type: "throw", round, choice: "lizard" });
    for (let p = 0; p < count; p++) {
      move(game, state, p, { type: "throw", round, choice: choices[p] });
      reject(game, state, p, { type: "throw", round, choice: "paper" });
      if (p < count - 1)
        for (let viewer = 0; viewer < count; viewer++) {
          const view = game.view(state, viewer);
          assert.equal(view.choices, null);
          assert.equal(view.own, viewer <= p ? choices[viewer] : null);
        }
    }
    choices.forEach(
      (choice, p) =>
        (expected[p] += choices.filter(
          (other, q) => p !== q && beats[choice] === other,
        ).length),
    );
    assert.deepEqual(clone(state.scores), expected);
    assert.deepEqual(clone(game.view(state, 0).choices), choices);
    renderAll(game, state);
    if (round < 5) {
      reject(game, state, 1, { type: "next" });
      move(game, state, 0, { type: "next" });
    }
  }
  assert.ok(state.done);
  assert.ok(
    state.winners.every((p) => state.scores[p] === Math.max(...expected)),
  );
}

// Full elimination games include eliminated hosts advancing rounds and truthful/false bids.
let eliminatedHostRounds = 0;
for (let count = 2; count <= 8; count++)
  for (let run = 0; run < 10; run++) {
    const game = engines["liars-dice"],
      state = game.create(players(count));
    for (let step = 0; !state.done; step++) {
      assert.ok(step < 400);
      if (state.phase === "reveal") {
        assert.ok(game.view(state, 0).reveal.dice.every(Array.isArray));
        if (state.counts[0] === 0) eliminatedHostRounds++;
        reject(game, state, 1, { type: "next" });
        move(game, state, 0, { type: "next" });
        assert.equal(state.reveal, null);
        assert.deepEqual(
          clone(state.dice.map((d) => d.length)),
          clone(state.counts),
        );
        continue;
      }
      assert.ok(state.counts[state.turn] > 0);
      for (let p = 0; p < count; p++) {
        const view = game.view(state, p);
        assert.deepEqual(clone(view.dice), clone(state.dice[p]));
        assert.ok(view.dice.every(Number.isInteger));
        assert.equal(view.reveal, null);
      }
      reject(game, state, (state.turn + 1) % count, {
        type: "bid",
        count: 1,
        face: 1,
      });
      reject(game, state, state.turn, { type: "bid", count: 0, face: 1 });
      reject(game, state, state.turn, { type: "bid", count: 1, face: 7 });
      if (!state.bid) {
        reject(game, state, state.turn, { type: "challenge" });
        move(game, state, state.turn, {
          type: "bid",
          count:
            1 + Math.floor(random() * state.counts.reduce((a, b) => a + b)),
          face: 1 + Math.floor(random() * 6),
          round: state.round,
        });
      } else {
        reject(game, state, state.turn, {
          type: "bid",
          count: state.bid.count,
          face: state.bid.face,
        });
        const p = state.turn,
          bid = { ...state.bid },
          actual = state.dice.flat().filter((n) => n === bid.face).length;
        const loser = actual >= bid.count ? p : bid.player,
          before = [...state.counts];
        move(game, state, p, { type: "challenge", round: state.round });
        before[loser]--;
        assert.deepEqual(clone(state.counts), before);
        assert.equal(state.reveal.loser, loser);
        assert.equal(state.reveal.actual, actual);
      }
    }
    assert.equal(state.winners.length, 1);
    assert.equal(state.counts.filter((n) => n > 0).length, 1);
    assert.ok(state.counts[state.winners[0]] > 0);
    renderAll(game, state);
  }
assert.ok(eliminatedHostRounds > 0);

// Higher/lower conserves the whole deck across recycling and completes at ten points.
for (let count = 2; count <= 8; count++)
  for (let run = 0; run < 10; run++) {
    const game = engines["higher-lower"],
      state = game.create(players(count));
    for (let step = 0; !state.done; step++) {
      assert.ok(step < 1000);
      const p = state.turn,
        old = state.current,
        before = state.scores[p],
        type = old.rank <= 7 ? "higher" : "lower";
      reject(game, state, (p + 1) % count, { type });
      reject(game, state, p, { type: "invalid" });
      move(game, state, p, { type });
      assert.equal(
        state.scores[p],
        before +
          (type === "higher"
            ? state.current.rank > old.rank
            : state.current.rank < old.rank),
      );
      assert.equal(
        new Set(
          [...state.stock, ...state.history, state.current].map((c) => c.id),
        ).size,
        52,
      );
      const view = game.view(state, p);
      assert.ok(!("stock" in view));
      assert.ok(view.previous.length <= 10);
    }
    assert.equal(state.scores[state.winners[0]], 10);
    renderAll(game, state);
  }

function allCards(state) {
  return [
    ...state.stock,
    ...state.waste,
    ...state.cols.flat(),
    ...state.found.flat(),
  ];
}
function solitaireInvariant(state, game) {
  assert.equal(allCards(state).length, 52);
  assert.equal(new Set(allCards(state).map((c) => c.id)).size, 52);
  state.found.forEach((f) =>
    f.forEach((c, i) => {
      assert.equal(c.rank, i + 1);
      assert.equal(c.suit, f[0].suit);
    }),
  );
  state.cols.forEach((col) => {
    let faceUp = false;
    col.forEach((c, i) => {
      if (c.up) {
        if (faceUp) {
          assert.equal(col[i - 1].rank, c.rank + 1);
          assert.notEqual(col[i - 1].red, c.red);
        }
        faceUp = true;
      } else assert.ok(!faceUp);
    });
    if (col.length) assert.ok(col.at(-1).up);
  });
  const view = game.view(state, 0);
  assert.ok(!("stock" in view) && !("undo" in view));
  view.cols.forEach((col, c) =>
    col.forEach((card, i) => {
      if (!state.cols[c][i].up) assert.deepEqual(clone(card), { up: false });
    }),
  );
}
const team = engines.solitaire;
for (let run = 0; run < 20; run++) {
  const state = team.create(players(2 + (run % 7)));
  for (let step = 0; step < 400 && !state.done; step++) {
    solitaireInvariant(state, team);
    reject(team, state, (state.turn + 1) % state.players.length, {
      type: "draw",
    });
    reject(team, state, state.turn, {
      type: "select",
      zone: "col",
      col: -1,
      idx: 0,
    });
    if (random() < 0.08 && state.undo.length) {
      move(team, state, state.turn, { type: "undo" });
      continue;
    }
    const sources = [];
    if (state.waste.length) sources.push({ zone: "waste" });
    state.found.forEach((f, col) => {
      if (f.length) sources.push({ zone: "found", col });
    });
    state.cols.forEach((col, c) =>
      col.forEach((card, idx) => {
        if (card.up) sources.push({ zone: "col", col: c, idx });
      }),
    );
    const destinations = [
      ...Array.from({ length: 4 }, (_, col) => ({ zone: "found", col })),
      ...Array.from({ length: 7 }, (_, col) => ({ zone: "col", col, idx: 0 })),
    ];
    const options = [];
    for (const source of sources)
      for (const dest of destinations) {
        const probe = clone({ ...state, undo: [] });
        probe.selected = source;
        if (
          team.act(probe, probe.turn, { type: "select", ...dest }) &&
          probe.moves > state.moves
        )
          options.push([source, dest]);
      }
    if (options.length && random() < 0.82) {
      const [source, destination] = pick(options);
      if (state.selected) state.selected = null;
      const p = state.turn;
      move(team, state, p, { type: "select", ...source });
      move(team, state, p, { type: "select", ...destination });
      if (!state.done) assert.equal(state.turn, (p + 1) % state.players.length);
    } else if (state.stock.length || state.waste.length)
      move(team, state, state.turn, { type: "draw" });
    else break;
  }
  solitaireInvariant(state, team);
  renderAll(team, state);
}
// A legal, one-card-away fixture verifies the cooperative win path.
{
  const state = team.create(players(3)),
    deck = allCards(state);
  state.stock = [];
  state.cols = Array.from({ length: 7 }, () => []);
  state.found = context.GameNight.suits.map((suit) =>
    deck.filter((c) => c.suit === suit).sort((a, b) => a.rank - b.rank),
  );
  state.waste = [state.found[3].pop()];
  move(team, state, 0, { type: "select", zone: "waste" });
  move(team, state, 0, { type: "select", zone: "found", col: 3 });
  assert.ok(state.done);
  assert.deepEqual(clone(state.winners), [0, 1, 2]);
  solitaireInvariant(state, team);
  renderAll(team, state);
}
console.log(
  `PASS ${Object.keys(engines).length} extra room games: ${accepted} accepted moves, full matches, illegal actions, private views, turn passing, automatic passes, recycling, undo, and cooperative victory.`,
);
