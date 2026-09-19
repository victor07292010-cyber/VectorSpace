"use strict";

// Only these explicit views leave the host. Secret words, decks, and identities
// stay in engine state; renderers deliberately receive no host-owned state.
(() => {
  const R = window.RoomGames, G = window.GameNight, esc = G.esc;
  const clonePlayers = (players) => players.map(({ id, name }) => ({ id, name }));
  const seat = (s, n) => Number.isInteger(n) && n >= 0 && n < s.players.length;
  const name = (s, n) => s.players[n]?.name || "Player";
  const integer = (value, min, max) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^\d+$/.test(value))) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
  };
  const shape = (action, allowed) => action !== null && typeof action === "object" && !Array.isArray(action)
    && typeof action.type === "string" && Object.keys(action).every((key) => allowed.includes(key));
  const button = (label, type, attrs = "", disabled = false) =>
    `<button class="button" data-move="${type}" ${attrs}${disabled ? " disabled" : ""}>${esc(label)}</button>`;
  const stat = (label, value) => G.stat(esc(label), esc(value));
  const base = (players, min, max) => {
    if (!Array.isArray(players) || players.length < min || players.length > max) throw new Error(`This game needs ${min === max ? min : `${min}–${max}`} players.`);
    return { players: clonePlayers(players), turn: 0, done: false, winners: [] };
  };
  const publicBase = (s, viewer) => ({
    players: clonePlayers(s.players), self: seat(s, viewer) ? viewer : -1,
    me: seat(s, viewer) ? viewer : -1, turn: s.turn, phase: s.phase,
    done: s.done, winners: [...s.winners], message: s.message || "",
  });
  const winnerMessage = (s) => s.winners.length === 1
    ? `${name(s, s.winners[0])} wins with ${s.scores[s.winners[0]]} points!`
    : `${s.winners.map((i) => name(s, i)).join(" and ")} tie with ${s.scores[s.winners[0]]} points!`;

  const palette = ["#26334a", "#e65757", "#f0b429", "#399b67", "#4389d2", "#9269be", "#ec86ae", "#8a5a35", "#ffffff"];
  const colorNames = ["Ink", "Red", "Gold", "Green", "Blue", "Purple", "Pink", "Brown", "Eraser"];
  const words = [
    "sunflower", "rainbow", "snowman", "bicycle", "airplane", "sailboat", "lighthouse", "treehouse",
    "sandcastle", "watermelon", "pineapple", "ice cream", "birthday cake", "popcorn", "pizza", "pancakes",
    "butterfly", "dragonfly", "ladybug", "jellyfish", "octopus", "penguin", "giraffe", "elephant",
    "dinosaur", "unicorn", "mermaid", "dragon", "astronaut", "robot", "pirate", "wizard",
    "telescope", "camera", "headphones", "guitar", "trumpet", "drum", "piano", "microphone",
    "umbrella", "backpack", "suitcase", "sunglasses", "raincoat", "mittens", "crown", "necklace",
    "volcano", "waterfall", "mountain", "island", "desert", "forest", "cave", "campfire",
    "tent", "hammock", "roller coaster", "ferris wheel", "skateboard", "parachute", "hot air balloon", "rocket",
    "treasure chest", "castle", "windmill", "bridge", "fire truck", "tractor", "submarine", "train",
    "beehive", "spider web", "birdhouse", "doghouse", "flowerpot", "watering can", "paintbrush", "scissors",
    "toothbrush", "alarm clock", "washing machine", "refrigerator", "snowflake", "lightning", "moon", "comet",
    "basketball", "bowling", "fishing", "surfing", "skiing", "hiking", "juggling", "dancing",
  ];
  const normalized = (word) => word.toLowerCase().replace(/[^a-z0-9]/g, "");
  const sameRound = (s, a) => integer(a.round, 1, s.players.length) === s.round;
  function beginDrawingRound(s) {
    s.choices = s.wordDeck.splice(0, 3); s.word = "";
    s.strokes = []; s.strokeCount = 0; s.guesses = []; s.correct = s.players.map(() => false);
    s.attempts = s.players.map(() => 0); s.phase = "choose";
    s.message = `${name(s, s.turn)} is choosing a secret word.`;
  }
  function revealDrawingRound(s) {
    s.phase = "reveal";
    s.message = `The word was “${s.word}”. ${s.correct.filter(Boolean).length} of ${s.players.length - 1} players guessed it.`;
    if (s.round === s.players.length) {
      s.done = true;
      const best = Math.max(...s.scores);
      s.winners = s.scores.flatMap((score, i) => score === best ? [i] : []);
      s.message += ` ${winnerMessage(s)}`;
    }
  }
  R.register("pictionary", {
    title: "Sketch Party", min: 2, max: 8,
    concurrentActions: ["choose", "stroke", "clear", "guess"],
    rules: "<p>Everyone draws once. The drawer privately chooses one of three words and draws while the others guess. Each correct guess earns 100 points; the drawer earns 50 points per correct guess. The round ends when everyone guesses or the drawer presses Finish round. After the reveal, the drawer starts the next round. The highest total wins; ties are shared.</p><p>Draw pictures without writing the answer, letters, or numbers. White is an eraser. Each guesser has up to 40 attempts per round. There is no timer.</p>",
    create(players) {
      const s = { ...base(players, 2, 8), round: 1, scores: players.map(() => 0), wordDeck: G.shuffle([...words]) };
      beginDrawingRound(s); return s;
    },
    act(s, actor, a) {
      if (s.done || !seat(s, actor) || !a || typeof a !== "object" || Array.isArray(a) || !sameRound(s, a)) return false;
      if (a.type === "choose" && shape(a, ["type", "round", "word"]) && actor === s.turn && s.phase === "choose") {
        const choice = integer(a.word, 0, 2);
        if (choice === null) return false;
        s.word = s.choices[choice]; s.choices = []; s.phase = "draw";
        s.message = `${name(s, s.turn)} is drawing. Guess the secret word!`; return true;
      }
      if (a.type === "stroke" && shape(a, ["type", "round", "points", "color", "width"]) && actor === s.turn && s.phase === "draw") {
        const width = integer(a.width, 1, 20);
        if (width === null || !palette.includes(a.color) || !Array.isArray(a.points) || a.points.length < 1 || a.points.length > 64 || s.strokeCount >= 1000) return false;
        if (!a.points.every((p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1))) return false;
        s.strokes.push({ points: a.points.map((p) => [...p]), color: a.color, width }); s.strokeCount++; return true;
      }
      if (a.type === "clear" && shape(a, ["type", "round"]) && actor === s.turn && s.phase === "draw") {
        if (!s.strokes.length) return false;
        s.strokes = []; return true;
      }
      if (a.type === "finish" && shape(a, ["type", "round"]) && actor === s.turn && s.phase === "draw") {
        revealDrawingRound(s); return true;
      }
      if (a.type === "guess" && shape(a, ["type", "round", "guess"]) && actor !== s.turn && s.phase === "draw" && !s.correct[actor] && s.attempts[actor] < 40) {
        if (typeof a.guess !== "string" || a.guess.length > 60) return false;
        const guess = a.guess.trim();
        if (!guess || !normalized(guess)) return false;
        const correct = normalized(guess) === normalized(s.word);
        s.attempts[actor]++;
        // Store no correct answer in the public feed, even for its author.
        s.guesses.push({ player: actor, text: correct ? null : guess, correct });
        if (correct) {
          s.correct[actor] = true; s.scores[actor] += 100; s.scores[s.turn] += 50;
          if (s.correct.every((value, i) => value || i === s.turn)) revealDrawingRound(s);
        }
        return true;
      }
      if (a.type === "next" && shape(a, ["type", "round"]) && actor === s.turn && s.phase === "reveal" && s.round < s.players.length) {
        s.round++; s.turn++; beginDrawingRound(s); return true;
      }
      return false;
    },
    view(s, viewer) {
      const isDrawer = seat(s, viewer) && viewer === s.turn, reveal = s.phase === "reveal";
      return {
        ...publicBase(s, viewer), round: s.round, totalRounds: s.players.length,
        canAct: !s.done && isDrawer, canDraw: !s.done && isDrawer && s.phase === "draw" && s.strokeCount < 1000,
        canGuess: !s.done && seat(s, viewer) && !isDrawer && s.phase === "draw" && !s.correct[viewer] && s.attempts[viewer] < 40,
        scores: [...s.scores], correct: [...s.correct], attemptsLeft: seat(s, viewer) ? 40 - s.attempts[viewer] : 0,
        choices: isDrawer && s.phase === "choose" ? [...s.choices] : [],
        word: isDrawer || reveal ? s.word : null,
        wordLength: s.word ? s.word.split(" ").map((part) => part.length) : [],
        strokes: s.strokes.map((stroke) => ({ points: stroke.points.map((p) => [...p]), color: stroke.color, width: stroke.width })),
        background: "#ffffff", palette: [...palette], strokesLeft: 1000 - s.strokeCount,
        guesses: s.guesses.map(({ player, text, correct }) => ({ player, text: correct ? null : text, correct })),
      };
    },
    render(v) {
      const drawer = v.self === v.turn, attrs = `data-round="${v.round}"`;
      const scores = `<div class="stats">${v.players.map((p, i) => stat(`${p.name}${i === v.self ? " · you" : ""}`, `${v.scores[i]} points`)).join("")}</div>`;
      let controls = "";
      if (v.phase === "choose") controls = drawer
        ? `<div class="privacy-card"><p class="eyebrow">ONLY YOU CAN SEE THESE WORDS</p><h3>What will you draw?</h3><div class="word-choices">${v.choices.map((word, i) => button(word, "choose", `${attrs} data-word="${i}"`)).join("")}</div></div>`
        : `<div class="privacy-card"><h3>${esc(name(v, v.turn))} is choosing a word.</h3><p>Get ready to guess. Their drawing will appear here.</p></div>`;
      if (v.phase === "draw" && drawer) controls = `<div class="drawing-toolbar"><label>Color <select data-draw-color aria-label="Drawing color">${palette.map((color, i) => `<option value="${color}">${colorNames[i]}</option>`).join("")}</select></label><label>Brush width <input data-draw-width type="range" min="1" max="20" step="1" value="5" aria-label="Brush width"></label>${button("Clear canvas", "clear", attrs, !v.strokes.length)}${button("Finish round", "finish", attrs)}</div><p class="muted">Your secret word: <strong>${esc(v.word)}</strong>. Draw pictures without spelling the word. White works as an eraser.</p>${v.strokesLeft === 0 ? `<p class="muted">The 1,000-stroke round limit is reached. You can finish the round when everyone is ready.</p>` : ""}`;
      if (v.phase === "draw" && !drawer) controls = v.canGuess
        ? `<div class="toolbar"><label for="sketch-guess">Your guess <input id="sketch-guess" data-field="guess" type="text" autocomplete="off" maxlength="60" placeholder="What are they drawing?"></label>${button("Send guess", "guess", attrs)}</div><p class="muted">${v.attemptsLeft} guesses left · Word length: ${v.wordLength.join(" + ")} letters</p>`
        : `<p class="muted">${v.self < 0 ? "Watch the drawing and follow the guesses." : v.correct[v.self] ? "You got it! Keep the answer secret while your friends guess." : "You have used your 40 guesses. Watch until the drawer finishes the round."}</p>`;
      if (v.phase === "reveal") controls = `<div class="privacy-card"><p class="eyebrow">THE WORD WAS</p><h3>${esc(v.word)}</h3>${!v.done ? button("Next drawer", "next", attrs, !drawer) : ""}${!v.done && !drawer ? `<p>${esc(name(v, v.turn))} can start the next round.</p>` : ""}</div>`;
      return `${scores}<div class="stats">${stat("Round", `${v.round} / ${v.totalRounds}`)}${stat("Drawer", name(v, v.turn))}</div>${G.status(v.message, v.done)}${controls}<canvas class="drawing-canvas" data-drawing-canvas data-drawing-key="${v.round}" data-round="${v.round}" data-can-draw="${v.canDraw}" width="800" height="480" aria-label="${v.canDraw ? "Shared drawing canvas. Draw with a mouse, pen, or touch." : "Shared drawing from the current drawer"}">Your browser must support canvas to display the shared drawing.</canvas><div class="drawing-guesses" aria-live="polite"><h3>Table guesses</h3>${v.guesses.length ? `<ul>${v.guesses.slice(-12).map((guess) => `<li><strong>${esc(name(v, guess.player))}</strong> ${guess.correct ? "guessed it! ✓" : `guessed “${esc(guess.text)}”`}</li>`).join("")}</ul>` : `<p class="muted">The first guess is still waiting.</p>`}</div><p class="muted">Everyone draws once. A correct guess earns 100 points; the drawer earns 50. The drawer ends the round, or it ends when everyone guesses. Most points wins. No timer.</p>`;
    },
  });

  // Hand-authored roster. Each trait divides the roster evenly (12/12 for
  // accessories, six per hair/shirt color), and all 24 combinations are unique.
  const rosterRows = [
    ["Ada", "black", false, false, false, false, "blue"],
    ["Bex", "black", true, true, true, true, "green"],
    ["Cato", "black", false, false, true, true, "coral"],
    ["Dara", "black", true, true, false, false, "gold"],
    ["Enzo", "black", false, true, false, true, "blue"],
    ["Fern", "black", true, false, true, false, "green"],
    ["Gio", "brown", false, false, false, false, "green"],
    ["Hana", "brown", true, true, true, true, "coral"],
    ["Ivo", "brown", false, false, true, true, "gold"],
    ["Juno", "brown", true, true, false, false, "blue"],
    ["Kira", "brown", false, true, false, true, "green"],
    ["Luca", "brown", true, false, true, false, "coral"],
    ["Mika", "gold", false, false, false, false, "coral"],
    ["Nia", "gold", true, true, true, true, "gold"],
    ["Orin", "gold", false, false, true, true, "blue"],
    ["Paz", "gold", true, true, false, false, "green"],
    ["Quin", "gold", false, true, false, true, "coral"],
    ["Rhea", "gold", true, false, true, false, "gold"],
    ["Sami", "red", false, false, false, false, "gold"],
    ["Tavi", "red", true, true, true, true, "blue"],
    ["Uma", "red", false, false, true, true, "green"],
    ["Vera", "red", true, true, false, false, "coral"],
    ["Wynn", "red", false, true, false, true, "gold"],
    ["Zuri", "red", true, false, true, false, "blue"],
  ];
  const roster = rosterRows.map(([name, hair, glasses, hat, beard, earrings, shirt], id) => ({ id, name, hair, glasses, hat, beard, earrings, shirt }));
  const questions = [
    ...["black", "brown", "gold", "red"].map((value) => ({ id: `hair:${value}`, trait: "hair", value, label: `Do they have ${value} hair?` })),
    { id: "glasses", trait: "glasses", value: true, label: "Do they wear glasses?" },
    { id: "hat", trait: "hat", value: true, label: "Do they wear a hat?" },
    { id: "beard", trait: "beard", value: true, label: "Do they have a beard?" },
    { id: "earrings", trait: "earrings", value: true, label: "Do they wear earrings?" },
    ...["blue", "green", "coral", "gold"].map((value) => ({ id: `shirt:${value}`, trait: "shirt", value, label: `Do they wear a ${value} shirt?` })),
  ];
  const hairColors = { black: "#293044", brown: "#79503a", gold: "#e3b647", red: "#ca643f" };
  const shirtColors = { blue: "#427eb8", green: "#459879", coral: "#df756b", gold: "#e0ac3f" };
  const traits = (c) => [`${c.hair} hair`, c.glasses ? "glasses" : "no glasses", c.hat ? "hat" : "no hat", c.beard ? "beard" : "no beard", c.earrings ? "earrings" : "no earrings", `${c.shirt} shirt`];
  function characterAvatar(c) {
    const hair = hairColors[c.hair], shirt = shirtColors[c.shirt];
    return `<svg class="character-avatar" viewBox="0 0 100 112" role="img" aria-label="${esc(`${c.name}: ${traits(c).join(", ")}`)}"><rect x="1" y="1" width="98" height="110" rx="17" fill="#f4ede0"/><path d="M12 112V99Q14 81 39 80H61Q86 81 88 99V112" fill="${shirt}"/><path d="M43 70H57V84Q50 93 43 84Z" fill="#d39a72"/><path d="M23 55V37Q23 12 50 12Q77 12 77 37V58Z" fill="${hair}"/><circle cx="26" cy="52" r="6" fill="#edbd94"/><circle cx="74" cy="52" r="6" fill="#edbd94"/><path d="M28 35Q50 20 72 35V57Q72 79 50 81Q28 79 28 57Z" fill="#efc5a2"/><path d="M26 42V33Q29 14 51 17Q72 16 76 37L64 32L53 36L40 30L29 43Z" fill="${hair}"/><circle cx="39" cy="49" r="2.3" fill="#293044"/><circle cx="61" cy="49" r="2.3" fill="#293044"/><path d="M49 52L46 60H52" fill="none" stroke="#c78e68" stroke-width="2" stroke-linecap="round"/>${c.beard ? `<path d="M29 58Q32 68 38 63L50 68L62 63Q68 68 71 58V68Q63 83 50 85Q37 83 29 68Z" fill="${hair}"/><path d="M44 70Q50 74 56 70" fill="none" stroke="#efc5a2" stroke-width="2"/>` : `<path d="M42 68Q50 73 58 68" fill="none" stroke="#a1614f" stroke-width="2" stroke-linecap="round"/>`}${c.glasses ? `<g fill="none" stroke="#293044" stroke-width="3"><rect x="30" y="43" width="17" height="13" rx="4"/><rect x="53" y="43" width="17" height="13" rx="4"/><path d="M47 48H53M26 47H30M70 47H75"/></g>` : ""}${c.earrings ? `<g fill="#f5d55f" stroke="#b28726" stroke-width="1.3"><circle cx="24" cy="60" r="4"/><circle cx="76" cy="60" r="4"/></g>` : ""}${c.hat ? `<path d="M24 27Q26 6 50 6Q74 6 76 27Z" fill="#8272a5"/><rect x="20" y="26" width="65" height="7" rx="3" fill="#584870"/><path d="M47 8V25" stroke="#b6a7d0" stroke-width="2"/>` : ""}<circle cx="50" cy="101" r="2" fill="#fff" opacity=".6"/></svg>`;
  }
  function characterCard(c, eliminated = false, own = false) {
    return `<div class="character-card ${eliminated ? "eliminated" : ""} ${own ? "own-character" : ""}"${eliminated ? ` aria-label="${esc(c.name)}, eliminated"` : ""}>${characterAvatar(c)}<strong>${esc(c.name)}</strong>${eliminated ? `<span class="character-state">Eliminated</span>` : own ? `<span class="character-state">Your secret</span>` : ""}<div class="character-traits">${traits(c).map((trait) => `<span class="attribute-chip">${esc(trait)}</span>`).join("")}</div></div>`;
  }
  const characterSelect = (characters, label, id, disabled = false) => `<label for="${id}">${esc(label)} <select id="${id}" data-field="character"${disabled ? " disabled" : ""}><option value="">Choose a character…</option>${characters.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></label>`;
  const validOptionalCharacter = (a) => a.character === undefined || a.character === "" || integer(a.character, 0, roster.length - 1) !== null;
  const validOptionalQuestion = (a) => a.attribute === undefined || a.attribute === "" || questions.some((q) => q.id === a.attribute);
  R.register("guess-who", {
    title: "Face Finder", min: 2, max: 2, concurrentActions: ["lock"],
    rules: "<p>Each player secretly picks one of the 24 characters and locks it in. On your turn, ask one yes-or-no question or make a final guess. Answers are automatic and truthful, and your board removes characters that cannot match. A question ends your turn. A correct final guess wins; a wrong final guess loses immediately. Hair and shirt colors and the presence of glasses, a hat, a beard, and earrings are the only question traits.</p>",
    create(players) {
      return { ...base(players, 2, 2), phase: "setup", secrets: [null, null], eliminated: [[], []], history: [[], []], message: "Choose your secret character. Your opponent cannot see your choice." };
    },
    act(s, actor, a) {
      if (s.done || !seat(s, actor) || !a || typeof a !== "object" || Array.isArray(a)) return false;
      if (a.type === "lock" && shape(a, ["type", "character"]) && s.phase === "setup" && s.secrets[actor] === null) {
        const character = integer(a.character, 0, roster.length - 1);
        if (character === null) return false;
        s.secrets[actor] = character;
        if (s.secrets.every((value) => value !== null)) {
          s.phase = "play"; s.message = `${name(s, s.turn)} goes first. Ask a question or make a final guess.`;
        } else s.message = `${name(s, actor)} has locked a secret character. Waiting for the other player.`;
        return true;
      }
      if (s.phase !== "play" || actor !== s.turn) return false;
      if (a.type === "ask" && shape(a, ["type", "attribute", "character"]) && validOptionalCharacter(a)) {
        const question = questions.find((q) => q.id === a.attribute);
        if (!question || s.history[actor].some((entry) => entry.attribute === question.id)) return false;
        const answer = roster[s.secrets[1 - actor]][question.trait] === question.value;
        const eliminated = roster.filter((c) => (c[question.trait] === question.value) !== answer).map((c) => c.id);
        s.eliminated[actor] = [...new Set([...s.eliminated[actor], ...eliminated])];
        s.history[actor].push({ attribute: question.id, answer });
        s.turn = 1 - actor; s.message = `${name(s, actor)} asked a question. ${name(s, s.turn)}’s turn.`;
        return true;
      }
      if (a.type === "guess" && shape(a, ["type", "character", "attribute"]) && validOptionalQuestion(a)) {
        const character = integer(a.character, 0, roster.length - 1);
        if (character === null || s.eliminated[actor].includes(character)) return false;
        const correct = character === s.secrets[1 - actor];
        s.done = true; s.phase = "done"; s.winners = [correct ? actor : 1 - actor];
        s.message = correct ? `${name(s, actor)} correctly guessed ${roster[character].name} and wins!` : `${name(s, actor)} guessed ${roster[character].name}, but the answer was ${roster[s.secrets[1 - actor]].name}. ${name(s, 1 - actor)} wins!`;
        return true;
      }
      return false;
    },
    view(s, viewer) {
      const player = seat(s, viewer), eliminated = player ? [...s.eliminated[viewer]] : [];
      return {
        ...publicBase(s, viewer), canAct: !s.done && player && (s.phase === "setup" ? s.secrets[viewer] === null : viewer === s.turn),
        ready: s.secrets.map((value) => value !== null),
        ownCharacter: player ? s.secrets[viewer] : null,
        opponentCharacter: s.done && player ? s.secrets[1 - viewer] : null,
        revealed: s.done ? [...s.secrets] : [],
        roster: roster.map((c) => ({ ...c })), eliminated,
        questions: questions.map(({ id, label }) => ({ id, label })),
        history: player ? s.history[viewer].map(({ attribute, answer }) => ({ attribute, answer })) : [],
      };
    },
    render(v) {
      const own = v.ownCharacter === null ? null : v.roster[v.ownCharacter];
      const candidates = v.roster.filter((c) => !v.eliminated.includes(c.id));
      const unanswered = v.questions.filter((q) => !v.history.some((entry) => entry.attribute === q.id));
      let controls;
      if (v.phase === "setup") controls = `<div class="privacy-card"><h3>${own ? "Your secret is locked." : "Pick your secret character."}</h3><p>Only you can see your choice. Both players may choose the same character.</p>${own ? `<div class="character-grid own-identity">${characterCard(own, false, true)}</div>` : `<div class="toolbar">${characterSelect(v.roster, "Your secret", "face-secret", !v.canAct)}${button("Lock my secret character", "lock", "", !v.canAct)}</div>`}<p class="muted">${v.players.map((p, i) => `${esc(p.name)}: ${v.ready[i] ? "locked ✓" : "choosing…"}`).join(" · ")}</p></div>`;
      else {
        controls = `<div class="face-finder-controls">${own ? `<div class="privacy-card"><h3>Your secret identity</h3><div class="character-grid own-identity">${characterCard(own, false, true)}</div></div>` : ""}<div><h3>${v.done ? "The identities are revealed" : v.canAct ? "Your turn" : `${esc(name(v, v.turn))}’s turn`}</h3>${v.done ? `<p>${v.players.map((p, i) => `${esc(p.name)} chose <strong>${esc(v.roster[v.revealed[i]].name)}</strong>`).join(". ")}.</p>` : `<div class="toolbar"><label for="face-question">Ask a question <select id="face-question" data-field="attribute"${!v.canAct || !unanswered.length ? " disabled" : ""}><option value="">Choose a question…</option>${unanswered.map((q) => `<option value="${q.id}">${esc(q.label)}</option>`).join("")}</select></label>${button("Ask & end turn", "ask", "", !v.canAct || !unanswered.length)}</div><div class="toolbar">${characterSelect(candidates, "Final guess", "face-final-guess", !v.canAct)}${button("Make final guess", "guess", "", !v.canAct)}</div><p class="muted"><strong>A wrong final guess loses immediately.</strong> Choose carefully. Asking one question ends your turn.</p>`}${v.history.length ? `<h3>Your answers</h3><ul class="question-history">${v.history.map((entry) => `<li>${esc(v.questions.find((q) => q.id === entry.attribute).label)} <strong>${entry.answer ? "Yes" : "No"}</strong></li>`).join("")}</ul>` : ""}</div></div>`;
      }
      return `${G.status(v.message, v.done)}${controls}<h3>${v.phase === "setup" ? "Meet the 24 characters" : `Your candidate board · ${candidates.length} remaining`}</h3><p class="muted">${v.phase === "setup" ? "Compare their hair, shirt, glasses, hat, beard, and earrings." : "Your answers automatically eliminate impossible characters. Only your board changes."}</p><div class="character-grid">${v.roster.map((c) => characterCard(c, v.eliminated.includes(c.id))).join("")}</div><p class="muted">Ask one yes-or-no question per turn, or make a final guess. The first correct final guess wins; a wrong final guess loses. Identity choices stay private until the game ends.</p>`;
    },
  });
})();
