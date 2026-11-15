import assert from 'node:assert/strict';
import {
  COOKIE,
  MAX_AGE,
  createSession,
  validSession,
  validBearer,
  sessionCookie,
} from '../src/server/auth.mjs';
const key = 'test-only-random-value',
  now = 1_000_000_000_000;
const session = createSession(key, now);
const request = (value) => ({ headers: { cookie: 'other=1; ' + COOKIE + '=' + value } });
assert.ok(validSession(request(session), key, now));
assert.ok(validSession(request(session), key, now + MAX_AGE * 1000 - 1000));
assert.equal(validSession(request(session), key, now + MAX_AGE * 1000), false);
assert.equal(validSession(request(session), 'a-different-key', now), false);
assert.equal(validSession(request(session + 'tampered'), key, now), false);
assert.equal(validSession(request(session.split('.')[0] + '.'), key, now), false);
assert.equal(validSession({ headers: {} }, key, now), false);
assert.equal(validSession(request('x'.repeat(1001)), key, now), false);
assert.equal(validSession(request('nonsense'), key, now), false);
assert.ok(validBearer({ headers: { authorization: 'Bearer ' + key } }, key));
assert.equal(validBearer({ headers: {} }, key), false);
for (const attr of ['HttpOnly', 'Secure', 'SameSite=Strict', 'Path=/', 'Max-Age=' + MAX_AGE])
  assert.ok(sessionCookie(session).includes(attr));
assert.ok(sessionCookie('', true).includes('Max-Age=0'));
console.log(
  'PASS: persistent cookie signatures, expiry, key rotation, invalid inputs and cookie protections',
);
