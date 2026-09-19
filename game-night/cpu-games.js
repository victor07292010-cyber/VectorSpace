"use strict";

// Local opponents receive exactly the same redacted view as an online player.
// The strategies never receive the private engine state or another player's hand.
(() => {
  const G = window.GameNight,
    R = window.RoomGames;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const pick = (items, random) => items[Math.floor(random() * items.length)];
  const boxEdges = Array.from({ length: 9 }, (_, i) => {
    const r = Math.floor(i / 3),
      c = i % 3;
    return [r * 3 + c, (r + 1) * 3 + c, 12 + r * 4 + c, 13 + r * 4 + c];
  });
  const boxesByEdge = Array.from({ length: 24 }, (_, edge) =>
    boxEdges.filter((box) => box.includes(edge)),
  );
  const fullMask = (1 << 24) - 1;
  const occupied = (mask, edge) => !!(mask & (1 << edge));
  const boxesMade = (mask, edge) =>
    boxesByEdge[edge].filter((box) =>
      box.every((e) => e === edge || occupied(mask, e)),
    ).length;

  function dots(v, random) {
    const legal = v.edges
      .map((owner, edge) => (owner < 0 ? edge : -1))
      .filter((edge) => edge >= 0);
    const mask = v.edges.reduce(
      (bits, owner, edge) => (owner < 0 ? bits : bits | (1 << edge)),
      0,
    );
    let options;
    if (legal.length <= 12) {
      // Exact endgame search: making a box retains the turn; otherwise the
      // remaining score is evaluated from the other player's perspective.
      const memo = new Map();
      function search(bits) {
        if (bits === fullMask) return 0;
        if (memo.has(bits)) return memo.get(bits);
        let best = -10;
        for (const edge of legal) {
          if (occupied(bits, edge)) continue;
          const made = boxesMade(bits, edge),
            after = search(bits | (1 << edge));
          best = Math.max(best, made ? made + after : -after);
        }
        memo.set(bits, best);
        return best;
      }
      options = legal.map((edge) => {
        const made = boxesMade(mask, edge),
          after = search(mask | (1 << edge));
        return { edge, score: made ? made + after : -after };
      });
    } else {
      options = legal.map((edge) => {
        const made = boxesMade(mask, edge);
        const gifts = boxesByEdge[edge].filter(
          (box) => box.filter((e) => occupied(mask, e)).length === 2,
        ).length;
        return { edge, score: made * 10 - gifts * 3 };
      });
    }
    const best = Math.max(...options.map((option) => option.score));
    return {
      type: "edge",
      edge: pick(
        options.filter((option) => option.score === best),
        random,
      ).edge,
    };
  }

  function flipped(board, player, index) {
    if (board[index]) return [];
    const row = Math.floor(index / 8),
      col = index % 8,
      all = [];
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dy && !dx) continue;
        let y = row + dy,
          x = col + dx;
        const line = [];
        while (
          y >= 0 &&
          y < 8 &&
          x >= 0 &&
          x < 8 &&
          board[y * 8 + x] === 2 - player
        ) {
          line.push(y * 8 + x);
          y += dy;
          x += dx;
        }
        if (
          line.length &&
          y >= 0 &&
          y < 8 &&
          x >= 0 &&
          x < 8 &&
          board[y * 8 + x] === player + 1
        )
          all.push(...line);
      }
    return all;
  }
  const legalDiscs = (board, player) =>
    board
      .map((_, i) => (flipped(board, player, i).length ? i : -1))
      .filter((i) => i >= 0);
  const placeDisc = (board, player, index) => {
    const next = [...board];
    for (const i of [index, ...flipped(board, player, index)])
      next[i] = player + 1;
    return next;
  };
  const positionWeights = [
    100, -20, 12, 6, 6, 12, -20, 100, -20, -35, -3, -3, -3, -3, -35, -20, 12,
    -3, 4, 2, 2, 4, -3, 12, 6, -3, 2, 1, 1, 2, -3, 6, 6, -3, 2, 1, 1, 2, -3, 6,
    12, -3, 4, 2, 2, 4, -3, 12, -20, -35, -3, -3, -3, -3, -35, -20, 100, -20,
    12, 6, 6, 12, -20, 100,
  ];
  function reversi(v, random) {
    const me = v.me,
      enemy = 1 - me;
    function evaluate(board) {
      const difference = board.reduce(
        (sum, value) =>
          sum + (value === me + 1 ? 1 : value === enemy + 1 ? -1 : 0),
        0,
      );
      if (!legalDiscs(board, me).length && !legalDiscs(board, enemy).length)
        return Math.sign(difference) * 10000 + difference;
      const positional = board.reduce(
        (sum, value, i) =>
          sum +
          (value === me + 1
            ? positionWeights[i]
            : value === enemy + 1
              ? -positionWeights[i]
              : 0),
        0,
      );
      return (
        positional +
        7 * (legalDiscs(board, me).length - legalDiscs(board, enemy).length) +
        (board.filter(Boolean).length > 48 ? difference * 3 : 0)
      );
    }
    function search(board, player, depth, alpha, beta) {
      const moves = legalDiscs(board, player);
      if (!depth || (!moves.length && !legalDiscs(board, 1 - player).length))
        return evaluate(board);
      if (!moves.length)
        return search(board, 1 - player, depth - 1, alpha, beta);
      let best = player === me ? -Infinity : Infinity;
      moves.sort((a, b) => positionWeights[b] - positionWeights[a]);
      for (const index of moves) {
        const score = search(
          placeDisc(board, player, index),
          1 - player,
          depth - 1,
          alpha,
          beta,
        );
        if (player === me) {
          best = Math.max(best, score);
          alpha = Math.max(alpha, best);
        } else {
          best = Math.min(best, score);
          beta = Math.min(beta, best);
        }
        if (beta <= alpha) break;
      }
      return best;
    }
    const options = legalDiscs(v.board, me).map((index) => ({
      index,
      score: search(
        placeDisc(v.board, me, index),
        enemy,
        2,
        -Infinity,
        Infinity,
      ),
    }));
    const best = Math.max(...options.map((option) => option.score));
    return {
      type: "disc",
      index: pick(
        options.filter((option) => option.score === best),
        random,
      ).index,
    };
  }

  function faces(v, random) {
    if (v.phase === "setup")
      return { type: "lock", character: pick(v.roster, random).id };
    const candidates = v.roster.filter(
      (person) => !v.eliminated.includes(person.id),
    );
    if (candidates.length === 1)
      return { type: "guess", character: candidates[0].id };
    const questions = v.questions
      .filter((q) => !v.history.some((entry) => entry.attribute === q.id))
      .map((q) => {
        const [trait, color] = q.id.split(":"),
          value = color || true;
        const yes = candidates.filter(
          (person) => person[trait] === value,
        ).length;
        return { id: q.id, score: Math.min(yes, candidates.length - yes) };
      })
      .filter((q) => q.score > 0);
    if (!questions.length)
      return { type: "guess", character: pick(candidates, random).id };
    const best = Math.max(...questions.map((q) => q.score));
    return {
      type: "ask",
      attribute: pick(
        questions.filter((q) => q.score === best),
        random,
      ).id,
    };
  }

  function dice(v, random) {
    const total = v.counts.reduce((sum, count) => sum + count, 0),
      unknown = total - v.dice.length;
    function probability(count, face) {
      const need = count - v.dice.filter((n) => n === face).length;
      if (need <= 0) return 1;
      if (need > unknown) return 0;
      // The only uncertainty is the unseen dice, each with a one-in-six chance.
      let term = (5 / 6) ** unknown,
        tail = 0;
      for (let hits = 0; hits <= unknown; hits++) {
        if (hits >= need) tail += term;
        term *= (unknown - hits) / ((hits + 1) * 5);
      }
      return tail;
    }
    const options = [];
    for (let count = v.bid?.count || 1; count <= total; count++)
      for (let face = 1; face <= 6; face++) {
        if (v.bid && count === v.bid.count && face <= v.bid.face) continue;
        options.push({ count, face, chance: probability(count, face) });
      }
    const currentChance = v.bid ? probability(v.bid.count, v.bid.face) : 1;
    const best = Math.max(0, ...options.map((option) => option.chance));
    if (
      v.bid &&
      (!options.length ||
        currentChance < 0.35 ||
        (best < 0.4 && currentChance < 0.65))
    )
      return { type: "challenge", round: v.round };
    // Prefer a credible bid. A small mix of bolder supported bids prevents a
    // deterministic bidding pattern without peeking at the opponent's dice.
    const credible = options.filter(
      (option) => option.chance >= Math.max(0.6, best - 0.12),
    );
    const choice = pick(
      credible.length
        ? credible
        : options.filter((option) => option.chance === best),
      random,
    );
    return {
      type: "bid",
      count: choice.count,
      face: choice.face,
      round: v.round,
    };
  }

  function canMove(id, v) {
    if (v.done) return false;
    if (id === "rock-paper-scissors") return v.phase === "choose" && !v.own;
    if (id === "guess-who" && v.phase === "setup")
      return v.ownCharacter === null;
    return v.phase === "play" && v.turn === v.me;
  }
  function choose(id, v, random = Math.random) {
    if (!canMove(id, v)) return null;
    switch (id) {
      case "dots-boxes":
        return dots(v, random);
      case "reversi":
        return reversi(v, random);
      case "guess-who":
        return faces(v, random);
      case "liars-dice":
        return dice(v, random);
      case "rock-paper-scissors":
        return {
          type: "throw",
          choice: pick(["rock", "paper", "scissors"], random),
          round: v.round,
        };
      default:
        return null;
    }
  }
  // A pure decision function also lets the deterministic checks verify complete
  // matches and prove that changing hidden opponent data cannot change a move.
  window.GameNightCPU = Object.freeze({ choose });

  const descriptions = {
    "guess-who":
      "<ol><li>Choose your secret character and lock it in. The computer chooses independently.</li><li>Ask a yes-or-no question to narrow your board. Your opponent takes a turn after each question.</li><li>When you know the answer, make a final guess. A correct guess wins; a wrong guess loses immediately.</li></ol>",
    "dots-boxes":
      "<ol><li>Click an empty line between two dots.</li><li>Complete the fourth side of a box to score a point and take another turn.</li><li>The computer tries to capture boxes and avoid giving you easy points.</li><li>The most boxes wins when the board is full.</li></ol>",
    reversi:
      "<ol><li>You play dark. Place a disc on a highlighted square to trap a line of light discs.</li><li>Trapped discs flip to your color. The computer then takes a turn.</li><li>Turns with no legal moves pass automatically.</li><li>Most discs wins when neither side can move.</li></ol>",
    "liars-dice":
      "<ol><li>You and the computer start with five secret dice each.</li><li>Bid how many dice of a face exist across both hands. Ones are not wild.</li><li>Raise the count, or the face at the same count. Call the bluff if the last bid seems too high.</li><li>A failed claim costs the bidder a die; a true claim costs the challenger a die. Last player with dice wins.</li></ol>",
    "rock-paper-scissors":
      "<ol><li>Choose rock, paper, or scissors. The computer locks its own random choice independently.</li><li>Rock beats scissors; scissors beat paper; paper beats rock.</li><li>A win earns one point. Ties earn no points.</li><li>Play five throws. Highest total wins.</li></ol>",
  };
  for (const id of Object.keys(descriptions)) {
    const engine = R.games[id];
    if (!engine) continue;
    G.register(id, {
      rules: descriptions[id],
      note: "Play against the computer with no internet connection. The computer sees only its own private information and the public board.",
      mount(root) {
        let state = engine.create([
          { id: "you", name: "You" },
          { id: "cpu", name: "Computer" },
        ]);
        let timer = null,
          disposed = false,
          renderedKey = "",
          notice = "";
        const cpuCanMove = () => canMove(id, engine.view(state, 1));
        function render() {
          if (disposed) return;
          const key = `${state.phase}:${state.round || 0}:${state.turn}`;
          const values =
            key === renderedKey
              ? [...root.querySelectorAll("[data-field]")].map((field) => [
                  field.dataset.field,
                  field.value,
                ])
              : [];
          const active = document.activeElement;
          const focus = root.contains(active) ? active?.dataset?.field : null;
          root.innerHTML = `<div class="cpu-mode"><span class="room-badge">OFFLINE · VS COMPUTER</span><p class="cpu-state muted" role="status">${state.done ? "Match finished. Start a new game for a rematch." : cpuCanMove() ? "Computer is thinking…" : "Your move. Take your time."}</p></div>${notice ? `<p class="game-status" role="alert">${G.esc(notice)}</p>` : ""}${engine.render(engine.view(state, 0))}`;
          for (const [field, value] of values) {
            const input = [...root.querySelectorAll("[data-field]")].find(
              (node) => node.dataset.field === field,
            );
            if (input) input.value = value;
          }
          if (focus)
            [...root.querySelectorAll("[data-field]")]
              .find((node) => node.dataset.field === focus)
              ?.focus({ preventScroll: true });
          renderedKey = key;
        }
        function apply(actor, action) {
          const next = clone(state);
          if (!engine.act(next, actor, action)) return false;
          state = next;
          return true;
        }
        function schedule() {
          if (timer !== null || disposed || !cpuCanMove()) return;
          timer = setTimeout(() => {
            timer = null;
            if (disposed) return;
            const action = choose(id, engine.view(state, 1));
            if (action) apply(1, action);
            render();
            schedule();
          }, 650);
        }
        root.onclick = (event) => {
          const button = event.target.closest("[data-move]");
          if (disposed || !button || !root.contains(button) || button.disabled)
            return;
          const action = { ...button.dataset, type: button.dataset.move };
          delete action.move;
          root.querySelectorAll("[data-field]").forEach((field) => {
            if (field.type !== "checkbox" || field.checked)
              action[field.dataset.field] = field.value;
          });
          notice = apply(0, action)
            ? ""
            : id === "guess-who"
              ? "Choose a character or a question before submitting."
              : "Choose a higher bid: increase the count, or raise the face at the same count.";
          render();
          schedule();
        };
        render();
        schedule();
        return () => {
          disposed = true;
          clearTimeout(timer);
          timer = null;
          root.onclick = null;
        };
      },
    });
  }
})();
