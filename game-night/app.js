"use strict";
(() => {
  const G = GameNight,
    app = document.querySelector("#app");
  const entries = [
    [
      "shut-box",
      "Shut the Box",
      "Roll the dice. Find your numbers. Clear the board.",
      "Dice & board",
      "1 player",
      "5 min",
      "⚄",
      "amber",
    ],
    [
      "solitaire",
      "Solitaire",
      "A quiet classic. Just you and a deck of cards.",
      "Cards",
      "1 player",
      "10 min",
      "♠",
      "mint",
    ],
    [
      "color-clash",
      "Color Clash",
      "Match colors, drop a wild, and race to one card.",
      "Cards",
      "Vs computer",
      "5 min",
      "✳",
      "coral",
    ],
    [
      "crazy-eights",
      "Crazy Eights",
      "Match a suit or a rank. Eights change everything.",
      "Cards",
      "Vs computer",
      "5 min",
      "8",
      "lavender",
    ],
    [
      "go-fish",
      "Go Fish",
      "Ask, collect, and fish your way to the most books.",
      "Cards",
      "Vs computer",
      "10 min",
      "♦",
      "sky",
    ],
    [
      "sea-battle",
      "Sea Battle",
      "Hide your fleet. Find theirs. Make every shot count.",
      "Dice & board",
      "Vs computer",
      "10 min",
      "⌖",
      "navy",
    ],
    [
      "spectrum",
      "Spectrum",
      "One secret target. One clue. Are you on the same wavelength?",
      "Party",
      "2+ players",
      "10 min",
      "◴",
      "coral",
    ],
    [
      "connect-four",
      "Connect Four",
      "Think a move ahead. Four in a row takes the win.",
      "Dice & board",
      "1–2 players",
      "5 min",
      "●",
      "amber",
    ],
    [
      "memory",
      "Memory Match",
      "A little focus, a little luck, a perfect pair.",
      "Cards",
      "1–2 players",
      "5 min",
      "✿",
      "mint",
    ],
    [
      "pig",
      "Pig Dice",
      "Keep rolling or bank it? Don’t get greedy.",
      "Dice & board",
      "1–2 players",
      "10 min",
      "⚅",
      "lavender",
    ],
    [
      "tic-tac-toe",
      "Tic-Tac-Toe",
      "Three in a row. You know the drill.",
      "Dice & board",
      "1–2 players",
      "2 min",
      "×",
      "sky",
    ],
    [
      "higher-lower",
      "Higher or Lower",
      "Trust your instincts. How far can your streak go?",
      "Cards",
      "1 player",
      "2 min",
      "↕",
      "navy",
    ],
  ];
  entries.unshift(
    ['imposter','Imposter','Same secret. One outsider. Listen closely, bluff boldly.','Party','3–8 online','15 min','◉','lavender'],
    ['pictionary','Sketch Party','Draw the clue. Race to guess. Artistic talent optional.','Party','2–8 online','15 min','✎','amber'],
    ['guess-who','Face Finder','Ask the right questions. Find their secret character.','Dice & board','2 online','10 min','◈','mint'],
    ['mafia','Mafia','A quiet town. A hidden threat. Who will you trust?','Party','4–8 online','20 min','♜','navy'],
    ['liars-dice','Liar’s Dice','Five dice, a straight face, and a very questionable bid.','Dice & board','2–8 online','15 min','⚂','coral'],
    ['dots-boxes','Dots & Boxes','Claim a line, close a box, and steal another turn.','Dice & board','2–4 online','5 min','▦','sky'],
    ['reversi','Reversi','Turn the board around. Every disc changes the game.','Dice & board','2 online','10 min','◐','mint'],
    ['rock-paper-scissors','Rock Paper Scissors','Secret choices. Simultaneous reveals. Five rounds of rivalry.','Party','2–8 online','5 min','✌','coral']
  );
  let cleanup = () => {},
    category = "All games",
    timers = new Set();
  const later = (fn, ms = 650) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  G.catalog = entries;
  function home() {
    document.title = "Game Night — Pick a game";
    app.innerHTML = `<section class="lobby"><div class="lobby-heading"><div><p class="eyebrow">THE TABLE IS OPEN</p><h1>What are we playing?</h1><p class="intro">Old favorites. New rivalries. Something for everyone.</p></div><div class="collection-stamp"><strong>${entries.length}</strong><span>GOOD REASONS<br>FOR ONE MORE ROUND</span></div></div><section class="online-hero"><div><span class="room-badge">ONLINE MULTIPLAYER</span><h2>Your friends. Your table.</h2><p>Make a room, send the code, and play together from anywhere.</p></div><div class="online-hero-actions"><a class="button" href="#online">Create a room ↗</a><a class="button secondary" href="#join/">Join with a code</a><small>2–8 players · No accounts · Free to play</small></div></section><div class="browse-bar"><nav class="filters" aria-label="Game categories">${["All games", "Cards", "Dice & board", "Party"].map((c) => `<button class="filter ${category === c ? "active" : ""}" data-category="${c}" aria-pressed="${category === c}">${c}</button>`).join("")}</nav><span class="game-count">${entries.filter((e) => category === "All games" || e[3] === category).length} games, zero setup</span></div><div class="game-grid">${entries
      .filter((e) => category === "All games" || e[3] === category)
      .map(
        (e, i) =>
          `<a class="game-tile" href="#${G.games[e[0]]?e[0]:'online/'+e[0]}" style="--i:${i}"><div class="tile-top ${e[7]}"><span class="tile-number">${String(entries.indexOf(e) + 1).padStart(2, "0")}</span><span class="tile-symbol" aria-hidden="true">${e[6]}</span><span class="tile-category">${e[3]}</span></div><div class="tile-content"><h2>${e[1]}<span aria-hidden="true">↗</span></h2><p>${e[2]}</p><div class="tile-meta"><span>${e[4]}</span><span>${e[5]}${G.games[e[0]]?' · Online too':''}</span></div></div></a>`,
      )
      .join(
        "",
      )}</div><div class="lobby-note"><span class="note-symbol">✦</span><p><strong>Make room for everyone.</strong> Play solo, pass the screen, or invite your friends into an online room.</p><span class="note-small">Plays right in your browser</span></div></section>`;
    app.querySelectorAll("[data-category]").forEach(
      (b) =>
        (b.onclick = () => {
          category = b.dataset.category;
          home();
        }),
    );
  }
  function route() {
    cleanup();
    timers.forEach(clearTimeout);
    timers.clear();
    app.onclick = null;
    const id = location.hash.slice(1),
      entry = entries.find((e) => e[0] === id),
      game = G.games[id];
    if ((id.startsWith('online') || id.startsWith('join/')) && window.GameNightOnline) {
      document.title = 'Play with friends — Game Night';
      cleanup = GameNightOnline.mount(app, id.split('/')[1]);
      window.scrollTo(0, 0);
      return;
    }
    if (!entry || !game) {
      home();
      return;
    }
    document.title = `${entry[1]} — Game Night`;
    app.innerHTML = `<section class="game-page"><div class="game-heading"><div><a class="back-link" href="#">← All games</a><h1>${entry[1]}</h1><p>${entry[2]}</p></div><div class="game-heading-actions"><a class="button" href="#online/${id}">Play with friends ↗</a><button id="restart" class="button secondary">↻ New game</button></div></div><div class="play-layout"><div class="game-surface" id="game-root"></div><aside class="rules-panel"><span class="eyebrow">THE HOUSE RULES</span><h2>How to play</h2>${game.rules}<div class="rules-foot">${entry[4]} <span>·</span> About ${entry[5]}<p>${game.note || "A fresh game is always one click away."}</p></div></aside></div></section>`;
    let restart = () => {
      cleanup();
      timers.forEach(clearTimeout);
      timers.clear();
      cleanup =
        game.mount(app.querySelector("#game-root"), { later }) || (() => {});
    };
    document.querySelector("#restart").onclick = restart;
    restart();
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", route);
  route();
  window.GameNightPolish?.init();
})();
