"use strict";
// The existing host-authoritative game protocol runs over server WebSockets.
// No WebRTC, ICE, TURN keys, or inbound connections to a player's computer.
(() => {
  class Events {
    constructor(){this.handlers=new Map();}
    on(type,fn){const list=this.handlers.get(type)||[];list.push(fn);this.handlers.set(type,list);return this;}
    emit(type,...args){for(const fn of this.handlers.get(type)||[])fn(...args);}
  }
  class Channel extends Events {
    constructor(peer,id,metadata){super();this.peer=peer;this.id=id;this.metadata=metadata;this.open=false;this.closed=false;}
    send(payload){if(!this.open)throw Error('Party connection is closed');this.peer.send({kind:'data',to:this.id,payload});}
    finish(){if(this.closed)return;this.closed=true;this.open=false;this.emit('close');}
    close(){if(this.closed)return;if(this.peer.isHost)this.peer.send({kind:'close',to:this.id});else this.peer.socket?.close();this.finish();}
  }
  window.VectorSpacePeer=class extends Events {
    constructor(id){
      super();this.isHost=!!id;this.id=id;this.destroyed=false;this.disconnected=false;this.channels=new Map();
      if(id)setTimeout(()=>this.open(id.replace(/^gamenight-v2-/,'')),0);
      else setTimeout(()=>{if(!this.destroyed)this.emit('open');},0);
    }
    send(message){if(this.socket?.readyState===1)this.socket.send(JSON.stringify(message));}
    open(code){
      if(this.destroyed)return;
      const endpoint=window.VECTORSPACE_PARTY_SERVER;
      if(!endpoint){this.emit('error',{type:'service-unconfigured'});return;}
      let socket;
      try{socket=new WebSocket(endpoint.replace(/\/$/,'')+'/room/'+code+'?role='+(this.isHost?'host':'guest'));}
      catch{this.emit('error',{type:'network'});return;}
      this.socket=socket;
      socket.onmessage=event=>{
        if(this.destroyed)return;
        let m;try{m=JSON.parse(event.data);}catch{return;}
        if(m.kind==='error'){this.failed=true;this.emit('error',{type:m.type});return;}
        if(m.kind==='welcome'){
          this.disconnected=false;
          if(this.isHost)this.emit('open',this.id);
          else this.send({kind:'hello',metadata:this.channel.metadata});
        }
        if(m.kind==='connection'&&this.isHost){
          const c=new Channel(this,m.id,m.metadata);this.channels.set(m.id,c);
          this.emit('connection',c);c.open=true;c.emit('open');this.send({kind:'accepted',to:m.id});
        }
        if(m.kind==='accepted'&&!this.isHost&&!this.channel.closed){this.channel.open=true;this.channel.emit('open');}
        if(m.kind==='data'){
          const c=this.isHost?this.channels.get(m.id):this.channel;
          // A host's initial snapshot can precede the handshake acknowledgement.
          if(c&&!c.closed)c.emit('data',m.payload);
        }
        if(m.kind==='close'){this.channels.get(m.id)?.finish();this.channels.delete(m.id);}
        if(m.kind==='ended'){this.channel?.emit('data',{kind:'ended'});}
      };
      socket.onerror=()=>{if(!this.destroyed&&!this.failed){this.failed=true;this.emit('error',{type:'network'});}};
      socket.onclose=()=>{
        if(this.destroyed)return;
        this.disconnected=true;
        if(this.isHost&&!this.failed)this.emit('error',{type:'relay-lost'});
        if(!this.isHost)this.channel?.finish();
      };
    }
    connect(id,options){this.channel=new Channel(this,'host',options.metadata);this.open(id.replace(/^gamenight-v2-/,''));return this.channel;}
    destroy(){if(this.destroyed)return;this.destroyed=true;this.socket?.close();for(const c of this.channels.values())c.finish();this.channels.clear();this.channel?.finish();}
    reconnect(){/* A closed relay connection is retried by the room controller. */}
  };
})();
