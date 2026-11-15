'use strict';
import {renderMarkdown} from './markdown.mjs';
import 'katex/dist/katex.min.css';
import 'highlight.js/styles/github.css';
const $=id=>document.getElementById(id);
const apiBase=new URL('./',location.href).pathname;
const apiPath=path=>apiBase+path.replace(/^\//,'');
const storage={getItem(key){try{return localStorage.getItem(key)}catch{return null}},setItem(key,value){try{localStorage.setItem(key,value)}catch{}},removeItem(key){try{localStorage.removeItem(key)}catch{}}};
const storeKey='codex_bridge_original_token_v1';
let token=storage.getItem(storeKey)||'';
const fragment=new URLSearchParams(location.hash.slice(1));
if(fragment.get('token'))token=fragment.get('token');
let sessionReady=false,eventsStarted=false,eventController=null;
let hosts=[],selection=null,current=null,turnMap=new Map(),turnOrder=[],olderCursor=null,pendingKey='',refreshing=false,refreshTimer=null,sendBusy=false;
let noticeTimer,renderedMessagesKey='';
let modelData=null,modelDirty=false,modelBusy=false,modelLoading=false,modelLoadingFor=null;
const effortLabels={none:'无',minimal:'极少',low:'低',medium:'中',high:'高',xhigh:'更高',max:'Max',ultra:'Ultra'};
function notice(s){$('notice').textContent=s;$('notice').classList.remove('hidden');clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('notice').classList.add('hidden'),6500)}
async function api(path,data,{cookieOnly=false,quiet=false}={}){
 const options={credentials:'same-origin',headers:{}};if(token&&!cookieOnly)options.headers.Authorization='Bearer '+token;
 if(data!==undefined){options.method='POST';options.headers['Content-Type']='application/json';options.body=JSON.stringify(data)}
 const r=await fetch(apiPath(path),options),v=await r.json();
 if(!r.ok){if(r.status===401&&!quiet){sessionReady=false;showLogin()}throw Object.assign(new Error(v.error||'请求失败'),{status:r.status})}return v;
}
function showLogin(){$('autoConnecting').classList.add('hidden');$('pairForm').classList.remove('hidden');$('login').classList.remove('hidden');$('app').classList.add('hidden')}
function statusText(s){if(s?.type==='active'){if(s.activeFlags?.includes('waitingOnApproval'))return '等待审批';if(s.activeFlags?.includes('waitingOnUserInput'))return '等待回答';return '运行中'}return {idle:'空闲',notLoaded:'空闲',systemError:'异常'}[s?.type]||'未知状态'}
function showApp(){$('login').classList.add('hidden');$('app').classList.remove('hidden')}
let catalogArchive=null,catalogRefreshing=false,catalogTimer=null;
let listMode=storage.getItem('codex_bridge_list_mode_v1')||'recent',recentLimit=30;
const projectLimits=new Map();
function updateCatalog(data,cached=false){
 hosts=data.hosts||[];const select=$('hostFilter'),selected=select.value||'all';
 if(select.options.length!==hosts.length+1||hosts.some((h,i)=>select.options[i+1]?.value!==h.id)){
  select.replaceChildren();const all=document.createElement('option');all.value='all';all.textContent='全部设备';select.append(all);
  for(const h of hosts){const o=document.createElement('option');o.value=h.id;o.textContent=h.name;select.append(o)}select.value=hosts.some(h=>h.id===selected)?selected:'all';
 }
 const online=hosts.filter(h=>h.online).length,total=hosts.reduce((n,h)=>n+h.threads.length,0);
 $('connection').textContent=online+' 台在线 · '+total+' 个会话';
 $('hostStatus').textContent=cached?'正在更新列表…':hosts.some(h=>h.loading)?'正在同步其他设备…':'列表已更新 · 消息在打开会话后加载';renderList();
}
async function loadList(force=false){
 const archived=$('archived').checked,key='codex_bridge_catalog_v3_'+archived;
 if(catalogArchive!==archived){catalogArchive=archived;try{const cached=JSON.parse(storage.getItem(key)||'null');if(cached?.hosts)updateCatalog(cached,true)}catch{}}
 if(catalogRefreshing)return;catalogRefreshing=true;
 try{const data=await api('/api/threads?archived='+(archived?'1':'0')+(force?'&refresh=1':''));updateCatalog(data);storage.setItem(key,JSON.stringify(data))}finally{catalogRefreshing=false}
}

