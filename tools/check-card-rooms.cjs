"use strict";
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm"), assert = require("node:assert/strict");
let seed = 20260919, games = 0, actions = 0;
const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const choose = values => values[Math.floor(random() * values.length)];
const engines = {};
const context = vm.createContext({ console, Math: Object.assign(Object.create(Math), { random }), RoomGames: { register(id, engine) { engines[id] = engine; } } });
context.window = context;
for (const file of ["shared.js", "online-cards.js"]) vm.runInContext(fs.readFileSync(path.join(__dirname, "../game-night", file), "utf8"), context);
const clone = value => JSON.parse(JSON.stringify(value));
for (const [id, engine] of Object.entries(engines)) {
  for (let count = 2; count <= 6; count++) for (let trial = 0; trial < 30; trial++) {
    const state = engine.create(Array.from({ length: count }, (_, i) => ({ id: String(i), name: `Player ${i + 1}` })));
    let moves = 0;
    while (!state.done) {
      assert.ok(++moves < 10000, `${id}/${count} seats completes`);
      const p = state.turn, view = engine.view(state, p);
      const before = JSON.stringify(state);
      assert.equal(engine.act(state, (p + 1) % count, { type: "draw" }), false);
      assert.equal(engine.act(state, p, { type: "play", card: -999 }), false);
      assert.equal(JSON.stringify(state), before, "Rejected actions do not mutate state");
      let action;
      if (id === "go-fish") action = { type: "ask", rank: choose(view.ranks), target: choose(view.targets) };
      else if (view.playable.length) action = { type: "play", card: choose(view.playable), color: choose(["redc", "blue", "green", "yellow"]), suit: choose(["♠", "♥", "♣", "♦"]) };
      else action = { type: id === "color-clash" && view.drawn !== null ? "keep" : "draw" };
      assert.equal(engine.act(state, p, action), true, `${id} accepts a move chosen from the player's view`);
      actions++;
      const cards = [...state.stock, ...(state.pile || []), ...state.hands.flat()];
      assert.equal(new Set(cards.map(c => c.id)).size, cards.length, "No duplicated cards");
      assert.equal(cards.length + (state.books?.flat().length || 0) * 4, id === "color-clash" ? 104 : 52, "Every card is accounted for");
      for (let viewer = -1; viewer < count; viewer++) {
        const v = engine.view(state, viewer);
        assert.ok(!("hands" in v) && !("stock" in v), "Private stock and opponent hands never leave the host");
        assert.deepEqual(clone(v.hand).map(c => c.id).sort((a,b) => a-b), viewer < 0 ? [] : clone(state.hands[viewer]).map(c => c.id).sort((a,b) => a-b));
      }
    }
    assert.ok(state.winners.length > 0 || id === "color-clash", "Finished matches have winners or the documented blocked draw");
    if (id === "go-fish") assert.equal(state.books.flat().length, 13, "All books collected");
    for (let viewer = -1; viewer < count; viewer++) assert.ok(engine.render(engine.view(state, viewer)).includes("Round complete"));
    games++;
  }
}
console.log(`PASS ${games} complete card-room matches across 2–6 players; ${actions} legal actions, card conservation, invalid moves, ties, private hands and spectator views.`);
