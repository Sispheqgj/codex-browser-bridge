import {readFileSync,writeFileSync,renameSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {readDesktopProjects,withProjects} from './projects.mjs';
import {config,statePath} from './config.mjs';
const cachePath=statePath('catalog.json');
const known=Object.fromEntries(config.remotes.map(h=>[h.host,[h.id,h.name||h.host]]));
export function discoverHosts(state=readDesktopProjects()){
 const result=[{id:'mac',name:'这台 Mac',host:'local',hostId:'local',kind:'local'}];
 const ids=new Set((state['remote-projects']||[]).map(p=>p.hostId));
 for(const alias of Object.keys(known))ids.add('remote-ssh-discovered:'+alias);
 for(const p of state['codex-managed-remote-connections']||[])if(p.hostId)ids.add(p.hostId);
 for(const hostId of ids){if(typeof hostId!=='string'||!hostId.startsWith('remote-ssh-discovered:'))continue;const host=hostId.slice('remote-ssh-discovered:'.length),[id,name]=known[host]||['remote-'+createHash('sha256').update(hostId).digest('hex').slice(0,12),host];result.push({id,name,host,hostId,kind:'remote'})}
 return result.sort((a,b)=>{const rank=h=>h.id==='mac'?0:config.remotes.some(r=>r.id===h.id)?1:2;return rank(a)-rank(b)});
}
export class Catalog{
 constructor(desktop,notify,{path=cachePath}={}){this.cachePath=path;this.desktop=desktop;this.notify=notify;this.cache={};this.inflight=new Map();this.working=0;this.jobs=[];try{this.cache=JSON.parse(readFileSync(this.cachePath,'utf8'))}catch{}}
 hosts(){return discoverHosts()}
 get(id){return this.hosts().find(h=>h.id===id)}
 view(archived=false){
  const key=archived?'archived':'active',hostList=this.hosts();
  return {hosts:withProjects(hostList.map(h=>({...h,online:false,threads:[],loading:true,...this.cache[key]?.[h.id],...h}))),cached:true,updatedAt:Math.max(0,...hostList.map(h=>this.cache[key]?.[h.id]?.fetchedAt||0))};
 }
 refresh(archived=false,force=false){for(const h of this.hosts())this.schedule(h,archived,force)}
 schedule(host,archived,force){
  const key=(archived?'archived:':'active:')+host.id;if(this.inflight.has(key))return this.inflight.get(key);
  const saved=this.cache[archived?'archived':'active']?.[host.id];if(!force&&saved&&Date.now()-saved.fetchedAt<(saved.online?20000:120000))return;
  const promise=new Promise(resolve=>this.jobs.push({host,archived,key,resolve}));this.inflight.set(key,promise);this.drain();return promise;
 }
 drain(){while(this.working<2&&this.jobs.length){const job=this.jobs.shift();this.working++;this.fetchHost(job.host,job.archived).finally(()=>{this.working--;this.inflight.delete(job.key);job.resolve();this.drain()})}}
 async fetchHost(host,archived){
  const section=archived?'archived':'active';let result;
  try{
   let cursor=null,rows=new Map(),seen=new Set();for(;;){
    const r=await this.desktop.call('list_threads',{mode:'history',source:'codex',hostId:host.hostId,archived,limit:50,...(cursor?{cursor}:{})},15000);
    for(const t of r.threads||[])rows.set(t.id,{id:t.id,name:t.title||t.preview||'未命名会话',cwd:t.cwd||'',status:typeof t.status==='string'?{type:t.status}:t.status,updatedAt:t.updatedAt,projectId:t.projectId||null,host:host.id});
    cursor=r.nextCursor;if(!cursor)break;if(seen.has(cursor))throw new Error('会话分页游标未推进，请稍后刷新');seen.add(cursor);
   }
   result={online:true,loading:false,threads:[...rows.values()],fetchedAt:Date.now()};
  }catch(e){result={...(this.cache[section]?.[host.id]||{threads:[]}),online:false,loading:false,error:e.message.slice(0,300),fetchedAt:Date.now()}}
  this.cache[section]||={};this.cache[section][host.id]=result;
  try{if(this.cachePath){writeFileSync(this.cachePath+'.tmp',JSON.stringify(this.cache),{mode:0o600});renameSync(this.cachePath+'.tmp',this.cachePath)}}catch{}
  this.notify({method:'catalog/updated',host:host.id,archived});
 }
}
