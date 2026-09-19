"use strict";

// The host keeps these states. Only the allowlisted, per-seat view crosses the wire.
(() => {
  const R = window.RoomGames, G = window.GameNight, esc = G.esc;
  const labels = { crew: "Crew", imposter: "Imposter", mafia: "Mafia", detective: "Detective", doctor: "Doctor", villager: "Villager" };
  const clonePlayers = (players) => players.map((p) => ({ id: p.id, name: p.name }));
  const seat = (s, i) => Number.isInteger(i) && i >= 0 && i < s.players.length;
  const name = (s, i) => s.players[i]?.name || "Player";
  const random = (n) => Math.floor(Math.random() * n);
  const shuffle = (list) => {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = random(i + 1); [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  };
  const integer = (value, min, max) => {
    if (typeof value !== "number" && (typeof value !== "string" || !/^-?\d+$/.test(value))) return null;
    const n = Number(value);
    return Number.isSafeInteger(n) && n >= min && n <= max ? n : null;
  };
  const cleanText = (value, max) => {
    if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return null;
    return value.trim() || null;
  };
  const normalized = (value) => value.toLowerCase().normalize("NFKC").replace(/[^a-z0-9]+/g, " ").trim();
  const valid = (s, actor, a) => !s.done && seat(s, actor) && a && typeof a === "object" && !Array.isArray(a) && typeof a.type === "string"
    && integer(a.round, 0, 1000) === s.round
    && a.phase === s.phase;
  const living = (s) => s.alive.flatMap((alive, i) => alive ? [i] : []);
  const leader = (s) => s.alive[0] ? 0 : s.alive.indexOf(true);
  const roleSeats = (s, role) => s.roles.flatMap((r, i) => r === role ? [i] : []);
  const scoped = (v) => `data-round="${v.round}" data-phase="${v.phase}"`;
  const button = (v, text, action, attrs = "", disabled = false) => `<button class="button" data-move="${action}" ${scoped(v)} ${attrs} ${disabled ? "disabled" : ""}>${esc(text)}</button>`;
  const stat = (text, value) => G.stat(esc(text), esc(value));
  function base(players, min) {
    if (!Array.isArray(players) || players.length < min || players.length > 8) throw new Error(`This game needs ${min}–8 players.`);
    return { players: clonePlayers(players), alive: players.map(() => true), done: false, winners: [], round: 0, turn: -1, message: "", votes: players.map(() => null), history: [], messages: [] };
  }
  function publicBase(s, viewer) {
    const self = seat(s, viewer) ? viewer : -1;
    return {
      players: clonePlayers(s.players), self, me: self, phase: s.phase, round: s.round, turn: s.turn,
      done: s.done, winners: s.done ? [...s.winners] : [], message: s.message,
      alive: [...s.alive], leader: leader(s),
      revealedRoles: s.roles.map((role, i) => s.done || !s.alive[i] ? role : null),
      ownRole: self >= 0 ? s.roles[self] : null,
      ownVote: self >= 0 ? s.votes[self] : null,
      votesSubmitted: s.votes.filter((vote) => vote !== null).length,
      messages: s.messages.map((message) => ({ actor: message.actor, text: message.text })),
      history: s.history.map((event) => ({ text: event.text, round: event.round, tallies: event.tallies ? event.tallies.map((tally) => ({ target: tally.target, count: tally.count })) : [] })),
      canAct: !s.done && self >= 0 && s.alive[self],
    };
  }
  function finish(s, team, text) {
    s.done = true; s.phase = "done"; s.turn = -1;
    s.winners = s.roles.flatMap((role, i) => (team === "crew" ? role === "crew" : team === "imposter" ? role === "imposter" : team === "village" ? role !== "mafia" : role === "mafia") ? [i] : []);
    s.message = text;
    s.history.push({ round: s.round, text });
  }
  function record(s, text, tallies) {
    s.message = text; s.history.push({ round: s.round, text, ...(tallies ? { tallies } : {}) });
  }
  function roster(v) {
    return `<div class="deduction-roster">${v.players.map((player, i) => `<div class="deduction-player ${v.alive[i] ? "" : "eliminated"} ${i === v.self ? "is-you" : ""}"><span class="player-avatar avatar-${i % 6}" aria-hidden="true">${esc(player.name.slice(0, 1).toUpperCase())}</span><div><strong>${esc(player.name)}${i === v.self ? " · you" : ""}</strong><small>${v.revealedRoles[i] ? esc(labels[v.revealedRoles[i]]) : v.alive[i] ? "In the game" : "Eliminated"}${!v.alive[i] ? " · eliminated" : ""}</small></div></div>`).join("")}</div>`;
  }
  function history(v) {
    return v.history.length ? `<details class="deduction-history"><summary>Game log · ${v.history.length} updates</summary><ol>${v.history.map((event) => `<li><strong>Round ${event.round}</strong> ${esc(event.text)}${event.tallies.length ? `<small>${event.tallies.map((t) => `${t.target === -1 ? "Skip" : esc(name(v, t.target))}: ${t.count}`).join(" · ")}</small>` : ""}</li>`).join("")}</ol></details>` : "";
  }
  function chat(v) {
    const count = v.messages.filter((message) => message.actor === v.self).length;
    return `<section class="deduction-chat"><h3>Table discussion</h3><p class="muted">Talk together, or leave a short message here. Three messages per player each round.</p><div class="deduction-chat-log" aria-live="polite">${v.messages.length ? v.messages.map((message) => `<p><strong>${esc(name(v, message.actor))}</strong><span>${esc(message.text)}</span></p>`).join("") : '<p class="muted">The table is quiet. Who seems suspicious?</p>'}</div>${v.canAct && count < 3 ? `<label for="deduction-message">Your message (${count}/3 sent)</label><input id="deduction-message" data-field="message" maxlength="160" autocomplete="off" placeholder="Make your case…"><div class="toolbar">${button(v, "Send message", "message")}</div>` : ""}</section>`;
  }
  function addMessage(s, actor, a) {
    if (a.type !== "message" || s.phase !== "discussion" || !s.alive[actor] || s.messages.filter((m) => m.actor === actor).length >= 3) return false;
    const message = cleanText(a.message, 160); if (!message) return false;
    s.messages.push({ actor, text: message }); return true;
  }
  function voteView(v) {
    const available = v.canAct && v.ownVote === null;
    return `<section class="deduction-voting"><h3>Who gets your vote?</h3><p class="muted">Votes lock immediately and stay secret. A tied top vote or a winning skip removes nobody.</p>${available ? `<div class="deduction-targets">${v.players.map((player, i) => v.alive[i] && i !== v.self ? button(v, player.name, "vote", `data-target="${i}"`) : "").join("")}${button(v, "Skip elimination", "vote", 'data-target="-1"')}</div>` : `<div class="privacy-card"><h3>${v.ownVote !== null ? "Your vote is locked" : "Watch the vote"}</h3><p>${v.ownVote !== null ? v.ownVote === -1 ? "You voted to skip elimination." : `You voted for ${esc(name(v, v.ownVote))}.` : "Eliminated players can follow along, but cannot vote."}</p></div>`}<p class="muted center" role="status">${v.votesSubmitted} / ${v.alive.filter(Boolean).length} votes locked</p></section>`;
  }
  function castVote(s, actor, a) {
    if (a.type !== "vote" || s.phase !== "vote" || !s.alive[actor] || s.votes[actor] !== null) return false;
    const target = integer(a.target, -1, s.players.length - 1);
    if (target === null || target === actor || target !== -1 && !s.alive[target]) return false;
    s.votes[actor] = target; return true;
  }
  function countVotes(s) {
    const counts = new Map();
    for (const i of living(s)) counts.set(s.votes[i], (counts.get(s.votes[i]) || 0) + 1);
    const tallies = [...counts].map(([target, count]) => ({ target, count })).sort((a, b) => b.count - a.count || a.target - b.target);
    const tied = tallies.length > 1 && tallies[0].count === tallies[1].count;
    return { target: tied ? -1 : tallies[0].target, tied, tallies };
  }
  function discussion(v) {
    return `${chat(v)}<div class="toolbar">${v.self === v.leader ? button(v, "Open the vote", "open_vote") : `<p class="muted">${esc(name(v, v.leader))} opens voting when the discussion is finished.</p>`}</div>`;
  }

  const prompts = {
    words: ["Pineapple", "Lighthouse", "Volcano", "Backpack", "Popcorn", "Penguin", "Umbrella", "Telescope", "Rainbow", "Chocolate", "Astronaut", "Library", "Fireworks", "Carousel", "Snowflake", "Guitar", "Treasure", "Octopus", "Campfire", "Waterfall", "Bicycle", "Castle", "Mermaid", "Robot", "Jellyfish", "Pancake", "Desert", "Dragon", "Carnival", "Thunder", "Compass", "Dinosaur", "Submarine", "Butterfly", "Sandwich", "Moonlight", "Puzzle", "Garden", "Cinema", "Airport", "Cactus", "Pirate", "Sunglasses", "Museum", "Hammock", "Skateboard", "Marshmallow", "Tornado", "Saxophone", "Igloo"],
    phrases: ["A rainy day", "Under the sea", "Birthday party", "Lost and found", "Once upon a time", "On thin ice", "A piece of cake", "Road trip", "Midnight snack", "The early bird", "Summer vacation", "Space travel", "Hide and seek", "A lucky charm", "Breakfast in bed", "Movie night", "Treasure hunt", "Time flies", "Rock paper scissors", "A fresh start", "Around the world", "The last straw", "Full moon", "A secret handshake", "Cloud nine", "First day of school", "Wish upon a star", "A wild goose chase", "The great outdoors", "A light bulb moment"],
    numbers: ["0", "1", "2", "3", "4", "5", "7", "8", "9", "10", "11", "12", "13", "15", "16", "18", "20", "21", "24", "25", "26", "30", "31", "40", "42", "50", "52", "60", "64", "70", "75", "80", "90", "99", "100", "101", "180", "200", "300", "360", "365", "404", "500", "1000"],
  };
  const categoryNames = { words: "Word", phrases: "Phrase", numbers: "Number", mixed: "Surprise me" };
  function imposterRound(s) {
    s.phase = "hint"; s.votes = s.players.map(() => null); s.messages = [];
    const first = (s.startSeat + s.round - 1) % s.players.length;
    s.hintOrder = Array.from({ length: s.players.length }, (_, n) => (first + n) % s.players.length).filter((i) => s.alive[i]);
    s.hintIndex = 0; s.turn = s.hintOrder[0];
  }
  function resolveImposterVote(s) {
    const result = countVotes(s);
    if (result.target !== -1) {
      s.alive[result.target] = false;
      record(s, `${name(s, result.target)} was ejected. They were ${s.roles[result.target] === "imposter" ? "an imposter" : "crew"}.`, result.tallies);
    } else record(s, result.tied ? "The vote tied. Nobody was ejected." : "The table skipped elimination. Nobody was ejected.", result.tallies);
    const alive = living(s), imposters = alive.filter((i) => s.roles[i] === "imposter");
    if (!imposters.length) {
      s.phase = "last_guess"; s.turn = result.target; s.lastGuesser = result.target;
      s.message += " The final imposter gets one chance to name the secret and steal the win.";
    } else if (imposters.length >= alive.length - imposters.length) finish(s, "imposter", "The imposters have reached equal numbers. Imposters win!");
    else if (s.round >= 3) finish(s, "imposter", "Three rounds are over and an imposter remains. Imposters win!");
    else { s.round++; imposterRound(s); }
  }
  R.register("imposter", {
    title: "Imposter", min: 3, max: 8, concurrentActions: ["vote", "message"],
    create(players) {
      return { ...base(players, 3), roles: players.map(() => null), phase: "setup", category: "mixed", secret: "", imposterCount: players.length >= 6 ? 2 : 1, hints: [], hintOrder: [], hintIndex: 0, startSeat: 0, lastGuesser: -1, finalGuess: null, message: "The host chooses the secret category, then deals everyone a private role." };
    },
    act(s, actor, a) {
      if (!valid(s, actor, a)) return false;
      if (a.type === "deal" && s.phase === "setup" && actor === 0) {
        const category = a.category === undefined ? "mixed" : a.category;
        if (!["mixed", "words", "phrases", "numbers"].includes(category)) return false;
        const count = a.count === undefined || a.count === "auto" ? s.players.length >= 6 ? 2 : 1 : integer(a.count, 1, s.players.length >= 6 ? 2 : 1);
        if (count === null) return false;
        s.category = category === "mixed" ? ["words", "phrases", "numbers"][random(3)] : category;
        s.secret = prompts[s.category][random(prompts[s.category].length)]; s.imposterCount = count;
        const selected = shuffle(s.players.map((_, i) => i)).slice(0, count);
        s.roles = s.players.map((_, i) => selected.includes(i) ? "imposter" : "crew");
        s.round = 1; s.startSeat = random(s.players.length); imposterRound(s);
        s.message = "Roles are dealt. Read your private card, then give one subtle hint when your turn comes.";
        return true;
      }
      if (a.type === "hint" && s.phase === "hint" && actor === s.turn && s.alive[actor]) {
        const text = cleanText(a.hint, 80); if (!text) return false;
        s.hints.push({ round: s.round, actor, text }); s.hintIndex++;
        if (s.hintIndex === s.hintOrder.length) { s.phase = "discussion"; s.turn = -1; s.message = "All hints are in. Compare clues, make your case, then vote."; }
        else { s.turn = s.hintOrder[s.hintIndex]; s.message = "The next hint is up. Help the crew without giving away the secret."; }
        return true;
      }
      if (a.type === "open_vote" && s.phase === "discussion" && actor === leader(s)) {
        s.phase = "vote"; s.turn = -1; s.message = "Vote privately. The result appears when every living player has locked a vote."; return true;
      }
      if (addMessage(s, actor, a)) return true;
      if (castVote(s, actor, a)) {
        if (living(s).every((i) => s.votes[i] !== null)) resolveImposterVote(s);
        return true;
      }
      if (a.type === "guess" && s.phase === "last_guess" && actor === s.lastGuesser) {
        const guess = cleanText(a.guess, 100); if (!guess || !normalized(guess)) return false;
        s.finalGuess = guess;
        if (normalized(guess) === normalized(s.secret)) finish(s, "imposter", "The final imposter named the secret. Imposters steal the win!");
        else finish(s, "crew", "The last guess missed. Every imposter is out. Crew wins!");
        return true;
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), ownCrew = seat(s, viewer) && s.roles[viewer] === "crew";
      return { ...v, category: s.category, imposterCount: s.imposterCount,
        secret: s.done || ownCrew ? s.secret : null,
        hints: s.hints.map((hint) => ({ round: hint.round, actor: hint.actor, text: hint.text })),
        lastGuesser: s.phase === "last_guess" ? s.lastGuesser : -1,
        finalGuess: s.done ? s.finalGuess : null,
        canAct: v.canAct && (s.phase !== "hint" || viewer === s.turn) || !s.done && s.phase === "last_guess" && viewer === s.lastGuesser,
      };
    },
    render(v) {
      if (v.phase === "setup") return `<div class="deduction-game imposter-game"><div class="privacy-card"><span class="eyebrow">ONE SECRET. SOME VERY GOOD LIARS.</span><h3>Set the scene</h3><p>The crew gets the same secret. Imposters only learn its category. Give subtle hints, find the imposters, and keep your secret safe.</p></div>${v.self === 0 ? `<div class="deduction-setup"><label for="imposter-category">Secret category</label><select id="imposter-category" data-field="category"><option value="mixed">Surprise me · word, phrase, or number</option><option value="words">Random word</option><option value="phrases">Random phrase</option><option value="numbers">Random number</option></select><label for="imposter-count">Imposters</label><select id="imposter-count" data-field="count"><option value="auto">Recommended · ${v.imposterCount}</option><option value="1">1 imposter</option>${v.players.length >= 6 ? '<option value="2">2 imposters</option>' : ""}</select><div class="toolbar">${button(v, "Deal private roles", "deal")}</div></div>` : `<p class="muted center">${esc(name(v, 0))} is setting up the round.</p>`}${imposterRules()}</div>`;
      const card = `<details class="deduction-secret"><summary>Your private card · tap to reveal</summary><div class="privacy-card"><span class="eyebrow">${v.ownRole === "imposter" ? "BLEND IN" : "PROTECT THE SECRET"}</span><h3>You are ${v.ownRole === "imposter" ? "an imposter" : "crew"}</h3>${v.secret !== null ? `<p>The secret ${esc(categoryNames[v.category].toLowerCase())} is</p><div class="deduction-secret-word">${esc(v.secret)}</div>` : `<p>Category: <strong>${esc(categoryNames[v.category])}</strong>. You do not know the secret. Use the other hints to blend in.</p>`}<p class="muted">${!v.alive[v.self] ? "You are out of the hint and voting rounds. Keep what you know to yourself." : v.ownRole === "imposter" ? "Survive three rounds, or reach equal numbers with the crew." : "Find every imposter before the third vote. Do not say the secret in your hint."}</p></div></details>`;
      let action = "";
      if (v.phase === "hint") action = v.self === v.turn ? `<section class="deduction-action"><h3>Your hint, your poker face.</h3><label for="imposter-hint">Give a short hint (${esc(categoryNames[v.category].toLowerCase())})</label><input id="imposter-hint" data-field="hint" maxlength="80" autocomplete="off" placeholder="Subtle enough to keep them guessing…"><div class="toolbar">${button(v, "Share my hint", "hint")}</div><p class="muted">One hint each. Avoid the secret itself, spelling clues, and exact digits for a number.</p></section>` : `<div class="privacy-card"><h3>${esc(name(v, v.turn))} is giving a hint</h3><p>${v.alive[v.self] ? "Read the clue board and get your next hint ready." : "Watch the clues unfold. You are out of this round."}</p></div>`;
      else if (v.phase === "discussion") action = discussion(v);
      else if (v.phase === "vote") action = voteView(v);
      else if (v.phase === "last_guess") action = v.self === v.lastGuesser ? `<section class="deduction-action"><h3>One last chance to steal the win.</h3><p>Guess the exact secret ${esc(categoryNames[v.category].toLowerCase())}. Capitalization and punctuation do not matter.</p><label for="imposter-guess">Your final guess</label><input id="imposter-guess" data-field="guess" maxlength="100" autocomplete="off"><div class="toolbar">${button(v, "Lock my final guess", "guess")}</div></section>` : `<div class="privacy-card"><h3>${esc(name(v, v.lastGuesser))} gets one final guess</h3><p>All imposters are out. Keep the secret to yourself until the last guess is locked.</p></div>`;
      else if (v.done) action = `<div class="deduction-reveal"><span class="eyebrow">THE SECRET WAS</span><h3>${esc(v.secret)}</h3>${v.finalGuess !== null ? `<p>Final guess: “${esc(v.finalGuess)}”</p>` : ""}</div>`;
      return `<div class="deduction-game imposter-game"><div class="stats">${stat("Round", `${v.round} / 3`)}${stat("Still in", v.alive.filter(Boolean).length)}${stat("Started with", `${v.imposterCount} imposter${v.imposterCount === 1 ? "" : "s"}`)}</div>${G.status(v.message, v.done)}${v.self >= 0 && !v.done ? card : ""}${roster(v)}${action}<section class="deduction-clues"><h3>The clue board</h3>${v.hints.length ? `<ol>${v.hints.map((hint) => `<li><span class="sub-label">${esc(name(v, hint.actor))} · round ${hint.round}</span><p>“${esc(hint.text)}”</p></li>`).join("")}</ol>` : '<p class="muted">The first hint will appear here.</p>'}</section>${history(v)}${imposterRules()}</div>`;
    },
  });
  function imposterRules() {
    return '<details class="deduction-rules"><summary>The house rules</summary><p>3–8 players. Recommended: 1 imposter for 3–5 people, 2 for 6–8. Every living player gives one hint in rotating order each round. Discuss, then everyone votes privately. A unique highest vote ejects that player and reveals their role; a tie or winning skip ejects nobody. You cannot vote for yourself.</p><p>The crew wins by ejecting every imposter. The final ejected imposter gets one exact secret guess to steal the win. Imposters win at equal numbers with the crew or if any remain after three rounds. All members of the winning team win, even if eliminated. The host leads discussion; if they are out, the first living player takes over.</p></details>';
  }

  function mafiaWinner(s) {
    const alive = living(s), mafia = alive.filter((i) => s.roles[i] === "mafia");
    if (!mafia.length) { finish(s, "village", "Every mafia member is out. The village wins!"); return true; }
    if (mafia.length >= alive.length - mafia.length) { finish(s, "mafia", "The mafia has reached equal numbers with the village. Mafia wins!"); return true; }
    return false;
  }
  function startNight(s) {
    s.phase = "night"; s.turn = -1; s.nightChoices = s.players.map(() => null); s.votes = s.players.map(() => null); s.messages = [];
  }
  function nightReady(s) {
    return living(s).every((i) => s.roles[i] === "villager" || s.nightChoices[i] !== null);
  }
  function resolveNight(s) {
    const mafia = living(s).filter((i) => s.roles[i] === "mafia"), counts = new Map();
    mafia.forEach((i) => counts.set(s.nightChoices[i], (counts.get(s.nightChoices[i]) || 0) + 1));
    const most = Math.max(...counts.values()), choices = [...counts].filter(([, count]) => count === most).map(([target]) => target);
    const victim = choices[random(choices.length)];
    const doctor = living(s).find((i) => s.roles[i] === "doctor"), detective = living(s).find((i) => s.roles[i] === "detective");
    const saved = doctor !== undefined && s.nightChoices[doctor] === victim;
    if (doctor !== undefined) s.lastProtection[doctor] = s.nightChoices[doctor];
    if (detective !== undefined) {
      const target = s.nightChoices[detective];
      s.investigations[detective].push({ round: s.round, target, mafia: s.roles[target] === "mafia" });
    }
    if (!saved) s.alive[victim] = false;
    record(s, saved ? `Dawn ${s.round}: everyone survived the night.` : `Dawn ${s.round}: ${name(s, victim)} was killed. Their role was ${labels[s.roles[victim]]}.`);
    if (!mafiaWinner(s)) { s.phase = "discussion"; s.turn = -1; }
  }
  function nightTargets(s, actor) {
    const role = s.roles[actor];
    return living(s).filter((i) => role === "mafia" ? s.roles[i] !== "mafia" : role === "doctor" ? i !== s.lastProtection[actor] : role === "detective" && i !== actor);
  }
  function mafiaNight(v) {
    const words = { mafia: ["Choose tonight’s target", "Each mafia member votes privately for a victim. A tied mafia vote is resolved randomly."], detective: ["Follow a lead", "Investigate one other living player. Your private result arrives at dawn."], doctor: ["Keep someone safe", "Protect one living player, including yourself. You cannot protect the same person on consecutive nights."], villager: ["Keep the lights low", "You have no night action. Wait for dawn, then help the village find the mafia."] };
    const [title, text] = words[v.ownRole] || ["The town is asleep", "Night actions stay private until dawn."];
    return `<section class="deduction-night"><span class="eyebrow">NIGHT ${v.round}</span><h3>${v.canAct ? title : "The town is asleep"}</h3><p>${v.canAct ? text : "You are eliminated. Follow the story without revealing private information."}</p>${v.canAct && v.ownRole !== "villager" ? v.nightChoice !== null ? `<div class="privacy-card"><h3>Your choice is locked</h3><p>${esc(name(v, v.nightChoice))} · Waiting for the other night actions.</p></div>` : `<div class="deduction-targets">${v.targets.map((target) => button(v, name(v, target), "night", `data-target="${target}"`)).join("")}</div>` : '<p class="muted">Dawn arrives automatically when all required choices are locked.</p>'}</section>`;
  }
  R.register("mafia", {
    title: "Mafia", min: 4, max: 8, concurrentActions: ["night", "vote", "message"],
    create(players) {
      const s = base(players, 4), count = players.length >= 6 ? 2 : 1;
      s.roles = shuffle([...Array(count).fill("mafia"), "detective", "doctor", ...Array(players.length - count - 2).fill("villager")]);
      s.mafiaCount = count; s.round = 1; s.investigations = players.map(() => []); s.lastProtection = players.map(() => null);
      startNight(s); s.message = "Night falls. Check your private role. Mafia, detective, and doctor make their choices in secret.";
      return s;
    },
    act(s, actor, a) {
      if (!valid(s, actor, a) || !s.alive[actor]) return false;
      if (a.type === "night" && s.phase === "night" && s.roles[actor] !== "villager" && s.nightChoices[actor] === null) {
        const target = integer(a.target, 0, s.players.length - 1);
        if (target === null || !nightTargets(s, actor).includes(target)) return false;
        s.nightChoices[actor] = target;
        if (nightReady(s)) resolveNight(s);
        return true;
      }
      if (a.type === "open_vote" && s.phase === "discussion" && actor === leader(s)) {
        s.phase = "vote"; s.turn = -1; s.message = "The town votes. Every living player must lock one private vote."; return true;
      }
      if (addMessage(s, actor, a)) return true;
      if (castVote(s, actor, a)) {
        if (living(s).every((i) => s.votes[i] !== null)) {
          const result = countVotes(s);
          if (result.target !== -1) {
            s.alive[result.target] = false;
            record(s, `${name(s, result.target)} was voted out. Their role was ${labels[s.roles[result.target]]}.`, result.tallies);
          } else record(s, result.tied ? "The town vote tied. Nobody was eliminated." : "The town skipped elimination. Nobody was eliminated.", result.tallies);
          if (!mafiaWinner(s)) { s.round++; startNight(s); s.message += " Night falls again."; }
        }
        return true;
      }
      return false;
    },
    view(s, viewer) {
      const v = publicBase(s, viewer), own = seat(s, viewer);
      return { ...v, mafiaCount: s.mafiaCount,
        allies: own && s.roles[viewer] === "mafia" ? roleSeats(s, "mafia").filter((i) => i !== viewer) : [],
        nightChoice: own && s.phase === "night" ? s.nightChoices[viewer] : null,
        targets: own && s.alive[viewer] && s.phase === "night" && s.nightChoices[viewer] === null ? nightTargets(s, viewer) : [],
        lastProtection: own && s.roles[viewer] === "doctor" ? s.lastProtection[viewer] : null,
        investigations: own && s.roles[viewer] === "detective" ? s.investigations[viewer].map((entry) => ({ round: entry.round, target: entry.target, mafia: entry.mafia })) : [],
      };
    },
    render(v) {
      const descriptions = { mafia: "Blend into the town by day. At night, choose a victim. Your team wins when mafia reach equal numbers with the other living players.", detective: "Each night, investigate another living player. Your private result says whether they are mafia. Help the village eliminate every mafia member.", doctor: "Each night, protect one living player from the mafia, including yourself. You cannot repeat the same target on consecutive nights. Win with the village.", villager: "You have no night power. Use discussion, evidence, and your day vote to find every mafia member. Win with the village." };
      const privateCard = v.self >= 0 && !v.done ? `<details class="deduction-secret"><summary>Your private role · tap to reveal</summary><div class="privacy-card"><span class="eyebrow">KEEP THIS CARD TO YOURSELF</span><h3>${esc(labels[v.ownRole])}</h3><p>${esc(descriptions[v.ownRole])}</p>${v.ownRole === "mafia" ? `<p>${v.allies.length ? `Your mafia ${v.allies.length === 1 ? "teammate is" : "teammates are"} <strong>${v.allies.map((i) => esc(name(v, i))).join(", ")}</strong>.` : "You are the only mafia member."}</p>` : ""}${v.ownRole === "doctor" && v.lastProtection !== null ? `<p>Last night you protected <strong>${esc(name(v, v.lastProtection))}</strong>.</p>` : ""}${v.investigations.length ? `<h4>Your investigation notebook</h4><ul class="investigation-notebook">${v.investigations.map((entry) => `<li>Night ${entry.round} · <strong>${esc(name(v, entry.target))}</strong>: ${entry.mafia ? "Mafia" : "Not mafia"}</li>`).join("")}</ul>` : ""}</div></details>` : "";
      const action = v.phase === "night" ? mafiaNight(v) : v.phase === "discussion" ? discussion(v) : v.phase === "vote" ? voteView(v) : `<div class="deduction-reveal"><h3>Every role revealed</h3><p>${v.winners.map((i) => esc(name(v, i))).join(", ")} ${v.winners.length === 1 ? "wins" : "win"} with the ${v.ownRole === "mafia" && v.winners.includes(v.self) || v.winners.some((i) => v.revealedRoles[i] === "mafia") ? "mafia" : "village"}.</p></div>`;
      return `<div class="deduction-game mafia-game"><div class="stats">${stat(v.phase === "night" ? "Night" : "Day", v.round)}${stat("Still alive", v.alive.filter(Boolean).length)}${stat("Started with", `${v.mafiaCount} mafia`)}</div>${G.status(v.message, v.done)}${privateCard}${roster(v)}${!v.alive[v.self] && !v.done ? '<p class="deduction-spectator">You are out. You can follow the game, but keep your clues and role information quiet.</p>' : ""}${action}${history(v)}<details class="deduction-rules"><summary>The house rules</summary><p>4–8 players. There is 1 mafia for 4–5 players, or 2 for 6–8, plus 1 detective, 1 doctor, and villagers. Mafia know their teammates. Every living mafia member votes for a night victim; most votes wins, with a random choice between tied targets. The doctor can save the target. The detective privately learns whether their target is mafia at dawn, even if the detective dies that night.</p><p>After dawn, discuss and vote. A unique top vote eliminates that player; a tie or winning skip eliminates nobody. Votes are final, and you cannot vote for yourself. Eliminated roles are public. The host opens voting after discussion; if they are eliminated, the first living player does. Every living player must vote before night can begin. The village wins when every mafia member is out. Mafia win at equal numbers. Eliminated teammates share their team’s win.</p></details></div>`;
    },
  });
})();
