# Game Night

Twelve free browser games in one small, portable folder. No sign-in, ads, runtime dependencies, remote fonts, or build step.

## Play locally

Open **game-night/index.html** in a modern browser. Keep the other files in the same folder. Everything works offline, including computer opponents.

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

Each game includes its rules and any house variants. These are independent implementations with original presentation, not official versions or affiliations. Computer opponents and same-device play are supported; remote multiplayer rooms are not included. Games reset on reload or when you leave a game.

## Publish free on GitHub Pages

1. Upload this repository to a public GitHub repository with a `main` branch.
2. Open **Settings → Pages → Build and deployment → Source**, then select **GitHub Actions**.
3. Run **Actions → Publish Game Night → Run workflow**, or push a new commit to `main`.
4. After the workflow completes, Pages shows the public link. Only the `game-night` folder is deployed.

The included workflow handles publishing. No paid server or API key is needed. GitHub Pages is available for public repositories on GitHub Free: https://docs.github.com/en/pages/quickstart.

## Verify the games

Install `jsdom` as a development tool, then run `node tools/check-games.cjs`. You can also pass an absolute path to an existing jsdom package as its argument. It checks every game’s start screen, complete computer games, fleet placement, legal dice combinations, local memory play, private party-game state, and timer cancellation when restarting or switching games. The published games need no packages.

## Files

`game-night/index.html` is the entry point; `styles.css` contains responsive styles; `shared.js` supplies card and UI helpers; `card-games.js`, `board-games.js`, and `party-games.js` contain the games; `app.js` supplies navigation. All scripts are ordinary browser scripts so direct file opening works.
