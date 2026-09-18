"use strict";
(() => {
  const G = GameNight,
    { btn, stat, status, bind, rand, card, rank, esc } = G;

  G.register("higher-lower", {
    rules:
      "<ol><li>Guess whether the next card will be higher or lower than the current one.</li><li>Aces are low; Kings are high. Equal ranks count as a tie: you keep your streak.</li><li>A wrong guess ends the round. Reach the end of the 52-card deck for a perfect run.</li></ol>",
    mount(root) {
      let deck = G.deck(),
        current = deck.pop(),
        history = [],
        streak = 0,
        done = false,
        message = "Higher or lower? Make your call.";
      function render() {
        root.innerHTML = `<div class="stats">${stat("Correct guesses", streak)}${stat("Cards left", deck.length)}</div><div class="center-pile">${card(current, "disabled")}</div>${status(message, done)}<div class="toolbar">${btn("↓ Lower", "lower", done ? "disabled" : "")}${btn("↑ Higher", "higher", done ? "disabled" : "")}</div><p class="muted center">A = 1 · J = 11 · Q = 12 · K = 13</p><div class="history">${history
          .slice(-12)
          .map(
            (c) =>
              `<span class="mini-card ${c.red ? "red" : ""}">${rank(c.rank)}${c.suit}</span>`,
          )
          .join("")}</div>`;
      }
      bind(root, (a) => {
        if (done || !["higher", "lower"].includes(a)) return;
        let next = deck.pop(),
          equal = next.rank === current.rank,
          correct =
            a === "higher"
              ? next.rank > current.rank
              : next.rank < current.rank;
        history.push(current);
        current = next;
        if (equal) message = "Same rank! A tie — your streak stays alive.";
        else if (correct) {
          streak++;
          message = "Good call! Keep going.";
        } else {
          done = true;
          message = `Not this time. You finished with ${streak} correct guesses.`;
        }
        if (!done && !deck.length) {
          done = true;
          message = `You made it through the deck! ${streak} correct guesses.`;
        }
        render();
      });
      render();
    },
  });

  G.register("crazy-eights", {
    rules:
      "<ol><li>Each player starts with five cards. Match the top card’s suit or rank.</li><li>An 8 can be played on anything. Choose the suit that must be followed.</li><li>When you cannot play, draw until you find a playable card. With no stock, pass.</li><li>First to empty their hand wins. If both pass with an empty stock, the lowest hand value wins: 8 = 50, face cards = 10, Ace = 1.</li></ol>",
    mount(root, ctx) {
      let stock = G.deck(),
        hands = [stock.splice(0, 5), stock.splice(0, 5)],
        pile = [],
        active = "",
        busy = false,
        choosing = -1,
        done = false,
        passes = 0,
        message = "Your turn. Match a suit or rank, or play an 8.";
      let start = stock.findIndex((c) => c.rank !== 8);
      pile.push(stock.splice(start, 1)[0]);
      active = pile[0].suit;
      const top = () => pile[pile.length - 1];
      const valid = (c) =>
        c.rank === 8 ||
        c.suit === active ||
        (top().rank !== 8 && c.rank === top().rank);
      const points = (h) =>
        h.reduce((s, c) => s + (c.rank === 8 ? 50 : Math.min(c.rank, 10)), 0);
      function render() {
        root.innerHTML = `<div class="stats">${stat("Computer’s hand", hands[1].length)}${stat("Stock", stock.length)}${stat("Active suit", active)}</div><div class="center-pile"><div>${G.back(stock.length, "disabled")}<p class="sub-label">DRAW PILE</p></div><div>${card(top(), "disabled")}<p class="sub-label">TOP CARD</p></div></div>${status(message, done)}${choosing >= 0 ? `<div class="color-picker"><p>Choose the next suit</p><div class="toolbar">${G.suits.map((s) => btn(s, "suit", `data-suit="${s}" aria-label="Choose ${s}"`)).join("")}</div></div>` : ""}<p class="sub-label">YOUR HAND · ${hands[0].length} CARDS</p><div class="hand">${hands[0].map((c, i) => card(c, `data-action="play" data-i="${i}" ${busy || done || choosing >= 0 || !valid(c) ? "disabled" : ""}`, !valid(c) ? "dim" : "")).join("")}</div><div class="toolbar">${btn(stock.length ? "Draw until playable" : "Pass", "draw", busy || done || choosing >= 0 || hands[0].some(valid) ? "disabled" : "")}</div>`;
      }
      function endBlocked() {
        if (passes < 2) return false;
        let a = points(hands[0]),
          b = points(hands[1]);
        done = true;
        busy = false;
        message = `No more moves. ${a === b ? "It’s a draw" : a < b ? "You win" : "Computer wins"} on hand value (${a}–${b}).`;
        return true;
      }
      function play(p, i, suit) {
        let c = hands[p].splice(i, 1)[0];
        pile.push(c);
        active = c.rank === 8 ? suit : c.suit;
        passes = 0;
        if (!hands[p].length) {
          done = true;
          busy = false;
          message =
            p === 0
              ? "You played your last card. You win!"
              : "Computer played its last card. Computer wins.";
          return;
        }
        message =
          p === 0
            ? "Computer’s turn…"
            : `Computer played ${rank(c.rank)}${c.suit}.${c.rank === 8 ? " Suit is " + active + "." : ""} Your turn.`;
      }
      function ai() {
        if (done) return;
        let i = hands[1].findIndex((c) => valid(c) && c.rank !== 8);
        if (i < 0) i = hands[1].findIndex(valid);
        while (i < 0 && stock.length) {
          hands[1].push(stock.pop());
          i = hands[1].findIndex(valid);
        }
        if (i < 0) {
          passes++;
          message = "Computer cannot play and passes. Your turn.";
          endBlocked();
        } else {
          let suit = G.suits.reduce((a, b) =>
            hands[1].filter((c) => c.suit === a && c.rank !== 8).length >=
            hands[1].filter((c) => c.suit === b && c.rank !== 8).length
              ? a
              : b,
          );
          play(1, i, suit);
        }
        busy = false;
        render();
      }
      function computerTurn() {
        if (done) {
          render();
          return;
        }
        busy = true;
        render();
        ctx.later(ai, 750);
      }
      bind(root, (a, b) => {
        if (done || busy) return;
        if (a === "play" && choosing < 0) {
          let i = +b.dataset.i;
          if (!valid(hands[0][i])) return;
          if (hands[0][i].rank === 8 && hands[0].length > 1) {
            choosing = i;
            message = "Wild 8! Choose a suit.";
            render();
            return;
          }
          play(0, i, active);
          computerTurn();
        }
        if (a === "suit" && choosing >= 0) {
          play(0, choosing, b.dataset.suit);
          choosing = -1;
          computerTurn();
        }
        if (a === "draw" && choosing < 0 && !hands[0].some(valid)) {
          let n = 0;
          while (!hands[0].some(valid) && stock.length) {
            hands[0].push(stock.pop());
            n++;
          }
          if (hands[0].some(valid)) {
            message = `Drew ${n} card${n === 1 ? "" : "s"}. Play the matching card.`;
            render();
          } else {
            passes++;
            message = "No playable cards. You pass.";
            if (!endBlocked()) computerTurn();
            else render();
          }
        }
      });
      render();
    },
  });

  G.register("color-clash", {
    rules:
      "<ol><li>An original UNO-style game for you and the computer. Match the active color, number, or symbol. Wilds match anything.</li><li>Draw one card whenever you like. You may play that card if it matches, or keep it and end your turn.</li><li>Skip (⊘) and Reverse (⇄) let you play again in this two-player game. +2 makes your opponent draw two and skip a turn.</li><li>A Wild (★) lets you choose the next color. First empty hand wins.</li></ol><p>House version: no +4 cards, stacking, or call-out penalties. The discard pile is recycled when needed.</p>",
    mount(root, ctx) {
      const colors = ["redc", "blue", "green", "yellow"],
        names = {
          redc: "Red",
          blue: "Blue",
          green: "Green",
          yellow: "Yellow",
          wild: "Wild",
        };
      let stock = [],
        hands,
        pile,
        active,
        busy = false,
        done = false,
        choosing = -1,
        drawn = null,
        message = "Your turn. Match the color or symbol.",
        passes = 0,
        id = 0;
      for (const color of colors) {
        stock.push({ color, value: "0", id: id++ });
        for (let rep = 0; rep < 2; rep++)
          for (const v of [
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9",
            "⊘",
            "⇄",
            "+2",
          ])
            stock.push({ color, value: v, id: id++ });
      }
      for (let i = 0; i < 4; i++)
        stock.push({ color: "wild", value: "★", id: id++ });
      G.shuffle(stock);
      hands = [stock.splice(0, 7), stock.splice(0, 7)];
      let starter = stock.findIndex((c) => /^\d$/.test(c.value));
      pile = [stock.splice(starter, 1)[0]];
      active = pile[0].color;
      const top = () => pile[pile.length - 1];
      const valid = (c) =>
        c.color === "wild" || c.color === active || c.value === top().value;
      function drawOne() {
        if (!stock.length && pile.length > 1) {
          let last = pile.pop();
          stock = G.shuffle(pile);
          pile = [last];
        }
        return stock.pop();
      }
      function cc(c, attrs = "", dim = false) {
        return `<button class="playing-card color-card ${c.color} ${dim ? "dim" : ""}" ${attrs} aria-label="${names[c.color]} ${c.value}"><span class="color-value">${c.value}</span><span class="color-name">${names[c.color]}</span></button>`;
      }
      function render() {
        root.innerHTML = `<div class="stats">${stat("Computer’s hand", hands[1].length)}${stat("Active color", names[active])}${stat("Your cards", hands[0].length)}</div><div class="center-pile"><div>${G.back("+1", 'data-action="draw" aria-label="Draw a card" ' + (busy || done || choosing >= 0 || drawn !== null ? "disabled" : ""))}<p class="sub-label">DRAW ONE</p></div><div>${cc(top(), "disabled")}<p class="sub-label">TOP CARD</p></div></div>${status(message, done)}${choosing >= 0 ? `<div class="color-picker"><p>Choose the next color</p><div class="toolbar">${colors.map((c) => btn(names[c], "color", `data-color="${c}"`)).join("")}</div></div>` : ""}<p class="sub-label">YOUR HAND${hands[0].length === 1 ? " · LAST CARD!" : ""}</p><div class="hand">${hands[0]
          .map((c, i) => {
            let legal = valid(c) && (drawn === null || drawn === c.id);
            return cc(
              c,
              `data-action="play" data-i="${i}" ${busy || done || choosing >= 0 || !legal ? "disabled" : ""}`,
              !legal,
            );
          })
          .join(
            "",
          )}</div><div class="toolbar">${drawn !== null ? btn("Keep card · end turn", "keep", busy || done || choosing >= 0 ? "disabled" : "") : btn("Draw one card", "draw", busy || done || choosing >= 0 ? "disabled" : "")}</div>`;
      }
      function take(p, n) {
        for (let i = 0; i < n; i++) {
          let c = drawOne();
          if (c) hands[p].push(c);
        }
      }
      function play(p, i, color) {
        let c = hands[p].splice(i, 1)[0];
        pile.push(c);
        active = c.color === "wild" ? color : c.color;
        passes = 0;
        drawn = null;
        let again = ["⊘", "⇄", "+2"].includes(c.value);
        if (c.value === "+2") take(1 - p, 2);
        if (!hands[p].length) {
          done = true;
          busy = false;
          message =
            p === 0
              ? "You’re out of cards. You win!"
              : "Computer is out of cards. Computer wins.";
          render();
          return false;
        }
        message = `${p === 0 ? "You" : "Computer"} played ${names[c.color]} ${c.value}.${again ? (c.value === "+2" ? " Opponent draws two." : " Turn skipped.") + " Play again." : p === 1 ? " Your turn." : " Computer’s turn…"}`;
        return again;
      }
      function schedule() {
        busy = true;
        render();
        ctx.later(ai, 700);
      }
      function blocked() {
        passes++;
        if (
          !stock.length &&
          pile.length === 1 &&
          !hands.some((hand) => hand.some(valid))
        ) {
          done = true;
          busy = false;
          message = "No cards can move. The round is a draw.";
          render();
          return true;
        }
        return false;
      }
      function ai() {
        if (done) return;
        let i = hands[1].findIndex((c) => c.color !== "wild" && valid(c));
        if (i < 0) i = hands[1].findIndex(valid);
        if (i < 0) {
          let c = drawOne();
          if (c) {
            hands[1].push(c);
            if (valid(c)) i = hands[1].length - 1;
          }
          if (i < 0) {
            if (!blocked()) {
              busy = false;
              message = "Computer drew and kept a card. Your turn.";
              render();
            }
            return;
          }
        }
        let color = colors.reduce((a, b) =>
          hands[1].filter((c) => c.color === a).length >=
          hands[1].filter((c) => c.color === b).length
            ? a
            : b,
        );
        let again = play(1, i, color);
        if (done) return;
        if (again) schedule();
        else {
          busy = false;
          render();
        }
      }
      function humanPlay(i, color) {
        let again = play(0, i, color);
        choosing = -1;
        if (done) return;
        if (again) {
          busy = false;
          render();
        } else schedule();
      }
      bind(root, (a, b) => {
        if (done || busy) return;
        if (a === "draw" && drawn === null && choosing < 0) {
          let c = drawOne();
          if (!c) {
            message = "The stock is empty. Your turn passes.";
            if (!blocked()) schedule();
            return;
          }
          hands[0].push(c);
          drawn = c.id;
          message = valid(c)
            ? "Play the card you drew, or keep it and end your turn."
            : "The card you drew does not match. Keep it to end your turn.";
          render();
        }
        if (a === "keep" && drawn !== null && choosing < 0) {
          drawn = null;
          schedule();
        }
        if (a === "play" && choosing < 0) {
          let i = +b.dataset.i,
            c = hands[0][i];
          if (!valid(c) || (drawn !== null && drawn !== c.id)) return;
          if (c.color === "wild" && hands[0].length > 1) {
            choosing = i;
            message = "Choose the next color.";
            render();
          } else humanPlay(i, active);
        }
        if (a === "color" && choosing >= 0)
          humanPlay(choosing, b.dataset.color);
      });
      render();
    },
  });

  G.register("go-fish", {
    rules:
      "<ol><li>You each start with seven cards. Collect books of all four cards of one rank.</li><li>Ask the computer for a rank you hold. If it has any, you get all of them and ask again.</li><li>If it has none, go fish: draw one card. Draw the rank you asked for and you get another turn.</li><li>Books are collected automatically. An empty hand draws from the stock. Play continues after the stock runs out.</li><li>When all 13 books are collected, the player with the most books wins.</li></ol>",
    mount(root, ctx) {
      let stock = G.deck(),
        hands = [stock.splice(0, 7), stock.splice(0, 7)],
        books = [[], []],
        busy = false,
        done = false,
        message = "Ask for a rank in your hand.";
      function collect(p) {
        for (let r = 1; r <= 13; r++)
          if (hands[p].filter((c) => c.rank === r).length === 4) {
            hands[p] = hands[p].filter((c) => c.rank !== r);
            books[p].push(r);
          }
      }
      function finish() {
        if (books[0].length + books[1].length === 13) {
          done = true;
          busy = false;
          message = `${books[0].length > books[1].length ? "You win!" : "Computer wins."} ${books[0].length} books to ${books[1].length}.`;
          return true;
        }
        return false;
      }
      function refill(p) {
        if (!hands[p].length && stock.length) {
          hands[p].push(stock.pop());
          collect(p);
        }
      }
      function render() {
        root.innerHTML = `<div class="stats">${stat("Your books", books[0].length)}${stat("Computer’s books", books[1].length)}${stat("Stock", stock.length)}</div><p class="sub-label">COMPUTER · ${hands[1].length} CARDS</p><div class="books">${books[1].map((r) => `<span class="book">${rank(r)} × 4</span>`).join("") || '<span class="book empty">No books yet</span>'}</div>${status(message, done)}<p class="sub-label">ASK THE COMPUTER FOR…</p><div class="hand">${[
          ...new Set(hands[0].map((c) => c.rank)),
        ]
          .sort((a, b) => a - b)
          .map(
            (r) =>
              `<button class="rank-button" data-action="ask" data-rank="${r}" ${busy || done ? "disabled" : ""} aria-label="Ask for ${rank(r)}">${rank(r)}<small>have ${hands[0].filter((c) => c.rank === r).length}</small></button>`,
          )
          .join(
            "",
          )}</div><p class="sub-label">YOUR HAND</p><div class="hand">${[
          ...hands[0],
        ]
          .sort((a, b) => a.rank - b.rank)
          .map((c) => card(c, "disabled"))
          .join(
            "",
          )}</div><div class="books">${books[0].map((r) => `<span class="book">${rank(r)} × 4</span>`).join("") || '<span class="book empty">Your collected books will appear here</span>'}</div>`;
      }
      function ask(p, r) {
        let q = 1 - p,
          found = hands[q].filter((c) => c.rank === r),
          again = false;
        if (found.length) {
          hands[q] = hands[q].filter((c) => c.rank !== r);
          hands[p].push(...found);
          again = true;
          message =
            p === 0
              ? `You got ${found.length} ${rank(r)}${found.length > 1 ? "s" : ""}! Ask again.`
              : `Computer asked for ${rank(r)} and took ${found.length}. It asks again.`;
        } else if (stock.length) {
          let c = stock.pop();
          hands[p].push(c);
          again = c.rank === r;
          message =
            p === 0
              ? `Go fish! You drew ${rank(c.rank)}${c.suit}.${again ? " You got your rank — ask again!" : " Computer’s turn."}`
              : `Computer asked for ${rank(r)}. Go fish! ${again ? "It drew its rank and asks again." : "Your turn."}`;
        } else
          message =
            p === 0
              ? "No match and the stock is empty. Computer’s turn."
              : `Computer asked for ${rank(r)}. No match. Your turn.`;
        collect(p);
        finish();
        return again;
      }
      function begin(p) {
        if (done) {
          render();
          return;
        }
        refill(p);
        if (!hands[p].length) {
          p = 1 - p;
          refill(p);
        }
        if (finish()) {
          render();
          return;
        }
        busy = p === 1;
        render();
        if (busy) ctx.later(ai, 850);
      }
      function ai() {
        if (done) return;
        refill(1);
        if (!hands[1].length) {
          begin(0);
          return;
        }
        let ranks = [...new Set(hands[1].map((c) => c.rank))],
          r = ranks[rand(ranks.length)];
        let again = ask(1, r);
        begin(again ? 1 : 0);
      }
      bind(root, (a, b) => {
        if (a === "ask" && !busy && !done) {
          let r = +b.dataset.rank;
          if (!hands[0].some((c) => c.rank === r)) return;
          let again = ask(0, r);
          begin(again ? 0 : 1);
        }
      });
      collect(0);
      collect(1);
      refill(0);
      render();
    },
  });

  G.register("solitaire", {
    rules:
      "<ol><li>Build four foundations from Ace to King, each in one suit.</li><li>In the seven columns, build downward in alternating colors. Only a King may fill an empty column.</li><li>Click a face-up card (and the cards below it) to select it, then click its destination. Click the same selection again to cancel.</li><li>Click the stock to draw one card. When empty, recycle the waste. Recycling is unlimited.</li><li>Use Undo for your last move, Hint for a suggestion, or To foundations to move eligible cards automatically.</li></ol><p>Foundation cards can move back to the columns. Random deals are not guaranteed to be winnable.</p>",
    mount(root) {
      let stock = G.deck(),
        waste = [],
        cols = [],
        found = [[], [], [], []],
        selected = null,
        history = [],
        moves = 0,
        message = "Click the stock to draw, or select a face-up card.",
        done = false;
      for (let i = 0; i < 7; i++) {
        cols.push(
          stock.splice(0, i + 1).map((c, j) => ({ ...c, up: j === i })),
        );
      }
      const snapshot = () =>
        JSON.stringify({ stock, waste, cols, found, moves, done });
      function save() {
        history.push(snapshot());
        if (history.length > 100) history.shift();
      }
      function source(s) {
        if (s.type === "waste")
          return waste.length ? [waste[waste.length - 1]] : [];
        if (s.type === "found")
          return found[s.col].length ? [found[s.col].at(-1)] : [];
        return cols[s.col].slice(s.idx);
      }
      function allowed(s, t) {
        let cards = source(s);
        if (!cards.length) return false;
        let c = cards[0];
        if (t.type === "found") {
          let f = found[t.col];
          return (
            cards.length === 1 &&
            (f.length
              ? f.at(-1).suit === c.suit && f.at(-1).rank + 1 === c.rank
              : c.rank === 1) &&
            !(s.type === "found" && s.col === t.col)
          );
        }
        if (t.type === "col") {
          if (s.type === "col" && s.col === t.col) return false;
          let last = cols[t.col].at(-1);
          return !last
            ? c.rank === 13
            : last.up && last.red !== c.red && last.rank === c.rank + 1;
        }
        return false;
      }
      function remove(s) {
        if (s.type === "waste") return [waste.pop()];
        if (s.type === "found") return [found[s.col].pop()];
        let a = cols[s.col].splice(s.idx);
        let last = cols[s.col].at(-1);
        if (last) last.up = true;
        return a;
      }
      function move(s, t, keepHistory = true) {
        if (!allowed(s, t)) return false;
        if (keepHistory) save();
        let cards = remove(s);
        cards.forEach((c) => (c.up = true));
        if (t.type === "found") found[t.col].push(...cards);
        else cols[t.col].push(...cards);
        moves++;
        selected = null;
        done = found.every((f) => f.length === 13);
        message = done
          ? "All four suits, Ace to King. You win!"
          : "Nice move. What’s next?";
        return true;
      }
      function sources() {
        let all = [];
        if (waste.length) all.push({ type: "waste" });
        cols.forEach((col, c) =>
          col.forEach((card, i) => {
            if (card.up) all.push({ type: "col", col: c, idx: i });
          }),
        );
        found.forEach((f, i) => {
          if (f.length) all.push({ type: "found", col: i });
        });
        return all;
      }
      function render() {
        let attrs = (type, col, idx) =>
          `data-action="card" data-type="${type}" ${col !== undefined ? `data-col="${col}"` : ""} ${idx !== undefined ? `data-idx="${idx}"` : ""}`;
        root.innerHTML = `<div class="stats">${stat("Moves", moves)}${stat("Foundations", found.reduce((s, f) => s + f.length, 0) + "/52")}</div><div class="solitaire-top"><div>${stock.length ? G.back("⁙", `data-action="draw" aria-label="Draw one card, ${stock.length} left"`) : `<button class="card-slot" data-action="draw" aria-label="Recycle waste" ${!waste.length ? "disabled" : ""}>↻</button>`}</div><div>${waste.length ? card(waste.at(-1), attrs("waste"), selected?.type === "waste" ? "selected" : "") : '<div class="card-slot" aria-label="Empty waste">·</div>'}</div><div></div>${found.map((f, i) => `<div>${f.length ? card(f.at(-1), attrs("found", i), selected?.type === "found" && selected.col === i ? "selected" : "") : `<button class="card-slot" ${attrs("found", i)} aria-label="Empty foundation ${i + 1}">A</button>`}</div>`).join("")}</div><div class="tableau">${cols.map((col, c) => `<div class="sol-column" style="min-height:${Math.max(250, (col.length - 1) * 29 + 105)}px">${col.length ? col.map((x, i) => (x.up ? card(x, `${attrs("col", c, i)} style="--row:${i}"`, selected?.type === "col" && selected.col === c && i >= selected.idx ? "selected" : "") : G.back("", `disabled style="--row:${i}" aria-label="Face down card"`))).join("") : `<button class="card-slot" ${attrs("col", c, 0)} aria-label="Empty column ${c + 1}, King only">K</button>`}</div>`).join("")}</div>${status(message, done)}<div class="toolbar">${btn("Undo", "undo", !history.length ? "disabled" : "")}${btn("Hint", "hint", done ? "disabled" : "")}${btn("To foundations", "auto", done ? "disabled" : "")}</div><p class="muted center">Draw one · Unlimited recycling · Click to select, then click to move</p>`;
      }
      bind(root, (a, b) => {
        if (a === "undo" && history.length) {
          ({ stock, waste, cols, found, moves, done } = JSON.parse(
            history.pop(),
          ));
          selected = null;
          message = "Last move undone.";
          render();
          return;
        }
        if (done) return;
        if (a === "draw" && (stock.length || waste.length)) {
          save();
          if (stock.length) {
            waste.push(stock.pop());
            message = "Card drawn. Play it or draw again.";
          } else {
            stock = waste.reverse();
            waste = [];
            message = "Stock recycled.";
          }
          selected = null;
          moves++;
        }
        if (a === "card") {
          let t = { type: b.dataset.type };
          if (b.dataset.col !== undefined) t.col = +b.dataset.col;
          if (b.dataset.idx !== undefined) t.idx = +b.dataset.idx;
          if (selected && move(selected, t)) {
            render();
            return;
          }
          let list = source(t);
          if (!list.length) {
            message =
              t.type === "found"
                ? "An Ace starts an empty foundation."
                : "Only a King can start an empty column.";
          } else if (
            selected &&
            JSON.stringify(selected) === JSON.stringify(t)
          ) {
            selected = null;
            message = "Selection cleared.";
          } else {
            selected = t;
            message = `Selected ${G.label(list[0])}${list.length > 1 ? " and " + (list.length - 1) + " cards below it" : ""}. Click a destination.`;
          }
        }
        if (a === "hint") {
          let suggestion = null;
          outer: for (let s of sources()) {
            for (let type of ["found", "col"])
              for (let c = 0; c < (type === "col" ? 7 : 4); c++) {
                let t = { type, col: c };
                if (
                  allowed(s, t) &&
                  !(s.type === "found" && type === "found") &&
                  !(
                    s.type === "col" &&
                    s.idx === 0 &&
                    type === "col" &&
                    !cols[c].length
                  )
                ) {
                  suggestion = { s, t };
                  break outer;
                }
              }
          }
          if (suggestion) {
            selected = suggestion.s;
            message = `Move ${G.label(source(selected)[0])} to ${suggestion.t.type === "found" ? "foundation" : "column"} ${suggestion.t.col + 1}.`;
          } else
            message = stock.length
              ? "No visible move found. Draw from the stock."
              : waste.length > 1
                ? "No visible move found. Recycle the stock to look for another card."
                : "No legal moves remain. Try Undo or start a new game.";
        }
        if (a === "auto") {
          let count = 0,
            saved = false;
          while (true) {
            let match;
            for (let s of sources().filter((s) => s.type !== "found"))
              for (let f = 0; f < 4; f++)
                if (allowed(s, { type: "found", col: f }))
                  match = { s, t: { type: "found", col: f } };
            if (!match) break;
            if (!saved) {
              save();
              saved = true;
            }
            move(match.s, match.t, false);
            count++;
          }
          if (!done)
            message = count
              ? `${count} card${count === 1 ? "" : "s"} moved to foundations.`
              : "No cards can move to a foundation yet.";
        }
        render();
      });
      render();
    },
  });
})();
