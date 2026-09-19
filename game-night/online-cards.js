"use strict";
(() => {
  const G = window.GameNight;
  const R = window.RoomGames;
  const colors = ["redc", "blue", "green", "yellow"];
  const colorNames = { redc: "Red", blue: "Blue", green: "Green", yellow: "Yellow", wild: "Wild" };
  const suitNames = { "♠": "Spades", "♥": "Hearts", "♣": "Clubs", "♦": "Diamonds" };
  const cloneCard = (c) => ({ ...c });
  const top = (s) => s.pile[s.pile.length - 1];
  const number = (value) => {
    if (typeof value === "number") return Number.isSafeInteger(value) ? value : -1;
    return typeof value === "string" && /^(0|[1-9]\d*)$/.test(value) && Number.isSafeInteger(Number(value)) ? Number(value) : -1;
  };
  function initial(players) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 6) throw new Error("This game needs 2–6 players.");
    return {
      players: players.map((p, i) => ({ id: String(p.id), name: String(p.name || `Player ${i + 1}`) })),
      hands: players.map(() => []), turn: 0, done: false, winners: [], message: "The cards are dealt. Let's play!",
    };
  }
  const allowed = (s, p, a) => !s.done && Number.isInteger(p) && p >= 0 && p < s.players.length && p === s.turn && a && typeof a === "object" && !Array.isArray(a) && typeof a.type === "string";
  const next = (s, p, steps = 1) => ((p + (s.direction || 1) * steps) % s.players.length + s.players.length) % s.players.length;
  function win(s, winners, message) {
    s.done = true;
    s.winners = winners;
    s.message = message;
  }
  function publicView(s, viewer) {
    const seated = Number.isInteger(viewer) && viewer >= 0 && viewer < s.players.length;
    // Construct an allowlist, never a redacted copy of the private engine state.
    return {
      viewer: seated ? viewer : -1,
      players: s.players.map((p, i) => ({ id: p.id, name: p.name, count: s.hands[i].length })),
      hand: seated ? s.hands[viewer].map(cloneCard) : [],
      stockCount: s.stock.length, turn: s.turn, mine: seated && s.turn === viewer && !s.done,
      done: s.done, winners: [...s.winners], message: s.message,
    };
  }

  // Shared presentation uses only the sanitized view supplied by the room host.
  const style = `<style>
    .oc-game .oc-opponents{display:flex;gap:12px;flex-wrap:wrap;justify-content:center;margin:0 0 22px}
    .oc-game .oc-player{flex:1 1 130px;max-width:240px;min-width:0;border:1px solid #ffffff24;border-radius:12px;padding:12px;text-align:center;background:#ffffff06}
    .oc-game .oc-player.active{border-color:#efd276;background:#efd27612}
    .oc-game .oc-player-name{display:block;overflow-wrap:anywhere;font-weight:700;margin-bottom:8px}
    .oc-game .oc-backs{display:flex;justify-content:center;height:44px;padding-left:13px;margin-bottom:8px}
    .oc-game .oc-back{width:30px;height:43px;border:2px solid #cdd7c5;border-radius:4px;background:repeating-linear-gradient(45deg,#486768 0 4px,#345455 4px 8px);margin-left:-13px}
    .oc-game .oc-count{display:block;font-size:.8rem;color:#d0dfd7}
    .oc-game .oc-turn{padding:12px 16px;border-radius:10px;background:#ffffff0b;text-align:center;font-weight:700;overflow-wrap:anywhere}
    .oc-game .oc-turn.mine{color:#17392c;background:#efd276}
    .oc-game .oc-fields{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:12px;margin:18px 0}
    .oc-game .oc-fields label{display:flex;align-items:center;gap:10px;font-size:.9rem}
    .oc-game .oc-fields select{max-width:230px;min-height:42px;padding:8px 12px;border:1px solid #ffffff40;border-radius:8px;background:#183c32;color:#fffdf5;font:inherit}
    .oc-game .oc-fields option{background:#183c32;color:#fffdf5}
    .oc-game .oc-help{font-size:.85rem;color:#c2d4ca;text-align:center;line-height:1.6;margin:12px auto;max-width:680px}
    .oc-game .oc-hand-title{font-weight:700;text-align:center;margin-top:24px}
    .oc-game .oc-drawn{outline:3px solid #efd276;outline-offset:3px}
    .oc-game .oc-books{display:flex;gap:5px;justify-content:center;flex-wrap:wrap;margin-top:8px}
    .oc-game .oc-books span{border-radius:4px;background:#efd27620;padding:3px 6px;font-size:.75rem}
    .oc-game .oc-final-score{font-weight:700;margin:8px 0 0;color:#efd276}
    .oc-game .oc-empty{margin:20px;text-align:center;color:#c2d4ca}
    .oc-game .rank-button{min-width:62px}
    .oc-game .playing-card.dim{opacity:.6}
    .oc-game .oc-rules{margin-top:22px;color:#c2d4ca;font-size:.85rem;line-height:1.65}
    .oc-game .oc-rules summary{cursor:pointer;text-align:center}
    .oc-game .oc-rules p{max-width:720px;margin:12px auto}
    @media(max-width:500px){.oc-game .oc-player{flex-basis:100px;padding:9px}.oc-game .oc-fields label{flex-direction:column;gap:5px}.oc-game .playing-card{width:64px;height:96px}}
  </style>`;
  function books(ranks) {
    return `<div class="oc-books">${ranks.map((r) => `<span>${G.rank(r)} × 4</span>`).join("")}</div>`;
  }
  function opponents(v) {
    return `<div class="oc-opponents">${v.players.map((p, i) => i === v.viewer ? "" : `<div class="oc-player ${!v.done && i === v.turn ? "active" : ""}"><span class="oc-player-name">${G.esc(p.name)}${!v.done && i === v.turn ? " · Playing" : ""}</span><div class="oc-backs" aria-hidden="true">${Array.from({ length: Math.min(6, p.count) }, () => '<span class="oc-back"></span>').join("")}</div><span class="oc-count">${p.count} card${p.count === 1 ? "" : "s"}${p.books ? ` · ${p.books.length} book${p.books.length === 1 ? "" : "s"}` : ""}</span>${p.books ? books(p.books) : ""}${p.score !== undefined ? `<p class="oc-final-score">${p.score} points</p>` : ""}</div>`).join("")}</div>`;
  }
  function banner(v) {
    return `<div class="oc-turn ${v.mine ? "mine" : ""}" role="status">${v.done ? "Round complete" : v.mine ? "Your turn" : `${G.esc(v.players[v.turn].name)}'s turn`}</div>${G.status(v.message, v.done)}`;
  }
  function button(text, move, enabled, attrs = "") {
    return `<button class="button" data-move="${move}" ${attrs} ${enabled ? "" : "disabled"}>${text}</button>`;
  }
  function rules(text) {
    return `<details class="oc-rules"><summary>How to play</summary><p>${text}</p></details>`;
  }
  function colorCard(c, attrs = "", extra = "") {
    const name = `${colorNames[c.color]} ${c.value === "⊘" ? "Skip" : c.value === "⇄" ? "Reverse" : c.value === "+2" ? "Draw two" : c.value === "★" ? "Choose a color" : c.value}`;
    return `<button class="playing-card color-card ${c.color} ${extra}" ${attrs} aria-label="${G.esc(name)}"><span class="color-value">${c.value}</span><span class="color-name">${colorNames[c.color]}</span></button>`;
  }
  function handTitle(v) {
    return `<p class="oc-hand-title">${v.viewer < 0 ? "Watching this round" : `Your hand · ${v.hand.length} card${v.hand.length === 1 ? "" : "s"}${v.hand.length === 1 && !v.done ? " · Last card!" : ""}`}</p>`;
  }

  const colorLegal = (s, c) => c.color === "wild" || c.color === s.active || c.value === top(s).value;
  function colorDraw(s) {
    if (!s.stock.length && s.pile.length > 1) {
      const last = s.pile.pop();
      s.stock = G.shuffle(s.pile);
      s.pile = [last];
    }
    return s.stock.pop();
  }
  function colorBlocked(s) {
    if (!s.stock.length && s.pile.length === 1 && !s.hands.some((h) => h.some((c) => colorLegal(s, c)))) {
      win(s, [], "There are no playable cards and the draw pile is empty. The round is a draw.");
      return true;
    }
    return false;
  }
  R.register("color-clash", {
    min: 2, max: 6, title: "Color Clash",
    create(players) {
      const s = initial(players);
      s.stock = [];
      let id = 0;
      for (const color of colors) {
        s.stock.push({ color, value: "0", id: id++ });
        for (let copy = 0; copy < 2; copy++) for (const value of ["1", "2", "3", "4", "5", "6", "7", "8", "9", "⊘", "⇄", "+2"]) s.stock.push({ color, value, id: id++ });
      }
      for (let i = 0; i < 4; i++) s.stock.push({ color: "wild", value: "★", id: id++ });
      G.shuffle(s.stock);
      s.hands = players.map(() => s.stock.splice(0, 7));
      s.pile = [s.stock.splice(s.stock.findIndex((c) => /^\d$/.test(c.value)), 1)[0]];
      s.active = top(s).color;
      s.direction = 1;
      s.drawn = null;
      return s;
    },
    act(s, actor, a) {
      if (!allowed(s, actor, a)) return false;
      if (a.type === "draw") {
        if (s.drawn !== null) return false;
        const c = colorDraw(s);
        if (c) {
          s.hands[actor].push(c);
          s.drawn = c.id;
          s.message = `${s.players[actor].name} drew a card and may play it or keep it.`;
        } else {
          s.message = `${s.players[actor].name} could not draw. The turn passes.`;
          if (!colorBlocked(s)) s.turn = next(s, actor);
        }
        return true;
      }
      if (a.type === "keep") {
        if (s.drawn === null) return false;
        s.drawn = null;
        s.message = `${s.players[actor].name} kept the drawn card.`;
        s.turn = next(s, actor);
        colorBlocked(s);
        return true;
      }
      if (a.type !== "play") return false;
      const id = number(a.card);
      const index = s.hands[actor].findIndex((c) => c.id === id);
      if (index < 0) return false;
      const c = s.hands[actor][index];
      if (!colorLegal(s, c) || (s.drawn !== null && s.drawn !== c.id) || (c.color === "wild" && !colors.includes(a.color))) return false;
      s.hands[actor].splice(index, 1);
      s.pile.push(c);
      s.active = c.color === "wild" ? a.color : c.color;
      s.drawn = null;
      let steps = 1;
      let effect = "";
      if (c.value === "⇄") {
        s.direction *= -1;
        steps = s.players.length === 2 ? 2 : 1;
        effect = s.players.length === 2 ? " Play again." : " Direction reversed.";
      } else if (c.value === "⊘") {
        steps = 2;
        effect = ` ${s.players[next(s, actor)].name}'s turn is skipped.`;
      } else if (c.value === "+2") {
        const target = next(s, actor);
        let taken = 0;
        for (let i = 0; i < 2; i++) {
          const drawn = colorDraw(s);
          if (drawn) { s.hands[target].push(drawn); taken++; }
        }
        steps = 2;
        effect = ` ${s.players[target].name} draws ${taken} and skips a turn.`;
      }
      s.message = `${s.players[actor].name} played ${colorNames[c.color]} ${c.value}.${c.color === "wild" ? ` Next color: ${colorNames[s.active]}.` : ""}${effect}`;
      if (!s.hands[actor].length) win(s, [actor], `${s.players[actor].name} played the last card and wins!${effect}`);
      else s.turn = next(s, actor, steps);
      return true;
    },
    view(s, viewer) {
      const v = publicView(s, viewer);
      v.top = cloneCard(top(s));
      v.active = s.active;
      v.direction = s.direction;
      v.drawn = v.mine ? s.drawn : null;
      v.drawAvailable = v.mine && s.drawn === null;
      v.playable = v.mine ? v.hand.filter((c) => colorLegal(s, c) && (s.drawn === null || s.drawn === c.id)).map((c) => c.id) : [];
      v.canRefill = s.pile.length > 1;
      return v;
    },
    render(v) {
      return `${style}<div class="oc-game">${opponents(v)}<div class="stats">${G.stat("Active color", colorNames[v.active])}${G.stat("Direction", v.direction === 1 ? "Clockwise ↻" : "Counterclockwise ↺")}${G.stat("Draw pile", v.stockCount)}</div><div class="center-pile"><div>${G.back("+1", `data-move="draw" aria-label="Draw one card" ${v.drawAvailable ? "" : "disabled"}`)}<p class="sub-label">DRAW ONE</p></div><div>${colorCard(v.top, "disabled")}<p class="sub-label">TOP CARD</p></div></div>${banner(v)}<div class="oc-fields"><label>Color for your Wild <select data-field="color" aria-label="Color to choose when playing a Wild" ${v.mine ? "" : "disabled"}>${colors.map((c) => `<option value="${c}" ${c === v.active ? "selected" : ""}>${colorNames[c]}</option>`).join("")}</select></label></div>${v.mine && v.drawn !== null ? '<p class="oc-help">You drew the outlined card. Play that card if it matches, or keep it to end your turn.</p>' : '<p class="oc-help">Match the color, number, or symbol. Select a color before playing a Wild.</p>'}${handTitle(v)}<div class="hand">${v.hand.map((c) => colorCard(c, `data-move="play" data-card="${c.id}" ${v.playable.includes(c.id) ? "" : "disabled"}`, `${v.playable.includes(c.id) || v.done ? "" : "dim"} ${v.drawn === c.id ? "oc-drawn" : ""}`)).join("")}</div><div class="toolbar">${v.drawn !== null ? button("Keep card · end turn", "keep", v.mine) : button(v.stockCount || v.canRefill ? "Draw one card" : "No stock · pass", "draw", v.drawAvailable)}</div>${rules("Match the active color or the top card’s number/symbol. Wilds match anything and choose the next color. You may draw one card instead of playing; then play only that card or keep it. Skip skips the next player; Reverse changes direction (with two players, play again). +2 makes the next player draw two and skip. No stacking, +4 cards, or call-out penalties. The discard pile recycles when needed. First empty hand wins.")}</div>`;
    },
  });

  const eightLegal = (s, c) => c.rank === 8 || c.suit === s.active || (top(s).rank !== 8 && c.rank === top(s).rank);
  const eightPoints = (hand) => hand.reduce((sum, c) => sum + (c.rank === 8 ? 50 : Math.min(c.rank, 10)), 0);
  function eightPass(s, actor, drawn) {
    s.passes++;
    s.message = `${s.players[actor].name}${drawn ? ` drew ${drawn} card${drawn === 1 ? "" : "s"} and` : ""} cannot play and passes.`;
    if (s.passes >= s.players.length) {
      const scores = s.hands.map(eightPoints);
      const best = Math.min(...scores);
      const winners = scores.flatMap((score, i) => score === best ? [i] : []);
      win(s, winners, `No more moves. ${winners.map((i) => s.players[i].name).join(" and ")}${winners.length === 1 ? " wins" : " tie"} with the lowest hand value: ${best}.`);
    } else s.turn = next(s, actor);
  }
  R.register("crazy-eights", {
    min: 2, max: 6, title: "Crazy Eights",
    create(players) {
      const s = initial(players);
      s.stock = G.deck();
      s.hands = players.map(() => s.stock.splice(0, 5));
      s.pile = [s.stock.splice(s.stock.findIndex((c) => c.rank !== 8), 1)[0]];
      s.active = top(s).suit;
      s.passes = 0;
      return s;
    },
    act(s, actor, a) {
      if (!allowed(s, actor, a)) return false;
      if (a.type === "draw" || a.type === "pass") {
        if (s.hands[actor].some((c) => eightLegal(s, c)) || (a.type === "pass" && s.stock.length)) return false;
        let count = 0;
        while (s.stock.length && !s.hands[actor].some((c) => eightLegal(s, c))) {
          s.hands[actor].push(s.stock.pop());
          count++;
        }
        if (s.hands[actor].some((c) => eightLegal(s, c))) s.message = `${s.players[actor].name} drew ${count} card${count === 1 ? "" : "s"} and can now play.`;
        else eightPass(s, actor, count);
        return true;
      }
      if (a.type !== "play") return false;
      const id = number(a.card);
      const index = s.hands[actor].findIndex((c) => c.id === id);
      if (index < 0) return false;
      const c = s.hands[actor][index];
      if (!eightLegal(s, c) || (c.rank === 8 && !G.suits.includes(a.suit))) return false;
      s.hands[actor].splice(index, 1);
      s.pile.push(c);
      s.active = c.rank === 8 ? a.suit : c.suit;
      s.passes = 0;
      s.message = `${s.players[actor].name} played ${G.rank(c.rank)}${c.suit}.${c.rank === 8 ? ` Next suit: ${suitNames[s.active]}.` : ""}`;
      if (!s.hands[actor].length) win(s, [actor], `${s.players[actor].name} played the last card and wins!`);
      else s.turn = next(s, actor);
      return true;
    },
    view(s, viewer) {
      const v = publicView(s, viewer);
      v.top = cloneCard(top(s));
      v.active = s.active;
      v.playable = v.mine ? v.hand.filter((c) => eightLegal(s, c)).map((c) => c.id) : [];
      v.canDraw = v.mine && !v.playable.length;
      if (s.done) v.players.forEach((p, i) => { p.score = eightPoints(s.hands[i]); });
      return v;
    },
    render(v) {
      return `${style}<div class="oc-game">${opponents(v)}<div class="stats">${G.stat("Active suit", `${v.active} ${suitNames[v.active]}`)}${G.stat("Draw pile", v.stockCount)}${v.done && v.viewer >= 0 ? G.stat("Your hand value", v.players[v.viewer].score) : ""}</div><div class="center-pile"><div>${G.back(v.stockCount, `data-move="draw" aria-label="${v.stockCount ? "Draw until playable" : "Pass"}" ${v.canDraw ? "" : "disabled"}`)}<p class="sub-label">DRAW PILE</p></div><div>${G.card(v.top, "disabled")}<p class="sub-label">TOP CARD</p></div></div>${banner(v)}<div class="oc-fields"><label>Suit for your 8 <select data-field="suit" aria-label="Suit to choose when playing an eight" ${v.mine ? "" : "disabled"}>${G.suits.map((s) => `<option value="${s}" ${s === v.active ? "selected" : ""}>${s} ${suitNames[s]}</option>`).join("")}</select></label></div><p class="oc-help">Match the suit or rank. Any 8 is wild; choose its suit before playing.</p>${handTitle(v)}<div class="hand">${v.hand.map((c) => G.card(c, `data-move="play" data-card="${c.id}" ${v.playable.includes(c.id) ? "" : "disabled"}`, v.playable.includes(c.id) || v.done ? "" : "dim")).join("")}</div><div class="toolbar">${button(v.stockCount ? "Draw until playable" : "No stock · pass", "draw", v.canDraw)}</div>${rules("Each player starts with five cards. Match the current suit or rank, or play any 8 and select a new suit. You must play if you can; otherwise draw until you have a match. With no stock and no match, pass. The discard pile is not recycled. First empty hand wins. If everyone passes, the lowest hand value wins: 8 = 50, face cards = 10, Ace = 1; ties share the win.")}</div>`;
    },
  });

  function fishCollect(s, player) {
    for (let rank = 1; rank <= 13; rank++) {
      if (s.hands[player].filter((c) => c.rank === rank).length === 4) {
        s.hands[player] = s.hands[player].filter((c) => c.rank !== rank);
        s.books[player].push(rank);
      }
    }
  }
  function fishFinish(s) {
    if (s.books.reduce((sum, b) => sum + b.length, 0) !== 13) return false;
    const most = Math.max(...s.books.map((b) => b.length));
    const winners = s.books.flatMap((b, i) => b.length === most ? [i] : []);
    win(s, winners, `All 13 books are collected. ${winners.map((i) => s.players[i].name).join(" and ")}${winners.length === 1 ? " wins" : " tie"} with ${most} books!`);
    return true;
  }
  function fishReady(s, player) {
    if (fishFinish(s)) return;
    // Refill empty hands immediately, in turn order, keeping targets available.
    for (let offset = 0; offset < s.players.length; offset++) {
      const i = (player + offset) % s.players.length;
      if (!s.hands[i].length && s.stock.length) s.hands[i].push(s.stock.pop());
    }
    for (let offset = 0; offset < s.players.length; offset++) {
      const i = (player + offset) % s.players.length;
      if (s.hands[i].length) { s.turn = i; return; }
    }
    fishFinish(s);
  }
  R.register("go-fish", {
    min: 2, max: 6, title: "Go Fish",
    create(players) {
      const s = initial(players);
      s.stock = G.deck();
      s.hands = players.map(() => s.stock.splice(0, players.length === 2 ? 7 : 5));
      s.books = players.map(() => []);
      s.notes = players.map(() => "");
      players.forEach((_, i) => fishCollect(s, i));
      fishReady(s, 0);
      return s;
    },
    act(s, actor, a) {
      if (!allowed(s, actor, a) || a.type !== "ask") return false;
      const rank = number(a.rank);
      const target = number(a.target);
      if (rank < 1 || rank > 13 || target < 0 || target >= s.players.length || target === actor || !s.hands[target].length || !s.hands[actor].some((c) => c.rank === rank)) return false;
      s.notes.fill("");
      const found = s.hands[target].filter((c) => c.rank === rank);
      let again = false;
      const question = `${s.players[actor].name} asked ${s.players[target].name} for ${G.rank(rank)}s.`;
      if (found.length) {
        s.hands[target] = s.hands[target].filter((c) => c.rank !== rank);
        s.hands[actor].push(...found);
        again = true;
        s.message = `${question} Received ${found.length} card${found.length === 1 ? "" : "s"} and may ask again.`;
      } else if (s.stock.length) {
        const drawn = s.stock.pop();
        s.hands[actor].push(drawn);
        again = drawn.rank === rank;
        s.notes[actor] = `You fished ${G.rank(drawn.rank)}${drawn.suit}.${again ? " You found the requested rank — ask again!" : ""}`;
        s.message = `${question} Go fish! ${again ? "Found the requested rank and may ask again." : "Drew a card; the turn passes."}`;
      } else s.message = `${question} No match, and the pond is empty. The turn passes.`;
      const before = s.books[actor].length;
      fishCollect(s, actor);
      if (s.books[actor].length > before) s.message += ` Collected ${s.books[actor].length - before} book${s.books[actor].length - before === 1 ? "" : "s"}!`;
      fishReady(s, again ? actor : next(s, actor));
      return true;
    },
    view(s, viewer) {
      const v = publicView(s, viewer);
      v.players.forEach((p, i) => { p.books = [...s.books[i]]; });
      v.hand.sort((a, b) => a.rank - b.rank || a.id - b.id);
      v.ranks = [...new Set(v.hand.map((c) => c.rank))];
      v.targets = v.players.flatMap((p, i) => i !== v.viewer && p.count > 0 ? [i] : []);
      v.notice = v.viewer >= 0 ? s.notes[v.viewer] : "";
      return v;
    },
    render(v) {
      const ownBooks = v.viewer >= 0 ? v.players[v.viewer].books : [];
      const totalBooks = v.players.reduce((sum, p) => sum + p.books.length, 0);
      return `${style}<div class="oc-game">${opponents(v)}<div class="stats">${G.stat("Your books", ownBooks.length)}${G.stat("Books collected", `${totalBooks} / 13`)}${G.stat("Cards in the pond", v.stockCount)}</div>${banner(v)}${v.notice ? `<p class="oc-help">${G.esc(v.notice)}</p>` : ""}<div class="oc-fields"><label>Ask a player <select data-field="target" aria-label="Player to ask for cards" ${v.mine && v.targets.length ? "" : "disabled"}>${v.targets.map((i) => `<option value="${i}">${G.esc(v.players[i].name)} · ${v.players[i].count} cards</option>`).join("")}</select></label></div><p class="sub-label">CHOOSE A RANK YOU HOLD</p><div class="hand">${v.ranks.map((rank) => `<button class="rank-button" data-move="ask" data-rank="${rank}" ${v.mine && v.targets.length ? "" : "disabled"} aria-label="Ask for ${G.rank(rank)}">${G.rank(rank)}<small>have ${v.hand.filter((c) => c.rank === rank).length}</small></button>`).join("") || '<p class="oc-empty">No cards in your hand.</p>'}</div>${handTitle(v)}<div class="hand">${v.hand.map((c) => G.card(c, "disabled")).join("")}</div><p class="sub-label">YOUR COLLECTED BOOKS</p>${books(ownBooks)}${rules("Choose an opponent, then ask for a rank in your hand. They must give you every card of that rank; a successful ask lets you ask again. If they have none, draw one card from the pond. Drawing the requested rank earns another turn; otherwise the turn passes. Four matching ranks become a book automatically. Empty hands refill with one card while the pond has cards; with no stock, players with empty hands are skipped. Collect all 13 books to finish. Most books wins; ties share the win.")}</div>`;
    },
  });
})();
