import assert from 'node:assert/strict';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {once} from 'node:events';
import {randomBytes} from 'node:crypto';
const state=await mkdtemp(join(tmpdir(),'codex-bridge-http-'));
const portServer=createServer();portServer.listen(0,'127.0.0.1');await once(portServer,'listening');const port=portServer.address().port;await new Promise(r=>portServer.close(r));
const token=randomBytes(32).toString('hex'),base='http://127.0.0.1:'+port;
await writeFile(join(state,'config.json'),JSON.stringify({port,publicOrigin:base,appToolsDirectory:join(state,'nonexistent-sockets'),remotes:[]}));
await writeFile(join(state,'access-token'),token,{mode:0o600});
const proc=spawn(process.execPath,['server.mjs'],{cwd:new URL('.',import.meta.url),env:{...process.env,CODEX_BRIDGE_HOME:state,CODEX_BRIDGE_CODEX_HOME:join(state,'fake-codex-home')},stdio:['ignore','pipe','pipe']});
let log='';proc.stdout.on('data',b=>log+=b);proc.stderr.on('data',b=>log+=b);
try{
 await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{clearInterval(check);reject(new Error('HTTP startup timed out: '+log))},6000);const check=setInterval(()=>{if(log.includes('listening')){clearTimeout(timeout);clearInterval(check);resolve()}else if(proc.exitCode!==null){clearTimeout(timeout);clearInterval(check);reject(new Error(log))}},25)});
 const request=(path,options={})=>fetch(base+'/original'+path,{...options,signal:AbortSignal.timeout(5000)});
 assert.equal((await request('/api/status')).status,401);
 const pairing=await request('/api/pair',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}'});
 assert.equal(pairing.status,200);const cookie=pairing.headers.get('set-cookie');assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);assert.match(cookie,/SameSite=Strict/);
 const headers={Cookie:cookie.split(';')[0]};const status=await request('/api/status',{headers});assert.equal(status.status,200);assert.equal((await status.json()).mode,'same-original-session');
 assert.equal((await request('/api/status',{headers:{...headers,Origin:'https://untrusted.example'}})).status,403);
 assert.equal((await request('/control/api/status',{headers})).status,200);
 assert.equal((await request('/control/api/model-settings?host=missing&id=original-thread-id',{headers})).status,400);
 const html=await request('/index.html');assert.equal(html.status,200);assert.ok((await html.text()).includes('modelSelect'));assert.match(html.headers.get('content-security-policy'),/frame-ancestors 'none'/);
 assert.equal(log.includes(token),false);
 console.log('PASS: isolated HTTP startup, cookie pairing, access control, origin checks, control-path alias and static UI; no real Codex or model calls');
}finally{
 const ended=once(proc,'exit');proc.kill('SIGTERM');await ended;await rm(state,{recursive:true,force:true});
}
