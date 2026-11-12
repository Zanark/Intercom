const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { setTimeout: delay } = require('node:timers/promises');
const { SessionCatalog, overlapsWorkspace } = require('../../desktop/services/session-catalog.cjs');
const { OrchestrationHost } = require('../../desktop/services/orchestration.cjs');
const { WorkHost } = require('../../desktop/services/work.cjs');
const { ResearchHost } = require('../../desktop/services/research.cjs');

const x = '22222222-2222-4222-8222-222222222222';
const y = '33333333-3333-4333-8333-333333333333';
const z = '44444444-4444-4444-8444-444444444444';
const work = (id, sessionId, after = []) => ({ id, kind: 'work', sessionId, request: 'Refresh context.', after });
const status = (id, sessionId, after = []) => ({ id, kind: 'status', sessionId, request: '', after });
const after = (actionId, outcome = 'finished') => ({ actionId, outcome });
const plan = (actions, excludedStatusSessionIds = []) => ({
  version: 1, intent: 'plan', normalizedText: 'Fictional test command.',
  message: 'Execute the requested fictional actions.', actions, excludedStatusSessionIds,
});
async function until(predicate) {
  const end = Date.now() + 5000;
  while (!predicate()) {
    if (Date.now() > end) throw new Error('Fixture did not reach its expected state.');
    await delay(5);
  }
}
async function directories(t, cleanup = true) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'intercom-orchestration-'));
  if (cleanup) t.after(() => fs.rm(root, { recursive: true, force: true }));
  const a = path.join(root, 'a'); const b = path.join(root, 'b');
  await Promise.all([fs.mkdir(a), fs.mkdir(b)]);
  return { root, a, b };
}
function discovery(rows) {
  return {
    exclusive: async (_id, operation) => operation({ cancelled: false }),
    async *catalogPages() { yield { sessions: rows() }; },
    discover: async (_operation, id) => {
      const row = rows().find((item) => item.session_id === id);
      if (!row || row.status !== 'idle') throw new Error('Session is unavailable or in use.');
      return row;
    },
  };
}

test('catalog binds names/IDs to canonical roots, keeps busy metadata and rejects duplicate ownership', async (t) => {
  const { root, a, b } = await directories(t);
  const alias = path.join(root, 'alias');
  await fs.symlink(a, alias, process.platform === 'win32' ? 'junction' : 'dir');
  let contexts = [{ id: 'a', name: 'Fictional A', basePath: a }, { id: 'b', name: 'Fictional B', basePath: b }];
  const rows = [
    { session_id: x, summary: 'Session X', folder: alias, can_resume: true, source: 'copilot_cli', status: 'idle' },
    { session_id: z, summary: 'Session Z', folder: b, can_resume: true, source: 'copilot_cli', status: 'in_use' },
  ];
  const catalog = new SessionCatalog(root, () => ({ contexts }), { discovery: discovery(() => rows) });
  const snapshot = await catalog.read(randomUUID());
  assert.deepEqual(snapshot.sessions.map((row) => [row.id, row.name, row.contextId, row.status]), [
    [x, 'Session X', 'a', 'idle'], [z, 'Session Z', 'b', 'busy'],
  ]);
  assert.equal(snapshot.sessions[0].workspace, await fs.realpath(a));
  assert.equal(overlapsWorkspace(a, path.join(alias, 'child')), false);
  assert.equal(overlapsWorkspace(a, path.join(a, 'child')), true);
  assert.equal(overlapsWorkspace(a, a + '-other'), false);
  contexts.push({ id: 'duplicate', name: 'Duplicate', basePath: alias });
  await assert.rejects(catalog.read(randomUUID()), /same workspace/);
  contexts = contexts.slice(0, 2);
  rows.push(rows[0]);
  await assert.rejects(catalog.read(randomUUID()), /duplicate session/);
});

test('catalog reports missing roots, rejects bad names and serializes simultaneous reads', async (t) => {
  const { root, a } = await directories(t);
  const rows = [{ session_id: x, summary: 'Session X', folder: a, can_resume: true, source: 'copilot_cli', status: 'idle' }];
  const adapter = discovery(() => rows); let active = 0; let peak = 0;
  adapter.exclusive = async (_id, operation) => {
    active++; peak = Math.max(peak, active);
    await delay(5);
    try { return await operation({}); } finally { active--; }
  };
  const catalog = new SessionCatalog(root, () => ({ contexts: [
    { id: 'a', name: 'A', basePath: a }, { id: 'missing', name: 'Missing', basePath: path.join(root, 'missing') },
  ] }), { discovery: adapter });
  const snapshots = await Promise.all([catalog.read(randomUUID()), catalog.read(randomUUID())]);
  assert.equal(peak, 1);
  assert.match(snapshots[0].warnings[0], /missing.*ENOENT/);
  rows[0].summary = 42;
  await assert.rejects(catalog.read(randomUUID()), /malformed/);
  rows[0].summary = 'x'.repeat(1001);
  await assert.rejects(catalog.read(randomUUID()), /name/);
});