let savedProjects=[];try{savedProjects=JSON.parse(storage.getItem('codex_bridge_open_projects_v1')||'[]')}catch{}
const projectOpen=new Set(Array.isArray(savedProjects)?savedProjects:[]);
function threadButton(t){
 const b=document.createElement('button');b.className='thread-button'+(selection?.host===t.host&&selection?.id===t.id?' selected':'');
 const title=document.createElement('span');title.className='thread-title';title.textContent=t.name;
 const status=document.createElement('span');status.className='tag'+(t.status?.type==='active'?' active':'');status.textContent=statusText(t.status);
 b.append(title,status);b.onclick=()=>openThread(t);return b;
}
function renderList(){
 const q=$('search').value.trim().toLowerCase(),filter=$('hostFilter').value,list=$('threadList');list.replaceChildren();let total=0;
 $('recentView').classList.toggle('active',listMode==='recent');$('projectView').classList.toggle('active',listMode==='projects');
 if(listMode==='recent'){
  const rows=hosts.filter(h=>filter==='all'||h.id===filter).flatMap(h=>h.threads.map(t=>({...t,deviceName:h.name}))).filter(t=>!q||[t.name,t.cwd,t.projectName,t.deviceName].join(' ').toLowerCase().includes(q)).sort((a,b)=>b.updatedAt-a.updatedAt);
  for(const t of rows.slice(0,recentLimit)){const b=threadButton(t);b.classList.add('recent-thread');const meta=document.createElement('span');meta.className='recent-meta';meta.textContent=t.deviceName+' · '+(t.projectName||'其他会话');b.append(meta);list.append(b)}
  if(rows.length>recentLimit){const more=document.createElement('button');more.className='more-threads';more.textContent='加载更多会话（还有 '+(rows.length-recentLimit)+' 条）';more.onclick=()=>{recentLimit+=30;renderList()};list.append(more)}
  if(!rows.length){const empty=document.createElement('p');empty.className='muted';empty.textContent=q?'没有匹配的会话':'正在同步会话列表…';list.append(empty)}return;
 }
 for(const h of hosts.filter(h=>filter==='all'||h.id===filter)){
  const section=document.createElement('section');section.className='server-group';
  const title=document.createElement('h3');title.className='server-title';title.textContent=h.name;
  const dot=document.createElement('span');dot.className='server-dot'+(h.online?' online':'');dot.textContent=h.loading?'同步中':h.online?'在线':'离线';title.append(dot);section.append(title);
  const groups=[...(h.projects||[]),{id:'ungrouped',name:'其他会话',path:''}];let visible=0;
  for(const p of groups){
   const all=h.threads.filter(t=>(t.projectId||'ungrouped')===p.id);
   const rows=all.filter(t=>!q||[t.name,t.cwd,p.name,p.path].join(' ').toLowerCase().includes(q)).sort((a,b)=>{const ar=a.projectOrder,br=b.projectOrder;return ar!=null||br!=null?(ar??Infinity)-(br??Infinity)||b.updatedAt-a.updatedAt:b.updatedAt-a.updatedAt});
   if(q&&!rows.length||p.id==='ungrouped'&&!rows.length)continue;
   const group=document.createElement('details');group.className='project-group';const key=h.id+':'+p.id;group.open=q?true:projectOpen.has(key);
   const summary=document.createElement('summary'),name=document.createElement('span'),count=document.createElement('span');name.textContent=p.name;name.className='project-name';count.className='project-count';count.textContent=rows.length;summary.append(name,count);group.append(summary);
   let built=false;function fill(){if(built)return;built=true;if(p.path){const path=document.createElement('div');path.className='project-path';path.textContent=p.path;group.append(path)}const children=document.createElement('div');children.className='project-threads';const limit=projectLimits.get(key)||30;for(const t of rows.slice(0,limit))children.append(threadButton(t));if(rows.length>limit){const more=document.createElement('button');more.className='more-threads';more.textContent='加载更多（还有 '+(rows.length-limit)+' 条）';more.onclick=()=>{projectLimits.set(key,limit+30);renderList()};children.append(more)}if(!rows.length){const empty=document.createElement('p');empty.className='muted project-empty';empty.textContent=$('archived').checked?'没有已归档会话':'暂无会话';children.append(empty)}group.append(children)}
   if(group.open)fill();group.addEventListener('toggle',()=>{if(group.open)fill();if(q)return;if(group.open)projectOpen.add(key);else projectOpen.delete(key);storage.setItem('codex_bridge_open_projects_v1',JSON.stringify([...projectOpen]))});
   section.append(group);visible++;total+=rows.length;
  }
  if(!h.online&&!h.loading){const error=document.createElement('p');error.className='muted offline';error.textContent='设备暂不可用，联网后会自动更新';section.append(error)}
  if(visible||!h.online)list.append(section);
 }
 if(!total&&q){const empty=document.createElement('p');empty.className='muted';empty.textContent='没有匹配的项目或会话';list.append(empty)}
}

