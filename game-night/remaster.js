"use strict";
// Remaster table tools for every solo / vs-computer game page:
// a computer difficulty dial, a score pad that remembers your results, and the N key for a new game.
(() => {
  const G = window.GameNight;
  const KEY = "vs-score-pad";
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch { return {}; } };
  const write = (pad) => { try { localStorage.setItem(KEY, JSON.stringify(pad)); } catch {} };
  const blank = () => ({ w: 0, l: 0, d: 0, p: 0, streak: 0, best: 0 });

  // Read the result from the finished status line the game already prints.
  function outcome(text, vsCpu) {
    const t = text.toLowerCase();
    if (/\b(draw|tie|tied|ties)\b/.test(t)) return "d";
    if (/^(x|gold|player 1) wins/.test(t)) return "w";
    if (/^(o|coral|player 2) wins/.test(t)) return "l";
    if (/computer (wins|won|takes|claims)|you lose|you lost|fleet has sunk|cpu wins|computer.{0,40}\bwins?\b/.test(t)) return "l";
    if (/\byou (win|won|beat|cleared|solved|shut)\b|\byou\b.{0,30}\bwins?\b|congratulations|well played|victory|you did it/.test(t)) return "w";
    if (vsCpu && /\bwins?\b/.test(t) && !/\byou\b/.test(t)) return "l";
    return "p";
  }

  let detach = () => {};
  G.tableTools = (page, id, { restart, vsCpu }) => {
    detach();
    const root = page.querySelector("#game-root"), actions = page.querySelector(".game-heading-actions"), aside = page.querySelector(".rules-panel");
    if (!root || !actions || !aside) return;

    if (vsCpu && G.cpu) {
      const dial = document.createElement("div");
      dial.className = "cpu-dial"; dial.setAttribute("role", "radiogroup"); dial.setAttribute("aria-label", "Computer difficulty");
      dial.innerHTML = `<span class="cpu-dial-label">Computer</span>${G.cpu.levels.map((l) => `<button type="button" role="radio" data-level="${l}" aria-checked="${G.cpu.level === l}">${l[0].toUpperCase() + l.slice(1)}</button>`).join("")}`;
      dial.onclick = (e) => {
        const b = e.target.closest("[data-level]"); if (!b || b.dataset.level === G.cpu.level) return;
        G.cpu.set(b.dataset.level);
        dial.querySelectorAll("[data-level]").forEach((x) => x.setAttribute("aria-checked", String(x.dataset.level === G.cpu.level)));
        restart();
      };
      actions.appendChild(dial);
    }

    const card = document.createElement("div");
    card.className = "score-pad";
    aside.prepend(card);
    const paint = (flash = "") => {
      const s = { ...blank(), ...(read()[id] || {}) };
      const cells = vsCpu ? [["Wins", s.w, "w"], ["Losses", s.l, "l"], ["Draws", s.d, "d"]] : [["Played", s.p + s.w + s.l + s.d, "p"], ["Wins", s.w, "w"], ["Best streak", s.best, "b"]];
      card.innerHTML = `<span class="score-pad-title">Score pad</span><ul>${cells.map(([label, n, k]) => `<li class="${flash === k ? "is-new" : ""}"><b>${n}</b><span>${label}</span></li>`).join("")}</ul><p>${s.streak > 1 ? `🔥 ${s.streak} wins in a row` : vsCpu ? `Computer: ${(G.cpu ? G.cpu.level : "normal").replace(/^./, (c) => c.toUpperCase())}` : "Results stay on this device."}</p><button type="button" class="text-link score-pad-reset">Clear</button>`;
      card.querySelector(".score-pad-reset").onclick = () => { const pad = read(); delete pad[id]; write(pad); paint(); };
    };
    paint();

    let counted = false;
    const check = () => {
      const done = root.querySelector(".game-status.finished");
      if (!done) { counted = false; page.classList.remove("is-finished"); return; }
      if (counted) return;
      counted = true; page.classList.add("is-finished");
      const result = outcome(done.textContent || "", vsCpu);
      const pad = read(), s = { ...blank(), ...(pad[id] || {}) };
      s[result]++;
      if (result === "w") { s.streak++; s.best = Math.max(s.best, s.streak); } else if (result !== "p") s.streak = 0;
      pad[id] = s; write(pad); paint(result === "p" ? "p" : result);
    };
    const observer = new MutationObserver(check);
    observer.observe(root, { childList: true, subtree: true, characterData: true });
    const onKey = (e) => {
      if (e.key !== "n" && e.key !== "N" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.target.closest?.("input, textarea, select, [contenteditable]")) return;
      e.preventDefault(); restart();
    };
    document.addEventListener("keydown", onKey);
    const restartButton = page.querySelector("#restart");
    if (restartButton) restartButton.title = "New game (N)";
    detach = () => { observer.disconnect(); document.removeEventListener("keydown", onKey); detach = () => {}; };
  };
  G.tableToolsDetach = () => detach();
  G.scoreOutcome = outcome;
})();
