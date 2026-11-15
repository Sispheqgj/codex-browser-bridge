import assert from 'node:assert/strict';
import { validateConfig, sshArguments, shellQuote } from '../src/config.mjs';
assert.equal(validateConfig({}).port, 3007);
assert.throws(() => validateConfig({ publicOrigin: 'http://public.example' }), /HTTPS/);
assert.throws(() => validateConfig({ publicOrigin: 'https://example.test/path' }), /协议/);
assert.throws(() => validateConfig({ port: 0 }), /port/);
const remote = {
  id: 'devbox',
  host: 'devbox',
  socketPath: "/home/you's account/.codex/control.sock",
};
assert.equal(validateConfig({ remotes: [remote] }).remotes.length, 1);
assert.throws(() => validateConfig({ remotes: [remote, remote] }), /重复/);
assert.throws(
  () => validateConfig({ remotes: [{ ...remote, host: '-oProxyCommand=anything' }] }),
  /host/,
);
assert.throws(
  () => validateConfig({ remotes: [{ ...remote, socketPath: 'relative.sock' }] }),
  /绝对路径/,
);
assert.equal(shellQuote("a'b"), "'a'\\''b'");
const args = sshArguments(remote);
assert.equal(args.at(-2), 'devbox');
assert.ok(args.at(-1).includes(shellQuote(remote.socketPath)));
assert.equal(args.at(-1).includes('danger-full-access'), false);
console.log(
  'PASS: portable configuration, HTTPS origin restriction, unique remote IDs and SSH command quoting',
);