test('unnamed sessions retain exact distinct IDs and warnings without blocking named sessions', async (t) => {
  const { root, a } = await directories(t);
  const rows = [x, y, z].map((id, index) => ({
    session_id: id, summary: index === 2 ? 'Named session' : '', folder: a,
    can_resume: true, source: 'copilot_cli', status: index === 1 ? 'in_use' : 'idle',
  }));
  const catalog = new SessionCatalog(root, () => ({ contexts: [{ id: 'a', name: 'A', basePath: a }] }),
    { discovery: discovery(() => rows) });
  for (const missing of ['', ' \t ', null, undefined]) {
    rows[0].summary = missing;
    const snapshot = await catalog.read(randomUUID());
    assert.deepEqual(snapshot.sessions.map(({ id, name, status }) => [id, name, status]), [
      [x, `Unnamed session (${x})`, 'idle'], [y, `Unnamed session (${y})`, 'busy'], [z, 'Named session', 'idle'],
    ]);
    assert.equal(snapshot.warnings.length, 2);
    assert.match(snapshot.warnings[0], /Agency supplied no catalog name.*exact ID/);
  }
});

async function fixture(t, options = {}) {
  const { root, a, b } = await directories(t, false);
  const contexts = [{ id: 'a', name: 'A', basePath: a }, { id: 'b', name: 'B', basePath: b }];
  const sessions = [x, y, z].map((id, index) => ({
    id, name: ['X', 'Y', 'Z'][index], status: 'idle', contextId: index === 2 ? 'b' : 'a',
    contextName: index === 2 ? 'B' : 'A', workspace: index === 2 ? b : a,
  }));
  const rows = () => sessions.map((row) => ({
    session_id: row.id, folder: row.workspace, status: row.status, can_resume: true, source: 'copilot_cli',
  }));
  const pending = new Map(); const sent = []; const approvals = []; const clients = [];
  let peak = 0; let catalogReads = 0; let host;
  const dependencies = {
    ...(options.research ? { research: options.research } : {}),
    interpreter: options.interpreter ?? {
      interpret: async () => plan([work('refresh-x', x)]), cancel: async () => {}, close: async () => {},
    },
    catalog: {
      read: async () => { catalogReads++; return { sessions: structuredClone(sessions), warnings: [], observedAt: new Date().toISOString() }; },
      close: async () => {},
    },
    makeWork: (profile, mesh, publish, notify, controls) => {
      options.beforePrepare?.(sessions);
      return new WorkHost(profile, mesh, publish, notify, {
        ...controls, discovery: discovery(rows),
        connect: (sessionId, _workspace, update, permission) => {
          const client = {
            done: false,
            open: async () => ({ model: 'fixture', effort: 'low', approval: 'Manual' }),
            prompt: () => new Promise((resolve, reject) => {
              sent.push(sessionId);
              pending.set(sessionId, { resolve, reject, update });
              peak = Math.max(peak, pending.size);
              if (options.permission) permission({ id: 'permission-1', details: '{"command":"fixture"}',
                options: [{ optionId: 'yes', kind: 'allow_once', name: 'Yes' }, { optionId: 'no', kind: 'reject_once', name: 'No' }] });
            }),
            approve: (permissionId, optionId) => approvals.push([sessionId, permissionId, optionId]),
            write: () => {},
            fail: (error) => pending.get(sessionId)?.reject(error),
            stop: async () => {
              client.done = true;
              pending.get(sessionId)?.reject(new Error('Stopped owned fixture transport.'));
              pending.delete(sessionId);
            },
            close: async () => {
              if (options.cleanupFailure && !client.done) throw new Error('Fixture cleanup failure.');
              client.done = true; pending.delete(sessionId);
            },
          };
          clients.push(client);
          return client;
        },
      });
    },
  };
  host = new OrchestrationHost(root, () => ({ contexts }), options.publish ?? (() => {}), dependencies);
  t.after(async () => { await host.close(); await fs.rm(root, { recursive: true, force: true }); });
  await host.ready;
  const complete = (id, text = `Fixture response for ${id}.`) => {
    const item = pending.get(id);
    assert.ok(item, 'Expected an actually dispatched fixture action');
    item.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text } });
    item.resolve({ stopReason: 'end_turn' });
  };
  return { host, root, sessions, sent, approvals, pending, clients, complete, dependencies,
    peak: () => peak, catalogReads: () => catalogReads };
}

