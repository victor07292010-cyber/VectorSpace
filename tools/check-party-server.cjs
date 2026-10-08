// Integration test against wrangler dev or the deployed Worker, using real sockets.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const useMock=process.argv[2]==='mock',endpoint=useMock?'ws://party.mock':(process.argv[2]||'ws://127.0.0.1:8787'),worlds=[];
// `node tools/check-party-server.cjs mock` runs the real worker code in memory (no network).
const WS=useMock?require('./party-mock.cjs').createMockServer().MockWebSocket:WebSocket;
function world(){
  const store=new Map();
  const c=vm.createContext({console,crypto:require('node:crypto').webcrypto,URL,WebSocket:WS,setTimeout,clearTimeout,setInterval,clearInterval,sessionStorage:{getItem:k=>store.get(k),setItem:(k,v)=>store.set(k,v)}});
  c.window=c;c.addEventListener=()=>{};c.VECTORSPACE_PARTY_SERVER=endpoint;
  for(const file of ['shared.js','party-transport.js','online-core.js','online-cards.js','online-boards.js','online-extras.js','online-competitive.js','online-deduction.js','online-creative.js','strategy-pack.js','party-pack.js','party-night-data.js','party-night.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../game-night',file),'utf8'),c,{filename:file});
  const r=c.GameNightRoom;worlds.push(r);return r;
}
async function until(check,label){const start=Date.now();while(!check()){if(Date.now()-start>12000)throw Error('Timed out: '+label+' '+JSON.stringify(worlds.map(r=>({status:r.data().status,error:r.data().error}))));await new Promise(r=>setTimeout(r,20));}}
(async()=>{
  const host=world(),guest=world();host.create('Host','tic-tac-toe');await until(()=>host.data().status==='connected','host');
  const link='https://vectorspaceinternationaldevelopment.online/#party/'+host.data().code;
  guest.join('Friend',link);await until(()=>guest.data().snapshot?.players.length===2,'join link');
  guest.ready(true);await until(()=>host.data().snapshot.players[1].ready,'ready');host.start();await until(()=>guest.data().snapshot?.phase==='playing','start');
  for(const [r,i]of [[host,0],[guest,3],[host,1],[guest,4],[host,2]]){const rev=host.data().snapshot.revision;r.move({type:'mark',i:String(i)});await until(()=>guest.data().snapshot.revision>rev,'move');}
  assert.equal(guest.data().snapshot.players[0].wins,1);assert.ok(guest.data().snapshot.done);
  console.log('PASS actual WebSocket party link, shared turns, complete game and score.');
  host.backToLobby();await until(()=>guest.data().snapshot.phase==='lobby','lobby');host.choose('color-clash');
  await until(()=>guest.data().snapshot.gameId==='color-clash','choice');guest.ready(true);await until(()=>host.data().snapshot.players[1].ready,'ready cards');host.start();await until(()=>guest.data().snapshot.phase==='playing','cards');
  assert.equal(guest.data().snapshot.game.hand.length,7);assert.ok(!('hands' in guest.data().snapshot.game));
  const oldId=guest.data().myId;guest.retry();await until(()=>guest.data().status==='connected','rejoin');assert.equal(guest.data().myId,oldId);assert.equal(host.data().snapshot.players.length,2);
  console.log('PASS hidden cards and reconnect to the same seat through the server.');
  host.backToLobby();await until(()=>guest.data().snapshot.phase==='lobby','lobby again');
  const others=Array.from({length:6},world);
  for(let i=0;i<others.length;i++){others[i].join('Friend '+i,link);await until(()=>others[i].data().status==='connected','extra guest');}
  await until(()=>guest.data().snapshot.players.length===8,'eight seats');
  const ninth=world();ninth.join('Ninth',link);await until(()=>ninth.data().status==='error','full room');assert.match(ninth.data().error,/full/);
  host.choose('rock-paper-scissors');await until(()=>guest.data().snapshot.gameId==='rock-paper-scissors','eight-player choice');
  for(const r of [guest,...others])r.ready(true);await until(()=>host.data().snapshot.players.every(p=>p.ready),'all ready');host.start();await until(()=>others.every(r=>r.data().snapshot.phase==='playing'),'eight player start');
  console.log('PASS eight-player party, capacity refusal and synchronized multiplayer start.');
  host.leave();await until(()=>[guest,...others].every(r=>r.data().status==='ended'),'host closure');
  const absent=world();absent.join('Late',link);await until(()=>absent.data().status==='error','closed party');assert.match(absent.data().error,/not open/);
  console.log('PASS party closure and expired link errors.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(()=>{worlds.forEach(r=>r.leave());setTimeout(()=>process.exit(process.exitCode||0),250);});
