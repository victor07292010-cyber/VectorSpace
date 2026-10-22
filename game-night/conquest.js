"use strict";
// Conquest — an original map-conquest strategy game for 2–6 players.
// Raise armies, roll dice across borders, take the whole map. Not affiliated with any commercial game.
(() => {
  const G = window.GameNight, R = window.RoomGames, esc = G.esc;
  const ID = "conquest";
  const copy = value => JSON.parse(JSON.stringify(value));
  const int = (value, lo, hi) => {
    if (!(typeof value === "number" || typeof value === "string" && /^\d{1,3}$/.test(value))) return null;
    const n = Number(value);
    return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };
  const shuffle = list => { for (let i = list.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [list[i], list[j]] = [list[j], list[i]]; } return list; };

  /* ─────────────── The map: the Hollow Sea archipelago ───────────────
     A ring of 26 territories around an inland sea. The cells come from a seeded
     Voronoi layout, so borders are irregular but the map is identical every game. */
  const W = 1000, H = 620, PAD = 44, COLS = 9, ROWS = 5, JITTER = 0.2;
  const MASK = ["..####...", ".###.###.", "###...###", ".###.###.", "..####..."];
  const NAMES = [
    "Gullhaven", "Frostgap", "Ashkeld", "Wren Point",
    "Kettleridge", "Brackwater", "Highmoor", "Cinderfall", "Larkspur", "Oxbow",
    "Dunmere", "Thistledown", "Marrow Bay", "Stonewash", "Ravenholt", "Quillmouth",
    "Fenwick", "Copperton", "Saltmarsh", "Windgate", "Emberly", "Rushcombe",
    "Cobbleford", "Pennyfold", "Tallow Reach", "Driftwood"
  ];
  const REGIONS = [
    { id: "north", name: "Northreach", bonus: 3, ids: [0, 1, 2, 3, 6, 7] },
    { id: "west", name: "Westerlands", bonus: 4, ids: [4, 5, 10, 11, 12, 16, 17] },
    { id: "east", name: "Eastwold", bonus: 4, ids: [8, 9, 13, 14, 15, 20, 21] },
    { id: "south", name: "Southfen", bonus: 3, ids: [18, 19, 22, 23, 24, 25] }
  ];
  const LANES = [[6, 7], [18, 19], [12, 13]]; // boats across the Hollow Sea
  const mulberry = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const mapRand = mulberry(20261022);

  function buildMap() {
    const cw = (W - 2 * PAD) / COLS, ch = (H - 2 * PAD) / ROWS, seeds = [];
    for (let r = -1; r <= ROWS; r++) for (let c = -1; c <= COLS; c++) {
      const land = r >= 0 && r < ROWS && c >= 0 && c < COLS && MASK[r][c] === "#";
      seeds.push({ land, x: PAD + (c + .5) * cw + (mapRand() - .5) * 2 * JITTER * cw, y: PAD + (r + .5) * ch + (mapRand() - .5) * 2 * JITTER * ch });
    }
    const landId = seeds.map(() => -1); let next = 0;
    seeds.forEach((s, i) => { if (s.land) landId[i] = next++; });
    // Clip a convex polygon to the half-plane closer to seed a than seed b. Each vertex keeps the label of the edge that follows it.
    const clip = (poly, a, b, label) => {
      const nx = b.x - a.x, ny = b.y - a.y, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2, f = p => (p.x - mx) * nx + (p.y - my) * ny, out = [];
      for (let k = 0; k < poly.length; k++) {
        const p = poly[k], q = poly[(k + 1) % poly.length], fp = f(p), fq = f(q);
        const cross = () => { const t = fp / (fp - fq); return { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t }; };
        if (fp <= 0) { out.push({ x: p.x, y: p.y, e: p.e }); if (fq > 0) out.push({ ...cross(), e: label }); }
        else if (fq <= 0) out.push({ ...cross(), e: p.e });
      }
      return out;
    };
    const territories = [];
    seeds.forEach((seed, i) => {
      if (!seed.land) return;
      let poly = [{ x: -600, y: -600, e: -1 }, { x: W + 600, y: -600, e: -1 }, { x: W + 600, y: H + 600, e: -1 }, { x: -600, y: H + 600, e: -1 }];
      seeds.forEach((other, j) => { if (j !== i) poly = clip(poly, seed, other, j); });
      let area = 0, cx = 0, cy = 0;
      poly.forEach((p, k) => { const q = poly[(k + 1) % poly.length], cr = p.x * q.y - q.x * p.y; area += cr; cx += (p.x + q.x) * cr; cy += (p.y + q.y) * cr; });
      area /= 2;
      territories.push({ id: landId[i], name: NAMES[landId[i]], poly, cx: cx / (6 * area), cy: cy / (6 * area), seed: i });
    });
    const N = territories.length;
    const regionOf = Array(N).fill(-1);
    REGIONS.forEach((region, r) => region.ids.forEach(id => { regionOf[id] = r; }));
    const adj = territories.map(() => new Set()), plain = [], border = [], coast = [];
    const fmt = n => Math.round(n * 10) / 10;
    territories.forEach(t => {
      const pts = [];
      t.poly.forEach((p, k) => {
        const q = t.poly[(k + 1) % t.poly.length], len = Math.hypot(q.x - p.x, q.y - p.y), j = p.e < 0 ? -1 : landId[p.e];
        pts.push([p.x, p.y]);
        if (p.e >= 0 && j < 0) { // coastline: cut it by hand, so the shore wanders
          const nx = -(q.y - p.y) / len, ny = (q.x - p.x) / len, o1 = (mapRand() - .5) * len * .2, o2 = (mapRand() - .5) * len * .2;
          const a = [p.x + (q.x - p.x) / 3 + nx * o1, p.y + (q.y - p.y) / 3 + ny * o1], b = [p.x + (q.x - p.x) * 2 / 3 + nx * o2, p.y + (q.y - p.y) * 2 / 3 + ny * o2];
          pts.push(a, b);
          coast.push(`M${fmt(p.x)} ${fmt(p.y)}L${fmt(a[0])} ${fmt(a[1])}L${fmt(b[0])} ${fmt(b[1])}L${fmt(q.x)} ${fmt(q.y)}`);
        } else if (j >= 0 && len >= 6) {
          adj[t.id].add(j);
          if (t.id < j) (regionOf[t.id] === regionOf[j] ? plain : border).push(`M${fmt(p.x)} ${fmt(p.y)}L${fmt(q.x)} ${fmt(q.y)}`);
        }
      });
      t.d = "M" + pts.map(([x, y]) => `${fmt(x)} ${fmt(y)}`).join("L") + "Z";
    });
    LANES.forEach(([a, b]) => { adj[a].add(b); adj[b].add(a); });
    return {
      territories, adj: adj.map(set => [...set].sort((a, b) => a - b)), regionOf,
      plain: plain.join(""), border: border.join(""), coast: coast.join("")
    };
  }
  const MAP = buildMap(), T = MAP.territories, ADJ = MAP.adj, N = T.length;
  const isLane = (a, b) => LANES.some(([x, y]) => x === a && y === b || x === b && y === a);
  const PALETTE = [
    { name: "Coral", chip: "#ef6b4f", dark: "#a4412c", tint: "#fbcfc2", line: "#f29b84" },
    { name: "Blue", chip: "#3f6fe0", dark: "#27449a", tint: "#c3d4f7", line: "#8fadee" },
    { name: "Gold", chip: "#f0b429", dark: "#a47612", tint: "#faeaa9", line: "#f1cf64" },
    { name: "Green", chip: "#2fa57b", dark: "#1c6a4f", tint: "#bde6d4", line: "#78cba9" },
    { name: "Violet", chip: "#8a63d2", dark: "#58399b", tint: "#dacdf2", line: "#b49be3" },
    { name: "Slate", chip: "#56657a", dark: "#333f50", tint: "#d8dee7", line: "#a5b0c0" }
  ];

  /* ─────────────── Rules ─────────────── */
  const START = { 2: 30, 3: 24, 4: 20, 5: 17, 6: 15 };
  const ROUND_CAP = 30;
  const KINDS = ["inf", "cav", "can"], KIND_NAME = { inf: "Infantry", cav: "Cavalry", can: "Cannon" };
  const TRADE = [4, 6, 8, 10, 12, 15];
  const tradeValue = n => n < TRADE.length ? TRADE[n] : 15 + 5 * (n - TRADE.length + 1);
  const count = (list, fn) => list.reduce((n, x, i) => n + (fn(x, i) ? 1 : 0), 0);
  const holdings = (s, p) => count(s.own, o => o === p);
  const armiesOf = (s, p) => s.own.reduce((n, o, i) => n + (o === p ? s.arm[i] : 0), 0);
  const regionBonuses = (s, p) => REGIONS.reduce((n, r) => n + (r.ids.every(i => s.own[i] === p) ? r.bonus : 0), 0);
  const income = (s, p) => Math.max(3, Math.floor(holdings(s, p) / 3)) + regionBonuses(s, p);
  const handSize = (s, p) => s.cards ? s.cards[p].length : p === s.me ? s.hand.length : 0; // engine state or a player's view
  const mustTrade = (s, p) => handSize(s, p) >= 5;
  const handCounts = hand => ({ inf: count(hand, k => k === "inf"), cav: count(hand, k => k === "cav"), can: count(hand, k => k === "can") });
  const tradeSets = hand => {
    const c = handCounts(hand), out = KINDS.filter(k => c[k] >= 3);
    if (KINDS.every(k => c[k] >= 1)) out.push("mix");
    return out;
  };
  function reach(s, p, from) { // every territory the player can walk to through their own land
    const seen = new Set([from]), queue = [from];
    while (queue.length) for (const n of ADJ[queue.shift()]) if (s.own[n] === p && !seen.has(n)) { seen.add(n); queue.push(n); }
    return seen;
  }
  const say = (s, text) => { s.message = text; s.log.push(text); if (s.log.length > 7) s.log.shift(); };
  const nameOf = (s, p) => s.players[p].name;
  const verb = (s, p, you, other) => nameOf(s, p) === "You" ? you : other; // "You go" / "Ana goes"
  const finish = (s, winners, reason = "") => {
    s.done = true; s.phase = "done"; s.winners = winners; s.sel = -1; s.fort = null; s.occ = null;
    s.message = `${winners.map(p => nameOf(s, p)).join(" & ")}${winners.length > 1 ? " draw!" : " wins!"}${reason ? " " + reason : ""}`;
    s.log.push(s.message); if (s.log.length > 7) s.log.shift();
  };

  // Which kind of tap would this territory accept right now? The same answer drives the rules and the highlights.
  function tapKind(s, p, t, reachable) {
    if (s.done || p !== s.turn || !Number.isInteger(t) || t < 0 || t >= N) return null;
    const mine = s.own[t] === p;
    if (s.phase === "reinforce") return mine && s.reserve > 0 && !mustTrade(s, p) ? "place" : null;
    if (s.phase === "attack") {
      if (mine) return s.arm[t] >= 2 ? s.sel === t ? "deselect" : "select" : null;
      return s.sel >= 0 && s.own[s.sel] === p && s.arm[s.sel] >= 2 && ADJ[s.sel].includes(t) ? "attack" : null;
    }
    if (s.phase === "fortify") {
      if (!mine) return null;
      if (s.sel >= 0 && t !== s.sel && (reachable || reach(s, p, s.sel)).has(t)) return "move-to";
      return s.arm[t] >= 2 ? s.sel === t ? "deselect" : "select" : null;
    }
    return null;
  }

  const roll = n => Array.from({ length: n }, () => 1 + Math.floor(Math.random() * 6)).sort((a, b) => b - a);
  function battle(s, p, from, to, blitz) {
    const defender = s.own[to]; let lostA = 0, lostD = 0, rounds = 0, att = [], def = [], wins = [], used = 0;
    do {
      const ad = Math.min(3, s.arm[from] - 1), dd = Math.min(2, s.arm[to]);
      att = roll(ad); def = roll(dd); wins = []; used = ad;
      for (let i = 0; i < Math.min(ad, dd); i++) {
        if (att[i] > def[i]) { s.arm[to]--; lostD++; wins.push("a"); } else { s.arm[from]--; lostA++; wins.push("d"); }
      }
      rounds++;
    } while (blitz && s.arm[to] > 0 && s.arm[from] > 1);
    s.atk++;
    s.last = { from, to, by: p, att, def, wins, lostA, lostD, rounds, taken: s.arm[to] === 0 };
    if (s.arm[to] > 0) {
      say(s, `${nameOf(s, p)} attacked ${T[to].name} from ${T[from].name}${rounds > 1 ? ` (${rounds} rolls)` : ""}: lost ${lostA}, destroyed ${lostD}.`);
      if (s.arm[from] < 2 && s.sel === from) s.sel = -1;
      return;
    }
    s.own[to] = p; s.conquered = true;
    say(s, `${nameOf(s, p)} took ${T[to].name} from ${nameOf(s, defender)}.`);
    if (!s.own.includes(defender)) {
      s.alive[defender] = false;
      const loot = s.cards[defender].length; s.cards[p].push(...s.cards[defender]); s.cards[defender] = [];
      say(s, `${nameOf(s, defender)} is out of the game${loot ? ` — ${nameOf(s, p)} takes ${loot} card${loot > 1 ? "s" : ""}` : ""}.`);
      if (s.alive.filter(Boolean).length === 1) { s.arm[to] = Math.min(used, s.arm[from] - 1); s.arm[from] -= s.arm[to]; finish(s, [p], "Every rival has fallen."); return; }
    }
    s.phase = "occupy"; s.sel = -1;
    s.occ = { from, to, min: Math.min(used, s.arm[from] - 1), max: s.arm[from] - 1 };
  }

  function endTurn(s) {
    const p = s.turn;
    if (s.conquered) { s.cards[p].push(KINDS[Math.floor(Math.random() * 3)]); s.log.push(`${nameOf(s, p)} earned a card.`); if (s.log.length > 7) s.log.shift(); }
    s.conquered = false; s.sel = -1; s.fort = null; s.occ = null; s.atk = 0;
    let next = p; do { next = (next + 1) % s.players.length; } while (!s.alive[next]);
    if (next <= p) s.round++;
    if (s.round > s.cap) {
      const alive = s.players.map((_, i) => i).filter(i => s.alive[i]);
      const best = Math.max(...alive.map(i => holdings(s, i) * 1000 + armiesOf(s, i)));
      return finish(s, alive.filter(i => holdings(s, i) * 1000 + armiesOf(s, i) === best), "Round limit reached — most land wins.");
    }
    s.turn = next; s.phase = "reinforce"; s.reserve = income(s, next);
    s.message = `${nameOf(s, next)} ${verb(s, next, "get", "gets")} ${s.reserve} armies.`;
  }

  const engine = {
    title: "Conquest", min: 2, max: 6,
    rules: "<ol><li>Territories are dealt at random, each holding at least one army. A turn has three steps: <b>Reinforce</b>, <b>Attack</b>, <b>Fortify</b>.</li><li><b>Reinforce:</b> you get one army for every three territories you hold (at least 3), plus a bonus for each whole region you own. Tap your territories to place them.</li><li><b>Attack:</b> tap one of your territories with two or more armies, then tap a neighbouring enemy. The attacker rolls up to three dice, the defender up to two. Compare highest to highest, then next highest: the higher die wins, ties go to the defender, and the loser removes an army. Dashed lines are boat routes you can also attack across.</li><li>Take the last defender to claim the territory, then move armies in. Conquer at least one territory in a turn to earn a card. <b>Blitz</b> keeps rolling until you win or run out of armies.</li><li><b>Fortify:</b> once per turn, move armies between two of your territories joined by your own land.</li><li>Trade three matching cards, or one of each kind, for bonus armies (4, then 6, 8, 10, 12, 15 and more). With five cards you must trade. Eliminating a player takes their cards.</li><li>Conquer the whole map to win. After round 30, whoever holds the most land wins.</li></ol>",
    create(players) {
      if (players.length < 2 || players.length > 6) throw Error("Invalid player count");
      const n = players.length;
      const s = {
        players: players.map(p => ({ id: p.id, name: p.name })), turn: 0, done: false, winners: [], phase: "reinforce", message: "",
        own: Array(N).fill(0), arm: Array(N).fill(1), alive: players.map(() => true), cards: players.map(() => []),
        trades: 0, reserve: 0, mode: "1", style: "roll", sel: -1, fort: null, occ: null, conquered: false, atk: 0,
        last: null, round: 1, cap: ROUND_CAP, log: []
      };
      shuffle(Array.from({ length: N }, (_, i) => i)).forEach((t, i) => { s.own[t] = i % n; });
      for (let p = 0; p < n; p++) {
        const mine = s.own.map((o, i) => o === p ? i : -1).filter(i => i >= 0);
        for (let extra = Math.max(0, START[n] - mine.length); extra > 0; extra--) s.arm[mine[Math.floor(Math.random() * mine.length)]]++;
      }
      s.turn = Math.floor(Math.random() * n); s.reserve = income(s, s.turn);
      s.message = `The map is dealt. ${nameOf(s, s.turn)} ${verb(s, s.turn, "go", "goes")} first.`;
      s.log.push(s.message);
      return s;
    },
    act(s, p, a) {
      if (s.done || !Number.isInteger(p) || p !== s.turn || p < 0 || p >= s.players.length || !a || typeof a.type !== "string") return false;
      const me = nameOf(s, p);
      switch (a.type) {
        case "mode":
          if (!["1", "5", "all"].includes(String(a.v))) return false;
          s.mode = String(a.v); return true;
        case "style":
          if (!["roll", "blitz"].includes(a.v)) return false;
          s.style = a.v; return true;
        case "cancel":
          s.sel = -1; s.fort = null; return true;
        case "trade": {
          if (s.phase !== "reinforce") return false;
          const hand = s.cards[p];
          if (!tradeSets(hand).includes(a.set)) return false;
          const remove = a.set === "mix" ? KINDS.slice() : [a.set, a.set, a.set];
          for (const kind of remove) hand.splice(hand.indexOf(kind), 1);
          const bonus = tradeValue(s.trades++);
          s.reserve += bonus; say(s, `${me} traded cards for ${bonus} armies.`);
          return true;
        }
        case "tap": {
          const t = int(a.t, 0, N - 1), kind = t === null ? null : tapKind(s, p, t);
          if (!kind) return false;
          if (kind === "place") {
            const wanted = a.n !== undefined ? int(a.n, 1, 999) : s.mode === "all" ? s.reserve : s.mode === "5" ? 5 : 1;
            if (wanted === null) return false;
            const n = Math.min(wanted, s.reserve);
            s.arm[t] += n; s.reserve -= n;
            s.message = s.reserve ? `${s.reserve} armies left to place.` : "Reinforcements placed. Choose where to attack.";
            if (!s.reserve) { s.phase = "attack"; s.sel = -1; }
            return true;
          }
          if (kind === "select") { s.sel = t; s.fort = null; return true; }
          if (kind === "deselect") { s.sel = -1; s.fort = null; return true; }
          if (kind === "move-to") { s.fort = { from: s.sel, to: t }; return true; }
          battle(s, p, s.sel, t, a.blitz === "1" || a.blitz === undefined && s.style === "blitz");
          return true;
        }
        case "attack": {
          const from = int(a.from, 0, N - 1), to = int(a.to, 0, N - 1);
          if (s.phase !== "attack" || from === null || to === null || s.own[from] !== p || s.arm[from] < 2 || s.own[to] === p || !ADJ[from].includes(to)) return false;
          battle(s, p, from, to, a.blitz === "1");
          return true;
        }
        case "occupy": {
          if (s.phase !== "occupy" || !s.occ) return false;
          const n = int(a.n, s.occ.min, s.occ.max);
          if (n === null) return false;
          const { from, to } = s.occ;
          s.arm[from] -= n; s.arm[to] = n; s.occ = null; s.phase = "attack";
          s.sel = s.arm[from] >= 2 ? from : -1;
          s.message = `${me} moved ${n} into ${T[to].name}.`;
          return true;
        }
        case "endAttack":
          if (s.phase !== "attack") return false;
          s.phase = "fortify"; s.sel = -1; s.fort = null; s.message = "Move armies if you like, then end your turn."; return true;
        case "endTurn":
          if (s.phase !== "attack" && s.phase !== "fortify") return false;
          endTurn(s); return true;
        case "fortify": {
          if (s.phase !== "fortify") return false;
          const from = a.from !== undefined ? int(a.from, 0, N - 1) : s.fort && s.fort.from, to = a.to !== undefined ? int(a.to, 0, N - 1) : s.fort && s.fort.to;
          if (!Number.isInteger(from) || !Number.isInteger(to) || from === to || s.own[from] !== p || s.own[to] !== p || !reach(s, p, from).has(to)) return false;
          const n = int(a.n, 1, Math.max(1, s.arm[from] - 1));
          if (n === null || n > s.arm[from] - 1) return false;
          s.arm[from] -= n; s.arm[to] += n;
          say(s, `${me} moved ${n} from ${T[from].name} to ${T[to].name}.`);
          endTurn(s); return true;
        }
        default: return false;
      }
    },
    view(s, seat) {
      const v = copy(s);
      v.me = seat; v.cardCounts = s.cards.map(hand => hand.length); v.hand = seat >= 0 && s.cards[seat] ? s.cards[seat].slice() : [];
      delete v.cards; v.nextTrade = tradeValue(s.trades);
      return v;
    },
    render(v) { return render(v); }
  };
  R.register(ID, engine);
  engine.spectatorView = s => engine.view(s, -1);

  /* ─────────────── The board ─────────────── */
  const tierOf = n => n < 5 ? 1 : n < 10 ? 2 : n < 20 ? 3 : 4;
  const armyWord = n => n === 1 ? "army" : "armies";
  const swatch = p => `<i class="cq-swatch" style="--chip:${PALETTE[p].chip};--dark:${PALETTE[p].dark}" aria-hidden="true"></i>`;
  const pips = n => { const on = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] }[n]; return Array.from({ length: 9 }, (_, i) => `<b${on.includes(i) ? ' class="on"' : ""}></b>`).join(""); };
  const die = (n, side, result) => `<span class="cq-die ${side} ${result || ""}" role="img" aria-label="${n}">${pips(n)}</span>`;
  const patterns = PALETTE.map((c, i) => {
    const bg = `<rect width="14" height="14" fill="${c.tint}"/>`;
    const shape = [
      `<rect width="5" height="14" fill="${c.line}"/>`, `<circle cx="7" cy="7" r="3" fill="${c.line}"/>`, `<rect y="5" width="14" height="4" fill="${c.line}"/>`,
      `<path d="M0 3.5H14M3.5 0V14" stroke="${c.line}" stroke-width="2.4"/>`, `<rect width="5" height="14" fill="${c.line}"/>`, `<rect width="7" height="7" fill="${c.line}"/><rect x="7" y="7" width="7" height="7" fill="${c.line}"/>`
    ][i];
    return `<pattern id="cq-p${i}" width="14" height="14" patternUnits="userSpaceOnUse"${i === 0 ? ' patternTransform="rotate(45)"' : i === 4 ? ' patternTransform="rotate(-45)"' : ""}>${bg}${shape}</pattern>`;
  }).join("");
  const chip = (t, owner, armies) => {
    const c = PALETTE[owner], tier = tierOf(armies), x = T[t].cx, y = T[t].cy - 8;
    let discs = "";
    for (let k = 0; k < tier; k++) {
      const dy = -k * 7;
      discs += `<path d="M-25 ${dy}v7a25 12.5 0 0 0 50 0v-7" fill="${c.dark}" stroke="#2c2340" stroke-width="2.4" stroke-linejoin="round"/><ellipse cy="${dy}" rx="25" ry="12.5" fill="${c.chip}" stroke="#2c2340" stroke-width="2.4"/>`;
    }
    const top = -(tier - 1) * 7;
    return `<g class="cq-chip" transform="translate(${x.toFixed(1)} ${y.toFixed(1)})">${discs}<ellipse cy="${top}" rx="18" ry="8.5" fill="none" stroke="#fff" stroke-opacity=".45" stroke-width="1.5"/><text y="${top + 6.2}" text-anchor="middle" class="cq-count">${armies}</text></g>`;
  };

  function board(v) {
    const mine = v.turn === v.me && !v.done, reachable = v.phase === "fortify" && v.sel >= 0 ? reach(v, v.me, v.sel) : null;
    const kinds = T.map(t => mine ? tapKind(v, v.me, t.id, reachable) : null);
    const targets = new Set();
    if (mine && v.phase === "attack" && v.sel >= 0) ADJ[v.sel].forEach(t => { if (kinds[t] === "attack") targets.add(t); });
    if (mine && v.phase === "fortify" && reachable) reachable.forEach(t => { if (t !== v.sel && v.own[t] === v.me) targets.add(t); });
    const lands = T.map(t => {
      const kind = kinds[t.id];
      return `<path d="${t.d}" class="cq-land${kind ? " live" : ""}${v.sel === t.id ? " picked" : ""}" fill="url(#cq-p${v.own[t.id]})" ${kind ? `data-move="tap" data-t="${t.id}"` : ""}><title>${esc(t.name)}</title></path>`;
    }).join("");
    const laneSvg = LANES.map(([a, b]) => {
      const A = T[a], B = T[b], mx = (A.cx + B.cx) / 2, my = (A.cy + B.cy) / 2 + (a === 12 ? 0 : a === 6 ? 24 : -24);
      return `<path d="M${A.cx.toFixed(1)} ${A.cy.toFixed(1)}Q${mx.toFixed(1)} ${my.toFixed(1)} ${B.cx.toFixed(1)} ${B.cy.toFixed(1)}" class="cq-lane"/>`;
    }).join("");
    const outline = (t, cls) => `<path d="${T[t].d}" class="${cls}"/>`;
    let marks = "";
    if (v.sel >= 0) marks += outline(v.sel, "cq-ring-back") + outline(v.sel, "cq-ring");
    targets.forEach(t => { marks += outline(t, "cq-target-back") + outline(t, "cq-target"); });
    const arrow = v.last ? (() => {
      const A = T[v.last.from], B = T[v.last.to], dx = B.cx - A.cx, dy = B.cy - A.cy, len = Math.hypot(dx, dy) || 1;
      return `<path d="M${(A.cx + dx / len * 24).toFixed(1)} ${(A.cy + dy / len * 24).toFixed(1)}L${(B.cx - dx / len * 28).toFixed(1)} ${(B.cy - dy / len * 28).toFixed(1)}" class="cq-arrow" marker-end="url(#cq-head)"/>`;
    })() : "";
    const captionAt = { north: "translate(800 26)", west: "translate(24 200) rotate(-90)", east: "translate(976 330) rotate(90)", south: "translate(560 606)" };
    const regionNames = REGIONS.map(r => `<text transform="${captionAt[r.id]}" text-anchor="middle" class="cq-region-name">${r.name} +${r.bonus}</text>`).join("");
    const shown = v.arm.slice();
    if (v.phase === "occupy" && v.occ) { shown[v.occ.to] = v.occ.min; shown[v.occ.from] -= v.occ.min; } // preview of the minimum move-in
    const chips = T.map(t => chip(t.id, v.own[t.id], shown[t.id])).join("");
    const labels = T.map(t => `<text x="${t.cx.toFixed(1)}" y="${(t.cy + 30).toFixed(1)}" text-anchor="middle" class="cq-place">${esc(t.name)}</text>`).join("");
    const hits = T.map(t => kinds[t.id] ? `<button class="cq-hit" style="left:${(t.cx / W * 100).toFixed(2)}%;top:${((t.cy - 8) / H * 100).toFixed(2)}%" data-move="tap" data-t="${t.id}" aria-label="${esc(t.name)}, ${esc(nameOf(v, v.own[t.id]))}, ${v.arm[t.id]} ${armyWord(v.arm[t.id])}. ${{ place: "Place armies here", select: "Choose as the attacking territory", deselect: "Clear selection", attack: "Attack", "move-to": "Move armies here" }[kinds[t.id]]}"></button>` : "").join("");
    const sr = `<ul class="visually-hidden">${T.map(t => `<li>${esc(t.name)}: ${esc(nameOf(v, v.own[t.id]))}, ${v.arm[t.id]} ${armyWord(v.arm[t.id])}</li>`).join("")}</ul>`;
    return `<div class="cq-board"><svg viewBox="0 0 ${W} ${H}" class="cq-map" role="img" aria-label="Map of the Hollow Sea: ${N} territories in four regions"><defs>${patterns}<pattern id="cq-waves" width="26" height="16" patternUnits="userSpaceOnUse"><path d="M0 9q6.5-7 13 0t13 0" fill="none" stroke="#fff" stroke-opacity=".34" stroke-width="1.8"/></pattern><marker id="cq-head" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M0 0L10 5L0 10Z" fill="#2c2340"/></marker></defs>
<rect width="${W}" height="${H}" class="cq-sea"/><rect width="${W}" height="${H}" fill="url(#cq-waves)"/>
<g class="cq-compass" transform="translate(92 548)"><circle r="40" fill="none" stroke="#2c2340" stroke-opacity=".4" stroke-width="1.5"/><path d="M0-42L7-7L42 0L7 7L0 42L-7 7L-42 0L-7-7Z" fill="#fff8e9" stroke="#2c2340" stroke-width="2.4" stroke-linejoin="round"/><path d="M0-42L7-7L0 0Z" fill="#ef6b4f" stroke="#2c2340" stroke-width="2.4" stroke-linejoin="round"/><text y="-50" text-anchor="middle" class="cq-compass-n">N</text></g>
<text transform="translate(497 318) rotate(90)" text-anchor="middle" class="cq-sea-name">the Hollow Sea</text>
<path d="${MAP.coast}" class="cq-foam"/>${laneSvg}<g class="cq-lands">${lands}</g><path d="${MAP.plain}" class="cq-edge"/><path d="${MAP.border}" class="cq-region-edge"/><path d="${MAP.border}" class="cq-region-dash"/><path d="${MAP.coast}" class="cq-coast"/>
${regionNames}${marks}${arrow}${chips}${labels}</svg>${hits}${sr}</div>`;
  }

  function panel(v) {
    const mine = v.turn === v.me && !v.done, btn = (move, text, attrs = "", cls = "") => `<button class="cq-btn ${cls}" data-move="${move}" ${attrs}>${text}</button>`;
    const seg = (move, current, options) => options.map(([value, label]) => `<button class="cq-seg-btn" data-move="${move}" data-v="${value}" aria-pressed="${String(current) === value}">${label}</button>`).join("");
    let controls = "";
    const sets = v.hand.length ? tradeSets(v.hand) : [];
    if (mine && v.phase === "reinforce") {
      controls += `<div class="cq-row"><span class="cq-lbl">Armies per tap</span><div class="cq-seg" role="group" aria-label="Armies placed per tap">${seg("mode", v.mode, [["1", "1"], ["5", "5"], ["all", "All"]])}</div></div>`;
      if (sets.length) controls += `<div class="cq-row"><span class="cq-lbl">Trade in</span><div class="cq-trades">${sets.map(k => btn("trade", `${k === "mix" ? "One of each" : "3 " + KIND_NAME[k]} <b>+${v.nextTrade}</b>`, `data-set="${k}"`)).join("")}</div></div>`;
      if (v.hand.length >= 5) controls += `<p class="cq-note">You hold five cards, so trade a set before placing armies.</p>`;
    } else if (mine && v.phase === "attack") {
      controls += `<div class="cq-row"><span class="cq-lbl">Each attack</span><div class="cq-seg" role="group" aria-label="Attack style">${seg("style", v.style, [["roll", "One roll"], ["blitz", "Blitz"]])}</div></div><div class="cq-row">${btn("endAttack", "Done attacking")}${btn("endTurn", "End turn", "", "plain")}${v.sel >= 0 ? btn("cancel", "Clear selection", "", "plain") : ""}</div>`;
    } else if (mine && v.phase === "occupy" && v.occ) {
      const { min, max, to, from } = v.occ, picks = [...new Set([min, Math.round((min + max) / 2), max])];
      controls += `<div class="cq-row"><span class="cq-lbl">Move into ${esc(T[to].name)}</span><div class="cq-trades">${picks.map(n => btn("occupy", n === max ? `All ${n}` : String(n), `data-n="${n}"`)).join("")}</div></div><p class="cq-note">${esc(T[from].name)} keeps the rest.</p>`;
    } else if (mine && v.phase === "fortify") {
      if (v.fort) {
        const room = v.arm[v.fort.from] - 1, picks = [...new Set([1, Math.ceil(room / 2), room])].filter(n => n >= 1);
        controls += `<div class="cq-row"><span class="cq-lbl">${esc(T[v.fort.from].name)} → ${esc(T[v.fort.to].name)}</span><div class="cq-trades">${picks.map(n => btn("fortify", n === room && room > 1 ? `All ${n}` : String(n), `data-n="${n}"`)).join("")}${btn("cancel", "Cancel", "", "plain")}</div></div>`;
      } else controls += `<div class="cq-row">${btn("endTurn", "End turn")}${v.sel >= 0 ? btn("cancel", "Clear selection", "", "plain") : ""}</div>`;
    } else if (!v.done) controls += `<p class="cq-note">${esc(nameOf(v, v.turn))} ${verb(v, v.turn, "are", "is")} playing. Every move shows on the map.</p>`;
    if (v.done) controls += `<p class="cq-note">The war is over. Press New game for a fresh map.</p>`;
    const hand = v.me >= 0 ? `<div class="cq-hand"><span class="cq-lbl">Your cards</span>${v.hand.length ? v.hand.map(k => `<span class="cq-card ${k}">${KIND_NAME[k]}</span>`).join("") : `<span class="cq-faint">None yet. Take a territory to earn one.</span>`}</div>` : "";
    let strip = "";
    if (v.last) {
      const L = v.last, pairs = L.wins;
      strip = `<div class="cq-battle"><span class="cq-lbl">Last battle · ${esc(T[L.from].name)} → ${esc(T[L.to].name)}</span><div class="cq-dice"><span class="cq-side" aria-label="Attacker dice">${L.att.map((n, i) => die(n, "att", pairs[i] === "a" ? "won" : pairs[i] === "d" ? "lost" : "")).join("")}</span><span class="cq-vs">vs</span><span class="cq-side" aria-label="Defender dice">${L.def.map((n, i) => die(n, "def", pairs[i] === "d" ? "won" : pairs[i] === "a" ? "lost" : "")).join("")}</span></div><p class="cq-faint">${esc(nameOf(v, L.by))} lost ${L.lostA}, defender lost ${L.lostD}${L.rounds > 1 ? ` over ${L.rounds} rolls` : ""}${L.taken ? ". Territory taken." : "."}</p></div>`;
    }
    return `<div class="cq-panel">${controls}${hand}${strip}</div>`;
  }

  function ledger(v) {
    const rows = v.players.map((p, i) => `<tr class="${v.alive[i] ? "" : "out"}${v.turn === i && !v.done ? " now" : ""}"><td>${v.turn === i && !v.done ? '<span class="cq-pointer" aria-label="Taking a turn">▶</span>' : ""}</td><th scope="row">${swatch(i)}${esc(p.name)}${i === v.me ? " <small>you</small>" : ""}${v.alive[i] ? "" : " <small>out</small>"}</th><td>${count(v.own, o => o === i)}</td><td>${v.own.reduce((n, o, t) => n + (o === i ? v.arm[t] : 0), 0)}</td><td>${v.cardCounts[i]}</td></tr>`).join("");
    const regions = REGIONS.map(r => { const owner = v.own[r.ids[0]]; const held = r.ids.every(i => v.own[i] === owner); return `<li><span>${r.name}</span><b>+${r.bonus}</b><span class="cq-held">${held ? `${swatch(owner)}${esc(nameOf(v, owner))}` : `${r.ids.filter(i => v.own[i] === v.me).length}/${r.ids.length} yours`}</span></li>`; }).join("");
    return `<div class="cq-ledger"><table><thead><tr><td></td><th scope="col">Player</th><th scope="col">Land</th><th scope="col">Armies</th><th scope="col">Cards</th></tr></thead><tbody>${rows}</tbody></table><ul class="cq-regions" aria-label="Region bonuses">${regions}</ul><ol class="cq-log" aria-label="Recent moves">${v.log.slice().reverse().slice(0, 5).map(line => `<li>${esc(line)}</li>`).join("")}</ol></div>`;
  }

  function banner(v) {
    if (v.done) return G.status(v.message, true);
    const you = v.turn === v.me, who = nameOf(v, v.turn);
    const prompt = {
      reinforce: you ? `Place ${v.reserve} ${armyWord(v.reserve)}. Tap your territories.` : `${who} is placing ${v.reserve} armies.`,
      attack: you ? v.sel >= 0 ? `Attacking from ${T[v.sel].name}. Tap a neighbouring enemy.` : "Choose a territory with 2 or more armies to attack from." : `${who} is on the attack.`,
      occupy: you ? "You took it! Choose how many armies move in." : `${who} is moving in.`,
      fortify: you ? v.fort ? "Choose how many armies to move." : "Move armies between your connected territories, or end your turn." : `${who} is fortifying.`
    }[v.phase] || "";
    return G.status(prompt, false);
  }

  function render(v) {
    const steps = [["reinforce", "Reinforce"], ["attack", "Attack"], ["fortify", "Fortify"]], at = v.phase === "occupy" ? 1 : steps.findIndex(([id]) => id === v.phase);
    const turnbar = `<div class="cq-turnbar"><ol class="cq-track" aria-label="Turn steps">${steps.map(([, label], i) => `<li class="${i === at && !v.done ? "on" : i < at && !v.done ? "past" : ""}"${i === at && !v.done ? ' aria-current="step"' : ""}>${label}</li>`).join("")}</ol><p class="cq-turninfo">${v.done ? "Final" : `<span>${swatch(v.turn)}${esc(nameOf(v, v.turn))}</span>`} <small>Round ${Math.min(v.round, v.cap)} of ${v.cap}</small></p></div>`;
    return `<div class="cq">${banner(v)}${turnbar}${board(v)}<div class="cq-under">${panel(v)}${ledger(v)}</div></div>`;
  }

  /* ─────────────── Computer opponents ─────────────── */
  const odds = {}; // odds[a][d] = list of [attackerLosses, defenderLosses, probability]
  for (let a = 1; a <= 3; a++) for (let d = 1; d <= 2; d++) {
    const table = {}, total = 6 ** (a + d);
    for (let k = 0; k < total; k++) {
      let x = k; const A = [], D = [];
      for (let i = 0; i < a; i++) { A.push(x % 6); x = Math.floor(x / 6); }
      for (let i = 0; i < d; i++) { D.push(x % 6); x = Math.floor(x / 6); }
      A.sort((m, n) => n - m); D.sort((m, n) => n - m);
      let la = 0, ld = 0; for (let i = 0; i < Math.min(a, d); i++) if (A[i] > D[i]) ld++; else la++;
      table[la + "," + ld] = (table[la + "," + ld] || 0) + 1 / total;
    }
    (odds[a] ||= {})[d] = Object.entries(table).map(([key, pr]) => [...key.split(",").map(Number), pr]);
  }
  const memo = new Map();
  // Chance that `a` attacking armies (not counting the one that must stay home) beat `d` defenders.
  function winOdds(a, d) {
    if (d <= 0) return 1; if (a <= 0) return 0;
    const key = a * 1000 + d; if (memo.has(key)) return memo.get(key);
    let pr = 0; for (const [la, ld, p] of odds[Math.min(3, a)][Math.min(2, d)]) pr += p * winOdds(a - la, d - ld);
    memo.set(key, pr); return pr;
  }
  const pickBy = (items, score, random) => {
    let best = -Infinity, bag = [];
    for (const item of items) { const sc = score(item); if (sc > best + 1e-9) { best = sc; bag = [item]; } else if (Math.abs(sc - best) <= 1e-9) bag.push(item); }
    return bag.length ? bag[Math.floor(random() * bag.length)] : null;
  };

  function choose(v, random = Math.random, level) {
    level = level || G.cpu && G.cpu.level || "normal";
    const me = v.turn, own = v.own, arm = v.arm, hand = v.hand;
    const mineIds = T.map(t => t.id).filter(t => own[t] === me);
    const foes = t => ADJ[t].filter(u => own[u] !== me);
    const value = u => {
      const region = REGIONS[MAP.regionOf[u]], q = own[u], held = region.ids.filter(i => own[i] === me).length;
      let val = 1 + (held === region.ids.length - 1 ? region.bonus * 1.6 : held / region.ids.length * region.bonus * .6);
      if (region.ids.every(i => own[i] === q)) val += region.bonus * 1.2;
      if (count(own, o => o === q) === 1) val += 3 + v.cardCounts[q] * .5;
      return val + ADJ[u].filter(x => own[x] === me).length * .15;
    };
    if (v.phase === "reinforce") {
      const sets = tradeSets(hand);
      if (sets.length && (hand.length >= 5 || level !== "easy" || random() < .5)) {
        const c = handCounts(hand); return { type: "trade", set: sets.filter(k => k !== "mix").sort((x, y) => c[y] - c[x])[0] || "mix" };
      }
      const border = mineIds.filter(t => foes(t).length);
      let target;
      if (!border.length) target = pickBy(mineIds, t => arm[t], random);
      else if (level === "easy") target = border[Math.floor(random() * border.length)];
      else target = pickBy(border, t => Math.max(...foes(t).map(u => winOdds(arm[t] + v.reserve - 1, arm[u]) * value(u))) + (level === "hard" ? foes(t).reduce((n, u) => n + arm[u], 0) * .02 : 0), random);
      return { type: "tap", t: target, n: v.reserve };
    }
    if (v.phase === "occupy") {
      const { from, to, min, max } = v.occ, toFoes = foes(to).length, fromFoes = ADJ[from].some(u => own[u] !== me);
      const n = !toFoes && !fromFoes ? min : toFoes && !fromFoes ? max : fromFoes && !toFoes ? min : Math.max(min, Math.ceil(max * .6));
      return { type: "occupy", n: Math.max(min, Math.min(max, n)) };
    }
    if (v.phase === "attack") {
      const need = level === "easy" ? .8 : level === "hard" ? .55 : .62;
      if (v.atk < 40 && !(level === "easy" && random() < .15)) {
        const options = [];
        for (const from of mineIds) if (arm[from] >= 2) for (const to of foes(from)) {
          const p = winOdds(arm[from] - 1, arm[to]);
          if (p >= need) options.push({ from, to, p });
        }
        const choice = pickBy(options, o => o.p * value(o.to) - (1 - o.p) * .5, random);
        if (choice) return { type: "attack", from: choice.from, to: choice.to, blitz: choice.p >= .5 ? "1" : "0" };
      }
      return { type: "endAttack" };
    }
    if (v.phase === "fortify") {
      if (level === "easy") return { type: "endTurn" };
      const interior = mineIds.filter(t => !foes(t).length && arm[t] >= 2);
      let best = null;
      for (const from of interior.sort((x, y) => arm[y] - arm[x])) {
        const walk = reach(v, me, from), spots = [...walk].filter(t => foes(t).length);
        const to = pickBy(spots, t => foes(t).reduce((n, u) => n + arm[u], 0) - arm[t], random);
        if (to !== null) { best = { type: "fortify", from, to, n: arm[from] - 1 }; break; }
      }
      return best || { type: "endTurn" };
    }
    return { type: "endTurn" };
  }
  G.conquestCPU = Object.freeze({ choose, winOdds });
  G.conquestMap = Object.freeze({ territories: T, adjacency: ADJ, regions: REGIONS, regionOf: MAP.regionOf, isLane, START, tapKind, reach, income });

  /* ─────────────── Offline play against the computer ─────────────── */
  const entries = [["conquest", "Conquest", "Raise armies, roll for the border, and take the whole map.", "Dice & board", "Vs computer", "30 min", "⚔", "navy"]];
  G.expansionCatalog = [...(G.expansionCatalog || []), ...entries];
  G.cpuIds = [...new Set([...(G.cpuIds || []), ID])];
  const COUNT_KEY = "vs-conquest-rivals";
  const savedRivals = () => { try { const n = Number(localStorage.getItem(COUNT_KEY)); return Number.isInteger(n) && n >= 1 && n <= 5 ? n : 2; } catch { return 2; } };
  G.register(ID, {
    rules: engine.rules,
    note: "Play offline against up to five computer opponents, or open a room to fight it out with friends. Each computer sees only what a player at the table could see.",
    mount(root) {
      let state = null, timer = null, disposed = false, rivals = savedRivals();
      const setup = () => {
        root.innerHTML = `<div class="cq-setup"><h2>Who’s at the table?</h2><p>You, plus computer generals. More players means smaller armies and a longer war.</p><div class="cq-seg" role="group" aria-label="Computer opponents">${[1, 2, 3, 4, 5].map(n => `<button class="cq-seg-btn" data-rivals="${n}" aria-pressed="${n === rivals}">${n} ${n === 1 ? "computer" : "computers"}</button>`).join("")}</div><button class="cq-btn big" data-deal="1">Deal the map</button></div>`;
      };
      const paint = () => { if (!disposed) root.innerHTML = engine.render(engine.view(state, 0)); };
      const apply = (p, action) => { const next = copy(state); if (!engine.act(next, p, action)) return false; state = next; return true; };
      function schedule() {
        if (disposed || timer !== null || !state || state.done || state.turn === 0) return;
        timer = setTimeout(() => {
          timer = null; if (disposed) return;
          const seat = state.turn, action = choose(engine.view(state, seat), Math.random);
          if (!apply(seat, action) && !apply(seat, { type: state.phase === "attack" ? "endAttack" : "endTurn" }) && !apply(seat, { type: "endTurn" })) return;
          paint(); schedule();
        }, state.phase === "attack" ? 520 : 320);
      }
      root.onclick = event => {
        if (disposed) return;
        const pick = event.target.closest("[data-rivals]");
        if (pick && !state) { rivals = Number(pick.dataset.rivals); try { localStorage.setItem(COUNT_KEY, String(rivals)); } catch {} setup(); return; }
        if (event.target.closest("[data-deal]") && !state) {
          state = engine.create([{ id: "you", name: "You" }, ...Array.from({ length: rivals }, (_, i) => ({ id: "cpu" + i, name: "Computer " + (i + 1) }))]);
          paint(); schedule(); return;
        }
        const button = event.target.closest("[data-move]");
        if (!state || !button || !root.contains(button) || button.disabled) return;
        const action = { ...button.dataset, type: button.dataset.move }; delete action.move;
        if (apply(0, action)) { paint(); schedule(); }
      };
      setup();
      return () => { disposed = true; clearTimeout(timer); timer = null; root.onclick = null; };
    }
  });
})();
