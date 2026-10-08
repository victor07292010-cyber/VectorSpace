# VectorSpace

[Play the published collection](https://victor07292010-cyber.github.io/VectorSpace/)

Sixty browser games in one portable folder, with online rooms for up to eight friends. No sign-in, ads, or build step. The playful "Toybox" look uses the Fredoka and Nunito fonts from Google Fonts when online and rounded system fonts offline. Online parties connect through a Cloudflare WebSocket server.

## Play locally

Use **Download for offline play** on the site, extract the entire ZIP, and open **VectorSpace/index.html**. It includes 17 games for solo or same-device play, including 12 games with computer opponents. No installation, API keys, or internet connection is needed for those modes. Imposter, Mafia, and Sketch Party require online friends. Spectrum can be played locally by passing the device. The **Vs computer** and **Offline & local** filters make each mode easy to find.

For development, open **game-night/index.html**. Run `node tools/build-offline.cjs` to rebuild the downloadable ZIP after editing browser assets. The Pages workflow rebuilds it before every deployment.

## Play with friends

Choose **Create a room**, enter your name, and send the six-character code to friends. They open the same site, choose **Join a room**, and enter the code. The host selects a game; guests press **Ready**, then the host starts. Every game has an online mode, including cooperative Team Solitaire. Player limits are shown on each game.

The host's tab runs the room and must stay open. Private hands, words, identities, and roles are sent only to the corresponding player, although the host's browser necessarily holds the complete state. This is designed for trusted friends. Refreshing or closing the host ends the room; brief guest disconnections can rejoin the same seat. There is no permanent account or match history.

Online play uses the deployed Cloudflare party server on the Workers Free plan. Players need an internet connection to that service. A website's content or metadata cannot guarantee a web-filter category or access through a school's policy.

For local development, run `node tools/serve.cjs` and visit http://127.0.0.1:4173/.

## The collection

- Shut the Box — solo, 1–9 tiles, one- or two-die option.
- Solitaire — draw-one Klondike, undo, hints, unlimited stock recycling.
- Color Clash — original two-player UNO-style game against the computer.
- Crazy Eights — five-card deal, wild eights, draw-until-playable rules.
- Go Fish — two-player books-of-four game against the computer.
- Sea Battle — five ships, manual or random placement, computer opponent.
- Spectrum — original cooperative Wavelength-style party game, five rounds.
- Connect Four — computer opponent or two people sharing one device.
- Memory Match — solo or two people sharing one device.
- Pig Dice — race to bank 100 points against the computer or a friend.
- Tic-Tac-Toe — perfect computer opponent or local two-player mode.
- Higher or Lower — a 52-card prediction challenge.
- Imposter — 3–8 players, secret words, phrases or numbers, one or two imposters, clues, discussion, votes and a final secret guess.
- Sketch Party — Pictionary-style shared drawing, secret prompts, guesses and points; everyone draws once.
- Face Finder — Guess Who-style deduction with 24 original illustrated characters, against the computer offline or a friend online.
- Mafia — 4–8 players, private roles, night actions, investigation, protection, discussion and voting.
- Liar's Dice — hidden dice, escalating bids, challenges and elimination; offline CPU or online friends.
- Dots & Boxes — compete against the CPU offline, or 2–4 friends online, to close boxes and earn extra turns.
- Reversi — CPU or online two-player strategy with legal move hints and automatic passes.
- Rock Paper Scissors — CPU or online friends, with simultaneous hidden choices across five rounds.

### Arcade Night (online, 2–8 friends) — newest

Ten real-time and table games for online rooms:

- **Quick Draw** — wait for green, tap first. Reaction time is measured on each player's own screen, so lag doesn't count.
- **Color Rush** — tap the ink colour, not the word.
- **Hot Potato** — solve the tap to grab the bomb, throw it on, don't be holding it when the secret fuse pops.
- **Telephone Doodle** — write, draw, guess, draw… then flip through every book and hand out hearts.
- **Masterpiece Mayhem** — everyone draws the same prompt; the anonymous gallery votes.
- **Wolf Pack** — one-night werewolf: Werewolves, Seer, Robber, Troublemaker, Insomniac, Villagers, then one vote.
- **Bluff Court** — claim any role, challenge any claim, block and counter-challenge; last courtier standing wins.
- **Chip Showdown** — Texas hold'em with rising blinds, side pots and a host cash-out.
- **Race Home** — four tokens, sixes to leave base, captures and safe stars.
- **Slides & Ladders** — with one reroll card per player and an exact-100 bounce.

### Party Night (online, 2–8 friends)

Twenty party games for online rooms: Punchline, Acro Night, Dictionary Bluff, Truth or Tall Tale (write & vote); Mind Meld, This or That, Who's Most Likely, Rank 'Em (read the room); Ballpark, Buzz Off, Mental Math Dash, Emoji Decoder (quick trivia & reflex); No-Say Clues, Letter Ladder, Alphabet Sprint, Folded Story, Doodle Decoy (words & drawing); Heist Crew, Fib Pile, Off the Map (bluffing & hidden roles). Secrets — answer keys, the real definition, the Decoy's missing word, the Spy's location, the moles, every hand of cards — stay on the host until the reveal.

### Remastered tables

Every solo and vs-computer game has a computer difficulty dial (Easy / Normal / Hard — Normal is the original computer; Hard takes immediate wins, blocks your immediate wins and searches deeper in Checkers and Mancala), a score pad that remembers wins, losses and streaks on this device, and the **N** key for a new game.

Each game includes its rules and any house variants. These are independent implementations with original presentation, not official versions or affiliations. Imposter, Mafia, and Sketch Party require online friends. CPU strategies use only their own player views; they cannot read your hidden identity, dice, or next choice. Solo games reset when leaving; online rooms stay connected while browsing the library. Motion respects reduced-motion preferences, and optional sound is off by default.

## Publish free on GitHub Pages

1. Upload this repository to a public GitHub repository with a `main` branch.
2. Open **Settings → Pages → Build and deployment → Source**, then select **GitHub Actions**.
3. Push updates to `main`, or run **Actions → Publish VectorSpace → Run workflow**.
4. After the workflow completes, Pages shows the public link. Only the `game-night` folder is deployed.

The included workflow rebuilds the offline ZIP and publishes after every push to `main`. No paid server or API key is needed. GitHub Pages is available for public repositories on GitHub Free: https://docs.github.com/en/pages/quickstart.

## Verify the games

Install `jsdom@30.1.0` as a development tool, then run `node tools/check-games.cjs`. You can also pass an absolute path to an existing jsdom package as its argument. It checks the original games' start screens, complete computer games, fleet placement, legal dice combinations, local memory play, private party-game state, and timer cancellation. Run `node tools/check-all-rooms.cjs` to fuzz every online room game (timed games run on a simulated clock), and `node tools/check-net-games.cjs [ids] [players]` to play real networked matches through the actual party server running in memory (`SPEED=20` speeds up game clocks). Run `node tools/check-party-server.cjs mock` to test the party server without a network. Run `node tools/check-party-night.cjs` to fuzz all twenty Party Night games through their own on-screen buttons (full games, rejected junk moves, private views). Run `node tools/check-rooms.cjs`, `node tools/check-social.cjs`, and `node tools/check-competitive.cjs` for transport and online engine checks. Run `node tools/check-cpu.cjs` (with the same optional jsdom path) to verify CPU strategies, complete matches, offline controls, and timer cleanup. Run `node tools/check-download.cjs` with the optional jsdom path to extract and test the actual ZIP with all external network access blocked. The published games need no package installation.

## Files

`game-night/index.html` is the entry point; `styles.css` contains responsive styles; `shared.js` supplies card and UI helpers; `card-games.js`, `board-games.js`, and `party-games.js` contain offline games; `online-*.js` contain the room protocol, interface, and multiplayer engines; `cpu-games.js` supplies offline computer opponents for five additional games; `party-night.js`, `party-night-data.js` and `party-night.css` hold the twenty Party Night room games; `remaster.js` adds the difficulty dial, score pad and keyboard shortcut; `polish.js` adds optional sounds and visual details; `app.js` supplies navigation, the game shelf and the spinner; `closet.css` holds the page layout; `cartoon.css` is the playful "Toybox" theme on top of it (chunky outlines, pastel colours, bouncy motion); `room-arcade*.js` and `arcade.css` hold the ten Arcade Night games. The bundled display and label fonts in `game-night/fonts/` are TeX Gyre Adventor and TeX Gyre Heros Condensed under the GUST Font License. Box-lid artwork for all 60 games is generated by `node tools/build-cover-art.cjs`. All scripts are ordinary browser scripts. The retired PeerJS bundle remains under its MIT license in `game-night/vendor/`, but is no longer loaded.

## Party server

Online rooms now use the Cloudflare Worker in `server/party-worker.mjs`, with one SQLite Durable Object per party and hibernating WebSockets. There is no PeerJS signaling or TURN dependency. Creating a party opens `#party/CODE`; old `#join/CODE` links still work. Anyone with the link may join without an account. Up to eight players fit in a lobby; individual games retain their player limits. The host tab keeps the game state and must stay open. Host disconnection closes the party; guests can reconnect to their seat while the host stays online.

The deployed Worker uses the **Workers Free** plan, not a trial or paid plan. Free quotas apply: excess operations fail instead of billing overages. Do not upgrade to Workers Paid for this project. Provider terms can change; perpetual unlimited hosting is not guaranteed. No external AI API or paid relay is used.

Deploy using Wrangler 4.59.2: `wrangler deploy --config server/wrangler.jsonc`. Set `game-night/party-config.js` to the returned `wss://` address, then publish Pages. The Worker checks browser origins; add a new legitimate site origin when moving domains. For local testing use `wrangler dev --config server/wrangler.jsonc --port 8787 --var ALLOW_LOCALHOST:true` and a local-only party config. Never publish the localhost configuration.

Run `node tools/check-party-server.cjs wss://vectorspace-parties.victor-07292010.workers.dev` to exercise actual server connections, a full game, hidden cards, reconnect, eight seats, capacity refusal, and closed rooms. It creates and closes temporary parties. `node tools/check-rooms.cjs` remains the deterministic protocol regression suite.
