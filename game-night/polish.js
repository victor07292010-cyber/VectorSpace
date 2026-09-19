"use strict";

/* Decoration and feedback only. The game engines remain the source of truth. */
window.GameNightPolish = (() => {
  let initialized = false;
  let observer;
  let frame = 0;
  let audioContext;
  let sound = false;
  let keyboard = false;
  let focusMemory = null;
  let lastScope = "";
  let previousPieces = new Map();
  let previousFinish = "";
  let rollRequested = false;
  let toastTimer;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pipPositions = {
    1: [[50, 50]],
    2: [[22, 22], [78, 78]],
    3: [[22, 22], [50, 50], [78, 78]],
    4: [[22, 22], [78, 22], [22, 78], [78, 78]],
    5: [[22, 22], [78, 22], [50, 50], [22, 78], [78, 78]],
    6: [[22, 18], [78, 18], [22, 50], [78, 50], [22, 82], [78, 82]],
  };
  const cardPositions = {
    2: [[50, 10], [50, 90]],
    3: [[50, 10], [50, 50], [50, 90]],
    4: [[16, 10], [84, 10], [16, 90], [84, 90]],
    5: [[16, 10], [84, 10], [50, 50], [16, 90], [84, 90]],
    6: [[16, 10], [84, 10], [16, 50], [84, 50], [16, 90], [84, 90]],
    7: [[16, 10], [84, 10], [50, 30], [16, 50], [84, 50], [16, 90], [84, 90]],
    8: [[16, 10], [84, 10], [50, 30], [16, 50], [84, 50], [50, 70], [16, 90], [84, 90]],
    9: [[16, 5], [84, 5], [16, 35], [84, 35], [50, 50], [16, 65], [84, 65], [16, 95], [84, 95]],
    10: [[16, 5], [84, 5], [50, 20], [16, 35], [84, 35], [16, 65], [84, 65], [50, 80], [16, 95], [84, 95]],
  };

  function pips(n) {
    return (pipPositions[n] || []).map(([x, y]) => `<i style="left:${x}%;top:${y}%"></i>`).join("");
  }
  function artCard(cls, rank, suit) {
    return `<b class="art-card ${cls}" data-suit="${suit}">${rank}</b>`;
  }
  function artDie(cls, n) {
    return `<b class="art-die ${cls}">${pips(n)}</b>`;
  }
  function tileIllustration(id) {
    switch (id) {
      case "shut-box": return `<span class="tile-art art-box">${artDie("one", 3)}${artDie("two", 5)}<span class="art-numbers"><b>1</b><b>2</b><b>3</b></span></span>`;
      case "solitaire": return `<span class="tile-art">${artCard("one red", "K", "♥")}${artCard("two", "Q", "♣")}${artCard("three", "A", "♠")}</span>`;
      case "color-clash": return `<span class="tile-art">${artCard("colour one", "2", "")}${artCard("colour two", "5", "")}${artCard("colour three", "+2", "")}</span>`;
      case "crazy-eights": return `<span class="tile-art">${artCard("one red", "8", "♦")}${artCard("two", "8", "♠")}${artCard("three red", "8", "♥")}</span>`;
      case "go-fish": return `<span class="tile-art">${artCard("one red", "Q", "♥")}${artCard("two", "Q", "♠")}${artCard("three red", "Q", "♦")}</span>`;
      case "sea-battle": return '<span class="tile-art"><span class="art-sea"><i></i></span></span>';
      case "spectrum": return '<span class="tile-art"><span class="art-spectrum"></span></span>';
      case "connect-four": return `<span class="tile-art"><span class="art-connect">${["", "", "", "", "", "", "", "coral", "", "", "coral", "gold", "coral", "gold", "", "gold", "gold", "gold", "gold", "coral"].map(c => `<i class="${c}"></i>`).join("")}</span></span>`;
      case "memory": return '<span class="tile-art"><span class="art-memory"><b>♣</b><b>⁙</b><b>⁙</b><b>♣</b></span></span>';
      case "pig": return `<span class="tile-art">${artDie("one", 5)}${artDie("two", 6)}</span>`;
      case "tic-tac-toe": return '<span class="tile-art"><span class="art-ttt"><i>×</i><i></i><i>○</i><i></i><i>×</i><i>○</i><i></i><i></i><i>×</i></span></span>';
      case "higher-lower": return `<span class="tile-art art-higher">${artCard("one red", "4", "♦")}${artCard("two", "9", "♣")}<b class="art-arrow">↕</b></span>`;
      case "imposter": return '<span class="tile-art art-party"><span class="art-secret">?<small>🕵️</small></span><span class="art-token">?</span></span>';
      case "pictionary": return '<span class="tile-art"><span class="art-sketch"><b>✿</b></span><span class="art-pencil"></span></span>';
      case "guess-who": return '<span class="tile-art"><span class="art-faces"><b>👨🏻</b><b>👩🏽</b><b>👨🏾</b><b>👩🏼</b></span></span>';
      case "mafia": return '<span class="tile-art art-party"><span class="art-secret night">☾<small>🎩</small></span><span class="art-token">✦</span></span>';
      case "liars-dice": return `<span class="tile-art">${artDie("one", 1)}${artDie("two", 5)}<b class="art-token">?</b></span>`;
      case "rock-paper-scissors": return '<span class="tile-art art-party"><span class="art-secret">✂<small>✌️</small></span><span class="art-token">✊</span></span>';
      case "reversi": return `<span class="tile-art"><span class="art-connect art-reversi">${Array.from({length:16}, (_, i) => `<i class="${[5,10].includes(i) ? "light" : [6,9].includes(i) ? "dark" : ""}"></i>`).join("")}</span></span>`;
      case "dots-boxes": return '<span class="tile-art"><span class="art-dotboard"><b>A</b><i></i><i></i><i></i><i></i></span></span>';
      default: return "";
    }
  }

  function decorateTiles(app) {
    app.querySelectorAll(".game-tile .tile-symbol:not(.has-art)").forEach(symbol => {
      const id = symbol.closest(".game-tile").getAttribute("href")?.slice(1).split("/").at(-1);
      const illustration = tileIllustration(id);
      if (illustration) {
        symbol.classList.add("has-art");
        symbol.innerHTML = illustration;
      }
    });
  }

  function decorateCards(app) {
    app.querySelectorAll(".playing-card:not(.card-back):not(.color-card):not(.has-pips)").forEach(card => {
      const corner = card.querySelector(".card-corner");
      const suit = corner?.querySelector("small")?.textContent;
      const rank = corner?.firstChild?.textContent.trim();
      if (!suit || !rank || !"♠♥♣♦".includes(suit)) return;
      const coordinates = cardPositions[Number(rank)];
      if (!coordinates && !["J", "Q", "K"].includes(rank)) return;
      const field = document.createElement("span");
      field.className = `card-pips${coordinates ? "" : " face"}`;
      field.setAttribute("aria-hidden", "true");
      if (coordinates) {
        field.innerHTML = coordinates.map(([x, y]) => `<i class="${y > 50 ? "upside" : ""}" style="left:${x}%;top:${y}%">${suit}</i>`).join("");
      } else {
        const emblem = document.createElement("b");
        emblem.textContent = suit;
        field.append(emblem);
      }
      card.classList.add("has-pips");
      card.append(field);
    });
  }

  function decorateDice(app) {
    app.querySelectorAll(".die:not(.has-pips)").forEach(die => {
      const text = die.textContent.trim();
      const value = "⚀⚁⚂⚃⚄⚅".indexOf(text) + 1;
      if (!value || !text) return;
      const field = document.createElement("span");
      field.className = "die-pips";
      field.setAttribute("aria-hidden", "true");
      field.innerHTML = pips(value);
      die.classList.add("has-pips");
      die.dataset.polishDie = String(value);
      // Retain the original glyph and accessible label; CSS only hides the glyph.
      die.append(field);
    });
  }

  function animateChanges(app) {
    const scope = location.hash || "home";
    if (scope !== lastScope) {
      lastScope = scope;
      previousPieces = new Map();
      previousFinish = "";
      rollRequested = false;
    }
    const next = new Map();
    const selectors = [".die", ".connect-cell", ".ttt-cell", ".memory-card", ".hand .playing-card", ".number-tile"];
    selectors.forEach(selector => {
      app.querySelectorAll(selector).forEach((piece, index) => {
        const isCard = selector.includes("playing-card");
        const key = `${selector}:${isCard ? piece.getAttribute("aria-label") || index : index}`;
        let value;
        if (selector === ".die") value = piece.dataset.polishDie || piece.getAttribute("aria-label") || piece.textContent.trim();
        else if (selector === ".connect-cell") value = piece.classList.contains("p1") ? "1" : piece.classList.contains("p2") ? "2" : "empty";
        else if (selector === ".memory-card") value = piece.classList.contains("matched") ? "matched" : piece.classList.contains("open") ? "open" : "closed";
        else if (selector === ".number-tile") value = piece.classList.contains("closed") ? "closed" : "open";
        else value = piece.getAttribute("aria-label") || piece.textContent.trim();
        next.set(key, value);
        const changed = previousPieces.has(key) && previousPieces.get(key) !== value;
        const dealt = isCard && previousPieces.size && !previousPieces.has(key);
        if (!motion.matches && (changed || dealt || (selector === ".die" && rollRequested))) {
          piece.classList.add(selector === ".die" ? "gn-dice-roll" : "gn-piece-new");
        }
      });
    });
    previousPieces = next;
    rollRequested = false;
    const finished = app.querySelector(".game-status.finished, .room-status.finished");
    const finishKey = finished ? `${scope}:${finished.textContent.trim()}` : "";
    if (finishKey && finishKey !== previousFinish) {
      finished.classList.add("gn-status-pop");
      celebrate(finished.closest(".game-surface, .room-stage"));
      if (sound) playSound("finish");
    }
    previousFinish = finishKey;
  }

  function celebrate(surface) {
    if (!surface || motion.matches || surface.querySelector(".gn-celebration")) return;
    const layer = document.createElement("span");
    layer.className = "gn-celebration";
    layer.setAttribute("aria-hidden", "true");
    const palette = ["#f6d37e", "#bad3a2", "#e7a98b", "#eae8cb"];
    for (let i = 0; i < 24; i++) {
      const piece = document.createElement("i");
      piece.style.cssText = `--x:${8 + (i * 31 % 84)}%;--color:${palette[i % 4]};--delay:${i % 7 * 45}ms;--drift:${(i % 2 ? 1 : -1) * (14 + i * 7 % 55)}px;--spin:${(i % 2 ? 1 : -1) * (160 + i * 41)}deg`;
      layer.append(piece);
    }
    surface.append(layer);
    window.setTimeout(() => layer.remove(), 2200);
  }

  function rememberFocus(element) {
    if (!keyboard || !(element instanceof HTMLElement) || !document.querySelector("#app")?.contains(element)) return;
    if (!element.matches("button, a, input, select, textarea")) return;
    const attributes = [...element.attributes]
      .filter(a => a.name === "id" || a.name === "name" || a.name === "href" || (a.name.startsWith("data-") && !a.name.startsWith("data-polish")))
      .map(a => [a.name, a.value]);
    if (!attributes.length) return;
    const siblings = [...document.querySelectorAll(`#app ${element.tagName.toLowerCase()}`)].filter(e => attributes.every(([key, value]) => e.getAttribute(key) === value));
    focusMemory = { element, tag: element.tagName.toLowerCase(), attributes, ordinal: siblings.indexOf(element), scope: location.hash };
  }

  function restoreFocus(app) {
    if (!keyboard || !focusMemory || focusMemory.scope !== location.hash || focusMemory.element.isConnected) return;
    if (document.activeElement && document.activeElement !== document.body && document.activeElement !== document.documentElement) return;
    const remembered = focusMemory;
    const matches = [...app.querySelectorAll(remembered.tag)].filter(el => remembered.attributes.every(([key, value]) => el.getAttribute(key) === value));
    const replacement = matches[remembered.ordinal];
    if (replacement && !replacement.disabled && !replacement.closest("[hidden], [inert]")) {
      replacement.focus({ preventScroll: true });
    }
  }

  function update() {
    frame = 0;
    const app = document.querySelector("#app");
    if (!app) return;
    // Our additions do not schedule another render or another observer pass.
    observer?.disconnect();
    try {
      decorateTiles(app);
      decorateCards(app);
      decorateDice(app);
      animateChanges(app);
      restoreFocus(app);
    } finally {
      observer?.observe(app, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    }
  }

  function queueUpdate() {
    if (!frame) frame = requestAnimationFrame(update);
  }

  function playSound(kind = "tap") {
    if (!sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audioContext ||= new Audio();
      if (audioContext.state === "suspended") audioContext.resume().catch(() => {});
      const now = audioContext.currentTime;
      const notes = kind === "finish" ? [523.25, 659.25, 783.99] : kind === "roll" ? [180, 230, 280] : [kind === "card" ? 420 : 600];
      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const start = now + index * (kind === "finish" ? .09 : .035);
        const duration = kind === "finish" ? .22 : .065;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(frequency * .78, start + duration);
        gain.gain.setValueAtTime(.0001, start);
        gain.gain.exponentialRampToValueAtTime(kind === "finish" ? .035 : .022, start + .007);
        gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(start);
        oscillator.stop(start + duration + .015);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
    } catch {
      // A browser without audio support still has the complete game experience.
    }
  }

  function syncSoundButton(button) {
    button.classList.add("sound-toggle");
    button.type = "button";
    button.setAttribute("aria-pressed", String(sound));
    button.setAttribute("aria-label", sound ? "Turn game sounds off" : "Turn game sounds on");
    button.title = sound ? "Game sounds on" : "Game sounds off";
    button.innerHTML = `<svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h3l4-4v12l-4-4H3z"/>${sound ? '<path d="M13 7a5 5 0 0 1 0 6M15 4a9 9 0 0 1 0 12"/>' : '<path d="m13.5 8 4 4m0-4-4 4"/>'}</svg><span>Sound ${sound ? "on" : "off"}</span>`;
  }

  function toast(message) {
    document.querySelector(".gn-toast")?.remove();
    clearTimeout(toastTimer);
    const element = document.createElement("div");
    element.className = "gn-toast";
    element.setAttribute("role", "status");
    element.textContent = message;
    document.body.append(element);
    toastTimer = window.setTimeout(() => element.remove(), 2000);
  }

  function init() {
    if (initialized) { queueUpdate(); return; }
    const app = document.querySelector("#app");
    if (!app) return;
    initialized = true;
    let toggle = document.querySelector("#sound-toggle");
    if (!toggle) {
      toggle = document.createElement("button");
      toggle.id = "sound-toggle";
      document.querySelector(".site-header")?.append(toggle);
    }
    // Every fresh page starts quietly; only this deliberate button enables audio.
    syncSoundButton(toggle);
    toggle.addEventListener("click", () => {
      sound = !sound;
      syncSoundButton(toggle);
      if (sound) playSound();
      toast(sound ? "A little sound for your game night." : "Sounds off. Play on.");
    });
    document.addEventListener("keydown", event => {
      if (["Tab", "Enter", " ", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        keyboard = true;
        rememberFocus(document.activeElement);
      }
    }, true);
    document.addEventListener("pointerdown", () => { keyboard = false; focusMemory = null; }, true);
    document.addEventListener("focusin", event => rememberFocus(event.target), true);
    document.addEventListener("click", event => {
      const target = event.target instanceof Element ? event.target.closest("button, .game-tile") : null;
      if (!target || target.disabled || target.id === "sound-toggle") return;
      const action = target.dataset.action || target.dataset.move || "";
      if (action === "roll") rollRequested = true;
      if (app.contains(target)) playSound(action === "roll" ? "roll" : target.matches(".playing-card, .memory-card") ? "card" : "tap");
    }, true);
    window.addEventListener("hashchange", () => { focusMemory = null; queueUpdate(); });
    observer = new MutationObserver(queueUpdate);
    update();
  }

  return { init };
})();
