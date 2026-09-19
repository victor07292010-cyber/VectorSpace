// Complete games through the production engine interface, including private
// per-seat views, malformed input, simultaneous-action scope, and scoring.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const base = path.resolve(__dirname, '../game-night');
let seed = 71437, checks = 0, matches = 0;
const math = Object.create(Math);
math.random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const engines = {};
const world = vm.createContext({ console, Math: math });
world.window = world;
world.RoomGames = { register: (id, engine) => { engines[id] = engine; } };
for (const file of ['shared.js', 'online-deduction.js', 'online-creative.js']) {
  vm.runInContext(fs.readFileSync(path.join(base, file), 'utf8'), world, { filename: file });
}
const plain = value => JSON.parse(JSON.stringify(value));
const players = n => Array.from({ length: n }, (_, i) => ({ id: `seat-${i}`, name: `Player ${i + 1}` }));
const ok = (value, message) => { checks++; assert.ok(value, message); };
const eq = (a, b, message) => { checks++; assert.deepEqual(plain(a), plain(b), message); };
const act = (engine, state, actor, action) => {
  const scoped = ['imposter', 'mafia'].includes(engine.id)
    ? { round: state.round, phase: state.phase, ...action }
    : engine.id === 'pictionary' ? { round: state.round, ...action } : action;
  ok(engine.act(state, actor, scoped), `${engine.id}: ${JSON.stringify(scoped)} by ${actor} is legal`);
};
const reject = (engine, state, actor, action) => {
  const before = JSON.stringify(state);
  eq(engine.act(state, actor, action), false, `${engine.id}: reject ${JSON.stringify(action)}`);
  eq(JSON.stringify(state), before, 'Rejected action must not mutate the game');
};
const alive = s => s.alive.flatMap((yes, i) => yes ? [i] : []);
const leader = s => s.alive[0] ? 0 : s.alive.indexOf(true);
for (const [id, engine] of Object.entries(engines)) engine.id = id;

function socialPrivacy(engine, s) {
  for (let viewer = 0; viewer < s.players.length; viewer++) {
    const v = engine.view(s, viewer);
    eq(v.ownRole, s.roles[viewer]);
    ok(!('roles' in v) && !('votes' in v) && !('nightChoices' in v), 'Private arrays are absent');
    eq(v.revealedRoles, s.roles.map((role, i) => s.done || !s.alive[i] ? role : null));
    if (engine.id === 'imposter') eq(v.secret, s.done || s.roles[viewer] === 'crew' ? s.secret : null);
    else {
      eq(v.allies, s.roles[viewer] === 'mafia' ? s.roles.flatMap((role, i) => role === 'mafia' && i !== viewer ? [i] : []) : []);
      if (s.roles[viewer] !== 'detective') eq(v.investigations, []);
      ok(!('nightReady' in v), 'Night progress must not disclose which seats have powers');
    }
    const old = JSON.stringify(s);
    v.players[0].name = 'changed';
    v.revealedRoles[0] = 'changed';
    v.alive[0] = !v.alive[0];
    eq(JSON.stringify(s), old, 'Views do not alias private state');
    ok(engine.render(engine.view(s, viewer)).length > 100);
  }
}

function finishHints(engine, s) {
  while (s.phase === 'hint') act(engine, s, s.turn, { type: 'hint', hint: `Subtle hint ${s.turn + 1}` });
  eq(s.phase, 'discussion');
}
function ballot(engine, s, target) {
  act(engine, s, leader(s), { type: 'open_vote' });
  const round = s.round;
  for (const actor of alive(s)) act(engine, s, actor, { type: 'vote', target: actor === target ? -1 : target });
  if (!s.done && s.round !== round) reject(engine, s, alive(s)[0], { type: 'vote', target: -1, round, phase: 'vote' });
}

