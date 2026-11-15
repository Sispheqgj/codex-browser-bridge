import { readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, dirname } from 'node:path';
import { sourceFiles, root, manifestPath } from './release-files.mjs';

const files = await sourceFiles();
const findings = [];
for (const name of files) {
  const data = await readFile(resolve(root, name));
  if (name.startsWith('docs/assets/')) {
    if (data[0] !== 0xff || data[1] !== 0xd8 || data.length > 3 * 1024 * 1024)
      findings.push(name + ': expected a small JPEG screenshot');
    continue;
  }
  const content = data.toString('utf8');
  const patterns = [
    [/-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----/, 'private key'],
    [/\bsk-[A-Za-z0-9_-]{20,}/, 'API credential'],
    [/\/Users\/(?!you\/|USER\/)[A-Za-z0-9_.-]+\//, 'personal home path'],
    [/\b(?:[a-z0-9-]+\.)*rc4ml\.org\b/i, 'deployment hostname'],
    [/[?&#]token=[a-zA-Z0-9_-]{20,}/, 'token-bearing URL'],
    [
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i,
      'concrete session identifier',
    ],
  ];
  if (name !== manifestPath)
    patterns.push([/["'][a-f0-9]{64}["']/i, 'literal high-entropy hex value']);
  for (const [pattern, label] of patterns)
    if (pattern.test(content)) findings.push(name + ': possible ' + label);
  if (
    name.endsWith('.md') &&
    (name.startsWith('docs/') || ['README.md', 'SECURITY.md'].includes(name))
  ) {
    for (const match of content.matchAll(/(?:\]\(([^\s)]+)\)|<img\b[^>]*\bsrc="([^"]+)")/g)) {
      const target = match[1] || match[2];
      if (/^(https?:|mailto:|#)/.test(target)) continue;
      const path = resolve(root, dirname(name), decodeURIComponent(target.split('#')[0]));
      try {
        await stat(path);
      } catch {
        findings.push(name + ': broken local link ' + target);
      }
    }
  }
}
const manifest = JSON.parse(await readFile(resolve(root, manifestPath), 'utf8'));
const expected = files.filter((file) => file !== manifestPath).sort();
if (JSON.stringify(Object.keys(manifest.files).sort()) !== JSON.stringify(expected))
  findings.push('Release manifest does not match the source file list');
for (const file of expected) {
  const digest = createHash('sha256')
    .update(await readFile(resolve(root, file)))
    .digest('hex');
  if (manifest.files[file] !== digest)
    findings.push(file + ': manifest is stale; run npm run manifest');
}
if (findings.length) {
  console.error(findings.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'PASS: ' +
      files.length +
      ' source files, documentation links and release hashes checked; no configured private-data patterns found',
  );
