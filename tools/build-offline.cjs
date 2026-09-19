"use strict";

// A dependency-free, reproducible ZIP: run `node tools/build-offline.cjs`.
// Only public browser assets are included. ZIP timestamps and ordering are fixed.
const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const siteRoot = path.resolve(__dirname, "../game-night");
const output = path.join(siteRoot, "downloads/vectorspace-offline.zip");
const assetDirectories = new Set([
  "assets", "vendor", "images", "fonts", "sounds",
]);
const assetExtensions = new Set([
  ".html", ".js", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp",
  ".gif", ".ico", ".woff", ".woff2", ".ttf", ".otf", ".mp3", ".ogg", ".wav",
]);

function collectAssets(directory, relative = "") {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const assetPath = relative ? `${relative}/${entry.name}` : entry.name;
    const absolutePath = path.join(directory, entry.name);
    // Do not follow symlinks or pick up arbitrary workspace folders.
    if (entry.isDirectory()) {
      if (!relative && !assetDirectories.has(entry.name)) continue;
      if (["downloads", "node_modules", "tests", "test"].includes(entry.name)) continue;
      files.push(...collectAssets(absolutePath, assetPath));
    } else if (entry.isFile() && (
      assetExtensions.has(path.extname(entry.name).toLowerCase()) ||
      /^(?:[A-Z0-9_-]+-)?LICENSE(?:\.txt)?$/i.test(entry.name)
    )) {
      files.push({ path: assetPath, data: fs.readFileSync(absolutePath) });
    }
  }
  return files;
}

function checkStartupAssets(files) {
  const names = new Set(files.map((file) => file.path));
  if (!names.has("index.html")) throw new Error("The site needs index.html.");
  if (!names.has("offline-help.html")) throw new Error("The offline instructions are missing.");
  for (const file of files.filter((item) => item.path.endsWith(".html"))) {
    const html = file.data.toString("utf8");
    for (const tag of html.match(/<(?:script|link|img|source)\b[^>]*>/gi) || []) {
      if (/^<link\b/i.test(tag) && !/\brel=["'](?:stylesheet|icon)["']/i.test(tag)) continue;
      const resource = /\b(?:src|href)=["']([^"']+)["']/i.exec(tag)?.[1];
      if (!resource || /^(?:data:|#)/i.test(resource)) continue;
      if (/^(?:[a-z][a-z\d+.-]*:|\/)/i.test(resource)) {
        throw new Error(`${file.path} requires a non-portable resource: ${resource}`);
      }
      const clean = decodeURIComponent(resource.split(/[?#]/)[0]);
      const target = path.posix.normalize(path.posix.join(path.posix.dirname(file.path), clean));
      if (!names.has(target)) throw new Error(`${file.path} references missing asset ${target}.`);
    }
  }
}

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});
function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

function makeZip(files) {
  if (files.length > 65535) throw new Error("Too many assets for a standard ZIP.");
  const locals = [];
  const central = [];
  let offset = 0;
  const date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const file of files) {
    const name = Buffer.from(`VectorSpace/${file.path}`, "utf8");
    const packed = zlib.deflateRawSync(file.data, { level: 9 });
    const crc = crc32(file.data);
    if (name.length > 65535 || file.data.length > 0xffffffff || packed.length > 0xffffffff) {
      throw new Error(`Asset is too large for a standard ZIP: ${file.path}`);
    }
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // ZIP version 2.0; Deflate.
    local.writeUInt16LE(0x0800, 6); // UTF-8 filenames.
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, packed);

    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0x0800, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(date, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(packed.length, 20);
    header.writeUInt32LE(file.data.length, 24);
    header.writeUInt16LE(name.length, 28);
    header.writeUInt32LE(offset, 42);
    central.push(header, name);
    offset += local.length + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  if (offset + directory.length > 0xffffffff) throw new Error("Archive exceeds the standard ZIP limit.");
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}

const startHere = `VECTORSPACE — YOUR OFFLINE GAME COLLECTION

1. Extract the entire ZIP first.
   Windows: right-click the ZIP and choose Extract All.
   macOS: double-click the ZIP to extract it.
2. Open the extracted VectorSpace folder.
3. Double-click index.html to play in your browser.

Keep the whole folder together. Opening index.html inside a ZIP preview,
or moving it away from the other files, can stop the games from loading.

SOLO AND COMPUTER OPPONENTS
The Offline filter includes 17 games; 12 have computer opponents.
Look for Solo or Vs computer in the game library. The card, board, and
dice classics run locally, with no account, installation, or internet.
Where a game offers a player mode, choose Vs computer to face a CPU.
The computer opponents are built into the download; no AI service is needed.

PLAYING WITH FRIENDS
Same-screen games work offline where offered. Online rooms and room codes
need an internet connection and other players. Social games such as Mafia,
Imposter, and Sketch Party are designed for a group of real players.
For the easiest online experience, use the published website:
https://victor07292010-cyber.github.io/VectorSpace/

HELP
Open offline-help.html for the illustrated setup guide. If a browser or
managed school/work device blocks local files, follow that device's policy.
You can move the extracted folder to another permitted personal device.

This download is a snapshot. Download a fresh copy from the website for updates.
`;

const files = collectAssets(siteRoot);
checkStartupAssets(files);
files.push({ path: "START-HERE.txt", data: Buffer.from(startHere, "utf8") });
files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
const zip = makeZip(files);
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, zip);
console.log(`Created ${path.relative(path.resolve(__dirname, ".."), output)}`);
console.log(`${files.length} files · ${(zip.length / 1024).toFixed(1)} KB · all startup assets included`);
console.log(`SHA-256 ${crypto.createHash("sha256").update(zip).digest("hex")}`);
