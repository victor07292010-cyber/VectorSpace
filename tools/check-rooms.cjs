// Deterministic transport tests: independent JS worlds, paired data channels,
// an explicit clock, and the production room protocol and game engines.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),{webcrypto}=require('node:crypto');
const base=path.resolve(__dirname,'../game-night');
class Clock {
 constructor(){this.now=0;this.id=0;this.tasks=new Map();}
 set(fn,delay=0,repeat=0){const id=++this.id;this.tasks.set(id,{fn,at:this.now+delay,repeat});return id;}
 clear(id){this.tasks.delete(id);}
 advance(ms){const end=this.now+ms;let steps=0;while(true){let next=[...this.tasks].filter(([,t])=>t.at<=end).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!next)break;assert.ok(++steps<20000,'Clock settles');const[id,t]=next;this.tasks.delete(id);this.now=t.at;if(t.repeat)this.tasks.set(id,{...t,at:t.at+t.repeat});t.fn();}this.now=end;}
}
const clock=new Clock(),server=new Map();let serial=0;
class Events {constructor(){this.handlers={};}on(k,fn){(this.handlers[k]??=[]).push(fn);}emit(k,...args){for(const fn of this.handlers[k]||[])fn(...args);}}
class Connection extends Events {
 constructor(){super();this.open=false;this.closed=false;}
 send(data){if(!this.open)throw Error('closed');const clone=JSON.parse(JSON.stringify(data));clock.set(()=>{if(this.other.open)this.other.emit('data',clone);},1);}
 close(){if(this.closed)return;this.closed=true;this.open=false;const other=this.other;other.closed=true;other.open=false;clock.set(()=>{this.emit('close');other.emit('close');},1);}
}
class Peer extends Events {
 constructor(id){super();this.id=id||'guest-'+(++serial);this.destroyed=false;this.disconnected=false;this.links=[];clock.set(()=>{if(this.destroyed)return;if(server.has(this.id)){this.emit('error',{type:'unavailable-id'});return;}server.set(this.id,this);this.emit('open',this.id);},1);}
 connect(id,opts){const a=new Connection(),b=new Connection();a.other=b;b.other=a;b.metadata=opts.metadata;this.links.push(a);const host=server.get(id);if(!host){clock.set(()=>this.emit('error',{type:'peer-unavailable'}),1);return a;}host.links.push(b);clock.set(()=>{host.emit('connection',b);clock.set(()=>{if(this.destroyed||host.destroyed)return;a.open=b.open=true;b.emit('open');a.emit('open');},1);},1);return a;}
 reconnect(){this.disconnected=false;server.set(this.id,this);clock.set(()=>this.emit('open',this.id),1);}
 destroy(){if(this.destroyed)return;this.destroyed=true;server.delete(this.id);this.links.forEach(c=>c.close());this.emit('close');}
}
function world(){const store=new Map();const context=vm.createContext({console,crypto:webcrypto,Peer,setTimeout:(fn,ms)=>clock.set(fn,ms),clearTimeout:id=>clock.clear(id),setInterval:(fn,ms)=>clock.set(fn,ms,ms),clearInterval:id=>clock.clear(id),Date:class extends Date{static now(){return clock.now;}},sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}});context.window=context;context.addEventListener=()=>{};for(const file of ['shared.js','online-core.js','online-cards.js','online-boards.js','online-extras.js','online-competitive.js','online-deduction.js','online-creative.js'])vm.runInContext(fs.readFileSync(path.join(base,file),'utf8'),context,{filename:file});return {context,room:context.GameNightRoom};}
const h=world(),g=world(),third=world();h.room.create('Host','tic-tac-toe');clock.advance(10);assert.equal(h.room.data().status,'connected');const code=h.room.data().code;g.room.join('Guest',code);clock.advance(20);assert.equal(g.room.data().snapshot.players.length,2);assert.equal(h.room.data().snapshot.players.length,2);assert.notEqual(h.room.data().myId,g.room.data().myId);
assert.equal(g.room.data().isHost,false);g.room.choose('pig');assert.equal(h.room.data().snapshot.gameId,'tic-tac-toe');g.room.start();assert.equal(h.room.data().snapshot.phase,'lobby');
g.room.ready(true);clock.advance(10);h.room.start();clock.advance(10);assert.equal(g.room.data().snapshot.phase,'playing');
const before=JSON.stringify(h.room.data().snapshot.game);g.room.move({type:'mark',i:'3'});clock.advance(10);assert.equal(JSON.stringify(h.room.data().snapshot.game),before,'wrong turn cannot change board');
for(const [world,index] of [[h,0],[g,3],[h,1],[g,4],[h,2]]){world.room.move({type:'mark',i:String(index)});clock.advance(10);}
assert.ok(h.room.data().snapshot.done);assert.ok(g.room.data().snapshot.done);assert.equal(h.room.data().snapshot.players[0].wins,1);assert.equal(g.room.data().snapshot.players[0].wins,1);
h.room.start();clock.advance(10);assert.ok(!g.room.data().snapshot.done);const guestId=g.room.data().myId;const liveHost=server.get('gamenight-v2-'+code);const connection=liveHost.links.find(c=>c.open);connection.close();clock.advance(10);assert.equal(h.room.data().snapshot.paused,true);clock.advance(1100);assert.equal(g.room.data().status,'connected');assert.equal(g.room.data().myId,guestId,'rejoin keeps its seat');assert.equal(h.room.data().snapshot.players.length,2);assert.equal(h.room.data().snapshot.paused,false);
h.room.backToLobby();clock.advance(10);h.room.choose('color-clash');g.room.ready(true);clock.advance(10);h.room.start();clock.advance(10);const hostCards=h.room.data().snapshot.game.hand.map(c=>c.id),guestView=g.room.data().snapshot.game;assert.equal(guestView.hand.length,7);assert.ok(guestView.hand.every(c=>!hostCards.includes(c.id)));assert.ok(!('hands' in guestView));assert.ok(!('stock' in guestView));assert.ok(!('token' in g.room.data().snapshot.players[0]));
third.room.join('Late arrival',code);clock.advance(20);assert.equal(third.room.data().status,'error');assert.match(third.room.data().error,/already started/);third.room.leave();
h.room.backToLobby();clock.advance(10);h.room.choose('spectrum');g.room.ready(true);clock.advance(10);h.room.start();clock.advance(10);assert.equal(g.room.data().snapshot.game.target,null);assert.equal(typeof h.room.data().snapshot.game.target,'number');
// A signal reconnect must retain a healthy data channel and not create two seats.
const guestPeer=[...server.values()].find(p=>p.id.startsWith('guest-')&&!p.destroyed&&p.links.some(c=>c.open));guestPeer.disconnected=true;guestPeer.emit('disconnected');clock.advance(10);assert.equal(h.room.data().snapshot.players.length,2);
h.room.leave();clock.advance(10);assert.equal(g.room.data().status,'ended');g.room.leave();
// Failed reconnects exhaust bounded backoff instead of stopping after attempt one.
h.room.create('Host','tic-tac-toe');clock.advance(10);const newCode=h.room.data().code;g.room.join('Guest',newCode);clock.advance(20);g.room.ready(true);clock.advance(10);h.room.start();clock.advance(10);const vanished=server.get('gamenight-v2-'+newCode);server.delete(vanished.id);vanished.links.filter(c=>c.open).forEach(c=>c.close());clock.advance(40000);assert.equal(g.room.data().status,'error');h.room.leave();g.room.leave();
clock.advance(200);assert.equal(server.size,0);console.log('PASS independent-room joining, host privileges, legal turns, wins, rematch, reconnect, hidden cards/targets, late-join refusal, bounded retry, cleanup.');
