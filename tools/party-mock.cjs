"use strict";
// Runs the real server/party-worker.mjs Durable Object in memory and gives tests a
// browser-like WebSocket class connected to it. No network and no wrangler needed.
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");

function createMockServer({ latency = 2 } = {}) {
  let nextServerEnd = null; // the socket end Party.fetch should receive from `new WebSocketPair()`
  const sandbox = {
    Response: class { constructor(body, init = {}) { this.body = body; this.status = init.status || 200; this.webSocket = init.webSocket; } static json(o) { return new this(JSON.stringify(o)); } },
    WebSocketPair: function () { const s = nextServerEnd; nextServerEnd = null; return { 0: s.peer, 1: s }; },
    URL, crypto: require("node:crypto").webcrypto, console, JSON, Date, Object,
  };
  const src = fs.readFileSync(path.join(__dirname, "../server/party-worker.mjs"), "utf8")
    .replace(/export default\s*/, "const worker = ").replace(/export class Party/, "class Party") + "\n;({worker, Party});";
  const { Party } = vm.runInNewContext(src, sandbox);
  const later = (fn) => setTimeout(fn, latency);
  const parties = new Map();

  class End {
    constructor() { this.readyState = 1; this.peer = null; this.attachment = null; }
    send(data) { if (this.readyState !== 1) throw Error("closed"); const p = this.peer; later(() => p.readyState !== 3 && p.deliver(String(data))); }
    close() { if (this.readyState !== 1) return; this.readyState = 3; const p = this.peer; later(() => p.remoteClosed()); this.localClosed?.(); }
    serializeAttachment(a) { this.attachment = JSON.parse(JSON.stringify(a)); }
    deserializeAttachment() { return this.attachment; }
  }

  function party(code) {
    if (!parties.has(code)) {
      const sockets = new Set(), store = new Map();
      const obj = new Party({
        getWebSockets: () => [...sockets],
        acceptWebSocket: (s) => sockets.add(s),
        storage: { get: async (k) => store.get(k), put: async (k, v) => { store.set(k, v); } },
        blockConcurrencyWhile: async (fn) => fn(),
      });
      parties.set(code, { obj, sockets });
    }
    return parties.get(code);
  }

  class MockWebSocket {
    constructor(url) {
      this.readyState = 0;
      const u = new URL(url), m = /^\/room\/([A-HJ-NP-Z2-9]{6})$/.exec(u.pathname);
      const client = new End(), server = new End();
      client.peer = server; server.peer = client; this._end = client;
      client.deliver = (data) => { if (this.readyState === 1) this.onmessage?.({ data }); };
      client.remoteClosed = () => { if (this.readyState === 3) return; this.readyState = 3; client.readyState = 3; this.onclose?.({}); };
      later(async () => {
        if (!m) { this.readyState = 3; this.onerror?.({}); this.onclose?.({}); return; }
        const p = party(m[1]);
        server.deliver = (data) => p.obj.webSocketMessage(server, data);
        server.remoteClosed = () => { server.readyState = 3; p.sockets.delete(server); p.obj.webSocketClose(server); };
        server.localClosed = () => p.sockets.delete(server);
        this.readyState = 1; this.onopen?.({});
        nextServerEnd = server;
        await p.obj.fetch({ url: u.href });
      });
    }
    send(data) { if (this.readyState !== 1) throw Error("not open"); this._end.send(data); }
    close() { if (this.readyState === 3) return; this._end.close(); this.readyState = 3; later(() => this.onclose?.({})); }
  }
  return { MockWebSocket, parties };
}

module.exports = { createMockServer };
