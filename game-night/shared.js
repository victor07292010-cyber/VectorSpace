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
  const status = (text, done = false) =>
    `<div class="game-status ${done ? "finished" : ""}" role="status">${esc(text)}</div>`;
  function bind(root, handler) {
    root.onclick = (e) => {
      const b = e.target.closest("[data-action]");
      if (b && root.contains(b) && !b.disabled) handler(b.dataset.action, b, e);
    };
  }
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
  };
})();