function modelOption(select,value,text){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option)}
function fillEfforts(value){
 const select=$('reasoningSelect'),model=modelData?.models.find(m=>m.model===$('modelSelect').value);select.replaceChildren();modelOption(select,'','默认'+(model?.defaultEffort?'（'+(effortLabels[model.defaultEffort]||model.defaultEffort)+'）':''));
 for(const effort of model?.efforts||[])modelOption(select,effort,effortLabels[effort]||effort);select.value=value&&model?.efforts.includes(value)?value:'';
}
function fillModelControls(){
 const select=$('modelSelect'),settings=modelData.settings||{};select.replaceChildren();modelOption(select,'','沿用原会话');
 for(const model of modelData.models)modelOption(select,model.model,model.name);
 if(settings.model&&!modelData.models.some(m=>m.model===settings.model))modelOption(select,settings.model,settings.model+'（当前）');
 select.value=settings.model||'';fillEfforts(settings.effort);select.disabled=selection?.archived||modelBusy;$('reasoningSelect').disabled=selection?.archived||modelBusy||!select.value;
 $('modelApply').classList.add('hidden');$('modelStatus').textContent=modelData.pending?'已选好，下一条消息时生效':'用于下一轮 · 与原会话同步';
}
async function loadModelSettings(initial=false){
 if(!selection||selection.archived||(modelLoading&&modelLoadingFor===selection)||modelBusy||modelDirty)return;const selected=selection;modelLoading=true;modelLoadingFor=selected;
 try{const r=await api('/control/api/model-settings?host='+selected.host+'&id='+encodeURIComponent(selected.id));if(selection!==selected||modelDirty||modelBusy)return;modelData=r;fillModelControls()}
 catch(e){if(selection===selected){$('modelStatus').textContent='模型配置暂不可用';if(initial)notice(e.message)}}finally{if(modelLoadingFor===selected){modelLoading=false;modelLoadingFor=null}}
}
function editModel(){modelDirty=true;$('modelApply').classList.remove('hidden');$('modelStatus').textContent='更改将从下一轮生效'}
async function saveModelSettings(showNotice=true){
 if(!selection||selection.archived||!modelDirty||modelBusy)return;const selected=selection,model=$('modelSelect').value,effort=$('reasoningSelect').value||null;modelBusy=true;$('modelApply').disabled=true;$('modelSelect').disabled=true;$('reasoningSelect').disabled=true;
 try{const r=await api('/control/api/model-settings',{host:selected.host,threadId:selected.id,model,effort,...(!model?{clear:true}:{})});if(selection===selected){modelDirty=false;modelData={...modelData,...r};fillModelControls();if(showNotice)notice(r.pending?'已选好，发送下一条时生效':'模型配置已同步，下一轮生效')}}
 finally{modelBusy=false;$('modelApply').disabled=false;if(selection===selected&&modelData){$('modelSelect').disabled=selected.archived;$('reasoningSelect').disabled=selected.archived||!$('modelSelect').value}}
}
function draftKey(){return selection?'codex_bridge_original_draft:'+selection.host+':'+selection.id:''}
async function openThread(t){modelData=null;modelDirty=false;$('modelSelect').replaceChildren();modelOption($('modelSelect'),'',$('archived').checked?'原会话配置':'正在读取…');$('reasoningSelect').replaceChildren();modelOption($('reasoningSelect'),'','默认');$('modelSelect').disabled=true;$('reasoningSelect').disabled=true;$('modelApply').classList.add('hidden');$('modelStatus').textContent=$('archived').checked?'已归档 · 仅查看':'正在读取模型配置…';selection={host:t.host,id:t.id,archived:$('archived').checked};current=null;turnMap.clear();turnOrder=[];olderCursor=null;pendingKey='';$('requests').replaceChildren();$('messages').replaceChildren();renderedMessagesKey='';$('chatTitle').textContent=t.name;$('chatMeta').textContent=(hosts.find(h=>h.id===t.host)?.name||t.host)+' · 正在读取原会话…';$('chatInfo').textContent='原会话 ID：'+t.id;$('blank').classList.add('hidden');$('chat').classList.remove('hidden');document.body.classList.add('chat');$('message').value=storage.getItem(draftKey())||'';setBusy(false);renderList();loadModelSettings(true);try{await refreshChat(true)}catch(e){notice(e.message)}}
function applyTurns(turns,older){const ascending=[...turns].reverse();const newIds=ascending.filter(t=>!turnMap.has(t.id)).map(t=>t.id);for(const t of ascending){const old=turnMap.get(t.id);if(!old){turnMap.set(t.id,t);continue}const source=older?[...(t.items||[]),...(old.items||[])]:[...(old.items||[]),...(t.items||[])];const map=new Map();for(const i of source)map.set(i.id,i);turnMap.set(t.id,{...(older?{...t,...old}:{...old,...t}),items:[...map.values()]})}if(older)turnOrder=newIds.concat(turnOrder);else turnOrder.push(...newIds)}
function textContent(input){return (input||[]).map(c=>c.type==='text'?c.text:c.type==='image'||c.type==='localImage'?'[图片附件]':c.type==='skill'?'[技能 '+c.name+']':'').filter(Boolean).join('\n')}
function addMessage(parent,role,text){if(!text)return;const d=document.createElement('div');d.className='message '+role;renderMarkdown(d,text);parent.append(d)}
function addTool(parent,label,text){const d=document.createElement('details');d.className='tool';const s=document.createElement('summary');s.textContent=label.length>130?label.slice(0,127)+'…':label;s.title=label;d.append(s);if(text||label.length>130){const pre=document.createElement('pre');pre.textContent=(label.length>130?label+'\n\n':'')+(text||'').slice(0,60000);d.append(pre)}parent.append(d)}
function renderMessages(){const box=$('messages');const key=JSON.stringify([olderCursor,turnOrder.map(id=>turnMap.get(id))]);if(key===renderedMessagesKey&&box.childElementCount)return;renderedMessagesKey=key;const opened=new Set([...box.querySelectorAll('details[open]')].map(d=>d.querySelector('summary')?.textContent));const sticky=box.scrollHeight-box.scrollTop-box.clientHeight<90;const oldHeight=box.scrollHeight,oldTop=box.scrollTop;box.replaceChildren();if(olderCursor){const b=document.createElement('button');b.className='older';b.textContent='加载更早的消息';b.onclick=loadOlder;box.append(b)}for(const id of turnOrder){const turn=turnMap.get(id);for(const item of turn.items||[]){
 if(item.type==='userMessage')addMessage(box,'user',textContent(item.content));
 else if(item.type==='agentMessage'||item.type==='plan'){addMessage(box,'assistant',item.text);if(item.questions?.length)renderAsyncQuestions(box,item.questions);}
 else if(item.type==='commandExecution')addTool(box,'终端 · '+(item.command||'命令')+' · '+(item.status||''),item.aggregatedOutput||'');
 else if(item.type==='fileChange')addTool(box,'文件变更 · '+(item.status||''),(item.changes||[]).map(c=>c.path+'\n'+(c.diff||'')).join('\n\n'));
 else if(item.type==='mcpToolCall'||item.type==='dynamicToolCall')addTool(box,'工具 · '+(item.tool||item.name||item.server||'')+' · '+(item.status||''),item.result?JSON.stringify(item.result,null,2):'');
 else if(item.type==='webSearch')addTool(box,'搜索资料',item.action?.query||'');
 else if(item.type==='collabAgentToolCall')addTool(box,'子任务 · '+(item.tool||'')+' · '+(item.status||''),item.prompt||'');
 else if(item.type==='contextCompaction'){const d=document.createElement('p');d.className='muted';d.textContent='已整理上下文';box.append(d)}
 }if(turn.error){const e=document.createElement('p');e.className='turn-error';e.textContent=turn.error.message||'任务执行遇到错误';box.append(e)}}if(!turnOrder.length){const p=document.createElement('p');p.className='muted';p.textContent='会话尚无消息';box.append(p)}for(const d of box.querySelectorAll('details'))if(opened.has(d.querySelector('summary')?.textContent))d.open=true;if(sticky||oldHeight===0)box.scrollTop=box.scrollHeight;else box.scrollTop=oldTop}
