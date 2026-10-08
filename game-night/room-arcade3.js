"use strict";
// Arcade Night, part 3: hidden roles and bluffing — Wolf Pack (one-night werewolf) and Bluff Court.
(() => {
  const K = window.ArcadeKit, G = window.GameNight, esc = G.esc;
  const { shuffled, int, seat, nameOf, everyone, base, finishByScore, publicBase, btn, note, promptCard, scoreStrip, finalBoard, waitingFor, hostTools, roundBadge, shell, reg } = K;
  const select = (id, name, label, options) => `<label class="pn-field" for="${id}"><span>${esc(label)}</span><select id="${id}" data-field="${name}">${options.map(([value, text]) => `<option value="${esc(value)}">${esc(text)}</option>`).join("")}</select></label>`;
  const pawn = (i, name) => `<span class="pn-pawn pawn-${i % 8}" aria-hidden="true">${esc(name.slice(0, 1).toUpperCase())}</span>`;
  // A row of big "pick a person" buttons.
  const people = (v, move, keep, extra = () => "", picked = -1) => `<div class="pn-options pn-people">${v.players.map((p, i) => keep(i) ? `<button type="button" class="pn-option ${picked === i ? "is-picked" : ""}" data-move="${move}" data-target="${i}" ${extra(i)}>${pawn(i, p.name)}${esc(p.name)}</button>` : "").join("")}</div>`;
  K.select = select; K.people = people; K.pawn = pawn;

  /* ── 6. Wolf Pack — one night, one vote, find a werewolf ─────────── */
  const ROLES = {
    werewolf: { name: "Werewolf", icon: "🐺", team: "wolf", night: "Open your eyes and find the other wolf. A lone wolf may peek at one center card." },
    seer: { name: "Seer", icon: "🔮", team: "village", night: "Look at another player's card, or at two of the center cards." },
    robber: { name: "Robber", icon: "🦝", team: "village", night: "You may swap your card with another player's, then look at your new card." },
    troublemaker: { name: "Troublemaker", icon: "🃏", team: "village", night: "You may secretly swap two other players' cards — without looking." },
    insomniac: { name: "Insomniac", icon: "🥱", team: "village", night: "You wake up last and check whether your card changed." },
    villager: { name: "Villager", icon: "🧑‍🌾", team: "village", night: "No night power. Sleep tight — and listen closely in the morning." },
  };
  const WP_ROUNDS = 3;
  const roleTag = (r) => `<span class="ax-role ax-role-${r}">${ROLES[r].icon} ${ROLES[r].name}</span>`;
  function wpDeal(s) {
    const n = s.players.length, cards = ["werewolf", "werewolf", "seer", "robber", "troublemaker", "insomniac"];
    while (cards.length < n + 3) cards.push("villager");
    const deck = shuffled(cards);
    Object.assign(s, { phase: "night", orig: deck.slice(0, n), cards: deck.slice(0, n), center: deck.slice(n, n + 3), choice: s.players.map(() => null), info: s.players.map(() => []), votes: s.players.map(() => null), killed: [], roundWinners: [], wolvesSeen: false });
    s.message = "Night falls. Check your card and use your power in secret.";
  }
  const wolfSeats = (s, list) => everyone(s).filter((i) => list[i] === "werewolf");
  function wpNight(s) {
    const n = s.players.length, wolves = wolfSeats(s, s.orig), say = (p, t) => s.info[p].push(t);
    everyone(s).forEach((p) => say(p, `You started as the ${ROLES[s.orig[p]].name}.`));
    // Night order: wolves → seer → robber → troublemaker → insomniac.
    wolves.forEach((w) => {
      const pals = wolves.filter((x) => x !== w);
      if (pals.length) say(w, `Your fellow wolf: ${pals.map((x) => nameOf(s, x)).join(", ")}.`);
      else if (s.choice[w]?.center !== undefined) say(w, `You're the lone wolf. Center card ${s.choice[w].center + 1} is the ${ROLES[s.center[s.choice[w].center]].name}.`);
      else say(w, "You're the lone wolf.");
    });
    for (let p = 0; p < n; p++) {
      const c = s.choice[p] || {};
      if (s.orig[p] === "seer") {
        if (c.target !== undefined) say(p, `You peeked: ${nameOf(s, c.target)} is the ${ROLES[s.cards[c.target]].name}.`);
        else if (c.pair) say(p, `Center cards ${c.pair[0] + 1} & ${c.pair[1] + 1}: ${ROLES[s.center[c.pair[0]]].name} and ${ROLES[s.center[c.pair[1]]].name}.`);
        else say(p, "You kept your eyes shut.");
      }
    }
    for (let p = 0; p < n; p++) {
      const c = s.choice[p] || {};
      if (s.orig[p] === "robber") {
        if (c.target !== undefined) { [s.cards[p], s.cards[c.target]] = [s.cards[c.target], s.cards[p]]; say(p, `You robbed ${nameOf(s, c.target)} and are now the ${ROLES[s.cards[p]].name}.`); }
        else say(p, "You decided not to rob anyone.");
      }
    }
    for (let p = 0; p < n; p++) {
      const c = s.choice[p] || {};
      if (s.orig[p] === "troublemaker") {
        if (c.swap) { const [a, b] = c.swap; [s.cards[a], s.cards[b]] = [s.cards[b], s.cards[a]]; say(p, `You swapped ${nameOf(s, a)} and ${nameOf(s, b)}.`); }
        else say(p, "You stayed out of trouble.");
      }
    }
    for (let p = 0; p < n; p++) if (s.orig[p] === "insomniac") say(p, `At dawn your card is the ${ROLES[s.cards[p]].name}.`);
    s.phase = "day"; s.message = "Morning! Talk it over, then everyone votes for who to eliminate.";
  }
  function wpDay(s) {
    const tally = s.players.map(() => 0);
    s.votes.forEach((t) => { if (t !== null) tally[t]++; });
    const top = Math.max(...tally);
    s.killed = top >= 2 ? everyone(s).filter((i) => tally[i] === top) : [];
    const wolvesNow = wolfSeats(s, s.cards);
    const villageWins = wolvesNow.length ? s.killed.some((k) => s.cards[k] === "werewolf") : s.killed.length === 0;
    s.roundWinners = everyone(s).filter((i) => (ROLES[s.cards[i]].team === "village") === villageWins);
    s.roundWinners.forEach((i) => s.scores[i]++);
    const out = s.killed.length ? `${s.killed.map((i) => `${nameOf(s, i)} (${ROLES[s.cards[i]].name})`).join(" and ")} ${s.killed.length > 1 ? "were" : "was"} voted out.` : "Nobody was voted out.";
    s.message = `${out} ${villageWins ? "The village wins!" : "The wolves win!"}${wolvesNow.length ? "" : " (Both wolves were in the center.)"}`;
    s.phase = "reveal";
  }
  reg("wolf-pack", {
    title: "Wolf Pack", min: 3, max: 8, concurrentActions: ["night", "vote"],
    rules: "<ol><li>Everyone gets a secret role; three more cards sit face down in the middle.</li><li>At night each role acts in secret: wolves meet, the Seer peeks, the Robber swaps, the Troublemaker shuffles two others, the Insomniac checks.</li><li>By day, talk, bluff and vote. If a werewolf is voted out, the village wins — otherwise the wolves do. Your <em>final</em> card decides your team!</li><li>Three nights; most wins takes the game.</li></ol>",
    create(players) { const s = base(players, 3, 8, { totalRounds: WP_ROUNDS }); wpDeal(s); return s; },
    act(s, p, a) {
      if (!seat(s, p) || s.done) return false;
      const n = s.players.length, other = (t) => t !== null && t !== p;
      if (a.type === "night" && s.phase === "night") {
        if (s.choice[p]) return false;
        const role = s.orig[p], c = {};
        if (role === "werewolf" && a.center !== undefined) { const k = int(a.center, 0, 2); if (k === null || wolfSeats(s, s.orig).length !== 1) return false; c.center = k; }
        if (role === "seer" && a.target !== undefined) { const t = int(a.target, 0, n - 1); if (!other(t)) return false; c.target = t; }
        if (role === "seer" && a.pair !== undefined) { const pr = String(a.pair).split(",").map((x) => int(x, 0, 2)); if (pr.length !== 2 || pr.includes(null) || pr[0] === pr[1]) return false; c.pair = pr; }
        if (role === "robber" && a.target !== undefined) { const t = int(a.target, 0, n - 1); if (!other(t)) return false; c.target = t; }
        if (role === "troublemaker" && a.mode === "swap") { const x = int(a.a, 0, n - 1), y = int(a.b, 0, n - 1); if (!other(x) || !other(y) || x === y) return false; c.swap = [x, y]; }
        s.choice[p] = c;
        if (s.choice.every(Boolean)) wpNight(s);
        return true;
      }
      if (a.type === "vote" && s.phase === "day") {
        const t = int(a.target, 0, n - 1); if (!other(t)) return false;
        s.votes[p] = t;
        if (s.votes.every((x) => x !== null)) wpDay(s);
        return true;
      }
      if (a.type === "force" && p === 0) {
        if (s.phase === "night") { s.choice = s.choice.map((c) => c || {}); wpNight(s); return true; }
        if (s.phase === "day" && s.votes.some((x) => x !== null)) { wpDay(s); return true; }
        return false;
      }
      if (a.type === "next" && p === 0 && s.phase === "reveal") {
        if (s.round >= s.totalRounds) { finishByScore(s); s.message = `${s.winners.map((i) => nameOf(s, i)).join(" & ")} survived the most nights!`; }
        else { s.round++; wpDeal(s); }
        return true;
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self;
      const out = { ...v, chosen: s.choice.map(Boolean), voted: s.votes.map((x) => x !== null), myRole: me >= 0 ? s.orig[me] : null, lone: me >= 0 && s.orig[me] === "werewolf" && wolfSeats(s, s.orig).length === 1, myChoice: me >= 0 ? !!s.choice[me] : false, myVote: me >= 0 ? s.votes[me] : null, info: me >= 0 && s.phase !== "night" ? [...s.info[me]] : [] };
      if (s.phase === "reveal" || s.done) Object.assign(out, { orig: [...s.orig], cards: [...s.cards], center: [...s.center], votes: [...s.votes], killed: [...s.killed], roundWinners: [...s.roundWinners] });
      return out;
    },
    render(v) {
      let body = scoreStrip(v, v.phase === "night" ? v.chosen.map((x) => x ? "😴" : "👀") : v.phase === "day" ? v.voted.map((x) => x ? "🗳️" : "") : []);
      if (v.phase === "night" && v.self >= 0) {
        const r = ROLES[v.myRole];
        body += `<div class="ax-night"><div class="ax-rolecard ax-role-${v.myRole}"><span class="ax-role-icon">${r.icon}</span><strong>${r.name}</strong><small>${r.team === "wolf" ? "Team Wolf" : "Team Village"}</small></div><p>${r.night}</p></div>`;
        if (v.myChoice) body += note("Done — eyes closed. Waiting for everyone else…");
        else {
          const others = (i) => i !== v.self;
          if (v.myRole === "werewolf") body += v.lone ? `<h3 class="pn-h">Peek at a center card?</h3><div class="pn-options">${[0, 1, 2].map((k) => btn(`🂠 Card ${k + 1}`, "night", `data-center="${k}"`, false, "secondary")).join("")}</div>` : note("Your partner will be revealed when the night ends.");
          if (v.myRole === "seer") body += `<h3 class="pn-h">Peek at a player…</h3>${people(v, "night", others)}<h3 class="pn-h">…or two center cards</h3><div class="pn-options">${[[0, 1], [0, 2], [1, 2]].map(([x, y]) => btn(`🂠 ${x + 1} & ${y + 1}`, "night", `data-pair="${x},${y}"`, false, "secondary")).join("")}</div>`;
          if (v.myRole === "robber") body += `<h3 class="pn-h">Rob someone</h3>${people(v, "night", others)}`;
          if (v.myRole === "troublemaker") { const opts = v.players.map((p, i) => [i, p.name]).filter(([i]) => i !== v.self); body += `<div class="pn-form ax-swap">${select("wp-a", "a", "Swap", opts)}${select("wp-b", "b", "with", [...opts.slice(1), opts[0]])}${btn("Swap them 🔀", "night", `data-mode="swap"`)}</div>`; }
          body += `<div class="pn-form">${btn(v.myRole === "werewolf" || v.myRole === "insomniac" || v.myRole === "villager" ? "Close my eyes 😴" : "Skip my power", "night", "", false, "ghost")}</div>`;
        }
        body += waitingFor(v, v.chosen) + hostTools(v, btn("End the night now", "force", "", false, "secondary small"));
      }
      if (v.phase === "day") {
        body += v.info.length ? `<div class="ax-memory"><span class="pn-eyebrow">What you know</span>${v.info.map((t) => `<p>${esc(t)}</p>`).join("")}</div>` : "";
        body += `<h3 class="pn-h">Vote someone out</h3>${people(v, "vote", (i) => i !== v.self, () => v.self < 0 ? "disabled" : "", v.myVote ?? -1)}${note("You can change your vote until everyone has voted.")}${waitingFor(v, v.voted)}${hostTools(v, btn("Count votes now", "force", "", false, "secondary small"))}`;
      }
      if (v.cards) {
        body += `<div class="ax-reveal-grid">${v.players.map((p, i) => `<div class="ax-reveal-card ${v.killed.includes(i) ? "is-out" : ""} ${v.roundWinners.includes(i) ? "is-win" : ""}">${pawn(i, p.name)}<strong>${esc(p.name)}</strong>${v.orig[i] !== v.cards[i] ? `<small>was ${ROLES[v.orig[i]].icon} ${ROLES[v.orig[i]].name}</small>` : ""}${roleTag(v.cards[i])}<small>${v.votes[i] !== null ? `voted ${esc(v.players[v.votes[i]].name)}` : "no vote"}</small></div>`).join("")}</div><p class="pn-note">Center: ${v.center.map(roleTag).join(" ")}</p>`;
        if (!v.done) body += v.self === 0 ? `<div class="pn-form">${btn(v.round >= v.totalRounds ? "Final scores" : "Next night 🌙", "next")}</div>` : note("The host starts the next night.");
      }
      return shell("wolf", v, body + finalBoard(v, false, "Nights won"), roundBadge(v, "Night"));
    },
  });

  /* ── 7. Bluff Court — claim any role, call any bluff ────────────── */
  const COURT = {
    treasurer: { name: "Treasurer", icon: "💰", does: "Tax: take 3 coins. Blocks Foreign Aid." },
    shadow: { name: "Shadow", icon: "🗡️", does: "Pay 3 coins: make someone lose a card." },
    pirate: { name: "Pirate", icon: "🏴‍☠️", does: "Steal 2 coins. Blocks stealing." },
    diplomat: { name: "Diplomat", icon: "📜", does: "Trade cards with the court deck. Blocks stealing." },
    guard: { name: "Guard", icon: "🛡️", does: "Blocks a Shadow strike." },
  };
  const MOVES = {
    income: { label: "Income +1" },
    aid: { label: "Foreign Aid +2", blockers: ["treasurer"], anyone: true },
    coup: { label: "Coup", cost: 7, target: true },
    tax: { label: "Tax +3", claim: "treasurer" },
    strike: { label: "Strike", claim: "shadow", cost: 3, target: true, blockers: ["guard"] },
    steal: { label: "Steal 2", claim: "pirate", target: true, blockers: ["pirate", "diplomat"] },
    exchange: { label: "Exchange", claim: "diplomat" },
  };
  const live = (s, p) => s.hands[p].map((c, i) => c.dead ? -1 : i).filter((i) => i >= 0);
  const alive = (s, p) => live(s, p).length > 0;
  const aliveSeats = (s) => everyone(s).filter((i) => alive(s, i));
  function bcEnd(s) {
    const left = aliveSeats(s);
    s.scores = everyone(s).map((i) => live(s, i).length);
    if (left.length > 1) return false;
    s.done = true; s.phase = "done"; s.stage = "done"; s.winners = left; s.turn = -1;
    s.message = `${nameOf(s, left[0])} rules the court!`;
    return true;
  }
  function bcTurn(s) {
    if (bcEnd(s)) return;
    const n = s.players.length; let t = s.turn;
    do t = (t + 1) % n; while (!alive(s, t));
    Object.assign(s, { turn: t, stage: "turn", pend: null, responders: [], answers: [] });
    s.message = `${nameOf(s, t)}'s turn.`;
  }
  function bcAsk(s, stage, who) { Object.assign(s, { stage, responders: who, answers: [] }); }
  function bcLose(s, p, then, why) {
    const l = live(s, p);
    s.log.unshift(why);
    if (l.length <= 1) { if (l.length) s.hands[p][l[0]].dead = true; if (bcEnd(s)) return; bcGo(s, then); }
    else { Object.assign(s, { stage: "lose", loser: p, then }); s.message = `${why} ${nameOf(s, p)} must turn a card face up.`; }
  }
  function bcGo(s, then) { if (s.done) return; if (then === "block") bcBlockStep(s); else if (then === "resolve") bcResolve(s); else bcTurn(s); }
  function bcBlockStep(s) {
    const m = MOVES[s.pend.kind];
    const who = !m.blockers ? [] : m.anyone ? aliveSeats(s).filter((i) => i !== s.pend.actor) : alive(s, s.pend.target) ? [s.pend.target] : [];
    if (!who.length) return bcResolve(s);
    bcAsk(s, "block", who);
    s.message = `${nameOf(s, s.pend.actor)} wants to ${m.label}${m.target ? ` on ${nameOf(s, s.pend.target)}` : ""}. Block it?`;
  }
  function bcChallenge(s, claimant, role, challenger, ifTrue, ifFalse) {
    const hand = s.hands[claimant], k = live(s, claimant).find((i) => hand[i].role === role);
    if (k !== undefined) {
      // Honest claim: show it, shuffle it back, draw a fresh card.
      s.court.push(hand[k].role); s.court = shuffled(s.court); hand[k].role = s.court.pop();
      bcLose(s, challenger, ifTrue, `${nameOf(s, claimant)} really had the ${COURT[role].name}!`);
    } else bcLose(s, claimant, ifFalse, `Caught bluffing! ${nameOf(s, claimant)} had no ${COURT[role].name}.`);
  }
  function bcResolve(s) {
    const { kind, actor, target } = s.pend;
    if (kind === "tax") s.coins[actor] += 3;
    if (kind === "aid") s.coins[actor] += 2;
    if (kind === "steal") { const amt = Math.min(2, s.coins[target]); s.coins[target] -= amt; s.coins[actor] += amt; s.log.unshift(`${nameOf(s, actor)} stole ${amt} from ${nameOf(s, target)}.`); }
    if ((kind === "strike" || kind === "coup") && alive(s, target)) return bcLose(s, target, "end", `${nameOf(s, actor)} ${kind === "coup" ? "launched a coup on" : "struck"} ${nameOf(s, target)}.`);
    if (kind === "exchange") { s.exch = [...live(s, actor).map((i) => s.hands[actor][i].role), s.court.pop(), s.court.pop()]; s.stage = "exchange"; s.message = `${nameOf(s, actor)} is trading with the court…`; return; }
    if (kind === "tax" || kind === "aid") s.log.unshift(`${nameOf(s, actor)} took ${kind === "tax" ? 3 : 2} coins.`);
    bcTurn(s);
  }
  const combos = (n, k) => { const out = []; const go = (start, acc) => { if (acc.length === k) return out.push([...acc]); for (let i = start; i < n; i++) go(i + 1, [...acc, i]); }; go(0, []); return out; };
  reg("bluff-court", {
    title: "Bluff Court", min: 2, max: 6, concurrentActions: ["respond"],
    rules: "<ol><li>You hold two secret cards and 2 coins. Lose both cards and you're out.</li><li>On your turn take Income (+1), Foreign Aid (+2) or a Coup (7 coins), or <em>claim</em> a role: Treasurer taxes 3, Shadow pays 3 to strike, Pirate steals 2, Diplomat trades cards.</li><li>Anyone can challenge a claim. Caught bluffing? Lose a card. Telling the truth? The challenger loses one.</li><li>Some moves can be blocked by claiming a role — and blocks can be challenged too. With 10+ coins you must coup. Last one standing wins.</li></ol>",
    create(players) {
      const s = base(players, 2, 6, { stage: "turn", pend: null, responders: [], answers: [], loser: -1, then: "", exch: null, log: [] });
      s.court = shuffled(Object.keys(COURT).flatMap((r) => [r, r, r]));
      s.hands = s.players.map(() => [{ role: s.court.pop(), dead: false }, { role: s.court.pop(), dead: false }]);
      s.coins = s.players.map(() => 2); s.scores = s.players.map(() => 2);
      s.phase = "play"; s.turn = -1; bcTurn(s);
      return s;
    },
    act(s, p, a) {
      if (!seat(s, p) || s.done) return false;
      const n = s.players.length;
      if (a.type === "declare" && s.stage === "turn" && p === s.turn) {
        const m = MOVES[a.kind]; if (!m || !Object.hasOwn(MOVES, a.kind)) return false;
        if (s.coins[p] >= 10 && a.kind !== "coup") return false;
        if ((m.cost || 0) > s.coins[p]) return false;
        let target = -1;
        if (m.target) { target = int(a.target, 0, n - 1); if (target === null || target === p || !alive(s, target)) return false; }
        if (a.kind === "steal" && s.coins[target] === 0) return false;
        s.coins[p] -= m.cost || 0;
        s.pend = { kind: a.kind, actor: p, target, claim: m.claim || "", blocker: -1, blockRole: "" };
        if (a.kind === "income") { s.coins[p]++; s.log.unshift(`${nameOf(s, p)} took income.`); bcTurn(s); return true; }
        if (a.kind === "coup") { bcResolve(s); return true; }
        if (m.claim) { bcAsk(s, "challenge", aliveSeats(s).filter((i) => i !== p)); s.message = `${nameOf(s, p)} claims the ${COURT[m.claim].name} to ${m.label}${m.target ? ` ${nameOf(s, target)}` : ""}. Challenge?`; return true; }
        bcBlockStep(s); return true;
      }
      if (a.type === "respond" && ["challenge", "block", "blockChallenge"].includes(s.stage)) {
        if (!s.responders.includes(p) || s.answers.includes(p)) return false;
        const pd = s.pend, m = MOVES[pd.kind];
        if (a.answer === "allow") {
          s.answers.push(p);
          if (s.responders.every((i) => s.answers.includes(i))) {
            if (s.stage === "challenge") bcBlockStep(s);
            else if (s.stage === "block") bcResolve(s);
            else { s.log.unshift(`${nameOf(s, pd.blocker)} blocked ${nameOf(s, pd.actor)} with the ${COURT[pd.blockRole].name}.`); bcTurn(s); }
          }
          return true;
        }
        if (a.answer === "challenge" && s.stage === "challenge") { s.log.unshift(`${nameOf(s, p)} challenged ${nameOf(s, pd.actor)}!`); bcChallenge(s, pd.actor, pd.claim, p, "block", "end"); return true; }
        if (a.answer === "challenge" && s.stage === "blockChallenge") { s.log.unshift(`${nameOf(s, p)} challenged the block!`); bcChallenge(s, pd.blocker, pd.blockRole, p, "end", "resolve"); return true; }
        if (a.answer === "block" && s.stage === "block" && m.blockers.includes(a.role)) {
          pd.blocker = p; pd.blockRole = a.role;
          bcAsk(s, "blockChallenge", aliveSeats(s).filter((i) => i !== p));
          s.message = `${nameOf(s, p)} blocks with the ${COURT[a.role].name}. Challenge the block?`;
          return true;
        }
        return false;
      }
      if (a.type === "reveal" && s.stage === "lose" && p === s.loser) {
        const k = int(a.card, 0, 1); if (k === null || s.hands[p][k].dead) return false;
        s.hands[p][k].dead = true; s.log.unshift(`${nameOf(s, p)} lost the ${COURT[s.hands[p][k].role].name}.`);
        if (!bcEnd(s)) bcGo(s, s.then);
        return true;
      }
      if (a.type === "keep" && s.stage === "exchange" && p === s.pend.actor) {
        const slots = live(s, p), pick = String(a.keep || "").split(",").map((x) => int(x, 0, s.exch.length - 1));
        if (pick.length !== slots.length || pick.includes(null) || new Set(pick).size !== pick.length) return false;
        slots.forEach((slot, j) => { s.hands[p][slot].role = s.exch[pick[j]]; });
        s.exch.forEach((r, i) => { if (!pick.includes(i)) s.court.push(r); });
        s.court = shuffled(s.court); s.exch = null; s.log.unshift(`${nameOf(s, p)} traded cards with the court.`);
        bcTurn(s); return true;
      }
      if (a.type === "force" && p === 0) {
        if (["challenge", "block", "blockChallenge"].includes(s.stage)) { s.answers = [...s.responders]; const st = s.stage; if (st === "challenge") bcBlockStep(s); else if (st === "block") bcResolve(s); else bcTurn(s); return true; }
        if (s.stage === "lose") { const k = live(s, s.loser)[0]; s.hands[s.loser][k].dead = true; if (!bcEnd(s)) bcGo(s, s.then); return true; }
        if (s.stage === "exchange") { const slots = live(s, s.pend.actor); slots.forEach((slot, j) => { s.hands[s.pend.actor][slot].role = s.exch[j]; }); s.exch.slice(slots.length).forEach((r) => s.court.push(r)); s.court = shuffled(s.court); s.exch = null; bcTurn(s); return true; }
        if (s.stage === "turn") { s.coins[s.turn]++; s.log.unshift(`${nameOf(s, s.turn)} took income (host skipped).`); bcTurn(s); return true; }
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self;
      return {
        ...v, stage: s.stage, coins: [...s.coins], pend: s.pend ? { ...s.pend } : null, responders: [...s.responders], answers: [...s.answers], loser: s.loser, log: s.log.slice(0, 6), courtSize: s.court.length,
        hands: s.hands.map((h, i) => h.map((c) => c.dead || i === me || s.done ? { role: c.role, dead: c.dead } : { role: null, dead: false })),
        exch: me >= 0 && s.stage === "exchange" && s.pend?.actor === me ? [...s.exch] : null,
      };
    },
    render(v) {
      const me = v.self, card = (c, k, mine) => c.role ? `<span class="ax-court ax-court-${c.role} ${c.dead ? "is-dead" : ""}" title="${COURT[c.role].does}"><b>${COURT[c.role].icon}</b>${COURT[c.role].name}${mine && !c.dead ? `<small>${COURT[c.role].does}</small>` : ""}</span>` : `<span class="ax-court is-hidden"><b>🂠</b>Hidden</span>`;
      let body = scoreStrip(v, v.players.map((_, i) => `🪙${v.coins[i]}`), { text: v.hands.map((h) => h.filter((c) => !c.dead).length ? h.filter((c) => !c.dead).length + "♛" : "out"), out: v.hands.map((h) => h.every((c) => c.dead)) });
      body += `<div class="ax-courts">${v.players.map((p, i) => `<div class="ax-seat ${i === v.turn ? "is-turn" : ""} ${i === me ? "is-me" : ""}">${pawn(i, p.name)}<strong>${esc(p.name)}</strong><span class="ax-coins">🪙 ${v.coins[i]}</span><div class="ax-hand">${v.hands[i].map((c, k) => card(c, k, i === me)).join("")}</div></div>`).join("")}</div>`;
      if (!v.done) {
        if (v.stage === "turn" && me === v.turn) {
          const others = v.players.map((p, i) => [i, p.name]).filter(([i]) => i !== me && v.hands[i].some((c) => !c.dead || !c.role));
          const must = v.coins[me] >= 10;
          body += `<h3 class="pn-h">${must ? "10+ coins — you must launch a coup!" : "Your move"}</h3><div class="pn-form">${select("bc-target", "target", "Target", others)}</div><div class="ax-moves">${Object.entries(MOVES).map(([k, m]) => btn(`${m.claim ? COURT[m.claim].icon + " " : ""}${m.label}${m.cost ? ` (${m.cost})` : ""}`, "declare", `data-kind="${k}"`, (must && k !== "coup") || (m.cost || 0) > v.coins[me], m.claim ? "secondary" : "")).join("")}</div>${note("Claims can be bluffs — you don't need the card. Moves with a target use the picker above.")}`;
        } else if (v.stage === "turn") body += note(`Waiting for ${esc(v.players[v.turn].name)} to move…`);
        if (["challenge", "block", "blockChallenge"].includes(v.stage)) {
          const mine = v.responders.includes(me) && !v.answers.includes(me), m = MOVES[v.pend.kind];
          body += promptCard(v.stage === "block" ? "Block?" : "Challenge?", esc(v.message), "");
          if (mine) {
            const blocks = v.stage === "block" ? m.blockers.map((r) => btn(`${COURT[r].icon} Block as ${COURT[r].name}`, "respond", `data-answer="block" data-role="${r}"`, false, "secondary")).join("") : "";
            body += `<div class="ax-moves">${btn(v.stage === "block" ? "Let it happen" : "Allow", "respond", `data-answer="allow"`, false, "ghost")}${v.stage !== "block" ? btn("🚨 Challenge!", "respond", `data-answer="challenge"`) : ""}${blocks}</div>`;
          }
          body += waitingFor(v, v.players.map((_, i) => !v.responders.includes(i) || v.answers.includes(i)));
        }
        if (v.stage === "lose") body += me === v.loser ? `<h3 class="pn-h">Choose a card to turn face up</h3><div class="ax-moves">${v.hands[me].map((c, k) => c.dead ? "" : btn(`${COURT[c.role].icon} Lose ${COURT[c.role].name}`, "reveal", `data-card="${k}"`, false, "secondary")).join("")}</div>` : note(`${esc(v.players[v.loser].name)} is choosing a card to lose…`);
        if (v.stage === "exchange" && v.exch) { const k = v.hands[me].filter((c) => !c.dead).length; body += `<h3 class="pn-h">Keep ${k} card${k > 1 ? "s" : ""}</h3><div class="ax-moves">${combos(v.exch.length, k).map((c) => btn(c.map((i) => `${COURT[v.exch[i]].icon} ${COURT[v.exch[i]].name}`).join(" + "), "keep", `data-keep="${c.join(",")}"`, false, "secondary")).join("")}</div>`; }
        body += hostTools(v, btn("Skip the hold-up", "force", "", false, "secondary small"));
      }
      if (v.log.length) body += `<ul class="ax-log">${v.log.map((t) => `<li>${esc(t)}</li>`).join("")}</ul>`;
      return shell("court", v, body);
    },
  });
})();
