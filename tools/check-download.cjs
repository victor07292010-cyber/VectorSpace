"use strict";

// Tests the delivered ZIP, not the working source folder. No server is started.
// Usage: node tools/check-download.cjs /path/to/node_modules/jsdom
const { JSDOM, requestInterceptor, VirtualConsole } = require(process.argv[2] || "jsdom");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { fileURLToPath } = require("node:url");

const archivePath = path.resolve(__dirname, "../game-night/downloads/vectorspace-offline.zip");
const temporaryBase = path.resolve(os.tmpdir());
const extracted = fs.mkdtempSync(path.join(temporaryBase, "vectorspace-download-check-"));
const outbound = [];
const errors = [];
let dom;
let checks = 0;

function pass(label) {
  checks++;
  console.log(`PASS ${label}`);
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function extractZip() {
  const zip = fs.readFileSync(archivePath);
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 65557); i--) {
    if (zip.readUInt32LE(i) === 0x06054b50 && i + 22 + zip.readUInt16LE(i + 20) === zip.length) {
      end = i;
      break;
    }
  }
  assert.ok(end >= 0, "Valid ZIP end record");
  assert.equal(zip.readUInt32LE(end + 4), 0, "Single-disk ZIP");
  const count = zip.readUInt16LE(end + 10);
  assert.equal(zip.readUInt16LE(end + 8), count);
  const directorySize = zip.readUInt32LE(end + 12);
  let position = zip.readUInt32LE(end + 16);
  assert.equal(position + directorySize, end, "Central directory has the expected size");
  const names = new Set();
  let totalSize = 0;
  for (let i = 0; i < count; i++) {
    assert.equal(zip.readUInt32LE(position), 0x02014b50, "Valid central file record");
    const flags = zip.readUInt16LE(position + 8);
    const method = zip.readUInt16LE(position + 10);
    const crc = zip.readUInt32LE(position + 16);
    const compressedSize = zip.readUInt32LE(position + 20);
    const size = zip.readUInt32LE(position + 24);
    const nameLength = zip.readUInt16LE(position + 28);
    const extraLength = zip.readUInt16LE(position + 30);
    const commentLength = zip.readUInt16LE(position + 32);
    const localOffset = zip.readUInt32LE(position + 42);
    const name = zip.subarray(position + 46, position + 46 + nameLength).toString("utf8");
    position += 46 + nameLength + extraLength + commentLength;
    assert.equal(flags & 1, 0, "Download must not be encrypted");
    assert.ok(name.startsWith("VectorSpace/") && !name.includes("\\"), `Portable archive path: ${name}`);
    assert.ok(!names.has(name), `No duplicate archive path: ${name}`);
    assert.doesNotMatch(name, /(?:^|\/)(?:\.[^/]+|downloads|node_modules|tests?|tools)(?:\/|$)|\.zip$/i);
    names.add(name);
    const target = path.resolve(extracted, name);
    assert.ok(target.startsWith(extracted + path.sep), `Extraction remains inside the temporary folder: ${name}`);
    if (name.endsWith("/")) continue;
    totalSize += size;
    assert.ok(totalSize < 100 * 1024 * 1024, "Reasonable uncompressed download size");
    assert.equal(zip.readUInt32LE(localOffset), 0x04034b50, "Valid local file record");
    const dataStart = localOffset + 30 + zip.readUInt16LE(localOffset + 26) + zip.readUInt16LE(localOffset + 28);
    const packed = zip.subarray(dataStart, dataStart + compressedSize);
    assert.equal(packed.length, compressedSize);
    assert.ok(method === 0 || method === 8, "Standard ZIP compression supported by desktop extractors");
    const bytes = method === 8 ? zlib.inflateRawSync(packed, { maxOutputLength: 100 * 1024 * 1024 }) : packed;
    assert.equal(bytes.length, size, `Extracted length: ${name}`);
    assert.equal(crc32(bytes), crc, `ZIP integrity check: ${name}`);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
  }
  assert.equal(position, end);
  for (const required of ["index.html", "offline-help.html", "START-HERE.txt", "cpu-games.js", "vendor/PEERJS-LICENSE.txt"]) {
    assert.ok(names.has(`VectorSpace/${required}`), `Download includes ${required}`);
  }
  pass(`ZIP extraction and CRC checks (${count} entries; no source-only or recursive files)`);
}

