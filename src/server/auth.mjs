import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

export const COOKIE = '__Host-codex_bridge_session';
export const MAX_AGE = 180 * 24 * 60 * 60;
const equal = (a, b) => {
  const x = Buffer.from(a || ''),
    y = Buffer.from(b || '');
  return x.length === y.length && timingSafeEqual(x, y);
};
const sign = (body, key) =>
  createHmac('sha256', key)
    .update('codex-browser-cookie-v1:' + body)
    .digest('base64url');
export function validBearer(req, key) {
  return equal(req.headers.authorization?.replace(/^Bearer /, '') || '', key);
}
export function createSession(key, now = Date.now()) {
  const payload = Buffer.from(
    JSON.stringify({ id: randomUUID(), expires: Math.floor(now / 1000) + MAX_AGE }),
  ).toString('base64url');
  return payload + '.' + sign(payload, key);
}
export function validSession(req, key, now = Date.now()) {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(COOKIE + '='))
    ?.slice(COOKIE.length + 1);
  if (!cookie || cookie.length > 1000) return false;
  const [payload, signature, ...extra] = cookie.split('.');
  if (extra.length || !signature || !equal(signature, sign(payload, key))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return (
      typeof data.id === 'string' &&
      Number.isSafeInteger(data.expires) &&
      data.expires > Math.floor(now / 1000)
    );
  } catch {
    return false;
  }
}
export function sessionCookie(value, clear = false) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${clear ? 0 : MAX_AGE}`;
}
