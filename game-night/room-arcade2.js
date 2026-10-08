"use strict";
// Arcade Night, part 2: drawing games — Telephone Doodle and Masterpiece Mayhem.
(() => {
  const K = window.ArcadeKit, G = window.GameNight, esc = G.esc;
  const { rnd, shuffled, clean, int, seat, nameOf, everyone, base, finishByScore, publicBase, btn, field, note, promptCard, scoreStrip, finalBoard, waitingFor, hostTools, shell, countdown, reg } = K;

  const PROMPTS = ["a cat wearing sunglasses", "a haunted house", "a pizza with legs", "a rocket ship", "a snowman at the beach", "a dragon eating spaghetti", "a robot walking a dog", "a giant cupcake", "an octopus playing drums", "a castle on a cloud", "a shark in a bathtub", "a dinosaur on a skateboard", "a superhero cow", "a tiny elephant", "a volcano erupting popcorn", "a penguin in a hot tub", "a wizard's hat", "a pirate ship", "a banana phone", "a sleepy moon", "a snail racing a turtle", "an alien ordering tacos", "a treehouse", "a burger tower", "a ghost doing laundry", "a frog king", "a bicycle for a giraffe", "a sandcastle", "a lighthouse in a storm", "a lazy dragon", "a cactus hugging a balloon", "a dancing broccoli", "a cozy campfire", "a hamster astronaut", "a flying toaster", "a giant sneaker house", "a magic lamp", "a jellyfish disco", "a crown made of cheese", "a polar bear selling ice cream", "a monster under the bed", "a hot air balloon", "a spooky pumpkin", "a pancake stack", "a mermaid", "a lion getting a haircut", "a soccer game on the moon", "a snow globe", "an unhappy cloud", "a skeleton playing guitar"];
  const INKS = [["#26334a", "Ink"], ["#e23d3d", "Red"], ["#f07a1a", "Orange"], ["#e8b400", "Yellow"], ["#23a35a", "Green"], ["#2f6fe4", "Blue"], ["#8a4fd8", "Purple"], ["#a0612e", "Brown"], ["#ffffff", "Eraser"]];
  const INK_SET = new Set(INKS.map(([c]) => c));
  const MAX_POINTS = 2600;

  // Validates and stores one stroke chunk from the drawing bridge (online-ui setupDrawing).
  function addStroke(page, a) {
    if (!INK_SET.has(a.color) || !Array.isArray(a.points) || !a.points.length || a.points.length > 64) return false;
    const width = Math.max(2, Math.min(24, Math.round(Number(a.width)) || 5));
    if (!a.points.every((p) => Array.isArray(p) && p.length === 2 && p.every((x) => typeof x === "number" && x >= 0 && x <= 1))) return false;
    const used = page.strokes.reduce((n, st) => n + st.points.length, 0);
    if (used + a.points.length > MAX_POINTS) return false;
    page.strokes.push({ points: a.points.map(([x, y]) => [Math.round(x * 1000) / 1000, Math.round(y * 1000) / 1000]), color: a.color, width });
    return true;
  }
  // A finished drawing rendered as crisp SVG (used in reveals and galleries).
  function svgDrawing(strokes, label = "Drawing") {
    const lines = (strokes || []).map((st) => st.points.length === 1
      ? `<circle cx="${st.points[0][0] * 800}" cy="${st.points[0][1] * 480}" r="${st.width / 2}" fill="${st.color}"/>`
      : `<polyline points="${st.points.map(([x, y]) => `${Math.round(x * 800)},${Math.round(y * 480)}`).join(" ")}" fill="none" stroke="${st.color}" stroke-width="${st.width}" stroke-linecap="round" stroke-linejoin="round"/>`).join("");
    return `<svg class="ax-drawing" viewBox="0 0 800 480" role="img" aria-label="${esc(label)}"><rect width="800" height="480" fill="#fff"/>${lines}</svg>`;
  }
  // The live canvas + tools the room UI's drawing bridge wires up.
  function drawPad(v, canDraw) {
    return `<div class="ax-pad-tools">${canDraw ? `<label class="ax-tool">Color <select data-draw-color>${INKS.map(([c, n]) => `<option value="${c}">${n}</option>`).join("")}</select></label><label class="ax-tool">Size <input data-draw-width type="range" min="2" max="24" value="6"></label>${btn("↶ Undo", "undo", "", false, "secondary small")}${btn("Clear", "clear", "", false, "secondary small")}` : ""}</div>
      <canvas class="drawing-canvas pn-canvas ax-canvas" data-drawing-canvas width="800" height="480" aria-label="${canDraw ? "Your drawing — draw here" : "Drawing"}">Your browser must support canvas.</canvas>`;
  }

  /* ── 4. Telephone Doodle — write, draw, guess, draw… then laugh ───── */
  const TD_TIMES = { write: 45000, draw: 80000, guess: 40000 };
  const tdKind = (t) => t === 0 ? "write" : t % 2 ? "draw" : "guess";
  const tdBook = (s, p, t) => ((p - t) % s.players.length + s.players.length) % s.players.length;
  function tdStartStep(s, now) {
    const kind = tdKind(s.step);
    s.phase = kind; s.deadline = now + TD_TIMES[kind]; s.submitted = s.players.map(() => false);
    for (const p of everyone(s)) s.books[tdBook(s, p, s.step)][s.step] = { by: p, kind, text: "", strokes: [] };
    s.message = kind === "write" ? "Write something fun for the next player to draw!" : kind === "draw" ? "Draw what the last player wrote!" : "What is this drawing? Write your best guess!";
  }
  function tdSubmit(s, p, now) {
    const page = s.books[tdBook(s, p, s.step)][s.step];
    if (page.kind === "write" && !page.text) page.text = s.suggestions[p];
    if (page.kind === "guess" && !page.text) page.text = "(no idea!)";
    s.submitted[p] = true;
    if (s.submitted.every(Boolean)) {
      if (s.step + 1 >= s.steps) { s.phase = "reveal"; s.showBook = 0; s.showPage = 1; s.message = "Time to see how it went wrong! The host flips the pages."; }
      else { s.step++; tdStartStep(s, now); }
    }
  }
  reg("telephone-doodle", {
    title: "Telephone Doodle", min: 4, max: 8, concurrentActions: ["stroke", "undo", "clear", "submit", "heart", "flip"],
    rules: "<ol><li>Everyone secretly writes a silly phrase.</li><li>Books pass along: the next player draws the phrase, the next guesses what the drawing is, the next draws that guess…</li><li>Then flip through every book together and watch the message mutate. Tap ❤ on your favorite pages — most hearts wins.</li></ol>",
    create(players) {
      const n = players.length, s = base(players, 4, 8, { steps: Math.min(n, 6), step: 0, books: players.map(() => []), hearts: [], suggestions: shuffled(PROMPTS).slice(0, n) });
      s.totalRounds = s.steps; tdStartStep(s, Date.now()); return s;
    },
    tick(s, now) {
      if (["write", "draw", "guess"].includes(s.phase) && now >= s.deadline) { for (const p of everyone(s)) if (!s.submitted[p]) tdSubmit(s, p, now); return true; }
      return false;
    },
    act(s, p, a) {
      if (!seat(s, p) || s.done) return false;
      const working = ["write", "draw", "guess"].includes(s.phase);
      const page = working ? s.books[tdBook(s, p, s.step)][s.step] : null;
      if (a.type === "stroke" && s.phase === "draw" && !s.submitted[p]) return int(a.round, 0, 99) === s.step + 1 && addStroke(page, a);
      if (a.type === "undo" && s.phase === "draw" && !s.submitted[p] && page.strokes.length) { page.strokes.pop(); return true; }
      if (a.type === "clear" && s.phase === "draw" && !s.submitted[p] && page.strokes.length) { page.strokes = []; return true; }
      if (a.type === "submit" && working && !s.submitted[p]) {
        if (s.phase !== "draw") { const t = clean(a.text, 70); if (!t && s.phase === "guess") return false; page.text = t; }
        else if (!page.strokes.length) return false;
        tdSubmit(s, p, Date.now()); return true;
      }
      if (a.type === "force" && p === 0 && working) { for (const q of everyone(s)) if (!s.submitted[q]) tdSubmit(s, q, Date.now()); return true; }
      if (a.type === "flip" && p === 0 && s.phase === "reveal") {
        if (a.at !== undefined && a.at !== `${s.showBook}:${s.showPage}`) return false; // ignore double clicks
        if (s.showPage < s.steps) s.showPage++;
        else if (s.showBook + 1 < s.players.length) { s.showBook++; s.showPage = 1; }
        else { s.scores = everyone(s).map((i) => s.hearts.filter((h) => h.author === i).length); finishByScore(s); s.message = `Most-loved artist: ${s.winners.map((i) => nameOf(s, i)).join(" & ")}!`; }
        return true;
      }
      if (a.type === "heart" && s.phase === "reveal") {
        const book = int(a.book, 0, s.players.length - 1), pg = int(a.page, 0, s.steps - 1);
        if (book !== s.showBook || pg === null || pg >= s.showPage) return false;
        const author = s.books[book][pg].by; if (author === p) return false;
        const key = `${p}:${book}:${pg}`, at = s.hearts.findIndex((h) => h.key === key);
        if (at >= 0) s.hearts.splice(at, 1); else s.hearts.push({ key, author });
        s.scores = everyone(s).map((i) => s.hearts.filter((h) => h.author === i).length);
        return true;
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self, working = ["write", "draw", "guess"].includes(s.phase);
      const out = { ...v, round: s.step + 1, totalRounds: s.steps, submitted: [...s.submitted], left: working ? s.deadline - Date.now() : 0 };
      if (working && me >= 0) {
        const b = tdBook(s, me, s.step), page = s.books[b][s.step], prev = s.step ? s.books[b][s.step - 1] : null;
        out.task = { kind: page.kind, suggestion: page.kind === "write" ? s.suggestions[me] : "", text: page.text, prevText: prev && prev.kind !== "draw" ? prev.text : "", prevStrokes: prev && prev.kind === "draw" ? prev.strokes : null };
        out.canDraw = s.phase === "draw" && !s.submitted[me];
        out.strokes = page.kind === "draw" ? page.strokes : [];
      }
      if (s.phase === "reveal" || s.done) {
        const book = s.done ? null : s.books[s.showBook];
        out.reveal = book ? { book: s.showBook, owner: s.showBook, pages: book.slice(0, s.showPage).map((pg, i) => ({ i, by: pg.by, kind: pg.kind, text: pg.text, strokes: pg.kind === "draw" ? pg.strokes : null, hearts: s.hearts.filter((h) => h.key.endsWith(`:${s.showBook}:${i}`)).length, mine: s.hearts.some((h) => h.key === `${me}:${s.showBook}:${i}`) })), more: s.showPage < s.steps || s.showBook + 1 < s.players.length } : null;
      }
      return out;
    },
    render(v) {
      let body = scoreStrip(v, ["write", "draw", "guess"].includes(v.phase) ? v.submitted.map((x) => x ? "✓" : "…") : []);
      if (v.task && !v.done) {
        const t = v.task, mine = !v.submitted[v.self];
        body += `<div class="ax-timer">⏱ ${countdown(v.left)}s</div>`;
        if (t.kind === "write") body += promptCard("Start the chain", "Write a phrase to draw", `Stuck? Try “${esc(t.suggestion)}”.`) + (mine ? `<div class="pn-form">${field("ax-write", "text", "Your phrase", { max: 70, placeholder: t.suggestion, submit: "submit" })}${btn("Pass it on →", "submit")}</div>` : note(`Sent: <strong>${esc(t.text)}</strong>`));
        if (t.kind === "draw") body += promptCard("Draw this", `“${esc(t.prevText)}”`, mine ? "No letters or numbers — just pictures!" : "") + drawPad(v, mine) + (mine ? `<div class="pn-form">${btn("Done drawing →", "submit", "", !v.strokes.length)}</div>` : note("Nice! Waiting for the others…"));
        if (t.kind === "guess") body += `<div class="ax-gallery-one">${svgDrawing(t.prevStrokes, "Drawing to guess")}</div>` + (mine ? `<div class="pn-form">${field("ax-guess", "text", "What is it?", { max: 70, placeholder: "I think it's…", submit: "submit" })}${btn("Guess →", "submit")}</div>` : note(`Your guess: <strong>${esc(t.text)}</strong>`));
        body += waitingFor(v, v.submitted) + hostTools(v, btn("Skip the wait", "force", "", false, "secondary small"));
      }
      if (v.reveal) {
        const r = v.reveal;
        body += `<h3 class="pn-h">${esc(v.players[r.owner].name)}'s book</h3><div class="ax-book">${r.pages.map((pg) => `<div class="ax-page ax-page-${pg.kind}"><span class="pn-eyebrow">${pg.kind === "write" ? "Started with" : pg.kind === "draw" ? "drew" : "guessed"} · ${esc(v.players[pg.by].name)}</span>${pg.kind === "draw" ? svgDrawing(pg.strokes) : `<p class="ax-quote">“${esc(pg.text)}”</p>`}<button type="button" class="ax-heart ${pg.mine ? "is-on" : ""}" data-move="heart" data-book="${r.book}" data-page="${pg.i}" ${pg.by === v.self || v.self < 0 ? "disabled" : ""}>❤ ${pg.hearts}</button></div>`).join("")}</div>`;
        body += v.self === 0 ? `<div class="pn-form">${btn(r.more ? "Flip the page →" : "See the winners", "flip", `data-at="${r.book}:${r.pages.length}"`)}</div>` : note("The host flips the pages.");
      }
      return shell("telephone", v, body + finalBoard(v, false, "Hearts collected"), `<span class="pn-round">Pass ${v.round} / ${v.totalRounds}</span>`);
    },
  });

  /* ── 5. Masterpiece Mayhem — same prompt, everyone draws, vote the best ── */
  const MM_DRAW = 75000;
  function mmRound(s, now) {
    if (!s.deck.length) s.deck = shuffled(PROMPTS.map((_, i) => i));
    Object.assign(s, { phase: "draw", prompt: PROMPTS[s.deck.pop()], deadline: now + MM_DRAW, sheets: s.players.map(() => []), submitted: s.players.map(() => false), votes: s.players.map(() => null), gained: s.players.map(() => 0), order: shuffled(everyone(s)) });
    s.message = "Everyone draws the same thing. Make it a masterpiece!";
  }
  function mmGallery(s) { s.phase = "vote"; s.message = "Gallery time! Vote for your favorite (not your own)."; }
  function mmScore(s) {
    s.votes.forEach((t) => { if (t !== null) s.gained[t] += 100; });
    const top = Math.max(...s.gained); if (top > 0) everyone(s).forEach((i) => { if (s.gained[i] === top) s.gained[i] += 50; });
    s.gained.forEach((g, i) => { s.scores[i] += g; });
    s.phase = "reveal"; const best = everyone(s).filter((i) => s.gained[i] === Math.max(...s.gained));
    s.message = top > 0 ? `${best.map((i) => nameOf(s, i)).join(" & ")} painted the crowd favorite!` : "No votes this round!";
  }
  reg("masterpiece", {
    title: "Masterpiece Mayhem", min: 3, max: 8, concurrentActions: ["stroke", "undo", "clear", "submit", "vote"],
    rules: "<ol><li>Everyone gets the same silly prompt and draws it at the same time.</li><li>Then the drawings go up in the gallery (anonymously) and everyone votes for a favorite — not your own.</li><li>Each vote is 100 points; the round's favorite gets +50. Three rounds.</li></ol>",
    create(players) { const s = base(players, 3, 8, { totalRounds: 3, deck: shuffled(PROMPTS.map((_, i) => i)) }); mmRound(s, Date.now()); return s; },
    tick(s, now) { if (s.phase === "draw" && now >= s.deadline) { s.submitted = s.players.map(() => true); mmGallery(s); return true; } return false; },
    act(s, p, a) {
      if (!seat(s, p) || s.done) return false;
      const sheet = { strokes: s.sheets[p] };
      if (a.type === "stroke" && s.phase === "draw" && !s.submitted[p]) { if (int(a.round, 0, 99) !== s.round || !addStroke(sheet, a)) return false; return true; }
      if (a.type === "undo" && s.phase === "draw" && !s.submitted[p] && s.sheets[p].length) { s.sheets[p].pop(); return true; }
      if (a.type === "clear" && s.phase === "draw" && !s.submitted[p] && s.sheets[p].length) { s.sheets[p].length = 0; return true; }
      if (a.type === "submit" && s.phase === "draw" && !s.submitted[p] && s.sheets[p].length) { s.submitted[p] = true; if (s.submitted.every(Boolean)) mmGallery(s); return true; }
      if (a.type === "vote" && s.phase === "vote") { const t = int(a.target, 0, s.players.length - 1); if (t === null || t === p || !s.sheets[t].length) return false; s.votes[p] = t; if (everyone(s).every((i) => s.votes[i] !== null || !everyone(s).some((j) => j !== i && s.sheets[j].length))) mmScore(s); return true; }
      if (a.type === "force" && p === 0) { if (s.phase === "draw") { s.submitted = s.players.map(() => true); mmGallery(s); return true; } if (s.phase === "vote") { mmScore(s); return true; } return false; }
      if (a.type === "next" && s.phase === "reveal" && p === 0) { if (s.round >= s.totalRounds) finishByScore(s); else { s.round++; mmRound(s, Date.now()); } return true; }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), me = v.self, open = s.phase === "reveal" || s.done;
      return { ...v, prompt: s.prompt, left: s.phase === "draw" ? s.deadline - Date.now() : 0, submitted: [...s.submitted], canDraw: s.phase === "draw" && me >= 0 && !s.submitted[me], strokes: me >= 0 && s.phase === "draw" ? s.sheets[me] : [],
        gallery: s.phase === "vote" || open ? s.order.map((i) => ({ i, strokes: s.sheets[i], mine: i === me, by: open ? i : null, votes: open ? s.votes.filter((t) => t === i).length : null })) : null,
        voted: s.votes.map((x) => x !== null), ownVote: me >= 0 ? s.votes[me] : null, gained: open ? [...s.gained] : [] };
    },
    render(v) {
      let body = scoreStrip(v, v.phase === "draw" ? v.submitted.map((x) => x ? "✓" : "✏️") : v.phase === "vote" ? v.voted.map((x) => x ? "✓" : "…") : v.gained.map((g) => g ? `+${g}` : ""));
      body += promptCard("Everybody draw", `“${esc(v.prompt)}”`, v.phase === "draw" ? `⏱ ${countdown(v.left)}s left` : "");
      if (v.phase === "draw") body += v.self >= 0 && !v.submitted[v.self] ? drawPad(v, true) + `<div class="pn-form">${btn("Hang it in the gallery →", "submit", "", !v.strokes.length)}</div>` : note("Framed! Waiting for the other artists…") + waitingFor(v, v.submitted);
      if (v.gallery) body += `<div class="ax-gallery">${v.gallery.map((g) => `<figure class="ax-frame ${v.ownVote === g.i ? "is-picked" : ""} ${g.mine ? "is-mine" : ""}">${svgDrawing(g.strokes)}<figcaption>${g.by !== null ? `${esc(v.players[g.by].name)} · ${g.votes} vote${g.votes === 1 ? "" : "s"}` : g.mine ? "Yours" : `<button type="button" class="button small" data-move="vote" data-target="${g.i}" ${!g.strokes.length || v.self < 0 ? "disabled" : ""}>${v.ownVote === g.i ? "Voted ✓" : "Vote"}</button>`}</figcaption></figure>`).join("")}</div>`;
      if (v.phase === "vote") body += waitingFor(v, v.voted);
      if (v.phase === "reveal") body += v.self === 0 ? `<div class="pn-form">${btn(v.round >= v.totalRounds ? "See final scores" : "Next prompt →", "next")}</div>` : note("Waiting for the host…");
      body += hostTools(v, v.phase === "draw" ? btn("Stop drawing now", "force", "", false, "secondary small") : v.phase === "vote" ? btn("Count votes now", "force", "", false, "secondary small") : "");
      return shell("masterpiece", v, body + finalBoard(v), K.roundBadge(v));
    },
  });

  K.PROMPTS = PROMPTS; K.svgDrawing = svgDrawing;
})();
