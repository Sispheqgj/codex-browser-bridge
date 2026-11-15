import {spawn} from 'node:child_process';
import {Duplex} from 'node:stream';
import {EventEmitter} from 'node:events';
import WebSocket from 'ws';
import {config,sshArguments} from './config.mjs';
export class CodexConnection extends EventEmitter {
  constructor(host,remote=config.remotes.find(r=>r.host===host)) { super(); if(!remote)throw new Error('请配置远程 SSH 连接');this.remote=remote;this.host=host; this.nextId=1; this.pending=new Map(); this.requests=new Map(); this.proc=null; this.ws=null; this.ready=null; this.stderr=''; }
  async connect() {if(this.ready)return this.ready;this.ready=this.open().catch(e=>{this.ready=null;throw e});return this.ready}
  async open() {
    const proc=spawn('/usr/bin/ssh',sshArguments(this.remote),{stdio:['pipe','pipe','pipe']});this.proc=proc;
    proc.stderr.on('data',b=>{this.stderr=(this.stderr+b.toString()).slice(-4000)});
    proc.on('error',e=>this.disconnected(e,proc));proc.on('exit',()=>this.disconnected(new Error('SSH connection closed'),proc));
    const stream=Duplex.from({readable:proc.stdout,writable:proc.stdin});this.stream=stream;
    const ws=new WebSocket('ws://localhost/',{createConnection:()=>stream,handshakeTimeout:20000,perMessageDeflate:false});this.ws=ws;
    ws.on('message',raw=>{try{this.handle(JSON.parse(raw.toString()))}catch(e){this.emit('transportError',new Error('Invalid app-server response'))}});
    ws.on('error',e=>this.disconnected(e,proc));ws.on('close',()=>this.disconnected(new Error('App-server disconnected'),proc));
    await new Promise((resolve,reject)=>{ws.once('open',resolve);ws.once('error',reject);proc.once('exit',()=>reject(new Error('SSH proxy closed: '+this.stderr.slice(-500))))});
    const info=await this.call('initialize',{clientInfo:{name:'codex_browser_bridge',title:'Codex Browser Bridge',version:'0.1.0'},capabilities:{experimentalApi:true}},20000);
    this.send({method:'initialized',params:{}});this.info=info;this.initialized=true;return info;
  }
  disconnected(error,proc){if(proc&&proc!==this.proc)return;const owned=this.proc;this.proc=null;this.ready=null;this.initialized=false;this.requests.clear();this.ws?.terminate();this.stream?.destroy();if(owned?.exitCode===null)owned.kill('SIGTERM');for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear();this.emit('disconnected',error.message)}
  handle(msg){
    if(msg.id!==undefined&&msg.method){this.requests.set(String(msg.id),msg);this.emit('serverRequest',msg);return}
    if(msg.id!==undefined){const p=this.pending.get(String(msg.id));if(!p)return;clearTimeout(p.timer);this.pending.delete(String(msg.id));msg.error?p.reject(Object.assign(new Error(msg.error.message),{rpc:msg.error})):p.resolve(msg.result);return}
    if(msg.method==='serverRequest/resolved')this.requests.delete(String(msg.params?.requestId));
    if(msg.method)this.emit('notification',msg);
  }
  send(obj){if(this.ws?.readyState!==WebSocket.OPEN)throw new Error('App-server disconnected');this.ws.send(JSON.stringify(obj))}
  call(method,params={},timeout=20000){const id=String(this.nextId++);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error(method+' timed out'))},timeout);this.pending.set(id,{resolve,reject,timer});try{this.send({id,method,params})}catch(e){clearTimeout(timer);this.pending.delete(id);reject(e)}})}
  answer(id,result){if(!this.requests.has(String(id)))throw new Error('Request already resolved');this.send({id:this.requests.get(String(id)).id,result});this.requests.delete(String(id))}
  close(){this.ready=null;this.ws?.terminate();this.stream?.destroy();this.proc?.stdin.end();this.proc?.kill('SIGTERM')}
}
