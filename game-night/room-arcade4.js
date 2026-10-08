"use strict";
// Arcade Night, part 4: classic board & card games — Race Home, Chip Showdown and Slides & Ladders.
(() => {
  const K = window.ArcadeKit, G = window.GameNight, esc = G.esc;
  const { rnd, shuffled, int, seat, nameOf, everyone, base, publicBase, btn, note, scoreStrip, finalBoard, hostTools, roundBadge, shell, reg, pawn } = K;
  const die = (n) => `<span class="ax-die ax-die-${n}" aria-label="Rolled ${n}">${"⚀⚁⚂⚃⚄⚅"[n - 1] || "🎲"}</span>`;
  const COLORS = ["#ff6b8b", "#4fb8ff", "#ffc93c", "#5fd68a", "#b58cff", "#ff9f5a"];

  /* ── 8. Race Home — four tokens, one six to get out ─────────────── */
  // Standard 15×15 cross board. PATH holds the 52 shared squares; each colour enters at 13·slot.
  const PATH = (() => {
    const p = [], seg = (pts) => p.push(...pts);
    const run = (x0, y0, dx, dy, k) => Array.from({ length: k }, (_, i) => [x0 + dx * i, y0 + dy * i]);
    seg(run(1, 6, 1, 0, 5)); seg(run(6, 5, 0, -1, 6)); seg([[7, 0]]); seg(run(8, 0, 0, 1, 6));
    seg(run(9, 6, 1, 0, 6)); seg([[14, 7]]); seg(run(14, 8, -1, 0, 6)); seg(run(8, 9, 0, 1, 6));
    seg([[7, 14]]); seg(run(6, 14, 0, -1, 6)); seg(run(5, 8, -1, 0, 6)); seg([[0, 7]]); seg([[0, 6]]);
    return p;
  })();
  const HOME_COL = [(k) => [1 + k, 7], (k) => [7, 1 + k], (k) => [13 - k, 7], (k) => [7, 13 - k]];
  const BASE_AT = [[1.5, 1.5], [10.5, 1.5], [10.5, 10.5], [1.5, 10.5]];
  const SAFE = new Set([0, 8, 13, 21, 26, 34, 39, 47]);
  const RH_FINISH = 56; // progress: -1 base, 0–50 track, 51–55 home column, 56 home
  const slotOf = (s, p) => s.players.length === 2 ? [0, 2][p] : p;
  const absOf = (s, p, prog) => (slotOf(s, p) * 13 + prog) % 52;
  function rhTarget(s, p, t, roll) {
    const prog = s.tokens[p][t];
    if (prog === RH_FINISH) return null;
    if (prog === -1) return roll === 6 ? 0 : null;
    const to = prog + roll;
    return to > RH_FINISH ? null : to;
  }
  const rhMoves = (s, p, roll) => [0, 1, 2, 3].filter((t) => rhTarget(s, p, t, roll) !== null);
  function rhNext(s, again) {
    if (again) { s.stage = "roll"; s.message = `${nameOf(s, s.turn)} rolls again!`; return; }
    s.turn = (s.turn + 1) % s.players.length; s.sixes = 0; s.stage = "roll"; s.roll = 0;
    s.message = `${nameOf(s, s.turn)}'s turn to roll.`;
  }
  function rhMove(s, p, t) {
    const roll = s.roll, to = rhTarget(s, p, t, roll);
    s.tokens[p][t] = to;
    let captured = false;
    if (to <= 50) {
      const sq = absOf(s, p, to);
      if (!SAFE.has(sq)) everyone(s).forEach((o) => { if (o !== p) s.tokens[o].forEach((pr, k) => { if (pr >= 0 && pr <= 50 && absOf(s, o, pr) === sq) { s.tokens[o][k] = -1; captured = true; s.log.unshift(`${nameOf(s, p)} sent ${nameOf(s, o)} back to base!`); } }); });
    }
    if (to === RH_FINISH) s.log.unshift(`${nameOf(s, p)} got a token home! 🏠`);
    s.scores = everyone(s).map((i) => s.tokens[i].filter((x) => x === RH_FINISH).length);
    if (s.tokens[p].every((x) => x === RH_FINISH)) { s.done = true; s.phase = "done"; s.winners = [p]; s.turn = -1; s.message = `${nameOf(s, p)} brought everyone home and wins!`; return; }
    rhNext(s, roll === 6 || captured || to === RH_FINISH);
  }
  function rhBoard(v) {
    const C = 40, cell = (x, y, fill, extra = "") => `<rect x="${x * C}" y="${y * C}" width="${C}" height="${C}" rx="7" fill="${fill}" ${extra}/>`;
    let svg = `<rect width="600" height="600" rx="28" fill="var(--ax-board, #fff8ec)"/>`;
    v.slots.forEach((slot, p) => { const [bx, by] = BASE_AT[slot]; svg += `<rect x="${(bx - 1.5) * C + 4}" y="${(by - 1.5) * C + 4}" width="${6 * C - 8}" height="${6 * C - 8}" rx="26" fill="${COLORS[p]}" opacity=".9"/><rect x="${(bx - 0.5) * C}" y="${(by - 0.5) * C}" width="${4 * C - 40}" height="${4 * C - 40}" rx="20" fill="#fff" opacity=".85"/>`; });
    PATH.forEach(([x, y], i) => { const owner = v.slots.indexOf(Math.floor(i / 13)); svg += cell(x, y, i % 13 === 0 && owner >= 0 ? COLORS[owner] : "#ffffff", `stroke="#e6d8c3" stroke-width="2"`); if (SAFE.has(i)) svg += `<text x="${x * C + 20}" y="${y * C + 27}" text-anchor="middle" font-size="18" opacity=".55">★</text>`; });
    v.slots.forEach((slot, p) => { for (let k = 0; k < 5; k++) { const [x, y] = HOME_COL[slot](k); svg += cell(x, y, COLORS[p], `opacity=".75"`); } });
    svg += `<polygon points="240,240 360,240 300,300" fill="${COLORS[v.slots.indexOf(1)] || "#eee"}"/><polygon points="360,240 360,360 300,300" fill="${COLORS[v.slots.indexOf(2)] || "#eee"}"/><polygon points="360,360 240,360 300,300" fill="${COLORS[v.slots.indexOf(3)] || "#eee"}"/><polygon points="240,360 240,240 300,300" fill="${COLORS[v.slots.indexOf(0)] || "#eee"}"/>`;
    // Tokens (stacked tokens fan out slightly).
    const seen = new Map();
    v.tokens.forEach((list, p) => list.forEach((prog, t) => {
      const slot = v.slots[p]; let x, y;
      if (prog === -1) { const [bx, by] = BASE_AT[slot]; x = (bx + (t % 2) * 2) * C; y = (by + Math.floor(t / 2) * 2) * C; }
      else if (prog === RH_FINISH) { x = 300 + [-24, 24, 0, 0][slot]; y = 300 + [0, 0, 24, -24][slot] + (t - 1.5) * 4; }
      else { const [cx, cy] = prog <= 50 ? PATH[(slot * 13 + prog) % 52] : HOME_COL[slot](prog - 51); x = cx * C + 20; y = cy * C + 20; }
      const k = `${Math.round(x)},${Math.round(y)}`, nth = seen.get(k) || 0; seen.set(k, nth + 1);
      const movable = v.movable.includes(t) && p === v.self;
      svg += `<g class="ax-token ${movable ? "is-movable" : ""}" transform="translate(${x + nth * 6},${y - nth * 6})"><circle r="15" fill="${COLORS[p]}" stroke="#2c2340" stroke-width="3"/><text y="5" text-anchor="middle" font-size="14" font-weight="800" fill="#2c2340">${t + 1}</text></g>`;
    }));
    return `<svg class="ax-ludo" viewBox="0 0 600 600" role="img" aria-label="Race Home board">${svg}</svg>`;
  }
  reg("race-home", {
    title: "Race Home", min: 2, max: 4,
    rules: "<ol><li>Roll a 6 to bring a token out of your base. Race all four around the board and up your coloured lane.</li><li>Land on a rival to send them back to base — except on ★ safe squares.</li><li>A 6, a capture or getting a token home earns another roll. Three 6s in a row and your turn is over.</li><li>You need the exact number to get home. First to bring all four home wins.</li></ol>",
    create(players) { const s = base(players, 2, 4, { phase: "play", turn: 0, stage: "roll", roll: 0, sixes: 0, log: [] }); s.tokens = s.players.map(() => [-1, -1, -1, -1]); s.message = `${nameOf(s, 0)} rolls first.`; return s; },
    act(s, p, a) {
      if (!seat(s, p) || s.done || p !== s.turn) return false;
      if (a.type === "roll" && s.stage === "roll") {
        s.roll = 1 + rnd(6);
        s.sixes = s.roll === 6 ? s.sixes + 1 : 0;
        if (s.sixes === 3) { s.log.unshift(`${nameOf(s, p)} rolled three 6s — turn over!`); rhNext(s, false); return true; }
        const moves = rhMoves(s, p, s.roll);
        if (!moves.length) { s.log.unshift(`${nameOf(s, p)} rolled ${s.roll} — no moves.`); rhNext(s, s.roll === 6); return true; }
        if (moves.length === 1 || moves.every((t) => s.tokens[p][t] === s.tokens[p][moves[0]])) { rhMove(s, p, moves[0]); return true; }
        s.stage = "move"; s.message = `${nameOf(s, p)} rolled ${s.roll}. Pick a token to move.`;
        return true;
      }
      if (a.type === "move" && s.stage === "move") {
        const t = int(a.token, 0, 3); if (t === null || !rhMoves(s, p, s.roll).includes(t)) return false;
        rhMove(s, p, t); return true;
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer);
      return { ...v, tokens: s.tokens.map((l) => [...l]), slots: everyone(s).map((p) => slotOf(s, p)), stage: s.stage, roll: s.roll, log: s.log.slice(0, 5), movable: s.stage === "move" && viewer === s.turn ? rhMoves(s, viewer, s.roll) : [] };
    },
    render(v) {
      let body = scoreStrip(v, v.players.map((_, i) => `<i class="ax-dot" style="background:${COLORS[i]}"></i>`), { text: v.tokens.map((l) => `${l.filter((x) => x === RH_FINISH).length}/4 🏠`) });
      body += `<div class="ax-boardwrap">${rhBoard(v)}</div>`;
      if (!v.done) {
        body += `<div class="ax-dicebar">${v.roll ? die(v.roll) : die(0)}<strong>${v.turn === v.self ? (v.stage === "roll" ? "Your roll!" : "Pick a token") : `${esc(v.players[v.turn].name)}'s turn`}</strong></div>`;
        if (v.self === v.turn && v.stage === "roll") body += `<div class="pn-form">${btn("🎲 Roll", "roll", "", false, "ax-bigbtn")}</div>`;
        if (v.movable.length) body += `<div class="ax-moves">${v.movable.map((t) => { const pr = v.tokens[v.self][t]; return btn(`Token ${t + 1} · ${pr === -1 ? "leave base" : pr > 50 ? "home lane" : `square ${pr + 1}`}`, "move", `data-token="${t}"`, false, "secondary"); }).join("")}</div>`;
      }
      if (v.log.length) body += `<ul class="ax-log">${v.log.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
      return shell("ludo", v, body + finalBoard(v, false, "Tokens home"));
    },
  });

  /* ── 9. Chip Showdown — Texas hold'em ───────────────────────────── */
  const BLINDS = [[10, 20], [15, 30], [25, 50], [50, 100], [75, 150], [100, 200], [150, 300], [250, 500], [500, 1000]];
  const HANDS_PER_LEVEL = 6, START_CHIPS = 1000;
  const HAND_NAMES = ["High card", "Pair", "Two pair", "Three of a kind", "Straight", "Flush", "Full house", "Four of a kind", "Straight flush"];
  const hi = (c) => c.rank === 1 ? 14 : c.rank;
  function eval5(cards) {
    const r = cards.map(hi).sort((a, b) => b - a), counts = new Map();
    r.forEach((x) => counts.set(x, (counts.get(x) || 0) + 1));
    const groups = [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
    const flush = cards.every((c) => c.suit === cards[0].suit);
    const uniq = [...new Set(r)]; let straight = 0;
    if (uniq.length === 5) { if (r[0] - r[4] === 4) straight = r[0]; else if (r[0] === 14 && r[1] === 5) straight = 5; }
    if (straight && flush) return [8, straight];
    if (groups[0][1] === 4) return [7, groups[0][0], groups[1][0]];
    if (groups[0][1] === 3 && groups[1][1] === 2) return [6, groups[0][0], groups[1][0]];
    if (flush) return [5, ...r];
    if (straight) return [4, straight];
    if (groups[0][1] === 3) return [3, ...groups.map((g) => g[0])];
    if (groups[0][1] === 2 && groups[1][1] === 2) return [2, ...groups.map((g) => g[0])];
    if (groups[0][1] === 2) return [1, ...groups.map((g) => g[0])];
    return [0, ...r];
  }
  const cmp = (a, b) => { for (let i = 0; i < Math.max(a.length, b.length); i++) { const d = (a[i] || 0) - (b[i] || 0); if (d) return d; } return 0; };
  function best7(cards) {
    let best = null;
    for (let a = 0; a < cards.length; a++) for (let b = a + 1; b < cards.length; b++) {
      const five = cards.filter((_, i) => i !== a && i !== b), sc = eval5(five);
      if (!best || cmp(sc, best) > 0) best = sc;
    }
    return best;
  }
  const inHand = (s) => everyone(s).filter((i) => s.inHand[i]);
  const contenders = (s) => inHand(s).filter((i) => !s.folded[i]);
  const canAct = (s) => contenders(s).filter((i) => s.chips[i] > 0);
  const nextFrom = (s, from, ok) => { const n = s.players.length; for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (ok(i)) return i; } return -1; };
  function csPost(s, p, amt) { const x = Math.min(amt, s.chips[p]); s.chips[p] -= x; s.bet[p] += x; s.put[p] += x; return x; }
  function csHand(s) {
    const alive = everyone(s).filter((i) => s.chips[i] > 0);
    if (alive.length <= 1) return csFinish(s);
    s.handNo++;
    const lvl = BLINDS[Math.min(BLINDS.length - 1, Math.floor((s.handNo - 1) / HANDS_PER_LEVEL))];
    s.inHand = s.players.map((_, i) => s.chips[i] > 0);
    s.folded = s.players.map(() => false); s.bet = s.players.map(() => 0); s.put = s.players.map(() => 0); s.acted = s.players.map(() => false);
    s.dealer = nextFrom(s, s.dealer, (i) => s.inHand[i]);
    const deck = G.deck(); s.hole = s.players.map((_, i) => s.inHand[i] ? [deck.pop(), deck.pop()] : []); s.deck = deck; s.board = [];
    const heads = alive.length === 2, sb = heads ? s.dealer : nextFrom(s, s.dealer, (i) => s.inHand[i]), bb = nextFrom(s, sb, (i) => s.inHand[i]);
    csPost(s, sb, lvl[0]); csPost(s, bb, lvl[1]);
    Object.assign(s, { blinds: lvl, street: 0, curBet: lvl[1], minRaise: lvl[1], stage: "bet", shown: null, results: [], sb, bb });
    s.turn = nextFrom(s, bb, (i) => s.inHand[i] && !s.folded[i] && s.chips[i] > 0);
    s.message = `Hand ${s.handNo}. Blinds ${lvl[0]}/${lvl[1]}. ${nameOf(s, s.turn)} to act.`;
    if (s.turn === -1 || csRoundOver(s)) csAdvance(s);
  }
  function csRoundOver(s) {
    if (contenders(s).length <= 1) return true;
    const act = canAct(s);
    if (act.length === 0) return true;
    if (act.length === 1) return s.bet[act[0]] >= s.curBet;
    return act.every((i) => s.acted[i] && s.bet[i] === s.curBet);
  }
  function csAdvance(s) {
    if (contenders(s).length <= 1) return csShowdown(s);
    if (s.street === 3 || canAct(s).length <= 1) {
      while (s.board.length < 5) { s.deck.pop(); s.board.push(s.deck.pop()); }
      return csShowdown(s);
    }
    s.street++; s.deck.pop();
    for (let k = s.street === 1 ? 3 : 1; k > 0; k--) s.board.push(s.deck.pop());
    s.bet = s.players.map(() => 0); s.curBet = 0; s.minRaise = s.blinds[1]; s.acted = s.players.map(() => false);
    s.turn = nextFrom(s, s.dealer, (i) => s.inHand[i] && !s.folded[i] && s.chips[i] > 0);
    s.message = `${["", "The flop", "The turn", "The river"][s.street]}. ${nameOf(s, s.turn)} to act.`;
  }
  function csShowdown(s) {
    const live = contenders(s), shown = live.length > 1;
    const score = s.players.map((_, i) => shown && live.includes(i) ? best7([...s.hole[i], ...s.board]) : null);
    const levels = [...new Set(inHand(s).map((i) => s.put[i]).filter((x) => x > 0))].sort((a, b) => a - b);
    const won = s.players.map(() => 0); let prev = 0, carry = 0;
    for (const lvl of levels) {
      let pot = carry; everyone(s).forEach((i) => { pot += Math.max(0, Math.min(s.put[i], lvl) - prev); });
      const elig = live.filter((i) => s.put[i] >= lvl);
      if (!elig.length) { carry = pot; prev = lvl; continue; }
      carry = 0;
      let winners = elig;
      if (shown) { const top = elig.reduce((b, i) => !b.length || cmp(score[i], score[b[0]]) > 0 ? [i] : cmp(score[i], score[b[0]]) === 0 ? [...b, i] : b, []); winners = top; }
      const share = Math.floor(pot / winners.length); let rest = pot - share * winners.length;
      winners.forEach((i) => { won[i] += share; });
      for (let k = 1; rest > 0; k++) { const i = (s.dealer + k) % s.players.length; if (winners.includes(i)) { won[i]++; rest--; } }
      prev = lvl;
    }
    if (carry) { const w = live.length ? live[0] : s.dealer; won[w] += carry; }
    everyone(s).forEach((i) => { s.chips[i] += won[i]; });
    s.results = everyone(s).filter((i) => won[i] > 0).map((i) => ({ seat: i, won: won[i], hand: score[i] ? HAND_NAMES[score[i][0]] : "" }));
    s.shown = shown ? live : [];
    s.message = s.results.map((r) => `${nameOf(s, r.seat)} wins ${r.won}${r.hand ? ` with ${r.hand.toLowerCase()}` : ""}`).join(" · ") + ".";
    s.stage = "showdown"; s.turn = -1; s.nextAt = Date.now() + (shown ? 7000 : 3500);
    s.scores = [...s.chips];
  }
  function csFinish(s) {
    s.scores = [...s.chips]; const top = Math.max(...s.chips);
    s.winners = everyone(s).filter((i) => s.chips[i] === top); s.done = true; s.phase = "done"; s.stage = "done"; s.turn = -1;
    s.message = s.winners.length === 1 ? `${nameOf(s, s.winners[0])} takes the table with ${top} chips!` : `${s.winners.map((i) => nameOf(s, i)).join(" & ")} split the table!`;
  }
  function csAfterAction(s, p) {
    s.acted[p] = true;
    if (csRoundOver(s)) return csAdvance(s);
    s.turn = nextFrom(s, p, (i) => s.inHand[i] && !s.folded[i] && s.chips[i] > 0);
    if (s.turn === -1) csAdvance(s);
  }
  reg("chip-showdown", {
    title: "Chip Showdown", min: 2, max: 8, concurrentActions: ["deal"],
    rules: "<ol><li>Texas hold'em. Everyone starts with 1,000 chips; blinds go up every few hands.</li><li>You get two private cards; five shared cards come out over the flop, turn and river.</li><li>Fold, check, call, raise or go all-in. Best five-card hand at showdown wins the pot (side pots are handled for you).</li><li>Last player with chips wins — or the host can cash out and the biggest stack wins.</li></ol>",
    create(players) {
      const s = base(players, 2, 8, { phase: "play", handNo: 0, dealer: players.length - 1, chips: players.map(() => START_CHIPS), log: [] });
      s.scores = [...s.chips]; csHand(s); return s;
    },
    tick(s, now) { if (s.stage === "showdown" && now >= s.nextAt) { csHand(s); return true; } return false; },
    act(s, p, a) {
      if (!seat(s, p) || s.done) return false;
      if (a.type === "deal" && s.stage === "showdown") { csHand(s); return true; }
      if (a.type === "cashout" && p === 0) { csFinish(s); return true; }
      if (a.type === "force" && p === 0 && s.stage === "bet") { const t = s.turn; if (s.bet[t] < s.curBet) s.folded[t] = true; s.log.unshift(`${nameOf(s, t)} ${s.folded[t] ? "folded" : "checked"} (host).`); csAfterAction(s, t); return true; }
      if (s.stage !== "bet" || p !== s.turn) return false;
      const owe = s.curBet - s.bet[p];
      if (a.type === "fold") { s.folded[p] = true; s.log.unshift(`${nameOf(s, p)} folds.`); csAfterAction(s, p); return true; }
      if (a.type === "check") { if (owe > 0) return false; s.log.unshift(`${nameOf(s, p)} checks.`); csAfterAction(s, p); return true; }
      if (a.type === "call") { if (owe <= 0) return false; const x = csPost(s, p, owe); s.log.unshift(`${nameOf(s, p)} calls ${x}${s.chips[p] === 0 ? " (all-in)" : ""}.`); csAfterAction(s, p); return true; }
      if (a.type === "raise" || a.type === "allin") {
        const max = s.bet[p] + s.chips[p];
        let to = a.type === "allin" ? max : int(a.amount, 1, 1e9);
        if (to === null || to > max || to <= s.curBet) return false;
        const full = to - s.curBet >= s.minRaise;
        if (!full && to !== max) return false;
        csPost(s, p, to - s.bet[p]);
        if (full) { s.minRaise = to - s.curBet; s.acted = s.acted.map((x, i) => i === p ? x : false); }
        s.curBet = Math.max(s.curBet, to);
        s.log.unshift(`${nameOf(s, p)} ${s.chips[p] === 0 ? "goes all-in for" : "raises to"} ${to}.`);
        csAfterAction(s, p); return true;
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self, showAll = s.stage === "showdown" || s.done;
      return {
        ...v, stage: s.stage, chips: [...s.chips], bet: [...s.bet], folded: [...s.folded], inHand: [...s.inHand], dealer: s.dealer, board: [...s.board], blinds: s.blinds, handNo: s.handNo, results: s.results, log: s.log.slice(0, 5),
        pot: s.put.reduce((a, b) => a + b, 0), curBet: s.curBet, minRaise: s.minRaise, nextIn: s.stage === "showdown" ? s.nextAt - Date.now() : 0,
        hole: s.hole.map((h, i) => i === me || (showAll && s.shown?.includes(i)) ? h : h.map(() => null)),
        best: me >= 0 && s.hole[me]?.length && s.board.length >= 3 ? HAND_NAMES[best7([...s.hole[me], ...s.board])[0]] : "",
      };
    },
    render(v) {
      const me = v.self, cardHtml = (c) => c ? G.card(c, "tabindex=-1", "ax-card") : G.back("", "tabindex=-1");
      let body = scoreStrip(v, v.players.map((_, i) => [i === v.dealer ? "Ⓓ" : "", v.folded[i] ? "fold" : v.bet[i] ? `bet ${v.bet[i]}` : ""].filter(Boolean).join(" ")), { text: v.chips, out: v.chips.map((c, i) => c === 0 && !v.inHand[i]) });
      body += `<div class="ax-felt"><div class="ax-pot">Pot <b>${v.pot}</b><small>Blinds ${v.blinds[0]}/${v.blinds[1]} · hand ${v.handNo}</small></div><div class="ax-board-cards">${[0, 1, 2, 3, 4].map((k) => v.board[k] ? cardHtml(v.board[k]) : `<span class="ax-card-slot"></span>`).join("")}</div></div>`;
      body += `<div class="ax-hands">${v.players.map((p, i) => v.hole[i]?.length ? `<div class="ax-seat ${i === v.turn ? "is-turn" : ""} ${v.folded[i] ? "is-out" : ""} ${i === me ? "is-me" : ""} ${v.results.some((r) => r.seat === i) ? "is-win" : ""}">${pawn(i, p.name)}<strong>${esc(p.name)}</strong><div class="ax-hand">${v.hole[i].map(cardHtml).join("")}</div></div>` : "").join("")}</div>`;
      if (v.best) body += note(`You have: <strong>${v.best}</strong>`);
      if (!v.done && v.stage === "bet" && me === v.turn) {
        const owe = v.curBet - v.bet[me], max = v.bet[me] + v.chips[me], minTo = Math.min(max, v.curBet + v.minRaise);
        body += `<div class="ax-actions">${btn("Fold", "fold", "", false, "ghost")}${owe > 0 ? btn(`Call ${Math.min(owe, v.chips[me])}`, "call") : btn("Check", "check")}${max > v.curBet && minTo < max ? `<label class="pn-field ax-raise"><span>Raise to <output data-value-for="amount">${minTo}</output></span><input type="range" data-field="amount" min="${minTo}" max="${max}" step="${v.blinds[0]}" value="${minTo}"></label>${btn("Raise", "raise", "", false, "secondary")}` : ""}${max > v.curBet ? btn(`All-in ${max}`, "allin", "", false, "secondary") : ""}</div>`;
      } else if (!v.done && v.stage === "bet") body += note(`${esc(v.players[v.turn].name)} is thinking…`);
      if (v.stage === "showdown") body += `<div class="pn-form">${btn("Deal next hand", "deal", "", false, "secondary")}<span class="pn-note">Next hand in <span data-countdown="${Math.max(0, Math.round(v.nextIn))}">${Math.ceil(Math.max(0, v.nextIn) / 1000)}</span>s</span></div>`;
      body += hostTools(v, `${v.stage === "bet" ? btn("Fold/check for the player on the clock", "force", "", false, "secondary small") : ""}${btn("Cash out — biggest stack wins", "cashout", "", false, "secondary small")}`);
      if (v.log.length) body += `<ul class="ax-log">${v.log.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
      return shell("poker", v, body + finalBoard({ ...v, scores: v.chips }, false, "Chip counts"));
    },
  });

  /* ── 10. Slides & Ladders — roll, climb, slide, bounce ──────────── */
  const JUMPS = { 4: 25, 13: 46, 33: 49, 42: 63, 50: 69, 62: 81, 74: 92, 27: 5, 40: 3, 43: 18, 54: 31, 66: 45, 76: 58, 89: 53, 95: 72, 99: 41 };
  const cellXY = (n) => { const r = Math.floor((n - 1) / 10), c = (n - 1) % 10; return [(r % 2 ? 9 - c : c) * 60 + 30, (9 - r) * 60 + 30]; };
  function slBoard(v) {
    let svg = "";
    for (let n = 1; n <= 100; n++) { const [x, y] = cellXY(n); svg += `<rect x="${x - 30}" y="${y - 30}" width="60" height="60" fill="${(Math.floor((n - 1) / 10) + n) % 2 ? "#fff3d6" : "#ffe1ec"}"/><text x="${x - 24}" y="${y - 16}" font-size="13" font-weight="700" fill="#8a7a9a">${n}</text>`; }
    for (const [from, to] of Object.entries(JUMPS)) {
      const [x1, y1] = cellXY(+from), [x2, y2] = cellXY(to);
      if (to > from) { const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy), nx = (-dy / len) * 9, ny = (dx / len) * 9, rungs = Math.max(2, Math.floor(len / 26)); svg += `<g class="ax-ladder"><line x1="${x1 + nx}" y1="${y1 + ny}" x2="${x2 + nx}" y2="${y2 + ny}"/><line x1="${x1 - nx}" y1="${y1 - ny}" x2="${x2 - nx}" y2="${y2 - ny}"/>${Array.from({ length: rungs }, (_, k) => { const t = (k + 0.5) / rungs; return `<line x1="${x1 + dx * t + nx}" y1="${y1 + dy * t + ny}" x2="${x1 + dx * t - nx}" y2="${y1 + dy * t - ny}"/>`; }).join("")}</g>`; }
      else { const mx = (x1 + x2) / 2 + (y2 - y1) * 0.25, my = (y1 + y2) / 2 - (x2 - x1) * 0.25; svg += `<path class="ax-slide" d="M${x1},${y1} Q${mx},${my} ${x2},${y2}"/><circle cx="${x1}" cy="${y1}" r="7" class="ax-slide-top"/>`; }
    }
    v.pos.forEach((n, p) => { if (n < 1) return; const [x, y] = cellXY(n); svg += `<circle class="ax-piece" cx="${x - 12 + (p % 3) * 12}" cy="${y + 6 + Math.floor(p / 3) * 10}" r="10" fill="${COLORS[p]}" stroke="#2c2340" stroke-width="3"/>`; });
    return `<svg class="ax-snakes" viewBox="0 0 600 600" role="img" aria-label="Slides and Ladders board"><rect width="600" height="600" rx="22" fill="#fff"/>${svg}</svg>`;
  }
  function slStep(s, p) {
    let to = s.pos[p] + s.roll; const notes = [];
    if (to > 100) { to = 200 - to; notes.push("bounced off 100"); }
    if (JUMPS[to]) { notes.push(JUMPS[to] > to ? `climbed a ladder to ${JUMPS[to]}` : `slid down to ${JUMPS[to]}`); to = JUMPS[to]; }
    s.pos[p] = to; s.scores = [...s.pos];
    s.log.unshift(`${nameOf(s, p)} rolled ${s.roll}${notes.length ? " and " + notes.join(", then ") : ""} → ${to}.`);
    if (to === 100) { s.done = true; s.phase = "done"; s.winners = [p]; s.turn = -1; s.message = `${nameOf(s, p)} reached 100 and wins!`; return; }
    s.turn = s.roll === 6 ? p : (p + 1) % s.players.length; s.stage = "roll";
    s.message = s.roll === 6 ? `A six! ${nameOf(s, p)} goes again.` : `${nameOf(s, s.turn)}'s turn.`;
  }
  reg("slides-ladders", {
    title: "Slides & Ladders", min: 2, max: 6,
    rules: "<ol><li>Roll and move. Land at the foot of a ladder to climb; land on top of a slide and down you go.</li><li>Everyone gets ONE reroll card per game — use it when you don't like a roll.</li><li>A 6 rolls again. You must land on 100 exactly; extra steps bounce you back.</li></ol>",
    create(players) { const s = base(players, 2, 6, { phase: "play", turn: 0, stage: "roll", roll: 0, log: [] }); s.pos = s.players.map(() => 0); s.rerolls = s.players.map(() => 1); s.message = `${nameOf(s, 0)} rolls first.`; return s; },
    act(s, p, a) {
      if (!seat(s, p) || s.done || p !== s.turn) return false;
      if (a.type === "roll" && s.stage === "roll") {
        s.roll = 1 + rnd(6);
        if (s.rerolls[p] > 0) { s.stage = "decide"; s.message = `${nameOf(s, p)} rolled ${s.roll}. Keep it or use the reroll card?`; }
        else slStep(s, p);
        return true;
      }
      if (a.type === "keep" && s.stage === "decide") { slStep(s, p); return true; }
      if (a.type === "reroll" && s.stage === "decide") { s.rerolls[p] = 0; s.roll = 1 + rnd(6); s.log.unshift(`${nameOf(s, p)} used the reroll card!`); slStep(s, p); return true; }
      return false;
    },
    view(s, viewer) { const v = publicBase(s, viewer); return { ...v, pos: [...s.pos], rerolls: [...s.rerolls], stage: s.stage, roll: s.roll, log: s.log.slice(0, 5) }; },
    render(v) {
      let body = scoreStrip(v, v.players.map((_, i) => `<i class="ax-dot" style="background:${COLORS[i]}"></i>${v.rerolls[i] ? "🔁" : ""}`), { text: v.pos.map((n) => n || "start") });
      body += `<div class="ax-boardwrap">${slBoard(v)}</div>`;
      if (!v.done) {
        body += `<div class="ax-dicebar">${die(v.roll)}<strong>${v.turn === v.self ? (v.stage === "decide" ? `You rolled ${v.roll}!` : "Your roll!") : `${esc(v.players[v.turn].name)}'s turn`}</strong></div>`;
        if (v.self === v.turn && v.stage === "roll") body += `<div class="pn-form">${btn("🎲 Roll", "roll", "", false, "ax-bigbtn")}</div>`;
        if (v.self === v.turn && v.stage === "decide") body += `<div class="ax-moves">${btn(`Move ${v.roll}`, "keep")}${btn("🔁 Use reroll card", "reroll", "", false, "secondary")}</div>`;
      }
      if (v.log.length) body += `<ul class="ax-log">${v.log.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
      return shell("snakes", v, body + finalBoard(v, false, "Squares reached"));
    },
  });
  /* ── Arcade Night shelf entries (front of the shelf: the newest boxes) ── */
  const catalog = [
    ["quick-draw", "Quick Draw", "Wait for green… TAP! Fastest fingers in the room win.", "Party", "2–8 online", "5 min", "⚡", "amber"],
    ["color-rush", "Color Rush", "The word says BLUE in red ink. Tap the ink, not the word!", "Party", "2–8 online", "5 min", "◑", "lavender"],
    ["hot-potato", "Hot Potato", "Grab the bomb, solve the tap, throw it on. Don't hold it when it pops!", "Party", "3–8 online", "10 min", "💣", "coral"],
    ["telephone-doodle", "Telephone Doodle", "Write, draw, guess, repeat — then laugh at how it went wrong.", "Party", "4–8 online", "15 min", "☎", "sky"],
    ["masterpiece", "Masterpiece Mayhem", "Same prompt, everyone draws. The gallery votes for the best.", "Party", "3–8 online", "15 min", "🎨", "mint"],
    ["wolf-pack", "Wolf Pack", "One night, secret roles, one vote. Is the wolf sitting next to you?", "Party", "3–8 online", "15 min", "🐺", "navy"],
    ["bluff-court", "Bluff Court", "Claim any role. Call any bluff. Last courtier standing wins.", "Cards", "2–6 online", "15 min", "♛", "coral"],
    ["chip-showdown", "Chip Showdown", "Texas hold'em with friends: blinds, bluffs and all-ins.", "Cards", "2–8 online", "30 min", "♠", "mint"],
    ["race-home", "Race Home", "Roll a six, race your four tokens home, bump your rivals back.", "Dice & board", "2–4 online", "25 min", "⚀", "amber"],
    ["slides-ladders", "Slides & Ladders", "Climb ladders, ride slides, save your reroll card for the end.", "Dice & board", "2–6 online", "10 min", "🪜", "sky"],
  ];
  G.expansionCatalog = [...catalog, ...(G.expansionCatalog || []).filter((e) => !catalog.some(([id]) => id === e[0]))];
  G.arcadeIds = catalog.map(([id]) => id);
})();
