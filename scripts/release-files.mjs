import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const manifestPath = 'docs/release-manifest.json';
const allowed = new Set([
  '.github/workflows/ci.yml',
  '.gitignore',
  '.npmignore',
  'LICENSE',
  'README.md',
  'SECURITY.md',
  'package.json',
  'package-lock.json',
  'src/cli.mjs',
  'src/config.mjs',
  'src/mcp/index.mjs',
  'src/server/index.mjs',
  'src/server/auth.mjs',
  'src/server/catalog.mjs',
  'src/server/projects.mjs',
  'src/server/model-settings.mjs',
  'src/transports/desktop-tools.mjs',
  'src/transports/desktop-ipc.mjs',
  'src/transports/ssh.mjs',
  'web/index.html',
  'web/app.js',
  'web/styles.css',
  'web/markdown.mjs',
  'tests/auth.test.mjs',
  'tests/catalog.test.mjs',
  'tests/config.test.mjs',
  'tests/http.test.mjs',
  'tests/demo.test.mjs',
  'tests/model-settings.test.mjs',
  'tests/rendering.test.mjs',
  'tests/fixtures/markdown.md',
  'scripts/build.mjs',
  'scripts/test.mjs',
  'scripts/check-release.mjs',
  'scripts/release-files.mjs',
  'scripts/update-manifest.mjs',
  'examples/config.example.json',
  'examples/demo/server.mjs',
  'examples/demo/fixtures.mjs',
  'docs/setup.md',
  'docs/development.md',
  'docs/architecture.md',
  'docs/related-work.md',
  'docs/validation.md',
  'docs/third-party-notices.md',
  manifestPath,
  'docs/assets/desktop.jpg',
  'docs/assets/mobile-projects.jpg',
  'docs/assets/mobile-chat.jpg',
]);

export async function sourceFiles() {
  const files = [];
  async function walk(directory = '') {
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const path = directory ? directory + '/' + entry.name : entry.name;
      if (['node_modules', 'dist', 'assets', '.git'].includes(path)) continue;
      if (entry.isSymbolicLink())
        throw new Error('Source releases cannot contain symlinks: ' + path);
      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }
      if (!allowed.has(path)) throw new Error('Unexpected release file: ' + path);
      files.push(path);
    }
  }
  await walk();
  return files.sort();
}
