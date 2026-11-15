import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';

import {codexBinary,statePath} from './config.mjs';

export class LocalModelReader{
 constructor(){this.counter=0;this.pending=new Map();this.proc=null;this.buffer=''}
 async connect(){
  if(this.ready)return this.ready;
  this.ready=(async()=>{
   const proc=spawn(codexBinary,['app-server','--stdio'],{stdio:['pipe','pipe','pipe']});this.proc=proc;
   proc.stderr.on('data',()=>{});proc.on('error',e=>this.closed(e,proc));proc.on('exit',()=>this.closed(new Error('模型目录连接已关闭'),proc));
   proc.stdout.on('data',chunk=>{this.buffer+=chunk;let at;while((at=this.buffer.indexOf('\n'))>=0){const line=this.buffer.slice(0,at);this.buffer=this.buffer.slice(at+1);let r;try{r=JSON.parse(line)}catch{continue}const p=this.pending.get(r.id);if(!p)continue;this.pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(new Error(r.error.message)):p.resolve(r.result)}});
   await this.call('initialize',{clientInfo:{name:'codex_bridge_model_catalog',version:'0.4.0'},capabilities:{experimentalApi:true}});proc.stdin.write(JSON.stringify({method:'initialized',params:{}})+'\n');
  })();try{await this.ready}catch(e){this.ready=null;throw e}
 }
 closed(error,proc){if(proc!==this.proc)return;this.proc=null;this.ready=null;this.buffer='';for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(error)}this.pending.clear()}
 call(method,params){const id=String(++this.counter);return new Promise((resolve,reject)=>{const timer=setTimeout(()=>{this.pending.delete(id);reject(new Error('读取模型目录超时'))},15000);this.pending.set(id,{resolve,reject,timer});this.proc.stdin.write(JSON.stringify({id,method,params})+'\n')})}
 close(){this.proc?.kill('SIGTERM')}
}
export function validateChoice(models,model,effort){
 const selected=models.find(m=>m.model===model);if(!selected)throw Object.assign(new Error('该设备不支持这个模型，请刷新模型列表'),{status:400});
 if(effort!==null&&!selected.efforts.includes(effort))throw Object.assign(new Error('所选模型不支持该思考强度'),{status:400});
 return selected;
}
export class ModelSettings{
 constructor({catalog,clients,desktopIpc,connected,path=statePath('model-settings.json')}){Object.assign(this,{catalog,clients,desktopIpc,connected,path});this.local=new LocalModelReader();this.models=new Map();this.pending={};try{this.pending=JSON.parse(readFileSync(path,'utf8'))}catch{}}
 host(id){const host=this.catalog.get(id);if(!host)throw Object.assign(new Error('未知设备'),{status:400});return host}
 persist(){if(this.path)writeFileSync(this.path,JSON.stringify(this.pending),{mode:0o600})}
 async list(host){
  this.host(host);let cached=this.models.get(host);if(cached&&Date.now()-cached.at<300000)return cached.promise;
  const promise=(async()=>{const c=this.clients.has(host)?await this.connected(host):this.local;if(c===this.local)await c.connect();let cursor=null,rows=[];for(;;){const r=await c.call('model/list',{limit:100,includeHidden:false,...(cursor?{cursor}:{})});rows.push(...(r.data||[]));cursor=r.nextCursor;if(!cursor)break}return rows.map(m=>({model:m.model,name:m.displayName||m.model,efforts:(m.supportedReasoningEfforts||[]).map(e=>e.reasoningEffort),defaultEffort:m.defaultReasoningEffort,isDefault:m.isDefault}));})();
  this.models.set(host,{at:Date.now(),promise});promise.catch(()=>this.models.delete(host));return promise;
 }
 async owner(host,id){const h=this.host(host);try{const r=await this.desktopIpc.request('thread-owner-discovery',{conversationId:id,hostId:h.hostId},{timeout:1200});return r.handledByClientId}catch{return null}}
 async read(host,id,knownOwner){
  const h=this.host(host),owner=knownOwner===undefined?await this.owner(host,id):knownOwner;
  if(owner){const r=await this.desktopIpc.request('thread-follower-read-model-settings',{conversationId:id},{targetClientId:owner,...(h.hostId==='local'?{}:{hostId:h.hostId})});const s=r.result?.settings;if(s)return {model:s.model||null,effort:s.reasoningEffort??null,readable:true}}
  if(this.clients.has(host)){const c=await this.connected(host),r=await c.call('thread/resume',{threadId:id,excludeTurns:true});if(r.thread?.id!==id)throw new Error('原会话 ID 不一致');return {model:r.model||null,effort:r.reasoningEffort??null,readable:true}}
  return {model:null,effort:null,readable:false};
 }
 async get(host,id){const [models,actual]=await Promise.all([this.list(host),this.read(host,id)]),key=host+':'+id;let pending=this.pending[key];if(pending&&actual.readable){delete this.pending[key];this.persist();pending=null}return {models,settings:pending?{...pending,readable:false}:actual,pending:!!pending}}
 async set(host,id,{model,effort=null,clear=false}){
  const key=host+':'+id;if(clear){delete this.pending[key];this.persist();return {ok:true,...await this.get(host,id)}}
  validateChoice(await this.list(host),model,effort);const h=this.host(host),owner=await this.owner(host,id);
  if(owner){const r=await this.desktopIpc.request('thread-follower-update-thread-settings',{conversationId:id,threadSettings:{model,effort}},{targetClientId:owner,...(h.hostId==='local'?{}:{hostId:h.hostId})});if(r.result?.applied!==true)throw new Error('电脑端配置未应用，请刷新后重试')}
  else if(this.clients.has(host)){const c=await this.connected(host),r=await c.call('thread/resume',{threadId:id,excludeTurns:true});if(r.thread?.id!==id)throw new Error('原会话 ID 不一致');await c.call('thread/settings/update',{threadId:id,model,effort})}
  else{this.pending[key]={model,effort};this.persist();return {ok:true,pending:true,settings:{model,effort,readable:false}}}
  delete this.pending[key];this.persist();return {ok:true,pending:false,settings:await this.read(host,id,owner)};
 }
 async forMessage(host,id){const p=this.pending[host+':'+id];if(!p)return {};const model=validateChoice(await this.list(host),p.model,p.effort);return {model:p.model,thinking:p.effort??model.defaultEffort}}
 sent(host,id){const key=host+':'+id;if(this.pending[key]){delete this.pending[key];this.persist()}}
 close(){this.local.close()}
}
