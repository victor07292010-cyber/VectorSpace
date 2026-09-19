# Game Night

Twenty browser games in one portable folder, with online rooms for up to eight friends. No sign-in, ads, remote fonts, or build step. The bundled PeerJS library connects players directly.

## Play locally

Open **game-night/index.html** in a modern browser. Keep the other files in the same folder. The original twelve games work offline, including computer opponents. Use the published HTTPS site for online rooms.

## Play with friends

Choose **Create a room**, enter your name, and send the six-character code to friends. They open the same site, choose **Join a room**, and enter the code. The host selects a game; guests press **Ready**, then the host starts. Every game has an online mode, including cooperative Team Solitaire. Player limits are shown on each game.

The host's tab runs the room and must stay open. Private hands, words, identities, and roles are sent only to the corresponding player, although the host's browser necessarily holds the complete state. This is designed for trusted friends. Refreshing or closing the host ends the room; brief guest disconnections can rejoin the same seat. There is no permanent account or match history.

Online play uses PeerJS's free public signaling service and WebRTC. Some school, work, mobile, and restrictive router networks block signaling or direct connections. A website's content or metadata cannot guarantee a web-filter category or access through a school's policy.

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
- Face Finder — Guess Who-style deduction with 24 original illustrated characters, attribute questions and a final identity guess.
- Mafia — 4–8 players, private roles, night actions, investigation, protection, discussion and voting.
- Liar's Dice — hidden dice, escalating bids, challenges and elimination.
- Dots & Boxes — 2–4 players competing to close boxes and earn extra turns.
- Reversi — two-player strategy with legal move hints and automatic passes.
- Rock Paper Scissors — simultaneous hidden choices across five rounds.

Each game includes its rules and any house variants. These are independent implementations with original presentation, not official versions or affiliations. The eight newest games require online friends. Solo games reset when leaving; online rooms stay connected while browsing the library. Motion respects reduced-motion preferences, and optional sound is off by default.

## Publish free on GitHub Pages

1. Upload this repository to a public GitHub repository with a `main` branch.
2. Open **Settings → Pages → Build and deployment → Source**, then select **GitHub Actions**.
3. Run **Actions → Publish Game Night → Run workflow** after enabling Pages, and again whenever you want to publish an update.
4. After the workflow completes, Pages shows the public link. Only the `game-night` folder is deployed.

The included manual workflow handles publishing after Pages is enabled. No paid server or API key is needed. GitHub Pages is available for public repositories on GitHub Free: https://docs.github.com/en/pages/quickstart.

## Verify the games

Install `jsdom` as a development tool, then run `node tools/check-games.cjs`. You can also pass an absolute path to an existing jsdom package as its argument. It checks the original games' start screens, complete computer games, fleet placement, legal dice combinations, local memory play, private party-game state, and timer cancellation. Run `node tools/check-rooms.cjs`, `node tools/check-social.cjs`, and `node tools/check-competitive.cjs` for transport and online engine checks. The published games need no package installation.

## Files

`game-night/index.html` is the entry point; `styles.css` contains responsive styles; `shared.js` supplies card and UI helpers; `card-games.js`, `board-games.js`, and `party-games.js` contain offline games; `online-*.js` contain the room protocol, interface, and multiplayer engines; `polish.js` adds optional sounds and visual details; `app.js` supplies navigation. All scripts are ordinary browser scripts. PeerJS is vendored under its MIT license in `game-night/vendor/`.
