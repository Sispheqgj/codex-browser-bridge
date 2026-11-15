import http from 'node:http';
import {readFileSync,statSync} from 'node:fs';
import {extname} from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {validBearer,validSession,createSession,sessionCookie} from './auth.mjs';
import {gzipSync} from 'node:zlib';
import {withProjects} from './projects.mjs';
import {CodexConnection} from './rpc.mjs';
import {DesktopTools} from './desktop.mjs';
import {DesktopIpc} from './desktop-ipc.mjs';
import {Catalog} from './catalog.mjs';
import {ModelSettings} from './model-settings.mjs';
import {config,statePath,getToken} from './config.mjs';
const PUBLIC=config.publicOrigin;
const ALLOWED_ORIGINS=new Set([PUBLIC,'http://127.0.0.1:'+config.port]);
const HOSTS=config.remotes;
const clients=new Map();const viewers=new Set();const submissions=new Map();
function broadcast(data){for(const s of viewers){if(!s.destroyed)s.write('data: '+JSON.stringify(data)+'\n\n')}}
const desktop=new DesktopTools(),desktopIpc=new DesktopIpc(),catalog=new Catalog(desktop,broadcast);
const nativeReads=new Map(),nativeEvents=new Map();
const modelSettings=new ModelSettings({catalog,clients,desktopIpc,connected});
desktopIpc.on('broadcast',m=>{if(m.method!=='thread-stream-state-changed')return;const p=m.params,h=catalog.hosts().find(h=>h.hostId===(p.hostId||'local'));if(!h)return;const key=h.id+':'+p.conversationId;if(Date.now()-(nativeEvents.get(key)||0)<650)return;nativeEvents.set(key,Date.now());nativeReads.delete(key);broadcast({method:'native/updated',host:h.id,threadId:p.conversationId})});
function nativeHost(id){const h=catalog.get(id);if(!h)throw Object.assign(new Error('未知设备'),{status:400});return h}
function safeError(e){return String(e?.message||e).slice(0,500)}
for(const h of HOSTS){
 const c=new CodexConnection(h.host,h);c.subscribed=new Set();c.epoch=0;c.connectingThreads=new Map();c.summary=null;c.lastEvent=0;
 c.on('notification',m=>{if(m.method==='thread/closed')c.subscribed.delete(m.params?.threadId);if(Date.now()-c.lastEvent>150||m.method==='turn/completed'||m.method==='serverRequest/resolved'){c.lastEvent=Date.now();broadcast({host:h.id,method:m.method,threadId:m.params?.threadId||m.params?.thread?.id})}});
 c.on('serverRequest',m=>broadcast({host:h.id,method:'request',threadId:m.params?.threadId||m.params?.conversationId}));
 c.on('disconnected',error=>{c.subscribed.clear();c.connectingThreads.clear();c.summary=null;c.epoch++;broadcast({host:h.id,method:'disconnected',error})});
 c.on('transportError',error=>console.error(h.id,safeError(error)));
 clients.set(h.id,c);
}
function credential(){return getToken()}
function authenticated(req){const key=credential();return validBearer(req,key)||validSession(req,key)}
function json(res,status,data){const payload=Buffer.from(JSON.stringify(data));const zipped=payload.length>4096&&res.req.headers['accept-encoding']?.includes('gzip');res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store',...(zipped?{'Content-Encoding':'gzip','Vary':'Accept-Encoding'}:{})});res.end(zipped?gzipSync(payload,{level:1}):payload)}
async function body(req){let size=0,s='';for await(const b of req){size+=b.length;if(size>262144)throw Object.assign(new Error('消息过长'),{status:413});s+=b.toString()}return JSON.parse(s||'{}')}
function hostClient(id){const c=clients.get(id);if(!c)throw Object.assign(new Error('未知服务器'),{status:400});return c}
function threadId(id){if(!/^[a-zA-Z0-9_-]{12,100}$/.test(id||''))throw Object.assign(new Error('无效会话 ID'),{status:400});return id}
async function connected(id){const c=hostClient(id);await c.connect();return c}
async function subscribe(c,id){if(c.subscribed.has(id))return;if(c.connectingThreads.has(id))return c.connectingThreads.get(id);const p=(async()=>{const r=await c.call('thread/resume',{threadId:id,excludeTurns:true},30000);if(r.thread?.id!==id)throw new Error('原会话 ID 不一致，已停止接入');c.subscribed.add(id);return r})();c.connectingThreads.set(id,p);try{return await p}finally{c.connectingThreads.delete(id)}}
async function listHost(h,archived=false){const c=hostClient(h.id);try{await c.connect();let cursor=null;const map=new Map();for(let i=0;i<20;i++){const r=await c.call('thread/list',{limit:100,archived,sortKey:'updated_at',...(cursor?{cursor}: {})},20000);for(const t of r.data||[]){if(!map.has(t.id)||t.updatedAt>map.get(t.id).updatedAt)map.set(t.id,t)}cursor=r.nextCursor;if(!cursor)break}const rows=[...map.values()].map(t=>({id:t.id,name:t.name||t.preview||'未命名会话',cwd:t.cwd,status:t.status,projectId:t.projectId||null,updatedAt:t.updatedAt,host:h.id}));let nativeProjects=[];try{const p=await c.call('project/list',{limit:100});nativeProjects=p.data||[]}catch{}return {...h,online:true,nativeProjects,threads:rows}}catch(e){return {...h,online:false,error:safeError(e),threads:[]}}}
function activeTurn(turns){return turns.find(t=>t.status==='inProgress')||null}
function pendingFor(c,id){return [...c.requests.values()].filter(m=>(m.params?.threadId||m.params?.conversationId)===id).map(m=>({id:String(m.id),method:m.method,params:m.params}))}
async function nativeSnapshot(host,id,cursor,archived){
 const h=nativeHost(host),key=host+':'+id;
 if(!archived){
  if(desktopIpc.following.size>=5&&!desktopIpc.following.has(h.hostId+':'+id)){
   const [old,owner]=desktopIpc.following.entries().next().value,split=old.lastIndexOf(':'),oldHost=old.slice(0,split),oldId=old.slice(split+1);
   try{desktopIpc.send({type:'broadcast',method:'thread-stream-following-changed',version:1,sourceClientId:desktopIpc.clientId,targetClientIds:[owner],params:{hostId:oldHost,conversationId:oldId,following:false}})}catch{}desktopIpc.following.delete(old);desktopIpc.requests.delete(old);
  }
  desktopIpc.follow(id,h.hostId).catch(()=>{});
 }
 let cached=nativeReads.get(key),promise;
 if(!cursor&&cached&&Date.now()-cached.at<900)promise=cached.promise;
 else{promise=desktop.call('read_thread',{hostId:h.hostId,threadId:id,turnLimit:2,includeOutputs:true,maxOutputCharsPerItem:20000,...(cursor?{cursor}:{})},30000);if(!cursor){nativeReads.set(key,{at:Date.now(),promise});promise.catch(()=>nativeReads.delete(key));if(nativeReads.size>12)nativeReads.delete(nativeReads.keys().next().value)}}
 const r=await promise;if(r.thread?.id!==id)throw new Error('原会话 ID 校验失败');
 const requests=desktopIpc.requests.get(h.hostId+':'+id)||[];
 return {host,thread:{id,name:r.thread.title||r.thread.preview||'未命名会话',cwd:r.thread.cwd,status:r.thread.status},turns:(r.turns||[]).map(t=>({...t,items:(t.items||[]).filter(i=>i.type!=='reasoning')})),nextCursor:r.page?.nextCursor||null,pending:requests.map(r=>({...r,id:String(r.id)})),queue:[],capabilities:{queue:false}};
}
async function snapshot(host,id,cursor,archived=false){
 if(!clients.has(host))return nativeSnapshot(host,id,cursor,archived);
 const c=await connected(host);if(!archived)await subscribe(c,id);
 const [meta,summary,items,queue]=await Promise.all([c.call('thread/read',{threadId:id}),c.call('thread/turns/list',{threadId:id,limit:12,itemsView:'notLoaded',sortDirection:'desc'},30000),c.call('thread/items/list',{threadId:id,limit:60,sortDirection:'desc',...(cursor?{cursor}:{})},30000),archived?Promise.resolve({data:[]}):c.call('thread/queue/list',{threadId:id,limit:100})]);
 const t=meta.thread;if(t.id!==id)throw new Error('原会话 ID 校验失败');
 const summaries=new Map((summary.data||[]).map(turn=>[turn.id,turn]));const turns=new Map();
 for(const entry of items.data||[]){if(entry.item?.type==='reasoning')continue;if(!turns.has(entry.turnId))turns.set(entry.turnId,{...(summaries.get(entry.turnId)||{id:entry.turnId,status:'completed',error:null}),items:[]});turns.get(entry.turnId).items.unshift(entry.item)}
 for(const turn of summary.data||[])if(turn.status==='inProgress'&&!turns.has(turn.id))turns.set(turn.id,{...turn,items:[]});
 return {host,thread:{id:t.id,name:t.name||t.preview||'未命名会话',cwd:t.cwd,status:t.status},turns:[...turns.values()],nextCursor:items.nextCursor||null,queue:queue.data||[],pending:pendingFor(c,id)};
}
function approvalResult(request,b){
 const method=request.method;
 if(method==='item/commandExecution/requestApproval'||method==='item/fileChange/requestApproval'){
  if(!['accept','decline','cancel'].includes(b.decision))throw Object.assign(new Error('无效审批选择'),{status:400});return {decision:b.decision};
 }
 if(method==='item/tool/requestUserInput'){
  const answers={};for(const q of request.params?.questions||[]){const values=b.answers?.[q.id];if(!Array.isArray(values)||values.length!==1||typeof values[0]!=='string'||!values[0].trim())throw Object.assign(new Error('请回答所有问题'),{status:400});answers[q.id]={answers:values}}
  return {answers};
 }
 if(method==='item/permissions/requestApproval'){
  if(!['accept','decline'].includes(b.decision))throw Object.assign(new Error('无效审批选择'),{status:400});
  const requested=request.params?.permissions||{};
  return {permissions:b.decision==='accept'?{...(requested.fileSystem?{fileSystem:requested.fileSystem}:{}),...(requested.network?{network:requested.network}:{})}:{},scope:'turn'};
 }
 throw Object.assign(new Error('此类请求请在电脑端处理'),{status:400});
}
const staticCache=new Map();
function sendAsset(req,res,path,type,cacheable=false){
 const file=new URL(path,import.meta.url),mtime=statSync(file).mtimeMs;
 let data=staticCache.get(file.href);if(!data||data.mtime!==mtime){const body=readFileSync(file);data={mtime,body,gzip:gzipSync(body),etag:'W/"'+createHash('sha256').update(body).digest('hex').slice(0,16)+'"'};staticCache.set(file.href,data)}
 res.setHeader('Cache-Control',cacheable?'public, max-age=31536000, immutable':'no-store');res.setHeader('ETag',data.etag);res.setHeader('Vary','Accept-Encoding');
 if(cacheable&&req.headers['if-none-match']===data.etag){res.writeHead(304);res.end();return}
 const zipped=req.headers['accept-encoding']?.includes('gzip');res.setHeader('Content-Type',type);if(zipped)res.setHeader('Content-Encoding','gzip');res.writeHead(200);res.end(zipped?data.gzip:data.body);
}
const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; font-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'");
 try{
 const u=new URL(req.url,'http://localhost');const path=u.pathname.replace(/^\/original(?:\/control)?(?=\/|$)/,'')||'/';
 if(req.method==='GET'&&(path==='/'||path==='/index.html'||path==='/app.js')){const file=path==='/app.js'?'app.js':'index.html';sendAsset(req,res,file,file==='index.html'?'text/html; charset=utf-8':'text/javascript; charset=utf-8');return}
 if(req.method==='GET'&&/^\/assets\/[a-zA-Z0-9_.-]+$/.test(path)){
  const types={'.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.woff2':'font/woff2','.woff':'font/woff','.ttf':'font/ttf'};
  const type=types[extname(path)];if(!type)return json(res,404,{error:'Not found'});
  try{sendAsset(req,res,'.'+path,type,u.searchParams.has('v')||/\.(woff2?|ttf)$/.test(path));return}catch{return json(res,404,{error:'Not found'})}
 }
 if(!path.startsWith('/api/'))return json(res,404,{error:'Not found'});
 if(req.headers.origin&&!ALLOWED_ORIGINS.has(req.headers.origin))return json(res,403,{error:'不允许的网页来源'});
 if(req.headers['sec-fetch-site']==='cross-site')return json(res,403,{error:'不允许的跨站请求'});
 if(req.method==='POST'&&path==='/api/pair'){
  const key=credential();if(!validBearer(req,key))return json(res,401,{error:'配对密钥不正确，请重新扫码'});
  res.setHeader('Set-Cookie',sessionCookie(createSession(key)));return json(res,200,{ok:true,rememberDays:180});
 }
 if(!authenticated(req))return json(res,401,{error:'请首次扫码配对，或输入配对密钥'});
 if(req.method==='POST'&&path==='/api/logout'){res.setHeader('Set-Cookie',sessionCookie('',true));return json(res,200,{ok:true})}

 if(req.method==='GET'&&path==='/api/status'){return json(res,200,{hosts:catalog.view().hosts.map(({threads,projects,...h})=>({...h,online:h.id==='mac'?!!desktop.socket&&!desktop.socket.destroyed:h.online||!!clients.get(h.id)?.initialized})),mode:'same-original-session',managedByCodex:process.env.CODEX_BRIDGE_MANAGED_HELPER==='1'})}
 if(req.method==='GET'&&path==='/api/events'){
  res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write('data: {"method":"connected"}\n\n');viewers.add(res);const timer=setInterval(()=>res.write(': heartbeat\n\n'),15000);req.on('close',()=>{viewers.delete(res);clearInterval(timer)});return;
 }
 if(req.method==='GET'&&path==='/api/threads'){const archived=u.searchParams.get('archived')==='1',data=catalog.view(archived);catalog.refresh(archived,u.searchParams.get('refresh')==='1');return json(res,200,data)}
 if(req.method==='GET'&&path==='/api/model-settings'){return json(res,200,await modelSettings.get(u.searchParams.get('host'),threadId(u.searchParams.get('id'))))}
 if(req.method==='POST'&&path==='/api/model-settings'){const b=await body(req);const id=threadId(b.threadId);const r=await modelSettings.set(b.host,id,b);broadcast({host:b.host,threadId:id,method:'settings/updated'});return json(res,200,r)}
 if(req.method==='GET'&&path==='/api/thread'){return json(res,200,await snapshot(u.searchParams.get('host'),threadId(u.searchParams.get('id')),u.searchParams.get('cursor'),u.searchParams.get('archived')==='1'))}
 if(req.method==='POST'&&path==='/api/message'){
  const b=await body(req);const id=threadId(b.threadId);if(typeof b.text!=='string'||!b.text.trim())return json(res,400,{error:'请输入消息'});if(!['send','queue','steer'].includes(b.mode||'send'))return json(res,400,{error:'未知发送方式'});
  const operationId=String(b.operationId||'');if(!/^[a-zA-Z0-9_-]{12,100}$/.test(operationId))return json(res,400,{error:'缺少消息标识'});
  const key=b.host+':'+id+':'+operationId;if(submissions.has(key))return json(res,200,await submissions.get(key));
  const run=(async()=>{if(!clients.has(b.host)){const h=nativeHost(b.host);let result;if(b.mode==='steer'){result=await desktopIpc.control(id,h.hostId,'thread-follower-steer-turn',{input:[{type:'text',text:b.text.trim()}],clientUserMessageId:operationId})}else result=await desktop.call('send_message_to_thread',{hostId:h.hostId,threadId:id,prompt:b.text.trim(),...await modelSettings.forMessage(b.host,id)},30000);if(b.mode!=='steer')modelSettings.sent(b.host,id);nativeReads.delete(b.host+':'+id);catalog.schedule(h,false,true);broadcast({host:b.host,threadId:id,method:'submitted'});return {ok:true,threadId:id,result}}const c=await connected(b.host);await subscribe(c,id);const input=[{type:'text',text:b.text.trim()}];let result;
   if(b.mode==='queue')result=await c.call('thread/queue/add',{threadId:id,input,clientUserMessageId:operationId},30000);
   else if(b.mode==='steer'){if(typeof b.turnId!=='string')throw new Error('缺少当前任务 ID，请刷新后重试');result=await c.call('turn/steer',{threadId:id,expectedTurnId:b.turnId,input},30000)}
   else result=await c.call('turn/start',{threadId:id,input,clientUserMessageId:operationId},30000);
   broadcast({host:b.host,threadId:id,method:'submitted'});return {ok:true,threadId:id,result};})();
  submissions.set(key,run);run.catch(()=>{});if(submissions.size>500)submissions.delete(submissions.keys().next().value);return json(res,200,await run);
 }
 if(req.method==='POST'&&path==='/api/interrupt'){const b=await body(req);if(!clients.has(b.host)){const h=nativeHost(b.host);await desktopIpc.control(threadId(b.threadId),h.hostId,'thread-follower-interrupt-turn',{mode:'user-stop',expectedTurnId:b.turnId});return json(res,200,{ok:true})}const c=await connected(b.host);await c.call('turn/interrupt',{threadId:threadId(b.threadId),turnId:b.turnId});return json(res,200,{ok:true})}
 if(req.method==='POST'&&path==='/api/answer'){
  const b=await body(req);const id=threadId(b.threadId);if(!clients.has(b.host)){const h=nativeHost(b.host),requests=desktopIpc.requests.get(h.hostId+':'+id)||[],request=requests.find(r=>String(r.id)===String(b.requestId));if(!request)return json(res,409,{error:'请求已处理，请刷新'});const result=approvalResult(request,b),methods={'item/commandExecution/requestApproval':'thread-follower-command-approval-decision','item/fileChange/requestApproval':'thread-follower-file-approval-decision','item/permissions/requestApproval':'thread-follower-permissions-request-approval-response','item/tool/requestUserInput':'thread-follower-submit-user-input'};await desktopIpc.control(id,h.hostId,methods[request.method],{requestId:request.id,...(result.decision?{decision:result.decision}:{response:result})});nativeReads.delete(b.host+':'+id);return json(res,200,{ok:true})}const c=await connected(b.host);const request=c.requests.get(String(b.requestId));if(!request||(request.params?.threadId||request.params?.conversationId)!==id)return json(res,409,{error:'请求已处理或会话不匹配，请刷新'});const result=approvalResult(request,b);c.answer(b.requestId,result);broadcast({host:b.host,threadId:id,method:'answered'});return json(res,200,{ok:true});
 }
 return json(res,404,{error:'Not found'});
 }catch(e){if(!res.headersSent)json(res,e.status||502,{error:safeError(e)});else res.end()}
});
const PORT=config.port;
// Fail before accepting public requests when initialization has not been completed.
getToken();
const reconnect=setInterval(()=>{for(const c of clients.values())if(!c.ready)c.connect().catch(()=>{})},20000);
let stopping=false;
server.on('error',error=>{console.error('Bridge listener:',safeError(error));shutdown(1)});
server.listen(PORT,'127.0.0.1',()=>console.log('Codex browser bridge listening on 127.0.0.1:'+PORT));
catalog.refresh(false);
for(const c of clients.values())c.connect().catch(e=>console.error('Initial connection:',safeError(e)));
function shutdown(code=0){if(stopping)return;stopping=true;clearInterval(reconnect);modelSettings.close();desktop.close();desktopIpc.close();for(const s of viewers)s.end();for(const c of clients.values())c.close();server.close(()=>process.exit(code));setTimeout(()=>process.exit(code),1500).unref()}
process.on('SIGTERM',()=>shutdown());process.on('SIGINT',()=>shutdown());