function active(){return [...turnMap.values()].find(t=>t.status==='inProgress')}
function renderRequests(requests){const key=JSON.stringify(requests);if(key===pendingKey)return;pendingKey=key;const container=$('requests');container.replaceChildren();for(const r of requests){const card=document.createElement('div');card.className='request';const title=document.createElement('strong');const p=r.params||{};title.textContent=r.method==='item/tool/requestUserInput'?'Codex 需要你的回答':'Codex 请求确认';card.append(title);
 if(r.method==='item/tool/requestUserInput'){
  const inputs={};for(const q of p.questions||[]){const section=document.createElement('div');section.className='question';const label=document.createElement('div');label.textContent=(q.header?q.header+'：':'')+q.question;section.append(label);const list=[];for(const [i,opt] of (q.options||[]).entries()){const l=document.createElement('label');const input=document.createElement('input');input.type='radio';input.name='q-'+r.id+'-'+q.id;input.value=opt.label;list.push(input);l.append(input,document.createTextNode(opt.label+(opt.description?' — '+opt.description:'')));section.append(l)}const free=document.createElement('input');free.type='text';free.placeholder='也可以填写自己的回答';section.append(free);inputs[q.id]={list,free};card.append(section)}const b=document.createElement('button');b.className='primary';b.textContent='提交回答';b.onclick=async()=>{const answers={};for(const [id,x] of Object.entries(inputs)){const value=x.free.value.trim()||x.list.find(v=>v.checked)?.value;if(!value)return notice('请回答所有问题');answers[id]=[value]}await answer(r,{answers})};card.append(b);
 }else if(r.method==='item/commandExecution/requestApproval'||r.method==='item/fileChange/requestApproval'||r.method==='item/permissions/requestApproval'){
  const item=[...turnMap.values()].flatMap(t=>t.items||[]).find(i=>i.id===p.itemId);const pre=document.createElement('pre');pre.textContent=[p.command,p.reason,p.cwd,p.grantRoot,(item?.changes||[]).map(c=>c.path+'\n'+(c.diff||'')).join('\n'),p.permissions?JSON.stringify(p.permissions,null,2):''].filter(Boolean).join('\n');card.append(pre);for(const [label,decision,primary] of [[r.method==='item/permissions/requestApproval'?'允许本轮':'允许本次','accept',true],['拒绝','decline',false]]){const b=document.createElement('button');b.textContent=label;if(primary)b.className='primary';b.onclick=()=>answer(r,{decision});card.append(b)}
 }else{const note=document.createElement('p');note.textContent='此类请求请在电脑端处理。';card.append(note)}container.append(card)}}
