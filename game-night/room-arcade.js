"use strict";
// Arcade Night: ten online multiplayer games — real-time reflex, drawing, hidden roles and classics.
// Same room contract as every other game: create → act (host only) → view (per seat) → render.
// Timed games also expose tick(state, now), which the host calls ten times a second.
(() => {
  const R = window.RoomGames, G = window.GameNight, esc = G.esc;

  /* ── Helpers ─────────────────────────────────────────────────────── */
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffled = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const clean = (t, max = 80) => typeof t === "string" ? t.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
  const int = (v, min, max) => { if (typeof v !== "number" && (typeof v !== "string" || !/^-?\d+$/.test(v.trim()))) return null; const n = Number(v); return Number.isSafeInteger(n) && n >= min && n <= max ? n : null; };
  const seat = (s, n) => Number.isInteger(n) && n >= 0 && n < s.players.length;
  const nameOf = (s, i) => s.players[i]?.name || "Player";
  const everyone = (s) => s.players.map((_, i) => i);
  const base = (players, min, max, extra = {}) => {
    if (!Array.isArray(players) || players.length < min || players.length > max) throw new Error(`This game needs ${min}–${max} players.`);
    return { players: players.map(({ id, name }) => ({ id, name })), scores: players.map(() => 0), round: 1, totalRounds: 1, phase: "", turn: -1, done: false, winners: [], message: "", ...extra };
  };
  function finishByScore(s, lowWins = false) {
    const best = lowWins ? Math.min(...s.scores) : Math.max(...s.scores);
    s.winners = everyone(s).filter((i) => s.scores[i] === best);
    s.done = true; s.phase = "done"; s.turn = -1;
    s.message = s.winners.length === 1 ? `${nameOf(s, s.winners[0])} wins with ${best}!` : `${s.winners.map((i) => nameOf(s, i)).join(" & ")} tie with ${best}!`;
  }
  const publicBase = (s, viewer) => ({
    players: s.players.map((p) => ({ name: p.name })), self: seat(s, viewer) ? viewer : -1,
    scores: [...s.scores], round: s.round, totalRounds: s.totalRounds, phase: s.phase, turn: s.turn,
    done: s.done, winners: [...s.winners], message: s.message,
  });
  // Rendering helpers share the Party Night look (pn-* classes).
  const btn = (label, type, attrs = "", disabled = false, cls = "") => `<button class="button ${cls}" type="button" data-move="${type}" ${attrs}${disabled ? " disabled" : ""}>${label}</button>`;
  const field = (id, name, label, opts = {}) => `<label class="pn-field" for="${id}"><span>${esc(label)}</span><input id="${id}" data-field="${name}" type="text" maxlength="${opts.max || 60}" autocomplete="off" placeholder="${esc(opts.placeholder || "")}" ${opts.submit ? `data-submit="${opts.submit}"` : ""}></label>`;
  const note = (t) => `<p class="pn-note">${t}</p>`;
  const promptCard = (eyebrow, big, sub = "", cls = "") => `<div class="pn-prompt ${cls}"><span class="pn-eyebrow">${esc(eyebrow)}</span><div class="pn-big">${big}</div>${sub ? `<p>${sub}</p>` : ""}</div>`;
  function scoreStrip(v, marks = [], values = null) {
    return `<ol class="pn-scores" aria-label="Players">${v.players.map((p, i) => `<li class="${i === v.self ? "is-me" : ""} ${v.turn === i ? "is-turn" : ""} ${v.done && v.winners.includes(i) ? "is-winner" : ""} ${values?.out?.[i] ? "is-out" : ""}"><span class="pn-pawn pawn-${i % 8}" aria-hidden="true">${esc(p.name.slice(0, 1).toUpperCase())}</span><span class="pn-name">${esc(p.name)}${i === v.self ? " <small>you</small>" : ""}</span><b>${values?.text ? values.text[i] : v.scores[i]}</b>${marks[i] ? `<span class="pn-mark">${marks[i]}</span>` : ""}</li>`).join("")}</ol>`;
  }
  function finalBoard(v, lowWins = false, label = "Final standings") {
    if (!v.done) return "";
    const order = v.players.map((_, i) => i).sort((a, b) => lowWins ? v.scores[a] - v.scores[b] : v.scores[b] - v.scores[a]);
    return `<div class="pn-final"><span class="pn-eyebrow">${esc(label)}</span><ol>${order.map((i, place) => `<li class="${v.winners.includes(i) ? "is-winner" : ""}"><span class="pn-place">${place + 1}</span><span class="pn-pawn pawn-${i % 8}">${esc(v.players[i].name.slice(0, 1).toUpperCase())}</span><strong>${esc(v.players[i].name)}</strong><b>${v.scores[i]}</b></li>`).join("")}</ol></div>`;
  }
  const waitingFor = (v, done) => { const left = v.players.map((_, i) => i).filter((i) => !done[i]); return left.length ? `<p class="pn-waiting">Waiting for ${left.map((i) => esc(v.players[i].name)).join(", ")}…</p>` : ""; };
  const hostTools = (v, inner) => v.self === 0 && !v.done ? `<details class="pn-force"><summary>Host tools</summary>${inner}<p class="pn-note">Use these if someone stepped away.</p></details>` : "";
  const roundBadge = (v, label = "Round") => v.totalRounds > 1 ? `<span class="pn-round">${label} ${Math.min(v.round, v.totalRounds)} / ${v.totalRounds}</span>` : "";
  const shell = (game, v, body, extra = "") => `<div class="pn-game ax-game ax-g-${game}">${extra}${G.status(v.message, v.done)}${body}</div>`;
  const countdown = (ms, cls = "") => `<span class="ax-countdown ${cls}" data-countdown="${Math.max(0, Math.round(ms))}">${Math.max(0, Math.ceil(ms / 1000))}</span>`;
  const reg = (id, engine) => R.register(id, engine);

  /* ── 1. Quick Draw — wait for GO, tap first ─────────────────────── */
  // Reaction times are measured on each player's own screen from the moment GO appears,
  // so a slow connection doesn't cost anyone the round.
  const QD_ROUNDS = 7;
  function qdRound(s, now) {
    Object.assign(s, { phase: "wait", goAt: now + 1600 + rnd(3400), taps: s.players.map(() => null), faults: s.players.map(() => false), gained: s.players.map(() => 0), resolveAt: 0 });
    s.key = (s.key || 0) + 1; s.message = "Wait for it… tap only when it turns GREEN!";
  }
  function qdResolve(s, now) {
    const order = everyone(s).filter((i) => s.taps[i] !== null).sort((a, b) => s.taps[a] - s.taps[b]);
    order.forEach((i, place) => { s.gained[i] = [3, 2, 1][place] || 0; });
    everyone(s).forEach((i) => { if (s.faults[i]) s.gained[i] = -1; s.scores[i] += s.gained[i]; });
    s.phase = "result"; s.resolveAt = now;
    s.message = order.length ? `${nameOf(s, order[0])} is the fastest draw — ${s.taps[order[0]]} ms!` : "Nobody tapped in time!";
  }
  reg("quick-draw", {
    title: "Quick Draw", min: 2, max: 8, concurrentActions: ["tap", "next"],
    rules: "<ol><li>The screen says WAIT. When it flashes GREEN, tap as fast as you can.</li><li>Fastest scores 3, second 2, third 1. Tapping too early is a false start: −1.</li><li>Your time is measured on your own screen, so lag doesn't count against you. Seven rounds.</li></ol>",
    create(players) { const s = base(players, 2, 8, { totalRounds: QD_ROUNDS }); qdRound(s, Date.now()); return s; },
    tick(s, now) {
      if (s.phase === "wait" && now >= s.goAt) { s.phase = "go"; s.message = "GO! GO! GO!"; return true; }
      if (s.phase === "go" && now >= s.goAt + 4000) { qdResolve(s, now); return true; }
      if (s.phase === "result" && now >= s.resolveAt + 3500) { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; qdRound(s, now); } return true; }
      return false;
    },
    act(s, p, a) {
      if (!seat(s, p) || s.done) return false;
      if (a.type === "tap" && (s.phase === "wait" || s.phase === "go")) {
        if (s.taps[p] !== null || s.faults[p] || int(a.key, 0, 1e6) !== s.key) return false;
        const now = Date.now();
        if (s.phase === "wait" || now < s.goAt) { s.faults[p] = true; s.message = `${nameOf(s, p)} jumped the gun!`; }
        else {
          const reported = int(a.ms, 60, 4000), measured = now - s.goAt;
          // Trust the player's own screen, but never beyond what the host could have seen.
          s.taps[p] = reported !== null ? Math.min(reported, measured) : measured;
        }
        if (s.phase === "go" && everyone(s).every((i) => s.taps[i] !== null || s.faults[i])) qdResolve(s, now);
        return true;
      }
      if (a.type === "next" && s.phase === "result" && p === 0) { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; qdRound(s, Date.now()); } return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer);
      return { ...v, key: s.key, taps: [...s.taps], faults: [...s.faults], gained: s.phase === "result" || s.done ? [...s.gained] : [], tapped: viewer >= 0 && (s.taps[viewer] !== null || s.faults[viewer]) };
    },
    render(v) {
      const marks = v.players.map((_, i) => v.faults[i] ? "false start" : v.taps[i] !== null && (v.phase === "result" || v.done) ? `${v.taps[i]} ms` : v.taps[i] !== null ? "✓" : "");
      let body = scoreStrip(v, marks);
      if (v.phase === "wait" || v.phase === "go") {
        const go = v.phase === "go";
        body += `<button type="button" class="ax-pad ${go ? "is-go" : "is-wait"} ${v.tapped ? "is-done" : ""}" data-move="tap" data-key="${v.key}" ${go ? "data-timed" : ""} ${v.self < 0 || v.tapped ? "disabled" : ""}>${go ? `<span data-clock-key="qd-${v.key}">GO!</span><small>TAP NOW</small>` : `<span>WAIT…</span><small>${v.tapped ? "You jumped the gun!" : "Tap when it turns green"}</small>`}</button>`;
      }
      if (v.phase === "result") body += `<div class="ax-results">${v.players.map((p, i) => `<div class="ax-result ${v.gained[i] > 0 ? "is-good" : v.gained[i] < 0 ? "is-bad" : ""}"><strong>${esc(p.name)}</strong><span>${v.faults[i] ? "False start" : v.taps[i] !== null ? v.taps[i] + " ms" : "—"}</span><b>${v.gained[i] > 0 ? "+" : ""}${v.gained[i]}</b></div>`).join("")}</div>${note("Next round starts in a moment…")}`;
      return shell("quickdraw", v, body + finalBoard(v), roundBadge(v));
    },
  });

  /* ── 2. Color Rush — tap the INK color, not the word ─────────────── */
  const RUSH_COLORS = [["red", "#e23d3d"], ["blue", "#2f6fe4"], ["green", "#23a35a"], ["yellow", "#e8b400"], ["purple", "#8a4fd8"], ["orange", "#f07a1a"]];
  function rushRound(s, now) {
    const picks = shuffled(RUSH_COLORS.map((_, i) => i)).slice(0, 4), ink = picks[rnd(4)];
    let word = picks[rnd(4)]; if (word === ink) word = picks.find((c) => c !== ink);
    Object.assign(s, { phase: "ready", startAt: now + 1500, options: shuffled(picks), ink, word, answers: s.players.map(() => null), gained: s.players.map(() => 0), resolveAt: 0 });
    s.key = (s.key || 0) + 1; s.message = "Get ready… tap the INK color, not the word!";
  }
  function rushResolve(s, now) {
    const right = everyone(s).filter((i) => s.answers[i]?.ok).sort((a, b) => s.answers[a].ms - s.answers[b].ms);
    right.forEach((i, place) => { s.gained[i] = [3, 2, 1][place] || 1; });
    everyone(s).forEach((i) => { if (s.answers[i] && !s.answers[i].ok) s.gained[i] = -1; s.scores[i] += s.gained[i]; });
    s.phase = "result"; s.resolveAt = now;
    s.message = right.length ? `${nameOf(s, right[0])} saw through it first! The ink was ${RUSH_COLORS[s.ink][0].toUpperCase()}.` : `Tricky! The ink was ${RUSH_COLORS[s.ink][0].toUpperCase()}.`;
  }
  reg("color-rush", {
    title: "Color Rush", min: 2, max: 8, concurrentActions: ["pick", "next"],
    rules: "<ol><li>A color word appears printed in a DIFFERENT color of ink.</li><li>Tap the button matching the INK color — not what the word says.</li><li>Fastest right answers score 3, 2, 1 (any other right answer 1). Wrong: −1. Ten rounds.</li></ol>",
    create(players) { const s = base(players, 2, 8, { totalRounds: 10 }); rushRound(s, Date.now()); return s; },
    tick(s, now) {
      if (s.phase === "ready" && now >= s.startAt) { s.phase = "go"; s.message = "Tap the INK color!"; return true; }
      if (s.phase === "go" && now >= s.startAt + 6000) { rushResolve(s, now); return true; }
      if (s.phase === "result" && now >= s.resolveAt + 3000) { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; rushRound(s, now); } return true; }
      return false;
    },
    act(s, p, a) {
      if (!seat(s, p) || s.done) return false;
      if (a.type === "pick" && s.phase === "go") {
        const c = int(a.color, 0, RUSH_COLORS.length - 1);
        if (c === null || !s.options.includes(c) || s.answers[p] || int(a.key, 0, 1e6) !== s.key) return false;
        const measured = Date.now() - s.startAt, reported = int(a.ms, 80, 6000);
        s.answers[p] = { ok: c === s.ink, ms: reported !== null ? Math.min(reported, measured) : measured };
        if (everyone(s).every((i) => s.answers[i])) rushResolve(s, Date.now());
        return true;
      }
      if (a.type === "next" && s.phase === "result" && p === 0) { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; rushRound(s, Date.now()); } return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), open = s.phase === "result" || s.done;
      return { ...v, key: s.key, options: s.phase === "go" || open ? [...s.options] : [], word: s.phase === "go" || open ? s.word : null, ink: s.phase === "go" || open ? s.ink : null, answered: s.answers.map(Boolean), own: viewer >= 0 ? s.answers[viewer] : null, answers: open ? s.answers.map((x) => x && { ...x }) : null, gained: open ? [...s.gained] : [] };
    },
    render(v) {
      const marks = v.answers ? v.answers.map((x) => x ? (x.ok ? `${x.ms} ms` : "✗") : "—") : v.answered.map((x) => x ? "✓" : "");
      let body = scoreStrip(v, marks);
      if (v.phase === "ready") body += `<div class="ax-stage is-ready"><span class="ax-big">Ready…</span><small>Tap the INK color, not the word</small></div>`;
      if (v.phase === "go" || v.phase === "result" || v.done) {
        if (v.word !== null) body += `<div class="ax-stage ${v.phase === "go" ? "is-go" : ""}"><span class="ax-word" style="color:${RUSH_COLORS[v.ink][1]}" ${v.phase === "go" ? `data-clock-key="cr-${v.key}"` : ""}>${RUSH_COLORS[v.word][0].toUpperCase()}</span></div>`;
        body += `<div class="ax-swatches">${v.options.map((c) => `<button type="button" class="ax-swatch ${v.own && v.phase !== "go" && c === v.ink ? "is-right" : ""}" style="--sw:${RUSH_COLORS[c][1]}" data-move="pick" data-color="${c}" data-key="${v.key}" data-timed ${v.phase !== "go" || v.self < 0 || v.own ? "disabled" : ""}>${RUSH_COLORS[c][0]}</button>`).join("")}</div>`;
        if (v.own && v.phase === "go") body += note(v.own.ok ? `Locked in at ${v.own.ms} ms!` : "Oops — that was the word, not the ink.");
      }
      return shell("rush", v, body + finalBoard(v), roundBadge(v));
    },
  });

  /* ── 3. Hot Potato — do the tiny task, pass the bomb, don't be holding it ── */
  const POTATO_ICONS = ["🍕", "🐸", "🚀", "🎸", "🌵", "🍩", "⚽", "🦄", "🍉", "🎈", "🐙", "⭐"];
  function potatoTask(s) { const opts = shuffled(POTATO_ICONS).slice(0, 4); s.task = { options: opts, target: opts[rnd(4)] }; s.taskDone = false; s.lockUntil = 0; }
  function potatoFuse(s, now, holder) { s.fuseAt = now + 9000 + rnd(13000); s.fuseStart = now; s.holder = holder; s.lastPasser = -1; potatoTask(s); s.passes = 0; }
  reg("hot-potato", {
    title: "Hot Potato", min: 3, max: 8, concurrentActions: ["task", "pass"],
    rules: "<ol><li>One player holds the sizzling bomb. Its fuse is secret.</li><li>To pass it, first tap the matching picture (a wrong tap freezes you for a second), then pick who gets it. No passing straight back!</li><li>Holding it when it pops costs a life. Lose all three and you're out. Last one standing wins.</li></ol>",
    create(players) { const s = base(players, 3, 8, { phase: "play", lives: players.map(() => 3), pops: 0 }); potatoFuse(s, Date.now(), rnd(players.length)); s.message = `${nameOf(s, s.holder)} has the bomb! Pass it quick!`; return s; },
    tick(s, now) {
      if (s.phase === "play" && now >= s.fuseAt) {
        const loser = s.holder; s.lives[loser]--; s.pops++;
        const alive = everyone(s).filter((i) => s.lives[i] > 0);
        s.message = `💥 BOOM! ${nameOf(s, loser)} was holding it${s.lives[loser] ? ` (${s.lives[loser]} ${s.lives[loser] === 1 ? "life" : "lives"} left)` : " and is out"}!`;
        if (alive.length === 1) { s.scores = s.lives.map((l) => l); s.winners = alive; s.done = true; s.phase = "done"; s.message += ` ${nameOf(s, alive[0])} survives and wins!`; return true; }
        s.phase = "boom"; s.boomAt = now; s.boomed = loser; return true;
      }
      if (s.phase === "boom" && now >= s.boomAt + 2500) {
        const alive = everyone(s).filter((i) => s.lives[i] > 0);
        potatoFuse(s, now, alive[rnd(alive.length)]); s.phase = "play"; s.message = `New fuse lit! ${nameOf(s, s.holder)} has the bomb.`; return true;
      }
      if (s.phase === "play" && s.lockUntil && now >= s.lockUntil) { s.lockUntil = 0; return true; }
      return false;
    },
    act(s, p, a) {
      if (!seat(s, p) || s.done || s.phase !== "play" || p !== s.holder) return false;
      if (a.type === "task" && !s.taskDone) {
        if (s.lockUntil && Date.now() < s.lockUntil) return false;
        if (typeof a.icon !== "string" || !s.task.options.includes(a.icon)) return false;
        if (a.icon === s.task.target) { s.taskDone = true; s.message = `${nameOf(s, p)} is ready to throw!`; }
        else { s.lockUntil = Date.now() + 1200; s.message = `${nameOf(s, p)} fumbled! Frozen for a second…`; }
        return true;
      }
      if (a.type === "pass" && s.taskDone) {
        const t = int(a.target, 0, s.players.length - 1);
        if (t === null || t === p || s.lives[t] <= 0 || (t === s.lastPasser && everyone(s).filter((i) => s.lives[i] > 0).length > 2)) return false;
        s.lastPasser = p; s.holder = t; s.passes++; potatoTask(s); s.message = `${nameOf(s, p)} tossed it to ${nameOf(s, t)}!`;
        return true;
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), now = Date.now(), holding = viewer === s.holder;
      // How hot is it? A rough hint only — the exact fuse stays secret on the host.
      const heat = s.phase === "play" ? Math.min(1, (now - s.fuseStart) / 16000) : 1;
      return { ...v, lives: [...s.lives], holder: s.holder, lastPasser: s.lastPasser, heat: Math.round(heat * 4), task: holding && s.phase === "play" ? { options: [...s.task.options], target: s.task.target } : null, taskDone: holding ? s.taskDone : false, locked: holding && s.lockUntil > now, boomed: s.phase === "boom" ? s.boomed : -1 };
    },
    render(v) {
      const hearts = v.lives.map((l) => "♥".repeat(l) || "out");
      let body = scoreStrip({ ...v, turn: v.holder }, v.players.map((_, i) => i === v.holder && v.phase === "play" ? "💣" : ""), { text: hearts, out: v.lives.map((l) => l <= 0) });
      if (v.phase === "boom") body += `<div class="ax-stage is-boom"><span class="ax-big">💥 BOOM!</span><small>${esc(v.players[v.boomed].name)} loses a life</small></div>`;
      if (v.phase === "play") {
        body += `<div class="ax-bomb heat-${v.heat} ${v.self === v.holder ? "is-mine" : ""}"><span class="ax-bomb-icon">💣</span><strong>${v.self === v.holder ? "YOU have the bomb!" : `${esc(v.players[v.holder].name)} has it`}</strong></div>`;
        if (v.task && !v.taskDone) body += `<h3 class="pn-h">Tap the ${v.task.target} to grab a good grip:</h3><div class="ax-icons">${v.task.options.map((ic) => `<button type="button" class="ax-icon" data-move="task" data-icon="${ic}" ${v.locked ? "disabled" : ""}>${ic}</button>`).join("")}</div>${v.locked ? note("Fumbled! Frozen…") : ""}`;
        if (v.self === v.holder && v.taskDone) body += `<h3 class="pn-h">Throw it to…</h3><div class="pn-options pn-people">${v.players.map((p, i) => i === v.self || v.lives[i] <= 0 ? "" : `<button type="button" class="pn-option" data-move="pass" data-target="${i}" ${i === v.lastPasser && v.lives.filter((l) => l > 0).length > 2 ? "disabled" : ""}><span class="pn-pawn pawn-${i % 8}">${esc(p.name.slice(0, 1).toUpperCase())}</span>${esc(p.name)}</button>`).join("")}</div>`;
        if (v.self !== v.holder) body += note(v.lives[v.self] > 0 ? "Get ready — it could be coming your way!" : "You're out — enjoy the show!");
      }
      return shell("potato", v, body + (v.done ? finalBoard({ ...v }, false, "Lives left") : ""));
    },
  });

  // Shared with the other room-arcade-*.js files.
  window.ArcadeKit = { rnd, shuffled, clean, int, seat, nameOf, everyone, base, finishByScore, publicBase, btn, field, note, promptCard, scoreStrip, finalBoard, waitingFor, hostTools, roundBadge, shell, countdown, reg };
})();
