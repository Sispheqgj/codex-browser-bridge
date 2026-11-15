import assert from 'node:assert/strict';
import { ModelSettings, validateChoice } from '../src/server/model-settings.mjs';
const models = [
  { model: 'work', name: 'Work', efforts: ['low', 'high', 'ultra'], defaultEffort: 'low' },
  { model: 'light', name: 'Light', efforts: ['low', 'high'], defaultEffort: 'high' },
];
assert.equal(validateChoice(models, 'work', null).model, 'work');
assert.throws(() => validateChoice(models, 'light', 'ultra'), /不支持该思考强度/);
assert.throws(() => validateChoice(models, 'missing', 'low'), /不支持这个模型/);
let actual = { model: 'work', reasoningEffort: 'high' },
  loaded = false;
const updates = [];
const ipc = {
  async request(method, params) {
    if (method === 'thread-owner-discovery') {
      if (!loaded) throw new Error('no owner');
      return { handledByClientId: 'owner' };
    }
    if (method === 'thread-follower-read-model-settings') return { result: { settings: actual } };
    if (method === 'thread-follower-update-thread-settings') {
      updates.push(params);
      actual = {
        model: params.threadSettings.model,
        reasoningEffort: params.threadSettings.effort,
      };
      return { result: { applied: true } };
    }
    throw new Error('unexpected method ' + method);
  },
};
const catalog = { get: (id) => (id === 'mac' ? { hostId: 'local' } : null) },
  service = new ModelSettings({
    catalog,
    clients: new Map(),
    desktopIpc: ipc,
    connected: () => {
      throw new Error('must not resume a local thread');
    },
    path: null,
  });
service.list = async () => models;
const pending = await service.set('mac', 'original-thread-id', { model: 'light', effort: null });
assert.equal(pending.pending, true);
assert.equal(updates.length, 0);
assert.deepEqual(await service.forMessage('mac', 'original-thread-id'), {
  model: 'light',
  thinking: 'high',
});
service.sent('mac', 'original-thread-id');
assert.deepEqual(await service.forMessage('mac', 'original-thread-id'), {});
loaded = true;
await service.set('mac', 'original-thread-id', { model: 'work', effort: 'ultra' });
assert.equal(updates[0].conversationId, 'original-thread-id');
assert.deepEqual(updates[0].threadSettings, { model: 'work', effort: 'ultra' });
assert.equal((await service.get('mac', 'original-thread-id')).settings.effort, 'ultra');
actual = { model: 'light', reasoningEffort: 'low' };
assert.equal(
  (await service.get('mac', 'original-thread-id')).settings.model,
  'light',
  'desktop changes must stay authoritative',
);
await assert.rejects(
  service.set('mac', 'original-thread-id', { model: 'light', effort: 'ultra' }),
  /不支持该思考强度/,
);
assert.equal(updates.length, 1, 'invalid selections must not update the native session');
console.log(
  'PASS: supported model/effort validation, original-thread updates, unloaded-session next-message settings and desktop synchronization',
);
