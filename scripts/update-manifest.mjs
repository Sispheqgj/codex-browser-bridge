import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { sourceFiles, root, manifestPath } from './release-files.mjs';

const files = {};
for (const name of await sourceFiles()) {
  if (name === manifestPath) continue;
  files[name] = createHash('sha256')
    .update(await readFile(resolve(root, name)))
    .digest('hex');
}
const manifest = {
  project: 'codex-browser-bridge',
  version: '0.1.0',
  status: 'experimental',
  repository: 'https://github.com/Sispheqgj/codex-browser-bridge',
  files,
};
await writeFile(resolve(root, manifestPath), JSON.stringify(manifest, null, 2) + '\n');
console.log('Updated release manifest for ' + Object.keys(files).length + ' files');