test('clarification context carries the full unresolved request once, refreshes discovery and clears after a reply', async (t) => {
  const inputs = [];
  const question = { version: 1, intent: 'clarify', normalizedText: 'Refresh X, not Y.',
    message: 'Which existing X session?', actions: [], excludedStatusSessionIds: [] };
  const f = await fixture(t, { interpreter: {
    interpret: async (_id, text, _rows, _priority, _contexts, clarification) => {
      inputs.push({ text, clarification });
      return inputs.length === 1 ? question : { ...question, intent: 'reply', normalizedText: text, message: 'No work sent.' };
    }, cancel: async () => {}, close: async () => {},
  } });
  await f.host.request(randomUUID(), 'Refresh X, not Y.', 'Speed / performance');
  await f.host.request(randomUUID(), 'Actually, do not run anything.', 'Speed / performance');
  await f.host.request(randomUUID(), 'Hello.', 'Speed / performance');
  assert.deepEqual(inputs, [
    { text: 'Refresh X, not Y.', clarification: undefined },
    { text: 'Actually, do not run anything.', clarification: { request: question.normalizedText, question: question.message } },
    { text: 'Hello.', clarification: undefined },
  ]);
  assert.equal(f.catalogReads(), 3);
  assert.deepEqual(f.sent, []);
  assert.deepEqual(await f.host.state(), []);
});

test('research survives live catalog failure, receives only context routing metadata and never makes a work transport', async (t) => {
  const { root, a } = await directories(t);
  const store = path.join(a, '.agent-context');
  await fs.mkdir(store);
  for (const name of ['STATE.md', 'MEMORY.md', 'JOURNAL.md', 'README.md']) {
    await fs.writeFile(path.join(store, name), '# AzRetroFit\n\nImplemented only a fictional fixture. Not deployed.\n');
  }
  const mesh = { demo: false, contexts: [{ id: 'a', name: 'AzRetroFit', basePath: a, aliases: ['AZ Retrofit'] }],
    edges: [], source: path.join(root, 'mesh.json'), generatedAt: new Date().toISOString() };
  let interpreted = 0; let opened = 0;
  const host = new OrchestrationHost(root, () => mesh, () => {}, {
    catalog: { read: async () => { throw new Error('Fixture catalog unavailable'); }, close: async () => {} },
    interpreter: { interpret: async (_id, text, rows, _profile, contexts) => {
      interpreted++;
      assert.equal(text, 'Get all sessions that worked on AZ Retrofit.');
      assert.deepEqual(rows, []);
      assert.equal(contexts[0].name, 'AzRetroFit');
      return { version: 1, intent: 'research', normalizedText: text, message: 'Inspect saved evidence.',
        actions: [], excludedStatusSessionIds: [], research: { topic: 'AzRetroFit', includeSessionHistory: true } };
    }, cancel: async () => {}, close: async () => {} },
    makeWork: () => { throw new Error('Research must never make a work host'); },
    openReport: async () => { opened++; return ''; },
  });
  t.after(() => host.close());
  const result = await host.request(randomUUID(), 'Get all sessions that worked on AZ Retrofit.', 'Speed / performance');
  assert.equal(interpreted, 1);
  assert.equal(opened, 1);
  assert.equal(result.planId, null);
  assert.equal(result.researchReport.contexts, 1);
  assert.equal(result.researchReport.filesRead, 4);
  assert.equal(result.researchReport.opened, true);
  assert.match(result.warnings[0], /Fixture catalog unavailable/);
  assert.match(result.interpretation.message, /does not prove access/);
  assert.deepEqual(await host.state(), []);
});

test('explicit research intent collects real fixture evidence, queues its exact session and opens a validated cited synthesis', async (t) => {
  const f = await fixture(t);
  const context = f.host.mesh().contexts[0];
  const store = path.join(context.basePath, '.agent-context');
  await fs.mkdir(store);
  for (const name of ['STATE.md', 'MEMORY.md', 'JOURNAL.md', 'README.md']) {
    await fs.writeFile(path.join(store, name), '# Fixture project\n\nPlanning only. No deployment verified.\n');
  }
  const opened = [];
  f.host.research = new ResearchHost(f.root, { historyRoot: path.join(f.root, 'no-histories'),
    openPath: async (file) => { opened.push(file); return ''; } });
  f.host.mesh = () => ({ demo: false, contexts: [context], edges: [], generatedAt: new Date().toISOString() });
  f.host.interpreter.interpret = async () => ({ ...plan([]), intent: 'research',
    research: { topic: 'Fixture project', includeSessionHistory: false, synthesisSessionId: x } });
  const id = randomUUID();
  const result = await f.host.request(id, 'Research Fixture project and ask X for cited synthesis.', 'Speed / performance');
  assert.equal(result.planId, id);
  assert.equal(result.researchReport.filesRead, 4);
  await until(() => f.pending.has(x));
  assert.deepEqual(f.sent, [x]);
  const { report } = await f.host.research.evidence(id);
  const source = report.contexts[0].sources[0];
  assert.match(f.host.plans[0].interpretation.actions[0].request, new RegExp(id));
  f.complete(x, JSON.stringify({ version: 1, summary: 'Only saved fixture planning is evidenced.',
    findings: [{ text: 'Deployment is not verified.', citations: [{ path: source.path, line: source.excerpts[0].startLine }] }],
    nextSteps: ['Review the documented gaps.'] }));
  await until(() => f.host.plans[0].phase === 'finished');
  const action = f.host.plans[0].actions[0];
  assert.equal(action.phase, 'responded');
  assert.equal(action.researchError, undefined);
  assert.equal(action.researchReport.synthesisSessionId, x);
  assert.equal(action.researchReport.opened, true);
  assert.deepEqual(opened, [result.researchReport.path, action.researchReport.path]);
  assert.match(await fs.readFile(action.researchReport.path, 'utf8'), /EXISTING-SESSION COPILOT SYNTHESIS/);
});

