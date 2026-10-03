"use strict";
window.GameNight = (() => {
  const games = {};
  const suits = ["♠", "♥", "♣", "♦"];
  const ranks = [
    "",
    "A",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
  ];
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  function shuffle(a) {
    for (let i = a.length - 1; i > 0; i--) {
      let j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  const deck = () =>
    shuffle(
      suits.flatMap((s, si) =>
        Array.from({ length: 13 }, (_, i) => ({
          rank: i + 1,
          suit: s,
          red: si % 2 === 1,
          id: si * 13 + i,
        })),
      ),
    );
  const rank = (r) => ranks[r];
  const label = (c) =>
    `${rank(c.rank)} of ${{ "♠": "spades", "♥": "hearts", "♣": "clubs", "♦": "diamonds" }[c.suit]}`;
  function card(c, attrs = "", extra = "") {
    return `<button class="playing-card ${c.red ? "red" : ""} ${extra}" ${attrs} aria-label="${label(c)}"><span class="card-corner">${rank(c.rank)}<small>${c.suit}</small></span><span class="card-suit" aria-hidden="true">${c.suit}</span><span class="card-bottom" aria-hidden="true">${rank(c.rank)} ${c.suit}</span></button>`;
  }
  const back = (text = "?", attrs = "") =>
    `<button class="playing-card card-back" ${attrs}>${esc(text)}</button>`;
  const btn = (text, action, extra = "") =>
    `<button class="button" data-action="${action}" ${extra}>${text}</button>`;
  const stat = (name, value) =>
    `<div class="stat"><span>${name}</span><strong>${value}</strong></div>`;
  // Engines address the offline player by the name "You"; fix the verb so "You wins" reads "You win".
  const youVerbs = { wins: "win", loses: "lose", calls: "call", is: "are", has: "have", takes: "take", scores: "score", rolls: "roll", banks: "bank", bids: "bid", passes: "pass", draws: "draw", plays: "play", leads: "lead", gets: "get", guesses: "guess", claims: "claim", keeps: "keep", needs: "need", picks: "pick", was: "were" };
  const youGrammar = (text) => String(text).split(/(?<=[.!?])\s+/).map((sentence) => /^You\b/.test(sentence)
    ? sentence.replace(/^You (\w+)/, (m, v) => `You ${youVerbs[v] || v}`).replace(/ and (wins|loses|is|has|takes|scores)\b/g, (m, v) => ` and ${youVerbs[v]}`)
    : sentence.replace(/(^|[,;:] )You (wins|loses|is|has)\b/g, (m, pre, v) => `${pre}You ${youVerbs[v]}`)).join(" ");
  const status = (text, done = false) =>
    `<div class="game-status ${done ? "finished" : ""}" role="status">${esc(youGrammar(text))}</div>`;
  function bind(root, handler) {
    root.onclick = (e) => {
      const b = e.target.closest("[data-action]");
      if (b && root.contains(b) && !b.disabled) handler(b.dataset.action, b, e);
    };
  }

  /* ── Computer difficulty (Easy / Normal / Hard), remembered per browser ──
     Normal is the original computer. Easy sometimes makes a casual, random legal move.
     Hard takes immediate wins, refuses moves that hand you an immediate win, and
     searches deeper in games that support it. */
  const cpuLevels = ["easy", "normal", "hard"];
  let cpuLevel = "normal";
  try { const saved = localStorage.getItem("vs-cpu-level"); if (cpuLevels.includes(saved)) cpuLevel = saved; } catch {}
  const clone = (x) => JSON.parse(JSON.stringify(x));
  // Every legal move a seat could make, found the same way a player finds them: from the rendered buttons.
  function legalActions(engine, state, seat, samples = 6) {
    if (typeof document === "undefined" || !engine.render) return [];
    const box = document.createElement("div");
    try { box.innerHTML = engine.render(engine.view(state, seat)); } catch { return []; }
    const fields = [...box.querySelectorAll("[data-field]")];
    if (fields.some((f) => f.tagName === "INPUT" && !["range", "number", "checkbox", "hidden"].includes(f.type))) return [];
    const out = [], seen = new Set();
    for (const b of box.querySelectorAll("[data-move]:not(:disabled)")) {
      if (["force", "lobby", "giveup"].includes(b.dataset.move)) continue;
      for (let k = 0; k < (fields.length ? samples : 1); k++) {
        const a = { ...b.dataset, type: b.dataset.move }; delete a.move;
        for (const f of fields) {
          if (f.tagName === "SELECT") { const o = [...f.options]; a[f.dataset.field] = o[Math.floor(Math.random() * o.length)]?.value; }
          else if (f.type === "range" || f.type === "number") { const lo = +f.min || 0, hi = f.max === "" ? lo + 10 : +f.max; a[f.dataset.field] = String(lo + Math.floor(Math.random() * (hi - lo + 1))); }
          else if (f.type !== "checkbox" || Math.random() < 0.5) a[f.dataset.field] = f.value;
        }
        const key = JSON.stringify(a); if (seen.has(key)) continue; seen.add(key);
        const next = clone(state);
        try { if (engine.act(next, seat, a)) out.push({ action: a, next }); } catch {}
      }
    }
    return out;
  }
  const wins = (s, seat) => s.done && s.winners.includes(seat) && s.winners.length === 1;
  const cpu = {
    levels: cpuLevels,
    get level() { return cpuLevel; },
    set(level) { if (!cpuLevels.includes(level)) return; cpuLevel = level; try { localStorage.setItem("vs-cpu-level", level); } catch {} document.dispatchEvent?.(new CustomEvent("vs-cpu-level", { detail: level })); },
    // True when this decision should be a casual slip.
    slip(chance = 0.4) { return cpuLevel === "easy" && Math.random() < chance; },
    hard() { return cpuLevel === "hard"; },
    legalActions,
    // Wraps a room engine's computer: base() returns the normal decision.
    decide(engine, state, seat, base) {
      if (cpuLevel === "normal") return base();
      const options = legalActions(engine, state, seat);
      if (cpuLevel === "easy") {
        if (options.length && Math.random() < 0.4) return options[Math.floor(Math.random() * options.length)].action;
        return base();
      }
      const win = options.find((o) => wins(o.next, seat)); if (win) return win.action;
      const choice = base(); if (!choice || options.length < 2) return choice;
      const opponents = (s) => s.players.map((_, i) => i).filter((i) => i !== seat);
      const handsWin = (s) => !s.done && opponents(s).some((o) => legalActions(engine, s, o, 3).some((r) => wins(r.next, o)));
      const chosen = clone(state);
      try { if (!engine.act(chosen, seat, choice) || !handsWin(chosen)) return choice; } catch { return choice; }
      const safe = options.filter((o) => !handsWin(o.next));
      return safe.length ? safe[Math.floor(Math.random() * safe.length)].action : choice;
    },
  };
  function register(id, definition) {
    games[id] = definition;
  }
  return {
    games,
    register,
    shuffle,
    deck,
    rank,
    label,
    card,
    back,
    btn,
    stat,
    status,
    bind,
    esc,
    suits,
    rand: (n) => Math.floor(Math.random() * n),
    cpu,
  };
})();
