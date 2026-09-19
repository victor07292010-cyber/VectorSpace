"use strict";
// The host alone holds the full game state. Each guest gets its own redacted view.
window.RoomGames = (() => {
  const games = Object.create(null);
  return {games, register(id, engine) {games[id] = engine;}};
})();
window.GameNightRoom = (() => {
  const VERSION=2, PREFIX='gamenight-v2-', MAX_PLAYERS=8;
  const listeners=new Set(), connections=new Map();
  let peer=null, hostConnection=null, host=false, room=null, snapshot=null;
  let code='', playerToken='', myId='', status='idle', error='', generation=0, revision=0;
  let timeout=null, heartbeat=null, retryTimer=null, retries=0, moveSequence=0, joiningName='';
  const stored=(key,fallback='')=>{try{return sessionStorage.getItem(key)||fallback;}catch{return fallback;}};
  const persist=(key,value)=>{try{sessionStorage.setItem(key,value);}catch{}};
  const uid=()=>{const values=new Uint8Array(16);crypto.getRandomValues(values);return Array.from(values,x=>x.toString(16).padStart(2,'0')).join('');};
  const roomCode=()=>{const chars='ABCDEFGHJKLMNPQRSTUVWXYZ23456789',values=new Uint8Array(6);crypto.getRandomValues(values);return Array.from(values,v=>chars[v%chars.length]).join('');};
  const cleanName=name=>String(name||'').replace(/[\u0000-\u001f\u007f]/g,'').trim().slice(0,20)||'Player';
  const publicPlayer=p=>({id:p.id,name:p.name,ready:p.ready,connected:p.connected,host:p.host,wins:p.wins||0});
  const notify=()=>listeners.forEach(fn=>fn());
  function data(){return {status,error,code,isHost:host,myId,snapshot};}
  function safeSend(conn,message){if(!conn?.open)return false;try{conn.send(message);return true;}catch{return false;}}
  function makeSnapshot(viewer){
    const member=room.players.find(p=>p.id===viewer), engine=RoomGames.games[room.gameId];
    const gameIndex=room.matchPlayers.findIndex(p=>p.id===viewer);
    return {version:VERSION,code,revision,epoch:room.epoch,phase:room.phase,gameId:room.gameId,
      players:room.players.map(publicPlayer),me:viewer,gameIndex,
      matchPlayers:room.matchPlayers.map(publicPlayer),
      paused:room.phase==='playing'&&room.matchPlayers.some(p=>!room.players.find(m=>m.id===p.id)?.connected),
      game:room.state&&gameIndex>=0?engine.view(room.state,gameIndex):null,
      done:!!room.state?.done,reactions:room.reactions.slice(-8)};
  }
  function publish(){
    if(!host||!room)return;
    revision++;snapshot=makeSnapshot(myId);status='connected';notify();
    for(const [id,conn] of connections)safeSend(conn,{kind:'snapshot',data:makeSnapshot(id)});
  }
  function stop(grace=0){
    generation++;clearTimeout(timeout);clearInterval(heartbeat);clearTimeout(retryTimer);
    timeout=heartbeat=retryTimer=null;
    const oldConnections=[...connections.values(),hostConnection].filter(Boolean),oldPeer=peer;
    connections.clear();hostConnection=null;peer=null;
    const close=()=>{oldConnections.forEach(c=>c.close());oldPeer?.destroy();};
    if(grace)setTimeout(close,grace);else close();
  }
  function leave(){
    if(host){connections.forEach(c=>safeSend(c,{kind:'ended'}));}
    else safeSend(hostConnection,{kind:'leave'});
    stop(150);host=false;room=null;snapshot=null;status='idle';error='';code='';myId='';retries=0;persist('gn-room-code','');notify();
  }
  function fail(message){status='error';error=message;clearTimeout(timeout);notify();}
  function errorText(err){
    if(err.type==='peer-unavailable')return 'That room is not open. Check the code and ask the host to keep their room open.';
    if(err.type==='browser-incompatible')return 'Your browser cannot make this connection. Try a recent version of Chrome, Edge, Firefox, or Safari.';
    if(err.type==='network'||err.type==='server-error'||err.type==='socket-error')return 'Could not reach the room service. Check your internet connection, then try again.';
    return 'The connection could not be completed. Try again, or switch networks if this one blocks game connections.';
  }
  function options(){return {debug:0,secure:true,pingInterval:5000,...(window.GAME_NIGHT_PEER_OPTIONS||{})};}
  function validMessage(m){return !!m&&typeof m==='object'&&!Array.isArray(m)&&typeof m.kind==='string'&&JSON.stringify(m).length<16000;}
  function paused(){return room?.phase==='playing'&&room.matchPlayers.some(p=>!room.players.find(m=>m.id===p.id)?.connected);}
  function command(playerId,m){
    if(!room||!validMessage(m))return;
    const member=room.players.find(p=>p.id===playerId);if(!member?.connected)return;
    if(m.kind==='ready'&&room.phase==='lobby'){member.ready=!!m.ready;publish();}
    if(m.kind==='reaction'&&['👏','😂','😮','🎉','🤔','💛'].includes(m.emoji)){
      if(Date.now()-(member.lastReaction||0)<1500)return;
      member.lastReaction=Date.now();room.reactions.push({id:uid().slice(0,8),name:member.name,emoji:m.emoji,at:Date.now()});room.reactions=room.reactions.slice(-8);publish();
    }
    if(m.kind==='move'&&room.phase==='playing'&&!room.state.done&&!paused()){
      if(m.epoch!==room.epoch||!m.action||typeof m.action!=='object'||Array.isArray(m.action))return;
      if(!Number.isSafeInteger(m.seq)||m.seq<=member.lastSeq)return;
      member.lastSeq=m.seq;
      const flexible = RoomGames.games[room.gameId].concurrentActions?.includes(m.action.type);
      if(m.revision!==revision&&!flexible){safeSend(connections.get(playerId),{kind:'snapshot',data:makeSnapshot(playerId)});safeSend(connections.get(playerId),{kind:'notice',text:'The table changed. Please try that move again.'});if(playerId===myId){error='The table changed. Try that move again.';notify();}return;}
      const index=room.matchPlayers.findIndex(p=>p.id===playerId);if(index<0)return;
      const engine=RoomGames.games[room.gameId];
      try{
        const copy=JSON.parse(JSON.stringify(room.state));
        if(!engine.act(copy,index,m.action)){if(playerId===myId){error='That move is not available right now.';notify();}else safeSend(connections.get(playerId),{kind:'notice',text:'That move is not available right now.'});return;}
        room.state=copy;error='';
        if(copy.done){for(const winner of new Set(copy.winners||[])){const p=room.players.find(p=>p.id===room.matchPlayers[winner]?.id);if(p)p.wins++;}}
        publish();
      }catch(e){console.error('Game action failed',e);if(playerId===myId){error='That move could not be completed. Please try another move.';notify();}else safeSend(connections.get(playerId),{kind:'notice',text:'That move could not be completed. Please try another move.'});}
    }
  }
  function disconnectMember(id,conn,explicit=false){
    if(connections.get(id)!==conn)return;
    connections.delete(id);const member=room?.players.find(p=>p.id===id);if(!member)return;
    if(room.phase==='lobby'&&explicit){room.players=room.players.filter(p=>p.id!==id);}
    else {member.connected=false;member.ready=false;member.left=explicit;
      const gen=generation;
      if(room.phase==='lobby')setTimeout(()=>{if(gen===generation&&room?.phase==='lobby'&&!member.connected){room.players=room.players.filter(p=>p.id!==id);publish();}},30000);
    }
    publish();
  }
  function accept(conn,gen){
    if(gen!==generation){conn.close();return;}
    let admitted=null,lastPacket=0,burst=0;
    const wait=setTimeout(()=>{if(!admitted)conn.close();},10000);
    conn.on('open',()=>{
      if(gen!==generation)return;
      const meta=conn.metadata||{};
      const reject=text=>{safeSend(conn,{kind:'rejected',text});setTimeout(()=>conn.close(),300);clearTimeout(wait);};
      if(meta.version!==VERSION||!/^[a-f0-9]{32}$/.test(meta.token||'')){reject('Your game version does not match the host. Refresh both devices.');return;}
      let member=room.players.find(p=>p.token===meta.token);
      if(!member&&room.phase!=='lobby'){reject('This game has already started. Ask the host to return to the lobby.');return;}
      if(!member&&room.players.length>=MAX_PLAYERS){reject('This room is full. A room holds up to eight people.');return;}
      if(member?.host){reject('That seat is unavailable. Open a fresh tab to join.');return;}
      if(!member){member={id:uid(),token:meta.token,name:cleanName(meta.name),ready:false,connected:true,host:false,wins:0,lastSeq:0};room.players.push(member);}
      const old=connections.get(member.id);connections.set(member.id,conn);old?.close();
      member.connected=true;member.lastSeen=Date.now();member.lastSeq=0;admitted=member.id;clearTimeout(wait);publish();
    });
    conn.on('data',m=>{
      if(gen!==generation||!admitted||connections.get(admitted)!==conn||!validMessage(m))return;
      const now=Date.now();if(now-lastPacket>1000){burst=0;lastPacket=now;}if(++burst>30)return;
      const member=room.players.find(p=>p.id===admitted);if(member)member.lastSeen=now;
      if(m.kind==='pong')return;
      if(m.kind==='leave'){disconnectMember(admitted,conn,true);conn.close();return;}
      command(admitted,m);
    });
    conn.on('close',()=>{clearTimeout(wait);if(gen===generation&&admitted)disconnectMember(admitted,conn);});
    conn.on('error',()=>{clearTimeout(wait);if(gen===generation&&admitted)disconnectMember(admitted,conn);});
  }
  function create(name,preferred='color-clash'){
    leave();host=true;status='connecting';error='';joiningName=cleanName(name);playerToken=uid();myId=uid();code=roomCode();
    const gen=generation;
    room={players:[{id:myId,token:playerToken,name:joiningName,ready:true,connected:true,host:true,wins:0,lastSeq:0}],phase:'lobby',gameId:RoomGames.games[preferred]?preferred:'color-clash',matchPlayers:[],state:null,epoch:uid(),reactions:[]};
    notify();
    if(typeof Peer!=='function'){fail('The connection library did not load. Refresh the page and try again.');return;}
    let attempts=0;
    function open(){
      peer=new Peer(PREFIX+code,options());
      peer.on('open',()=>{if(gen!==generation)return;clearTimeout(timeout);error='';publish();});
      peer.on('connection',c=>accept(c,gen));
      peer.on('error',err=>{if(gen!==generation)return;if(err.type==='unavailable-id'&&attempts++<4){peer.destroy();code=roomCode();open();return;}if(!snapshot)fail(errorText(err));else{error='New guests cannot connect right now. Existing players can keep playing.';notify();}});
      peer.on('disconnected',()=>{if(gen!==generation)return;error='Room service connection interrupted. Reconnecting…';notify();retryTimer=setTimeout(()=>{if(peer?.disconnected&&!peer.destroyed)peer.reconnect();},2000);});
    }
    open();timeout=setTimeout(()=>{if(gen===generation&&status==='connecting')fail('The room service took too long to respond. Please check your connection and try again.');},22000);
    heartbeat=setInterval(()=>{if(gen!==generation||!room)return;for(const [id,conn]of connections){const member=room.players.find(p=>p.id===id);if(Date.now()-(member?.lastSeen||Date.now())>30000){disconnectMember(id,conn);conn.close();}else safeSend(conn,{kind:'ping'});}},5000);
  }
  function join(name,inputCode,resuming=false){
    const normalized=String(inputCode||'').toUpperCase().replace(/[\s-]/g,'');
    if(!/^[A-HJ-NP-Z2-9]{6}$/.test(normalized)){fail('Enter the six-character room code from your host.');return;}
    const previous=stored('gn-room-code');const token=previous===normalized?stored('gn-player-token'):'';
    stop();host=false;room=null;hostConnection=null;code=normalized;joiningName=cleanName(name);playerToken=token||uid();myId='';if(!resuming){snapshot=null;retries=0;}
    status=resuming?'reconnecting':'connecting';error='';moveSequence=0;persist('gn-room-code',code);persist('gn-player-token',playerToken);notify();
    const gen=generation;
    if(typeof Peer!=='function'){fail('The connection library did not load. Refresh the page and try again.');return;}
    peer=new Peer(undefined,options());
    peer.on('open',()=>{
      if(gen!==generation)return;
      if(hostConnection?.open) return;
      hostConnection=peer.connect(PREFIX+code,{reliable:true,serialization:'json',metadata:{version:VERSION,name:joiningName,token:playerToken}});
      hostConnection.on('data',m=>{
        if(gen!==generation||!m||typeof m!=='object')return;
        if(m.kind==='snapshot'&&m.data?.version===VERSION&&m.data.code===code){clearTimeout(timeout);snapshot=m.data;myId=snapshot.me;status='connected';error='';retries=0;notify();}
        if(m.kind==='ping')safeSend(hostConnection,{kind:'pong'});
        if(m.kind==='notice'){error=String(m.text||'').slice(0,200);notify();}
        if(m.kind==='rejected'){fail(String(m.text||'Could not join this room.').slice(0,200));}
        if(m.kind==='ended'){stop();status='ended';error='The host closed the room. You can create a new room or join another one.';notify();}
      });
      hostConnection.on('close',()=>{if(gen!==generation||status==='ended'||status==='error')return;reconnect();});
      hostConnection.on('error',()=>{if(gen===generation&&status!=='error')reconnect();});
    });
    peer.on('error',err=>{if(gen!==generation)return;if(snapshot&&retries<5){reconnect();}else fail(errorText(err));});
    peer.on('disconnected',()=>{if(gen===generation&&hostConnection?.open){try{peer.reconnect();}catch{}}});
    timeout=setTimeout(()=>{if(gen===generation&&status!=='connected')fail('Could not connect to the host. Check the code, keep the host’s tab open, or try another network. Some school, work, and mobile networks block direct connections.');},22000);
  }
  function reconnect(){
    if(retryTimer)return;
    if(retries>=5){fail('The host is disconnected. Ask them to keep their room open, then retry.');return;}
    status='reconnecting';error='Connection lost. Rejoining your seat…';notify();const attempt=++retries,gen=generation;
    clearTimeout(timeout);
    retryTimer=setTimeout(()=>{retryTimer=null;if(gen!==generation)return;join(joiningName,code,true);retries=attempt;},Math.min(1000*2**(attempt-1),8000));
  }
  function send(message){if(host)command(myId,message);else if(!safeSend(hostConnection,message)){error='Still reconnecting. Your move has not been sent.';notify();}}
  function choose(id){if(!host||room?.phase!=='lobby'||!RoomGames.games[id])return;room.gameId=id;room.players.forEach(p=>p.ready=p.host);error='';publish();}
  function start(){
    if(!host||!room)return;
    const engine=RoomGames.games[room.gameId],players=room.players.filter(p=>p.connected);
    if(players.length<engine.min||players.length>engine.max){error=`${engine.title} needs ${engine.min===engine.max?engine.min:engine.min+'–'+engine.max} players.`;notify();return;}
    if(room.phase==='lobby'&&players.some(p=>!p.ready)){error='Waiting for everyone to press Ready.';notify();return;}
    room.matchPlayers=players.map(publicPlayer);room.state=engine.create(room.matchPlayers);room.phase='playing';room.epoch=uid();error='';publish();
  }
  function backToLobby(){if(!host||!room)return;room.phase='lobby';room.state=null;room.matchPlayers=[];room.players=room.players.filter(p=>p.connected);room.players.forEach(p=>p.ready=p.host);room.epoch=uid();error='';publish();}
  function move(action){if(status!=='connected'||!snapshot||snapshot.paused)return;send({kind:'move',action,seq:++moveSequence,epoch:snapshot.epoch,revision:snapshot.revision});}
  function ready(value){send({kind:'ready',ready:value});}
  function react(emoji){send({kind:'reaction',emoji});}
  function retry(){retries=0;if(host)create(joiningName,room?.gameId);else join(joiningName,code,true);}
  function subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);}
  window.addEventListener('beforeunload',e=>{if(status==='connected'&&host&&room?.players.length>1){e.preventDefault();e.returnValue='';}});
  window.addEventListener('pagehide',()=>{if(host)connections.forEach(c=>safeSend(c,{kind:'ended'}));else safeSend(hostConnection,{kind:'leave'});});
  return {data,create,join,leave,subscribe,choose,start,backToLobby,move,ready,react,retry,cleanName};
})();