test('selected synthesis binds a report to the existing idle target and preserves manual approvals and durable provenance', async (t) => {
  const reportId = randomUUID();
  const saved = [];
  const research = {
    evidence: async (id) => { if (id !== reportId) throw new Error('Unowned report'); },
    synthesisRequest: async (id) => { assert.equal(id, reportId); return 'Read only the owned fixture evidence.'; },
    saveSynthesis: async (id, text, provenance) => {
      saved.push({ id, text, provenance });
      return { id, path: path.join(os.tmpdir(), 'fixture-synthesis.html'), opened: true, summary: 'Cited fixture result.' };
    },
  };
  const f = await fixture(t, { research, permission: true });
  await assert.rejects(f.host.researchTargets(randomUUID()), /Unowned/);
  const targets = await f.host.researchTargets(reportId);
  assert.equal(targets.sessions.length, 3);
  assert.equal(f.sent.length, 0);
  f.sessions[0].status = 'busy';
  await assert.rejects(f.host.synthesize(randomUUID(), reportId, x, 'Speed / performance'), /busy/);
  assert.equal(f.sent.length, 0);
  f.sessions[0].status = 'idle';
  const id = randomUUID();
  assert.deepEqual(await f.host.synthesize(id, reportId, x, 'Speed / performance'), { planId: id });
  await until(() => f.host.plans[0]?.actions[0]?.job?.permission);
  assert.deepEqual(f.sent, [x]);
  assert.deepEqual(f.approvals, []);
  const action = f.host.plans[0].actions[0];
  await f.host.approve(id, action.id, action.job.id, 'permission-1', 'yes');
  f.complete(x, '{"fixture":"cited response"}');
  await until(() => f.host.plans[0].phase === 'finished');
  assert.deepEqual(f.approvals, [[x, 'permission-1', 'yes']]);
  assert.deepEqual(saved, [{ id: reportId, text: '{"fixture":"cited response"}', provenance: { requestId: id, sessionId: x } }]);
  assert.equal(action.researchReport.summary, 'Cited fixture result.');
  assert.equal(f.host.plans[0].researchReportId, reportId);
  await assert.rejects(f.host.synthesize(randomUUID(), reportId, x, 'Speed / performance'), /already owns/);
  assert.equal(JSON.parse(await fs.readFile(path.join(f.host.root, 'plans.json'), 'utf8')).plans[0].researchReportId, reportId);
});

test('synthesis failures retain the ordinary response and cancellation cannot produce a completed report', async (t) => {
  let release;
  let entered = false;
  let cancelCase = false;
  const research = {
    evidence: async () => {},
    synthesisRequest: async () => 'Read the owned fixture evidence only.',
    saveSynthesis: async (_id, _text, _provenance, cancelled) => {
      entered = true;
      if (cancelCase) await new Promise((resolve) => { release = resolve; });
      assert.equal(cancelled(), cancelCase);
      throw new Error(cancelCase ? 'Fixture synthesis cancelled.' : 'Invalid fixture citation.');
    },
  };
  const f = await fixture(t, { research });
  await f.host.synthesize(randomUUID(), randomUUID(), x, 'Speed / performance');
  await until(() => f.pending.has(x)); f.complete(x, 'Unstructured fixture output.');
  await until(() => f.host.plans[0].phase === 'finished');
  assert.equal(f.host.plans[0].actions[0].phase, 'responded');
  assert.match(f.host.plans[0].actions[0].researchError, /Invalid fixture citation/);
  assert.equal(f.host.plans[0].actions[0].job.text, 'Unstructured fixture output.');
  cancelCase = true; entered = false;
  const id = randomUUID();
  await f.host.synthesize(id, randomUUID(), z, 'Speed / performance');
  await until(() => f.pending.has(z)); f.complete(z);
  await until(() => entered);
  const current = f.host.plans.find((item) => item.id === id);
  assert.equal(current.phase, 'active');
  assert.equal(current.actions[0].phase, 'running');
  await f.host.cancel(id); release();
  await until(() => current.actions[0].phase === 'cancelled');
  assert.equal(current.actions[0].researchReport, undefined);
});

