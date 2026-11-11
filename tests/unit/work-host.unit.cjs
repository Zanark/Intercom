const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm, readFile } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { WorkHost, terminalCommand } = require('../../desktop/services/work.cjs');
const { AcpClient, manualPolicy } = require('../../desktop/services/acp.cjs');
const { EventEmitter } = require('node:events');
const { PassThrough, Writable } = require('node:stream');

const sessionId = '11111111-1111-4111-8111-111111111111';
const agent = 'https://agentclientprotocol.com/protocol/session-modes#agent';
const snapshot = { contexts: [{ id: 'ctx-a', name: 'Test Context', basePath: process.cwd() }] };
function settings() {
  return [
    { id: 'mode', type: 'select', currentValue: 'autopilot', options: [{ value: agent }] },
    { id: 'allow_all', type: 'select', currentValue: 'on', options: [{ value: 'off' }] },
    { id: 'reasoning_effort', type: 'select', currentValue: 'medium', options: [{ value: 'low' }, { value: 'medium' }, { value: 'high' }] },
    { id: 'model', currentValue: 'inherited-model' },
  ];
}
test('ACP verifies manual mode and allow-all OFF before enabling prompts; history replay is not live activity', async () => {
  const updates = []; const changes = []; let options = settings();
  const client = new AcpClient(sessionId, process.cwd(), (event) => updates.push(event), () => {});
  client.start = () => {};
  client.request = async (method, params) => {
    if (method === 'initialize') return { protocolVersion: 1, agentCapabilities: { loadSession: true } };
    if (method === 'session/load') {
      client.accept({ jsonrpc: '2.0', method: 'session/update', params: { sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Old reply' } } } });
      return { configOptions: options };
    }
    if (method === 'session/set_config_option') {
      changes.push([params.configId, params.value]);
      options = options.map((item) => item.id === params.configId ? { ...item, currentValue: params.value } : item);
      return { configOptions: options };
    }
    throw new Error('Unexpected request');
  };
  assert.deepEqual(await client.open('Speed / performance'), {
    model: 'inherited-model', effort: 'low', approval: 'Manual; existing saved approvals still apply',
  });
  assert.deepEqual(changes, [['mode', agent], ['allow_all', 'off'], ['reasoning_effort', 'low']]);
  assert.equal(manualPolicy(options), true);
  assert.equal(updates.length, 0);
  assert.throws(() => client.accept({ jsonrpc: '2.0', method: 'session/update', params: { sessionId: 'other', update: {} } }), /identity changed/);
  assert.throws(() => client.accept({ jsonrpc: '2.0', method: 'session/update', params: {
    sessionId, update: { sessionUpdate: 'config_option_update', configOptions: settings() },
  } }), /manual approval policy/);
});
test('ACP fails closed on unknown inherited approval policy without sending a task', async () => {
  const client = new AcpClient(sessionId, process.cwd(), () => {}, () => {});
  client.start = () => {};
  client.request = async (method) => method === 'initialize' ? { protocolVersion: 1, agentCapabilities: { loadSession: true } } : { configOptions: [] };
  await assert.rejects(client.open('Balanced'), /does not expose/);
  assert.equal(client.ready, false);
  assert.throws(() => client.prompt('Do not send'), /not ready/);
});
test('permission decisions are exact, once-only, session-bound and never offer always-allow', () => {
  const writes = []; let shown;
  const client = new AcpClient(sessionId, process.cwd(), () => {}, (permission) => { shown = permission; });
  client.ready = true;
  client.child = { stdin: { destroyed: false, write: (line) => writes.push(JSON.parse(line)) } };
  client.accept({ jsonrpc: '2.0', id: 8, method: 'session/request_permission', params: {
    sessionId, toolCall: { toolCallId: 'tool-1', rawInput: { command: 'Get-Location' } },
    options: [{ optionId: 'yes', name: 'Yes', kind: 'allow_once' }, { optionId: 'all', name: 'All', kind: 'allow_always' }, { optionId: 'no', name: 'No', kind: 'reject_once' }],
  } });
  assert.equal(shown.options.length, 2);
  assert.throws(() => client.approve('8', 'all'), /stale or invalid/);
  assert.equal(writes.length, 0);
  client.approve('8', 'yes');
  assert.deepEqual(writes[0].result, { outcome: { outcome: 'selected', optionId: 'yes' } });
  assert.throws(() => client.approve('8', 'yes'), /stale/);
  client.accept({ jsonrpc: '2.0', id: 9, method: 'session/request_permission', params: { sessionId: 'foreign' } });
  assert.equal(writes[1].error.code, -32601);
});

async function setup(t, behavior = {}) {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'intercom-work-'));
  let busy = false; let sent = 0; let rejectPrompt; let resolvePrompt; let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const row = { session_id: sessionId, folder: process.cwd(), source: 'copilot_cli', can_resume: true, status: 'idle' };
  const discovery = {
    exclusive: async (_id, operation) => operation({}),
    discover: async () => { if (busy) throw new Error('Session is in use'); return row; },
    async *catalogPages() { yield { sessions: [row] }; },
  };
  const notifications = []; const events = [];
  const host = new WorkHost(profile, () => snapshot, (event) => events.push(structuredClone(event)), async (event) => notifications.push(event.id), {
    discovery,
    connect: (_sessionId, _workspace, update, permission) => ({
      open: async () => ({ model: 'inherited-model', effort: 'low', approval: 'Manual' }),
      prompt: async () => {
        sent++;
        markStarted();
        if (behavior.permission) permission({ id: '1', details: '{"command":"Get-Location"}', options: [{ optionId: 'yes', kind: 'allow_once', name: 'Yes' }, { optionId: 'no', kind: 'reject_once', name: 'No' }] });
        if (behavior.failTool) update({ sessionUpdate: 'tool_call_update', status: 'failed' });
        if (behavior.delayed) return new Promise((resolve, reject) => { resolvePrompt = resolve; rejectPrompt = reject; });
        update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Hello world.' } });
        return { stopReason: 'end_turn' };
      },
      write: () => {},
      approve: () => { if (resolvePrompt) resolvePrompt({ stopReason: 'end_turn' }); },
      stop: async () => { if (rejectPrompt) rejectPrompt(new Error('Stopped owned transport')); },
      fail: (error) => { if (rejectPrompt) rejectPrompt(error); },
      close: async () => {},
    }),
  });
  t.after(async () => { await host.close(); await rm(profile, { recursive: true, force: true }); });
  await host.ready;
  return { host, profile, events, notifications, started, sent: () => sent, setBusy: () => { busy = true; }, discovery };
}
test('a prepared task has no effect; confirmations are one-shot and recheck busy targets', async (t) => {
  const { host, sent, setBusy } = await setup(t);
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Speed / performance');
  assert.equal(sent(), 0);
  setBusy();
  await assert.rejects(host.confirm(proposal.id), /in use/);
  assert.equal(sent(), 0);
  await assert.rejects(host.confirm(proposal.id), /expired or changed/);
  assert.equal(host.active, null);
});
test('background output and receipt survive panel independence and restart without duplicate dispatch', async (t) => {
  const { host, profile, notifications, sent } = await setup(t);
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Speed / performance');
  await host.confirm(proposal.id); await host.running;
  assert.equal(sent(), 1);
  assert.equal(host.job.phase, 'responded');
  assert.deepEqual(host.job.observedContextIds, ['ctx-a']);
  assert.equal(notifications.length, 1);
  const restored = new WorkHost(profile, () => snapshot, () => {}, () => { throw Error('Must not notify on replay'); });
  await restored.ready;
  assert.equal(restored.job.text, 'Hello world.');
  assert.equal(restored.active, null);
  assert.equal(JSON.parse(await readFile(path.join(profile, 'work-receipt.json'), 'utf8')).job.phase, 'responded');
  await assert.rejects(host.prepare('ctx-a', sessionId, 'Another', 'background', 'Balanced'), /Acknowledge/);
  await host.acknowledge(host.job.id);
  assert.equal(host.job.acknowledged, true);
});
test('an unfinished persisted dispatch becomes unknown on recovery and is never retried', async (t) => {
  const { host, profile, sent } = await setup(t);
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Balanced');
  host.job = { ...proposal, phase: 'running', text: '', acknowledged: false };
  await host.save();
  const recovered = new WorkHost(profile, () => snapshot, () => {}, () => {});
  await recovered.ready;
  assert.equal(recovered.job.phase, 'unknown');
  assert.match(recovered.job.error, /no automatic retry/);
  assert.equal(sent(), 0);
});
test('cancellation stops only the owned task and a late outcome cannot become completion', async (t) => {
  const { host, sent, started } = await setup(t, { delayed: true });
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Balanced');
  await host.confirm(proposal.id);
  await started;
  await host.cancel('22222222-2222-4222-8222-222222222222');
  assert.equal(host.active.cancelled, false);
  await host.cancel(proposal.id);
  assert.equal(host.job.phase, 'cancelled');
  assert.equal(sent(), 1);
  assert.equal(host.active, null);
});
test('a failed tool is not hidden by a final ordinary answer', async (t) => {
  const { host } = await setup(t, { failTool: true });
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Accuracy');
  await host.confirm(proposal.id); await host.running;
  assert.equal(host.job.phase, 'failed');
  assert.match(host.job.error, /tool reported failure/);
});
test('cancellation while the running receipt is saving prevents prompt dispatch', async (t) => {
  const { host, sent } = await setup(t);
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Balanced');
  const save = host.save.bind(host); let release; let saving;
  const entered = new Promise((resolve) => { saving = resolve; });
  host.save = async () => {
    if (host.job.phase === 'running') { saving(); await new Promise((resolve) => { release = resolve; }); }
    return save();
  };
  await host.confirm(proposal.id); await entered;
  const cancelled = host.cancel(proposal.id); release(); await cancelled;
  assert.equal(sent(), 0);
  assert.equal(host.job.phase, 'cancelled');
});
test('initial receipt failure never connects or sends and remains visibly failed', async (t) => {
  const { host, sent, events } = await setup(t);
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Balanced');
  host.save = async () => { throw new Error('disk unavailable'); };
  await assert.rejects(host.confirm(proposal.id), /disk unavailable/);
  assert.equal(sent(), 0);
  assert.equal(host.active, null);
  assert.match(events.at(-1).error, /No task was sent/);
});
test('an approval-save failure cannot deliver approval or hide the uncertain dispatched outcome', async (t) => {
  const { host, started } = await setup(t, { permission: true, delayed: true });
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Balanced');
  await host.confirm(proposal.id); await started;
  let delivered = false;
  host.active.client.approve = () => { delivered = true; };
  const save = host.save.bind(host);
  host.save = async () => { if (host.job.lastApproval) { host.save = save; throw new Error('approval disk failure'); } return save(); };
  await assert.rejects(host.approve(proposal.id, '1', 'yes'), /approval disk failure/);
  await host.running;
  assert.equal(delivered, false);
  assert.equal(host.job.phase, 'unknown');
});
test('recovery validates optional UI data and never offers cancellation of a previous-launch process', async (t) => {
  const { host, profile } = await setup(t);
  const proposal = await host.prepare('ctx-a', sessionId, 'Say hello world', 'background', 'Balanced');
  host.job = { ...proposal, phase: 'unknown', text: '', acknowledged: false, cleanupNeeded: true };
  await host.save();
  const recovered = new WorkHost(profile, () => snapshot, () => {}, () => {});
  await recovered.ready;
  assert.equal(recovered.active, null);
  assert.equal(recovered.job.cleanupNeeded, false);
  assert.equal(recovered.job.needsAttention, true);
  assert.match(recovered.job.error, /No previous-launch process is owned/);
  await recovered.acknowledge(proposal.id);
  host.job = { ...host.job, effective: { model: {}, effort: 'low', approval: 'Manual' } }; await host.save();
  const invalid = new WorkHost(profile, () => snapshot, () => {}, () => {});
  await assert.rejects(invalid.ready, /Invalid saved effective policy/);
});
test('ACP decodes split UTF-8 JSONL and fails pending work on malformed streams and abrupt EOF', async () => {
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  child.stdin.once('finish', () => { child.exitCode = 0; child.emit('close', 0); });
  const client = new AcpClient(sessionId, process.cwd(), () => {}, () => {}, () => child);
  client.start();
  const first = client.request('test', {});
  const reply = Buffer.from(JSON.stringify({ jsonrpc: '2.0', id: 1, result: { text: 'caf\u00e9' } }) + '\n');
  const split = reply.indexOf(0xc3) + 1;
  child.stdout.write(reply.subarray(0, split)); child.stdout.write(reply.subarray(split));
  assert.deepEqual(await first, { text: 'caf\u00e9' });
  const pending = client.request('test', {});
  child.stdout.write('{malformed\n');
  await assert.rejects(pending, /Invalid ACP stream/);
  await client.stop();
  assert.equal(client.done, true);
  const other = new EventEmitter();
  other.stdout = new PassThrough(); other.stderr = new PassThrough();
  other.stdin = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const disconnected = new AcpClient(sessionId, process.cwd(), () => {}, () => {}, () => other);
  disconnected.start();
  const unfinished = disconnected.request('test', {});
  other.emit('close', 1);
  await assert.rejects(unfinished, /disconnected/);
  assert.equal(disconnected.pending.size, 0);
});
test('terminal launch keeps hostile task text in encoded data and never automatically sends it', () => {
  const malicious = 'hello; Start-Process calc.exe\n"$(exit)"';
  const args = terminalCommand({ sessionId, workspace: process.cwd(), request: malicious });
  const script = Buffer.from(args.at(-1), 'base64').toString('utf16le');
  assert.equal(script.includes(malicious), false);
  const payload = JSON.parse(Buffer.from(script.match(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/)[1], 'base64').toString('utf8'));
  assert.equal(payload.request, malicious);
  assert.equal(script.includes(' -i '), false);
  assert.equal(script.includes('Invoke-Expression'), false);
});
