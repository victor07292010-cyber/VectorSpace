"use strict";
(() => {
  const G = window.GameNight, R = window.RoomGames, esc = G.esc;
  const copy = value => JSON.parse(JSON.stringify(value));
  const number = (value, min, max) => {
    if (!(typeof value === "number" || typeof value === "string" && /^\d+$/.test(value))) return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max ? n : null;
  };
  const base = (players, min = 2, max = 2) => {
    if (players.length < min || players.length > max) throw Error("Invalid player count");
    return { players: players.map(p => ({ id: p.id, name: p.name })), turn: 0, done: false, winners: [], phase: "play", message: "" };
  };
  const valid = (s, p, a) => !s.done && Number.isInteger(p) && p === s.turn && p >= 0 && p < s.players.length && a && typeof a.type === "string";
  const finish = (s, winners, reason = "") => {
    s.done = true; s.phase = "done"; s.winners = winners;
    s.message = `${winners.map(p => s.players[p].name).join(" & ")}${winners.length > 1 ? " draw!" : " wins!"}${reason ? " " + reason : ""}`;
  };
  const banner = v => G.status(v.done ? v.message : `${v.message ? v.message + " " : ""}${v.turn === v.me ? "Your turn." : v.players[v.turn].name + "’s turn."}`, v.done);
  const stats = (v, values) => `<div class="stats strategy-stats">${v.players.map((p, i) => G.stat(`${esc(p.name)}${i === v.me ? " · you" : ""}`, esc(values[i]))).join("")}</div>`;
  const active = v => !v.done && v.turn === v.me;
  const pick = (a, random) => a[Math.floor(random() * a.length)];
  const coordinate = i => "ABCDEFGH"[i % 8] + (8 - Math.floor(i / 8));
  const owner = piece => Math.abs(piece) - 1;

  // American checkers: mandatory forward captures, chained jumps, and crowning
  // ends a turn. Negative pieces are kings; no hidden board information exists.
  function checkerSteps(s, p, onlyCaptures = false) {
    const simple = [], captures = [];
    for (let from = 0; from < 64; from++) {
      const piece = s.board[from];
      if (!piece || owner(piece) !== p || s.chain >= 0 && s.chain !== from) continue;
      const row = Math.floor(from / 8), col = from % 8;
      for (const dy of piece < 0 ? [-1, 1] : [p === 0 ? -1 : 1]) for (const dx of [-1, 1]) {
        const r = row + dy, c = col + dx;
        if (r < 0 || r > 7 || c < 0 || c > 7) continue;
        const middle = r * 8 + c;
        if (!s.board[middle] && s.chain < 0) simple.push({ type: "move", from, to: middle });
        if (s.board[middle] && owner(s.board[middle]) !== p) {
          const rr = r + dy, cc = c + dx;
          if (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && !s.board[rr * 8 + cc]) captures.push({ type: "move", from, to: rr * 8 + cc, captured: middle });
        }
      }
    }
    return captures.length || onlyCaptures || s.chain >= 0 ? captures : simple;
  }
  const checkerKey = s => s.board.join(",") + ":" + s.turn;
  const checkers = {
    title: "Checkers", min: 2, max: 2,
    rules: "<ol><li>You play the coral pieces and move diagonally forward on the dark squares. Select a piece, then a glowing destination.</li><li>A jump captures a piece. Captures are mandatory; continue jumping with the same piece while another capture is available.</li><li>Reach the far row to become a king. Crowning ends that turn; kings can move and jump in both directions.</li><li>Win by taking every enemy piece or leaving your opponent no legal move. Three repeated positions, or 80 turns without a capture or promotion, draw.</li></ol>",
    create(players) {
      const s = { ...base(players), board: Array.from({ length: 64 }, (_, i) => (Math.floor(i / 8) + i % 8) % 2 ? i < 24 ? 2 : i >= 40 ? 1 : 0 : 0), chain: -1, selected: -1, quiet: 0, positions: {} };
      s.positions[checkerKey(s)] = 1; return s;
    },
    act(s, p, a) {
      if (!valid(s, p, a)) return false;
      const moves = checkerSteps(s, p);
      if (a.type === "select") {
        const from = number(a.from, 0, 63);
        if (from === null || !moves.some(m => m.from === from)) return false;
        s.selected = from; return true;
      }
      if (a.type !== "move") return false;
      const from = number(a.from, 0, 63), to = number(a.to, 0, 63);
      const move = moves.find(m => m.from === from && m.to === to);
      if (!move) return false;
      let piece = s.board[from];
      s.board[from] = 0;
      if (move.captured !== undefined) s.board[move.captured] = 0;
      const crowned = piece > 0 && (p === 0 ? to < 8 : to >= 56);
      if (crowned) piece = -piece;
      s.board[to] = piece; s.selected = -1;
      s.quiet = move.captured !== undefined || crowned ? 0 : s.quiet + 1;
      s.chain = to;
      if (move.captured !== undefined && !crowned && checkerSteps(s, p, true).length) {
        s.selected = to; s.message = "Keep jumping with the highlighted piece."; return true;
      }
      s.chain = -1; s.turn = 1 - p; s.message = crowned ? "A new king has arrived." : "";
      if (!checkerSteps(s, s.turn).length) finish(s, [p], "No legal moves remain for the other side.");
      else {
        const key = checkerKey(s); s.positions[key] = (s.positions[key] || 0) + 1;
        if (s.positions[key] >= 3 || s.quiet >= 80) finish(s, [0, 1], s.quiet >= 80 ? "80 turns without a capture or promotion." : "The same position occurred three times.");
      }
      return true;
    },
    view(s, p) { return { ...copy(s), me: p }; },
    render(v) {
      const moves = active(v) ? checkerSteps(v, v.me) : [], destinations = moves.filter(m => m.from === v.selected);
      return `${stats(v, [0, 1].map(p => v.board.filter(n => n && owner(n) === p).length + " pieces"))}${banner(v)}<div class="strategy-legend"><span><i class="strategy-dot coral"></i> ${esc(v.players[0].name)}</span><span><i class="strategy-dot cream"></i> ${esc(v.players[1].name)}</span></div><div class="checker-frame"><div class="checker-board" role="group" aria-label="Checkers board">${v.board.map((piece, i) => {
        const move = destinations.find(m => m.to === i), selectable = moves.some(m => m.from === i), dark = (Math.floor(i / 8) + i % 8) % 2;
        return `<button class="checker-cell ${dark ? "dark" : "light"} ${i === v.selected ? "selected" : ""} ${move ? "destination" : ""}" ${move ? `data-move="move" data-from="${move.from}" data-to="${i}"` : selectable ? `data-move="select" data-from="${i}"` : "disabled"} aria-label="${coordinate(i)}${piece ? ", " + esc(v.players[owner(piece)].name) + (piece < 0 ? " king" : " piece") : ", empty"}${move ? ", move here" : selectable ? ", select piece" : ""}" ${selectable ? `aria-pressed="${i === v.selected}"` : ""}><span class="checker-coordinate">${coordinate(i)}</span>${piece ? `<span class="checker-piece side-${owner(piece)} ${piece < 0 ? "king" : ""}">${piece < 0 ? "♛" : ""}</span>` : move ? '<span class="checker-target"></span>' : ""}</button>`;
      }).join("")}</div></div><p class="strategy-hint">${active(v) ? v.chain >= 0 ? "Continue your capture: choose a glowing square." : v.selected >= 0 ? "Choose a glowing square to move, or select another piece." : moves.some(m => m.captured !== undefined) ? "A capture is available. Select a piece that can jump." : "Select one of your pieces, then a glowing square." : "Coral moves up. Cream moves down. A crown marks a king."}</p>`;
    }
  };
  R.register("checkers", checkers);

  const mancalaMoves = s => Array.from({ length: 6 }, (_, i) => i + s.turn * 7).filter(i => s.pits[i] > 0).map(pit => ({ type: "sow", pit }));
  const mancala = {
    title: "Mancala", min: 2, max: 2,
    rules: "<ol><li>This is Kalah: six small pits and one store each. Every pit starts with four stones.</li><li>Choose a pit on your side. Drop one stone in each following pit and your own store, skipping the other store.</li><li>End in your store for another turn. End in an empty pit on your side to capture that stone and the stones opposite it, if any.</li><li>When either side is empty, sweep the remaining stones into their owner’s store. The larger store wins.</li></ol>",
    create(players) { return { ...base(players), pits: Array.from({ length: 14 }, (_, i) => i === 6 || i === 13 ? 0 : 4), last: -1 }; },
    act(s, p, a) {
      if (!valid(s, p, a) || a.type !== "sow") return false;
      const pit = number(a.pit, p * 7, p * 7 + 5);
      if (pit === null || !s.pits[pit]) return false;
      let count = s.pits[pit], at = pit; s.pits[pit] = 0;
      while (count) { at = (at + 1) % 14; if (at === (p === 0 ? 13 : 6)) continue; s.pits[at]++; count--; }
      const store = p * 7 + 6;
      s.last = at; s.message = "";
      if (at >= p * 7 && at < p * 7 + 6 && s.pits[at] === 1 && s.pits[12 - at] > 0) {
        const captured = s.pits[12 - at] + 1; s.pits[store] += captured; s.pits[at] = s.pits[12 - at] = 0;
        s.message = `${s.players[p].name} captured ${captured} stones.`;
      }
      if ([0, 1].some(side => s.pits.slice(side * 7, side * 7 + 6).every(n => n === 0))) {
        for (let side = 0; side < 2; side++) for (let i = side * 7; i < side * 7 + 6; i++) { s.pits[side * 7 + 6] += s.pits[i]; s.pits[i] = 0; }
        finish(s, s.pits[6] === s.pits[13] ? [0, 1] : [s.pits[6] > s.pits[13] ? 0 : 1], `${s.pits[6]}–${s.pits[13]} stones.`);
      } else if (at === store) s.message = "Your last stone reached your store. Take another turn.";
      else s.turn = 1 - p;
      return true;
    },
    view(s, p) { return { ...copy(s), me: p }; },
    render(v) {
      const seat = v.me === 1 ? 1 : 0, own = seat * 7, other = (1 - seat) * 7;
      const pit = i => `<button class="mancala-pit ${i === v.last ? "last" : ""}" data-move="sow" data-pit="${i}" ${active(v) && i >= own && i < own + 6 && v.pits[i] ? "" : "disabled"} aria-label="${i >= own && i < own + 6 ? "Your" : "Opponent"} pit ${i % 7 + 1}: ${v.pits[i]} stones"><span class="mancala-stones" aria-hidden="true">${Array.from({ length: Math.min(v.pits[i], 12) }, (_, n) => `<i style="--stone:${n}"></i>`).join("")}</span><strong>${v.pits[i]}</strong></button>`;
      return `${stats(v, [v.pits[6] + " stored", v.pits[13] + " stored"])}${banner(v)}<div class="mancala-label">${esc(v.players[1 - seat].name)} · stones move →</div><div class="mancala-board"><div class="mancala-store opponent-store"><span>${v.me < 0 ? "SEAT 2" : "THEIRS"}</span><strong>${v.pits[other + 6]}</strong></div><div class="mancala-row upper">${Array.from({ length: 6 }, (_, n) => pit(other + 5 - n)).join("")}</div><div class="mancala-row lower">${Array.from({ length: 6 }, (_, n) => pit(own + n)).join("")}</div><div class="mancala-store own-store"><span>${v.me < 0 ? "SEAT 1" : "YOURS"}</span><strong>${v.pits[own + 6]}</strong></div></div><p class="strategy-hint">${v.me < 0 ? "Seat 1 plays the bottom row. Seat 2 plays the top row." : "Your pits are on the bottom. Choose a glowing pit to sow its stones toward your store →"}</p>`;
    }
  };
  R.register("mancala", mancala);

  const dominoMoves = v => v.hand.flatMap(tile => {
    if (!v.chain.length) return [{ type: "play", tile: tile.id, side: "right" }];
    return ["left", "right"].filter(side => tile.a === v[side] || tile.b === v[side]).map(side => ({ type: "play", tile: tile.id, side }));
  });
  const tileFace = (a, b) => `<span class="domino-half" data-pips="${a}">${a === 0 ? "○" : "⚀⚁⚂⚃⚄⚅"[a - 1]}</span><span class="domino-half" data-pips="${b}">${b === 0 ? "○" : "⚀⚁⚂⚃⚄⚅"[b - 1]}</span>`;
  const dominoes = {
    title: "Dominoes", min: 2, max: 4,
    rules: "<ol><li>Match a tile to either open end of the chain. The host opens with any tile. Each of two players gets seven tiles; with three or four players, each gets five.</li><li>If you can play, you must play. Otherwise draw one tile at a time until you can play or the boneyard is empty.</li><li>With no match and an empty boneyard, pass. Empty your hand to win.</li><li>If everyone passes in sequence, the lowest total pips remaining wins. Equal totals share the win. Your hand stays private.</li></ol>",
    create(players) {
      const pool = G.shuffle(Array.from({ length: 7 }, (_, a) => Array.from({ length: 7 - a }, (_, n) => ({ id: a * 7 + a + n, a, b: a + n }))).flat());
      const count = players.length === 2 ? 7 : 5;
      return { ...base(players, 2, 4), hands: players.map(() => pool.splice(0, count)), boneyard: pool, chain: [], left: null, right: null, passes: 0 };
    },
    act(s, p, a) {
      if (!valid(s, p, a)) return false;
      const playable = dominoMoves(this.view(s, p));
      if (a.type === "draw") {
        if (playable.length || !s.boneyard.length) return false;
        s.hands[p].push(s.boneyard.pop()); s.message = `${s.players[p].name} drew a tile.`; return true;
      }
      if (a.type === "pass") {
        if (playable.length || s.boneyard.length) return false;
        s.passes++; s.message = `${s.players[p].name} passed.`;
        if (s.passes >= s.players.length) {
          const totals = s.hands.map(hand => hand.reduce((sum, t) => sum + t.a + t.b, 0));
          finish(s, totals.map((n, i) => n === Math.min(...totals) ? i : -1).filter(i => i >= 0), "The chain is blocked; lowest remaining pips wins.");
        } else s.turn = (p + 1) % s.players.length;
        return true;
      }
      if (a.type !== "play") return false;
      const id = number(a.tile, 0, 48), move = playable.find(m => m.tile === id && m.side === a.side);
      if (!move) return false;
      const index = s.hands[p].findIndex(t => t.id === id), tile = s.hands[p][index];
      let left = tile.a, right = tile.b;
      if (s.chain.length) {
        if (move.side === "left" && right !== s.left || move.side === "right" && left !== s.right) [left, right] = [right, left];
      }
      s.hands[p].splice(index, 1);
      if (move.side === "left") s.chain.unshift({ left, right }); else s.chain.push({ left, right });
      s.left = s.chain[0].left; s.right = s.chain.at(-1).right; s.passes = 0;
      s.message = `${s.players[p].name} played ${tile.a}–${tile.b}.`;
      if (!s.hands[p].length) finish(s, [p], "An empty hand takes the round."); else s.turn = (p + 1) % s.players.length;
      return true;
    },
    view(s, p) {
      return { players: copy(s.players), me: p, turn: s.turn, done: s.done, winners: [...s.winners], phase: s.phase, message: s.message, hand: copy(s.hands[p] || []), counts: s.hands.map(h => h.length), boneyardCount: s.boneyard.length, chain: copy(s.chain), left: s.left, right: s.right, passes: s.passes, totals: s.done ? s.hands.map(h => h.reduce((sum, t) => sum + t.a + t.b, 0)) : null };
    },
    render(v) {
      const moves = active(v) ? dominoMoves(v) : [];
      return `${stats(v, v.counts.map((n, i) => n + " tiles" + (v.totals ? " · " + v.totals[i] + " pips" : "")))}${banner(v)}<div class="domino-table"><div class="domino-ends"><span>LEFT <strong>${v.left ?? "—"}</strong></span><span>BONEYARD <strong>${v.boneyardCount}</strong></span><span>RIGHT <strong>${v.right ?? "—"}</strong></span></div><div class="domino-chain" role="list" aria-label="Domino chain, left to right">${v.chain.map(t => `<span class="domino-tile" role="listitem" aria-label="${t.left} to ${t.right}">${tileFace(t.left, t.right)}</span>`).join("") || '<p class="domino-empty">Open the table.<br><small>Any tile makes a good beginning.</small></p>'}</div></div><h3 class="strategy-hand-title">Your hand <span>Only you can see these tiles</span></h3><div class="domino-hand">${v.hand.map(t => `<div class="domino-choice"><span class="domino-tile" aria-label="${t.a} and ${t.b}">${tileFace(t.a, t.b)}</span><div>${["left", "right"].map(side => `<button class="domino-place" data-move="play" data-tile="${t.id}" data-side="${side}" ${moves.some(m => m.tile === t.id && m.side === side) ? "" : "disabled"} aria-label="Play ${t.a}–${t.b} on ${side}">${side === "left" ? "← Left" : v.chain.length ? "Right →" : "Open →"}</button>`).join("")}</div></div>`).join("")}</div><div class="strategy-actions">${!v.done ? `<button class="button" data-move="${v.boneyardCount ? "draw" : "pass"}" ${active(v) && !moves.length ? "" : "disabled"}>${v.boneyardCount ? "Draw a tile" : "Pass turn"}</button>` : ""}<span class="muted">${active(v) && moves.length ? "Choose an end beneath a matching tile." : "Draw only when none of your tiles fit."}</span></div>`;
    }
  };
  R.register("dominoes", dominoes);

  const HEX = 7;
  function neighbors(i) {
    const r = Math.floor(i / HEX), c = i % HEX;
    return [[r - 1, c], [r - 1, c + 1], [r, c - 1], [r, c + 1], [r + 1, c - 1], [r + 1, c]].filter(([rr, cc]) => rr >= 0 && rr < HEX && cc >= 0 && cc < HEX).map(([rr, cc]) => rr * HEX + cc);
  }
  function hexPath(board, p) {
    const queue = [], parent = new Map();
    for (let k = 0; k < HEX; k++) { const i = p === 0 ? k : k * HEX; if (board[i] === p + 1) { queue.push(i); parent.set(i, -1); } }
    for (let at = 0; at < queue.length; at++) {
      const i = queue[at];
      if (p === 0 ? i >= HEX * (HEX - 1) : i % HEX === HEX - 1) { const path = []; for (let n = i; n !== -1; n = parent.get(n)) path.push(n); return path; }
      for (const next of neighbors(i)) if (board[next] === p + 1 && !parent.has(next)) { parent.set(next, i); queue.push(next); }
    }
    return [];
  }
  const hex = {
    title: "Hex", min: 2, max: 2,
    rules: "<ol><li>Take turns placing a stone in an empty hexagon. Stones never move or capture.</li><li>Gold connects the top and bottom edges. Teal connects the left and right edges. Adjacent stones share a side.</li><li>The first unbroken chain joining your edges wins. Every game has a winner; there are no draws.</li><li>This compact 7 × 7 board uses a fixed first player and no swap rule. Race to connect while blocking the other route.</li></ol>",
    create(players) { return { ...base(players), board: Array(HEX * HEX).fill(0), path: [], last: -1 }; },
    act(s, p, a) {
      if (!valid(s, p, a) || a.type !== "place") return false;
      const index = number(a.index, 0, HEX * HEX - 1);
      if (index === null || s.board[index]) return false;
      s.board[index] = p + 1; s.last = index; s.path = hexPath(s.board, p);
      if (s.path.length) finish(s, [p], "A continuous path connects both edges."); else s.turn = 1 - p;
      return true;
    },
    view(s, p) { return { ...copy(s), me: p }; },
    render(v) {
      return `${stats(v, ["Gold · top ↔ bottom", "Teal · left ↔ right"])}${banner(v)}<div class="hex-surround"><span class="hex-edge-label top">GOLD EDGE</span><div class="hex-grid" role="group" aria-label="Hex board. Gold connects top to bottom, teal left to right">${Array.from({ length: HEX }, (_, r) => `<div class="hex-row" style="--row:${r}">${Array.from({ length: HEX }, (_, c) => {
        const i = r * HEX + c, piece = v.board[i];
        return `<button class="hex-cell side-${piece} ${v.path.includes(i) ? "winning" : ""} ${v.last === i ? "last" : ""}" data-move="place" data-index="${i}" ${active(v) && !piece ? "" : "disabled"} aria-label="${"ABCDEFG"[c]}${r + 1}, ${piece ? esc(v.players[piece - 1].name) : "empty"}"><span>${piece ? "●" : ""}</span></button>`;
      }).join("")}</div>`).join("")}</div><span class="hex-edge-label bottom">GOLD EDGE</span></div><p class="strategy-hint">Your stones are ${v.me === 0 ? "gold. Connect the top and bottom edges ↕" : "teal. Connect the left and right edges ↔"}.</p>`;
    }
  };
  R.register("hex", hex);

  const nim = {
    title: "Nim", min: 2, max: 8,
    rules: "<ol><li>Four piles start with 3, 5, 7, and 9 stones. Play in seat order with two to eight people.</li><li>On your turn, remove at least one stone from exactly one pile. You may take the whole pile.</li><li>The player who takes the very last stone wins. All other players lose the round.</li><li>Each button says how many stones it removes. Against the computer, look for a way to leave four balanced piles.</li></ol>",
    create(players) { return { ...base(players, 2, 8), piles: [3, 5, 7, 9], last: -1 }; },
    act(s, p, a) {
      if (!valid(s, p, a) || a.type !== "take") return false;
      const pile = number(a.pile, 0, 3), count = number(a.count, 1, 9);
      if (pile === null || count === null || count > s.piles[pile]) return false;
      s.piles[pile] -= count; s.last = pile; s.message = `${s.players[p].name} took ${count} ${count === 1 ? "stone" : "stones"} from pile ${pile + 1}.`;
      if (s.piles.every(n => !n)) finish(s, [p], "The last stone is yours."); else s.turn = (p + 1) % s.players.length;
      return true;
    },
    view(s, p) { return { ...copy(s), me: p }; },
    render(v) {
      return `${stats(v, v.players.map((_, i) => v.done ? v.winners.includes(i) ? "Winner" : "Finished" : i === v.turn ? "At play" : "Waiting"))}${banner(v)}<div class="nim-board">${v.piles.map((n, pile) => `<section class="nim-pile ${v.last === pile ? "last" : ""}"><header><span>PILE ${pile + 1}</span><strong>${n} <small>${n === 1 ? "stone" : "stones"}</small></strong></header><div class="nim-stones" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i style="--stone:${i}"></i>`).join("") || '<span class="nim-empty">All clear</span>'}</div><div class="nim-takes">${Array.from({ length: n }, (_, i) => `<button data-move="take" data-pile="${pile}" data-count="${i + 1}" ${active(v) ? "" : "disabled"} aria-label="Take ${i + 1} from pile ${pile + 1}">−${i + 1}</button>`).join("")}</div></section>`).join("")}</div><p class="strategy-hint">Choose how many to take from one pile. Take the last stone to win.</p>`;
    }
  };
  R.register("nim", nim);

  function checkerScore(s, me) {
    if (s.done) return s.winners.length > 1 ? 0 : s.winners[0] === me ? 10000 : -10000;
    return s.board.reduce((sum, piece, i) => {
      if (!piece) return sum;
      const p = owner(piece), row = Math.floor(i / 8);
      const value = (piece < 0 ? 175 : 100 + (p === 0 ? 7 - row : row) * 5) + (i % 8 === 0 || i % 8 === 7 ? 6 : 0);
      return sum + (p === me ? value : -value);
    }, 0);
  }
  function searchMove(engine, v, moves, score, depth, random) {
    const me = v.me;
    function search(s, left, alpha, beta) {
      if (s.done || !left) return score(s, me);
      const options = moves(s); let best = s.turn === me ? -Infinity : Infinity;
      for (const action of options) {
        const next = copy(s); engine.act(next, s.turn, action);
        const value = search(next, left - 1, alpha, beta);
        if (s.turn === me) { best = Math.max(best, value); alpha = Math.max(alpha, best); }
        else { best = Math.min(best, value); beta = Math.min(beta, best); }
        if (beta <= alpha) break;
      }
      return Number.isFinite(best) ? best : score(s, me);
    }
    const options = moves(v).map(action => { const next = copy(v); engine.act(next, v.turn, action); return { action, value: search(next, depth - 1, -Infinity, Infinity) }; });
    const best = Math.max(...options.map(o => o.value));
    return pick(options.filter(o => o.value === best), random)?.action || null;
  }
  function hexDistance(board, p) {
    const dist = Array(HEX * HEX).fill(Infinity), visited = new Set();
    for (let k = 0; k < HEX; k++) { const i = p === 0 ? k : k * HEX; if (board[i] !== 2 - p) dist[i] = board[i] ? 0 : 1; }
    for (let step = 0; step < board.length; step++) {
      let best = -1;
      for (let i = 0; i < board.length; i++) if (!visited.has(i) && (best < 0 || dist[i] < dist[best])) best = i;
      if (best < 0 || !Number.isFinite(dist[best])) break;
      if (p === 0 ? best >= HEX * (HEX - 1) : best % HEX === HEX - 1) return dist[best];
      visited.add(best);
      for (const next of neighbors(best)) if (board[next] !== 2 - p) dist[next] = Math.min(dist[next], dist[best] + (board[next] ? 0 : 1));
    }
    return HEX * HEX;
  }
  function choose(id, v, random = Math.random) {
    if (!active(v)) return null;
    if (id === "checkers") return searchMove(checkers, v, s => checkerSteps(s, s.turn), checkerScore, G.cpu?.hard() ? 5 : 3, random);
    if (id === "mancala") return searchMove(mancala, v, mancalaMoves, (s, me) => {
      if (s.done) return s.winners.length > 1 ? 0 : s.winners[0] === me ? 10000 : -10000;
      return (s.pits[me * 7 + 6] - s.pits[(1 - me) * 7 + 6]) * 8 + s.pits.slice(me * 7, me * 7 + 6).reduce((a, b) => a + b, 0) - s.pits.slice((1 - me) * 7, (1 - me) * 7 + 6).reduce((a, b) => a + b, 0);
    }, G.cpu?.hard() ? 7 : 4, random);
    if (id === "dominoes") {
      const moves = dominoMoves(v);
      if (!moves.length) return { type: v.boneyardCount ? "draw" : "pass" };
      const options = moves.map(action => { const t = v.hand.find(tile => tile.id === action.tile); return { action, score: t.a + t.b + (t.a === t.b ? 3 : 0) }; });
      return pick(options.filter(o => o.score === Math.max(...options.map(item => item.score))), random).action;
    }
    if (id === "hex") {
      const empty = v.board.map((n, i) => n ? -1 : i).filter(i => i >= 0), me = v.me;
      for (const i of empty) { const board = [...v.board]; board[i] = me + 1; if (hexPath(board, me).length) return { type: "place", index: i }; }
      for (const i of empty) { const board = [...v.board]; board[i] = 2 - me; if (hexPath(board, 1 - me).length) return { type: "place", index: i }; }
      const options = empty.map(index => {
        const board = [...v.board]; board[index] = me + 1;
        const center = Math.abs(Math.floor(index / HEX) - 3) + Math.abs(index % HEX - 3);
        return { index, score: hexDistance(board, 1 - me) * 10 - hexDistance(board, me) * 12 - center * 0.3 + neighbors(index).filter(i => v.board[i] === me + 1).length * 0.25 };
      });
      return { type: "place", index: pick(options.filter(o => o.score === Math.max(...options.map(item => item.score))), random).index };
    }
    if (id === "nim") {
      const total = v.piles.reduce((a, b) => a + b, 0), options = v.piles.flatMap((n, pile) => Array.from({ length: n }, (_, i) => ({ type: "take", pile, count: i + 1 })));
      const last = options.find(a => a.count === total); if (last) return last;
      if (v.players.length === 2) { const xor = v.piles.reduce((a, b) => a ^ b, 0), winning = options.filter(a => (xor ^ v.piles[a.pile] ^ (v.piles[a.pile] - a.count)) === 0); if (winning.length) return pick(winning, random); }
      return pick(options.filter(a => total - a.count > 1), random) || options[0];
    }
    return null;
  }
  G.strategyCPU = Object.freeze({ choose });
  const entries = [
    ["checkers", "Checkers", "Jump, capture, and crown your way across the board.", "Dice & board", "Vs computer", "10 min", "♛", "coral"],
    ["mancala", "Mancala", "Sow a little strategy. Bring every stone home.", "Dice & board", "Vs computer", "5 min", "◌", "amber"],
    ["dominoes", "Dominoes", "Find a match. Build the chain. Empty your hand.", "Dice & board", "Vs computer", "10 min", "⚁", "mint"],
    ["hex", "Hex", "Two colors. Two edges. One beautiful connection.", "Dice & board", "Vs computer", "5 min", "⬡", "sky"],
    ["nim", "Nim", "Take a few. Think ahead. The last stone wins.", "Dice & board", "Vs computer", "3 min", "⋮", "lavender"]
  ];
  for (const [id] of entries) R.games[id].spectatorView = s => R.games[id].view(s, -1);
  G.expansionCatalog = [...(G.expansionCatalog || []), ...entries];
  G.cpuIds = [...new Set([...(G.cpuIds || []), ...entries.map(e => e[0])])];
  for (const [id] of entries) {
    const engine = R.games[id];
    G.register(id, {
      rules: engine.rules,
      note: "Practice with the computer offline, or open a room to challenge friends. The computer uses only its own view of the game.",
      mount(root) {
        let state = engine.create([{ id: "you", name: "You" }, { id: "cpu", name: "Computer" }]), timer = null, disposed = false;
        const render = () => { if (!disposed) root.innerHTML = `<div class="cpu-mode"><span class="room-badge">OFFLINE · VS COMPUTER</span><p class="cpu-state muted" role="status">${state.done ? "Round complete. Start a new game for a rematch." : state.turn === 0 ? "Your move. Take your time." : "Computer is thinking…"}</p></div><div class="strategy-game">${engine.render(engine.view(state, 0))}</div>`; };
        const apply = (p, a) => { const next = copy(state); if (!engine.act(next, p, a)) return false; state = next; return true; };
        function schedule() {
          if (disposed || timer !== null || state.done || state.turn !== 1) return;
          timer = setTimeout(() => {
            timer = null; if (disposed) return;
            const base = () => choose(id, engine.view(state, 1));
            const action = G.cpu ? G.cpu.decide(engine, state, 1, base) : base();
            if (action) apply(1, action);
            render(); schedule();
          }, 500);
        }
        root.onclick = event => {
          const button = event.target.closest("[data-move]");
          if (disposed || !button || !root.contains(button) || button.disabled) return;
          const action = { ...button.dataset, type: button.dataset.move }; delete action.move;
          if (apply(0, action)) { render(); schedule(); }
        };
        render();
        return () => { disposed = true; clearTimeout(timer); timer = null; root.onclick = null; };
      }
    });
  }
})();