test('executes X/Y/Z with workspace exclusion, conditional status and no Y check', async (t) => {
  const f = await fixture(t);
  const id = randomUUID();
  await f.host.submit(id, plan([
    work('refresh-x', x), work('refresh-y', y), work('refresh-z', z),
    status('check-x', x), status('check-z', z, [after('refresh-x')]),
  ], [y]), 'Speed / performance');
  await until(() => f.sent.length === 2);
  assert.deepEqual([...f.sent].sort(), [x, z].sort());
  f.complete(x);
  await until(() => f.sent.includes(y));
  const current = f.host.plans[0];
  await until(() => current.actions.find((row) => row.id === 'check-z').phase === 'succeeded');
  const checked = current.actions.find((row) => row.id === 'check-z').status;
  assert.equal(checked.receipt.phase, 'running');
  assert.equal(Object.hasOwn(checked, 'completed'), false);
  f.complete(y); f.complete(z);
  await until(() => current.phase === 'finished');
  assert.equal(f.peak(), 2);
  assert.equal(f.catalogReads(), 3);
  assert.equal(current.actions.filter((row) => row.status).length, 2);
  assert.deepEqual(current.interpretation.excludedStatusSessionIds, [y]);
});

test('fresh busy state and changed canonical workspace refuse dispatch', async (t) => {
  const f = await fixture(t, { beforePrepare: (sessions) => { sessions[0].workspace = sessions[2].workspace; } });
  f.sessions[0].status = 'busy';
  await assert.rejects(f.host.submit(randomUUID(), plan([work('a', x)]), 'Balanced'), /busy/);
  f.sessions[0].status = 'idle';
  await f.host.submit(randomUUID(), plan([work('a', x)]), 'Balanced');
  await until(() => f.host.plans[0].phase === 'finished');
  assert.equal(f.sent.length, 0);
  assert.equal(f.host.plans[0].actions[0].phase, 'failed');
});

test('uncertain transport does not release a finished dependency; ordinary answer does not prove succeeded', async (t) => {
  const f = await fixture(t);
  await f.host.submit(randomUUID(), plan([work('a', x), work('b', y, [after('a')])]), 'Balanced');
  await until(() => f.pending.has(x));
  f.pending.get(x).reject(new Error('Fixture stream disconnected.'));
  await until(() => f.host.plans[0].phase === 'unknown');
  assert.equal(f.host.plans[0].actions[1].phase, 'blocked');
  assert.deepEqual(f.sent, [x]);
  await assert.rejects(f.host.submit(randomUUID(), plan([work('a', y)]), 'Balanced'), /acknowledge/);
  await f.host.acknowledge(f.host.plans[0].id);
  await f.host.submit(randomUUID(), plan([work('a', x), work('b', y, [after('a', 'succeeded')])]), 'Balanced');
  await until(() => f.pending.has(x));
  f.complete(x);
  await until(() => f.host.plans[1].phase === 'finished');
  assert.equal(f.host.plans[1].actions[1].phase, 'blocked');
  assert.deepEqual(f.sent, [x, x]);
});

test('cancellation stops owned jobs, cancels queued actions and cannot turn late output into completion', async (t) => {
  const f = await fixture(t);
  const id = randomUUID();
  await f.host.submit(id, plan([work('a', x), work('b', y), work('c', z)]), 'Balanced');
  await until(() => f.pending.size === 2);
  const late = f.pending.get(x);
  await f.host.cancel(id);
  late.update({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'Late fictional answer.' } });
  late.resolve({ stopReason: 'end_turn' });
  await until(() => f.host.operations.size === 0);
  assert.equal(f.host.plans[0].phase, 'cancelled');
  assert.equal(f.host.plans[0].actions[1].phase, 'cancelled');
  assert.equal(f.sent.includes(y), false);
  assert.equal(f.host.active.size, 0);
  assert.ok(f.host.plans[0].actions.every((row) => row.phase === 'cancelled'));
});

test('approval is bound to the exact active plan/action/job and retains one-shot WorkHost mediation', async (t) => {
  const f = await fixture(t, { permission: true });
  const id = randomUUID();
  await f.host.submit(id, plan([work('a', x)]), 'Balanced');
  await until(() => f.host.plans[0].actions[0].phase === 'awaiting-approval');
  const action = f.host.plans[0].actions[0];
  await assert.rejects(f.host.approve(id, 'a', randomUUID(), 'permission-1', 'yes'), /stale/);
  await assert.rejects(f.host.approve(id, 'a', action.job.id, 'permission-1', 'all'), /Invalid approval/);
  assert.equal(f.approvals.length, 0);
  await f.host.approve(id, 'a', action.job.id, 'permission-1', 'yes');
  await assert.rejects(f.host.approve(id, 'a', action.job.id, 'permission-1', 'yes'), /no longer active/);
  assert.deepEqual(f.approvals, [[x, 'permission-1', 'yes']]);
  f.complete(x);
  await until(() => f.host.plans[0].phase === 'finished');
});

