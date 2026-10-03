"use strict";
// Multiplayer engines share their redacted player views with the local CPUs.
(() => {
  const G = window.GameNight, R = window.RoomGames, esc = G.esc;
  const copy = (x) => JSON.parse(JSON.stringify(x));
  const playerList = (ps) => ps.map(({ id, name }) => ({ id, name }));
  const seat = (s, p) => Number.isInteger(p) && p >= 0 && p < s.players.length;
  const number = (x, lo, hi) => {
    if (typeof x !== "number" && (typeof x !== "string" || !/^\d+$/.test(x))) return null;
    const n = Number(x); return Number.isSafeInteger(n) && n >= lo && n <= hi ? n : null;
  };
  function base(players, rounds) {
    if (!Array.isArray(players) || players.length < 2 || players.length > 8) throw Error("Choose 2–8 players.");
    return { players: playerList(players), scores: players.map(() => 0), round: 1, totalRounds: rounds, turn: 0, step: 0, done: false, winners: [], phase: "play", message: "" };
  }
  const valid = (s, p, a, serial = false) => !s.done && seat(s, p) && a && typeof a === "object" && !Array.isArray(a) && number(a.round, 1, s.totalRounds) === s.round && (!serial || number(a.step, 0, 100000) === s.step);
  const name = (s, p) => s.players[p]?.name || "Player";
  function finish(s) {
    s.done = true; s.phase = "reveal";
    const best = Math.max(...s.scores); s.winners = s.scores.flatMap((n, i) => n === best ? [i] : []);
    s.message = `${s.winners.map((i) => name(s, i)).join(" & ")} ${s.winners.length === 1 ? "wins" : "tie"} with ${best} points!`;
  }
  function publicView(s, p) {
    return { players: playerList(s.players), scores: [...s.scores], me: seat(s, p) ? p : -1, self: seat(s, p) ? p : -1, round: s.round, totalRounds: s.totalRounds, turn: s.turn, phase: s.phase, step: s.step, done: s.done, winners: [...s.winners], message: s.message };
  }
  const attrs = (v) => `data-round="${v.round}" data-step="${v.step}"`;
  const button = (v, label, type, extra = "", disabled = false, classes = "") => `<button class="button ${classes}" data-move="${type}" ${attrs(v)} ${extra}${disabled ? " disabled" : ""}>${esc(label)}</button>`;
  const scoreStrip = (v) => `<div class="pp-scores" aria-label="Scores">${v.players.map((p, i) => `<div class="pp-score ${i === v.me ? "is-self" : ""} ${i === v.turn ? "is-turn" : ""}"><span>${esc(p.name)}${i === v.me ? " · you" : ""}</span><strong>${v.scores[i]}<small> pts</small></strong></div>`).join("")}</div>`;
  const head = (v, caption) => `${scoreStrip(v)}<div class="pp-round"><span class="eyebrow">${esc(caption)}</span><span>Round ${v.round} / ${v.totalRounds}</span></div>${G.status(v.message, v.done)}`;
  const diceFaces = ["", "⚀", "⚁", "⚂", "⚃", "⚄", "⚅"];
  const diceMarkup = (v, selected, active, type = "hold") => `<div class="pp-dice" aria-label="Dice">${v.dice.map((n, i) => `<button class="pp-die ${selected.includes(i) ? "is-held" : ""}" data-move="${type}" data-die="${i}" ${attrs(v)} aria-pressed="${selected.includes(i)}" aria-label="Die ${i + 1}: ${n}${selected.includes(i) ? ", selected" : ""}" ${active ? "" : "disabled"}><span aria-hidden="true">${diceFaces[n]}</span><small>${selected.includes(i) ? "Held" : "Select"}</small></button>`).join("")}</div>`;
  const rollDice = (n) => Array.from({ length: n }, () => 1 + G.rand(6));
  const tally = (dice) => dice.reduce((a, n) => (a[n]++, a), Array(7).fill(0));

  function farkleScore(dice) {
    if (!dice.length) return 0;
    const c = tally(dice);
    if (dice.length === 6 && c.slice(1).every((n) => n === 1)) return 1500;
    if (dice.length === 6 && c.filter((n) => n === 2).length === 3) return 1500;
    let score = 0;
    for (let face = 1; face <= 6; face++) {
      if (c[face] >= 3) { score += (face === 1 ? 1000 : face * 100) * 2 ** (c[face] - 3); c[face] = 0; }
      if (face === 1 || face === 5) score += c[face] * (face === 1 ? 100 : 50);
      else if (c[face]) return 0;
    }
    return score;
  }
  function scoringSets(dice) {
    const sets = [];
    for (let mask = 1; mask < 2 ** dice.length; mask++) {
      const indices = dice.flatMap((_, i) => mask & (1 << i) ? [i] : []), score = farkleScore(indices.map((i) => dice[i]));
      if (score) sets.push({ indices, score });
    }
    return sets;
  }
  function nextFarkle(s, points) {
    s.scores[s.turn] += points;
    const previous = name(s, s.turn);
    s.turn = (s.turn + 1) % s.players.length;
    if (s.turn === 0) s.round++;
    if (s.round > s.totalRounds) { s.round = s.totalRounds; finish(s); return; }
    s.dice = []; s.selected = []; s.bank = 0; s.rolls = 0;
    s.message = `${previous} ${points ? `banked ${points} points` : "farkled — no points this turn"}. ${name(s, s.turn)}, roll all six dice.`;
  }
  function farkleRoll(s, n) {
    s.dice = rollDice(n); s.selected = []; s.rolls++;
    if (!scoringSets(s.dice).length) nextFarkle(s, 0);
    else s.message = `${name(s, s.turn)}, select scoring dice. Bank safely or roll the rest.`;
  }
  R.register("farkle", {
    title: "Farkle", min: 2, max: 8,
    rules: "<p>Each player gets six turns. Roll six dice and select scoring dice: a single 1 = 100, a single 5 = 50; three of a kind = face × 100 (three 1s = 1,000). Each extra matching die doubles that set. A six-die straight or three pairs = 1,500. Every selected die must score.</p><p>Bank your selected dice and turn total, or keep their points and roll the remaining dice. Using all dice gives six hot dice to roll again. If a roll has no scoring dice, you lose the entire unbanked turn total. After 12 rolls in one turn, bank your scoring selection. Highest total after six turns each wins; ties are shared.</p>",
    create(ps) { return { ...base(ps, 6), dice: [], selected: [], bank: 0, rolls: 0, message: `${ps[0].name}, roll all six dice.` }; },
    act(s, p, a) {
      if (!valid(s, p, a, true) || p !== s.turn) return false;
      if (a.type === "roll" && !s.dice.length) { s.step++; farkleRoll(s, 6); return true; }
      if (a.type === "hold") {
        const n = number(a.die, 0, s.dice.length - 1); if (n === null) return false;
        s.selected = s.selected.includes(n) ? s.selected.filter((i) => i !== n) : [...s.selected, n]; s.step++; return true;
      }
      if (!["bank", "again"].includes(a.type)) return false;
      const points = farkleScore(s.selected.map((i) => s.dice[i]));
      if (!points || (a.type === "again" && s.rolls >= 12)) return false;
      s.step++;
      if (a.type === "bank") nextFarkle(s, s.bank + points);
      else { s.bank += points; farkleRoll(s, s.dice.length - s.selected.length || 6); }
      return true;
    },
    view(s, p) { return { ...publicView(s, p), dice: [...s.dice], selected: [...s.selected], bank: s.bank, rolls: s.rolls, selectionScore: farkleScore(s.selected.map((i) => s.dice[i])) }; },
    render(v) {
      const active = v.me === v.turn && !v.done;
      return `<div class="party-pack">${head(v, "SIX TURNS · EVERY BANK COUNTS")}<div class="pp-metrics"><div><span>Turn pot</span><strong>${v.bank}</strong></div><div><span>Selected dice</span><strong>${v.selectionScore || "—"}</strong></div><div><span>Roll</span><strong>${v.rolls} / 12</strong></div></div>${v.dice.length ? diceMarkup(v, v.selected, active) : `<div class="pp-empty-dice" aria-hidden="true">⚀ ⚂ ⚄</div>`}<div class="pp-actions">${!v.dice.length ? button(v, "Roll six dice", "roll", "", !active) : `${button(v, `Bank ${v.bank + v.selectionScore}`, "bank", "", !active || !v.selectionScore)}${button(v, "Keep & roll again", "again", "", !active || !v.selectionScore || v.rolls >= 12, "secondary")}`}</div><p class="pp-hint">${active ? "Select the dice you want to score. A 1 or 5 scores alone; other faces need three or more." : `${esc(name(v, v.turn))} is taking their turn.`}</p><div class="pp-scoring-key"><span>1 → 100</span><span>5 → 50</span><span>Three alike → ×100</span><span>Straight / 3 pairs → 1,500</span></div></div>`;
    },
  });

  const categories = [
    ["ones", "Ones", 5], ["twos", "Twos", 10], ["threes", "Threes", 15], ["fours", "Fours", 20], ["fives", "Fives", 25], ["sixes", "Sixes", 30],
    ["three", "Three of a kind", 30], ["four", "Four of a kind", 30], ["house", "Full house", 25], ["small", "Small straight", 30], ["large", "Large straight", 40], ["yacht", "Yacht · five alike", 50], ["chance", "Chance", 30],
  ];
  function yachtScore(dice, key) {
    if (dice.length !== 5) return 0;
    const c = tally(dice), sum = dice.reduce((a, n) => a + n, 0), index = categories.findIndex(([id]) => id === key);
    if (index < 0) return 0;
    if (index < 6) return c[index + 1] * (index + 1);
    if (key === "three" || key === "four") return Math.max(...c) >= (key === "three" ? 3 : 4) ? sum : 0;
    if (key === "house") return c.includes(3) && c.includes(2) ? 25 : 0;
    if (key === "small") return [1, 2, 3].some((n) => [n, n + 1, n + 2, n + 3].every((f) => c[f])) ? 30 : 0;
    if (key === "large") return [1, 2].some((n) => [n, n + 1, n + 2, n + 3, n + 4].every((f) => c[f])) ? 40 : 0;
    if (key === "yacht") return c.includes(5) ? 50 : 0;
    return sum;
  }
  function yachtTotal(card) {
    const upper = categories.slice(0, 6).reduce((n, [key]) => n + (card[key] || 0), 0);
    return Object.values(card).reduce((n, p) => n + p, 0) + (upper >= 63 ? 35 : 0);
  }
  R.register("yacht-dice", {
    title: "Yacht Dice", min: 2, max: 8,
    rules: "<p>Fill 13 scorecard categories. On your turn roll five dice up to three times. Tap dice to hold them between rolls, then choose one unused category. You may take a zero. Ones through Sixes score only that face. Three/Four of a kind score the total of all dice; full house (3 + 2) scores 25; four consecutive faces score 30; five consecutive faces score 40; five alike score 50; Chance scores the dice total.</p><p>Score at least 63 across Ones through Sixes for a 35-point bonus. Each category can be used once. Highest total after everyone fills their card wins; ties are shared. Extra yachts do not earn a separate bonus.</p>",
    create(ps) { return { ...base(ps, 13), cards: ps.map(() => ({})), dice: [], held: [], rolls: 0, message: `${ps[0].name}, roll your five dice.` }; },
    act(s, p, a) {
      if (!valid(s, p, a, true) || p !== s.turn) return false;
      if (a.type === "roll" && s.rolls < 3 && s.held.length < 5) { s.dice = Array.from({ length: 5 }, (_, i) => s.held.includes(i) ? s.dice[i] : 1 + G.rand(6)); s.rolls++; s.step++; s.message = `${name(s, p)}, hold dice, roll again, or choose an unused category.`; return true; }
      if (a.type === "hold" && s.dice.length === 5 && s.rolls < 3) { const n = number(a.die, 0, 4); if (n === null) return false; s.held = s.held.includes(n) ? s.held.filter((i) => i !== n) : [...s.held, n]; s.step++; return true; }
      if (a.type !== "score" || s.dice.length !== 5 || !categories.some(([id]) => id === a.category) || Object.hasOwn(s.cards[p], a.category)) return false;
      s.cards[p][a.category] = yachtScore(s.dice, a.category); s.scores[p] = yachtTotal(s.cards[p]); s.step++;
      s.turn = (s.turn + 1) % s.players.length;
      if (s.turn === 0) s.round++;
      if (s.round > 13) { s.round = 13; finish(s); }
      else { s.dice = []; s.held = []; s.rolls = 0; s.message = `${name(s, s.turn)}, roll your five dice.`; }
      return true;
    },
    view(s, p) { return { ...publicView(s, p), cards: copy(s.cards), dice: [...s.dice], held: [...s.held], rolls: s.rolls, categories: categories.map(([id, label, max]) => ({ id, label, max, available: !Object.hasOwn(s.cards[p] || {}, id), points: yachtScore(s.dice, id) })) }; },
    render(v) {
      const active = v.me === v.turn && !v.done;
      return `<div class="party-pack">${head(v, "FIVE DICE · THIRTEEN POSSIBILITIES")}<div class="pp-yacht-top"><div><p class="eyebrow">${esc(name(v, v.turn))}’S DICE · ROLL ${v.rolls}/3</p>${v.dice.length ? diceMarkup(v, v.held, active && v.rolls < 3) : `<div class="pp-empty-dice" aria-hidden="true">⚄ ⚄ ⚄</div>`}</div>${button(v, v.rolls ? "Roll unheld dice" : "Roll five dice", "roll", "", !active || v.rolls >= 3 || v.held.length === 5)}</div><p class="pp-hint">Tap dice to hold them. A score of zero is allowed when a combination does not fit.</p><div class="pp-scorecard-wrap"><table class="pp-scorecard"><caption>Scorecard · Upper section 63+ earns a 35-point bonus</caption><thead><tr><th scope="col">Category</th>${v.players.map((p) => `<th scope="col">${esc(p.name)}</th>`).join("")}<th scope="col">This roll</th></tr></thead><tbody>${v.categories.map((cat) => `<tr><th scope="row">${esc(cat.label)}</th>${v.cards.map((card) => `<td>${card[cat.id] ?? "—"}</td>`).join("")}<td>${button(v, `${cat.points} pts`, "score", `data-category="${cat.id}"`, !active || !v.dice.length || !cat.available, "small")}</td></tr>`).join("")}<tr class="pp-bonus"><th scope="row">Upper bonus</th>${v.cards.map((card) => `<td>${categories.slice(0, 6).reduce((n, [key]) => n + (card[key] || 0), 0) >= 63 ? "+35" : "—"}</td>`).join("")}<td></td></tr></tbody></table></div></div>`;
    },
  });

  const wordBank = [
    ["planet", "Space", "A world orbiting a star"], ["comet", "Space", "An icy visitor with a tail"], ["galaxy", "Space", "A huge family of stars"], ["rocket", "Space", "A vehicle built for launch"],
    ["puzzle", "Pastimes", "A problem with a satisfying solution"], ["riddle", "Pastimes", "A question with a clever answer"], ["guitar", "Music", "A six-string instrument"], ["rhythm", "Music", "The beat that keeps music moving"],
    ["forest", "Nature", "A large area full of trees"], ["island", "Nature", "Land surrounded by water"], ["desert", "Nature", "A landscape with very little rain"], ["stream", "Nature", "A small flowing waterway"],
    ["bridge", "Places", "A crossing over an obstacle"], ["castle", "Places", "A fortified home with towers"], ["garden", "Places", "A place to grow flowers and food"], ["market", "Places", "A place where goods are bought and sold"],
    ["basket", "Objects", "A woven container with a handle"], ["candle", "Objects", "A wick surrounded by wax"], ["compass", "Objects", "A tool that points north"], ["mirror", "Objects", "A surface that reflects your face"],
    ["dragon", "Stories", "A legendary creature that might breathe fire"], ["wizard", "Stories", "A character who casts spells"], ["pirate", "Stories", "A seafaring treasure seeker"], ["knight", "Stories", "An armored warrior"],
    ["turtle", "Animals", "A reptile carrying a shell"], ["rabbit", "Animals", "A long-eared hopping mammal"], ["parrot", "Animals", "A bird known for mimicking sounds"], ["dolphin", "Animals", "A clever marine mammal"],
    ["orange", "Food", "A citrus fruit named for its color"], ["carrot", "Food", "A crunchy root vegetable"], ["cookie", "Food", "A small sweet baked treat"], ["waffle", "Food", "A breakfast treat with little square pockets"],
    ["winter", "Seasons", "The coldest season"], ["summer", "Seasons", "The warmest season"], ["thunder", "Weather", "The sound that follows lightning"], ["rainbow", "Weather", "A colorful arc after rain"],
    ["pencil", "School", "A writing tool with a graphite center"], ["library", "School", "A place to borrow books"], ["science", "School", "Learning about the world through evidence"], ["number", "Math", "A symbol used to count or measure"],
  ];
  function scramble(word) {
    let result = word;
    for (let i = 0; i < 8 && result === word; i++) result = G.shuffle([...word]).join("");
    return result === word ? word.slice(1) + word[0] : result;
  }
  function wordRound(s) {
    const [word, topic, clue] = s.deck[s.round - 1]; s.answer = word; s.topic = topic; s.clue = clue; s.letters = scramble(word);
    s.attempts = s.players.map(() => 0); s.ready = s.players.map(() => false); s.correct = s.players.map(() => false); s.last = s.players.map(() => ""); s.earned = s.players.map(() => 0); s.phase = "play";
    s.message = "Unscramble the letters. You have three guesses; everyone gets the same chance.";
  }
  function settleSimultaneous(s) {
    if (!s.ready.every(Boolean)) return;
    s.phase = "reveal";
    if (s.round === s.totalRounds) finish(s);
  }
  function nextButton(v) { return !v.done ? `${button(v, "Next round →", "next", "", v.me !== 0)}${v.me !== 0 ? `<p class="pp-hint">${esc(name(v, 0))} starts the next round.</p>` : ""}` : ""; }
  function readyList(v) { return `<div class="pp-ready" aria-label="Round submissions">${v.players.map((p, i) => `<span class="${v.ready[i] ? "is-ready" : ""}">${v.ready[i] ? "✓" : "○"} ${esc(p.name)}</span>`).join("")}</div>`; }
  R.register("word-scramble", {
    title: "Word Scramble", min: 2, max: 8, concurrentActions: ["guess", "pass"],
    rules: "<p>Six rounds of scrambled words. Use all the letters and the clue to find the word. Each player gets three guesses: solve on your first guess for 100 points, your second for 70, or your third for 40. Wrong guesses and passes earn no points. Answers stay private until everyone solves, passes, or uses all three guesses. Press Pass to move on if you are stuck.</p><p>Everyone has equal opportunity; speed does not affect the score. The host advances after the reveal. Highest total wins; ties are shared. Offline computers solve from the visible clue and letters with imperfect accuracy.</p>",
    create(ps) { const s = { ...base(ps, 6), deck: G.shuffle(copy(wordBank)).slice(0, 6) }; wordRound(s); return s; },
    act(s, p, a) {
      if (!valid(s, p, a)) return false;
      if (a.type === "next" && s.phase === "reveal" && p === 0) { s.round++; s.step++; wordRound(s); return true; }
      if (s.phase !== "play" || s.ready[p]) return false;
      if (a.type === "pass") { s.ready[p] = true; s.step++; settleSimultaneous(s); if (s.phase === "reveal" && !s.done) s.message = `The word was ${s.answer.toUpperCase()}.`; return true; }
      if (a.type !== "guess" || typeof a.guess !== "string" || a.guess.length > 30) return false;
      const guess = a.guess.trim().toLowerCase();
      if (!/^[a-z]+$/.test(guess) || s.last[p] === guess) return false;
      s.last[p] = guess; s.attempts[p]++; s.correct[p] = guess === s.answer;
      if (s.correct[p]) { s.earned[p] = 130 - 30 * s.attempts[p]; s.scores[p] += s.earned[p]; }
      s.ready[p] = s.correct[p] || s.attempts[p] >= 3; s.step++; settleSimultaneous(s);
      if (s.phase === "reveal" && !s.done) s.message = `The word was ${s.answer.toUpperCase()}.`;
      return true;
    },
    view(s, p) { const mine = seat(s, p); return { ...publicView(s, p), topic: s.topic, clue: s.clue, letters: s.letters, ready: [...s.ready], attempts: mine ? s.attempts[p] : 0, last: mine ? s.last[p] : "", correct: mine && s.correct[p], earned: s.phase === "reveal" ? [...s.earned] : null, answer: s.phase === "reveal" ? s.answer : null }; },
    render(v) {
      const active = v.me >= 0 && v.phase === "play" && !v.ready[v.me];
      return `<div class="party-pack">${head(v, v.topic)}<div class="pp-word-tiles" aria-label="Scrambled letters: ${esc(v.letters)}">${[...v.letters].map((c) => `<span>${c.toUpperCase()}</span>`).join("")}</div><p class="pp-clue">${esc(v.clue)}</p>${v.phase === "reveal" ? `<div class="pp-reveal"><span class="eyebrow">THE WORD WAS</span><h3>${esc(v.answer.toUpperCase())}</h3>${v.players.map((p, i) => `<span>${esc(p.name)} +${v.earned[i]}</span>`).join("")}</div>${nextButton(v)}` : active ? `<div class="pp-answer"><label for="pp-word">Your answer <input id="pp-word" data-field="guess" data-submit="guess" maxlength="30" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Arrange the letters…"></label>${button(v, "Check word", "guess")}${button(v, "Pass", "pass", "", false, "secondary")}</div><p class="pp-hint">${3 - v.attempts} guesses left${v.last ? ` · “${esc(v.last)}” was not the word.` : ""}</p>` : `<p class="pp-hint">${v.correct ? "You solved it! Keep the answer to yourself until the reveal." : "Your guesses are complete. Waiting for the rest of the table."}</p>`}${readyList(v)}</div>`;
    },
  });

  // Stable, self-authored general-knowledge questions. The answer is never sent
  // in an active player view. CPUs use a small visible-question knowledge bank.
  const questions = [
    ["Science", "Which planet is closest to the Sun?", "Mercury", "Venus", "Mars", "Earth"],
    ["Science", "What gas do plants absorb for photosynthesis?", "Carbon dioxide", "Helium", "Hydrogen", "Neon"],
    ["Science", "How many legs does an insect have?", "6", "4", "8", "10"],
    ["Science", "What is the chemical symbol for gold?", "Au", "Ag", "Fe", "Go"],
    ["Science", "Which force keeps planets in orbit?", "Gravity", "Friction", "Magnetism alone", "Buoyancy"],
    ["Science", "What is the largest organ of the human body?", "Skin", "Heart", "Liver", "Lung"],
    ["Science", "What is water's chemical formula?", "H₂O", "CO₂", "O₂", "NaCl"],
    ["Science", "Which animal is a mammal?", "Dolphin", "Shark", "Salmon", "Octopus"],
    ["Space", "Which planet is famous for its prominent rings?", "Saturn", "Mercury", "Venus", "Mars"],
    ["Space", "What is the name of Earth's natural satellite?", "The Moon", "Titan", "Europa", "Phobos"],
    ["Space", "What kind of object is the Sun?", "A star", "A planet", "A comet", "An asteroid"],
    ["Space", "Which galaxy contains our solar system?", "The Milky Way", "Andromeda", "Whirlpool", "Sombrero"],
    ["Geography", "Which is the largest ocean?", "Pacific", "Atlantic", "Indian", "Arctic"],
    ["Geography", "What is the capital of Japan?", "Tokyo", "Kyoto", "Osaka", "Seoul"],
    ["Geography", "On which continent is the Sahara Desert?", "Africa", "Asia", "Australia", "South America"],
    ["Geography", "Which country is shaped like a boot?", "Italy", "Norway", "India", "Greece"],
    ["Geography", "Which imaginary line divides Earth into northern and southern halves?", "The equator", "The prime meridian", "The date line", "The Arctic Circle"],
    ["Geography", "Which country contains the ancient city of Machu Picchu?", "Peru", "Mexico", "Chile", "Egypt"],
    ["Geography", "Which river flows through Paris?", "Seine", "Thames", "Danube", "Rhine"],
    ["Geography", "Which is the smallest continent by land area?", "Australia", "Europe", "Antarctica", "South America"],
    ["Numbers", "How many sides does a hexagon have?", "6", "5", "7", "8"],
    ["Numbers", "What is 12 × 8?", "96", "86", "108", "92"],
    ["Numbers", "What is the only even prime number?", "2", "4", "6", "8"],
    ["Numbers", "How many degrees are in a right angle?", "90", "45", "180", "360"],
    ["Numbers", "What is the square root of 144?", "12", "14", "16", "18"],
    ["Numbers", "What comes next: 1, 1, 2, 3, 5, 8, …?", "13", "10", "11", "16"],
    ["Numbers", "How many minutes are in three hours?", "180", "120", "150", "240"],
    ["Numbers", "What is a quarter of 100?", "25", "20", "40", "50"],
    ["Nature", "What do bees collect from flowers to make honey?", "Nectar", "Sap", "Dew", "Seeds"],
    ["Nature", "What is a baby frog called?", "Tadpole", "Joey", "Cub", "Calf"],
    ["Nature", "Which animal is known for building dams?", "Beaver", "Otter", "Badger", "Squirrel"],
    ["Nature", "Which bird cannot fly?", "Penguin", "Eagle", "Swallow", "Sparrow"],
    ["Nature", "What is the largest living land animal?", "African elephant", "Giraffe", "Hippopotamus", "White rhinoceros"],
    ["Nature", "What process turns a caterpillar into a butterfly?", "Metamorphosis", "Photosynthesis", "Evaporation", "Germination"],
    ["Nature", "How many hearts does an octopus have?", "3", "1", "2", "8"],
    ["Nature", "Which tree produces acorns?", "Oak", "Pine", "Maple", "Willow"],
    ["Arts", "Who painted the Mona Lisa?", "Leonardo da Vinci", "Vincent van Gogh", "Claude Monet", "Pablo Picasso"],
    ["Arts", "Which instrument has black and white keys?", "Piano", "Violin", "Trumpet", "Flute"],
    ["Arts", "How many strings does a standard violin have?", "4", "5", "6", "8"],
    ["Arts", "What do you call the words of a song?", "Lyrics", "Tempo", "Rhythm", "Harmony"],
    ["Arts", "In traditional paint mixing, blue and yellow make which color?", "Green", "Purple", "Orange", "Red"],
    ["Arts", "Who wrote Romeo and Juliet?", "William Shakespeare", "Charles Dickens", "Jane Austen", "Mark Twain"],
    ["Games", "How many squares are on a standard chessboard?", "64", "56", "72", "81"],
    ["Games", "How many suits are in a standard deck of playing cards?", "4", "2", "3", "5"],
    ["Games", "In chess, which piece moves in an L shape?", "Knight", "Bishop", "Rook", "King"],
    ["Games", "How many dots are on opposite faces of a standard die in total?", "7", "6", "8", "9"],
    ["Games", "How many rings are in the Olympic symbol?", "5", "4", "6", "7"],
    ["Games", "In tennis, what word means a score of zero?", "Love", "Nil", "Blank", "Duck"],
    ["Everyday", "What tool measures temperature?", "Thermometer", "Barometer", "Compass", "Ruler"],
    ["Everyday", "How many days does a leap year have?", "366", "364", "365", "367"],
    ["Everyday", "Which direction does the Sun generally rise from?", "East", "West", "North", "South"],
    ["Everyday", "Which unit measures electrical resistance?", "Ohm", "Volt", "Watt", "Ampere"],
    ["Everyday", "What does a barometer measure?", "Air pressure", "Wind speed", "Rainfall", "Temperature"],
    ["Everyday", "What is the main ingredient in traditional hummus?", "Chickpeas", "Lentils", "Potatoes", "Rice"],
    ["History", "Which civilization built the pyramids at Giza?", "Ancient Egyptians", "Ancient Romans", "Inca", "Vikings"],
    ["History", "Who was the first person to walk on the Moon?", "Neil Armstrong", "Yuri Gagarin", "Buzz Aldrin", "John Glenn"],
    ["History", "What material gave the Bronze Age its name?", "An alloy of copper and tin", "Pure iron", "Silver", "Glass"],
    ["Language", "What is the opposite of 'ancient'?", "Modern", "Distant", "Fragile", "Silent"],
    ["Language", "Which word is a palindrome?", "Level", "River", "Music", "Cloud"],
    ["Language", "What do we call a word with the same meaning as another?", "Synonym", "Antonym", "Acronym", "Homophone"],
  ];
  function quizRound(s) {
    const [topic, question, answer, ...others] = s.deck[s.round - 1]; s.topic = topic; s.question = question; s.options = G.shuffle([answer, ...others]); s.answer = s.options.indexOf(answer); s.picks = s.players.map(() => null); s.ready = s.players.map(() => false); s.phase = "play"; s.message = "Lock in one answer. Everyone reveals together.";
  }
  R.register("trivia-quiz", {
    title: "Trivia Quiz", min: 2, max: 8, concurrentActions: ["answer"],
    rules: "<p>Ten questions across science, geography, arts, games, and more. Everyone privately selects one answer. Answers lock immediately and reveal once all players have chosen. Each correct answer earns 100 points; wrong answers earn zero. Speed has no effect. The host starts the next question.</p><p>Highest total after ten questions wins; ties are shared. Offline computers use the public question and a general-knowledge bank, with a 75% chance of recalling the correct answer.</p>",
    create(ps) { const s = { ...base(ps, 10), deck: G.shuffle(copy(questions)).slice(0, 10) }; quizRound(s); return s; },
    act(s, p, a) {
      if (!valid(s, p, a)) return false;
      if (a.type === "next" && s.phase === "reveal" && p === 0) { s.round++; s.step++; quizRound(s); return true; }
      const pick = number(a.answer, 0, 3);
      if (a.type !== "answer" || s.phase !== "play" || s.ready[p] || pick === null) return false;
      s.picks[p] = pick; s.ready[p] = true; s.step++;
      if (s.ready.every(Boolean)) { s.picks.forEach((n, i) => { if (n === s.answer) s.scores[i] += 100; }); settleSimultaneous(s); if (!s.done) s.message = `The answer is ${s.options[s.answer]}.`; }
      return true;
    },
    view(s, p) { return { ...publicView(s, p), topic: s.topic, question: s.question, options: [...s.options], ready: [...s.ready], own: seat(s, p) ? s.picks[p] : null, picks: s.phase === "reveal" ? [...s.picks] : null, answer: s.phase === "reveal" ? s.answer : null }; },
    render(v) {
      const active = v.me >= 0 && v.phase === "play" && !v.ready[v.me];
      return `<div class="party-pack">${head(v, v.topic)}<h3 class="pp-question">${esc(v.question)}</h3><div class="pp-options">${v.options.map((option, i) => `<button class="pp-option ${v.phase === "reveal" && v.answer === i ? "is-correct" : ""} ${v.own === i ? "is-picked" : ""}" data-move="answer" data-answer="${i}" ${attrs(v)} ${active ? "" : "disabled"}><span class="pp-option-letter">${"ABCD"[i]}</span><span>${esc(option)}</span>${v.phase === "reveal" && v.answer === i ? `<span aria-label="Correct answer">✓</span>` : v.own === i ? `<span aria-label="Your choice">●</span>` : ""}</button>`).join("")}</div>${v.phase === "reveal" ? `<div class="pp-reveal pp-reveal-small">${v.players.map((p, i) => `<span>${esc(p.name)} ${v.picks[i] === v.answer ? "+100 ✓" : "+0"}</span>`).join("")}</div>${nextButton(v)}` : `<p class="pp-hint">${v.ready[v.me] ? "Your answer is locked. Waiting for everyone else." : "Choose carefully — your first answer is final."}</p>`}${readyList(v)}</div>`;
    },
  });

  function bidRound(s) { s.bids = s.players.map(() => null); s.ready = s.players.map(() => false); s.phase = "play"; s.roundWinner = -1; s.message = "Pick a number from 1 to 20. The lowest number chosen by exactly one player wins."; }
  R.register("unique-bid", {
    title: "Unique Bid", min: 2, max: 8, concurrentActions: ["bid"],
    rules: "<p>Seven rounds of reading the table. Everyone secretly picks an integer from 1 to 20. Once all choices are locked, matching numbers cancel out. The lowest number chosen by exactly one player earns 3 points. If every choice is duplicated, nobody scores.</p><p>Choose low, but avoid being predictable. Previous rounds stay visible to help you spot patterns. The host starts each new round. Highest total wins; ties are shared.</p>",
    create(ps) { const s = { ...base(ps, 7), history: [] }; bidRound(s); return s; },
    act(s, p, a) {
      if (!valid(s, p, a)) return false;
      if (a.type === "next" && s.phase === "reveal" && p === 0) { s.round++; s.step++; bidRound(s); return true; }
      const bid = number(a.bid, 1, 20);
      if (a.type !== "bid" || s.phase !== "play" || s.ready[p] || bid === null) return false;
      s.bids[p] = bid; s.ready[p] = true; s.step++;
      if (s.ready.every(Boolean)) {
        const unique = s.bids.filter((b) => s.bids.filter((n) => n === b).length === 1);
        s.roundWinner = unique.length ? s.bids.indexOf(Math.min(...unique)) : -1;
        if (s.roundWinner >= 0) s.scores[s.roundWinner] += 3;
        s.history.push({ round: s.round, bids: [...s.bids], winner: s.roundWinner }); settleSimultaneous(s);
        if (!s.done) s.message = s.roundWinner >= 0 ? `${name(s, s.roundWinner)} has the lowest unique number: ${s.bids[s.roundWinner]}. +3 points!` : "Every number was matched. Nobody scores this round.";
      }
      return true;
    },
    view(s, p) { return { ...publicView(s, p), ready: [...s.ready], own: seat(s, p) ? s.bids[p] : null, bids: s.phase === "reveal" ? [...s.bids] : null, roundWinner: s.roundWinner, history: copy(s.history) }; },
    render(v) {
      const active = v.me >= 0 && v.phase === "play" && !v.ready[v.me];
      return `<div class="party-pack">${head(v, "GO LOW · STAND ALONE")}${v.phase === "play" ? `<div class="pp-bid-hero"><span class="eyebrow">YOUR SECRET NUMBER</span><strong>${v.own ?? "?"}</strong><p>${v.own ? "Locked in. Your number stays private until everyone is ready." : "One to twenty. How low will you go?"}</p></div>${active ? `<div class="pp-answer"><label for="pp-bid">Pick your number <select id="pp-bid" data-field="bid" aria-label="Your secret number">${Array.from({ length: 20 }, (_, i) => `<option value="${i + 1}">${i + 1}</option>`).join("")}</select></label>${button(v, "Lock my number", "bid")}</div>` : ""}` : `<div class="pp-bid-results">${v.players.map((p, i) => `<div class="${v.roundWinner === i ? "is-winner" : ""}"><span>${esc(p.name)}</span><strong>${v.bids[i]}</strong><small>${v.roundWinner === i ? "+3 · lowest unique" : v.bids.filter((n) => n === v.bids[i]).length > 1 ? "Matched" : "Unique, but higher"}</small></div>`).join("")}</div>${nextButton(v)}`}${readyList(v)}${v.history.length ? `<details class="pp-history"><summary>Previous rounds · read the table</summary>${v.history.map((h) => `<div><strong>Round ${h.round}</strong><p>${h.bids.map((n, i) => `${esc(name(v, i))}: ${n}${i === h.winner ? " ★" : ""}`).join(" · ")}</p></div>`).join("")}</details>` : ""}</div>`;
    },
  });

  function choose(id, v, random = Math.random) {
    if (v.done || v.me < 0) return null;
    const a = { round: v.round, step: v.step };
    if (v.phase === "reveal") return v.me === 0 ? { ...a, type: "next" } : null;
    if (id === "farkle") {
      if (v.me !== v.turn) return null;
      if (!v.dice.length) return { ...a, type: "roll" };
      const options = scoringSets(v.dice).sort((x, y) => y.score - x.score || y.indices.length - x.indices.length), best = options[0];
      if (!best) return null;
      const changed = v.selected.find((i) => !best.indices.includes(i)) ?? best.indices.find((i) => !v.selected.includes(i));
      if (changed !== undefined) return { ...a, type: "hold", die: changed };
      const remaining = v.dice.length - best.indices.length;
      return { ...a, type: v.rolls >= 12 || v.bank + best.score >= 500 || (remaining > 0 && remaining <= 2) ? "bank" : "again" };
    }
    if (id === "yacht-dice") {
      if (v.me !== v.turn) return null;
      if (!v.dice.length) return { ...a, type: "roll" };
      const available = v.categories.filter((c) => c.available), best = available.slice().sort((x, y) => (y.points / y.max + y.points / 200) - (x.points / x.max + x.points / 200))[0];
      if (v.rolls === 3 || best.points >= best.max || (best.id === "house" && best.points === 25)) return { ...a, type: "score", category: best.id };
      const counts = tally(v.dice), target = [1, 2, 3, 4, 5, 6].sort((x, y) => counts[y] - counts[x] || y - x)[0];
      let keep = v.dice.flatMap((n, i) => n === target ? [i] : []);
      if (available.every((c) => ["chance", "small", "large"].includes(c.id))) {
        if (available.some((c) => ["small", "large"].includes(c.id))) keep = v.dice.flatMap((n, i) => v.dice.indexOf(n) === i ? [i] : []);
        else keep = v.dice.flatMap((n, i) => n >= 4 ? [i] : []);
      }
      if (keep.length === 5) return { ...a, type: "score", category: best.id };
      const changed = v.held.find((i) => !keep.includes(i)) ?? keep.find((i) => !v.held.includes(i));
      return changed !== undefined ? { ...a, type: "hold", die: changed } : { ...a, type: "roll" };
    }
    if (v.ready?.[v.me]) return null;
    if (id === "word-scramble") {
      const word = wordBank.find(([word, , clue]) => [...word].sort().join("") === [...v.letters].sort().join("") && clue === v.clue)?.[0];
      if (word && (random() < 0.7 || v.attempts === 2)) return { ...a, type: "guess", guess: word };
      return { ...a, type: "pass" };
    }
    if (id === "trivia-quiz") {
      const known = questions.find((q) => q[1] === v.question)?.[2], correct = v.options.indexOf(known), wrong = [0, 1, 2, 3].filter((n) => n !== correct);
      return { ...a, type: "answer", answer: correct >= 0 && random() < 0.75 ? correct : wrong[Math.floor(random() * wrong.length)] };
    }
    if (id === "unique-bid") {
      const counts = Array(21).fill(0);
      v.history.slice(-3).forEach((h) => h.bids.forEach((n, i) => { if (i !== v.me) counts[n]++; }));
      const candidates = Array.from({ length: Math.min(12, 3 + v.players.length) }, (_, i) => ({ bid: i + 1, weight: 1 / ((i + 1) ** 0.65 * (1 + counts[i + 1] * 0.8)) }));
      let ticket = random() * candidates.reduce((sum, c) => sum + c.weight, 0);
      return { ...a, type: "bid", bid: candidates.find((c) => (ticket -= c.weight) < 0)?.bid || 1 };
    }
    return null;
  }
  window.PartyPackCPU = Object.freeze({ choose });
  const catalog = [
    ["farkle", "Farkle", "Six dice. One risky decision. Bank it or chase more.", "Dice & board", "Vs computer", "10 min", "⚅", "amber"],
    ["yacht-dice", "Yacht Dice", "Hold your best dice. Build a brilliant scorecard.", "Dice & board", "Vs computer", "15 min", "⚄", "mint"],
    ["word-scramble", "Word Scramble", "Untangle the letters before you run out of guesses.", "Party", "Vs computer", "5 min", "Aa", "lavender"],
    ["trivia-quiz", "Trivia Quiz", "Ten questions. A table full of friendly know-it-alls.", "Party", "Vs computer", "10 min", "?", "sky"],
    ["unique-bid", "Unique Bid", "Think small. Think different. Outguess the whole table.", "Party", "Vs computer", "5 min", "#", "coral"],
  ];
  (G.expansionCatalog ||= []).push(...catalog);
  (G.cpuIds ||= []).push(...catalog.map(([id]) => id));
  for (const [id] of catalog) {
    const engine = R.games[id];
    G.register(id, {
      rules: engine.rules,
      note: "Play offline against 1–7 computer opponents, or create an online room for 2–8 friends. Computers use only their own player view.",
      mount(root) {
        let state = null, timer = null, disposed = false, opponents = 2, renderedKey = "", notice = "";
        function start() { clearTimeout(timer); timer = null; state = engine.create([{ id: "you", name: "You" }, ...Array.from({ length: opponents }, (_, i) => ({ id: `cpu-${i}`, name: ["Atlas", "Nova", "Orbit", "Pixel", "Echo", "Comet", "Sol"][i] }))]); notice = ""; renderedKey = ""; render(); schedule(); }
        function apply(actor, action) { const next = copy(state); if (!engine.act(next, actor, action)) return false; state = next; return true; }
        function cpuMove() { for (let i = 1; i < state.players.length; i++) { const base = () => choose(id, engine.view(state, i)); const action = G.cpu ? G.cpu.decide(engine, state, i, base) : base(); if (action) return [i, action]; } return null; }
        function schedule() {
          if (disposed || timer !== null || !cpuMove()) return;
          timer = setTimeout(() => { timer = null; if (disposed) return; const move = cpuMove(); if (move) apply(...move); render(); schedule(); }, 430);
        }
        function render() {
          if (disposed) return;
          const key = `${state.round}:${state.phase}:${state.turn}`, fields = key === renderedKey ? [...root.querySelectorAll("[data-field]")].map((f) => [f.dataset.field, f.value]) : [];
          const focused = root.contains(document.activeElement) ? document.activeElement.dataset.field : null;
          root.innerHTML = `<div class="pp-local"><div><span class="room-badge">OFFLINE · VS COMPUTER</span><p>Take your time. Every opponent plays from its own view.</p></div><label>Computer opponents <select data-pp-count aria-label="Number of computer opponents">${Array.from({ length: 7 }, (_, i) => `<option value="${i + 1}" ${opponents === i + 1 ? "selected" : ""}>${i + 1} ${i ? "opponents" : "opponent"}</option>`).join("")}</select></label><button class="button secondary small" data-pp-restart>New match</button></div>${notice ? `<p role="alert" class="game-status">${esc(notice)}</p>` : ""}${engine.render(engine.view(state, 0))}`;
          fields.forEach(([field, value]) => { const input = root.querySelector(`[data-field="${field}"]`); if (input) input.value = value; });
          if (focused) root.querySelector(`[data-field="${focused}"]`)?.focus({ preventScroll: true });
          renderedKey = key;
        }
        root.onclick = (event) => {
          if (event.target.closest("[data-pp-restart]")) { start(); return; }
          const btn = event.target.closest("[data-move]"); if (disposed || !btn || !root.contains(btn) || btn.disabled) return;
          const action = { ...btn.dataset, type: btn.dataset.move }; delete action.move;
          root.querySelectorAll("[data-field]").forEach((field) => { action[field.dataset.field] = field.value; });
          notice = apply(0, action) ? "" : "That move is not available. Check your selection and try again.";
          render(); schedule();
        };
        root.onchange = (event) => { if (event.target.matches("[data-pp-count]")) { opponents = Number(event.target.value); start(); } };
        root.onkeydown = (event) => { if (event.key === "Enter" && event.target.matches("input[data-submit]")) { event.preventDefault(); root.querySelector(`[data-move="${event.target.dataset.submit}"]:not(:disabled)`)?.click(); } };
        start();
        return () => { disposed = true; clearTimeout(timer); timer = null; root.onclick = null; root.onchange = null; root.onkeydown = null; };
      },
    });
  }
})();
