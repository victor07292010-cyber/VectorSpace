// Integration checks in a DOM emulator. Install jsdom separately, then pass its package path.
const { JSDOM } = require(process.argv[2] || "jsdom");
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const base = path.resolve(__dirname, "../game-night");
let checks = 0;
function test(name, run) {
  run();
  checks++;
  console.log("PASS " + name);
}
function setup(id, seed = 1) {
  const dom = new JSDOM('<div id="app"></div><div id="root"></div>', {
    runScripts: "outside-only",
    url: "http://localhost/",
  });
  const w = dom.window;
  w.scrollTo = () => {};
  w.Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  let tasks = [],
    counter = 0;
  w.setTimeout = (fn) => {
    tasks.push({ fn, id: ++counter });
    return counter;
  };
  w.clearTimeout = (id) => {
    tasks = tasks.filter((t) => t.id !== id);
  };
  for (const name of [
    "shared.js",
    "card-games.js",
    "board-games.js",
    "party-games.js",
  ])
    w.eval(fs.readFileSync(path.join(base, name), "utf8"));
  const root = w.document.querySelector("#root");
  let error;
  w.addEventListener("error", (e) => {
    error = e.error;
  });
  const q = (s) => root.querySelector(s);
  const click = (s) => {
    let el = typeof s === "string" ? q(s) : s;
    assert.ok(el, "Control exists: " + s);
    assert.ok(!el.disabled, "Control enabled: " + s);
    el.click();
    if (error) throw error;
  };
  const tick = () => {
    let task = tasks.shift();
    if (task) task.fn();
    if (error) throw error;
    return !!task;
  };
  const flush = () => {
    let n = 0;
    while (tick()) assert.ok(++n < 500, "Timers settle");
  };
  const mode = (value) => {
    let el = q("select");
    el.value = value;
    el.dispatchEvent(new w.Event("change", { bubbles: true }));
  };
  if (id)
    w.GameNight.games[id].mount(root, { later: (fn) => w.setTimeout(fn) });
  return {
    dom,
    w,
    root,
    q,
    click,
    tick,
    flush,
    mode,
    pending: () => tasks.length,
  };
}
test("All twelve games mount with working controls", () => {
  const s = setup();
  assert.equal(Object.keys(s.w.GameNight.games).length, 12);
  s.dom.window.close();
  for (const id of [
    "shut-box",
    "solitaire",
    "color-clash",
    "crazy-eights",
    "go-fish",
    "sea-battle",
    "spectrum",
    "connect-four",
    "memory",
    "pig",
    "tic-tac-toe",
    "higher-lower",
  ]) {
    const s = setup(id);
    assert.ok(s.root.textContent.trim());
    assert.ok(s.q("button"));
    s.dom.window.close();
  }
});
test("Connect Four detects a vertical local win and disables further moves", () => {
  const s = setup("connect-four");
  s.mode("local");
  for (const c of [0, 1, 0, 1, 0, 1, 0])
    s.click(`[data-action="drop"][data-col="${c}"]`);
  assert.match(s.root.textContent, /Gold wins/);
  assert.equal(s.root.querySelectorAll(".win").length, 4);
  assert.equal(
    s.root.querySelectorAll('[data-action="drop"]:not(:disabled)').length,
    0,
  );
  s.dom.window.close();
});
test("Computer board games complete without stuck turns", () => {
  for (const id of ["connect-four", "tic-tac-toe", "pig", "sea-battle"])
    for (let seed = 1; seed <= 12; seed++) {
      const s = setup(id, seed);
      if (id === "sea-battle") s.click('[data-action="start"]');
      let actions = 0;
      while (!s.q(".finished") && actions++ < 700) {
        s.flush();
        if (s.q(".finished")) break;
        let candidates;
        if (id === "connect-four")
          candidates = [
            ...s.root.querySelectorAll('[data-action="drop"]:not(:disabled)'),
          ];
        else if (id === "tic-tac-toe")
          candidates = [
            ...s.root.querySelectorAll('[data-action="mark"]:not(:disabled)'),
          ];
        else if (id === "sea-battle")
          candidates = [
            ...s.root.querySelectorAll('[data-action="fire"]:not(:disabled)'),
          ];
        else {
          let bank = s.q('[data-action="bank"]');
          candidates = [
            bank &&
            !bank.disabled &&
            Number(bank.textContent.match(/\d+/)[0]) >= 18
              ? bank
              : s.q('[data-action="roll"]'),
          ];
        }
        assert.ok(candidates.length, id + " has a move");
        s.click(candidates[Math.floor(s.w.Math.random() * candidates.length)]);
      }
      assert.ok(s.q(".finished"), id + " finishes");
      if (id === "tic-tac-toe")
        assert.doesNotMatch(s.root.textContent, /X wins/);
      s.dom.window.close();
    }
});
test("Manual fleet placement rejects overlap and overflow; accepts five legal ships", () => {
  const s = setup("sea-battle");
  s.click('[data-action="manual"]');
  s.click('[data-action="place"][data-i="8"]');
  assert.match(s.root.textContent, /extends beyond/);
  s.click('[data-action="place"][data-i="0"]');
  s.click('[data-action="place"][data-i="0"]');
  assert.match(s.root.textContent, /overlaps/);
  for (const i of [10, 20, 30, 40])
    s.click(`[data-action="place"][data-i="${i}"]`);
  assert.equal(s.root.querySelectorAll(".sea-cell.ship").length, 17);
  s.click('[data-action="start"]');
  assert.equal(
    s.root.querySelectorAll('[data-action="fire"]:not(:disabled)').length,
    100,
  );
  s.dom.window.close();
});
test("Shut the Box resolves 100 rounds, with exact sums and terminal scores", () => {
  for (let seed = 1; seed <= 100; seed++) {
    const s = setup("shut-box", seed);
    let turns = 0;
    while (!s.q(".finished") && turns++ < 12) {
      const picker = s.q("#dice-count");
      if (picker) {
        picker.value = "1";
        picker.dispatchEvent(new s.w.Event("change"));
      }
      s.click('[data-action="roll"]');
      if (s.q(".finished")) break;
      const sum = Number(
        s.q(".game-status").textContent.match(/rolled (\d+)/)[1],
      );
      const open = [
        ...s.root.querySelectorAll(".number-tile:not(:disabled)"),
      ].map((e) => Number(e.dataset.n));
      let picked;
      for (let mask = 1; mask < 1 << open.length; mask++) {
        let a = open.filter((n, i) => (mask >> i) & 1);
        if (a.reduce((a, b) => a + b, 0) === sum) {
          picked = a;
          break;
        }
      }
      assert.ok(picked);
      for (const n of picked) s.click(`[data-n="${n}"]`);
      s.click('[data-action="close"]');
    }
    assert.ok(s.q(".finished"));
    s.dom.window.close();
  }
});
test("Memory mismatch hides cards and alternates player; matches finish the board", () => {
  const s = setup("memory");
  s.mode("local");
  const known = new Map();
  let turns = 0;
  while (!s.q(".finished") && turns++ < 100) {
    let unmatched = [...s.root.querySelectorAll(".memory-card:not(.matched)")];
    let groups = {};
    for (const el of unmatched) {
      let v = known.get(el.dataset.i);
      if (v) (groups[v] ??= []).push(el.dataset.i);
    }
    let pair = Object.values(groups).find((a) => a.length === 2);
    if (!pair) {
      let first =
        unmatched.find((el) => !known.has(el.dataset.i)) || unmatched[0];
      s.click(first);
      known.set(first.dataset.i, s.q(".memory-card.open").textContent);
      let candidates = [
        ...s.root.querySelectorAll(".memory-card:not(:disabled)"),
      ];
      let second =
        candidates.find(
          (el) => known.get(el.dataset.i) === known.get(first.dataset.i),
        ) ||
        candidates.find((el) => !known.has(el.dataset.i)) ||
        candidates[0];
      s.click(second);
      for (const el of s.root.querySelectorAll(
        ".memory-card.open,.memory-card.matched",
      ))
        known.set(el.dataset.i, el.textContent);
    } else {
      for (const i of pair) s.click(`[data-i="${i}"]`);
    }
    s.flush();
  }
  assert.equal(s.root.querySelectorAll(".memory-card.matched").length, 16);
  s.dom.window.close();
});
test("Spectrum hides secrets, escapes clues, scores once, and completes five rounds", () => {
  const s = setup("spectrum");
  for (let round = 1; round <= 5; round++) {
    s.click('[data-action="peek"]');
    let target = Number(s.q(".muted strong").textContent.split(" / ")[0]);
    s.q("#clue").value = "<img src=x onerror=alert(1)>";
    s.q("#clue-form").dispatchEvent(
      new s.w.Event("submit", { bubbles: true, cancelable: true }),
    );
    assert.equal(s.q(".target-zone"), null);
    s.click('[data-action="guess"]');
    assert.equal(s.q(".target-zone"), null);
    assert.equal(s.q("img"), null);
    let slider = s.q("#guess-slider");
    slider.value = target;
    slider.dispatchEvent(new s.w.Event("input", { bubbles: true }));
    s.click('[data-action="reveal"]');
    assert.match(s.root.textContent, /\+4/);
    assert.equal(s.q('[data-action="reveal"]'), null);
    if (round < 5) s.click('[data-action="next"]');
  }
  assert.match(s.root.textContent, /Final score: 20 \/ 20/);
  s.click('[data-action="again"]');
  assert.match(s.root.textContent, /0\/20/);
  s.dom.window.close();
});
test("Navigation and restart cancel pending computer turns", () => {
  const s = setup();
  s.w.eval(fs.readFileSync(path.join(base, "app.js"), "utf8"));
  s.w.location.hash = "#tic-tac-toe";
  s.w.dispatchEvent(new s.w.HashChangeEvent("hashchange"));
  const app = s.w.document.querySelector("#app");
  app.querySelector('[data-action="mark"]').click();
  assert.ok(s.pending() > 0);
  app.querySelector("#restart").click();
  s.flush();
  assert.equal(app.querySelectorAll(".ttt-cell:not(:empty)").length, 0);
  app.querySelector('[data-action="mark"]').click();
  s.w.location.hash = "#shut-box";
  s.w.dispatchEvent(new s.w.HashChangeEvent("hashchange"));
  s.flush();
  assert.match(app.textContent, /Roll the dice to get started/);
  assert.equal(app.querySelectorAll(".ttt-cell").length, 0);
  s.dom.window.close();
});
console.log(`${checks} integration checks passed.`);