test('recovery marks unfinished actions unknown without retrying, owning or cancelling old-launch work', async (t) => {
  const f = await fixture(t);
  await f.host.submit(randomUUID(), plan([work('a', x), work('b', y, [after('a')])]), 'Balanced');
  await until(() => f.pending.has(x));
  await f.host.save();
  const recovered = new OrchestrationHost(f.root, () => null, () => {}, {
    ...f.dependencies, makeWork: () => { throw new Error('Recovery must not start work.'); },
  });
  await recovered.ready;
  assert.equal(recovered.plans[0].phase, 'unknown');
  assert.ok(recovered.plans[0].actions.every((row) => row.phase === 'unknown'));
  assert.equal(recovered.active.size, 0);
  await recovered.close();
  assert.equal(f.clients[0].done, false);
  assert.deepEqual(f.sent, [x]);
  f.complete(x);
  await until(() => f.sent.includes(y));
  f.complete(y);
  await until(() => f.host.plans[0].phase === 'finished');
});

test('malformed nested work and status receipts refuse recovery before reaching the renderer', async (t) => {
  const f = await fixture(t);
  await f.host.submit(randomUUID(), plan([work('a', x), status('s', x, [after('a')])]), 'Balanced');
  await until(() => f.pending.has(x));
  f.complete(x);
  await until(() => f.host.plans[0].phase === 'finished');
  await f.host.tail;
  const file = path.join(f.root, 'orchestration', 'plans.json');
  const valid = JSON.parse(await fs.readFile(file, 'utf8'));
  assert.equal(valid.plans[0].actions[1].status.receipt.phase, 'responded');
  for (const corrupt of [
    (data) => { data.plans[0].actions[0].job.activity = { invalid: 'not renderable text' }; },
    (data) => { data.plans[0].actions[1].status.receipt.phase = 'terminal-opened'; },
  ]) {
    const data = structuredClone(valid); corrupt(data);
    await fs.writeFile(file, JSON.stringify(data));
    const recovered = new OrchestrationHost(f.root, () => null, () => {}, {
      ...f.dependencies, makeWork: () => { throw new Error('Malformed recovery cannot execute work.'); },
    });
    await assert.rejects(recovered.ready, /Invalid saved action/);
    await assert.rejects(recovered.state(), /Invalid saved action/);
    await assert.rejects(recovered.close(), /cleanup/);
  }
  assert.deepEqual(f.sent, [x]);
});

test('duplicate submissions dispatch once and receipt-write failure cannot connect', async (t) => {
  const f = await fixture(t);
  const id = randomUUID();
  const results = await Promise.allSettled([
    f.host.submit(id, plan([work('a', x)]), 'Balanced'),
    f.host.submit(id.toUpperCase(), plan([work('a', x)]), 'Balanced'),
  ]);
  assert.equal(results.filter((row) => row.status === 'fulfilled').length, 1);
  await until(() => f.pending.has(x));
  f.complete(x);
  await until(() => f.host.plans[0].phase === 'finished');
  const before = f.sent.length;
  const save = f.host.save.bind(f.host);
  f.host.save = async () => { throw new Error('Fixture disk failure.'); };
  await assert.rejects(f.host.submit(randomUUID(), plan([work('a', z)]), 'Balanced'), /disk failure/);
  assert.equal(f.sent.length, before);
  f.host.save = save;
});

test('failed cleanup keeps its workspace reserved until owned cleanup is retried', async (t) => {
  const f = await fixture(t, { cleanupFailure: true });
  await f.host.submit(randomUUID(), plan([work('a', x)]), 'Balanced');
  await until(() => f.pending.has(x));
  f.complete(x);
  await until(() => f.host.plans[0].phase === 'unknown');
  assert.equal(f.host.active.size, 1);
  assert.throws(() => f.host.assertAvailable(y, f.sessions[1].workspace), /overlapping workspace/);
  await assert.rejects(f.host.submit(randomUUID(), plan([work('a', y)]), 'Balanced'), /acknowledge/);
  await assert.rejects(f.host.acknowledge(f.host.plans[0].id), /settled/);
  assert.deepEqual(f.sent, [x]);
  await f.host.close();
  assert.equal(f.host.active.size, 0);
});