const imp = engines.imposter;
for (let n = 3; n <= 8; n++) {
  for (const category of ['words', 'phrases', 'numbers']) {
    for (const outcome of ['crew', 'steal', 'survive']) {
      const s = imp.create(players(n));
      reject(imp, s, 1, { type: 'deal', category, count: 'auto', round: 0, phase: 'setup' });
      reject(imp, s, 0, { type: 'deal', category, count: 'auto' });
      act(imp, s, 0, { type: 'deal', category, count: 'auto' });
      socialPrivacy(imp, s);
      reject(imp, s, (s.turn + 1) % n, { type: 'hint', hint: 'wrong turn', round: s.round, phase: s.phase });
      let rounds = 0;
      while (!s.done && s.phase !== 'last_guess') {
        ok(++rounds <= 3, 'Imposter ends within three rounds');
        finishHints(imp, s);
        act(imp, s, leader(s), { type: 'message', message: 'A suspicious clue.' });
        reject(imp, s, leader(s), { type: 'message', message: 'old phase', round: s.round, phase: 'hint' });
        const target = outcome === 'survive' ? -1 : alive(s).find(i => s.roles[i] === 'imposter');
        ballot(imp, s, target);
      }
      if (s.phase === 'last_guess') {
        eq(imp.view(s, s.lastGuesser).secret, null, 'Ejected imposter does not learn secret before final guess');
        act(imp, s, s.lastGuesser, { type: 'guess', guess: outcome === 'steal' ? ` ${s.secret.toUpperCase()}! ` : 'definitely incorrect secret' });
      }
      eq(s.done, true);
      eq(s.winners, s.roles.flatMap((role, i) => role === (outcome === 'crew' ? 'crew' : 'imposter') ? [i] : []));
      socialPrivacy(imp, s);
      reject(imp, s, 0, { type: 'deal', round: s.round, phase: s.phase });
      matches++;
    }
  }
}
// A wrong crew ejection reaches parity immediately in a three-player game.
{
  const s = imp.create(players(3)); act(imp, s, 0, { type: 'deal' }); finishHints(imp, s);
  ballot(imp, s, s.roles.indexOf('crew')); eq(s.done, true); eq(s.winners.length, 1); matches++;
}

const mafia = engines.mafia;
// An evenly split vote ejects nobody, and yesterday's protection is unavailable.
{
  const s = mafia.create(players(4));
  const doctor = s.roles.indexOf('doctor'), mob = s.roles.indexOf('mafia'), detective = s.roles.indexOf('detective');
  act(mafia, s, mob, { type: 'night', target: doctor });
  reject(mafia, s, mob, { type: 'night', target: doctor, round: s.round, phase: s.phase });
  act(mafia, s, doctor, { type: 'night', target: doctor });
  act(mafia, s, detective, { type: 'night', target: mob });
  act(mafia, s, leader(s), { type: 'open_vote' });
  for (let actor = 0; actor < 4; actor++) act(mafia, s, actor, { type: 'vote', target: (actor + 1) % 4 });
  eq(s.phase, 'night'); eq(s.round, 2); eq(s.alive, [true, true, true, true]);
  ok(!mafia.view(s, doctor).targets.includes(doctor));
  reject(mafia, s, doctor, { type: 'night', target: doctor, round: s.round, phase: s.phase });
}
for (let n = 4; n <= 8; n++) {
  for (let repeat = 0; repeat < 12; repeat++) {
    for (const outcome of ['village', 'mafia']) {
      const s = mafia.create(players(n));
      socialPrivacy(mafia, s);
      let nights = 0;
      while (!s.done) {
        ok(++nights <= 10, 'Mafia simulation terminates');
        eq(s.phase, 'night');
        const seats = alive(s), doctor = seats.find(i => s.roles[i] === 'doctor'), detective = seats.find(i => s.roles[i] === 'detective');
        const mob = seats.filter(i => s.roles[i] === 'mafia');
        const victim = seats.find(i => s.roles[i] !== 'mafia' && (outcome !== 'village' || i !== s.lastProtection[doctor]));
        reject(mafia, s, mob[0], { type: 'night', target: mob[0], round: s.round, phase: s.phase });
        for (const actor of mob) act(mafia, s, actor, { type: 'night', target: victim });
        if (doctor !== undefined) {
          const target = outcome === 'village' ? victim : mafia.view(s, doctor).targets.find(i => i !== victim);
          act(mafia, s, doctor, { type: 'night', target });
        }
        if (detective !== undefined) act(mafia, s, detective, { type: 'night', target: mob[0] });
        if (outcome === 'village') ok(s.alive[victim], 'Doctor saves the chosen victim');
        if (detective !== undefined) {
          const entries = mafia.view(s, detective).investigations;
          eq(entries.at(-1).mafia, true); eq(entries.at(-1).target, mob[0]);
        }
        socialPrivacy(mafia, s);
        if (!s.done) {
          eq(s.phase, 'discussion');
          const dead = s.alive.indexOf(false);
          if (dead >= 0) reject(mafia, s, dead, { type: 'message', message: 'Boo!', round: s.round, phase: s.phase });
          ballot(mafia, s, outcome === 'village' ? mob[0] : -1);
        }
      }
      eq(s.winners, s.roles.flatMap((role, i) => (outcome === 'mafia' ? role === 'mafia' : role !== 'mafia') ? [i] : []));
      socialPrivacy(mafia, s); matches++;
    }
  }
}

