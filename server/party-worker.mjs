// A room has one host and up to seven guests. Only the host receives guest moves;
// each guest receives its own game view, never another player's hand or role.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/health') return Response.json({ok:true, service:'VectorSpace parties', version:1});
    const match = /^\/room\/([A-HJ-NP-Z2-9]{6})$/.exec(url.pathname);
    if (!match) return new Response('Party not found', {status:404});
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', {status:426});
    const origin = request.headers.get('Origin');
    if (origin && !['https://vectorspaceinternationaldevelopment.online','https://victor07292010-cyber.github.io'].includes(origin)
      && !(env.ALLOW_LOCALHOST === 'true' && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))) return new Response('Origin not allowed', {status:403});
    return env.PARTIES.get(env.PARTIES.idFromName(match[1])).fetch(request);
  }
};

export class Party {
  constructor(ctx) { this.ctx = ctx; }
  sockets() { return this.ctx.getWebSockets().filter(s => s.readyState === 1); }
  host() { return this.sockets().find(s => s.deserializeAttachment()?.role === 'host'); }
  send(socket, message) { try { socket?.send(JSON.stringify(message)); } catch {} }
  async fetch(request) {
    const role = new URL(request.url).searchParams.get('role');
    const pair = new WebSocketPair(), [client, socket] = Object.values(pair);
    this.ctx.acceptWebSocket(socket);
    if (role !== 'host' && role !== 'guest') { socket.close(1008, 'Invalid role'); return new Response(null,{status:101,webSocket:client}); }
    const id = crypto.randomUUID();
    // Serialize creation to prevent two hosts claiming the same random room code.
    await this.ctx.blockConcurrencyWhile(async () => {
      const used = await this.ctx.storage.get('created');
      const host = this.host();
      let error;
      if (role === 'host' && used) error = 'unavailable-id';
      else if (role === 'guest' && !host) error = 'peer-unavailable';
      else if (role === 'guest' && this.sockets().length > 8) error = 'room-full';
      if (error) { this.send(socket,{kind:'error',type:error}); socket.close(1000,'Unavailable'); return; }
      if (role === 'host') await this.ctx.storage.put('created',Date.now());
      socket.serializeAttachment({id,role,joined:role === 'host',count:0,period:Date.now()});
      this.send(socket,{kind:'welcome',id});
    });
    return new Response(null,{status:101,webSocket:client});
  }
  webSocketMessage(socket, raw) {
    const info = socket.deserializeAttachment();
    if (!info || typeof raw !== 'string' || raw.length > (info.role === 'host' ? 2000000 : 18000)) { socket.close(1009,'Message too large'); return; }
    const now=Date.now();
    if(now-info.period>=1000){info.period=now;info.count=0;}
    if(++info.count>(info.role==='host'?300:45)){socket.close(1008,'Too many messages');return;}
    socket.serializeAttachment(info);
    let m; try { m=JSON.parse(raw); } catch { socket.close(1007,'Invalid message'); return; }
    if(!m || typeof m!=='object')return;
    if(info.role === 'guest') {
      const host=this.host();
      if(!host){this.send(socket,{kind:'ended'});socket.close(1000,'Host left');return;}
      if(m.kind==='hello'&&!info.joined){
        if(!m.metadata || m.metadata.version!==2 || !/^[a-f0-9]{32}$/.test(m.metadata.token||'') || typeof m.metadata.name!=='string' || m.metadata.name.length>20){socket.close(1008,'Invalid player');return;}
        info.joined=true;socket.serializeAttachment(info);
        this.send(host,{kind:'connection',id:info.id,metadata:m.metadata});
      } else if(m.kind==='data'&&info.joined) this.send(host,{kind:'data',id:info.id,payload:m.payload});
    } else {
      const guest=this.sockets().find(s=>{const i=s.deserializeAttachment();return i?.id===m.to&&i.role==='guest';});
      if(!guest)return;
      if(m.kind==='data')this.send(guest,{kind:'data',payload:m.payload});
      if(m.kind==='accepted')this.send(guest,{kind:'accepted'});
      if(m.kind==='close')guest.close(1000,'Seat closed');
    }
  }
  webSocketClose(socket) {
    const info=socket.deserializeAttachment();
    if(info?.role==='host'){
      for(const guest of this.sockets()){if(guest===socket)continue;this.send(guest,{kind:'ended'});guest.close(1000,'Party closed');}
    } else if(info?.joined)this.send(this.host(),{kind:'close',id:info.id});
  }
  webSocketError(socket) { this.webSocketClose(socket); try{socket.close(1011,'Connection lost');}catch{} }
}
