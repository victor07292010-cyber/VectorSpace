"use strict";
const { JSDOM, VirtualConsole } = require(process.argv[2] || "jsdom");
const fs = require("node:fs"), path = require("node:path"), assert = require("node:assert/strict");
const base = path.resolve(__dirname, "../game-night");
const html = fs.readFileSync(path.join(base, "index.html"), "utf8");
const errors = [], virtualConsole = new VirtualConsole();
virtualConsole.on("jsdomError", e => errors.push(String(e)));
const dom = new JSDOM(html, { url: "https://example.test/VectorSpace/", runScripts: "outside-only", pretendToBeVisual: true, virtualConsole });
const w = dom.window, d = w.document;
w.scrollTo = () => {};
w.matchMedia = media => ({ media, matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} });
for (const script of d.querySelectorAll("script[src]")) w.eval(fs.readFileSync(path.join(base, script.getAttribute("src")), "utf8"));
const ids = () => [...d.querySelectorAll(".game-tile")].map(a => a.hash.replace(/^#(?:online\/)?/, ""));
const click = selector => { const el = d.querySelector(selector); assert.ok(el, selector); el.click(); };
const visit = hash => { w.history.replaceState(null, "", "#" + hash); w.dispatchEvent(new w.HashChangeEvent("hashchange")); };
try {
  assert.equal(w.GameNight.catalog.length, 50);
  assert.equal(new Set(w.GameNight.catalog.map(e => e[0])).size, 50, "Unique game routes");
  assert.equal(Object.keys(w.RoomGames.games).length, 50);
  assert.equal(ids().length, 50);
  assert.equal(d.querySelectorAll(".new-game-badge").length, 20);
  for (const entry of w.GameNight.catalog) {
    const engine = w.RoomGames.games[entry[0]];
    assert.ok(engine && engine.min <= engine.max && engine.max <= 8, `Valid online capacity: ${entry[0]}`);
  }
  click('[data-play-style="group"]');
  assert.ok(ids().length > 15, "Large collection for groups");
  assert.ok(ids().every(id => w.RoomGames.games[id].max >= 3));
  for (const id of ["imposter", "mafia", "pictionary", "farkle", "yacht-dice", "word-scramble", "trivia-quiz", "unique-bid"]) assert.ok(ids().includes(id));
  click('[data-play-style="cpu"]');
  assert.equal(ids().length, 22);
  click('[data-play-style="offline"]');
  const offline = ids();
  assert.equal(offline.length, 27);
  click('[data-play-style="all"]');
  let search = d.querySelector("#game-search");
  search.value = "  MANcala "; search.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert.deepEqual(ids(), ["mancala"]);
  search = d.querySelector("#game-search");
  search.value = '<img src=x onerror="evil()">'; search.dispatchEvent(new w.Event("input", { bubbles: true }));
  assert.equal(ids().length, 0);
  assert.ok(d.querySelector(".empty-library"));
  assert.equal(d.querySelectorAll("img[onerror]").length, 0);
  search = d.querySelector("#game-search"); search.value = ""; search.dispatchEvent(new w.Event("input", { bubbles: true }));
  for (const id of offline) {
    visit(id);
    assert.ok(d.querySelector("#game-root button, #game-root input, #game-root select"), `${id} has real controls`);
    assert.ok(d.querySelector(".rules-panel").textContent.length > 100, `${id} has rules`);
    click("#restart");
    assert.ok(d.querySelector("#game-root").textContent.trim(), `${id} restarts`);
  }
  for (const id of ["imposter", "mafia", "pictionary", "punchline", "heist-crew", "doodle-decoy"]) {
    visit("online/" + id);
    assert.ok(d.querySelector("input"), `${id} routes to the room interface`);
  }
  visit("");
  assert.equal(ids().length, 50);
  assert.equal(errors.length, 0, errors.join("\n"));
  console.log("PASS integrated 50-game library, 20 new labels, 22 CPU modes, 27 offline routes/restarts, group filter, search/escaping, room links and production script order.");
} finally { dom.window.close(); }
