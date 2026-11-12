const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { Diagnostics } = require('../../desktop/services/diagnostics.cjs');

async function fixture(t, options = {}) {
  const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'intercom-diagnostics-'));
  t.after(() => fs.rm(profile, { recursive: true, force: true }));
  return { profile, log: new Diagnostics(profile, { version: 'test', ...options }) };
}

test('IPC failure preserves its error while saving only metadata and actual missing resource evidence', async (t) => {
  const secret = 'PRIVATE_CONVERSATION_DO_NOT_PERSIST';
  const { profile, log } = await fixture(t, { resourcesPath: path.join(os.tmpdir(), 'intercom-missing-diagnostic-resources'),
    metrics: () => [{ pid: 123, type: 'Renderer', name: secret, commandLine: secret, memory: { workingSetSize: 64 } }] });
  const failure = new Error(secret, { cause: Object.assign(new Error(secret), { code: 'ENOENT' }) });
  await assert.rejects(log.run('voice:recognition-ready', () => { throw failure; }), (error) => error === failure);
  const text = await fs.readFile(path.join(profile, 'diagnostics', 'events.jsonl'), 'utf8');
  const lines = text.trim().split('\n').map(JSON.parse);
  assert.equal(lines[1].span, lines[0].span);
  assert.equal(lines[1].error.code, 'ENOENT');
  const snapshot = await fs.readFile(path.join(profile, 'diagnostics', 'last-failure.json'), 'utf8');
  assert.ok(!text.includes(secret) && !snapshot.includes(secret));
  const saved = JSON.parse(snapshot);
  assert.equal(saved.snapshot.resources.length, 3);
  assert.ok(saved.snapshot.resources.every((file) => !file.exists && file.error.code === 'ENOENT'));
  assert.deepEqual(saved.snapshot.processes, [{ pid: 123, type: 'Renderer', workingSetKiB: 64 }]);
});

test('logs append across restarts, rotate to bounded history and omit payload fields', async (t) => {
  const { profile, log } = await fixture(t, { maxBytes: 500, history: 2 });
  await log.record('app.start', { prompt: 'secret audio content', environment: 'secret token' });
  const second = new Diagnostics(profile, { version: 'test', maxBytes: 500, history: 2 });
  await second.record('app.ready');
  let text = await fs.readFile(path.join(log.directory, 'events.jsonl'), 'utf8');
  assert.equal(text.trim().split('\n').length, 2);
  for (let index = 0; index < 30; index++) await second.record('voice.phase', { phase: 'listening' });
  const names = await fs.readdir(log.directory);
  assert.deepEqual(names.sort(), ['events.1.jsonl', 'events.2.jsonl', 'events.jsonl']);
  for (const name of names) {
    text = await fs.readFile(path.join(log.directory, name), 'utf8');
    assert.ok(Buffer.byteLength(text) <= 500);
    assert.ok(!text.includes('secret'));
    for (const line of text.trim().split('\n')) assert.doesNotThrow(() => JSON.parse(line));
  }
});

test('unwritable diagnostics visibly report failure without claiming the operation failed or logs succeeded', async (t) => {
  const notifications = [];
  const { profile, log } = await fixture(t, { onFailure: (status) => notifications.push(status) });
  await fs.writeFile(path.join(profile, 'diagnostics'), 'not a directory');
  assert.equal(await log.run('voice:recognition-ready', () => 'ready'), 'ready');
  assert.match(log.status().error, /Diagnostic persistence failed/);
  assert.ok(notifications.length > 0);
  assert.equal(notifications[0].directory, path.join(profile, 'diagnostics'));
});

test('failure storms have a bounded queue and explicitly report lost events', async (t) => {
  const notifications = [];
  const { log } = await fixture(t, { onFailure: (status) => notifications.push(status) });
  const writes = Array.from({ length: 300 }, () => log.record('renderer.failure', {}, new Error('private')));
  assert.equal(log.queued, 128);
  await Promise.all(writes);
  assert.equal(log.queued, 0);
  assert.equal(log.status().droppedEvents, 172);
  assert.match(notifications[0].error, /queue full/);
});

test('unavailable process collectors are marked unavailable without losing the failure snapshot', async (t) => {
  const fail = () => { throw Object.assign(new Error('private'), { code: 'EACCES' }); };
  const { log } = await fixture(t, { metrics: fail, native: fail });
  await log.record('app.failure', {}, new Error('private'));
  const saved = JSON.parse(await fs.readFile(path.join(log.directory, 'last-failure.json'), 'utf8'));
  assert.equal(saved.snapshot.native.error.code, 'EACCES');
  assert.equal(saved.snapshot.processes.error.code, 'EACCES');
  assert.equal(log.status().error, null);
});
