# VectorSpace

[Play the published collection](https://victor07292010-cyber.github.io/VectorSpace/)

Twenty browser games in one portable folder, with online rooms for up to eight friends. No sign-in, ads, remote fonts, or build step. The bundled PeerJS library connects players directly.

## Play locally

Use **Download for offline play** on the site, extract the entire ZIP, and open **VectorSpace/index.html**. It includes 17 games for solo or same-device play, including 12 games with computer opponents. No installation, API keys, or internet connection is needed for those modes. Imposter, Mafia, and Sketch Party require online friends. Spectrum can be played locally by passing the device. The **Vs computer** and **Offline & local** filters make each mode easy to find.

For development, open **game-night/index.html**. Run `node tools/build-offline.cjs` to rebuild the downloadable ZIP after editing browser assets. The Pages workflow rebuilds it before every deployment.

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
- Face Finder — Guess Who-style deduction with 24 original illustrated characters, against the computer offline or a friend online.
- Mafia — 4–8 players, private roles, night actions, investigation, protection, discussion and voting.
- Liar's Dice — hidden dice, escalating bids, challenges and elimination; offline CPU or online friends.
- Dots & Boxes — compete against the CPU offline, or 2–4 friends online, to close boxes and earn extra turns.
- Reversi — CPU or online two-player strategy with legal move hints and automatic passes.
- Rock Paper Scissors — CPU or online friends, with simultaneous hidden choices across five rounds.

Each game includes its rules and any house variants. These are independent implementations with original presentation, not official versions or affiliations. Imposter, Mafia, and Sketch Party require online friends. CPU strategies use only their own player views; they cannot read your hidden identity, dice, or next choice. Solo games reset when leaving; online rooms stay connected while browsing the library. Motion respects reduced-motion preferences, and optional sound is off by default.

## Publish free on GitHub Pages

1. Upload this repository to a public GitHub repository with a `main` branch.
2. Open **Settings → Pages → Build and deployment → Source**, then select **GitHub Actions**.
3. Push updates to `main`, or run **Actions → Publish VectorSpace → Run workflow**.
4. After the workflow completes, Pages shows the public link. Only the `game-night` folder is deployed.

The included workflow rebuilds the offline ZIP and publishes after every push to `main`. No paid server or API key is needed. GitHub Pages is available for public repositories on GitHub Free: https://docs.github.com/en/pages/quickstart.

## Verify the games

Install `jsdom@30.1.0` as a development tool, then run `node tools/check-games.cjs`. You can also pass an absolute path to an existing jsdom package as its argument. It checks the original games' start screens, complete computer games, fleet placement, legal dice combinations, local memory play, private party-game state, and timer cancellation. Run `node tools/check-rooms.cjs`, `node tools/check-social.cjs`, and `node tools/check-competitive.cjs` for transport and online engine checks. Run `node tools/check-cpu.cjs` (with the same optional jsdom path) to verify CPU strategies, complete matches, offline controls, and timer cleanup. Run `node tools/check-download.cjs` with the optional jsdom path to extract and test the actual ZIP with all external network access blocked. The published games need no package installation.

## Files

`game-night/index.html` is the entry point; `styles.css` contains responsive styles; `shared.js` supplies card and UI helpers; `card-games.js`, `board-games.js`, and `party-games.js` contain offline games; `online-*.js` contain the room protocol, interface, and multiplayer engines; `cpu-games.js` supplies offline computer opponents for five additional games; `polish.js` adds optional sounds and visual details; `app.js` supplies navigation. All scripts are ordinary browser scripts. PeerJS is vendored under its MIT license in `game-night/vendor/`.