async function answer(r,result){try{await api('/api/answer',{host:selection.host,threadId:selection.id,requestId:r.id,...result});notice('已提交给原会话');await refreshChat()}catch(e){notice(e.message)}}
async function refreshChat(initial=false){if(!selection||refreshing)return;refreshing=true;const selected=selection;try{const r=await api('/api/thread?host='+selected.host+'&id='+encodeURIComponent(selected.id)+'&archived='+(selected.archived?'1':'0'));if(selection!==selected)return;current=r;applyTurns(r.turns,false);if(initial)olderCursor=r.nextCursor;$('chatTitle').textContent=r.thread.name;$('chatMeta').textContent=(hosts.find(h=>h.id===r.host)?.name||r.host)+' · '+(hosts.find(h=>h.id===r.host)?.threads.find(t=>t.id===r.thread.id)?.projectName||r.thread.cwd);$('chatInfo').textContent='原会话 ID：'+r.thread.id+'\n与电脑端使用同一运行实例。';const running=active();$('chatStatus').textContent=selected.archived?'已归档 · 仅查看':statusText(r.thread.status);$('stop').classList.toggle('hidden',!running||selected.archived);$('queue').classList.toggle('hidden',!running||selected.archived||r.capabilities?.queue===false);$('send').textContent=running?'补充当前任务':'发送';$('message').disabled=selected.archived;$('send').disabled=selected.archived||sendBusy;$('queue').disabled=sendBusy;renderMessages();renderRequests(r.pending);renderQueue(r.queue||[]);if(initial)$('messages').scrollTop=$('messages').scrollHeight}catch(e){$('chatStatus').textContent='连接异常';if(initial)throw e}finally{refreshing=false}}
async function loadOlder(){if(!olderCursor||!selection)return;const selected=selection;try{const r=await api('/api/thread?host='+selection.host+'&id='+encodeURIComponent(selection.id)+'&archived='+(selection.archived?'1':'0')+'&cursor='+encodeURIComponent(olderCursor));if(selection!==selected)return;const box=$('messages'),before=box.scrollHeight;applyTurns(r.turns,true);olderCursor=r.nextCursor;renderMessages();box.scrollTop=box.scrollHeight-before}catch(e){notice(e.message)}}
function setBusy(b){sendBusy=b;$('send').disabled=b||selection?.archived;$('queue').disabled=b}
async function send(queue=false){if(!selection||selection.archived||sendBusy)return;const text=$('message').value.trim();if(!text)return;const t=active(),selected=selection,savedDraftKey=draftKey();setBusy(true);try{if(modelDirty)await saveModelSettings(false);if(selection!==selected)return;await api('/control/api/message',{host:selection.host,threadId:selection.id,text,operationId:crypto.randomUUID(),mode:queue?'queue':t?'steer':'send',...(t?{turnId:t.id}:{})});if(selection===selected)$('message').value='';storage.removeItem(savedDraftKey);notice(queue?'已在原会话排队':'已发送到原会话');await refreshChat();loadModelSettings()}catch(e){notice(e.message+'；请先刷新会话确认发送状态。')}finally{setBusy(false)}}
async function events(){eventsStarted=true;while(sessionReady){try{eventController=new AbortController();const r=await fetch(apiPath('/api/events'),{credentials:'same-origin',headers:token?{Authorization:'Bearer '+token}:{},signal:eventController.signal});if(r.status===401){sessionReady=false;showLogin();break}if(!r.ok)throw new Error('事件连接中断');const reader=r.body.getReader(),decoder=new TextDecoder();let buffer='';while(true){const {done,value}=await reader.read();if(done)break;buffer+=decoder.decode(value,{stream:true});let end;while((end=buffer.indexOf('\n\n'))!==-1){const frame=buffer.slice(0,end);buffer=buffer.slice(end+2);if(!frame.startsWith('data: '))continue;const event=JSON.parse(frame.slice(6));if(event.method==='catalog/updated'){if(event.archived===$('archived').checked&&!catalogTimer)catalogTimer=setTimeout(()=>{catalogTimer=null;loadList().catch(()=>{})},250);continue}if(selection&&(!event.threadId||event.threadId===selection.id)&&(!event.host||event.host===selection.host)&&!refreshTimer)refreshTimer=setTimeout(()=>{refreshTimer=null;refreshChat()},650)}}}catch(e){}if(sessionReady)await new Promise(r=>setTimeout(r,2000))}eventsStarted=false}
async function login(automatic=false){
 token=$('token').value.trim()||token;$('retryConnection').classList.add('hidden');$('loginButton').disabled=true;$('loginError').textContent='';
 try{
  if(token)await api('/api/pair',{});
  await api('/api/status');
  if(token){
   try{await api('/api/status',undefined,{cookieOnly:true,quiet:true});token='';storage.removeItem(storeKey)}
   catch(e){if(e.status!==401)throw e;storage.setItem(storeKey,token)}
  }
  sessionReady=true;$('token').value='';history.replaceState(null,'',location.pathname+location.search);showApp();
  if(!eventsStarted)events();await loadList().catch(e=>{notice('服务器列表暂不可用，请稍后点刷新');$('connection').textContent='正在重新连接服务器…'});
 }catch(e){
  if(automatic&&e.status!==401){$('login').classList.remove('hidden');$('app').classList.add('hidden');$('pairForm').classList.add('hidden');$('autoConnecting').classList.remove('hidden');$('autoConnecting').textContent='暂时连接不上电脑，请检查联网后重试。';$('retryConnection').classList.remove('hidden')}else{showLogin();if(!automatic)$('loginError').textContent=e.message}
 }finally{$('loginButton').disabled=false}
}