const sketch = engines.pictionary;
for (let n = 2; n <= 8; n++) {
  const s = sketch.create(players(n));
  while (!s.done) {
    eq(s.phase, 'choose');
    const drawer = s.turn, viewer = (drawer + 1) % n;
    eq(sketch.view(s, viewer).choices, []); eq(sketch.view(s, viewer).word, null);
    ok(!('wordDeck' in sketch.view(s, drawer)));
    reject(sketch, s, viewer, { type: 'choose', word: 0, round: s.round });
    act(sketch, s, drawer, { type: 'choose', word: 0 });
    eq(sketch.view(s, viewer).word, null);
    for (const points of [[[NaN, 0]], [[2, 0]], [[0, -1]], [[0]], Array(65).fill([0, 0])]) reject(sketch, s, drawer, { type: 'stroke', points, color: '#26334a', width: 5, round: s.round });
    reject(sketch, s, viewer, { type: 'stroke', points: [[0, 0]], color: '#26334a', width: 5, round: s.round });
    act(sketch, s, drawer, { type: 'stroke', points: [[0.1, 0.2], [0.4, 0.5]], color: '#26334a', width: 5 });
    const v = sketch.view(s, viewer); eq(v.strokes.length, 1); v.strokes[0].points[0][0] = 0.8; eq(s.strokes[0].points[0][0], 0.1);
    act(sketch, s, drawer, { type: 'clear' }); eq(s.strokes.length, 0);
    for (let actor = 0; actor < n; actor++) if (actor !== drawer) {
      act(sketch, s, actor, { type: 'guess', guess: 'not the right answer' });
      act(sketch, s, actor, { type: 'guess', guess: ` ${s.word.toUpperCase()}! ` });
      eq(s.guesses.at(-1).text, null, 'Correct guess is hidden from remaining guessers');
      reject(sketch, s, actor, { type: 'guess', guess: s.word, round: s.round });
    }
    eq(s.phase, 'reveal');
    for (let viewer = 0; viewer < n; viewer++) { eq(sketch.view(s, viewer).word, s.word); ok(sketch.render(sketch.view(s, viewer)).length > 100); }
    if (!s.done) { const oldRound = s.round; act(sketch, s, drawer, { type: 'next' }); reject(sketch, s, s.turn, { type: 'choose', word: 0, round: oldRound }); }
  }
  eq(s.scores, Array(n).fill(150 * (n - 1))); eq(s.winners, Array.from({ length: n }, (_, i) => i)); matches++;
}
{
  const s = sketch.create(players(2)); act(sketch, s, 0, { type: 'choose', word: 0 });
  for (let n = 0; n < 40; n++) act(sketch, s, 1, { type: 'guess', guess: `wrong ${n}` });
  eq(sketch.view(s, 1).canGuess, false); reject(sketch, s, 1, { type: 'guess', guess: s.word, round: s.round });
  act(sketch, s, 0, { type: 'finish' }); act(sketch, s, 0, { type: 'next' }); act(sketch, s, 1, { type: 'choose', word: 0 }); act(sketch, s, 1, { type: 'finish' }); eq(s.done, true); matches++;
}
{
  const s = sketch.create(players(2)); act(sketch, s, 0, { type: 'choose', word: 0 });
  for (let count = 0; count < 1000; count++) act(sketch, s, 0, { type: 'stroke', points: [[0.2, 0.3]], color: '#ffffff', width: 1 });
  eq(sketch.view(s, 0).canDraw, false);
  reject(sketch, s, 0, { type: 'stroke', points: [[0.2, 0.3]], color: '#ffffff', width: 1, round: s.round });
  act(sketch, s, 0, { type: 'clear' });
  eq(sketch.view(s, 0).canDraw, false, 'Clearing does not bypass the total round stroke budget');
  act(sketch, s, 0, { type: 'finish' }); eq(s.phase, 'reveal');
}