function blockNetwork(window) {
  const blocked = (kind, url) => {
    outbound.push(`${kind}: ${String(url)}`);
    return new Error(`Network disabled during offline checks: ${kind}`);
  };
  window.fetch = (url) => Promise.reject(blocked("fetch", url));
  class OfflineSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;
    constructor(url) { throw blocked("WebSocket", url); }
  }
  window.WebSocket = OfflineSocket;
  window.EventSource = class {
    constructor(url) { throw blocked("EventSource", url); }
  };
  const originalXHR = window.XMLHttpRequest;
  window.XMLHttpRequest = class extends originalXHR {
    open(method, url, ...args) {
      this.offlineURL = new URL(url, window.location.href);
      return super.open(method, url, ...args);
    }
    send(...args) {
      if (this.offlineURL?.protocol !== "file:") throw blocked("XMLHttpRequest", this.offlineURL);
      return super.send(...args);
    }
  };
  window.navigator.sendBeacon = (url) => { blocked("sendBeacon", url); return false; };
  window.scrollTo = () => {};
  window.matchMedia = (media) => ({
    media, matches: media.includes("prefers-reduced-motion"), onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  });
  window.addEventListener("error", (event) => errors.push(event.error || event.message));
}

async function until(predicate, label, timeout = 5000) {
  const start = Date.now();
  while (!predicate()) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${label}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function visit(hash) {
  const previous = dom.window.location.hash;
  dom.window.location.hash = hash;
  if (previous !== dom.window.location.hash) {
    await new Promise((resolve) => dom.window.addEventListener("hashchange", resolve, { once: true }));
  }
  await new Promise((resolve) => setTimeout(resolve, 25));
}

async function main() {
  extractZip();
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", (error) => errors.push(error));
  dom = await JSDOM.fromFile(path.join(extracted, "VectorSpace/index.html"), {
    runScripts: "dangerously",
    // JSDOM 30 reads file: resources directly. All HTTP(S) resource requests
    // pass through this interceptor before any network dispatcher is reached.
    resources: { interceptors: [requestInterceptor((request) => {
      outbound.push(`resource: ${request.url}`);
      throw new Error(`External resource blocked: ${request.url}`);
    })] },
    pretendToBeVisual: true,
    virtualConsole,
    beforeParse: blockNetwork,
  });
  await until(() => dom.window.document.readyState === "complete", "extracted index.html loads");
  const document = dom.window.document;
  assert.equal(dom.window.location.protocol, "file:");
  assert.match(document.title, /VectorSpace/);
  assert.equal(errors.length, 0, errors.map(String).join("\n"));
  assert.equal(Object.keys(dom.window.GameNight.games).length, 17, "Local game scripts actually executed");
  assert.equal(Object.keys(dom.window.RoomGames.games).length, 20, "All shared game engines actually executed");
  assert.ok(document.styleSheets.length > 0, "Bundled stylesheet loaded from the extracted archive");
  for (const resource of document.querySelectorAll('script[src], link[rel="stylesheet"]')) {
    const file = path.resolve(fileURLToPath(resource.src || resource.href));
    assert.ok(file.startsWith(extracted + path.sep), "Startup resource belongs to the extracted folder");
    assert.ok(fs.existsSync(file), "Startup resource exists in the extracted folder");
  }
  pass("Extracted index.html loads via file:// without a web server or CDN");

  const offlineIds = ["shut-box", "solitaire", "color-clash", "crazy-eights", "go-fish", "sea-battle", "spectrum", "connect-four", "memory", "pig", "tic-tac-toe", "higher-lower", "guess-who", "dots-boxes", "reversi", "liars-dice", "rock-paper-scissors"];
  const cpuIds = ["color-clash", "crazy-eights", "go-fish", "sea-battle", "connect-four", "pig", "tic-tac-toe", "guess-who", "dots-boxes", "reversi", "liars-dice", "rock-paper-scissors"];
  const tiles = () => [...document.querySelectorAll(".game-tile")].map((tile) => tile.getAttribute("href").slice(1)).sort();
  assert.equal(document.querySelector('[data-play-style="offline"]').getAttribute("aria-pressed"), "true");
  assert.deepEqual(tiles(), [...offlineIds].sort());
  assert.match(document.querySelector(".game-count").textContent, /17 games available offline/);
  pass("Offline copy defaults to the complete 17-game local library");

  const headerDownload = document.querySelector("[data-offline-download]");
  assert.ok(headerDownload, "Header action is present");
  assert.equal(headerDownload.getAttribute("href"), "offline-help.html");
  assert.ok(!headerDownload.hasAttribute("download"));
  assert.equal(document.querySelectorAll('a[href$=".zip"]').length, 0, "Offline copy does not link to a missing nested ZIP");
  for (const link of document.querySelectorAll('a[href="offline-help.html"]')) {
    assert.ok(fs.existsSync(fileURLToPath(link.href)), "Offline help link resolves to an extracted file");
  }
  pass("Downloaded copy offers working offline help instead of a broken ZIP link");

  document.querySelector('[data-play-style="cpu"]').click();
  assert.deepEqual(tiles(), [...cpuIds].sort());
  assert.match(document.querySelector(".game-count").textContent, /12 games with computer opponents/);
  pass("Vs computer filter contains all 12 local computer opponents");

  for (const id of offlineIds) {
    await visit(id);
    const root = document.querySelector("#game-root");
    assert.ok(root?.textContent.trim(), `${id} renders from the archive`);
    assert.ok(root.querySelector("button, input, select"), `${id} has game controls`);
    assert.equal(document.querySelectorAll(".offline-room-notice").length, 0, `${id} is playable locally`);
    assert.equal(errors.length, 0, `${id}: ${errors.map(String).join("\n")}`);
  }
  pass("All 17 offline game routes mount with real controls from the extracted files");

  await visit("rock-paper-scissors");
  for (let round = 1; round <= 5; round++) {
    const choice = document.querySelector('[data-move="throw"][data-choice="rock"]');
    assert.ok(choice && !choice.disabled, `Player can throw in round ${round}`);
    choice.click();
    await until(() => document.querySelector(".rps-reveal"), `local computer answers throw ${round}`);
    assert.equal(document.querySelectorAll(".rps-reveal > div").length, 2, "Both choices are revealed");
    if (round < 5) document.querySelector('[data-move="next"]').click();
  }
  assert.match(document.querySelector(".cpu-state").textContent, /Match finished/);
  pass("A complete five-round computer match runs locally with networking disabled");

  for (const route of ["online", "join/ABC123", "online/imposter", "online/mafia", "online/pictionary"]) {
    await visit(route);
    assert.ok(document.querySelector(".offline-room-notice"), `${route} explains its online requirement`);
    assert.ok(document.querySelector('.offline-room-notice a[href^="https://"][target="_blank"]'), "Online play requires an explicit external link");
  }
  assert.deepEqual(outbound, [], `No network attempts: ${outbound.join("\n")}`);
  assert.equal(errors.length, 0, errors.map(String).join("\n"));
  pass("Offline games and social-game notices make zero network attempts");
  console.log(`\n${checks} download integration checks passed.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  dom?.window.close();
  // Verify the exact generated temporary directory before recursive cleanup.
  assert.equal(path.dirname(path.resolve(extracted)), temporaryBase);
  assert.ok(path.basename(extracted).startsWith("vectorspace-download-check-"));
  fs.rmSync(extracted, { recursive: true, force: true });
});
