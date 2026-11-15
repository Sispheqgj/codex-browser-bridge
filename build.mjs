import {build} from 'esbuild';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
await mkdir('assets',{recursive:true});
await build({entryPoints:['app.js'],bundle:true,minify:true,format:'iife',target:['safari16','chrome110'],outfile:'assets/app.bundle.js',loader:{'.woff2':'file','.woff':'file','.ttf':'file'},assetNames:'[name]-[hash]',legalComments:'eof'});

let page=await readFile('index.html','utf8');
for(const ext of ['js','css']){
 const hash=createHash('sha256').update(await readFile('assets/app.bundle.'+ext)).digest('hex').slice(0,12);
 const pattern=ext==='js'?/app\.bundle\.js\?v=[^"]+/g:/app\.bundle\.css\?v=[^"]+/g;
 page=page.replace(pattern,'app.bundle.'+ext+'?v='+hash);
}
await writeFile('index.html',page);

// Preserve dependency notices alongside any generated distributable assets.
const {readdir,copyFile}=await import('node:fs/promises');
const packages=['markdown-it','@mdit/plugin-katex','@mdit/plugin-tasklist','dompurify','highlight.js','ws','katex'];
await mkdir('assets/licenses',{recursive:true});
for(const name of packages){
 let files=[];try{files=await readdir('node_modules/'+name)}catch{continue}
 for(const file of files.filter(n=>/^(LICENSE|LICENCE|COPYING|NOTICE|OFL)([.-]|$)/i.test(n))){
  try{await copyFile('node_modules/'+name+'/'+file,'assets/licenses/'+name.replaceAll('/','-')+'-'+file)}catch{}
 }
}
