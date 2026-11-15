import { build } from 'esbuild';
import { mkdir, readFile, writeFile, readdir, copyFile, rm } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = new URL('../dist/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(new URL('assets/licenses/', output), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: ['web/app.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['safari16', 'chrome110'],
  outfile: 'dist/assets/app.bundle.js',
  loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
  assetNames: '[name]-[hash]',
  legalComments: 'eof',
});
let page = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
for (const ext of ['js', 'css']) {
  const asset = 'assets/app.bundle.' + ext;
  const hash = createHash('sha256')
    .update(await readFile(new URL(asset, output)))
    .digest('hex')
    .slice(0, 12);
  const pattern = ext === 'js' ? /app\.bundle\.js\?v=[^"]+/g : /app\.bundle\.css\?v=[^"]+/g;
  page = page.replace(pattern, 'app.bundle.' + ext + '?v=' + hash);
}
await writeFile(new URL('index.html', output), page);
// Keep dependency notices with distributable browser assets.
for (const name of [
  'markdown-it',
  '@mdit/plugin-katex',
  '@mdit/plugin-tasklist',
  'dompurify',
  'highlight.js',
  'ws',
  'katex',
]) {
  const directory = new URL('../node_modules/' + name + '/', import.meta.url);
  let files = [];
  try {
    files = await readdir(directory);
  } catch {
    continue;
  }
  for (const file of files.filter((n) =>
    /^(LICENSE|LICENCE|COPYING|NOTICE|OFL)([.-]|$)/i.test(n),
  )) {
    await copyFile(
      new URL(file, directory),
      new URL('assets/licenses/' + name.replaceAll('/', '-') + '-' + file, output),
    );
  }
}
console.log('Built web/ → dist/');
