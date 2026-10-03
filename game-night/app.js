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
  entries.unshift(...(G.expansionCatalog || []));
  let cleanup = () => {},
    category = "All games",
    search = "",
    playStyle = location.protocol === "file:" ? "offline" : "all",
    picked = "",
    spinAngle = 0,
    spinning = false,
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
  const liveUrl = "https://vectorspaceinternationaldevelopment.online/";
  const cpuGames = new Set(['color-clash','crazy-eights','go-fish','sea-battle','connect-four','pig','tic-tac-toe','guess-who','dots-boxes','reversi','liars-dice','rock-paper-scissors', ...(G.cpuIds || [])]);
  const offlineCount = entries.filter(e => G.games[e[0]]).length;
  const newIds = new Set((G.expansionCatalog || []).map(e => e[0]));
  const capacity = id => window.RoomGames?.games[id];
  const reduceMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  /* ── The Game Closet: shared vocabulary for boxes, felt and labels ── */
  const lidInk = { amber: "#f3c64f", mint: "#9fd3b4", coral: "#ef7357", lavender: "#b3a9ec", sky: "#9fd2e6", navy: "#8795c8" };
  const feltFor = { amber: "green", mint: "teal", coral: "claret", lavender: "plum", sky: "blue", navy: "midnight" };
  const catKey = c => c === "Cards" ? "cards" : c === "Party" ? "party" : "board";
  const boxNo = e => String(entries.indexOf(e) + 1).padStart(2, "0");
  const seats = id => { const g = capacity(id); return g ? (g.min === g.max ? `${g.min}` : `${g.min}–${g.max}`) : ""; };
  /* Box-side player count: solo or vs-computer play starts at one human. */
  const players = e => { const g = capacity(e[0]); if (!g) return e[4]; const lo = G.games[e[0]] && (cpuGames.has(e[0]) || /^1/.test(e[4])) ? 1 : g.min; return lo === g.max ? `${lo}` : `${lo}–${g.max}`; };
  const onlineLabel = id => { const s = seats(id); return s ? `${s} playing seats` : ""; };
  const modeStamp = id => cpuGames.has(id) ? "Vs CPU" : G.games[id] ? "Solo · local" : "Online only";
  const pawn = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="4.6" r="2.9"/><path d="M3.6 14.6c.5-3.9 2-5.9 4.4-5.9s3.9 2 4.4 5.9z"/></svg>';
  const clock = '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="M8 4.6V8l2.4 1.6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const boxSide = e => `<span class="box-side"><span class="side-item">${pawn}${players(e)}<span class="visually-hidden"> players</span></span><span class="side-item">${clock}${e[5]}</span><span class="side-stamp">${modeStamp(e[0])}</span></span>`;
  const cover = (id, cls = "box-art", lazy = true) => `<img class="${cls}" src="assets/covers/${id}.svg" alt="" width="300" height="190" ${lazy ? 'loading="lazy" ' : ""}decoding="async">`;

  function matches(entry) {
    return (category === "All games" || entry[3] === category) &&
      (!search.trim() || `${entry[1]} ${entry[2]} ${entry[3]}`.toLowerCase().includes(search.trim().toLowerCase())) &&
      (playStyle === "all" || (playStyle === "cpu" ? cpuGames.has(entry[0]) : playStyle === 'group' ? capacity(entry[0])?.max >= 3 : !!G.games[entry[0]]));
  }
  const countText = n => `${n} games${playStyle==='cpu'?' with computer opponents':playStyle==='offline'?' available offline':playStyle==='group'?' for groups':', zero setup'}`;

  function gameBox(e, i) {
    const id = e[0], href = `#${G.games[id] ? id : 'online/' + id}`;
    return `<a class="game-tile ${id === picked ? 'is-picked' : ''}" href="${href}" style="--i:${i};--lid:${lidInk[e[7]] || lidInk.amber}" data-cat="${catKey(e[3])}" data-game="${id}"><span class="box-lid">${cover(id)}<span class="box-no" aria-hidden="true">No.<b>${boxNo(e)}</b></span></span>${newIds.has(id) ? '<span class="new-game-badge">Just added</span>' : ''}${id === picked ? '<span class="pick-sticker" aria-hidden="true">Tonight’s pick</span>' : ''}<span class="box-face"><span class="box-cat">${G.esc(e[3])}</span><h2>${e[1]}</h2><p>${e[2]}</p><span class="visually-hidden">${G.games[id] ? 'Offline and online' : 'Online with friends'}. ${onlineLabel(id)}.</span></span>${boxSide(e)}</a>`;
  }

  /* The spinner only lands on what the current filters show. */
  function spinnerFace(list) {
    const n = Math.max(list.length, 1), seg = 360 / n, r = 96;
    const pt = (deg, rad) => { const a = (deg - 90) * Math.PI / 180; return `${(Math.cos(a) * rad).toFixed(2)} ${(Math.sin(a) * rad).toFixed(2)}`; };
    const size = n > 24 ? 8.5 : n > 14 ? 10 : 12;
    const wedges = list.length ? list.map((e, i) => {
      const a0 = i * seg, a1 = (i + 1) * seg, large = seg > 180 ? 1 : 0;
      const d = n === 1 ? `M0 -${r}A${r} ${r} 0 1 1 -0.01 -${r}Z` : `M0 0L${pt(a0, r)}A${r} ${r} 0 ${large} 1 ${pt(a1, r)}Z`;
      const mid = a0 + seg / 2;
      return `<g class="wedge" data-index="${i}"><path d="${d}" fill="${lidInk[e[7]] || lidInk.amber}"/><text transform="rotate(${mid.toFixed(2)}) translate(0 -${r - 14})" font-size="${size}">${boxNo(e)}</text></g>`;
    }).join("") : `<circle r="${r}" fill="#e9dfc8"/>`;
    return `<svg class="spinner-face" viewBox="-110 -110 220 220" aria-hidden="true"><circle r="106" class="spinner-rim"/>${wedges}<circle r="${r}" class="spinner-ring"/>${Array.from({ length: 24 }, (_, i) => `<path class="spinner-tick" d="M0 -104V-99" transform="rotate(${i * 15})"/>`).join("")}<g class="spinner-arrow" style="transform:rotate(${spinAngle}deg)"><path d="M0 -84L13 -10 5 -10 6 34-6 34-5 -10-13 -10Z"/><circle r="22"/></g></svg>`;
  }
  function chanceCard(e) {
    if (!e) return `<span class="chance-label">Can’t decide?</span><strong>Spin the arrow.</strong><p>It only lands on boxes that match the shelf filters below.</p><button class="text-link" type="button" data-spin>Spin for a game ↻</button>`;
    return `<span class="chance-label">Tonight’s pick · No. ${boxNo(e)}</span><strong>${e[1]}</strong><p>${e[2]}</p><span class="chance-meta">${pawn}${players(e)} players · ${e[5]} · ${modeStamp(e[0])}</span><span class="chance-actions"><a class="game-button small" href="#${G.games[e[0]] ? e[0] : 'online/' + e[0]}"><span>Play it →</span></a><button class="text-link" type="button" data-spin>Spin again ↻</button></span>`;
  }

  function travelEdition() {
    return localCopy ? '' : `<section class="travel-edition" aria-labelledby="travel-title"><div class="travel-box" aria-hidden="true"><span class="travel-lid"><b>VectorSpace</b><small>Travel Edition</small></span><span class="travel-side">${offlineCount} GAMES · NO WI-FI REQUIRED</span></div><div class="travel-copy"><span class="control-label">Also in the closet</span><h2 id="travel-title">The Travel Edition</h2><p>Download VectorSpace, extract the ZIP, and open <strong>index.html</strong>. Includes ${cpuGames.size} games with computer opponents and ${offlineCount} games for solo or local play.</p><div class="travel-actions"><a class="game-button" href="downloads/vectorspace-offline.zip" download="VectorSpace-offline.zip"><span>Download for offline play ↓</span></a><a class="text-link" href="offline-help.html">How it works</a></div><small>Free ZIP · No install or account</small></div></section>`;
  }

  function home() {
    document.title = "VectorSpace — Pick a game";
    const tableActions = localCopy
      ? `<div class="travel-note"><span class="control-label">Your Travel Edition</span><p>All yours, even without Wi-Fi. Solo games and computer opponents run on this device. Rooms and online party games need an internet connection.</p><a class="game-button secondary" href="offline-help.html"><span>Offline help ↗</span></a></div>`
      : `<div class="table-actions"><a class="game-button" href="#online"><span>Host a room ↗</span></a><form class="tile-tray" id="tray-form" novalidate><label for="tray-code">Got a room code?</label><span class="tray"><input id="tray-code" name="code" maxlength="6" autocapitalize="characters" autocomplete="off" spellcheck="false" inputmode="text" aria-describedby="tray-hint"><span class="tray-slots" aria-hidden="true">${'<i></i>'.repeat(6)}</span></span><button class="tray-go" type="submit">Join</button><small id="tray-hint">Six letters and numbers from your host</small></form></div>`;
    app.innerHTML = `<section class="lobby closet"><section class="table-top" aria-labelledby="table-title"><div class="table-copy"><p class="table-kicker"><span>VectorSpace</span>Game night collection · ${entries.length} games</p><h1 id="table-title">Game night<span>is on the table.</span></h1><p class="table-lede">Card, dice, board and party games in one box. Play the computer, pass the device, or open a private room for up to eight friends. No accounts.</p>${tableActions}</div><div class="spinner-zone"><div class="spinner"><div class="spinner-dial"></div><button class="spinner-hub" type="button" data-spin aria-label="Spin for a random game">Spin</button></div><div class="chance-card" role="status" aria-live="polite">${chanceCard(entries.find(e => e[0] === picked))}</div></div></section><section class="shelf" aria-labelledby="shelf-title"><div class="shelf-head"><div><span class="control-label">Pick a box</span><h2 id="shelf-title">The shelf</h2></div><div class="shelf-controls"><div class="play-style-bar"><span class="control-label" id="play-style-label">How are you playing?</span><nav class="play-style-filters" aria-labelledby="play-style-label">${[['all','All games'],['cpu','Vs computer'],['offline','Offline & local'],...(!localCopy ? [['group','3+ players']] : [])].map(([key,label])=>`<button class="play-style-filter" type="button" data-play-style="${key}" aria-pressed="false">${label}</button>`).join('')}</nav></div><div class="library-search"><label class="control-label" for="game-search">Find a box</label><span class="search-field"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/></svg><input id="game-search" type="search" aria-label="Search games" placeholder="Name, mood, or type…" value="${G.esc(search)}" autocomplete="off"></span></div></div></div><div class="browse-bar"><nav class="filters" aria-label="Game categories">${["All games", "Cards", "Dice & board", "Party"].map((c) => `<button class="filter" type="button" data-category="${c}" data-cat="${c === 'All games' ? 'all' : catKey(c)}" aria-pressed="false">${c}</button>`).join("")}</nav><span class="game-count" role="status"></span></div><div class="shelf-boxes"></div></section>${travelEdition()}</section>`;
    app.querySelectorAll('[data-category]').forEach(b => b.onclick = () => { category = b.dataset.category; shelf(); });
    app.querySelectorAll('[data-play-style]').forEach(b => b.onclick = () => { playStyle = b.dataset.playStyle; shelf(); });
    const searchInput = app.querySelector('#game-search');
    searchInput.oninput = () => { search = searchInput.value; shelf(); };
    app.querySelector('.spinner-hub').onclick = spin;
    app.querySelector('.chance-card').onclick = ev => { if (ev.target.closest('[data-spin]')) spin(); };
    const tray = app.querySelector('#tray-form');
    if (tray) {
      const input = tray.querySelector('#tray-code'), slots = [...tray.querySelectorAll('.tray-slots i')];
      const paint = () => slots.forEach((s, i) => { s.textContent = input.value[i] || ''; s.classList.toggle('filled', !!input.value[i]); s.classList.toggle('next', i === input.value.length && document.activeElement === input); });
      input.oninput = () => { const raw = window.GameNightRoom?.normalizeCode ? GameNightRoom.normalizeCode(input.value) : input.value.toUpperCase(); input.value = raw.replace(/[^A-Z0-9]/g, '').slice(0, 6); tray.classList.remove('is-wrong'); paint(); };
      input.onfocus = input.onblur = paint;
      tray.onsubmit = ev => { ev.preventDefault(); if (input.value.length === 6) location.hash = 'join/' + input.value; else { tray.classList.remove('is-wrong'); void tray.offsetWidth; tray.classList.add('is-wrong'); input.focus(); } };
      paint();
    }
    shelf();
  }

  function shelf() {
    if (!app.querySelector('.closet')) return;
    const visible = entries.filter(matches);
    app.querySelectorAll('[data-category]').forEach(b => { const on = b.dataset.category === category; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    app.querySelectorAll('[data-play-style]').forEach(b => { const on = b.dataset.playStyle === playStyle; b.classList.toggle('active', on); b.setAttribute('aria-pressed', on); });
    app.querySelector('.game-count').textContent = countText(visible.length);
    app.querySelector('.shelf-boxes').innerHTML = visible.length
      ? `<div class="game-grid">${visible.map(gameBox).join('')}</div>`
      : '<p class="empty-library"><b>Nothing on this shelf.</b> No games in this combination. Try another category or play mode.</p>';
    if (!spinning) {
      app.querySelector('.spinner-dial').innerHTML = spinnerFace(visible);
      app.querySelector('.spinner-hub').disabled = !visible.length;
    }
  }

  function spin() {
    const visible = entries.filter(matches);
    if (spinning || !visible.length) return;
    const dial = app.querySelector('.spinner-dial'), card = app.querySelector('.chance-card'), hub = app.querySelector('.spinner-hub');
    dial.innerHTML = spinnerFace(visible);
    const arrow = dial.querySelector('.spinner-arrow'), n = visible.length, seg = 360 / n;
    const k = Math.floor(Math.random() * n), jitter = (Math.random() - .5) * .6;
    let delta = ((k + .5 + jitter) * seg) - (((spinAngle % 360) + 360) % 360);
    if (delta < 0) delta += 360;
    spinAngle += (reduceMotion() ? 0 : 360 * 4) + delta;
    spinning = true;
    hub.classList.add('is-spinning');
    card.classList.add('is-waiting');
    card.innerHTML = '<span class="chance-label">Spinning…</span><strong>Round and round…</strong><p>Choosing from ' + n + (n === 1 ? ' box' : ' boxes') + ' on your shelf.</p>';
    window.GameNightPolish?.play?.('roll');
    void arrow.getBoundingClientRect();
    arrow.style.transform = `rotate(${spinAngle}deg)`;
    later(() => {
      spinning = false;
      picked = visible[k][0];
      hub.classList.remove('is-spinning');
      card.classList.remove('is-waiting');
      card.innerHTML = chanceCard(visible[k]);
      card.classList.remove('is-dealt'); void card.offsetWidth; card.classList.add('is-dealt');
      shelf();
      app.querySelector(`.spinner-dial .wedge[data-index="${entries.filter(matches).findIndex(e => e[0] === picked)}"]`)?.classList.add('is-hit');
      window.GameNightPolish?.play?.('finish');
    }, reduceMotion() ? 60 : 3500);
  }

  function route() {
    cleanup();
    timers.forEach(clearTimeout);
    timers.clear();
    spinning = false;
    app.onclick = null;
    document.body.dataset.view = "";
    const id = location.hash.slice(1),
      entry = entries.find((e) => e[0] === id),
      game = G.games[id];
    if ((id.startsWith('online') || id.startsWith('join/')) && window.GameNightOnline) {
      document.body.dataset.view = "room";
      if (localCopy) {
        document.title = 'Play with friends — VectorSpace';
        app.innerHTML = `<section class="game-page offline-room-notice"><a class="back-link" href="#">← Back to the shelf</a><span class="eyebrow">THIS IS YOUR TRAVEL EDITION</span><h1>Friends are one connection away.</h1><p>Online rooms, Imposter, Mafia, and Sketch Party need an internet connection and other players. Your solo and computer games work right here.</p><div class="toolbar"><a class="button" href="${liveUrl}#${G.esc(id)}" target="_blank" rel="noopener">Open VectorSpace online ↗</a><a class="button secondary" href="#">Back to offline games</a></div></section>`;
        return;
      }
      document.title = 'Play with friends — VectorSpace';
      cleanup = GameNightOnline.mount(app, id.split('/')[1]);
      window.scrollTo(0, 0);
      return;
    }
    if (!entry || !game) {
      document.body.dataset.view = "shelf";
      home();
      return;
    }
    document.body.dataset.view = "game";
    document.title = `${entry[1]} — VectorSpace`;
    app.innerHTML = `<section class="game-page" data-felt="${feltFor[entry[7]] || 'green'}" style="--lid:${lidInk[entry[7]] || lidInk.amber}"><div class="game-heading"><div class="lid-copy"><a class="back-link" href="#">← Back to the shelf</a><span class="box-cat" data-cat="${catKey(entry[3])}">${G.esc(entry[3])} · No. ${boxNo(entry)}</span><h1>${entry[1]}</h1><p>${entry[2]}</p>${boxSide(entry)}</div><div class="lid-art" aria-hidden="true">${cover(id, 'lid-cover', false)}</div><div class="game-heading-actions"><a class="button" href="${localCopy ? liveUrl : ''}#online/${id}" ${localCopy ? 'target="_blank" rel="noopener"' : ''}>Play with friends ↗</a><button id="restart" class="button secondary">↻ New game</button></div></div><div class="play-layout"><div class="game-surface" id="game-root"></div><aside class="rules-panel"><span class="eyebrow">Rule booklet</span><h2>How to play</h2>${game.rules}<div class="rules-foot"><span class="rules-meta">${cpuGames.has(id)?'Vs computer':entry[4]} <span>·</span> About ${entry[5]}</span><p>${game.note || "A fresh game is always one click away."}</p></div></aside></div></section>`;
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
