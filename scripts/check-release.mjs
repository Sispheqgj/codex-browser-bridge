import {readdir,readFile} from 'node:fs/promises';
import {join,relative} from 'node:path';
const root=new URL('../',import.meta.url).pathname;
const skip=new Set(['node_modules','assets','.git']);
const allowedRoot=new Set(['README.md','LICENSE','SECURITY.md','THIRD_PARTY_NOTICES.md','.gitignore','.npmignore','package.json','package-lock.json','config.example.json','RELEASE_MANIFEST.json','app.js','index.html','auth.mjs','build.mjs','catalog.mjs','cli.mjs','config.mjs','desktop.mjs','desktop-ipc.mjs','markdown.mjs','model-settings.mjs','projects.mjs','rpc.mjs','server.mjs','stdio-host.mjs','rendering-fixture.md','test-auth.mjs','test-rendering.mjs','test-catalog.mjs','test-model-settings.mjs','test-config.mjs','test-http.mjs']);
const allowedNested=new Set(['docs/RELATED_WORK.md','docs/ARCHITECTURE.md','docs/VALIDATION.md','.github/workflows/ci.yml','scripts/check-release.mjs','scripts/test.mjs']);
const findings=[];let count=0;
async function scan(directory){for(const entry of await readdir(directory,{withFileTypes:true})){
 if(skip.has(entry.name))continue;const path=join(directory,entry.name),name=relative(root,path);
 if(entry.isSymbolicLink()){findings.push(name+': symlink excluded from source releases');continue}
 if(entry.isDirectory()){await scan(path);continue}
 if(!(allowedRoot.has(name)||allowedNested.has(name))){findings.push(name+': unexpected file; review the release allowlist');continue}
 const content=await readFile(path,'utf8');count++;
 const patterns=[[/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/,'private key'],[/\bsk-[A-Za-z0-9_-]{20,}/,'API credential'],[/\/Users\/(?!you\/|USER\/)[A-Za-z0-9_.-]+\//,'personal home path'],[/\b(?:[a-z0-9-]+\.)*rc4ml\.org\b/i,'deployment hostname'],[/[?&#]token=[a-zA-Z0-9_-]{20,}/,'token-bearing URL'],[/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,'concrete session identifier']];
 if(name!=='RELEASE_MANIFEST.json')patterns.push([/["'][a-f0-9]{64}["']/i,'literal high-entropy hex value']);
 for(const [pattern,label] of patterns)if(pattern.test(content))findings.push(name+': possible '+label);
}}
await scan(root);
if(findings.length){console.error(findings.join('\n'));process.exitCode=1}else console.log('PASS: '+count+' source files match the allowlist; no configured private-data patterns found (not a comprehensive secret audit)');
