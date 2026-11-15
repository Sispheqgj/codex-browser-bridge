// Desktop-only project names and assignments have not migrated to these remote
// app-servers yet. Read only the matching metadata; never write desktop state.
import {readFileSync} from 'node:fs';
import {nativeStatePath,codexHome} from './config.mjs';
const stateFile=nativeStatePath;
let lastState={};
export function readDesktopProjects(){
  try{lastState=JSON.parse(readFileSync(stateFile,'utf8'))}catch{}
  return lastState;
}
const cleanPath=p=>typeof p==='string'?p.replace(/\/+$/,'')||'/':'';
const contains=(root,path)=>root===path||(root==='/'?path.startsWith('/'):path.startsWith(root+'/'));
export function withProjects(hosts,state=readDesktopProjects()){
  const order=state['project-order']||[];
  const assignments=state['thread-project-assignments']||{};
  const threadOrders=state['sidebar-project-thread-orders']||{};
  return hosts.map(host=>{
    const local=host.hostId==='local'||host.id==='mac';
    const hostId=local?'local':'remote-ssh-discovered:'+host.host;
    const nativeIds=state['app-server-project-id-by-legacy-project-id-by-host']?.['local:'+codexHome]||{};
    const legacyId=id=>local?Object.entries(nativeIds).find(([,v])=>v===id)?.[0]||id:id;
    const saved=local?Object.values(state['local-projects']||{}).map(p=>({id:p.id,label:p.name,remotePath:p.rootPaths?.[0]||'',paths:p.rootPaths||[]})):(state['remote-projects']||[]).filter(p=>p.hostId===hostId);
    const projects=saved.map((p,i)=>({id:p.id,name:p.label||p.remotePath.split('/').pop(),path:p.remotePath,paths:p.paths,position:order.includes(p.id)?order.indexOf(p.id):order.length+i}));
    for(const p of host.nativeProjects||[])if(!projects.some(x=>x.id===p.id))projects.push({id:p.id,name:p.name,path:p.roots?.[0]?.path||'',paths:p.roots?.map(r=>r.path)||[],position:p.position??projects.length});
    projects.sort((a,b)=>a.position-b.position);
    const paths=projects.flatMap(p=>(p.paths||[p.path]).map(path=>({project:p,path:cleanPath(path)}))).filter(p=>p.path).sort((a,b)=>b.path.length-a.path.length);
    const threads=host.threads.map(t=>{
      const assignment=assignments[t.id];
      const assignedId=(local?assignment?.projectKind==='local':assignment?.hostId===hostId&&assignment.projectKind==='remote')?assignment.projectId:null;
      const project=projects.find(p=>p.id===legacyId(t.projectId))||projects.find(p=>p.id===assignedId)||paths.find(p=>contains(p.path,cleanPath(t.cwd)))?.project;
      const ids=threadOrders[project?.id]?.threadIds||[];
      return {...t,projectId:project?.id||null,projectName:project?.name||null,projectOrder:ids.includes(t.id)?ids.indexOf(t.id):null};
    });
    const {nativeProjects,...rest}=host;
    return {...rest,projects:projects.filter(p=>order.includes(p.id)||threads.some(t=>t.projectId===p.id)),threads};
  });
}