test('final child-receipt failure remains unknown and blocks unrelated queued work in the same workspace', async (t) => {
  const f = await fixture(t);
  const make = f.host.makeWork;
  f.host.makeWork = (...args) => {
    const child = make(...args);
    const save = child.save.bind(child);
    child.save = async () => {
      if (child.job?.completedAt) throw new Error('Fixture final receipt failure.');
      return save();
    };
    return child;
  };
  await f.host.submit(randomUUID(), plan([work('a', x), work('b', y)]), 'Balanced');
  await until(() => f.pending.has(x));
  f.complete(x);
  await until(() => f.host.plans[0].phase === 'unknown');
  assert.equal(f.host.plans[0].actions[0].phase, 'unknown');
  assert.equal(f.host.plans[0].actions[1].phase, 'blocked');
  assert.deepEqual(f.sent, [x]);
  assert.throws(() => f.host.assertAvailable(y, f.sessions[1].workspace), /unacknowledged uncertain/);
});

test('failed acknowledgment does not release an uncertain workspace or permit a simultaneous submission', async (t) => {
  const f = await fixture(t);
  const id = randomUUID();
  await f.host.submit(id, plan([work('a', x)]), 'Balanced');
  await until(() => f.pending.has(x));
  f.pending.get(x).reject(new Error('Fixture uncertain disconnect.'));
  await until(() => f.host.plans[0].phase === 'unknown' && !f.host.pumping);
  const save = f.host.save.bind(f.host);
  f.host.save = async () => { await delay(5); throw new Error('Fixture acknowledgement disk failure.'); };
  const results = await Promise.allSettled([
    f.host.acknowledge(id),
    f.host.submit(randomUUID(), plan([work('a', y)]), 'Balanced'),
  ]);
  assert.ok(results.every((result) => result.status === 'rejected'));
  assert.equal(f.host.plans[0].acknowledged, false);
  assert.deepEqual(f.sent, [x]);
  f.host.save = save;
});

test('cancel still stops owned transport when its initial plan receipt cannot be saved', async (t) => {
  const f = await fixture(t);
  const id = randomUUID();
  await f.host.submit(id, plan([work('a', x), work('b', y)]), 'Balanced');
  await until(() => f.pending.has(x) && !f.host.pumping);
  const save = f.host.save.bind(f.host);
  let first = true;
  f.host.save = async () => {
    if (first) { first = false; throw new Error('Fixture cancellation disk failure.'); }
    return save();
  };
  await assert.rejects(f.host.cancel(id), /Cancellation encountered/);
  await until(() => f.host.operations.size === 0);
  assert.equal(f.clients[0].done, true);
  assert.equal(f.host.active.size, 0);
  assert.deepEqual(f.sent, [x]);
  assert.match(f.host.failure.message, /persist cancellation/);
});

test('catalog close drains current discovery without starting queued or later reads', async (t) => {
  const { root, a } = await directories(t);
  let release; let starts = 0;
  const adapter = discovery(() => []);
  adapter.exclusive = async (id, operation) => {
    const current = { id, cancelled: false }; adapter.work = current; starts++;
    await new Promise((resolve) => { release = resolve; });
    try { return await operation(current); } finally { adapter.work = null; }
  };
  adapter.cancel = async (id) => { assert.equal(id, adapter.work.id); adapter.work.cancelled = true; release(); };
  const catalog = new SessionCatalog(root, () => ({ contexts: [{ id: 'a', name: 'A', basePath: a }] }), { discovery: adapter });
  const first = catalog.read(randomUUID());
  await until(() => !!release);
  const second = catalog.read(randomUUID());
  const results = Promise.allSettled([first, second]);
  await catalog.close();
  assert.ok((await results).every((item) => item.status === 'rejected'));
  await assert.rejects(catalog.read(randomUUID()), /closed/);
  assert.equal(starts, 1);
});

test('request owns discovery, interpretation and profile, then dispatches a clear plan without another confirmation', async (t) => {
  const calls = [];
  const interpreter = { interpret: async (...args) => { calls.push(args); return plan([work('refresh-x', x)], [y]); },
    cancel: async () => {}, close: async () => {} };
  const f = await fixture(t, { interpreter });
  const id = randomUUID();
  const result = await f.host.request(id, 'Uh refresh X, but do not check Y.', 'Speed / performance');
  assert.equal(result.planId, id);
  assert.equal(calls[0][0], id);
  assert.equal(calls[0][2][0].id, x);
  assert.equal(calls[0][3], 'Speed / performance');
  assert.deepEqual(result.interpretation.excludedStatusSessionIds, [y]);
  await until(() => f.pending.has(x));
  f.complete(x);
  await until(() => f.host.plans[0].phase === 'finished' && !f.host.pumping);
  const recovered = new OrchestrationHost(f.root, () => null, () => {}, f.dependencies);
  await recovered.ready;
  assert.deepEqual(recovered.plans[0].interpretation.excludedStatusSessionIds, [y]);
  await recovered.close();
});