const faces = engines['guess-who'];
for (let secret = 0; secret < 24; secret++) {
  const s = faces.create(players(2));
  act(faces, s, 0, { type: 'lock', character: 23 - secret });
  eq(faces.view(s, 1).ownCharacter, null); eq(faces.view(s, 1).opponentCharacter, null);
  act(faces, s, 1, { type: 'lock', character: secret });
  eq(faces.view(s, 0).opponentCharacter, null); ok(!('secrets' in faces.view(s, 0)));
  reject(faces, s, 1, { type: 'ask', attribute: 'hat' });
  const questions = faces.view(s, 0).questions;
  for (const question of questions) {
    for (const actor of [0, 1]) {
      act(faces, s, actor, { type: 'ask', attribute: question.id, character: '' });
      const v = faces.view(s, actor);
      ok(!v.eliminated.includes(s.secrets[1 - actor]), 'Truthful answer never eliminates actual secret');
      eq(faces.view(s, 1 - actor).history.length, actor === 0 ? v.history.length - 1 : v.history.length, 'Answers stay on each player’s own board');
    }
  }
  eq(faces.view(s, 0).eliminated.length, 23, 'All traits uniquely identify each character');
  reject(faces, s, 0, { type: 'ask', attribute: questions[0].id });
  act(faces, s, 0, { type: 'guess', character: secret, attribute: '' }); eq(s.winners, [0]); eq(faces.view(s, 0).opponentCharacter, secret); ok(faces.render(faces.view(s, 0)).length > 100); matches++;
}
{
  const s = faces.create(players(2)); act(faces, s, 0, { type: 'lock', character: 1 }); act(faces, s, 1, { type: 'lock', character: 2 }); act(faces, s, 0, { type: 'guess', character: 3 }); eq(s.winners, [1]); matches++;
}

for (const engine of Object.values(engines)) {
  const s = engine.create(players(engine.min));
  const bad = '<img src=x onerror=evil()>';
  s.players[0].name = bad;
  const html = engine.render(engine.view(s, 0));
  ok(!html.includes(bad), `${engine.id} escapes player names`);
  reject(engine, s, -1, { type: 'guess', round: s.round, phase: s.phase });
  reject(engine, s, 0, null);
}
console.log(`PASS ${matches} complete social/creative games and ${checks} assertions: roles, secrets, votes, doctor saves, detective results, drawing scores, candidate elimination, replay scope, invalid inputs, and escaping.`);
