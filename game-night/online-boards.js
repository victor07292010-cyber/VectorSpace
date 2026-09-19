"use strict";

// Host-owned state stays in create/act. Only the explicit view objects travel
// across the room connection; renderers never receive a secret game state.
(() => {
  const R = window.RoomGames;
  const G = window.GameNight;
  const esc = G.esc;
  const rand = (n) => Math.floor(Math.random() * n);
  const sum = (a) => a.reduce((total, n) => total + n, 0);
  const clone = (a) => a.map((p) => ({ id: p.id, name: p.name }));
  const button = (label, type, attrs = "", disabled = false) =>
    `<button class="button" data-move="${type}" ${attrs} ${disabled ? "disabled" : ""}>${esc(label)}</button>`;
  const stat = (label, value) => G.stat(esc(label), esc(value));
  const status = (message, done) => G.status(message, done);
  const diceFace = (n) => (n ? "⚀⚁⚂⚃⚄⚅"[n - 1] : "·");
  const dice = (values) => `<div class="dice">${values.map((n) => `<div class="die" aria-label="${n ? `Die ${n}` : "Unrolled die"}">${diceFace(n)}</div>`).join("")}</div>`;
  const seat = (s, i) => Number.isInteger(i) && i >= 0 && i < s.players.length;
  const valid = (s, i, a) => !s.done && seat(s, i) && a && typeof a === "object" && typeof a.type === "string";
  const integer = (value, min, max) => {
    if (typeof value !== "string" && typeof value !== "number") return null;
    if (typeof value === "string" && !/^\d+$/.test(value)) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
  };
  function base(players, min, max) {
    if (!Array.isArray(players) || players.length < min || players.length > max)
      throw new Error(`This game needs ${min === max ? min : `${min}–${max}`} players.`);
    return { players: clone(players), turn: 0, done: false, winners: [] };
  }
  function publicBase(s, viewer) {
    return {
      players: clone(s.players), self: seat(s, viewer) ? viewer : -1,
      me: seat(s, viewer) ? viewer : -1,
      phase: s.phase || (s.done ? "done" : "play"),
      turn: s.turn, done: s.done, winners: [...s.winners],
      canAct: !s.done && seat(s, viewer) && viewer === s.turn,
      message: s.message || "",
    };
  }
  const name = (s, i) => s.players[i]?.name || "Player";
  function winnerText(s, detail = "wins!") {
    return s.winners.length === 1
      ? `${name(s, s.winners[0])} ${detail}`
      : s.winners.length ? `${s.winners.map((i) => name(s, i)).join(" and ")} tie!` : "It’s a draw. Well played!";
  }
  function scoreStats(v, suffix = "") {
    return `<div class="stats">${v.players.map((p, i) => stat(`${p.name}${i === v.self ? " · you" : ""}`, v.scores[i] === null ? "Waiting" : `${v.scores[i]}${suffix}`)).join("")}</div>`;
  }
  function turnLine(v, instruction) {
    return v.done ? status(v.message, true) : status(`${v.message ? v.message + " " : ""}${v.canAct ? "Your turn" : `${name(v, v.turn)}’s turn`}${instruction ? ` · ${instruction}` : ""}.`, false);
  }

  function fourLine(board, player) {
    for (let row = 0; row < 6; row++) {
      for (let col = 0; col < 7; col++) {
        for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
          const cells = Array.from({ length: 4 }, (_, k) => [row + k * dr, col + k * dc]);
          if (cells.every(([y, x]) => y >= 0 && y < 6 && x >= 0 && x < 7 && board[y * 7 + x] === player))
            return cells.map(([y, x]) => y * 7 + x);
        }
      }
    }
    return [];
  }
  R.register("connect-four", {
    min: 2, max: 2, title: "Connect Four",
    create(players) {
      return { ...base(players, 2, 2), board: Array(42).fill(0), win: [], message: "" };
    },
    act(s, actor, a) {
      if (!valid(s, actor, a) || actor !== s.turn || a.type !== "drop") return false;
      const col = integer(a.col, 0, 6);
      if (col === null || s.board[col]) return false;
      let row = 5;
      while (s.board[row * 7 + col]) row--;
      s.board[row * 7 + col] = actor + 1;
      s.win = fourLine(s.board, actor + 1);
      if (s.win.length) {
        s.done = true; s.winners = [actor]; s.message = winnerText(s, "wins with four in a row!");
      } else if (s.board.every(Boolean)) {
        s.done = true; s.message = "A full board. It’s a draw!";
      } else s.turn = 1 - actor;
      return true;
    },
    view(s, viewer) { return { ...publicBase(s, viewer), board: [...s.board], win: [...s.win] }; },
    render(v) {
      return `${turnLine(v, "choose a column")}<div class="connect-board">${v.board.map((n, i) => `<button class="connect-cell ${n ? `p${n}` : ""} ${v.win.includes(i) ? "win" : ""}" data-move="drop" data-col="${i % 7}" aria-label="Column ${i % 7 + 1}, row ${Math.floor(i / 7) + 1}, ${n ? n === 1 ? "gold" : "coral" : "empty"}" ${!v.canAct || v.board[i % 7] ? "disabled" : ""}></button>`).join("")}</div><p class="muted center">${esc(name(v, 0))} · Gold ● &nbsp; / &nbsp; ${esc(name(v, 1))} · Coral ●</p>`;
    },
  });

  const ticLines = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
  R.register("tic-tac-toe", {
    min: 2, max: 2, title: "Tic Tac Toe",
    create(players) { return { ...base(players, 2, 2), board: Array(9).fill(""), win: [], message: "" }; },
    act(s, actor, a) {
      if (!valid(s, actor, a) || actor !== s.turn || a.type !== "mark") return false;
      const i = integer(a.i, 0, 8);
      if (i === null || s.board[i]) return false;
      s.board[i] = actor === 0 ? "X" : "O";
      s.win = ticLines.find((line) => line.every((cell) => s.board[cell] === s.board[i])) || [];
      if (s.win.length) {
        s.done = true; s.winners = [actor]; s.message = winnerText(s);
      } else if (s.board.every(Boolean)) {
        s.done = true; s.message = "It’s a draw. Well played!";
      } else s.turn = 1 - actor;
      return true;
    },
    view(s, viewer) { return { ...publicBase(s, viewer), board: [...s.board], win: [...s.win] }; },
    render(v) {
      return `${turnLine(v, "claim an empty square")}<div class="ttt-board">${v.board.map((mark, i) => `<button class="ttt-cell ${mark === "O" ? "o" : ""}" data-move="mark" data-i="${i}" aria-label="Row ${Math.floor(i / 3) + 1}, column ${i % 3 + 1}, ${mark || "empty"}${v.win.includes(i) ? ", winning line" : ""}" ${mark || !v.canAct ? "disabled" : ""}>${mark}</button>`).join("")}</div><p class="muted center">${esc(name(v, 0))} · X &nbsp; / &nbsp; ${esc(name(v, 1))} · O</p>`;
    },
  });

  R.register("pig", {
    min: 2, max: 6, title: "Pig Dice",
    create(players) {
      return { ...base(players, 2, 6), scores: players.map(() => 0), bank: 0, die: 0, message: "First to bank 100 points wins." };
    },
    act(s, actor, a) {
      if (!valid(s, actor, a) || actor !== s.turn) return false;
      if (a.type === "roll") {
        s.die = rand(6) + 1;
        if (s.die === 1) {
          s.message = `${name(s, actor)} rolled a 1 and lost ${s.bank} unbanked points.`;
          s.bank = 0; s.turn = (actor + 1) % s.players.length;
        } else {
          s.bank += s.die; s.message = `Rolled ${s.die}. Keep rolling or bank your points.`;
        }
        return true;
      }
      if (a.type === "bank" && s.bank > 0) {
        s.scores[actor] += s.bank;
        s.message = `${name(s, actor)} banked ${s.bank} points.`;
        s.bank = 0;
        if (s.scores[actor] >= 100) {
          s.done = true; s.winners = [actor]; s.message = winnerText(s, `wins with ${s.scores[actor]} points!`);
        } else s.turn = (actor + 1) % s.players.length;
        return true;
      }
      return false;
    },
    view(s, viewer) { return { ...publicBase(s, viewer), scores: [...s.scores], bank: s.bank, die: s.die }; },
    render(v) {
      return `${scoreStats(v)}<div class="stats">${stat("This turn · unbanked", v.bank)}${stat("Goal", "100 points")}</div>${dice([v.die])}${turnLine(v, "roll or bank")}<div class="toolbar">${button("Roll die", "roll", "", !v.canAct)}${button(`Bank ${v.bank} points`, "bank", "", !v.canAct || !v.bank)}</div>`;
    },
  });

  R.register("memory", {
    min: 2, max: 6, title: "Memory Match",
    create(players) {
      const symbols = ["♠", "♥", "♦", "♣", "★", "☀", "♫", "✿"];
      return { ...base(players, 2, 6), cards: G.shuffle([...symbols, ...symbols]), selected: [], matched: [], scores: players.map(() => 0), moves: 0, phase: "pick", message: "A pair earns a point and another turn." };
    },
    act(s, actor, a) {
      if (!valid(s, actor, a) || actor !== s.turn) return false;
      if (a.type === "continue" && s.phase === "mismatch") {
        s.selected = []; s.phase = "pick"; s.turn = (actor + 1) % s.players.length;
        s.message = "The cards are hidden again. Find a pair.";
        return true;
      }
      if (a.type !== "flip" || s.phase !== "pick") return false;
      const i = integer(a.i, 0, s.cards.length - 1);
      if (i === null || s.selected.includes(i) || s.matched.includes(i)) return false;
      s.selected.push(i);
      s.message = "Choose one more card.";
      if (s.selected.length === 2) {
        s.moves++;
        if (s.cards[s.selected[0]] === s.cards[s.selected[1]]) {
          s.matched.push(...s.selected); s.selected = []; s.scores[actor]++;
          s.message = `${name(s, actor)} found a pair and plays again!`;
          if (s.matched.length === s.cards.length) {
            s.done = true;
            const best = Math.max(...s.scores);
            s.winners = s.scores.flatMap((score, index) => score === best ? [index] : []);
            s.message = `${winnerText(s)} All 8 pairs found in ${s.moves} turns.`;
          }
        } else {
          s.phase = "mismatch"; s.message = "No match. Remember these cards, then continue to the next player.";
        }
      }
      return true;
    },
    view(s, viewer) {
      return {
        ...publicBase(s, viewer), scores: [...s.scores], moves: s.moves, phase: s.phase,
        cards: s.cards.map((symbol, i) => s.selected.includes(i) || s.matched.includes(i) ? symbol : null),
        matched: [...s.matched],
      };
    },
    render(v) {
      return `${scoreStats(v, " pairs")}${turnLine(v, "")}
        <div class="memory-board">${v.cards.map((symbol, i) => `<button class="memory-card ${v.matched.includes(i) ? "matched" : symbol ? "open" : ""}" data-move="flip" data-i="${i}" aria-label="Card ${i + 1}, ${symbol || "face down"}" ${!v.canAct || symbol || v.phase !== "pick" ? "disabled" : ""}>${symbol || "⁙"}</button>`).join("")}</div>
        ${v.phase === "mismatch" ? `<div class="toolbar">${button("Hide cards & continue", "continue", "", !v.canAct)}</div>` : ""}<p class="muted center">${v.moves} turns · ${v.matched.length / 2} of 8 pairs found</p>`;
    },
  });

  function boxPossible(open, total) {
    for (let mask = 1; mask < 1 << open.length; mask++) {
      if (open.reduce((value, n, i) => value + (mask & 1 << i ? n : 0), 0) === total) return true;
    }
    return false;
  }
  function finishBoxRound(s) {
    s.scores[s.turn] = sum(s.open);
    s.phase = "round-end";
    s.message = `${name(s, s.turn)} finishes with ${s.scores[s.turn]} points.${s.scores[s.turn] === 0 ? " A perfect shut box!" : ""}`;
    if (s.turn === s.players.length - 1) {
      s.done = true;
      const lowest = Math.min(...s.scores);
      s.winners = s.scores.flatMap((score, i) => score === lowest ? [i] : []);
      s.message = `${winnerText(s)} Lowest score: ${lowest}.`;
    }
  }
  R.register("shut-box", {
    min: 2, max: 6, title: "Shut the Box",
    create(players) {
      return { ...base(players, 2, 6), scores: players.map(() => null), open: [1, 2, 3, 4, 5, 6, 7, 8, 9], selected: [], dice: [], phase: "roll", message: "One round each. The lowest score wins." };
    },
    act(s, actor, a) {
      if (!valid(s, actor, a) || actor !== s.turn) return false;
      if (a.type === "next" && s.phase === "round-end") {
        s.turn++; s.open = [1, 2, 3, 4, 5, 6, 7, 8, 9]; s.selected = []; s.dice = []; s.phase = "roll";
        s.message = "A fresh box. Roll the dice."; return true;
      }
      if (a.type === "roll" && s.phase === "roll") {
        const count = a.count === undefined ? 2 : integer(a.count, 1, 2);
        if (count === null || count === 1 && s.open.some((n) => n >= 7)) return false;
        s.dice = Array.from({ length: count }, () => rand(6) + 1);
        const total = sum(s.dice);
        if (boxPossible(s.open, total)) {
          s.phase = "select"; s.message = `Rolled ${total}. Select open numbers totaling ${total}.`;
        } else {
          finishBoxRound(s);
          if (!s.done) s.message = `No combination for ${total}. ${s.message}`;
        }
        return true;
      }
      if (a.type === "tile" && s.phase === "select") {
        const n = integer(a.n, 1, 9);
        if (n === null || !s.open.includes(n)) return false;
        s.selected = s.selected.includes(n) ? s.selected.filter((value) => value !== n) : [...s.selected, n];
        return true;
      }
      if (a.type === "close" && s.phase === "select" && s.selected.length > 0 && sum(s.selected) === sum(s.dice)) {
        s.open = s.open.filter((n) => !s.selected.includes(n)); s.selected = [];
        if (s.open.length) { s.phase = "roll"; s.message = "Numbers closed. Roll again!"; }
        else finishBoxRound(s);
        return true;
      }
      return false;
    },
    view(s, viewer) {
      return { ...publicBase(s, viewer), round: s.turn + 1, scores: [...s.scores], open: [...s.open], selected: [...s.selected], dice: [...s.dice], phase: s.phase };
    },
    render(v) {
      const total = sum(v.dice), selected = sum(v.selected);
      return `${scoreStats(v)}<p class="sub-label">${esc(name(v, v.turn))}’s box · ${sum(v.open)} points open</p>
        <div class="number-tiles">${Array.from({ length: 9 }, (_, i) => i + 1).map((n) => `<button class="number-tile ${!v.open.includes(n) ? "closed" : ""} ${v.selected.includes(n) ? "chosen" : ""}" data-move="tile" data-n="${n}" aria-pressed="${v.selected.includes(n)}" aria-label="${n}${!v.open.includes(n) ? ", closed" : ""}" ${!v.canAct || v.phase !== "select" || !v.open.includes(n) ? "disabled" : ""}>${n}</button>`).join("")}</div>
        ${dice(v.dice.length ? v.dice : [0, 0])}${turnLine(v, "")}
        <div class="toolbar">${v.phase === "roll" ? `${v.open.every((n) => n < 7) ? `<label>Dice <select data-field="count" ${!v.canAct ? "disabled" : ""}><option value="2">Two dice</option><option value="1">One die</option></select></label>` : ""}${button("Roll dice", "roll", "", !v.canAct)}` : v.phase === "select" ? button(`Close numbers (${selected} / ${total})`, "close", "", !v.canAct || selected !== total) : !v.done ? button("Next player", "next", "", !v.canAct) : ""}</div><p class="muted center">Each player gets one full round. Lowest total left open wins.</p>`;
    },
  });

  const shipLengths = [5, 4, 3, 3, 2];
  const shipNames = ["Carrier", "Battleship", "Cruiser", "Submarine", "Patrol"];
  function randomFleet() {
    const ships = [];
    for (const length of shipLengths) {
      let cells;
      do {
        const vertical = !!rand(2), row = rand(vertical ? 11 - length : 10), col = rand(vertical ? 10 : 11 - length);
        cells = Array.from({ length }, (_, i) => (row + (vertical ? i : 0)) * 10 + col + (vertical ? 0 : i));
      } while (ships.some((ship) => ship.some((cell) => cells.includes(cell))));
      ships.push(cells);
    }
    return ships;
  }
  const isSunk = (ship, shots) => ship.every((cell) => shots.includes(cell));
  const ocean = (ships, shots, showShips) => Array.from({ length: 100 }, (_, cell) => {
    const ship = ships.find((cells) => cells.includes(cell));
    const fired = shots.includes(cell);
    return {
      ship: !!showShips && !!ship,
      shot: fired ? ship ? isSunk(ship, shots) ? "sunk" : "hit" : "miss" : "",
    };
  });
  const shipPills = (sunk) => `<div class="ship-list">${shipLengths.map((length, i) => `<span class="ship-pill ${sunk[i] ? "sunk" : ""}">${shipNames[i]} ${length}${sunk[i] ? " · sunk" : ""}</span>`).join("")}</div>`;
  function oceanGrid(cells, own, enabled) {
    return `<div class="sea-grid">${cells.map((cell, i) => `<button class="sea-cell ${cell.ship ? "ship" : ""} ${cell.shot === "sunk" ? "hit sunk" : cell.shot}" ${own ? "" : `data-move="fire" data-i="${i}"`} aria-label="${own ? "Your fleet" : "Enemy ocean"}, ${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10 + 1}${cell.shot ? `, ${cell.shot}` : cell.ship ? ", ship" : ""}" ${own || !enabled || cell.shot ? "disabled" : ""}>${cell.shot === "hit" || cell.shot === "sunk" ? "×" : cell.shot === "miss" ? "·" : ""}</button>`).join("")}</div>`;
  }
  R.register("sea-battle", {
    concurrentActions: ["shuffle", "ready"],
    min: 2, max: 2, title: "Sea Battle",
    create(players) {
      return { ...base(players, 2, 2), fleets: [randomFleet(), randomFleet()], shots: [[], []], ready: [false, false], phase: "setup", message: "Arrange your fleet, then ready up. Both captains must be ready." };
    },
    act(s, actor, a) {
      if (!valid(s, actor, a)) return false;
      if (s.phase === "setup") {
        if (s.ready[actor]) return false;
        if (a.type === "shuffle") { s.fleets[actor] = randomFleet(); return true; }
        if (a.type === "ready") {
          s.ready[actor] = true;
          if (s.ready.every(Boolean)) {
            s.phase = "battle"; s.message = "Both fleets are ready. Choose an enemy square to fire.";
          }
          return true;
        }
        return false;
      }
      if (s.phase !== "battle" || actor !== s.turn || a.type !== "fire") return false;
      const i = integer(a.i, 0, 99);
      if (i === null || s.shots[actor].includes(i)) return false;
      s.shots[actor].push(i);
      const enemy = s.fleets[1 - actor], ship = enemy.find((cells) => cells.includes(i));
      const sunk = !!ship && isSunk(ship, s.shots[actor]);
      s.message = `${name(s, actor)} fired at ${String.fromCharCode(65 + Math.floor(i / 10))}${i % 10 + 1}: ${ship ? sunk ? `${shipNames[enemy.indexOf(ship)]} sunk!` : "hit!" : "miss."}`;
      if (enemy.every((cells) => isSunk(cells, s.shots[actor]))) {
        s.done = true; s.phase = "done"; s.winners = [actor]; s.message = winnerText(s, "sank all five ships. Victory!");
      } else s.turn = 1 - actor;
      return true;
    },
    view(s, viewer) {
      const i = seat(s, viewer) ? viewer : 0;
      return {
        ...publicBase(s, viewer), phase: s.phase, ready: [...s.ready],
        mine: ocean(s.fleets[i], s.shots[1 - i], seat(s, viewer)),
        enemy: ocean(s.fleets[1 - i], s.shots[i], false),
        mySunk: s.fleets[i].map((ship) => isSunk(ship, s.shots[1 - i])),
        enemySunk: s.fleets[1 - i].map((ship) => isSunk(ship, s.shots[i])),
      };
    },
    render(v) {
      const setup = v.phase === "setup", ownReady = v.self >= 0 && v.ready[v.self];
      return `${setup ? status(ownReady ? "Your fleet is locked. Waiting for the other captain to ready up." : v.message, false) : turnLine(v, "fire at the enemy ocean")}
        <div class="sea-boards"><div><h3 class="center">Your fleet</h3>${oceanGrid(v.mine, true, false)}${shipPills(v.mySunk)}</div><div><h3 class="center">Enemy ocean</h3>${oceanGrid(v.enemy, false, v.canAct && !setup)}${shipPills(v.enemySunk)}</div></div>
        ${setup ? `<div class="toolbar">${button("Shuffle fleet", "shuffle", "", v.self < 0 || ownReady)}${button(ownReady ? "Fleet ready ✓" : "Ready for battle", "ready", "", v.self < 0 || ownReady)}</div><p class="muted center">${v.players.map((p, i) => `${esc(p.name)} · ${v.ready[i] ? "ready ✓" : "placing ships"}`).join(" &nbsp; / &nbsp; ")}</p>` : `<div class="stats">${stat("Your ships afloat", 5 - v.mySunk.filter(Boolean).length)}${stat("Enemy ships afloat", 5 - v.enemySunk.filter(Boolean).length)}</div>`}
        <p class="muted center">× Hit · dot Miss · gold Sunk. Captains alternate one shot each.</p>`;
    },
  });

  const spectrumPrompts = [
    ["Cold", "Hot"], ["Forgettable", "Unforgettable"], ["Tiny inconvenience", "Total disaster"],
    ["Everyday thing", "Luxury"], ["Quiet", "Loud"], ["Easy to learn", "Hard to learn"],
    ["Villain", "Hero"], ["Underrated", "Overrated"], ["Bad gift", "Great gift"],
    ["Boring", "Thrilling"], ["Unlucky", "Lucky"], ["Mild", "Spicy"],
    ["Old-fashioned", "Futuristic"], ["Messy", "Neat"], ["Cheap", "Expensive"],
    ["Serious", "Silly"], ["Slow", "Fast"], ["Fragile", "Indestructible"],
    ["Scary", "Comforting"], ["Needs no skill", "Takes great skill"],
    ["Terrible superpower", "Amazing superpower"], ["Uncomfortable", "Cozy"],
    ["Short wait", "Long wait"], ["A snack", "A feast"], ["Tame", "Wild"],
    ["Terrible first date", "Perfect first date"], ["Small talk", "Deep conversation"],
    ["Terrible smell", "Wonderful smell"],
  ];
  const spectrumScore = (distance) => distance <= 3 ? 4 : distance <= 6 ? 3 : distance <= 12 ? 2 : 0;
  function spectrumTrack(v, showGuess) {
    return `<div class="spectrum-track">${v.target !== null ? `<span class="target-zone" style="left:${v.target}%;width:24%"><span class="target-middle"></span><span class="target-core"></span><span class="target-line"></span></span>` : ""}${showGuess !== null ? `<span class="guess-marker" data-guess-marker style="left:${showGuess}%"></span>` : ""}</div><div class="spectrum-ends"><span>${esc(v.pair[0])}</span><span>${esc(v.pair[1])}</span></div>`;
  }
  R.register("spectrum", {
    concurrentActions: ["guess"],
    min: 2, max: 8, title: "Spectrum",
    create(players) {
      return { ...base(players, 2, 8), prompts: G.shuffle(spectrumPrompts.map((pair) => [...pair])), round: 1, total: 0, target: rand(101), clue: "", guesses: players.map(() => null), phase: "clue", roundScore: 0, teamGuess: null };
    },
    act(s, actor, a) {
      if (!valid(s, actor, a)) return false;
      if (a.type === "clue" && s.phase === "clue" && actor === s.turn) {
        if (typeof a.clue !== "string") return false;
        const clue = a.clue.trim();
        if (!clue || clue.length > 100) return false;
        s.clue = clue; s.phase = "guess"; return true;
      }
      if (a.type === "guess" && s.phase === "guess" && actor !== s.turn && s.guesses[actor] === null) {
        const guess = integer(a.guess, 0, 100);
        if (guess === null) return false;
        s.guesses[actor] = guess;
        const guesses = s.guesses.filter((_, i) => i !== s.turn);
        if (guesses.every((value) => value !== null)) {
          s.teamGuess = Math.round(sum(guesses) / guesses.length);
          s.roundScore = spectrumScore(Math.abs(s.target - s.teamGuess));
          s.total += s.roundScore; s.phase = "reveal";
          if (s.round === 5) s.done = true;
        }
        return true;
      }
      if (a.type === "next" && s.phase === "reveal" && actor === s.turn && s.round < 5) {
        s.round++; s.turn = (s.turn + 1) % s.players.length;
        s.target = rand(101); s.clue = ""; s.guesses = s.players.map(() => null);
        s.phase = "clue"; s.roundScore = 0; s.teamGuess = null; return true;
      }
      return false;
    },
    view(s, viewer) {
      const reveal = s.phase === "reveal";
      return {
        ...publicBase(s, viewer), round: s.round, total: s.total, phase: s.phase,
        pair: [...s.prompts[s.round - 1]], clue: s.clue,
        target: reveal || viewer === s.turn ? s.target : null,
        locked: s.guesses.map((guess) => guess !== null),
        guesses: s.guesses.map((guess, i) => reveal || i === viewer ? guess : null),
        ownGuess: seat(s, viewer) ? s.guesses[viewer] : null,
        roundScore: reveal ? s.roundScore : 0,
        teamGuess: reveal ? s.teamGuess : null,
      };
    },
    render(v) {
      const clueGiver = v.self === v.turn;
      let content;
      if (v.phase === "clue") {
        content = clueGiver
          ? `<p class="eyebrow" style="color:#c2d0b9">YOUR PRIVATE TARGET</p>${spectrumTrack(v, null)}<p>Your target is <strong>${v.target} / 100</strong>. Give a clue that fits this position.</p><label class="input-label" for="room-spectrum-clue">Your clue</label><input id="room-spectrum-clue" data-field="clue" type="text" maxlength="100" placeholder="Something your group will understand…" autocomplete="off"><p class="muted">Avoid numbers and the two words on the scale.</p><div class="toolbar">${button("Send clue", "clue")}</div>`
          : `${spectrumTrack(v, null)}<div class="privacy-card"><h3>${esc(name(v, v.turn))} is finding a clue.</h3><p>Only the clue-giver can see the secret target. Your guess is next.</p></div>`;
      } else if (v.phase === "guess") {
        const canGuess = v.self >= 0 && !clueGiver && v.ownGuess === null;
        content = `<p class="sub-label">${esc(name(v, v.turn))}’S CLUE</p><p class="clue">“${esc(v.clue)}”</p>${spectrumTrack(v, clueGiver ? null : v.ownGuess === null ? 50 : v.ownGuess)}
          ${clueGiver ? `<p class="muted">Your secret target: ${v.target}. Keep it to yourself while your friends guess.</p>` : canGuess ? `<label for="room-spectrum-guess">Your guess: <output id="room-guess-value" data-range-output="guess">50</output> / 100</label><input id="room-spectrum-guess" data-field="guess" type="range" min="0" max="100" step="1" value="50" aria-label="Your guess between ${esc(v.pair[0])} and ${esc(v.pair[1])}"><div class="toolbar">${button("Lock my guess", "guess")}</div>` : `<p class="muted">${v.self < 0 ? "The players are guessing." : `Your guess of ${v.ownGuess} is locked. Waiting for the other guesses.`}</p>`}
          <p class="muted">${v.players.filter((_, i) => i !== v.turn).map((p) => { const i = v.players.indexOf(p); return `${esc(p.name)} · ${v.locked[i] ? "locked ✓" : "thinking…"}`; }).join(" &nbsp; / &nbsp; ")}</p>`;
      } else {
        content = `${spectrumTrack(v, v.teamGuess)}<p class="clue">“${esc(v.clue)}”</p>${status(`Target ${v.target} · Team guess ${v.teamGuess} · ${Math.abs(v.target - v.teamGuess)} away`, true)}<div class="big-score">+${v.roundScore}</div><div class="stats">${v.players.map((p, i) => i === v.turn ? "" : stat(p.name, `${v.guesses[i]} · ${Math.abs(v.target - v.guesses[i])} away`)).join("")}</div>
          ${v.done ? `<h3>Final team score: ${v.total} / 20</h3><p>${v.total >= 16 ? "Your team is wonderfully in sync." : v.total >= 8 ? "Some great connections. There’s more to discover." : "A perfect excuse for another game together."}</p>` : `<div class="toolbar">${button("Next clue-giver · next round", "next", "", !clueGiver)}</div>${!clueGiver ? `<p class="muted">${esc(name(v, v.turn))} can start the next round.</p>` : ""}`}`;
      }
      return `<div class="stats">${stat("Round", `${v.round} / 5`)}${stat("Team score", `${v.total} / 20`)}${stat("Clue-giver", name(v, v.turn))}</div><div class="spectrum-area">${content}<p class="muted">The team guess is the rounded average of everyone’s guesses. Within 3: 4 points · within 6: 3 · within 12: 2.</p></div>`;
    },
  });
})();
