"use strict";
(() => {
  const R = RoomGames,
    G = GameNight,
    esc = G.esc;
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const integer = (v, min, max) =>
    ((typeof v === "string" && /^\d+$/.test(v)) || typeof v === "number") &&
    Number.isInteger(Number(v)) &&
    Number(v) >= min &&
    Number(v) <= max
      ? Number(v)
      : null;
  const base = (players, min, max) => {
    if (players.length < min || players.length > max)
      throw Error("Invalid player count");
    return {
      players: players.map((p) => ({ id: p.id, name: p.name })),
      turn: 0,
      done: false,
      winners: [],
      phase: "play",
      message: "",
    };
  };
  const valid = (s, p, a) =>
    !s.done &&
    Number.isInteger(p) &&
    p >= 0 &&
    p < s.players.length &&
    a &&
    typeof a.type === "string";
  const name = (s, p) => s.players[p].name;
  const playerStats = (v, scores) =>
    `<div class="stats">${v.players.map((p, i) => G.stat(esc(p.name) + (i === v.me ? " · you" : ""), scores[i])).join("")}</div>`;
  const banner = (v) =>
    G.status(
      v.done
        ? v.message
        : (v.message ? v.message + " " : "") +
            (v.turn === v.me ? "Your turn." : name(v, v.turn) + "’s turn."),
      v.done,
    );
  function finish(s, scores) {
    s.done = true;
    s.phase = "done";
    const best = Math.max(...scores);
    s.winners = scores
      .map((v, i) => (v === best ? i : -1))
      .filter((i) => i >= 0);
    s.message =
      s.winners.map((i) => name(s, i)).join(" & ") +
      (s.winners.length === 1 ? " wins!" : " tie for the win!");
  }
  const seatColor = (i) =>
    [
      "#f6c65e",
      "#ed9b83",
      "#a7ccb6",
      "#b7afe0",
      "#8cc0d5",
      "#efa8c0",
      "#c5d17b",
      "#d0b19a",
    ][i % 8];
  R.register("dots-boxes", {
    title: "Dots & Boxes",
    min: 2,
    max: 4,
    create(players) {
      return {
        ...base(players, 2, 4),
        edges: Array(24).fill(-1),
        boxes: Array(9).fill(-1),
        scores: players.map(() => 0),
        message: "Claim a line. Complete a box to score and play again.",
      };
    },
    act(s, p, a) {
      if (!valid(s, p, a) || p !== s.turn || a.type !== "edge") return false;
      const edge = integer(a.edge, 0, 23);
      if (edge === null || s.edges[edge] !== -1) return false;
      s.edges[edge] = p;
      let made = 0;
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++) {
          const b = r * 3 + c;
          if (
            s.boxes[b] === -1 &&
            [
              r * 3 + c,
              (r + 1) * 3 + c,
              12 + r * 4 + c,
              12 + r * 4 + c + 1,
            ].every((e) => s.edges[e] !== -1)
          ) {
            s.boxes[b] = p;
            s.scores[p]++;
            made++;
          }
        }
      if (s.boxes.every((v) => v >= 0)) finish(s, s.scores);
      else if (made)
        s.message = `${name(s, p)} completed ${made} ${made === 1 ? "box" : "boxes"}! Take another line.`;
      else {
        s.turn = (s.turn + 1) % s.players.length;
        s.message = "";
      }
      return true;
    },
    view(s, p) {
      return { ...copy(s), me: p };
    },
    render(v) {
      let cells = "";
      for (let r = 0; r < 7; r++)
        for (let c = 0; c < 7; c++) {
          if (r % 2 === 0 && c % 2 === 0)
            cells += '<span class="dot-node"></span>';
          else if (r % 2 && c % 2) {
            const owner = v.boxes[((r - 1) / 2) * 3 + (c - 1) / 2];
            cells += `<span class="dot-box ${owner >= 0 ? "claimed" : ""}" style="--seat:${seatColor(owner)}">${owner < 0 ? "" : esc(v.players[owner].name.slice(0, 1).toUpperCase())}</span>`;
          } else {
            const horizontal = r % 2 === 0,
              idx = horizontal
                ? (r / 2) * 3 + (c - 1) / 2
                : 12 + ((r - 1) / 2) * 4 + c / 2,
              owner = v.edges[idx];
            cells += `<button class="dot-edge ${horizontal ? "horizontal" : "vertical"} ${owner >= 0 ? "owned" : ""}" style="--seat:${seatColor(owner)}" data-move="edge" data-edge="${idx}" aria-label="${horizontal ? "Horizontal" : "Vertical"} line ${idx + 1}${owner >= 0 ? ", claimed by " + esc(v.players[owner].name) : ""}" ${owner >= 0 || v.done || v.turn !== v.me ? "disabled" : ""}></button>`;
          }
        }
      return `${playerStats(v, v.scores)}${banner(v)}<div class="dots-board">${cells}</div><p class="muted center">Complete the fourth side of a box to claim it and play again. Most of the nine boxes wins.</p>`;
    },
  });
  function flips(board, p, i) {
    if (board[i]) return [];
    let all = [],
      r = Math.floor(i / 8),
      c = i % 8;
    for (let dr = -1; dr <= 1; dr++)
      for (let dc = -1; dc <= 1; dc++) {
        if (!dr && !dc) continue;
        let y = r + dr,
          x = c + dc,
          a = [];
        while (
          y >= 0 &&
          y < 8 &&
          x >= 0 &&
          x < 8 &&
          board[y * 8 + x] === 2 - p
        ) {
          a.push(y * 8 + x);
          y += dr;
          x += dc;
        }
        if (
          a.length &&
          y >= 0 &&
          y < 8 &&
          x >= 0 &&
          x < 8 &&
          board[y * 8 + x] === p + 1
        )
          all.push(...a);
      }
    return all;
  }
  const reversiMoves = (b, p) =>
    b.map((_, i) => (flips(b, p, i).length ? i : -1)).filter((i) => i >= 0);
  R.register("reversi", {
    title: "Reversi",
    min: 2,
    max: 2,
    create(players) {
      const board = Array(64).fill(0);
      board[27] = board[36] = 2;
      board[28] = board[35] = 1;
      return {
        ...base(players, 2, 2),
        board,
        message:
          "Bracket your opponent’s discs to flip them. Dark plays first.",
      };
    },
    act(s, p, a) {
      if (!valid(s, p, a) || s.turn !== p || a.type !== "disc") return false;
      const index = integer(a.index, 0, 63);
      if (index === null) return false;
      const reversed = flips(s.board, p, index);
      if (!reversed.length) return false;
      s.board[index] = p + 1;
      reversed.forEach((i) => (s.board[i] = p + 1));
      s.message = `${name(s, p)} flipped ${reversed.length} ${reversed.length === 1 ? "disc" : "discs"}.`;
      if (reversiMoves(s.board, 1 - p).length) s.turn = 1 - p;
      else if (reversiMoves(s.board, p).length)
        s.message += " Opponent has no legal move. Go again.";
      else
        finish(s, [
          s.board.filter((x) => x === 1).length,
          s.board.filter((x) => x === 2).length,
        ]);
      return true;
    },
    view(s, p) {
      return {
        ...copy(s),
        me: p,
        legal: reversiMoves(s.board, s.turn),
        scores: [
          s.board.filter((x) => x === 1).length,
          s.board.filter((x) => x === 2).length,
        ],
      };
    },
    render(v) {
      return `${playerStats(v, v.scores)}${banner(v)}<div class="reversi-board">${v.board.map((n, i) => `<button class="reversi-square" data-move="disc" data-index="${i}" aria-label="${String.fromCharCode(65 + Math.floor(i / 8))}${(i % 8) + 1}, ${n === 1 ? "dark disc" : n === 2 ? "light disc" : v.legal.includes(i) ? "legal move" : "empty"}" ${v.done || v.turn !== v.me || !v.legal.includes(i) ? "disabled" : ""}>${n ? `<span class="reversi-disc ${n === 1 ? "dark" : "light"}"></span>` : v.legal.includes(i) ? '<span class="legal-dot"></span>' : ""}</button>`).join("")}</div><p class="muted center">Place a disc to trap a line of the other color. Every trapped disc flips. More discs at the end wins; unavailable turns pass automatically.</p>`;
    },
  });
  const throws = ["rock", "paper", "scissors"],
    throwsIcon = { rock: "✊", paper: "✋", scissors: "✌️" },
    beats = { rock: "scissors", paper: "rock", scissors: "paper" };
  R.register("rock-paper-scissors", {
    title: "Rock Paper Scissors",
    min: 2,
    max: 8,
    concurrentActions: ["throw"],
    create(players) {
      return {
        ...base(players, 2, 8),
        phase: "choose",
        round: 1,
        choices: players.map(() => null),
        scores: players.map(() => 0),
        message: "Choose in secret. One point for each opponent you beat.",
      };
    },
    act(s, p, a) {
      if (!valid(s, p, a)) return false;
      if ((a.type === "throw" || a.round !== undefined) && integer(a.round, 1, 5) !== s.round)
        return false;
      if (
        a.type === "throw" &&
        s.phase === "choose" &&
        !s.choices[p] &&
        throws.includes(a.choice)
      ) {
        s.choices[p] = a.choice;
        if (s.choices.every(Boolean)) {
          for (let i = 0; i < s.players.length; i++)
            s.scores[i] += s.choices.filter(
              (x, j) => i !== j && beats[s.choices[i]] === x,
            ).length;
          s.phase = "reveal";
          s.message =
            "The hands are in! Every beaten opponent earns one point.";
          if (s.round === 5) finish(s, s.scores);
        }
        return true;
      }
      if (a.type === "next" && p === 0 && s.phase === "reveal") {
        s.round++;
        s.phase = "choose";
        s.choices = s.choices.map(() => null);
        s.message = "Choose in secret. One point for each opponent you beat.";
        return true;
      }
      return false;
    },
    view(s, p) {
      return {
        players: copy(s.players),
        me: p,
        turn: s.turn,
        round: s.round,
        phase: s.phase,
        scores: [...s.scores],
        own: s.choices[p],
        locked: s.choices.map(Boolean),
        choices: s.phase === "choose" ? null : [...s.choices],
        done: s.done,
        winners: [...s.winners],
        message: s.message,
      };
    },
    render(v) {
      return `${playerStats(v, v.scores)}<p class="sub-label">ROUND ${v.round} / 5</p>${G.status(v.message, v.done)}${v.phase === "choose" ? `<h3 class="center">${v.own ? "Your choice is locked." : "One, two, three…"}</h3><div class="rps-choices">${throws.map((t) => `<button class="rps-choice ${v.own === t ? "chosen" : ""}" data-move="throw" data-choice="${t}" data-round="${v.round}" ${v.own ? "disabled" : ""}><span aria-hidden="true">${throwsIcon[t]}</span><strong>${t[0].toUpperCase() + t.slice(1)}</strong></button>`).join("")}</div><div class="locked-players">${v.players.map((p, i) => `<span class="attribute-chip">${esc(p.name)} ${v.locked[i] ? "✓" : "…"}</span>`).join("")}</div>` : `<div class="rps-reveal">${v.players.map((p, i) => `<div><span>${throwsIcon[v.choices[i]]}</span><strong>${esc(p.name)}</strong><small>${v.choices[i]}</small></div>`).join("")}</div>${!v.done ? `<div class="toolbar"><button class="button" data-move="next" ${v.me === 0 ? "" : "disabled"}>${v.me === 0 ? "Next throw →" : "Waiting for the host"}</button></div>` : ""}`}<p class="muted center">Five simultaneous throws. Rock beats scissors; scissors beat paper; paper beats rock. Highest total wins.</p>`;
    },
  });
  const roll = (n) => Array.from({ length: n }, () => G.rand(6) + 1);
  const nextAlive = (s, p) => {
    for (let step = 1; step <= s.players.length; step++) {
      let n = (p + step) % s.players.length;
      if (s.counts[n] > 0) return n;
    }
    return p;
  };
  R.register("liars-dice", {
    title: "Liar’s Dice",
    min: 2,
    max: 8,
    create(players) {
      return {
        ...base(players, 2, 8),
        counts: players.map(() => 5),
        dice: players.map(() => roll(5)),
        bid: null,
        round: 1,
        reveal: null,
        message:
          "Look at your dice. Make a claim about everyone’s dice combined.",
      };
    },
    act(s, p, a) {
      if (!valid(s, p, a)) return false;
      if (a.round !== undefined && integer(a.round, 1, 100) !== s.round)
        return false;
      if (a.type === "next" && p === 0 && s.phase === "reveal") {
        s.phase = "play";
        s.round++;
        s.dice = s.counts.map(roll);
        s.bid = null;
        s.reveal = null;
        s.message = "Fresh dice. Make your opening bid.";
        return true;
      }
      if (s.phase !== "play" || p !== s.turn) return false;
      if (a.type === "bid") {
        const count = integer(
            a.count,
            1,
            s.counts.reduce((a, b) => a + b, 0),
          ),
          face = integer(a.face, 1, 6);
        if (
          count === null ||
          face === null ||
          (s.bid &&
            (count < s.bid.count ||
              (count === s.bid.count && face <= s.bid.face)))
        )
          return false;
        s.bid = { count, face, player: p };
        s.turn = nextAlive(s, p);
        s.message = `${name(s, p)} bids at least ${count} ${face}s in everyone’s dice.`;
        return true;
      }
      if (a.type === "challenge" && s.bid) {
        const actual = s.dice.flat().filter((n) => n === s.bid.face).length,
          loser = actual >= s.bid.count ? p : s.bid.player;
        s.reveal = {
          dice: copy(s.dice),
          actual,
          loser,
          challenger: p,
          bid: { ...s.bid },
        };
        s.counts[loser]--;
        s.message = `${name(s, p)} calls the bluff. There ${actual === 1 ? "was" : "were"} ${actual} ${s.bid.face}${actual === 1 ? "" : "s"}. ${name(s, loser)} loses a die${s.counts[loser] === 0 ? " and is eliminated" : ""}.`;
        s.phase = "reveal";
        s.turn = s.counts[loser] > 0 ? loser : nextAlive(s, loser);
        const alive = s.counts
          .map((n, i) => (n > 0 ? i : -1))
          .filter((i) => i >= 0);
        if (alive.length === 1) {
          s.done = true;
          s.winners = alive;
          s.message += ` ${name(s, alive[0])} is the last player standing!`;
        }
        return true;
      }
      return false;
    },
    view(s, p) {
      return {
        players: copy(s.players),
        me: p,
        turn: s.turn,
        phase: s.phase,
        round: s.round,
        counts: [...s.counts],
        dice: [...s.dice[p]],
        bid: s.bid ? { ...s.bid } : null,
        reveal: s.reveal ? copy(s.reveal) : null,
        done: s.done,
        winners: [...s.winners],
        message: s.message,
      };
    },
    render(v) {
      const mine = v.turn === v.me && !v.done && v.phase === "play",
        total = v.counts.reduce((a, b) => a + b, 0);
      return `${playerStats(
        v,
        v.counts.map((n) => n + " dice"),
      )}${G.status(v.message, v.done)}<p class="sub-label">${v.phase === "reveal" ? "THE REVEAL" : "YOUR PRIVATE DICE"}</p>${v.reveal ? `<div class="liars-reveal">${v.players.map((p, i) => `<div><strong>${esc(p.name)}</strong><div class="dice mini-dice">${v.reveal.dice[i].map((n) => `<div class="die" aria-label="Die ${n}">${"⚀⚁⚂⚃⚄⚅"[n - 1]}</div>`).join("") || "<span>Eliminated</span>"}</div></div>`).join("")}</div>` : `<div class="dice">${v.dice.map((n) => `<div class="die" aria-label="Die ${n}">${"⚀⚁⚂⚃⚄⚅"[n - 1]}</div>`).join("")}</div><p class="center">${v.bid ? `Current bid: <strong>${v.bid.count} × ${v.bid.face}</strong> by ${esc(v.players[v.bid.player].name)}` : "No bid yet. Open the round."}</p><p class="sub-label">${mine ? "YOUR TURN" : esc(v.players[v.turn].name.toUpperCase()) + "’S TURN"}</p><div class="bid-controls"><label>At least<select data-field="count" ${mine ? "" : "disabled"}>${Array.from({ length: total }, (_, i) => `<option value="${i + 1}" ${i + 1 === (v.bid?.count || 1) ? "selected" : ""}>${i + 1}</option>`).join("")}</select></label><label>Of this face<select data-field="face" ${mine ? "" : "disabled"}>${Array.from({ length: 6 }, (_, i) => `<option value="${i + 1}">${"⚀⚁⚂⚃⚄⚅"[i]} ${i + 1}</option>`).join("")}</select></label></div><div class="toolbar"><button class="button" data-move="bid" data-round="${v.round}" ${mine ? "" : "disabled"}>Raise the bid</button><button class="button secondary" data-move="challenge" data-round="${v.round}" ${mine && v.bid ? "" : "disabled"}>Call the bluff!</button></div>`}${v.phase === "reveal" && !v.done ? `<div class="toolbar"><button class="button" data-move="next" ${v.me === 0 ? "" : "disabled"}>${v.me === 0 ? "Roll the next round →" : "Waiting for the host"}</button></div>` : ""}<p class="muted center">Bid how many dice show a face across the whole table. Raise the count, or raise the face at the same count. Challenge the last claim to reveal all dice. The loser loses one die. Ones are not wild. Last player with dice wins.</p>`;
    },
  });
})();
