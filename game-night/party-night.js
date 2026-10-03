"use strict";
// Party Night: twenty online party games for 2–8 friends.
// Every engine follows the room contract: create → act (host only) → view (per seat) → render.
// Views are the only thing that leaves the host, so secrets stay in state until reveal.
(() => {
  const R = window.RoomGames, G = window.GameNight, D = window.PartyNightData, esc = G.esc;

  /* ── Shared helpers ─────────────────────────────────────────────── */
  const rnd = (n) => Math.floor(Math.random() * n);
  const shuffled = (list) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pickSome = (list, n) => shuffled(list).slice(0, n);
  const clean = (text, max = 120) => typeof text === "string" ? text.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max) : "";
  const norm = (text) => clean(String(text ?? ""), 200).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "").replace(/&/g, "and").replace(/[^a-z0-9]/g, "");
  const loose = (text) => { let t = norm(text).replace(/^(the|a|an)(?=.)/, ""); if (t.length > 3 && t.endsWith("s")) t = t.slice(0, -1); return t; };
  const int = (value, min, max) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+$/.test(value.trim()))) return null;
    const n = Number(value); return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
  };
  // The room UI sends every on-screen field with each move, so extra keys are ignored; each move reads only what it needs.
  const shape = (a) => a !== null && typeof a === "object" && !Array.isArray(a) && typeof a.type === "string";
  const seat = (s, n) => Number.isInteger(n) && n >= 0 && n < s.players.length;
  const nameOf = (s, i) => s.players[i]?.name || "Player";
  const everyone = (s) => s.players.map((_, i) => i);
  const base = (players, min, max, extra = {}) => {
    if (!Array.isArray(players) || players.length < min || players.length > max) throw new Error(`This game needs ${min}–${max} players.`);
    return { players: players.map(({ id, name }) => ({ id, name })), scores: players.map(() => 0), round: 1, totalRounds: 1, phase: "", turn: -1, done: false, winners: [], message: "", ...extra };
  };
  function finishByScore(s, note = "") {
    const best = Math.max(...s.scores);
    s.winners = everyone(s).filter((i) => s.scores[i] === best);
    s.done = true; s.phase = "done"; s.turn = -1;
    s.message = (note ? note + " " : "") + (s.winners.length === 1 ? `${nameOf(s, s.winners[0])} wins with ${best} points!` : `${s.winners.map((i) => nameOf(s, i)).join(" & ")} tie with ${best} points!`);
  }
  function finishTeam(s, winners, message) { s.winners = winners; s.done = true; s.phase = "done"; s.turn = -1; s.message = message; s.winners.forEach((i) => { s.scores[i] += 1; }); }
  const publicBase = (s, viewer) => ({
    players: s.players.map((p) => ({ name: p.name })), self: seat(s, viewer) ? viewer : -1,
    scores: [...s.scores], round: s.round, totalRounds: s.totalRounds, phase: s.phase, turn: s.turn,
    done: s.done, winners: [...s.winners], message: s.message,
  });
  // Rank-based points: 300 / 200 / 100, then 50 for any other correct answer.
  const rankPoints = (place) => [300, 200, 100][place] ?? 50;

  // Every engine rejects anything that is not a plain move object before its own checks run.
  const reg = (id, engine) => { const act = engine.act; engine.act = (s, actor, a) => shape(a) ? act(s, actor, a) : false; R.register(id, engine); };

  /* ── Shared rendering ───────────────────────────────────────────── */
  const btn = (label, type, attrs = "", disabled = false, cls = "") => `<button class="button ${cls}" type="button" data-move="${type}" ${attrs}${disabled ? " disabled" : ""}>${label}</button>`;
  const field = (id, name, label, opts = {}) => `<label class="pn-field" for="${id}"><span>${esc(label)}</span><input id="${id}" data-field="${name}" ${opts.type ? `type="${opts.type}"` : 'type="text"'} maxlength="${opts.max || 120}" autocomplete="off" spellcheck="${opts.spell === false ? "false" : "true"}" placeholder="${esc(opts.placeholder || "")}" ${opts.submit ? `data-submit="${opts.submit}"` : ""} ${opts.extra || ""}></label>`;
  const select = (id, name, label, options, selected = "") => `<label class="pn-field" for="${id}"><span>${esc(label)}</span><select id="${id}" data-field="${name}">${options.map(([value, text]) => `<option value="${esc(value)}" ${String(value) === String(selected) ? "selected" : ""}>${esc(text)}</option>`).join("")}</select></label>`;
  const promptCard = (eyebrow, big, sub = "", cls = "") => `<div class="pn-prompt ${cls}"><span class="pn-eyebrow">${esc(eyebrow)}</span><div class="pn-big">${big}</div>${sub ? `<p>${sub}</p>` : ""}</div>`;
  const note = (text) => `<p class="pn-note">${text}</p>`;
  function scoreStrip(v, marks = []) {
    return `<ol class="pn-scores" aria-label="Scores">${v.players.map((p, i) => `<li class="${i === v.self ? "is-me" : ""} ${v.turn === i ? "is-turn" : ""} ${v.winners.includes(i) && v.done ? "is-winner" : ""}"><span class="pn-pawn pawn-${i % 8}" aria-hidden="true">${esc(p.name.slice(0, 1).toUpperCase())}</span><span class="pn-name">${esc(p.name)}${i === v.self ? " <small>you</small>" : ""}</span><b>${v.scores[i]}</b>${marks[i] ? `<span class="pn-mark">${marks[i]}</span>` : ""}</li>`).join("")}</ol>`;
  }
  const roundBadge = (v, label = "Round") => v.totalRounds > 1 ? `<span class="pn-round">${label} ${Math.min(v.round, v.totalRounds)} / ${v.totalRounds}</span>` : "";
  const statusLine = (v) => G.status(v.message, v.done);
  function finalBoard(v) {
    if (!v.done) return "";
    const order = v.players.map((p, i) => i).sort((a, b) => v.lowWins ? v.scores[a] - v.scores[b] : v.scores[b] - v.scores[a]);
    return `<div class="pn-final"><span class="pn-eyebrow">Final standings</span><ol>${order.map((i, place) => `<li class="${v.winners.includes(i) ? "is-winner" : ""}"><span class="pn-place">${place + 1}</span><span class="pn-pawn pawn-${i % 8}">${esc(v.players[i].name.slice(0, 1).toUpperCase())}</span><strong>${esc(v.players[i].name)}</strong><b>${v.scores[i]}</b></li>`).join("")}</ol></div>`;
  }
  const waitingFor = (v, done) => {
    const left = v.players.map((p, i) => i).filter((i) => !done[i]);
    return left.length ? `<p class="pn-waiting">Waiting for ${left.map((i) => esc(v.players[i].name)).join(", ")}…</p>` : "";
  };
  const forceButton = (v, label = "Move on without them") => v.self === 0 && !v.done ? `<details class="pn-force"><summary>Table host tools</summary>${btn(label, "force", "", false, "secondary small")}<p class="pn-note">Use this if someone stepped away.</p></details>` : "";
  const shell = (game, v, body) => `<div class="pn-game pn-g-${game}">${roundBadge(v)}${statusLine(v)}${body}${finalBoard(v)}</div>`;

  /* ── Pattern 1: write, vote, reveal (Punchline, Acro Night, Dictionary Bluff) ── */
  function writeVoteGame(cfg) {
    return {
      title: cfg.title, min: 3, max: 8, rules: cfg.rules, concurrentActions: ["submit", "vote"],
      create(players) {
        const s = base(players, 3, 8, { totalRounds: cfg.rounds, deck: shuffled(cfg.deck().map((_, i) => i)) });
        startWrite(s); return s;
      },
      act(s, actor, a) {
        if (!seat(s, actor) || s.done) return false;
        if (a.type === "submit" && shape(a, ["type", "text"]) && s.phase === "write") {
          const text = clean(a.text, cfg.max || 90); if (!text) return false;
          if (cfg.validate && !cfg.validate(text, s)) return false;
          s.answers[actor] = text;
          if (s.answers.every((x) => x !== null)) openVote(s);
          else s.message = `${s.answers.filter((x) => x !== null).length} of ${s.players.length} answers are in.`;
          return true;
        }
        if (a.type === "vote" && shape(a, ["type", "option"]) && s.phase === "vote") {
          const o = int(a.option, 0, s.options.length - 1); if (o === null || s.options[o].owner === actor || s.truthers.includes(actor) && s.options[o].owner === -1) return false;
          s.votes[actor] = o;
          if (everyone(s).every((i) => s.votes[i] !== null || !voterNeeded(s, i))) score(s);
          return true;
        }
        if (a.type === "force" && shape(a, ["type"]) && actor === 0) {
          if (s.phase === "write" && s.answers.filter((x) => x !== null).length >= (cfg.real ? 1 : 2)) { openVote(s); return true; }
          if (s.phase === "vote" && s.votes.some((x) => x !== null)) { score(s); return true; }
          return false;
        }
        if (a.type === "next" && shape(a, ["type"]) && s.phase === "reveal") {
          if (s.round >= s.totalRounds) { finishByScore(s); return true; }
          s.round++; startWrite(s); return true;
        }
        return false;
      },
      view(s, viewer) {
        const v = publicBase(s, viewer), me = v.self;
        return { ...v, prompt: cfg.publicPrompt ? cfg.publicPrompt(s.prompt, s.phase === "reveal" || s.phase === "done") : s.prompt, submitted: s.answers.map((x) => x !== null), ownAnswer: me >= 0 ? s.answers[me] : null,
          options: s.phase === "vote" || s.phase === "reveal" || s.phase === "done" ? s.options.map((o, i) => ({ text: o.text, own: o.owner === me, owner: s.phase === "vote" ? null : o.owner, real: s.truthers.includes(me) && o.owner === -1, votes: s.phase === "vote" ? null : s.votes.filter((x) => x === i).length })) : [],
          voted: s.votes.map((x) => x !== null), ownVote: me >= 0 ? s.votes[me] : null, gained: s.phase === "vote" ? [] : [...s.gained], truther: s.truthers.includes(me) };
      },
      render(v) {
        let body = "";
        const marks = v.phase === "write" ? v.submitted.map((x) => x ? "✓" : "…") : v.phase === "vote" ? v.voted.map((x) => x ? "✓" : "…") : v.gained.map((g) => g ? `+${g}` : "");
        body += scoreStrip(v, marks);
        body += cfg.promptHtml(v.prompt);
        if (v.phase === "write") {
          body += v.self < 0 ? note("You're watching this round.") : `<div class="pn-form">${field("pn-answer", "text", v.ownAnswer ? "Change your answer" : cfg.inputLabel, { max: cfg.max || 90, placeholder: cfg.placeholder, submit: "submit" })}${btn(v.ownAnswer ? "Update answer" : "Lock it in", "submit")}</div>${v.ownAnswer ? note(`Your answer: <strong>${esc(v.ownAnswer)}</strong>`) : ""}${cfg.hint ? note(cfg.hint(v.prompt)) : ""}`;
          body += waitingFor(v, v.submitted) + forceButton(v);
        }
        if (v.phase === "vote") {
          body += `<h3 class="pn-h">${esc(cfg.voteTitle)}</h3><div class="pn-options">${v.options.map((o, i) => `<button class="pn-option ${v.ownVote === i ? "is-picked" : ""}" type="button" data-move="vote" data-option="${i}" ${o.own || v.self < 0 || (v.truther && o.real) ? "disabled" : ""}><span class="pn-letter">${String.fromCharCode(65 + i)}</span>${esc(o.text)}${o.own ? " <small>(yours)</small>" : ""}</button>`).join("")}</div>${v.truther ? note("You wrote the real answer, so you already scored. Sit back and enjoy the bluffs.") : ""}${waitingFor(v, v.voted)}${forceButton(v, "Count the votes now")}`;
        }
        if (v.phase === "reveal" || v.phase === "done") {
          body += `<div class="pn-options is-reveal">${v.options.map((o) => `<div class="pn-option ${o.owner === -1 ? "is-real" : ""}"><span class="pn-letter">${o.votes}</span>${esc(o.text)}<small>${o.owner === -1 ? "The real answer" : `by ${esc(v.players[o.owner]?.name || "")}`}</small></div>`).join("")}</div>`;
          if (v.phase === "reveal") body += btn(v.round >= v.totalRounds ? "See final scores" : "Next round →", "next");
        }
        return shell(cfg.cls, v, body);
      },
    };
    function startWrite(s) {
      const deck = cfg.deck();
      if (!s.deck.length) s.deck = shuffled(deck.map((_, i) => i));
      s.prompt = cfg.makePrompt(deck[s.deck.pop()]);
      s.phase = "write"; s.answers = s.players.map(() => null); s.votes = s.players.map(() => null); s.options = []; s.gained = s.players.map(() => 0); s.truthers = [];
      s.message = cfg.writeMessage;
    }
    function openVote(s) {
      const real = cfg.real ? cfg.real(s.prompt) : null;
      const opts = [];
      s.answers.forEach((text, owner) => {
        if (text === null) return;
        if (real && loose(text) === loose(real)) { s.truthers.push(owner); return; }
        if (opts.some((o) => loose(o.text) === loose(text))) return; // identical answers collapse into the first one
        opts.push({ text, owner });
      });
      if (real) opts.push({ text: real, owner: -1 });
      s.options = shuffled(opts); s.phase = "vote"; s.message = cfg.voteMessage;
      if (s.options.length < 2) score(s);
    }
    function voterNeeded(s, i) { return s.options.some((o, k) => o.owner !== i && !(s.truthers.includes(i) && o.owner === -1)) && !s.truthers.includes(i) || (cfg.real && !s.truthers.includes(i)); }
    function score(s) {
      s.gained = s.players.map(() => 0);
      s.truthers.forEach((i) => { s.gained[i] += 150; });
      s.votes.forEach((o, voter) => {
        if (o === null) return; const opt = s.options[o];
        if (opt.owner === -1) s.gained[voter] += 100; else s.gained[opt.owner] += cfg.real ? 50 : 100;
      });
      s.gained.forEach((g, i) => { s.scores[i] += g; });
      s.phase = "reveal"; s.message = cfg.revealMessage(s);
    }
  }

  reg("punchline", writeVoteGame({
    title: "Punchline", cls: "punchline", rounds: 5, max: 80,
    deck: () => D.punchlines, makePrompt: (p) => p,
    promptHtml: (p) => promptCard("Fill in the blank", esc(p).replace("____", '<span class="pn-blank">_____</span>')),
    inputLabel: "Your funniest answer", placeholder: "Make the table laugh…",
    writeMessage: "Everyone fills the blank in secret. Funniest answers win votes.",
    voteTitle: "Vote for your favorite (not your own)", voteMessage: "Answers are anonymous. Vote for the one that made you laugh.",
    revealMessage: () => "Every vote is worth 100 points.",
    rules: "<ol><li>Everyone sees the same prompt and secretly fills in the blank.</li><li>Answers are shown anonymously. Vote for your favorite — you can't vote for your own.</li><li>Each vote you receive is worth 100 points. Five rounds; most points wins.</li></ol>",
  }));
  const acroLetters = "AAABBBCCCDDDEEFFFGGHHHIJKLLLMMMNNOOPPPQRRRSSSSTTTUVWWY";
  reg("acro-night", writeVoteGame({
    title: "Acro Night", cls: "acro", rounds: 5, max: 90,
    deck: () => Array.from({ length: 20 }, (_, i) => 3 + (i % 3)),
    makePrompt: (length) => Array.from({ length }, () => acroLetters[rnd(acroLetters.length)]).join(""),
    validate(text, s) {
      const words = text.split(/\s+/).map((w) => w.replace(/^[^a-z0-9]+/i, "")).filter(Boolean);
      return words.length === s.prompt.length && words.every((w, i) => w[0].toUpperCase() === s.prompt[i]);
    },
    promptHtml: (p) => promptCard("Make a phrase from these letters", `<span class="pn-tiles">${[...p].map((c) => `<b>${esc(c)}</b>`).join("")}</span>`),
    hint: (p) => `Use exactly ${p.length} words, starting with ${[...p].join(" · ")} in that order.`,
    inputLabel: "Your phrase", placeholder: "One word per letter…",
    writeMessage: "Turn the letters into the best phrase you can.",
    voteTitle: "Vote for the best phrase", voteMessage: "Vote for your favorite phrase — not your own.",
    revealMessage: () => "Every vote is worth 100 points.",
    rules: "<ol><li>A few random letters appear. Write a phrase with one word per letter, in order (C·A·T → “Cows Ate Tacos”).</li><li>Vote for your favorite phrase — not your own.</li><li>Each vote is worth 100 points. Five rounds.</li></ol>",
  }));
  reg("dictionary-bluff", writeVoteGame({
    title: "Dictionary Bluff", cls: "dictionary", rounds: 5, max: 110,
    deck: () => D.definitions, makePrompt: ([word, meaning]) => ({ word, meaning }), real: (p) => p.meaning,
    publicPrompt: (p, open) => ({ word: p.word, meaning: open ? p.meaning : null }), // the real meaning stays on the host until the reveal
    promptHtml: (p) => promptCard("What does this word mean?", `<span class="pn-word">${esc(p.word)}</span>`, "Write a convincing fake definition."),
    inputLabel: "Your fake definition", placeholder: "Sound like a dictionary…",
    writeMessage: "Invent a definition that sounds real enough to fool everyone.",
    voteTitle: "Which definition is real?", voteMessage: "One of these is the real definition. Find it!",
    revealMessage: () => "+100 for finding the truth, +50 for each friend your fake fooled.",
    rules: "<ol><li>A strange (but real) word appears. Everyone writes a believable fake definition.</li><li>The fakes are shuffled with the real definition. Vote for the one you think is real.</li><li>Find the truth: +100. Each player fooled by your fake: +50. Accidentally write the real meaning: +150.</li></ol>",
  }));

  /* ── Pattern 2: everyone answers, then reveal ───────────────────── */
  // cfg: id, title, min, max, rounds, deck(), makePrompt(item, s), parse(action, s, actor) → answer|null,
  // fields (action keys), scoreRound(s), promptHtml(v), formHtml(v), revealHtml(v), lockOnce
  function answerGame(cfg) {
    return {
      title: cfg.title, min: cfg.min, max: cfg.max, rules: cfg.rules, concurrentActions: ["answer"],
      create(players) {
        const s = base(players, cfg.min, cfg.max, { totalRounds: cfg.rounds, deck: [] });
        if (cfg.setup) cfg.setup(s);
        startRound(s); return s;
      },
      act(s, actor, a) {
        if (!seat(s, actor) || s.done) return false;
        if (a.type === "answer" && shape(a, ["type", ...cfg.fields]) && s.phase === "answer") {
          if (cfg.lockOnce && s.answers[actor] !== null) return false;
          if (cfg.canAnswer && !cfg.canAnswer(s, actor)) return false;
          const parsed = cfg.parse(a, s, actor); if (parsed === null || parsed === undefined) return false;
          if (cfg.onAnswer) cfg.onAnswer(s, actor, parsed); else { s.answers[actor] = parsed; s.order.push(actor); }
          if (cfg.roundOver ? cfg.roundOver(s) : everyone(s).every((i) => s.answers[i] !== null)) reveal(s);
          else s.message = cfg.progress ? cfg.progress(s) : `${s.answers.filter((x) => x !== null).length} of ${s.players.length} locked in.`;
          return true;
        }
        if (a.type === "force" && shape(a, ["type"]) && actor === 0 && s.phase === "answer") { reveal(s); return true; }
        if (a.type === "next" && shape(a, ["type"]) && s.phase === "reveal") {
          if (s.round >= s.totalRounds) { finishByScore(s); return true; }
          s.round++; startRound(s); return true;
        }
        return false;
      },
      view(s, viewer) {
        const v = publicBase(s, viewer), me = v.self, open = s.phase !== "answer";
        return { ...v, prompt: cfg.publicPrompt ? cfg.publicPrompt(s, open) : s.prompt, locked: s.answers.map((x) => x !== null), ownAnswer: me >= 0 ? s.answers[me] : null,
          answers: open ? s.answers.map((x) => x) : null, gained: open ? [...s.gained] : [], extra: cfg.publicExtra ? cfg.publicExtra(s, me, open) : null };
      },
      render(v) {
        const marks = v.phase === "answer" ? v.locked.map((x) => x ? "✓" : "…") : v.gained.map((g) => g ? `+${g}` : "");
        let body = scoreStrip(v, marks) + cfg.promptHtml(v);
        if (v.phase === "answer") body += (v.self < 0 ? note("You're watching this round.") : cfg.formHtml(v)) + waitingFor(v, v.locked) + forceButton(v, "Reveal now");
        else { body += cfg.revealHtml(v); if (v.phase === "reveal") body += btn(v.round >= v.totalRounds ? "See final scores" : "Next round →", "next"); }
        return shell(cfg.cls, v, body);
      },
    };
    function startRound(s) {
      const deck = cfg.deck(s);
      if (!s.deck.length) s.deck = shuffled(deck.map((_, i) => i));
      s.prompt = cfg.makePrompt(deck[s.deck.pop()], s);
      s.phase = "answer"; s.answers = s.players.map(() => null); s.order = []; s.gained = s.players.map(() => 0);
      if (cfg.roundSetup) cfg.roundSetup(s);
      s.message = cfg.startMessage(s);
    }
    function reveal(s) {
      s.gained = s.players.map(() => 0); cfg.scoreRound(s);
      s.gained.forEach((g, i) => { s.scores[i] += g; });
      s.phase = "reveal"; s.message = cfg.revealMessage(s);
    }
  }

  // Mind Meld — match the herd.
  reg("mind-meld", answerGame({
    title: "Mind Meld", cls: "mindmeld", min: 3, max: 8, rounds: 8, fields: ["text"],
    deck: () => D.mindMeld, makePrompt: (q) => q,
    parse: (a) => { const t = clean(a.text, 40); return t ? t : null; },
    scoreRound(s) {
      const groups = new Map();
      s.answers.forEach((t, i) => { if (t === null) return; const k = loose(t); groups.set(k, [...(groups.get(k) || []), i]); });
      const biggest = Math.max(0, ...[...groups.values()].map((g) => g.length));
      s.groups = [...groups.values()].sort((a, b) => b.length - a.length).map((g) => ({ text: s.answers[g[0]], members: g, top: g.length === biggest && biggest >= 2 }));
      s.groups.forEach((g) => { if (g.top) g.members.forEach((i) => { s.gained[i] += 100; }); });
    },
    publicExtra: (s, me, open) => open ? { groups: s.groups } : null,
    promptHtml: (v) => promptCard("Think like the herd", esc(v.prompt), "Score by giving the same answer as the most people."),
    formHtml: (v) => `<div class="pn-form">${field("pn-mind", "text", v.ownAnswer ? `Locked: ${v.ownAnswer} — change it?` : "Your answer", { max: 40, placeholder: "What will everyone else say?", submit: "answer" })}${btn(v.ownAnswer ? "Change answer" : "Lock it in", "answer")}</div>`,
    revealHtml: (v) => `<div class="pn-groups">${v.extra.groups.map((g) => `<div class="pn-group ${g.top ? "is-top" : ""}"><strong>${esc(g.text)}</strong><span>${g.members.map((i) => esc(v.players[i].name)).join(", ")}</span><b>${g.members.length}</b></div>`).join("")}</div>`,
    startMessage: () => "Answer the question the way you think most of the table will.",
    revealMessage: (s) => s.groups.some((g) => g.top) ? "The biggest herd scores 100 each." : "No two minds met this time. Nobody scores.",
    rules: "<ol><li>Everyone secretly answers a simple question (\"Name a fruit\").</li><li>Answers are grouped. Everyone in the biggest matching group (two or more players) scores 100.</li><li>Eight rounds. Spelling and plurals are forgiven.</li></ol>",
  }));

  // This or That — pick a side and predict the room.
  reg("this-or-that", answerGame({
    title: "This or That", cls: "thisorthat", min: 3, max: 8, rounds: 8, fields: ["pick", "guess"],
    deck: () => D.thisOrThat, makePrompt: (pair) => pair,
    parse: (a) => { const p = int(a.pick, 0, 1), g = int(a.guess, 0, 1); return p === null || g === null ? null : { pick: p, guess: g }; },
    scoreRound(s) {
      const counts = [0, 0]; s.answers.forEach((x) => { if (x) counts[x.pick]++; });
      s.tally = counts; const winner = counts[0] === counts[1] ? -1 : counts[0] > counts[1] ? 0 : 1;
      s.answers.forEach((x, i) => { if (!x) return; if (winner === -1) s.gained[i] += 50; else if (x.guess === winner) s.gained[i] += 100; });
    },
    publicExtra: (s, me, open) => open ? { tally: s.tally } : null,
    promptHtml: (v) => `<div class="pn-versus"><div class="pn-side side-a"><span>This</span><strong>${esc(v.prompt[0])}</strong>${v.extra ? `<b>${v.extra.tally[0]}</b>` : ""}</div><span class="pn-or">or</span><div class="pn-side side-b"><span>That</span><strong>${esc(v.prompt[1])}</strong>${v.extra ? `<b>${v.extra.tally[1]}</b>` : ""}</div></div>`,
    formHtml: (v) => `<div class="pn-form pn-grid2">${select("pn-pick", "pick", "I'd choose", [[0, v.prompt[0]], [1, v.prompt[1]]], v.ownAnswer?.pick ?? 0)}${select("pn-guess", "guess", "Most of the table will choose", [[0, v.prompt[0]], [1, v.prompt[1]]], v.ownAnswer?.guess ?? 0)}${btn(v.ownAnswer ? "Change" : "Lock it in", "answer")}</div>${v.ownAnswer ? note(`Locked: you'd pick <strong>${esc(v.prompt[v.ownAnswer.pick])}</strong> and predict <strong>${esc(v.prompt[v.ownAnswer.guess])}</strong>.`) : ""}`,
    revealHtml: (v) => `<ul class="pn-list">${v.answers.map((x, i) => x ? `<li><strong>${esc(v.players[i].name)}</strong> chose ${esc(v.prompt[x.pick])} · predicted ${esc(v.prompt[x.guess])}</li>` : "").join("")}</ul>`,
    startMessage: () => "Pick your side, then predict which side wins the room.",
    revealMessage: (s) => s.tally[0] === s.tally[1] ? "A perfect split! Everyone gets 50." : "Correct predictions score 100.",
    rules: "<ol><li>Choose between two options, and predict which one most of the table picked.</li><li>Predict the majority: +100. A perfect tie gives everyone +50.</li><li>Eight rounds.</li></ol>",
  }));

  // Who's Most Likely — vote for a friend.
  reg("most-likely", answerGame({
    title: "Who's Most Likely", cls: "mostlikely", min: 3, max: 8, rounds: 8, fields: ["target"],
    deck: () => D.mostLikely, makePrompt: (p) => p,
    parse: (a, s) => { const t = int(a.target, 0, s.players.length - 1); return t; },
    scoreRound(s) {
      const tally = s.players.map(() => 0); s.answers.forEach((t) => { if (t !== null) tally[t]++; });
      const top = Math.max(...tally); s.tally = tally; s.top = everyone(s).filter((i) => tally[i] === top && top > 0);
      s.answers.forEach((t, i) => { if (t !== null && s.top.includes(t)) s.gained[i] += 100; });
      s.titles = s.titles || s.players.map(() => []); s.top.forEach((i) => s.titles[i].push(s.prompt));
    },
    publicExtra: (s, me, open) => open ? { tally: s.tally, top: s.top } : null,
    promptHtml: (v) => promptCard("Who's most likely to…", `${esc(v.prompt)}?`),
    formHtml: (v) => `<div class="pn-options pn-people">${v.players.map((p, i) => `<button type="button" class="pn-option ${v.ownAnswer === i ? "is-picked" : ""}" data-move="answer" data-target="${i}"><span class="pn-pawn pawn-${i % 8}">${esc(p.name.slice(0, 1).toUpperCase())}</span>${esc(p.name)}${i === v.self ? " <small>(you)</small>" : ""}</button>`).join("")}</div>`,
    revealHtml: (v) => `<div class="pn-options pn-people is-reveal">${v.players.map((p, i) => `<div class="pn-option ${v.extra.top.includes(i) ? "is-real" : ""}"><span class="pn-letter">${v.extra.tally[i]}</span>${esc(p.name)}</div>`).join("")}</div>`,
    startMessage: () => "Vote for the friend who fits best. Pick the table's favorite to score.",
    revealMessage: (s) => s.top.length ? `${s.top.map((i) => nameOf(s, i)).join(" & ")} took the title! Matching voters score 100.` : "No votes this round.",
    rules: "<ol><li>A prompt appears: “Who's most likely to…”. Vote for any player (yourself included).</li><li>Everyone who voted for the most-voted player scores 100.</li><li>Eight rounds of friendly roasting.</li></ol>",
  }));

  // Ballpark — closest estimate wins.
  reg("ballpark", answerGame({
    title: "Ballpark", cls: "ballpark", min: 2, max: 8, rounds: 8, fields: ["value"],
    deck: () => D.ballpark, makePrompt: ([q, answer, unit]) => ({ q, answer, unit }),
    publicPrompt: (s, open) => ({ q: s.prompt.q, unit: s.prompt.unit, answer: open ? s.prompt.answer : null }),
    parse: (a) => { const t = clean(String(a.value ?? ""), 15).replace(/[,\s]/g, ""); return /^-?\d+(\.\d+)?$/.test(t) && Math.abs(Number(t)) < 1e12 ? Number(t) : null; },
    scoreRound(s) {
      const diffs = everyone(s).filter((i) => s.answers[i] !== null).map((i) => ({ i, d: Math.abs(s.answers[i] - s.prompt.answer) })).sort((a, b) => a.d - b.d);
      let place = 0; diffs.forEach((x, k) => { if (k > 0 && x.d > diffs[k - 1].d) place = k; if (place < 3) s.gained[x.i] += x.d === 0 ? 400 : [300, 200, 100][place]; });
      s.ranking = diffs;
    },
    publicExtra: (s, me, open) => open ? { ranking: s.ranking } : null,
    promptHtml: (v) => promptCard("Estimate", esc(v.prompt.q), v.prompt.answer !== null ? `Answer: <strong>${v.prompt.answer.toLocaleString()} ${esc(v.prompt.unit)}</strong>` : "Closest guess wins. Nail it exactly for a bonus."),
    formHtml: (v) => `<div class="pn-form">${field("pn-num", "value", v.ownAnswer !== null ? `Locked: ${v.ownAnswer.toLocaleString()} — change it?` : "Your estimate", { type: "text", max: 15, placeholder: "A number", submit: "answer", extra: 'inputmode="decimal"' })}${btn(v.ownAnswer !== null ? "Change" : "Lock it in", "answer")}</div>`,
    revealHtml: (v) => `<ol class="pn-list pn-ranked">${v.extra.ranking.map((x, k) => `<li><strong>${esc(v.players[x.i].name)}</strong> guessed ${v.answers[x.i].toLocaleString()} <small>(off by ${x.d.toLocaleString()})</small></li>`).join("")}</ol>`,
    startMessage: () => "Type your best estimate. Closest guesses score.",
    revealMessage: () => "Closest: 300 · Second: 200 · Third: 100 · Exact: 400.",
    rules: "<ol><li>Everyone estimates the answer to a numeric question.</li><li>Closest scores 300, second 200, third 100. An exact answer scores 400. Ties share the place.</li><li>Eight rounds.</li></ol>",
  }));

  // Buzz Off — multiple-choice trivia race.
  reg("buzz-off", answerGame({
    title: "Buzz Off", cls: "buzz", min: 2, max: 8, rounds: 10, fields: ["option"], lockOnce: true,
    deck: () => D.trivia, makePrompt: ([q, options, correct]) => ({ q, options, correct }),
    publicPrompt: (s, open) => ({ q: s.prompt.q, options: s.prompt.options, correct: open ? s.prompt.correct : null }),
    parse: (a) => int(a.option, 0, 3),
    scoreRound(s) { let place = 0; s.order.forEach((i) => { if (s.answers[i] === s.prompt.correct) s.gained[i] += rankPoints(place++); }); s.buzzOrder = [...s.order]; },
    publicExtra: (s, me, open) => open ? { order: s.buzzOrder } : null,
    promptHtml: (v) => promptCard("Buzz in!", esc(v.prompt.q), "Fastest correct answer scores the most."),
    formHtml: (v) => `<div class="pn-options pn-abcd">${v.prompt.options.map((o, i) => `<button type="button" class="pn-option ${v.ownAnswer === i ? "is-picked" : ""}" data-move="answer" data-option="${i}" ${v.ownAnswer !== null ? "disabled" : ""}><span class="pn-letter">${"ABCD"[i]}</span>${esc(o)}</button>`).join("")}</div>${v.ownAnswer !== null ? note("Locked in! Waiting for the others…") : ""}`,
    revealHtml: (v) => `<div class="pn-options pn-abcd is-reveal">${v.prompt.options.map((o, i) => `<div class="pn-option ${i === v.prompt.correct ? "is-real" : ""}"><span class="pn-letter">${"ABCD"[i]}</span>${esc(o)}<small>${v.answers.map((x, p) => x === i ? esc(v.players[p].name) : "").filter(Boolean).join(", ")}</small></div>`).join("")}</div><p class="pn-note">Buzz order: ${v.extra.order.map((i) => `${esc(v.players[i].name)}${v.answers[i] === v.prompt.correct ? " ✓" : " ✗"}`).join(" → ") || "nobody"}</p>`,
    startMessage: () => "One answer each. The quicker you are, the more a right answer is worth.",
    revealMessage: () => "Right answers: 300, 200, 100, then 50 — in the order they arrived.",
    rules: "<ol><li>A multiple-choice question appears. You get one answer — no take-backs.</li><li>Correct answers score by speed: 300, 200, 100, then 50 for everyone else who got it right.</li><li>Ten questions.</li></ol>",
  }));

  // Mental Math Dash — generated sums.
  function mathProblem() {
    const kind = rnd(4);
    if (kind === 0) { const a = 12 + rnd(88), b = 12 + rnd(88); return { text: `${a} + ${b}`, answer: a + b }; }
    if (kind === 1) { const a = 40 + rnd(160), b = 10 + rnd(a - 10); return { text: `${a} − ${b}`, answer: a - b }; }
    if (kind === 2) { const a = 3 + rnd(10), b = 3 + rnd(10); return { text: `${a} × ${b}`, answer: a * b }; }
    const b = 2 + rnd(9), q = 3 + rnd(12); return { text: `${b * q} ÷ ${b}`, answer: q };
  }
  reg("math-dash", answerGame({
    title: "Mental Math Dash", cls: "math", min: 2, max: 8, rounds: 10, fields: ["value"],
    deck: () => Array.from({ length: 10 }, (_, i) => i), makePrompt: () => mathProblem(),
    publicPrompt: (s, open) => ({ text: s.prompt.text, answer: open ? s.prompt.answer : null }),
    roundSetup: (s) => { s.locked = s.players.map(() => false); },
    canAnswer: (s, actor) => !s.locked[actor] && s.answers[actor] === null,
    parse: (a) => { const n = int(String(a.value ?? "").trim(), -100000, 100000); return n; },
    onAnswer(s, actor, n) { if (n === s.prompt.answer) { s.answers[actor] = n; s.order.push(actor); } else { s.locked[actor] = true; s.misses = (s.misses || []).concat(actor); } },
    roundOver: (s) => everyone(s).every((i) => s.answers[i] !== null || s.locked[i]),
    progress: (s) => `${s.order.length} solved · ${s.locked.filter(Boolean).length} out`,
    scoreRound(s) { s.order.forEach((i, place) => { s.gained[i] += rankPoints(place); }); s.finishOrder = [...s.order]; },
    publicExtra: (s, me, open) => ({ lockedOut: me >= 0 ? s.locked[me] : false, order: open ? s.finishOrder : s.order.map(() => -1).length }),
    promptHtml: (v) => promptCard("Solve it — fast!", `<span class="pn-math">${esc(v.prompt.text)}${v.prompt.answer !== null ? ` = <b>${v.prompt.answer}</b>` : ""}</span>`, "One wrong answer locks you out of the round."),
    formHtml: (v) => v.extra.lockedOut ? note("Oops — locked out this round. Get the next one!") : v.ownAnswer !== null ? note("Solved! Waiting for the others…") : `<div class="pn-form">${field("pn-math", "value", "Answer", { max: 8, placeholder: "=", submit: "answer", extra: 'inputmode="numeric"' })}${btn("Submit", "answer")}</div>`,
    revealHtml: (v) => `<p class="pn-note">Finish order: ${v.extra.order.map((i) => esc(v.players[i].name)).join(" → ") || "nobody solved it"}</p>`,
    startMessage: () => "Type the answer and press Enter. First right answers score most.",
    revealMessage: () => "300, 200, 100, then 50 for anyone else who solved it.",
    rules: "<ol><li>A quick arithmetic problem appears.</li><li>Correct answers score by finish order: 300, 200, 100, then 50. A wrong answer locks you out until the next problem.</li><li>Ten problems.</li></ol>",
  }));

  // Emoji Decoder — guess the phrase.
  reg("emoji-decoder", answerGame({
    title: "Emoji Decoder", cls: "emoji", min: 2, max: 8, rounds: 10, fields: ["text"],
    deck: () => D.emoji, makePrompt: ([emoji, ...answers]) => ({ emoji, answers }),
    publicPrompt: (s, open) => ({ emoji: s.prompt.emoji, answer: open ? s.prompt.answers[0] : null, letters: s.prompt.answers[0].split(" ").map((w) => w.length) }),
    roundSetup: (s) => { s.tries = s.players.map(() => 0); s.wrong = s.players.map(() => []); },
    canAnswer: (s, actor) => s.answers[actor] === null && s.tries[actor] < 5,
    parse: (a) => { const t = clean(a.text, 40); return t || null; },
    onAnswer(s, actor, t) { s.tries[actor]++; if (s.prompt.answers.some((x) => loose(x) === loose(t))) { s.answers[actor] = t; s.order.push(actor); } else s.wrong[actor].push(t); },
    roundOver: (s) => everyone(s).every((i) => s.answers[i] !== null || s.tries[i] >= 5),
    progress: (s) => `${s.order.length} decoded so far.`,
    scoreRound(s) { s.order.forEach((i, place) => { s.gained[i] += rankPoints(place); }); s.solvedOrder = [...s.order]; },
    publicExtra: (s, me, open) => ({ triesLeft: me >= 0 ? 5 - s.tries[me] : 0, ownWrong: me >= 0 ? [...s.wrong[me]] : [], order: open ? s.solvedOrder : null }),
    promptHtml: (v) => promptCard("Decode the emoji", `<span class="pn-emoji">${esc(v.prompt.emoji)}</span>`, v.prompt.answer ? `It was <strong>${esc(v.prompt.answer)}</strong>.` : `Hint: ${v.prompt.letters.map((n) => "_".repeat(n)).join(" ")}`),
    formHtml: (v) => v.ownAnswer !== null ? note(`Decoded: <strong>${esc(v.ownAnswer)}</strong>. Shh!`) : v.extra.triesLeft <= 0 ? note("Out of guesses this round.") : `<div class="pn-form">${field("pn-emoji", "text", `Your guess (${v.extra.triesLeft} left)`, { max: 40, placeholder: "What is it?", submit: "answer" })}${btn("Guess", "answer")}</div>${v.extra.ownWrong.length ? note(`Not it: ${v.extra.ownWrong.map(esc).join(", ")}`) : ""}`,
    revealHtml: (v) => `<p class="pn-note">Solved: ${v.extra.order.map((i) => esc(v.players[i].name)).join(" → ") || "nobody — tough one!"}</p>`,
    startMessage: () => "Guess what the emoji spell out. Five guesses each.",
    revealMessage: () => "300, 200, 100, then 50 in solving order.",
    rules: "<ol><li>A few emoji spell out a word or phrase (🔥🪰 → firefly).</li><li>You get five guesses per puzzle. Solving order scores 300, 200, 100, then 50.</li><li>Ten puzzles.</li></ol>",
  }));

  // Rank 'Em — guess the judge's ranking.
  reg("rank-em", answerGame({
    title: "Rank 'Em", cls: "rankem", min: 3, max: 8, rounds: 8, fields: ["r0", "r1", "r2", "r3"],
    setup: (s) => { s.totalRounds = Math.min(8, Math.max(s.players.length, 4)); },
    deck: () => D.rankThemes, makePrompt: ([theme, items], s) => ({ theme, items: shuffled(items), judge: (s.round - 1) % s.players.length }),
    parse: (a) => { const r = [a.r0, a.r1, a.r2, a.r3].map((x) => int(x, 0, 3)); return r.includes(null) || new Set(r).size !== 4 ? null : r; },
    scoreRound(s) {
      const truth = s.answers[s.prompt.judge]; s.truth = truth;
      if (!truth) return;
      s.answers.forEach((r, i) => { if (i === s.prompt.judge || !r) return; const hits = r.filter((x, k) => x === truth[k]).length; s.gained[i] += hits * 25 + (hits === 4 ? 50 : 0); });
    },
    publicExtra: (s, me, open) => open ? { truth: s.truth } : null,
    startMessage: (s) => `${nameOf(s, s.prompt.judge)} is the judge. Everyone ranks — guess how the judge ranked them.`,
    promptHtml: (v) => promptCard(`${v.players[v.prompt.judge].name}'s ranking`, esc(v.prompt.theme), `${v.self === v.prompt.judge ? "You're the judge — rank honestly, favorite first." : `Guess how ${esc(v.players[v.prompt.judge].name)} ranks these, favorite first.`}`),
    formHtml: (v) => `<div class="pn-form pn-rank">${[0, 1, 2, 3].map((k) => select(`pn-r${k}`, `r${k}`, `#${k + 1}`, v.prompt.items.map((it, i) => [i, it]), v.ownAnswer ? v.ownAnswer[k] : k)).join("")}${btn(v.ownAnswer ? "Update ranking" : "Lock in ranking", "answer")}</div>${note("Each item once. Matching the judge: 25 per spot, 50 bonus for a perfect match.")}`,
    revealHtml: (v) => v.extra.truth ? `<ol class="pn-list pn-ranked">${v.extra.truth.map((it) => `<li><strong>${esc(v.prompt.items[it])}</strong></li>`).join("")}</ol>${note(`${esc(v.players[v.prompt.judge].name)}'s real ranking.`)}` : note("The judge didn't rank this round."),
    revealMessage: () => "25 per matching spot, +50 for a perfect read.",
    rules: "<ol><li>Each round one player is the judge. Four things in a theme appear.</li><li>The judge ranks them honestly (favorite first). Everyone else ranks them the way they think the judge did.</li><li>25 points per matching position, +50 for a perfect match. The judge rotates.</li></ol>",
  }));

  /* ── Truth or Tall Tale ─────────────────────────────────────────── */
  reg("tall-tale", {
    title: "Truth or Tall Tale", min: 3, max: 8, concurrentActions: ["pick"],
    rules: "<ol><li>On your turn, write two true facts about yourself and one convincing lie, then mark the lie.</li><li>Everyone else picks the statement they think is the lie.</li><li>Spot the lie: +100. As the teller, each friend you fool earns you +50. Everyone tells once.</li></ol>",
    create(players) { const s = base(players, 3, 8, { totalRounds: players.length }); start(s); return s; },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      if (a.type === "tell" && shape(a, ["type", "s0", "s1", "s2", "lie"]) && s.phase === "tell" && actor === s.turn) {
        const st = [a.s0, a.s1, a.s2].map((x) => clean(x, 100)), lie = int(a.lie, 0, 2);
        if (st.some((x) => !x) || lie === null) return false;
        s.statements = st; s.lie = lie; s.phase = "guess"; s.picks = s.players.map(() => null);
        s.message = `Which of ${nameOf(s, s.turn)}'s statements is the tall tale?`; return true;
      }
      if (a.type === "pick" && shape(a, ["type", "index"]) && s.phase === "guess" && actor !== s.turn) {
        const k = int(a.index, 0, 2); if (k === null) return false; s.picks[actor] = k;
        if (everyone(s).every((i) => i === s.turn || s.picks[i] !== null)) reveal(s);
        return true;
      }
      if (a.type === "force" && shape(a, ["type"]) && actor === 0 && s.phase === "guess" && s.picks.some((x) => x !== null)) { reveal(s); return true; }
      if (a.type === "next" && shape(a, ["type"]) && s.phase === "reveal") { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; start(s); } return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), open = s.phase === "reveal" || s.phase === "done";
      return { ...v, statements: s.phase === "tell" ? null : s.statements, lie: open ? s.lie : null, ownLie: viewer === s.turn ? s.lie : null,
        picks: open ? [...s.picks] : null, picked: (s.picks || []).map((x) => x !== null), ownPick: seat(s, viewer) && s.picks ? s.picks[viewer] : null, gained: open ? [...s.gained] : [] };
    },
    render(v) {
      const teller = v.players[v.turn]?.name || "";
      let body = scoreStrip(v, v.phase === "guess" ? v.picked.map((x, i) => i === v.turn ? "🎤" : x ? "✓" : "…") : v.gained.map((g, i) => g ? `+${g}` : i === v.turn ? "🎤" : ""));
      if (v.phase === "tell") body += v.self === v.turn
        ? promptCard("Your turn to tell", "Two truths and a tall tale", "Make the lie believable!") + `<div class="pn-form pn-stack">${[0, 1, 2].map((k) => field(`pn-s${k}`, `s${k}`, `Statement ${k + 1}`, { max: 100, placeholder: k === 2 ? "Maybe this one's the lie…" : "Something about you" })).join("")}${select("pn-lie", "lie", "Which one is the lie?", [[0, "Statement 1"], [1, "Statement 2"], [2, "Statement 3"]])}${btn("Tell the table", "tell")}</div>`
        : promptCard("Get ready", `${esc(teller)} is writing…`, "Two truths and one tall tale are on the way.");
      if (v.phase !== "tell" && v.statements) {
        body += promptCard(`${teller}'s statements`, "Which one is the lie?");
        body += `<div class="pn-options">${v.statements.map((t, k) => {
          const isLie = v.lie === k, who = v.picks ? v.picks.map((x, i) => x === k ? v.players[i].name : "").filter(Boolean) : [];
          if (v.phase === "guess") return `<button type="button" class="pn-option ${v.ownPick === k ? "is-picked" : ""} ${v.ownLie === k ? "is-real" : ""}" data-move="pick" data-index="${k}" ${v.self === v.turn || v.self < 0 ? "disabled" : ""}><span class="pn-letter">${k + 1}</span>${esc(t)}${v.ownLie === k ? " <small>(your lie)</small>" : ""}</button>`;
          return `<div class="pn-option ${isLie ? "is-lie" : "is-real"}"><span class="pn-letter">${isLie ? "✗" : "✓"}</span>${esc(t)}<small>${isLie ? "THE TALL TALE" : "True"}${who.length ? " · picked by " + who.map(esc).join(", ") : ""}</small></div>`;
        }).join("")}</div>`;
        if (v.phase === "guess") body += waitingFor(v, v.picked.map((x, i) => x || i === v.turn)) + forceButton(v);
        if (v.phase === "reveal") body += btn(v.round >= v.totalRounds ? "See final scores" : "Next teller →", "next");
      }
      return shell("talltale", v, body);
    },
  });
  function start(s) { s.turn = s.round - 1; s.phase = "tell"; s.statements = null; s.lie = null; s.picks = s.players.map(() => null); s.gained = s.players.map(() => 0); s.message = `${nameOf(s, s.turn)} is writing two truths and a tall tale.`; }
  function reveal(s) {
    s.gained = s.players.map(() => 0);
    s.picks.forEach((k, i) => { if (k === null || i === s.turn) return; if (k === s.lie) s.gained[i] += 100; else s.gained[s.turn] += 50; });
    s.gained.forEach((g, i) => { s.scores[i] += g; }); s.phase = "reveal"; s.message = `Statement ${s.lie + 1} was the tall tale!`;
  }

  /* ── No-Say Clues ───────────────────────────────────────────────── */
  reg("no-say", {
    title: "No-Say Clues", min: 3, max: 8, concurrentActions: ["clue", "guess"],
    rules: "<ol><li>The clue giver gets a secret word and four forbidden words.</li><li>Type clues for the table — the game blocks any clue containing the word or a forbidden word.</li><li>First correct guess: guesser +200, clue giver +100. The giver can pass on a tough word. Everyone gives clues twice.</li></ol>",
    create(players) { const s = base(players, 3, 8, { totalRounds: Math.min(12, players.length * 2), deck: shuffled(D.noSay.map((_, i) => i)) }); start2(s); return s; },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      if (a.type === "clue" && shape(a, ["type", "text"]) && s.phase === "clue" && actor === s.turn) {
        const t = clean(a.text, 80), n = norm(t); if (!t || s.clues.length >= 12) return false;
        if (s.card.every((w) => !n.includes(norm(w)))) { s.clues.push(t); s.message = "New clue! Type your guess."; return true; }
        s.blocked++; s.message = "That clue used a forbidden word and was blocked."; return true;
      }
      if (a.type === "guess" && shape(a, ["type", "text"]) && s.phase === "clue" && actor !== s.turn && s.clues.length) {
        const t = clean(a.text, 40); if (!t || (s.attempts[actor] || 0) >= 15) return false;
        s.attempts[actor] = (s.attempts[actor] || 0) + 1; s.guesses.push({ by: actor, text: t });
        if (loose(t) === loose(s.card[0])) { s.solver = actor; s.scores[actor] += 200; s.scores[s.turn] += 100; s.phase = "reveal"; s.message = `${nameOf(s, actor)} got it: ${s.card[0]}!`; }
        else if (everyone(s).every((i) => i === s.turn || (s.attempts[i] || 0) >= 15)) { s.solver = -1; s.phase = "reveal"; s.message = `Out of guesses! The word was ${s.card[0]}.`; }
        return true;
      }
      if (a.type === "skip" && shape(a, ["type"]) && s.phase === "clue" && (actor === s.turn || actor === 0)) { s.solver = -1; s.phase = "reveal"; s.message = `Passed. The word was ${s.card[0]}.`; return true; }
      if (a.type === "next" && shape(a, ["type"]) && s.phase === "reveal") { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; start2(s); } return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), giver = viewer === s.turn, open = s.phase !== "clue";
      return { ...v, card: giver || open ? [...s.card] : null, clues: [...s.clues], blocked: s.blocked, guesses: s.guesses.slice(-14).map((g) => ({ by: g.by, text: giver || open || g.by === viewer ? g.text : "•••" })), solver: s.solver };
    },
    render(v) {
      const giver = v.self === v.turn;
      let body = scoreStrip(v, v.players.map((_, i) => i === v.turn ? "💬" : ""));
      if (v.card) body += `<div class="pn-taboo"><span class="pn-eyebrow">${giver && v.phase === "clue" ? "Get them to say" : "The word was"}</span><strong>${esc(v.card[0])}</strong><span class="pn-eyebrow">Don't say</span><ul>${v.card.slice(1).map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div>`;
      else body += promptCard(`${v.players[v.turn].name} is giving clues`, "Guess the secret word", "Clues appear below.");
      body += `<div class="pn-chat"><h3 class="pn-h">Clues</h3>${v.clues.length ? `<ol>${v.clues.map((c) => `<li>${esc(c)}</li>`).join("")}</ol>` : note("No clues yet.")}${v.blocked ? note(`${v.blocked} clue${v.blocked === 1 ? "" : "s"} blocked for using a forbidden word.`) : ""}</div>`;
      if (v.phase === "clue") {
        if (giver) body += `<div class="pn-form">${field("pn-clue", "text", "Your clue", { max: 80, placeholder: "Describe it without the forbidden words", submit: "clue" })}${btn("Send clue", "clue")}${btn("Pass this word", "skip", "", false, "secondary")}</div>`;
        else if (v.self >= 0) body += `<div class="pn-form">${field("pn-guess", "text", "Your guess", { max: 40, placeholder: v.clues.length ? "What's the word?" : "Wait for the first clue…", submit: "guess", extra: v.clues.length ? "" : "disabled" })}${btn("Guess", "guess", "", !v.clues.length)}</div>`;
        if (v.self === 0 && !giver) body += `<details class="pn-force"><summary>Table host tools</summary>${btn("Skip this word", "skip", "", false, "secondary small")}</details>`;
      }
      body += v.guesses.length ? `<div class="pn-feed"><h3 class="pn-h">Guesses</h3><ul>${v.guesses.map((g) => `<li><strong>${esc(v.players[g.by].name)}</strong> ${esc(g.text)}</li>`).join("")}</ul></div>` : "";
      if (v.phase === "reveal") body += btn(v.round >= v.totalRounds ? "See final scores" : "Next clue giver →", "next");
      return shell("nosay", v, body);
    },
  });
  function start2(s) {
    if (!s.deck.length) s.deck = shuffled(D.noSay.map((_, i) => i));
    s.card = D.noSay[s.deck.pop()]; s.turn = (s.round - 1) % s.players.length; s.phase = "clue";
    s.clues = []; s.guesses = []; s.attempts = {}; s.blocked = 0; s.solver = null;
    s.message = `${nameOf(s, s.turn)} is giving clues.`;
  }

  /* ── Letter Ladder ──────────────────────────────────────────────── */
  const ladderSets = Object.fromEntries(Object.entries(D.ladder).map(([k, words]) => [k, words.split(" ")]));
  reg("letter-ladder", {
    title: "Letter Ladder", min: 2, max: 8,
    rules: "<ol><li>The table host picks a category (animals, countries or foods).</li><li>On your turn, name something in that category that starts with the <strong>last letter</strong> of the previous answer. No repeats.</li><li>Three wrong tries in one turn, or giving up, costs a life. Lose three lives and you're out. Last climber standing wins.</li></ol>",
    create(players) { return base(players, 2, 8, { phase: "setup", lives: players.map(() => 3), chain: [], used: [], strikes: 0, category: "Animals" }); },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      if (a.type === "begin" && shape(a, ["type", "category"]) && s.phase === "setup" && actor === 0) {
        if (!ladderSets[a.category]) return false; s.category = a.category; s.phase = "play"; s.turn = rnd(s.players.length);
        s.message = `${s.category}! ${nameOf(s, s.turn)} starts with any letter.`; return true;
      }
      if (a.type === "word" && shape(a, ["type", "text"]) && s.phase === "play" && actor === s.turn) {
        const t = clean(a.text, 40), k = norm(t); if (!k) return false;
        const need = needLetter(s), list = ladderSets[s.category];
        const ok = list.some((w) => norm(w) === k) && !s.used.includes(k) && (!need || k[0] === need);
        if (ok) { s.chain.push({ word: t, by: actor }); s.used.push(k); s.strikes = 0; advance(s, `${nameOf(s, actor)} said “${t}”.`); }
        else { s.strikes++; s.lastMiss = t; if (s.strikes >= 3) loseLife(s, actor, `${nameOf(s, actor)} struck out on “${t}”.`); else s.message = `“${t}” doesn't work${s.used.includes(k) ? " (already used)" : need && k[0] !== need ? ` (must start with ${need.toUpperCase()})` : " (not on our list)"}. ${3 - s.strikes} tries left.`; }
        return true;
      }
      if (a.type === "giveup" && shape(a, ["type"]) && s.phase === "play" && (actor === s.turn || actor === 0)) { loseLife(s, s.turn, `${nameOf(s, s.turn)} couldn't think of one.`); return true; }
      return false;
    },
    view(s, viewer) { return { ...publicBase(s, viewer), lives: [...s.lives], chain: s.chain.slice(-30), need: s.phase === "play" ? needLetter(s) : "", category: s.category, strikes: s.strikes, categories: Object.keys(ladderSets) }; },
    render(v) {
      let body = `<ol class="pn-scores">${v.players.map((p, i) => `<li class="${i === v.self ? "is-me" : ""} ${v.turn === i ? "is-turn" : ""} ${v.lives[i] ? "" : "is-out"} ${v.done && v.winners.includes(i) ? "is-winner" : ""}"><span class="pn-pawn pawn-${i % 8}">${esc(p.name.slice(0, 1).toUpperCase())}</span><span class="pn-name">${esc(p.name)}</span><b>${"♥".repeat(v.lives[i]) || "out"}</b></li>`).join("")}</ol>`;
      if (v.phase === "setup") body += v.self === 0 ? `<div class="pn-form">${select("pn-cat", "category", "Category", v.categories.map((c) => [c, c]))}${btn("Start the ladder", "begin")}</div>` : promptCard("Almost ready", "The table host is choosing a category.");
      if (v.phase !== "setup") {
        body += promptCard(v.category, v.need ? `Next word starts with <span class="pn-tiles"><b>${v.need.toUpperCase()}</b></span>` : v.done ? "Ladder complete" : "Any letter to start!");
        body += `<div class="pn-ladder">${v.chain.map((c) => `<span class="pawn-ink-${c.by % 8}">${esc(c.word)}</span>`).join("")}</div>`;
        if (v.phase === "play" && v.self === v.turn) body += `<div class="pn-form">${field("pn-word", "text", `Your ${v.category.toLowerCase().replace(/s$/, "")}${v.strikes ? ` (${3 - v.strikes} tries left)` : ""}`, { max: 40, placeholder: v.need ? `Starts with ${v.need.toUpperCase()}…` : "Anything!", submit: "word", spell: false })}${btn("Climb", "word")}${btn("I'm stuck", "giveup", "", false, "secondary")}</div>`;
        else if (v.phase === "play") body += note(`${esc(v.players[v.turn].name)} is thinking…`) + (v.self === 0 ? `<details class="pn-force"><summary>Table host tools</summary>${btn("They're stuck — take a life", "giveup", "", false, "secondary small")}</details>` : "");
      }
      return shell("ladder", v, body);
    },
  });
  function needLetter(s) {
    if (!s.chain.length) return "";
    const last = norm(s.chain[s.chain.length - 1].word), letter = last[last.length - 1];
    return ladderSets[s.category].some((w) => norm(w)[0] === letter && !s.used.includes(norm(w))) ? letter : "";
  }
  function nextAlive(s, from) { for (let k = 1; k <= s.players.length; k++) { const i = (from + k) % s.players.length; if (s.lives[i] > 0) return i; } return from; }
  function advance(s, text) { s.turn = nextAlive(s, s.turn); s.strikes = 0; const need = needLetter(s); s.message = `${text} ${nameOf(s, s.turn)}, ${need ? `start with ${need.toUpperCase()}` : "any letter"}.`; }
  function loseLife(s, who, text) {
    s.lives[who] = Math.max(0, s.lives[who] - 1); s.strikes = 0;
    const alive = everyone(s).filter((i) => s.lives[i] > 0);
    if (alive.length <= 1) { s.scores = s.lives.map((l) => l); finishTeam(s, alive, `${text} ${alive.length ? nameOf(s, alive[0]) + " climbs to victory!" : "Everyone fell off!"}`); return; }
    advance(s, text + (s.lives[who] ? "" : ` ${nameOf(s, who)} is out!`));
  }

  /* ── Alphabet Sprint ────────────────────────────────────────────── */
  const sprintLetters = "ABCDEFGHILMNOPRSTW";
  reg("alphabet-sprint", {
    title: "Alphabet Sprint", min: 2, max: 8, concurrentActions: ["submit", "veto", "ready"],
    rules: "<ol><li>A letter and five categories appear. Fill in an answer for each that starts with the letter.</li><li>Then review: tap any answer you think doesn't count. If most other players reject it, it scores nothing.</li><li>Unique valid answers score 100; answers shared with someone else score 50. Three rounds.</li></ol>",
    create(players) { const s = base(players, 2, 8, { totalRounds: 3, usedLetters: [] }); startSprint(s); return s; },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      if (a.type === "submit" && shape(a, ["type", "a0", "a1", "a2", "a3", "a4"]) && s.phase === "write") {
        s.sheets[actor] = [a.a0, a.a1, a.a2, a.a3, a.a4].map((x) => clean(x, 40));
        if (s.sheets.every(Boolean)) openReview(s); else s.message = `${s.sheets.filter(Boolean).length} of ${s.players.length} sheets handed in.`;
        return true;
      }
      if (a.type === "veto" && shape(a, ["type", "player", "cat"]) && s.phase === "review") {
        const p = int(a.player, 0, s.players.length - 1), c = int(a.cat, 0, 4); if (p === null || c === null || p === actor) return false;
        const key = `${actor}:${p}:${c}`; const at = s.vetoes.indexOf(key); if (at >= 0) s.vetoes.splice(at, 1); else s.vetoes.push(key); return true;
      }
      if (a.type === "ready" && shape(a, ["type"]) && s.phase === "review") { s.ready[actor] = true; if (s.ready.every(Boolean)) scoreSprint(s); return true; }
      if (a.type === "force" && shape(a, ["type"]) && actor === 0) { if (s.phase === "write" && s.sheets.some(Boolean)) { openReview(s); return true; } if (s.phase === "review") { scoreSprint(s); return true; } return false; }
      if (a.type === "next" && shape(a, ["type"]) && s.phase === "reveal") { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; startSprint(s); } return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), open = s.phase !== "write";
      return { ...v, letter: s.letter, cats: [...s.cats], handed: s.sheets.map(Boolean), own: seat(s, viewer) ? s.sheets[viewer] : null,
        sheets: open ? s.sheets.map((x) => x ? [...x] : null) : null, myVetoes: s.vetoes.filter((k) => k.startsWith(`${viewer}:`)).map((k) => k.split(":").slice(1).join(":")),
        vetoCount: open ? countVetoes(s) : null, ready: [...s.ready], cell: s.cellScore || null, gained: s.gained ? [...s.gained] : [] };
    },
    render(v) {
      const marks = v.phase === "write" ? v.handed.map((x) => x ? "✓" : "…") : v.phase === "review" ? v.ready.map((x) => x ? "✓" : "…") : v.gained.map((g) => g ? `+${g}` : "");
      let body = scoreStrip(v, marks) + promptCard("Everything starts with", `<span class="pn-tiles"><b>${esc(v.letter)}</b></span>`);
      if (v.phase === "write") {
        body += v.self < 0 ? note("Watching.") : `<div class="pn-form pn-stack">${v.cats.map((c, k) => field(`pn-a${k}`, `a${k}`, c, { max: 40, placeholder: `${v.letter}…`, extra: v.own ? `value="${esc(v.own[k])}"` : "" })).join("")}${btn(v.own ? "Update sheet" : "Hand in my sheet", "submit")}</div>${note("Leave a blank if you're stuck.")}`;
        body += waitingFor(v, v.handed) + forceButton(v, "Collect sheets now");
      } else {
        body += `<div class="pn-sheet-wrap"><table class="pn-sheet"><thead><tr><th>Category</th>${v.players.map((p) => `<th>${esc(p.name)}</th>`).join("")}</tr></thead><tbody>${v.cats.map((c, k) => `<tr><th>${esc(c)}</th>${v.players.map((p, i) => {
          const text = v.sheets[i]?.[k] || "", mine = v.myVetoes.includes(`${i}:${k}`), count = v.vetoCount[`${i}:${k}`] || 0, cell = v.cell?.[`${i}:${k}`];
          if (!text) return `<td class="is-empty">—</td>`;
          if (v.phase === "review") return `<td><button type="button" class="pn-cell ${mine ? "is-vetoed" : ""}" data-move="veto" data-player="${i}" data-cat="${k}" ${i === v.self || v.self < 0 ? "disabled" : ""} aria-pressed="${mine}">${esc(text)}${count ? `<small>✗${count}</small>` : ""}</button></td>`;
          return `<td class="${cell ? "is-score" : "is-zero"}">${esc(text)}<small>${cell ? `+${cell}` : "0"}</small></td>`;
        }).join("")}</tr>`).join("")}</tbody></table></div>`;
        if (v.phase === "review") body += note("Tap answers that don't count (wrong letter, made-up…). Then press Done.") + btn(v.ready[v.self] ? "Done ✓" : "Done reviewing", "ready", "", v.self < 0 || v.ready[v.self]) + waitingFor(v, v.ready) + forceButton(v, "Score it now");
        if (v.phase === "reveal") body += btn(v.round >= v.totalRounds ? "See final scores" : "Next letter →", "next");
      }
      return shell("sprint", v, body);
    },
  });
  function startSprint(s) {
    const left = [...sprintLetters].filter((c) => !s.usedLetters.includes(c)); s.letter = left[rnd(left.length)]; s.usedLetters.push(s.letter);
    s.cats = pickSome(D.sprintCategories, 5); s.phase = "write"; s.sheets = s.players.map(() => null); s.vetoes = []; s.ready = s.players.map(() => false); s.cellScore = null; s.gained = s.players.map(() => 0);
    s.message = `Letter ${s.letter}! Fill your sheet.`;
  }
  function openReview(s) { s.sheets = s.sheets.map((x) => x || ["", "", "", "", ""]); s.phase = "review"; s.message = "Review time: reject answers that don't count."; }
  function countVetoes(s) { const c = {}; s.vetoes.forEach((k) => { const key = k.split(":").slice(1).join(":"); c[key] = (c[key] || 0) + 1; }); return c; }
  function scoreSprint(s) {
    const vetoes = countVetoes(s), letter = s.letter.toLowerCase(), others = s.players.length - 1; s.cellScore = {}; s.gained = s.players.map(() => 0);
    for (let k = 0; k < 5; k++) {
      const valid = everyone(s).filter((i) => { const t = s.sheets[i][k]; const n = norm(t).replace(/^the(?=.)/, ""); return t && n[0] === letter && !((vetoes[`${i}:${k}`] || 0) * 2 > others); });
      valid.forEach((i) => { const dup = valid.some((j) => j !== i && loose(s.sheets[j][k]) === loose(s.sheets[i][k])); const pts = dup ? 50 : 100; s.cellScore[`${i}:${k}`] = pts; s.gained[i] += pts; });
    }
    s.gained.forEach((g, i) => { s.scores[i] += g; }); s.phase = "reveal"; s.message = "Unique answers 100 · shared answers 50.";
  }

  /* ── Folded Story ───────────────────────────────────────────────── */
  reg("folded-story", {
    title: "Folded Story", min: 3, max: 8, concurrentActions: ["write", "vote"],
    rules: "<ol><li>Every player starts with a different story opening. Each pass, you add one sentence — but you only see the sentence right before yours.</li><li>Stories pass around the table until each has several lines.</li><li>Read them all aloud, then vote for your favorite (not one you started). Every author of a story earns 50 per vote it gets.</li></ol>",
    create(players) {
      const n = players.length, s = base(players, 3, 8, { phase: "write", pass: 1, passes: Math.min(n, 6) });
      s.stories = pickSome(D.storyStarters, n).map((t) => [{ text: t, by: -1 }]); s.inbox = s.players.map(() => null); s.votes = s.players.map(() => null);
      s.message = "Continue the story you're handed. You only see the last line!"; s.totalRounds = s.passes; return s;
    },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      if (a.type === "write" && shape(a, ["type", "text"]) && s.phase === "write") {
        const t = clean(a.text, 140); if (!t) return false; s.inbox[actor] = t;
        if (s.inbox.every(Boolean)) collect(s); else s.message = `${s.inbox.filter(Boolean).length} of ${s.players.length} lines written.`;
        return true;
      }
      if (a.type === "force" && shape(a, ["type"]) && actor === 0 && s.phase === "write" && s.inbox.some(Boolean)) { collect(s); return true; }
      if (a.type === "vote" && shape(a, ["type", "story"]) && s.phase === "vote") {
        const k = int(a.story, 0, s.stories.length - 1); if (k === null || k === actor) return false; s.votes[actor] = k;
        if (s.votes.every((x) => x !== null)) scoreStories(s); return true;
      }
      if (a.type === "force" && shape(a, ["type"]) && actor === 0 && s.phase === "vote" && s.votes.some((x) => x !== null)) { scoreStories(s); return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self, open = s.phase !== "write";
      const mine = me >= 0 ? (me + s.pass - 1) % s.players.length : -1;
      return { ...v, round: s.pass, totalRounds: s.passes, lastLine: me >= 0 && !open ? s.stories[mine][s.stories[mine].length - 1].text : "", ownLine: me >= 0 ? s.inbox[me] : null,
        written: s.inbox.map(Boolean), stories: open ? s.stories.map((st) => st.map((l) => ({ ...l }))) : null, voted: s.votes.map((x) => x !== null), ownVote: me >= 0 ? s.votes[me] : null, tally: s.phase === "done" ? s.stories.map((_, k) => s.votes.filter((x) => x === k).length) : null };
    },
    render(v) {
      let body = scoreStrip(v, v.phase === "write" ? v.written.map((x) => x ? "✓" : "…") : v.voted.map((x) => x ? "✓" : "…"));
      if (v.phase === "write") body += promptCard("The line before yours", `“${esc(v.lastLine)}”`, "Write the next sentence. Keep it going!") + (v.self < 0 ? "" : `<div class="pn-form">${field("pn-line", "text", v.ownLine ? "Change your line" : "Your sentence", { max: 140, placeholder: "And then…", submit: "write" })}${btn(v.ownLine ? "Update" : "Fold & pass", "write")}</div>`) + waitingFor(v, v.written) + forceButton(v, "Pass the papers now");
      else {
        body += `<div class="pn-stories">${v.stories.map((st, k) => `<article class="pn-story ${v.ownVote === k ? "is-picked" : ""}"><span class="pn-eyebrow">Story ${k + 1}${v.tally ? ` · ${v.tally[k]} vote${v.tally[k] === 1 ? "" : "s"}` : ""}</span>${st.map((l) => `<p>${esc(l.text)}${l.by >= 0 ? ` <small>— ${esc(v.players[l.by].name)}</small>` : ""}</p>`).join("")}${v.phase === "vote" ? btn(v.ownVote === k ? "Your favorite ✓" : "Favorite", "vote", `data-story="${k}"`, k === v.self || v.self < 0, "small") : ""}</article>`).join("")}</div>`;
        if (v.phase === "vote") body += waitingFor(v, v.voted) + forceButton(v, "Count votes now");
      }
      return shell("folded", v, body);
    },
  });
  function collect(s) {
    s.inbox.forEach((t, i) => { if (t) s.stories[(i + s.pass - 1) % s.players.length].push({ text: t, by: i }); });
    s.inbox = s.players.map(() => null);
    if (s.pass >= s.passes) { s.phase = "vote"; s.message = "Unfold the papers! Read them aloud, then vote for your favorite."; return; }
    s.pass++; s.round = s.pass; s.message = `Pass ${s.pass} of ${s.passes}. Continue the new story you were handed.`;
  }
  function scoreStories(s) {
    s.votes.forEach((k) => { if (k === null) return; const authors = new Set(s.stories[k].map((l) => l.by).filter((b) => b >= 0)); authors.forEach((b) => { s.scores[b] += 50; }); });
    finishByScore(s, "The votes are in!");
  }

  /* ── Doodle Decoy (fake artist) ─────────────────────────────────── */
  const inks = ["#26334a", "#d6452f", "#2c5fd6", "#2f8a58", "#d99a00", "#8a4fbf", "#d4558a", "#8a5a35"];
  reg("doodle-decoy", {
    title: "Doodle Decoy", min: 4, max: 8, concurrentActions: ["stroke", "vote"],
    rules: "<ol><li>Everyone gets a secret word — except the Decoy, who only sees the category.</li><li>Taking turns, each player adds a few lines to one shared drawing (two laps), then passes the pen.</li><li>Vote for the Decoy. If the Decoy escapes, they score 300. If caught, the Decoy can still steal 300 by guessing the word; otherwise every artist scores 100. Three rounds.</li></ol>",
    create(players) { const s = base(players, 4, 8, { totalRounds: 3, deck: shuffled(D.decoyWords.map((_, i) => i)), drawKey: 0 }); startDoodle(s); return s; },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      if (a.type === "stroke" && shape(a, ["type", "round", "points", "color", "width"]) && s.phase === "draw" && actor === s.turn) {
        if (int(a.round, 0, 1000) !== s.round || a.color !== inks[actor % 8] || s.chunks >= 40) return false;
        const width = Math.max(2, Math.min(20, Math.round(Number(a.width)) || 5)); if ( !Array.isArray(a.points) || !a.points.length || a.points.length > 64) return false;
        if (!a.points.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number" && x >= 0 && x <= 1))) return false;
        s.strokes.push({ points: a.points.map((p) => [...p]), color: a.color, width }); s.chunks++; return true;
      }
      if (a.type === "pass" && shape(a, ["type"]) && s.phase === "draw" && (actor === s.turn && s.chunks > 0 || actor === 0)) {
        s.step++; s.chunks = 0; s.drawKey++;
        if (s.step >= s.order.length) { s.phase = "vote"; s.turn = -1; s.votes = s.players.map(() => null); s.message = "Pens down! Who is the Decoy?"; }
        else { s.turn = s.order[s.step]; s.message = `${nameOf(s, s.turn)} is drawing.`; }
        return true;
      }
      if (a.type === "vote" && shape(a, ["type", "target"]) && s.phase === "vote") {
        const t = int(a.target, 0, s.players.length - 1); if (t === null || t === actor) return false; s.votes[actor] = t;
        if (s.votes.every((x) => x !== null)) tallyDecoy(s); return true;
      }
      if (a.type === "guess" && shape(a, ["type", "word"]) && s.phase === "decoy" && actor === s.decoy) {
        const w = clean(a.word, 40); if (!s.choices.includes(w)) return false;
        s.decoyGuess = w; if (w === s.word) { s.scores[s.decoy] += 300; s.outcome = `Caught — but ${nameOf(s, s.decoy)} guessed “${s.word}”! The Decoy scores 300.`; }
        else { everyone(s).forEach((i) => { if (i !== s.decoy) s.scores[i] += 100; }); s.outcome = `${nameOf(s, s.decoy)} guessed “${w}”. The word was “${s.word}”. Artists score 100!`; }
        s.phase = "reveal"; s.message = s.outcome; return true;
      }
      if (a.type === "force" && shape(a, ["type"]) && actor === 0 && s.phase === "vote" && s.votes.some((x) => x !== null)) { tallyDecoy(s); return true; }
      if (a.type === "next" && shape(a, ["type"]) && s.phase === "reveal") { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; startDoodle(s); } return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self, open = s.phase === "reveal" || s.phase === "done";
      return { ...v, round: s.round, drawKey: s.drawKey, category: s.category, word: open || (me >= 0 && me !== s.decoy) ? s.word : null, isDecoy: me === s.decoy, decoy: open || s.phase === "decoy" ? s.decoy : -1,
        strokes: s.strokes.map((st) => ({ points: st.points.map((p) => [...p]), color: st.color, width: st.width })), canDraw: s.phase === "draw" && me === s.turn && s.chunks < 40, chunks: s.chunks, ink: me >= 0 ? inks[me % 8] : inks[0],
        lap: Math.floor(s.step / s.players.length) + 1, voted: (s.votes || []).map((x) => x !== null), ownVote: me >= 0 && s.votes ? s.votes[me] : null, tally: open || s.phase === "decoy" ? s.players.map((_, i) => s.votes.filter((x) => x === i).length) : null, choices: s.phase === "decoy" ? [...s.choices] : null };
    },
    render(v) {
      let body = scoreStrip(v, v.phase === "vote" ? v.voted.map((x) => x ? "✓" : "…") : v.tally ? v.tally.map((t) => t ? `${t} vote${t > 1 ? "s" : ""}` : "") : v.players.map((_, i) => i === v.turn ? "✏️" : ""));
      body += promptCard(v.isDecoy && !v.done && v.phase !== "reveal" ? "You are the Decoy" : `Category: ${v.category}`, v.word ? `“${esc(v.word)}”` : v.isDecoy ? `Category: ${esc(v.category)}` : "", v.isDecoy && v.phase !== "reveal" ? "Blend in! Draw something that fits the category." : v.phase === "draw" ? "Draw a little of it — but don't make it too obvious for the Decoy." : "", v.isDecoy ? "is-secret" : "");
      // The shared canvas uses the room's drawing bridge (online-ui setupDrawing).
      body += `<select data-draw-color hidden aria-hidden="true"><option value="${v.ink}">ink</option></select><input data-draw-width type="range" min="2" max="12" value="5" hidden aria-hidden="true">`;
      body += `<canvas class="drawing-canvas pn-canvas" data-drawing-canvas data-drawing-key="${v.drawKey}-${v.strokes.length}" width="800" height="480" aria-label="${v.canDraw ? "Your turn: draw on the shared canvas" : "Shared drawing"}">Your browser must support canvas.</canvas>`;
      if (v.phase === "draw") body += v.self === v.turn ? `<div class="pn-form">${btn(v.chunks ? "Done — pass the pen" : "Draw something first", "pass", "", !v.chunks)}</div>${note(`Lap ${v.lap} of 2. Add a few lines, then pass.`)}` : note(`${esc(v.players[v.turn].name)} is drawing (lap ${v.lap} of 2).`) + (v.self === 0 ? `<details class="pn-force"><summary>Table host tools</summary>${btn("Skip their turn", "pass", "", false, "secondary small")}</details>` : "");
      if (v.phase === "vote") body += `<h3 class="pn-h">Who is the Decoy?</h3><div class="pn-options pn-people">${v.players.map((p, i) => `<button type="button" class="pn-option ${v.ownVote === i ? "is-picked" : ""}" data-move="vote" data-target="${i}" ${i === v.self || v.self < 0 ? "disabled" : ""}><span class="pn-pawn pawn-${i % 8}">${esc(p.name.slice(0, 1).toUpperCase())}</span>${esc(p.name)}</button>`).join("")}</div>` + waitingFor(v, v.voted) + forceButton(v, "Count votes now");
      if (v.phase === "decoy") body += v.isDecoy ? `<h3 class="pn-h">Caught! Guess the word to steal the round:</h3><div class="pn-options">${v.choices.map((c) => `<button type="button" class="pn-option" data-move="guess" data-word="${esc(c)}">${esc(c)}</button>`).join("")}</div>` : note(`${esc(v.players[v.decoy].name)} was the Decoy! They get one guess at the word…`);
      if (v.phase === "reveal") body += btn(v.round >= v.totalRounds ? "See final scores" : "Next round →", "next");
      return shell("decoy", v, body);
    },
  });
  function startDoodle(s) {
    if (!s.deck.length) s.deck = shuffled(D.decoyWords.map((_, i) => i));
    const [category, word] = D.decoyWords[s.deck.pop()];
    const n = s.players.length, first = rnd(n);
    Object.assign(s, { category, word, decoy: rnd(n), phase: "draw", strokes: [], chunks: 0, step: 0, votes: s.players.map(() => null), choices: [], decoyGuess: null, outcome: "" });
    s.order = [...Array.from({ length: n }, (_, k) => (first + k) % n), ...Array.from({ length: n }, (_, k) => (first + k) % n)];
    s.turn = s.order[0]; s.drawKey++; s.message = `${nameOf(s, s.turn)} draws first.`;
  }
  function tallyDecoy(s) {
    const tally = s.players.map((_, i) => s.votes.filter((x) => x === i).length), top = Math.max(...tally), leaders = everyone(s).filter((i) => tally[i] === top);
    if (leaders.length === 1 && leaders[0] === s.decoy) {
      s.phase = "decoy"; s.choices = shuffled(D.decoyWords.filter(([c]) => c === s.category).map(([, w]) => w)); s.message = `${nameOf(s, s.decoy)} was caught! One guess to steal the round…`;
    } else { s.scores[s.decoy] += 300; s.phase = "reveal"; s.message = `${nameOf(s, s.decoy)} was the Decoy and slipped away! The word was “${s.word}”. Decoy scores 300.`; }
  }

  /* ── Heist Crew (hidden saboteurs) ─────────────────────────────── */
  const crewSizes = { 5: [2, 3, 2, 3, 3], 6: [2, 3, 4, 3, 4], 7: [2, 3, 3, 4, 4], 8: [3, 4, 4, 5, 5] };
  reg("heist-crew", {
    title: "Heist Crew", min: 5, max: 8, concurrentActions: ["approve", "play"],
    rules: "<ol><li>Most of you are loyal crew; a few are secret Moles who know each other.</li><li>Each heist, the leader picks a team and everyone votes to approve it. Five rejected teams in a row and the Moles win.</li><li>Team members secretly play Success or Sabotage (crew must play Success). One sabotage fails a heist (two on heist 4 with 7+ players).</li><li>Three successful heists: crew wins. Three failures: Moles win.</li></ol>",
    create(players) {
      const n = players.length, s = base(players, 5, 8, { totalRounds: 5, leader: rnd(n), results: [], rejects: 0, team: [], phase: "team" });
      const moles = pickSome(everyone(s), n >= 7 ? 3 : 2); s.roles = s.players.map((_, i) => moles.includes(i) ? "mole" : "crew");
      s.votes = s.players.map(() => null); s.plays = s.players.map(() => null); s.lastVote = null; s.lastPlay = null; s.turn = s.leader;
      s.message = `${nameOf(s, s.leader)} leads heist 1 and picks a team of ${crewSizes[n][0]}.`; return s;
    },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      const size = crewSizes[s.players.length][s.results.length];
      if (a.type === "toggle" && shape(a, ["type", "target"]) && s.phase === "team" && actor === s.leader) {
        const t = int(a.target, 0, s.players.length - 1); if (t === null) return false;
        if (s.team.includes(t)) s.team = s.team.filter((x) => x !== t); else if (s.team.length < size) s.team.push(t); else return false; return true;
      }
      if (a.type === "propose" && shape(a, ["type"]) && s.phase === "team" && actor === s.leader && s.team.length === size) { s.phase = "approve"; s.votes = s.players.map(() => null); s.message = "Vote on the proposed team."; return true; }
      if (a.type === "approve" && shape(a, ["type", "vote"]) && s.phase === "approve" && ["yes", "no"].includes(a.vote)) {
        s.votes[actor] = a.vote; if (!s.votes.every(Boolean)) return true;
        const yes = s.votes.filter((x) => x === "yes").length; s.lastVote = { team: [...s.team], votes: [...s.votes], passed: yes * 2 > s.players.length };
        if (s.lastVote.passed) { s.phase = "heist"; s.plays = s.players.map(() => null); s.rejects = 0; s.message = "Team approved! Team members, make your secret play."; }
        else { s.rejects++; if (s.rejects >= 5) { heistEnd(s, "mole", "Five teams rejected in a row — the Moles win!"); return true; } nextLeader(s, `Team rejected (${s.rejects}/5).`); }
        return true;
      }
      if (a.type === "play" && shape(a, ["type", "card"]) && s.phase === "heist" && s.team.includes(actor) && ["success", "sabotage"].includes(a.card)) {
        if (a.card === "sabotage" && s.roles[actor] !== "mole") return false; s.plays[actor] = a.card;
        if (s.team.every((i) => s.plays[i])) {
          const fails = s.team.filter((i) => s.plays[i] === "sabotage").length, need = s.results.length === 3 && s.players.length >= 7 ? 2 : 1, ok = fails < need;
          s.results.push(ok ? "success" : "fail"); s.lastPlay = { team: [...s.team], fails, ok, heist: s.results.length };
          const wins = s.results.filter((r) => r === "success").length, losses = s.results.length - wins;
          if (wins >= 3) { heistEnd(s, "crew", "Three heists pulled off — the crew wins!"); return true; }
          if (losses >= 3) { heistEnd(s, "mole", "Three heists sabotaged — the Moles win!"); return true; }
          s.round = s.results.length + 1; nextLeader(s, ok ? `Heist ${s.results.length} succeeded!` : `Heist ${s.results.length} was sabotaged (${fails} sabotage${fails > 1 ? "s" : ""})!`);
        }
        return true;
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self, mole = me >= 0 && s.roles[me] === "mole";
      return { ...v, role: me >= 0 ? s.roles[me] : null, moles: mole || s.done ? everyone(s).filter((i) => s.roles[i] === "mole") : null, leader: s.leader, team: [...s.team], need: crewSizes[s.players.length][Math.min(4, s.results.length)],
        results: [...s.results], rejects: s.rejects, voted: s.votes.map(Boolean), ownVote: me >= 0 ? s.votes[me] : null, played: s.team.map((i) => !!s.plays[i]), ownPlay: me >= 0 ? s.plays[me] : null, lastVote: s.lastVote, lastPlay: s.lastPlay, twoFails: s.results.length === 3 && s.players.length >= 7 };
    },
    render(v) {
      const n = v.players.length;
      let body = `<div class="pn-heist-track">${[0, 1, 2, 3, 4].map((k) => `<span class="${v.results[k] === "success" ? "is-win" : v.results[k] === "fail" ? "is-fail" : k === v.results.length && !v.done ? "is-now" : ""}"><b>${crewSizes[n][k]}</b>${k === 3 && n >= 7 ? "<small>2✗</small>" : ""}</span>`).join("")}<em>Rejects ${v.rejects}/5</em></div>`;
      body += scoreStrip({ ...v, scores: v.players.map(() => "") }, v.players.map((_, i) => `${i === v.leader ? "👑" : ""}${v.team.includes(i) ? "🎒" : ""}${v.phase === "approve" && v.voted[i] ? "✓" : ""}`));
      if (v.role) body += `<details class="deduction-secret pn-secret" ${v.done ? "open" : ""}><summary>Your secret role · tap to reveal</summary><div class="privacy-card"><h3>${v.role === "mole" ? "You are a Mole 🕵️" : "You are loyal Crew"}</h3>${v.moles ? `<p>Moles: <strong>${v.moles.map((i) => esc(v.players[i].name)).join(", ")}</strong></p>` : "<p>Find the Moles. Approve teams you trust.</p>"}</div></details>`;
      if (v.lastVote) body += note(`Last vote on ${v.lastVote.team.map((i) => esc(v.players[i].name)).join(", ")}: ${v.lastVote.votes.map((x, i) => `${esc(v.players[i].name)} ${x === "yes" ? "👍" : "👎"}`).join(" · ")} → ${v.lastVote.passed ? "approved" : "rejected"}.`);
      if (v.lastPlay) body += note(`Heist ${v.lastPlay.heist}: ${v.lastPlay.fails} sabotage card${v.lastPlay.fails === 1 ? "" : "s"} — ${v.lastPlay.ok ? "success" : "failed"}.`);
      if (v.phase === "team") body += v.self === v.leader
        ? `<h3 class="pn-h">Pick ${v.need} for heist ${v.results.length + 1}</h3><div class="pn-options pn-people">${v.players.map((p, i) => `<button type="button" class="pn-option ${v.team.includes(i) ? "is-picked" : ""}" data-move="toggle" data-target="${i}">${esc(p.name)}</button>`).join("")}</div>${btn(`Propose team (${v.team.length}/${v.need})`, "propose", "", v.team.length !== v.need)}`
        : promptCard("Team selection", `${esc(v.players[v.leader].name)} is picking ${v.need} players.`, v.team.length ? `So far: ${v.team.map((i) => esc(v.players[i].name)).join(", ")}` : "");
      if (v.phase === "approve") body += promptCard("Vote", `Approve ${v.team.map((i) => esc(v.players[i].name)).join(", ")}?`) + (v.self >= 0 ? `<div class="pn-form">${btn(v.ownVote === "yes" ? "Approve ✓" : "Approve 👍", "approve", 'data-vote="yes"')}${btn(v.ownVote === "no" ? "Reject ✓" : "Reject 👎", "approve", 'data-vote="no"', false, "secondary")}</div>` : "") + waitingFor(v, v.voted);
      if (v.phase === "heist") body += v.team.includes(v.self)
        ? (v.ownPlay ? note("Your card is in. Waiting for the rest of the team…") : `${promptCard("Secret play", "Success or sabotage?", v.twoFails ? "This heist needs two sabotages to fail." : "")}<div class="pn-form">${btn("Success ✔", "play", 'data-card="success"')}${v.role === "mole" ? btn("Sabotage ✗", "play", 'data-card="sabotage"', false, "secondary") : ""}</div>`)
        : promptCard("Heist in progress", `${v.team.map((i) => esc(v.players[i].name)).join(", ")} are on the job…`);
      return shell("heist", v, body);
    },
  });
  function nextLeader(s, text) { s.leader = (s.leader + 1) % s.players.length; s.turn = s.leader; s.team = []; s.phase = "team"; s.message = `${text} ${nameOf(s, s.leader)} now leads and picks ${crewSizes[s.players.length][s.results.length]}.`; }
  function heistEnd(s, side, text) { finishTeam(s, everyone(s).filter((i) => s.roles[i] === side), text); }

  /* ── Fib Pile (bluffing card game) ─────────────────────────────── */
  const rankNames = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  reg("fib-pile", {
    title: "Fib Pile", min: 3, max: 8, concurrentActions: ["call", "trust"],
    rules: "<ol><li>All cards are dealt. Ranks go up each turn: Aces, then 2s, then 3s… after Kings it's Aces again.</li><li>On your turn, play 1–4 cards face down and claim they're all the current rank — true or not.</li><li>Anyone can call “Fib!”. If the play was a lie, the liar takes the whole pile; if it was honest, the caller takes it. If everyone trusts it, play continues.</li><li>Empty your hand (and survive the last call) to win. After 60 plays it's “last call” — fewest cards wins.</li></ol>",
    create(players) {
      const s = base(players, 3, 8, { phase: "play", plays: 0, rankIndex: 0, pile: [], selection: [], last: null, reveal: null });
      const cards = shuffled(Array.from({ length: 52 }, (_, i) => ({ id: i, rank: i % 13, suit: "♠♥♣♦"[Math.floor(i / 13)] })));
      s.hands = s.players.map(() => []); cards.forEach((c, i) => s.hands[i % s.players.length].push(c)); s.hands.forEach(sortHand);
      s.turn = rnd(s.players.length); s.message = `${nameOf(s, s.turn)} starts. Play Aces (or pretend to).`; return s;
    },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      if (a.type === "select" && shape(a, ["type", "card"]) && s.phase === "play" && actor === s.turn) {
        const id = int(a.card, 0, 51); if (id === null || !s.hands[actor].some((c) => c.id === id)) return false;
        if (s.selection.includes(id)) s.selection = s.selection.filter((x) => x !== id); else if (s.selection.length < 4) s.selection.push(id); else return false; return true;
      }
      if (a.type === "play" && shape(a, ["type"]) && s.phase === "play" && actor === s.turn && s.selection.length) {
        const cards = s.hands[actor].filter((c) => s.selection.includes(c.id)); s.hands[actor] = s.hands[actor].filter((c) => !s.selection.includes(c.id));
        s.pile.push(...cards); s.last = { by: actor, cards, rank: s.rankIndex, count: cards.length }; s.selection = []; s.reveal = null;
        s.phase = "challenge"; s.trusted = s.players.map((_, i) => i === actor); s.message = `${nameOf(s, actor)} claims ${cards.length} × ${rankNames[s.rankIndex]}. Fib or fact?`; return true;
      }
      if (a.type === "call" && shape(a, ["type"]) && s.phase === "challenge" && actor !== s.last.by) {
        const lie = s.last.cards.some((c) => c.rank !== s.last.rank), loser = lie ? s.last.by : actor;
        s.reveal = { caller: actor, liar: lie, cards: s.last.cards.map((c) => ({ ...c })), loser, pileSize: s.pile.length };
        s.hands[loser].push(...s.pile); sortHand(s.hands[loser]); s.pile = [];
        s.message = lie ? `${nameOf(s, actor)} called it — ${nameOf(s, s.last.by)} was fibbing and takes the pile!` : `${nameOf(s, actor)} called it wrong — the cards were real. ${nameOf(s, actor)} takes the pile!`;
        afterPlay(s); return true;
      }
      if (a.type === "trust" && shape(a, ["type"]) && s.phase === "challenge" && actor !== s.last.by) {
        s.trusted[actor] = true; if (s.trusted.every(Boolean)) { s.reveal = null; s.message = `Nobody called it. ${s.pile.length} cards in the pile.`; afterPlay(s); } return true;
      }
      if (a.type === "force" && shape(a, ["type"]) && actor === 0 && s.phase === "challenge") { s.reveal = null; afterPlay(s); return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self;
      return { ...v, hand: me >= 0 ? s.hands[me].map((c) => ({ ...c })) : [], counts: s.hands.map((h) => h.length), pileSize: s.pile.length, rank: rankNames[s.rankIndex], selection: me === s.turn ? [...s.selection] : [],
        last: s.last ? { by: s.last.by, count: s.last.count, rank: rankNames[s.last.rank] } : null, playsLeft: fibPlayLimit - (s.plays || 0), lowWins: true, trusted: s.trusted ? [...s.trusted] : [], reveal: s.reveal ? { ...s.reveal, cards: s.reveal.cards.map((c) => ({ rank: rankNames[c.rank], suit: c.suit })) } : null };
    },
    render(v) {
      let body = scoreStrip({ ...v, scores: v.counts.map((c) => `${c}<small> card${c === 1 ? "" : "s"}</small>`) }, v.phase === "challenge" ? v.trusted.map((t, i) => i === v.last.by ? "♣" : t ? "✓" : "…") : []);
      body += `<div class="pn-fib"><div class="pn-pile"><span class="pn-eyebrow">The pile</span><div class="pn-stack-cards" style="--n:${Math.min(v.pileSize, 8)}"></div><b>${v.pileSize}</b></div><div>${promptCard("Current rank", `<span class="pn-tiles"><b>${v.rank}</b></span>`, v.last && v.phase === "challenge" ? `${esc(v.players[v.last.by].name)} claims <strong>${v.last.count} × ${v.last.rank}</strong>` : "")}</div></div>`;
      if (v.reveal) body += `<div class="pn-reveal-cards ${v.reveal.liar ? "is-lie" : "is-true"}"><span class="pn-eyebrow">${v.reveal.liar ? "FIB!" : "Honest!"}</span>${v.reveal.cards.map((c) => `<span class="pn-mini-card ${"♥♦".includes(c.suit) ? "red" : ""}">${c.rank}<small>${c.suit}</small></span>`).join("")}</div>`;
      if (v.phase === "challenge" && v.self >= 0 && v.self !== v.last.by) body += `<div class="pn-form">${btn("Fib! 🚨", "call")}${btn(v.trusted[v.self] ? "Trusted ✓" : "Trust it", "trust", "", v.trusted[v.self], "secondary")}</div>${forceButton(v, "Everyone else trusts it")}`;
      if (v.phase === "challenge" && v.self === v.last?.by) body += note("Poker face… waiting to see if anyone calls it.");
      body += v.self >= 0 ? `<div class="pn-hand"><span class="pn-eyebrow">Your hand (${v.hand.length})</span><div>${v.hand.map((c) => `<button type="button" class="pn-mini-card ${"♥♦".includes(c.suit) ? "red" : ""} ${v.selection.includes(c.id) ? "is-picked" : ""}" data-move="select" data-card="${c.id}" ${v.phase !== "play" || v.self !== v.turn ? "disabled" : ""} aria-pressed="${v.selection.includes(c.id)}">${rankNames[c.rank]}<small>${c.suit}</small></button>`).join("")}</div></div>` : "";
      if (v.phase === "play" && v.self === v.turn) body += `<div class="pn-form">${btn(v.selection.length ? `Play ${v.selection.length} as ${v.rank}${v.selection.length > 1 ? "s" : ""}` : "Select 1–4 cards", "play", "", !v.selection.length)}</div>`;
      else if (v.phase === "play") body += note(`${esc(v.players[v.turn].name)} is choosing cards…`);
      if (!v.done && v.playsLeft <= 15) body += note(`⏰ ${v.playsLeft} play${v.playsLeft === 1 ? "" : "s"} until last call — fewest cards wins.`);
      return shell("fib", v, body);
    },
  });
  function sortHand(h) { h.sort((a, b) => a.rank - b.rank || a.id - b.id); }
  const fibPlayLimit = 60;
  function afterPlay(s) {
    const by = s.last.by;
    if (!s.hands[by].length) { s.scores = s.hands.map((h) => -h.length); finishTeam(s, [by], `${nameOf(s, by)} emptied their hand and wins!`); s.scores = s.hands.map((h) => h.length); return; }
    s.plays = (s.plays || 0) + 1;
    if (s.plays >= fibPlayLimit) { // keeps a party round from dragging on forever
      const fewest = Math.min(...s.hands.map((h) => h.length)), leaders = everyone(s).filter((i) => s.hands[i].length === fewest);
      finishTeam(s, leaders, `Last call! ${leaders.map((i) => nameOf(s, i)).join(" & ")} ${leaders.length > 1 ? "tie" : "wins"} with the fewest cards (${fewest}).`); s.scores = s.hands.map((h) => h.length); return;
    }
    s.phase = "play"; s.trusted = []; s.rankIndex = (s.rankIndex + 1) % 13; s.turn = (by + 1) % s.players.length;
    s.message += ` ${nameOf(s, s.turn)}, play ${rankNames[s.rankIndex]}s.`;
  }

  /* ── Off the Map (find the spy) ────────────────────────────────── */
  reg("off-the-map", {
    title: "Off the Map", min: 3, max: 8, concurrentActions: ["vote", "locate"],
    rules: "<ol><li>Everyone secretly gets the same location and a role there — except the Spy, who knows nothing.</li><li>Take turns asking any player a question about the location. Answer without being too obvious.</li><li>After two questions each, everyone votes for the Spy. Catch the Spy and they get one guess at the location to steal the win. The Spy can also guess the location at any time.</li></ol>",
    create(players) {
      const n = players.length, s = base(players, 3, 8, { phase: "ask", qa: [], target: -1, question: "" });
      const [place, ...roles] = D.locations[rnd(D.locations.length)]; s.place = place; s.spy = rnd(n); s.roles = s.players.map(() => roles[rnd(roles.length)]);
      s.turn = rnd(n); s.limit = n * 2; s.message = `${nameOf(s, s.turn)} asks the first question.`; return s;
    },
    act(s, actor, a) {
      if (!seat(s, actor) || s.done) return false;
      if (a.type === "ask" && shape(a, ["type", "target", "text"]) && s.phase === "ask" && actor === s.turn) {
        const t = int(a.target, 0, s.players.length - 1), q = clean(a.text, 120); if (t === null || t === actor || !q) return false;
        s.target = t; s.question = q; s.phase = "answer"; s.message = `${nameOf(s, actor)} asks ${nameOf(s, t)} a question.`; return true;
      }
      if (a.type === "answer" && shape(a, ["type", "text"]) && s.phase === "answer" && actor === s.target) {
        const ans = clean(a.text, 120); if (!ans) return false;
        s.qa.push({ from: s.turn, to: actor, q: s.question, a: ans }); s.turn = actor; s.target = -1; s.question = "";
        if (s.qa.length >= s.limit) { s.phase = "vote"; s.turn = -1; s.votes = s.players.map(() => null); s.message = "Questions are over. Who is the Spy?"; }
        else { s.phase = "ask"; s.message = `${nameOf(s, actor)} answered and asks next.`; }
        return true;
      }
      if (a.type === "locate" && shape(a, ["type", "place"]) && actor === s.spy && ["ask", "answer", "spyguess"].includes(s.phase)) {
        const p = clean(a.place, 40); if (!D.locations.some(([l]) => l === p)) return false;
        s.spyGuess = p; if (p === s.place) finishTeam(s, [s.spy], `${nameOf(s, s.spy)} was the Spy and figured out the ${s.place}! Spy wins.`);
        else finishTeam(s, everyone(s).filter((i) => i !== s.spy), `${nameOf(s, s.spy)} was the Spy and guessed ${p} — but it was the ${s.place}. Everyone else wins!`);
        return true;
      }
      if (a.type === "vote" && shape(a, ["type", "target"]) && s.phase === "vote") {
        const t = int(a.target, 0, s.players.length - 1); if (t === null || t === actor) return false; s.votes[actor] = t;
        if (s.votes.every((x) => x !== null)) {
          const tally = s.players.map((_, i) => s.votes.filter((x) => x === i).length), top = Math.max(...tally), leaders = everyone(s).filter((i) => tally[i] === top);
          s.tally = tally;
          if (leaders.length === 1 && leaders[0] === s.spy) { s.phase = "spyguess"; s.message = `Caught! ${nameOf(s, s.spy)} was the Spy — one guess at the location to steal the win…`; }
          else finishTeam(s, [s.spy], `${nameOf(s, s.spy)} was the Spy and got away! It was the ${s.place}.`);
        }
        return true;
      }
      if (a.type === "vote_now" && shape(a, ["type"]) && actor === 0 && ["ask", "answer"].includes(s.phase) && s.qa.length >= s.players.length) { s.phase = "vote"; s.turn = -1; s.votes = s.players.map(() => null); s.message = "The table host called a vote. Who is the Spy?"; return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self, spy = me === s.spy;
      return { ...v, isSpy: spy, place: s.done || (me >= 0 && !spy) ? s.place : null, role: me >= 0 && !spy ? s.roles[me] : null, places: D.locations.map(([l]) => l),
        qa: s.qa.map((x) => ({ ...x })), target: s.target, question: s.question, limit: s.limit, voted: (s.votes || []).map((x) => x !== null), ownVote: me >= 0 && s.votes ? s.votes[me] : null, spy: s.done || s.phase === "spyguess" ? s.spy : -1, tally: s.tally || null };
    },
    render(v) {
      let body = scoreStrip({ ...v, scores: v.players.map(() => "") }, v.phase === "vote" ? v.voted.map((x) => x ? "✓" : "…") : v.players.map((_, i) => i === v.turn ? "❓" : i === v.target ? "💬" : ""));
      body += `<details class="deduction-secret pn-secret" ${v.done ? "open" : ""}><summary>Your secret card · tap to reveal</summary><div class="privacy-card">${v.isSpy ? `<h3>You are the Spy 🕵️</h3><p>Listen carefully and figure out where everyone is.</p>` : `<h3>📍 ${esc(v.place || "")}</h3><p>Your role: <strong>${esc(v.role || "")}</strong></p>`}</div></details>`;
      body += `<details class="pn-places"><summary>Possible locations (${v.places.length})</summary><ul>${v.places.map((p) => `<li class="${p === v.place && v.done ? "is-real" : ""}">${esc(p)}</li>`).join("")}</ul></details>`;
      body += `<div class="pn-feed pn-qa"><h3 class="pn-h">Questions (${v.qa.length}/${v.limit})</h3>${v.qa.length ? `<ol>${v.qa.slice(-12).map((x) => `<li><strong>${esc(v.players[x.from].name)} → ${esc(v.players[x.to].name)}:</strong> ${esc(x.q)}<br><span>“${esc(x.a)}”</span></li>`).join("")}</ol>` : note("No questions yet.")}</div>`;
      if (v.phase === "ask") body += v.self === v.turn ? `<div class="pn-form pn-stack">${select("pn-who", "target", "Ask", v.players.map((p, i) => [i, p.name]).filter(([i]) => i !== v.self))}${field("pn-q", "text", "Your question", { max: 120, placeholder: "e.g. What are you wearing today?" })}${btn("Ask", "ask")}</div>` : note(`${esc(v.players[v.turn].name)} is choosing a question…`);
      if (v.phase === "answer") body += promptCard(`${v.players[v.turn].name} asks ${v.players[v.target].name}`, `“${esc(v.question)}”`) + (v.self === v.target ? `<div class="pn-form">${field("pn-a", "text", "Your answer", { max: 120, placeholder: "Be vague… but not too vague", submit: "answer" })}${btn("Answer", "answer")}</div>` : "");
      if (v.isSpy && ["ask", "answer", "spyguess"].includes(v.phase)) body += `<div class="pn-form pn-spy">${select("pn-place", "place", v.phase === "spyguess" ? "Last chance — where are we?" : "Know where we are? Guess to win (one try)", v.places.map((p) => [p, p]))}${btn("Guess the location", "locate")}</div>`;
      if (v.phase === "spyguess" && !v.isSpy) body += note(`${esc(v.players[v.spy].name)} is making a final guess…`);
      if (v.phase === "vote") body += `<h3 class="pn-h">Who is the Spy?</h3><div class="pn-options pn-people">${v.players.map((p, i) => `<button type="button" class="pn-option ${v.ownVote === i ? "is-picked" : ""}" data-move="vote" data-target="${i}" ${i === v.self || v.self < 0 ? "disabled" : ""}>${esc(p.name)}</button>`).join("")}</div>${waitingFor(v, v.voted)}`;
      if (v.self === 0 && ["ask", "answer"].includes(v.phase) && v.qa.length >= v.players.length) body += `<details class="pn-force"><summary>Table host tools</summary>${btn("Call the vote now", "vote_now", "", false, "secondary small")}</details>`;
      return shell("offmap", v, body);
    },
  });

  /* ── Catalog ────────────────────────────────────────────────────── */
  const catalog = [
    ["punchline", "Punchline", "Fill in the blank. Funniest answer steals the votes.", "Party", "3–8 online", "10 min", "✍", "amber"],
    ["acro-night", "Acro Night", "Random letters. Ridiculous phrases. Vote for the best.", "Party", "3–8 online", "10 min", "Ab", "lavender"],
    ["dictionary-bluff", "Dictionary Bluff", "Fake a definition so good your friends pick it.", "Party", "3–8 online", "15 min", "¶", "mint"],
    ["tall-tale", "Truth or Tall Tale", "Two truths, one lie. Can your friends spot it?", "Party", "3–8 online", "15 min", "?!", "coral"],
    ["mind-meld", "Mind Meld", "Name a fruit. Score by thinking like the herd.", "Party", "3–8 online", "10 min", "∞", "sky"],
    ["this-or-that", "This or That", "Pick a side, then predict where the room lands.", "Party", "3–8 online", "10 min", "⇄", "amber"],
    ["most-likely", "Who's Most Likely", "Point fingers. Match the crowd. Collect titles.", "Party", "3–8 online", "10 min", "➹", "coral"],
    ["rank-em", "Rank 'Em", "Guess how the judge ranks pizza toppings. Read your friends.", "Party", "3–8 online", "15 min", "1·2", "mint"],
    ["ballpark", "Ballpark", "How tall is Everest? Closest guess wins.", "Party", "2–8 online", "10 min", "≈", "sky"],
    ["buzz-off", "Buzz Off", "Trivia race: quick right answers score big.", "Party", "2–8 online", "10 min", "!", "amber"],
    ["math-dash", "Mental Math Dash", "Solve it fast. One wrong answer and you're out.", "Party", "2–8 online", "5 min", "±", "navy"],
    ["emoji-decoder", "Emoji Decoder", "🔥🪰 — what is it? Decode first to score.", "Party", "2–8 online", "10 min", "☺", "lavender"],
    ["no-say", "No-Say Clues", "Describe the word without the forbidden ones.", "Party", "3–8 online", "15 min", "⊘", "coral"],
    ["letter-ladder", "Letter Ladder", "Last letter starts the next word. Don't fall off.", "Party", "2–8 online", "10 min", "⇥", "mint"],
    ["alphabet-sprint", "Alphabet Sprint", "One letter, five categories. Unique answers win.", "Party", "2–8 online", "15 min", "A–Z", "sky"],
    ["folded-story", "Folded Story", "Write a line seeing only the last one. Unfold chaos.", "Party", "3–8 online", "15 min", "§", "lavender"],
    ["doodle-decoy", "Doodle Decoy", "Everyone draws together. One of you is faking it.", "Party", "4–8 online", "15 min", "✐", "amber"],
    ["heist-crew", "Heist Crew", "Pick a team, pull the job. Watch out for moles.", "Party", "5–8 online", "25 min", "$", "navy"],
    ["fib-pile", "Fib Pile", "Play cards face down. Lie boldly. Call “Fib!”", "Party", "3–8 online", "15 min", "♣", "coral"],
    ["off-the-map", "Off the Map", "Everyone knows the place except the Spy.", "Party", "3–8 online", "15 min", "⌖", "navy"],
  ];
  // Party Night goes to the front of the shelf as the newest boxes.
  G.expansionCatalog = [...catalog, ...(G.expansionCatalog || [])];
  G.partyNightIds = catalog.map(([id]) => id);
})();
