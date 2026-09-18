"use strict";
(() => {
  const G = GameNight,
    { btn, stat, status, bind, rand } = G;
  const diceFace = (n) => "⚀⚁⚂⚃⚄⚅"[n - 1];
  G.register("shut-box", {
    rules:
      "<ol><li>Roll two dice, then select open numbers that add up to the roll.</li><li>Close those numbers and roll again. You cannot reroll before closing a valid set.</li><li>Once 7, 8 and 9 are closed, you may choose one die before rolling.</li><li>No possible combination? The round ends. Your score is the sum left open. Zero is perfect!</li></ol>",
    mount(root) {
      let open = Array.from({ length: 9 }, (_, i) => i + 1),
        selected = [],
        dice = [],
        count = 2,
        phase = "roll",
        message = "Roll the dice to get started.";
      const total = () => dice.reduce((a, b) => a + b, 0);
      function possible() {
        return Array.from({ length: 1 << open.length }, (_, mask) =>
          open.reduce((s, n, i) => s + ((mask >> i) & 1 ? n : 0), 0),
        ).includes(total());
      }
      function render() {
        root.innerHTML = `<div class="stats">${stat("Numbers left", open.length)}${stat(
          "Score · lower is better",
          open.reduce((a, b) => a + b, 0),
        )}</div><div class="number-tiles">${Array.from(
          { length: 9 },
          (_, i) => i + 1,
        )
          .map(
            (n) =>
              `<button class="number-tile ${!open.includes(n) ? "closed" : ""} ${selected.includes(n) ? "chosen" : ""}" data-action="tile" data-n="${n}" aria-pressed="${selected.includes(n)}" ${!open.includes(n) || phase !== "select" ? "disabled" : ""} aria-label="${n}${!open.includes(n) ? ", closed" : ""}">${n}</button>`,
          )
          .join(
            "",
          )}</div><div class="dice">${(dice.length ? dice : Array(count).fill(0)).map((n) => `<div class="die" aria-label="${n ? "Die " + n : "Unrolled die"}">${n ? diceFace(n) : "·"}</div>`).join("")}</div>${status(message, phase === "done")}<div class="toolbar">${phase === "roll" && ![7, 8, 9].some((n) => open.includes(n)) ? `<label>Dice <select id="dice-count"><option value="2" ${count === 2 ? "selected" : ""}>Two</option><option value="1" ${count === 1 ? "selected" : ""}>One</option></select></label>` : ""}${phase === "roll" ? btn("Roll dice", "roll") : phase === "select" ? btn(`Close numbers (${selected.reduce((a, b) => a + b, 0)} / ${total()})`, "close", selected.reduce((a, b) => a + b, 0) !== total() ? "disabled" : "") : btn("Play again", "again")}</div>`;
        root.querySelector("#dice-count")?.addEventListener("change", (e) => {
          count = Number(e.target.value);
          render();
        });
      }
      bind(root, (a, b) => {
        if (a === "roll" && phase === "roll") {
          dice = Array.from({ length: count }, () => rand(6) + 1);
          phase = possible() ? "select" : "done";
          message =
            phase === "select"
              ? `You rolled ${total()}. Select numbers that add up to ${total()}.`
              : `No combination for ${total()}. Final score: ${open.reduce((a, b) => a + b, 0)}.`;
        }
        if (a === "tile" && phase === "select") {
          let n = +b.dataset.n;
          selected = selected.includes(n)
            ? selected.filter((x) => x !== n)
            : [...selected, n];
        }
        if (
          a === "close" &&
          phase === "select" &&
          selected.reduce((a, b) => a + b, 0) === total()
        ) {
          open = open.filter((n) => !selected.includes(n));
          selected = [];
          phase = open.length ? "roll" : "done";
          message = open.length
            ? "Nice! Roll again."
            : "You shut the box! A perfect score of 0.";
        }
        if (a === "again") {
          open = Array.from({ length: 9 }, (_, i) => i + 1);
          selected = [];
          dice = [];
          count = 2;
          phase = "roll";
          message = "Roll the dice to get started.";
        }
        render();
      });
      render();
    },
  });

  G.register("connect-four", {
    rules:
      "<ol><li>Choose a computer opponent or two players on this device.</li><li>Click any space in a column to drop your disc to its lowest empty spot.</li><li>Connect four of your discs horizontally, vertically, or diagonally.</li><li>Gold goes first. A full board without four in a row is a draw.</li></ol>",
    mount(root, ctx) {
      let board,
        turn,
        done,
        busy,
        win = [],
        mode = "ai",
        message;
      const winner = (b, p) => {
        for (let r = 0; r < 6; r++)
          for (let c = 0; c < 7; c++)
            for (const [dr, dc] of [
              [0, 1],
              [1, 0],
              [1, 1],
              [1, -1],
            ]) {
              const a = Array.from({ length: 4 }, (_, i) => [
                r + dr * i,
                c + dc * i,
              ]);
              if (
                a.every(
                  ([y, x]) =>
                    y >= 0 && y < 6 && x >= 0 && x < 7 && b[y * 7 + x] === p,
                )
              )
                return a.map(([y, x]) => y * 7 + x);
            }
        return [];
      };
      const row = (b, c) => {
        for (let r = 5; r >= 0; r--) if (!b[r * 7 + c]) return r;
        return -1;
      };
      function fresh() {
        board = Array(42).fill(0);
        turn = 1;
        done = false;
        busy = false;
        win = [];
        message = "Gold, choose a column.";
        render();
      }
      function render() {
        root.innerHTML = `<div class="mode-row"><label for="connect-mode">Play with</label><select id="connect-mode" ${busy ? "disabled" : ""}><option value="ai" ${mode === "ai" ? "selected" : ""}>Computer</option><option value="local" ${mode === "local" ? "selected" : ""}>A friend · same device</option></select></div>${status(message, done)}<div class="connect-board">${board.map((v, i) => `<button class="connect-cell ${v ? "p" + v : ""} ${win.includes(i) ? "win" : ""}" data-action="drop" data-col="${i % 7}" aria-label="Column ${(i % 7) + 1}, row ${Math.floor(i / 7) + 1}${v ? ", " + (v === 1 ? "gold" : "coral") : ""}" ${done || busy || row(board, i % 7) < 0 ? "disabled" : ""}></button>`).join("")}</div><p class="muted center">Gold ● &nbsp; vs &nbsp; Coral ●</p>`;
        root.querySelector("select").onchange = (e) => {
          mode = e.target.value;
          fresh();
        };
      }
      function drop(c) {
        let r = row(board, c);
        if (r < 0 || done) return;
        board[r * 7 + c] = turn;
        win = winner(board, turn);
        if (win.length) {
          done = true;
          message = `${turn === 1 ? "Gold" : "Coral"} wins! Four in a row.`;
        } else if (board.every(Boolean)) {
          done = true;
          message = "A full board. It’s a draw!";
        } else {
          turn = 3 - turn;
          message = `${turn === 1 ? "Gold" : "Coral"}, choose a column.`;
        }
        render();
      }
      function ai() {
        const cols = [3, 2, 4, 1, 5, 0, 6].filter((c) => row(board, c) >= 0);
        let choice;
        for (const p of [2, 1]) {
          choice = cols.find((c) => {
            let b = [...board];
            b[row(b, c) * 7 + c] = p;
            return winner(b, p).length;
          });
          if (choice !== undefined) break;
        }
        if (choice === undefined) {
          const safe = cols.filter((c) => {
            let b = [...board];
            b[row(b, c) * 7 + c] = 2;
            return !cols.some((d) => {
              let r = row(b, d);
              if (r < 0) return false;
              let t = [...b];
              t[r * 7 + d] = 1;
              return winner(t, 1).length;
            });
          });
          choice = (safe.length ? safe : cols)[
            rand(Math.min(3, (safe.length ? safe : cols).length))
          ];
        }
        busy = false;
        drop(choice);
      }
      bind(root, (a, b) => {
        if (a === "drop" && !done && !busy) {
          drop(+b.dataset.col);
          if (!done && mode === "ai" && turn === 2) {
            busy = true;
            message = "Coral is thinking…";
            render();
            ctx.later(ai, 500);
          }
        }
      });
      fresh();
    },
  });

  G.register("tic-tac-toe", {
    rules:
      "<ol><li>Choose the computer or a friend on this device.</li><li>X goes first. Take turns claiming empty squares.</li><li>Make a line of three horizontally, vertically, or diagonally.</li><li>A full board with no line is a draw. The computer plays a perfect game!</li></ol>",
    mount(root, ctx) {
      let board,
        turn,
        done,
        busy,
        message,
        mode = "ai";
      const lines = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6],
      ];
      const winner = (b) => {
        for (let l of lines)
          if (b[l[0]] && l.every((i) => b[i] === b[l[0]])) return b[l[0]];
        return b.every(Boolean) ? "draw" : null;
      };
      function minimax(b, p) {
        let w = winner(b);
        if (w) return w === "O" ? 10 : w === "X" ? -10 : 0;
        let scores = [];
        b.forEach((v, i) => {
          if (!v) {
            b[i] = p;
            scores.push(minimax(b, p === "O" ? "X" : "O"));
            b[i] = "";
          }
        });
        return p === "O" ? Math.max(...scores) : Math.min(...scores);
      }
      function render() {
        root.innerHTML = `<div class="mode-row"><label for="ttt-mode">Play with</label><select id="ttt-mode" ${busy ? "disabled" : ""}><option value="ai" ${mode === "ai" ? "selected" : ""}>Computer</option><option value="local" ${mode === "local" ? "selected" : ""}>A friend · same device</option></select></div>${status(message, done)}<div class="ttt-board">${board.map((v, i) => `<button class="ttt-cell ${v === "O" ? "o" : ""}" data-action="mark" data-i="${i}" aria-label="Row ${Math.floor(i / 3) + 1}, column ${(i % 3) + 1}${v ? ", " + v : ""}" ${v || done || busy ? "disabled" : ""}>${v}</button>`).join("")}</div>`;
        root.querySelector("select").onchange = (e) => {
          mode = e.target.value;
          fresh();
        };
      }
      function fresh() {
        board = Array(9).fill("");
        turn = "X";
        done = false;
        busy = false;
        message = "X, your move.";
        render();
      }
      function move(i) {
        board[i] = turn;
        let w = winner(board);
        if (w) {
          done = true;
          message = w === "draw" ? "It’s a draw. Well played!" : `${w} wins!`;
        } else {
          turn = turn === "X" ? "O" : "X";
          message = `${turn}, your move.`;
        }
        render();
      }
      bind(root, (a, b) => {
        let i = +b.dataset.i;
        if (a === "mark" && !board[i] && !busy && !done) {
          move(i);
          if (!done && mode === "ai") {
            busy = true;
            message = "O is thinking…";
            render();
            ctx.later(() => {
              let best = -Infinity,
                choice = 0;
              for (let j of [4, 0, 2, 6, 8, 1, 3, 5, 7])
                if (!board[j]) {
                  board[j] = "O";
                  let score = minimax(board, "X");
                  board[j] = "";
                  if (score > best) {
                    best = score;
                    choice = j;
                  }
                }
              busy = false;
              move(choice);
            }, 450);
          }
        }
      });
      fresh();
    },
  });

  G.register("memory", {
    rules:
      "<ol><li>Turn over two cards to look for a pair.</li><li>A matching pair stays face up. A mismatch flips back after a moment.</li><li>Solo: clear the table in as few turns as possible.</li><li>Two players: a match earns a point and another turn. Most pairs wins.</li></ol>",
    mount(root, ctx) {
      let cards,
        selected,
        matched,
        moves,
        turn,
        scores,
        busy,
        mode = "solo",
        message;
      const symbols = ["♠", "♥", "♦", "♣", "★", "☀", "♫", "✿"];
      function fresh() {
        cards = G.shuffle([...symbols, ...symbols]);
        selected = [];
        matched = [];
        moves = 0;
        turn = 0;
        scores = [0, 0];
        busy = false;
        message = "Turn over a card.";
        render();
      }
      function render() {
        let done = matched.length === 16;
        root.innerHTML = `<div class="mode-row"><label for="memory-mode">Mode</label><select id="memory-mode" ${busy ? "disabled" : ""}><option value="solo" ${mode === "solo" ? "selected" : ""}>Solo</option><option value="local" ${mode === "local" ? "selected" : ""}>Two players</option></select></div><div class="stats">${stat("Turns", moves)}${mode === "solo" ? stat("Pairs found", matched.length / 2 + "/8") : stat("Player 1", scores[0]) + stat("Player 2", scores[1])}</div>${status(done ? (mode === "solo" ? `All matched in ${moves} turns!` : scores[0] === scores[1] ? "It’s a draw!" : `Player ${scores[0] > scores[1] ? 1 : 2} wins!`) : (mode === "local" ? `Player ${turn + 1} · ` : "") + message, done)}<div class="memory-board">${cards
          .map((v, i) => {
            let show = selected.includes(i) || matched.includes(i);
            return `<button class="memory-card ${matched.includes(i) ? "matched" : show ? "open" : ""}" data-action="flip" data-i="${i}" aria-label="Card ${i + 1}${show ? ", " + v : ", face down"}" ${show || busy || done ? "disabled" : ""}>${show ? v : "⁙"}</button>`;
          })
          .join("")}</div>`;
        root.querySelector("select").onchange = (e) => {
          mode = e.target.value;
          fresh();
        };
      }
      bind(root, (a, b) => {
        let i = +b.dataset.i;
        if (a !== "flip" || busy || selected.includes(i) || matched.includes(i))
          return;
        selected.push(i);
        if (selected.length === 2) {
          moves++;
          if (cards[selected[0]] === cards[selected[1]]) {
            matched.push(...selected);
            scores[turn]++;
            selected = [];
            message = "A match! Go again.";
          } else {
            busy = true;
            message = "Not a match. Remember those cards.";
            ctx.later(() => {
              selected = [];
              busy = false;
              if (mode === "local") turn = 1 - turn;
              message = "Turn over a card.";
              render();
            }, 1050);
          }
        } else message = "Pick one more card.";
        render();
      });
      fresh();
    },
  });

  G.register("pig", {
    rules:
      "<ol><li>Roll to build your points for this turn. A 2–6 adds to your turn total.</li><li>Roll a 1 and lose this turn’s unbanked points. The turn passes.</li><li>Bank to add your turn total to your score and pass the dice.</li><li>First to bank 100 points wins. Choose a computer opponent or pass the device.</li></ol>",
    mount(root, ctx) {
      let scores,
        turn,
        bank,
        die,
        done,
        busy,
        mode = "ai",
        message;
      const names = () => ["You", mode === "ai" ? "Computer" : "Player 2"];
      function fresh() {
        scores = [0, 0];
        turn = 0;
        bank = 0;
        die = 0;
        done = false;
        busy = false;
        message = "Roll or bank. First to 100 wins.";
        render();
      }
      function render() {
        root.innerHTML = `<div class="mode-row"><label for="pig-mode">Play with</label><select id="pig-mode" ${busy ? "disabled" : ""}><option value="ai" ${mode === "ai" ? "selected" : ""}>Computer</option><option value="local" ${mode === "local" ? "selected" : ""}>A friend · same device</option></select></div><div class="stats">${stat(mode === "local" ? "Player 1" : "You", scores[0])}${stat(names()[1], scores[1])}${stat("This turn", bank)}</div><p class="sub-label">${mode === "local" ? "Player " + (turn + 1) : names()[turn]} ${done ? "" : "· at the dice"}</p><div class="dice"><div class="die" aria-label="${die ? "Rolled " + die : "Unrolled die"}">${die ? diceFace(die) : "·"}</div></div>${status(message, done)}<div class="toolbar">${btn("Roll die", "roll", busy || done ? "disabled" : "")}${btn(`Bank ${bank} points`, "bank", busy || done || !bank ? "disabled" : "")}</div>`;
        root.querySelector("select").onchange = (e) => {
          mode = e.target.value;
          fresh();
        };
      }
      function next() {
        turn = 1 - turn;
        bank = 0;
        busy = mode === "ai" && turn === 1;
        render();
        if (busy) ctx.later(ai, 750);
      }
      function roll() {
        die = rand(6) + 1;
        if (die === 1) {
          message = "A 1! This turn’s points are gone.";
          next();
        } else {
          bank += die;
          message = `Rolled ${die}. ${bank} points waiting to be banked.`;
          render();
        }
      }
      function hold() {
        scores[turn] += bank;
        message = `${mode === "local" ? "Player " + (turn + 1) : names()[turn]} banked ${bank} points.`;
        if (scores[turn] >= 100) {
          done = true;
          busy = false;
          bank = 0;
          message = `${mode === "local" ? "Player " + (turn + 1) : names()[turn]} won with ${scores[turn]} points!`;
          render();
        } else next();
      }
      function ai() {
        if (done || turn !== 1 || mode !== "ai") return;
        if (bank >= 20 || scores[1] + bank >= 100) {
          hold();
          return;
        }
        roll();
        if (turn === 1 && !done) ctx.later(ai, 750);
      }
      bind(root, (a) => {
        if (busy || done) return;
        if (a === "roll") roll();
        if (a === "bank" && bank) hold();
      });
      fresh();
    },
  });

  G.register("sea-battle", {
    rules:
      "<ol><li>Arrange your five ships by shuffling, or place each ship yourself. Rotate to change direction.</li><li>Start the battle, then click a square on the enemy ocean to fire. You and the computer alternate shots.</li><li>A coral square is a hit; a dot is a miss. Gold means a ship has sunk.</li><li>Sink all five enemy ships first. Ships occupy 5, 4, 3, 3, and 2 squares and may touch.</li></ol>",
    note: "Your fleet is on the left. The computer targets untried squares and follows up on hits.",
    mount(root, ctx) {
      const lengths = [5, 4, 3, 3, 2],
        names = ["Carrier", "Battleship", "Cruiser", "Submarine", "Patrol"];
      let mine = [],
        enemy = [],
        myShots = [],
        aiShots = [],
        targets = [],
        phase = "setup",
        busy = false,
        placement = -1,
        vertical = false,
        message = "Shuffle your fleet, or place your ships yourself.";
      function cells(start, len, vert) {
        let r = Math.floor(start / 10),
          c = start % 10;
        if ((vert ? r : c) + len > 10) return null;
        return Array.from(
          { length: len },
          (_, i) => start + i * (vert ? 10 : 1),
        );
      }
      function fleet() {
        let ships = [];
        for (let n of lengths) {
          let candidate;
          do {
            candidate = cells(rand(100), n, !!rand(2));
          } while (
            !candidate ||
            ships.some((s) => s.some((x) => candidate.includes(x)))
          );
          ships.push(candidate);
        }
        return ships;
      }
      mine = fleet();
      enemy = fleet();
      const hit = (ships, i) => ships.some((s) => s.includes(i));
      const sunk = (ship, shots) => ship.every((i) => shots.includes(i));
      const allSunk = (ships, shots) =>
        ships.length === 5 && ships.every((s) => sunk(s, shots));
      function grid(ships, shots, own) {
        return `<div class="sea-grid">${Array.from({ length: 100 }, (_, i) => {
          let fired = shots.includes(i),
            ship = ships.find((s) => s.includes(i)),
            isHit = fired && ship,
            isSunk = ship && sunk(ship, shots);
          return `<button class="sea-cell ${own && ship ? "ship" : ""} ${fired ? (isHit ? "hit" : "miss") : ""} ${isSunk ? "sunk" : ""}" data-action="${own ? "place" : "fire"}" data-i="${i}" aria-label="${own ? "Your" : "Enemy"} ${String.fromCharCode(65 + Math.floor(i / 10))}${(i % 10) + 1}${fired ? (isHit ? ", hit" : ", miss") : own && ship ? ", ship" : ""}" ${own ? (phase !== "setup" || placement < 0 ? "disabled" : "") : phase !== "battle" || busy || fired ? "disabled" : ""}>${isHit ? "×" : fired ? "·" : ""}</button>`;
        }).join("")}</div>`;
      }
      function pills(ships, shots) {
        return `<div class="ship-list">${lengths.map((n, i) => `<span class="ship-pill ${ships[i] && sunk(ships[i], shots) ? "sunk" : ""}">${names[i]} ${n}</span>`).join("")}</div>`;
      }
      function render() {
        root.innerHTML = `${status(message, phase === "done")}<div class="sea-boards"><div><h3 class="center">Your fleet</h3>${grid(mine, aiShots, true)}${pills(mine, aiShots)}</div><div><h3 class="center">Enemy ocean</h3>${grid(enemy, myShots, false)}${pills(enemy, myShots)}</div></div>${phase === "setup" ? `<div class="toolbar">${btn("Shuffle fleet", "shuffle")}${btn("Place manually", "manual")}${placement >= 0 ? btn(vertical ? "↕ Vertical" : "↔ Horizontal", "rotate") : ""}${btn("Start battle", "start", mine.length !== 5 ? "disabled" : "")}</div><p class="muted center">${placement >= 0 ? `Place ${names[placement]} (${lengths[placement]} squares). Click its starting square on your ocean.` : "Happy with your fleet? Start the battle."}</p>` : `<div class="stats">${stat("Your ships", 5 - mine.filter((s) => sunk(s, aiShots)).length)}${stat("Enemy ships", 5 - enemy.filter((s) => sunk(s, myShots)).length)}</div>`}`;
      }
      function ai() {
        let options = targets.filter((i) => !aiShots.includes(i));
        let i = options.length ? options[0] : rand(100);
        while (aiShots.includes(i)) i = rand(100);
        targets = targets.filter((n) => n !== i);
        aiShots.push(i);
        let ship = mine.find((s) => s.includes(i));
        if (ship && !sunk(ship, aiShots)) {
          let r = Math.floor(i / 10),
            c = i % 10;
          targets.push(
            ...[
              [r - 1, c],
              [r + 1, c],
              [r, c - 1],
              [r, c + 1],
            ]
              .filter(([y, x]) => y >= 0 && y < 10 && x >= 0 && x < 10)
              .map(([y, x]) => y * 10 + x),
          );
        }
        if (ship && sunk(ship, aiShots))
          targets = targets.filter((n) => !ship.includes(n));
        busy = false;
        if (allSunk(mine, aiShots)) {
          phase = "done";
          message = "Your fleet has sunk. The computer wins.";
        } else
          message = `Computer fired at ${String.fromCharCode(65 + Math.floor(i / 10))}${(i % 10) + 1}: ${ship ? (sunk(ship, aiShots) ? "ship sunk!" : "hit!") : "miss."} Your shot.`;
        render();
      }
      bind(root, (a, b) => {
        if (a === "shuffle" && phase === "setup") {
          mine = fleet();
          placement = -1;
          message = "A new arrangement. Ready when you are.";
        }
        if (a === "manual" && phase === "setup") {
          mine = [];
          placement = 0;
          message = "Place your Carrier (5 squares).";
        }
        if (a === "rotate") vertical = !vertical;
        if (a === "place" && phase === "setup" && placement >= 0) {
          let candidate = cells(+b.dataset.i, lengths[placement], vertical);
          if (
            !candidate ||
            mine.some((s) => s.some((i) => candidate.includes(i)))
          )
            message =
              "That ship overlaps or extends beyond the ocean. Try another square.";
          else {
            mine.push(candidate);
            placement++;
            if (placement === 5) {
              placement = -1;
              message = "All ships placed. Ready to start!";
            } else
              message = `Place your ${names[placement]} (${lengths[placement]} squares).`;
          }
        }
        if (a === "start" && phase === "setup" && mine.length === 5) {
          phase = "battle";
          message = "Your shot. Choose a square on the enemy ocean.";
        }
        if (a === "fire" && phase === "battle" && !busy) {
          let i = +b.dataset.i;
          if (myShots.includes(i)) return;
          myShots.push(i);
          let ship = enemy.find((s) => s.includes(i));
          if (allSunk(enemy, myShots)) {
            phase = "done";
            message = "You sank the entire enemy fleet. Victory!";
          } else {
            busy = true;
            message = ship
              ? sunk(ship, myShots)
                ? `You sank the ${names[enemy.indexOf(ship)]}! Computer’s turn…`
                : "Direct hit! Computer’s turn…"
              : "A miss. Computer’s turn…";
            ctx.later(ai, 650);
          }
        }
        render();
      });
      render();
    },
  });
})();
