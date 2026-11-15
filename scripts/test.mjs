import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
const root=await mkdtemp(join(tmpdir(),'codex-bridge-tests-'));
await mkdir(join(root,'state'));await mkdir(join(root,'codex'));
const tests=['test-auth.mjs','test-rendering.mjs','test-catalog.mjs','test-model-settings.mjs','test-config.mjs','test-http.mjs'];
try{for(const test of tests){
 const child=spawn(process.execPath,[test],{cwd:new URL('../',import.meta.url),env:{...process.env,CODEX_BRIDGE_HOME:join(root,'state'),CODEX_BRIDGE_CODEX_HOME:join(root,'codex')},stdio:'inherit'});
 const [code,signal]=await once(child,'exit');if(code!==0){process.exitCode=code||1;throw new Error(test+' failed'+(signal?' ('+signal+')':''))}
}}finally{await rm(root,{recursive:true,force:true})}
