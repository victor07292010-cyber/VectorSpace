"use strict";
(() => {
  const G = GameNight,
    { btn, stat, status, esc, bind, rand } = G;
  G.register("spectrum", {
    rules:
      "<ol><li>Gather two or more people. Work together over five rounds. Choose a different clue-giver each round.</li><li>Everyone else looks away. The clue-giver reveals a secret target between two opposites, then writes a clue that fits that position.</li><li>Hide the target and pass the device. Discuss the clue and place your guess on the scale.</li><li>Lock your guess to reveal the target. Within 3 = 4 points; within 6 = 3; within 12 = 2; otherwise 0.</li><li>Take turns giving clues. Try for a perfect 20!</li></ol>",
    note: "An original cooperative Wavelength-style party game. Play together in the same room; keep the secret screen to the clue-giver.",
    mount(root) {
      const prompts = [
        ["Cold", "Hot"],
        ["Forgettable", "Unforgettable"],
        ["Tiny inconvenience", "Total disaster"],
        ["Everyday thing", "Luxury"],
        ["Quiet", "Loud"],
        ["Easy to learn", "Hard to learn"],
        ["Villain", "Hero"],
        ["Underrated", "Overrated"],
        ["Bad gift", "Great gift"],
        ["Boring", "Thrilling"],
        ["Unlucky", "Lucky"],
        ["Mild", "Spicy"],
        ["Old-fashioned", "Futuristic"],
        ["Messy", "Neat"],
        ["Cheap", "Expensive"],
        ["Serious", "Silly"],
        ["Slow", "Fast"],
        ["Fragile", "Indestructible"],
        ["Scary", "Comforting"],
        ["Needs no skill", "Takes great skill"],
        ["Terrible superpower", "Amazing superpower"],
        ["Uncomfortable", "Cozy"],
        ["Short wait", "Long wait"],
        ["Unpopular opinion", "Everyone agrees"],
        ["A snack", "A feast"],
        ["Easy to carry", "Impossible to carry"],
        ["Terrible first date", "Perfect first date"],
        ["Small talk", "Deep conversation"],
        ["Tame", "Wild"],
        ["Terrible smell", "Wonderful smell"],
      ];
      let pairs = G.shuffle([...prompts]),
        round = 1,
        total = 0,
        target = rand(101),
        guess = 50,
        clue = "",
        phase = "privacy",
        score = 0;
      const pair = () => pairs[round - 1];
      function track(showTarget, showGuess) {
        return `<div class="spectrum-track">${showTarget ? `<span class="target-zone" style="left:${target}%;width:24%"><span class="target-middle"></span><span class="target-core"></span><span class="target-line"></span></span>` : ""}${showGuess ? `<span class="guess-marker" style="left:${guess}%"></span>` : ""}</div><div class="spectrum-ends"><span>${pair()[0]}</span><span>${pair()[1]}</span></div>`;
      }
      function render() {
        root.innerHTML = `<div class="stats">${stat("Round", round + "/5")}${stat("Team score", total + "/20")}</div><div class="spectrum-area">${phase === "privacy" ? `<div class="privacy-card"><h3>Clue-giver, take the screen.</h3><p>Everyone else, look away.<br>The next screen reveals your secret target.</p>${btn("Only I’m looking · reveal target", "peek")}</div>` : phase === "clue" ? `<p class="eyebrow" style="color:#c2d0b9">FOR THE CLUE-GIVER ONLY</p>${track(true, false)}<p class="muted">Your secret target is <strong>${target} / 100</strong>.<br>Give a clue that belongs here. Avoid numbers and either word on the scale.</p><form id="clue-form"><label class="input-label" for="clue">Your clue</label><input id="clue" type="text" maxlength="100" placeholder="Something your group will understand…" required autocomplete="off" value="${esc(clue)}"><div class="toolbar"><button class="button" type="submit">Hide target & pass device</button></div></form>` : phase === "handoff" ? `<div class="privacy-card"><h3>The secret is hidden.</h3><p>Pass the device to the guessers.<br>Clue-giver: poker face from here on.</p>${btn("We’re ready to guess", "guess")}</div>` : phase === "guess" ? `<p class="sub-label">THE CLUE</p><p class="clue">“${esc(clue)}”</p>${track(false, true)}<label for="guess-slider">Your guess: <strong id="guess-number">${guess}</strong> / 100</label><input type="range" id="guess-slider" min="0" max="100" value="${guess}" aria-label="Position between ${pair()[0]} and ${pair()[1]}"><p class="muted">Talk it over. Move the slider. Trust your team.</p><div class="toolbar">${btn("Lock guess & reveal", "reveal")}</div>` : `${track(true, true)}<p class="clue">“${esc(clue)}”</p>${status(`Target ${target} · Guess ${guess} · ${Math.abs(target - guess)} away`, true)}<div class="big-score">+${score}</div><p>${score === 4 ? "Right on the same wavelength!" : score ? "Close! Your team earns points." : "A little crossed signal. No points this round."}</p>${round === 5 ? `<h3>Final score: ${total} / 20</h3><p>${total >= 16 ? "Your team is wonderfully in sync." : total >= 8 ? "Some good connections. Try for an even better score!" : "A perfect excuse for another game."}</p>${btn("Play five more rounds", "again")}` : btn("Next clue-giver · next round", "next")}`}</div>`;
        root.querySelector("#clue-form")?.addEventListener("submit", (e) => {
          e.preventDefault();
          let value = root.querySelector("#clue").value.trim();
          if (!value) {
            root
              .querySelector("#clue")
              .setCustomValidity("Enter a clue first.");
            root.querySelector("#clue").reportValidity();
            return;
          }
          clue = value;
          phase = "handoff";
          render();
        });
        root
          .querySelector("#clue")
          ?.addEventListener("input", (e) => e.target.setCustomValidity(""));
        root.querySelector("#guess-slider")?.addEventListener("input", (e) => {
          guess = +e.target.value;
          root.querySelector("#guess-number").textContent = guess;
          root.querySelector(".guess-marker").style.left = guess + "%";
        });
      }
      bind(root, (a) => {
        if (a === "peek" && phase === "privacy") phase = "clue";
        if (a === "guess" && phase === "handoff") phase = "guess";
        if (a === "reveal" && phase === "guess") {
          let distance = Math.abs(target - guess);
          score =
            distance <= 3 ? 4 : distance <= 6 ? 3 : distance <= 12 ? 2 : 0;
          total += score;
          phase = "result";
        }
        if (a === "next" && phase === "result" && round < 5) {
          round++;
          target = rand(101);
          guess = 50;
          clue = "";
          phase = "privacy";
        }
        if (a === "again" && phase === "result") {
          pairs = G.shuffle([...prompts]);
          round = 1;
          total = 0;
          target = rand(101);
          guess = 50;
          clue = "";
          phase = "privacy";
        }
        render();
      });
      render();
    },
  });
})();
