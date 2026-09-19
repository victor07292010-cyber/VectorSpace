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
    playStyle = location.protocol === "file:" ? "offline" : "all",
    timers = new Set();
  const later = (fn, ms = 650) => {
    const t = setTimeout(() => {
      timers.delete(t);
      fn();
    }, ms);
    timers.add(t);
  };
  G.catalog = entries;
  const localCopy = location.protocol === "file:";
  const liveUrl = "https://victor07292010-cyber.github.io/VectorSpace/";
  const cpuGames = new Set(['color-clash','crazy-eights','go-fish','sea-battle','connect-four','pig','tic-tac-toe','guess-who','dots-boxes','reversi','liars-dice','rock-paper-scissors']);
  function matches(entry) {
    return (category === "All games" || entry[3] === category) &&
      (playStyle === "all" || (playStyle === "cpu" ? cpuGames.has(entry[0]) : !!G.games[entry[0]]));
  }
  function downloadPanel() {
    return localCopy
      ? '<section class="offline-banner is-local"><span class="offline-symbol" aria-hidden="true">✓</span><div><span class="eyebrow">YOUR OFFLINE COPY</span><h2>All yours. Even without Wi-Fi.</h2><p>Solo games and computer opponents run on this device. Rooms and online party games need an internet connection.</p></div><a class="button secondary" href="offline-help.html">Offline help ↗</a></section>'
      : '<section class="offline-banner"><span class="offline-symbol" aria-hidden="true">↓</span><div><span class="eyebrow">TAKE YOUR SPACE WITH YOU</span><h2>Good games. No Wi-Fi needed.</h2><p>Download VectorSpace, extract the ZIP, and open <strong>index.html</strong>. Includes 12 computer opponents and 17 games for solo or local play.</p></div><div class="offline-actions"><a class="button" href="downloads/vectorspace-offline.zip" download="VectorSpace-offline.zip">Download for offline play ↓</a><a class="text-button" href="offline-help.html">How it works</a><small>Free ZIP · No install or account</small></div></section>';
  }
  function home() {
    document.title = "VectorSpace — Pick a game";
    const visible = entries.filter(matches);
    app.innerHTML = `<section class="lobby"><div class="lobby-heading"><div><p class="eyebrow">WELCOME TO YOUR SPACE</p><h1>What are we playing?</h1><p class="intro">Challenge the computer. Gather your friends. Find your next favorite.</p></div><div class="collection-stamp"><strong>${entries.length}</strong><span>GOOD REASONS<br>FOR ONE MORE ROUND</span></div></div>${downloadPanel()}${localCopy ? '' : '<section class="online-hero"><div><span class="room-badge">ONLINE MULTIPLAYER</span><h2>Your friends. Your table.</h2><p>Make a room, send the code, and play together.</p></div><div class="online-hero-actions"><a class="button" href="#online">Create a room ↗</a><a class="button secondary" href="#join/">Join with a code</a><small>2–8 players · No accounts · Free to play</small></div></section>'}<div class="play-style-bar"><span class="eyebrow">HOW DO YOU WANT TO PLAY?</span><nav class="play-style-filters" aria-label="Play modes">${[['all','All games'],['cpu','Vs computer'],['offline','Offline & local']].map(([key,label])=>`<button class="play-style-filter ${playStyle===key?'active':''}" data-play-style="${key}" aria-pressed="${playStyle===key}">${key==='cpu'?'<span aria-hidden="true">◇</span> ':''}${label}</button>`).join('')}</nav></div><div class="browse-bar"><nav class="filters" aria-label="Game categories">${["All games", "Cards", "Dice & board", "Party"].map((c) => `<button class="filter ${category === c ? "active" : ""}" data-category="${c}" aria-pressed="${category === c}">${c}</button>`).join("")}</nav><span class="game-count" role="status">${visible.length} games${playStyle==='cpu'?' with computer opponents':playStyle==='offline'?' available offline':', zero setup'}</span></div><div class="game-grid">${visible.map((e,i)=>`<a class="game-tile" href="#${G.games[e[0]]?e[0]:'online/'+e[0]}" style="--i:${i}"><div class="tile-top ${e[7]}"><span class="tile-number">${String(entries.indexOf(e)+1).padStart(2,'0')}</span><span class="tile-symbol" aria-hidden="true">${e[6]}</span><span class="tile-category">${e[3]}</span></div><div class="tile-content"><h2>${e[1]}<span aria-hidden="true">↗</span></h2><p>${e[2]}</p><div class="tile-meta"><span>${cpuGames.has(e[0])?'Vs computer':e[4]}</span><span>${G.games[e[0]]?'Offline + online':'Online with friends'}</span></div></div></a>`).join('')}</div>${visible.length?'':'<p class="empty-library">No games in this combination. Try another category or play mode.</p>'}<div class="lobby-note"><span class="note-symbol">✦</span><p><strong>Make room for everyone.</strong> Play solo, challenge the computer, pass the screen, or invite friends into a room.</p><span class="note-small">Your space. Your pace.</span></div></section>`;
    app.querySelectorAll('[data-category]').forEach(b=>b.onclick=()=>{category=b.dataset.category;home();});
    app.querySelectorAll('[data-play-style]').forEach(b=>b.onclick=()=>{playStyle=b.dataset.playStyle;home();});
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
      if (localCopy) {
        document.title = 'Play with friends — VectorSpace';
        app.innerHTML = `<section class="game-page offline-room-notice"><a class="back-link" href="#">← Offline games</a><span class="eyebrow">THIS IS YOUR OFFLINE COPY</span><h1>Friends are one connection away.</h1><p>Online rooms, Imposter, Mafia, and Sketch Party need an internet connection and other players. Your solo and computer games work right here.</p><div class="toolbar"><a class="button" href="${liveUrl}#${G.esc(id)}" target="_blank" rel="noopener">Open VectorSpace online ↗</a><a class="button secondary" href="#">Back to offline games</a></div></section>`;
        return;
      }
      document.title = 'Play with friends — VectorSpace';
      cleanup = GameNightOnline.mount(app, id.split('/')[1]);
      window.scrollTo(0, 0);
      return;
    }
    if (!entry || !game) {
      home();
      return;
    }
    document.title = `${entry[1]} — VectorSpace`;
    app.innerHTML = `<section class="game-page"><div class="game-heading"><div><a class="back-link" href="#">← All games</a><h1>${entry[1]}</h1><p>${entry[2]}</p></div><div class="game-heading-actions"><a class="button" href="${localCopy ? liveUrl : ''}#online/${id}" ${localCopy ? 'target="_blank" rel="noopener"' : ''}>Play with friends ↗</a><button id="restart" class="button secondary">↻ New game</button></div></div><div class="play-layout"><div class="game-surface" id="game-root"></div><aside class="rules-panel"><span class="eyebrow">THE HOUSE RULES</span><h2>How to play</h2>${game.rules}<div class="rules-foot">${cpuGames.has(id)?'Vs computer':entry[4]} <span>·</span> About ${entry[5]}<p>${game.note || "A fresh game is always one click away."}</p></div></aside></div></section>`;
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
  if (localCopy) document.querySelectorAll('[data-offline-download]').forEach(a=>{a.href='offline-help.html';a.removeAttribute('download');a.setAttribute('aria-label','Offline play help');a.querySelector('span').textContent='Offline help';});
  route();
  window.GameNightPolish?.init();
})();