test('reply and clarification never dispatch and stale interpretation workspace/context bindings refuse queueing', async (t) => {
  const f = await fixture(t);
  for (const intent of ['reply', 'clarify']) {
    f.host.interpreter.interpret = async () => ({ ...plan([]), intent });
    assert.equal((await f.host.request(randomUUID(), 'Fictional request.', 'Balanced')).planId, null);
  }
  for (const key of ['workspace', 'contextId']) {
    const original = f.sessions[0][key];
    f.host.interpreter.interpret = async () => {
      f.sessions[0][key] = f.sessions[2][key];
      return plan([work('refresh-x', x)]);
    };
    await assert.rejects(f.host.request(randomUUID(), 'Refresh X.', 'Balanced'), /exact target changed/);
    f.sessions[0][key] = original;
  }
  assert.equal(f.host.plans.length, 0);
  assert.deepEqual(f.sent, []);
});

for (const stage of ['discovery', 'interpretation', 'receipt']) {
  test(`cancelling during ${stage} discards late results before any action can dispatch`, async (t) => {
    const f = await fixture(t);
    const id = randomUUID(); let release; let reached = false;
    const gate = async () => { reached = true; await new Promise((resolve) => { release = resolve; }); };
    if (stage === 'discovery') {
      const read = f.host.catalog.read;
      f.host.catalog.read = async () => { await gate(); return read(); };
      f.host.catalog.cancel = async (requestId) => { assert.equal(requestId, id); release(); };
    } else if (stage === 'interpretation') {
      f.host.interpreter.interpret = async () => { await gate(); return plan([work('refresh-x', x)]); };
      f.host.interpreter.cancel = async (requestId) => { assert.equal(requestId, id); release(); };
    } else {
      const save = f.host.save.bind(f.host); let first = true;
      f.host.save = async () => { if (first) { first = false; await gate(); } return save(); };
      f.host.interpreter.cancel = async () => release();
    }
    const outcome = assert.rejects(f.host.request(id, 'Refresh X.', 'Balanced'), /cancelled/);
    await until(() => reached);
    await f.host.cancelRequest(randomUUID());
    assert.equal(f.host.requesting.cancelled, false);
    await f.host.cancelRequest(id);
    await outcome;
    assert.equal(f.host.requesting, null);
    assert.deepEqual(f.sent, []);
    assert.ok(f.host.plans.every((item) => item.cancelled));
  });
}

test('close attempts owned transport and catalog cleanup even if interpreter cleanup fails', async (t) => {
  const f = await fixture(t);
  await f.host.submit(randomUUID(), plan([work('a', x)]), 'Balanced');
  await until(() => f.pending.has(x));
  let catalogClosed = false;
  f.host.catalog.close = async () => { catalogClosed = true; };
  f.host.interpreter.close = async () => { throw new Error('Fixture controller cleanup failure.'); };
  await assert.rejects(f.host.close(), /cleanup encountered/);
  assert.equal(f.clients[0].done, true);
  assert.equal(catalogClosed, true);
  f.host.interpreter.close = async () => {};
});

test('research activity is bounded, retains all observed owners, stays transient and rejects cancelled late progress', async (t) => {
  const published = [];
  let release;
  let publishProgress;
  const f = await fixture(t, { publish: (state) => published.push(state), research: {
    run: async (_id, _query, _mesh, _signal, progress) => {
      publishProgress = progress;
      for (let sequence = 1; sequence <= 140; sequence++) progress({ phase: 'researching', event: {
        sequence, at: new Date().toISOString(), contextIds: [sequence === 1 ? 'a' : 'b'],
        kind: 'continuity notes', path: 'fixture-only.md', status: 'read', filesRead: sequence, unavailableSources: 0,
      } });
      await new Promise((resolve) => { release = resolve; });
      return { contexts: 2, filesRead: 140, readableHistories: 0, matchingHistories: 0, partial: false, opened: true };
    },
  } });
  f.host.interpreter.interpret = async () => ({ ...plan([]), intent: 'research',
    research: { topic: 'Fixture', includeSessionHistory: false } });
  const id = randomUUID();
  const outcome = assert.rejects(f.host.request(id, 'Find fixture context.', 'Balanced'), /cancelled/);
  await until(() => !!release);
  assert.equal(f.host.requestActivity.events.length, 128);
  assert.deepEqual(f.host.requestActivity.observedContextIds, ['a', 'b']);
  assert.ok(published.length < 10, 'Source reads should be coalesced, not flood renderer IPC');
  const cancellation = f.host.cancelRequest(id);
  publishProgress({ phase: 'opening' });
  release();
  await cancellation; await outcome;
  assert.equal(f.host.requestActivity.phase, 'cancelled');
  assert.deepEqual(f.sent, []);
  const before = published.length;
  publishProgress({ phase: 'finished' });
  await delay(150);
  assert.equal(published.length, before);
  assert.equal(f.host.requestActivity.phase, 'cancelled');
  const recovered = new OrchestrationHost(f.root, () => ({ contexts: [] }), () => {}, f.dependencies);
  await recovered.ready;
  assert.equal(recovered.requestActivity, undefined);
  await recovered.close();
});