$('loginButton').onclick=()=>login(false);$('token').onkeydown=e=>{if(e.key==='Enter')login()};$('hostFilter').onchange=renderList;$('search').oninput=renderList;$('archived').onchange=()=>{loadList().catch(e=>notice(e.message))};$('refresh').onclick=()=>{loadList(true).catch(e=>notice(e.message));refreshChat()};$('back').onclick=()=>document.body.classList.remove('chat');$('send').onclick=()=>send(false);$('queue').onclick=()=>send(true);$('message').oninput=()=>{if(selection)storage.setItem(draftKey(),$('message').value)};$('message').onkeydown=e=>{if((e.metaKey||e.ctrlKey)&&e.key==='Enter')send(false)};$('stop').onclick=async()=>{const t=active();if(!t||!selection)return;try{await api('/api/interrupt',{host:selection.host,threadId:selection.id,turnId:t.id});notice('已请求停止原会话任务');await refreshChat()}catch(e){notice(e.message)}};
setInterval(()=>{if(sessionReady&&selection&&!document.hidden)refreshChat()},4000);setInterval(()=>{if(sessionReady&&!document.hidden)loadList().catch(()=>{})},30000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&sessionReady){loadList().catch(()=>{});refreshChat()}});login(true);

function renderQueue(queue){const root=$('queued');root.replaceChildren();if(!queue.length)return;const card=document.createElement('div');card.className='tool';const heading=document.createElement('strong');heading.textContent='已排队 · 与电脑端同步';card.append(heading);for(const q of queue){const p=document.createElement('p');p.textContent=textContent(q.input);card.append(p)}root.append(card)}
function renderAsyncQuestions(parent,questions){const box=document.createElement('div');box.className='tool';for(const q of questions){const p=document.createElement('p');p.textContent=q.title;box.append(p);for(const option of q.options||[]){const b=document.createElement('button');b.textContent=option;b.style.margin='3px';b.onclick=()=>{const field=$('message');const answer='关于“'+q.title+'”：'+option;field.value+=(field.value?'\n':'')+answer;storage.setItem(draftKey(),field.value);field.focus()};box.append(b)}}parent.append(box)}

