"use strict";
(() => {
  const G = GameNight,
    E = RoomGames,
    esc = G.esc;
  E.register("higher-lower", {
    title: "Higher or Lower",
    min: 2,
    max: 8,
    create(players) {
      let stock = G.deck();
      return {
        players,
        stock,
        current: stock.pop(),
        history: [],
        turn: 0,
        scores: players.map(() => 0),
        round: 1,
        done: false,
        winners: [],
        message:
          "First to 10 correct guesses wins. Aces are low; ties score no points.",
      };
    },
    act(s, p, a) {
      if (s.done || p !== s.turn || !["higher", "lower"].includes(a.type))
        return false;
      if (!s.stock.length) {
        s.stock = G.shuffle(s.history);
        s.history = [];
      }
      const old = s.current,
        next = s.stock.pop(),
        tie = old.rank === next.rank,
        correct =
          a.type === "higher" ? next.rank > old.rank : next.rank < old.rank;
      s.history.push(old);
      s.current = next;
      if (correct) s.scores[p]++;
      s.message = `${s.players[p].name} guessed ${a.type}. ${G.rank(old.rank)} → ${G.rank(next.rank)}. ${tie ? "A tie! No point." : correct ? "Correct! +1 point." : "No point this time."}`;
      if (s.scores[p] >= 10) {
        s.done = true;
        s.winners = [p];
        s.message = `${s.players[p].name} wins with 10 correct guesses!`;
      } else {
        s.turn = (s.turn + 1) % s.players.length;
        s.round++;
      }
      return true;
    },
    view(s, p) {
      return {
        players: s.players,
        me: p,
        current: s.current,
        previous: s.history.slice(-10),
        turn: s.turn,
        scores: s.scores,
        round: s.round,
        done: s.done,
        winners: s.winners,
        message: s.message,
        remaining: s.stock.length,
      };
    },
    render(v) {
      const mine = v.me === v.turn && !v.done;
      return `<div class="stats">${v.players.map((p, i) => G.stat(esc(p.name), v.scores[i] + "/10")).join("")}</div>${G.status(v.message, v.done)}<p class="sub-label">${v.done ? "ROUND COMPLETE" : mine ? "YOUR GUESS" : esc(v.players[v.turn].name.toUpperCase()) + " IS GUESSING"}</p><div class="center-pile">${G.card(v.current, "disabled")}</div><div class="toolbar"><button class="button" data-move="lower" ${mine ? "" : "disabled"}>↓ Lower</button><button class="button" data-move="higher" ${mine ? "" : "disabled"}>↑ Higher</button></div><p class="muted center">Take turns guessing. First to 10 points wins. Ties score no points. Aces are low.</p><div class="history">${v.previous.map((c) => `<span class="mini-card ${c.red ? "red" : ""}">${G.rank(c.rank)}${c.suit}</span>`).join("")}</div>`;
    },
  });
  function src(s, a) {
    if (a.zone === "waste") return s.waste.length ? [s.waste.at(-1)] : [];
    if (a.zone === "found")
      return s.found[a.col]?.length ? [s.found[a.col].at(-1)] : [];
    if (a.zone === "col")
      return s.cols[a.col]?.[a.idx]?.up ? s.cols[a.col].slice(a.idx) : [];
    return [];
  }
  function can(s, a, b) {
    const cards = src(s, a);
    if (!cards.length) return false;
    const first = cards[0];
    if (b.zone === "found") {
      const f = s.found[b.col];
      return (
        !!f &&
        cards.length === 1 &&
        !(a.zone === "found" && a.col === b.col) &&
        (f.length
          ? f.at(-1).suit === first.suit && f.at(-1).rank + 1 === first.rank
          : first.rank === 1)
      );
    }
    if (b.zone === "col") {
      if (!s.cols[b.col] || (a.zone === "col" && a.col === b.col)) return false;
      const last = s.cols[b.col].at(-1);
      return last
        ? last.up && last.red !== first.red && last.rank === first.rank + 1
        : first.rank === 13;
    }
    return false;
  }
  function checkpoint(s) {
    s.undo.push(
      JSON.stringify({
        stock: s.stock,
        waste: s.waste,
        cols: s.cols,
        found: s.found,
        turn: s.turn,
        moves: s.moves,
      }),
    );
    if (s.undo.length > 50) s.undo.shift();
  }
  function relocate(s, a, b) {
    checkpoint(s);
    let cards;
    if (a.zone === "waste") cards = [s.waste.pop()];
    else if (a.zone === "found") cards = [s.found[a.col].pop()];
    else {
      cards = s.cols[a.col].splice(a.idx);
      if (s.cols[a.col].length) s.cols[a.col].at(-1).up = true;
    }
    cards.forEach((c) => (c.up = true));
    if (b.zone === "col") s.cols[b.col].push(...cards);
    else s.found[b.col].push(...cards);
    s.moves++;
    s.selected = null;
    s.turn = (s.turn + 1) % s.players.length;
    s.message = "Nice teamwork. Next player’s move.";
    if (s.found.every((f) => f.length === 13)) {
      s.done = true;
      s.winners = s.players.map((_, i) => i);
      s.message = "The team cleared all four suits. Everybody wins!";
    }
  }
  E.register("solitaire", {
    title: "Team Solitaire",
    min: 2,
    max: 8,
    create(players) {
      const stock = G.deck(),
        cols = [];
      for (let i = 0; i < 7; i++)
        cols.push(
          stock.splice(0, i + 1).map((c, j) => ({ ...c, up: j === i })),
        );
      return {
        players,
        stock,
        cols,
        waste: [],
        found: [[], [], [], []],
        turn: 0,
        moves: 0,
        selected: null,
        undo: [],
        done: false,
        winners: [],
        message: "Work together. Take turns making a move or drawing one card.",
      };
    },
    act(s, p, a) {
      if (s.done || p !== s.turn) return false;
      if (a.type === "draw" && (s.stock.length || s.waste.length)) {
        checkpoint(s);
        if (s.stock.length) s.waste.push(s.stock.pop());
        else {
          s.stock = s.waste.reverse();
          s.waste = [];
        }
        s.moves++;
        s.turn = (s.turn + 1) % s.players.length;
        s.selected = null;
        s.message = "Stock drawn. Next player’s turn.";
        return true;
      }
      if (a.type === "undo" && s.undo.length) {
        Object.assign(s, JSON.parse(s.undo.pop()));
        s.selected = null;
        s.message = "The team’s last move was undone.";
        return true;
      }
      if (a.type === "select") {
        const t = { zone: a.zone };
        if (a.col !== undefined) {
          t.col = Number(a.col);
          if (
            !Number.isInteger(t.col) ||
            t.col < 0 ||
            t.col >= (a.zone === "found" ? 4 : 7)
          )
            return false;
        }
        if (a.idx !== undefined) {
          t.idx = Number(a.idx);
          if (!Number.isInteger(t.idx) || t.idx < 0) return false;
        }
        if (s.selected && can(s, s.selected, t)) {
          relocate(s, s.selected, t);
          return true;
        }
        if (!src(s, t).length) return false;
        s.selected =
          JSON.stringify(s.selected) === JSON.stringify(t) ? null : t;
        s.message = s.selected
          ? `${s.players[p].name} selected ${G.label(src(s, t)[0])}. Choose its destination.`
          : "Selection cleared.";
        return true;
      }
      return false;
    },
    view(s, p) {
      return {
        players: s.players,
        me: p,
        turn: s.turn,
        stockCount: s.stock.length,
        waste: s.waste.length ? s.waste.at(-1) : null,
        cols: s.cols.map((col) => col.map((c) => (c.up ? c : { up: false }))),
        found: s.found,
        selected: s.selected,
        moves: s.moves,
        canUndo: !!s.undo.length,
        done: s.done,
        winners: s.winners,
        message: s.message,
      };
    },
    render(v) {
      const mine = v.me === v.turn && !v.done;
      const attr = (zone, col, idx) =>
        `data-move="select" data-zone="${zone}" ${col === undefined ? "" : `data-col="${col}"`} ${idx === undefined ? "" : `data-idx="${idx}"`} ${mine ? "" : "disabled"}`;
      return `<div class="stats">${G.stat("Team moves", v.moves)}${G.stat("Foundations", v.found.reduce((n, f) => n + f.length, 0) + "/52")}</div><p class="sub-label">${v.done ? "TEAM VICTORY" : mine ? "YOUR TURN · MAKE ONE MOVE" : esc(v.players[v.turn].name.toUpperCase()) + "’S TURN"}</p><div class="solitaire-top"><div>${v.stockCount ? G.back("⁙", `data-move="draw" aria-label="Draw one card" ${mine ? "" : "disabled"}`) : `<button class="card-slot" data-move="draw" aria-label="Recycle stock" ${mine && v.waste ? "" : "disabled"}>↻</button>`}</div><div>${v.waste ? G.card(v.waste, attr("waste"), v.selected?.zone === "waste" ? "selected" : "") : '<div class="card-slot">·</div>'}</div><div></div>${v.found.map((f, i) => `<div>${f.length ? G.card(f.at(-1), attr("found", i), v.selected?.zone === "found" && v.selected.col === i ? "selected" : "") : `<button class="card-slot" ${attr("found", i)} aria-label="Foundation ${i + 1}">A</button>`}</div>`).join("")}</div><div class="tableau">${v.cols.map((col, c) => `<div class="sol-column" style="min-height:${Math.max(250, (col.length - 1) * 29 + 105)}px">${col.length ? col.map((x, i) => (x.up ? G.card(x, `${attr("col", c, i)} style="--row:${i}"`, v.selected?.zone === "col" && v.selected.col === c && i >= v.selected.idx ? "selected" : "") : G.back("", `disabled style="--row:${i}" aria-label="Face down card"`))).join("") : `<button class="card-slot" ${attr("col", c, 0)} aria-label="Empty column ${c + 1}, King only">K</button>`}</div>`).join("")}</div>${G.status(v.message, v.done)}<div class="toolbar"><button class="button" data-move="undo" ${mine && v.canUndo ? "" : "disabled"}>Team undo</button></div><p class="muted center">Draw-one Klondike, together. Discuss your moves; each draw or move passes the turn. All four foundations complete = everybody wins.</p>`;
    },
  });
})();