$('messages').addEventListener('click',event=>{const link=event.target.closest('a[data-server-path]');if(link){event.preventDefault();notice('服务器文件：'+link.dataset.serverPath)}});

$('deviceAccess').onclick=()=>$('accessPanel').showModal();$('closeAccess').onclick=()=>$('accessPanel').close();$('forgetDevice').onclick=async()=>{try{await api('/api/logout',{});sessionReady=false;eventController?.abort();token='';storage.removeItem(storeKey);$('accessPanel').close();showLogin();$('loginError').textContent='已取消记住本设备，下次可扫码重新配对。'}catch(e){notice(e.message)}};

$('retryConnection').onclick=()=>login(true);

$('recentView').onclick=()=>{listMode='recent';storage.setItem('codex_bridge_list_mode_v1',listMode);renderList()};$('projectView').onclick=()=>{listMode='projects';storage.setItem('codex_bridge_list_mode_v1',listMode);renderList()};

$('modelSelect').onchange=()=>{const old=$('reasoningSelect').value;fillEfforts(old);$('reasoningSelect').disabled=!$('modelSelect').value;editModel()};$('reasoningSelect').onchange=editModel;$('modelApply').onclick=()=>saveModelSettings().catch(e=>notice(e.message));setInterval(()=>{if(sessionReady&&selection&&!document.hidden)loadModelSettings()},12000);
