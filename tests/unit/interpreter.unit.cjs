const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, rm } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { RestrictedInterpreter, validateInterpretation, catalogForInterpretation } = require('../../desktop/services/interpreter.cjs');

const requestId = '11111111-1111-4111-8111-111111111111';
const x = '22222222-2222-4222-8222-222222222222';
const y = '33333333-3333-4333-8333-333333333333';
const z = '44444444-4444-4444-8444-444444444444';
const catalog = [x, y, z].map((id, index) => ({ id, name: ['X', 'Y', 'Z'][index], contextName: 'Fictional', status: 'idle' }));
const work = (id, sessionId, after = []) => ({ id, kind: 'work', sessionId, request: 'Refresh context.', after });
const status = (id, sessionId, after = []) => ({ id, kind: 'status', sessionId, request: '', after });
const after = (actionId, outcome = 'finished') => ({ actionId, outcome });
const plan = () => ({
  version: 1, intent: 'plan',
  normalizedText: 'Refresh X, Y and Z. Check X; when X finishes, check Z. Do not check Y.',
  message: 'Refresh X, Y and Z; check X, then Z after X finishes. Do not check Y.',
  actions: [work('refresh-x', x), work('refresh-y', y), work('refresh-z', z),
    status('check-x', x), status('check-z', z, [after('refresh-x')])],
  excludedStatusSessionIds: [y],
});

test('research collection is read-only and only an exact eligible synthesis identity can be added', async (t) => {
  const research = { version: 1, intent: 'research', normalizedText: 'Find AzRetroFit history.',
    message: 'Inspect saved context and session evidence.', actions: [], excludedStatusSessionIds: [],
    research: { topic: 'AzRetroFit', includeSessionHistory: true } };
  assert.deepEqual(validateInterpretation(research, []), research);
  const synthesis = { ...research, research: { ...research.research, synthesisSessionId: x } };
  assert.deepEqual(validateInterpretation(synthesis, catalog), synthesis);
  assert.throws(() => validateInterpretation(synthesis, []), /Nothing was dispatched/);
  assert.throws(() => validateInterpretation(synthesis, catalog.map((row) => ({ ...row, status: 'busy' }))), /Nothing was dispatched/);
  for (const mutate of [
    (value) => { value.actions.push(work('forbidden', x)); },
    (value) => { value.research.path = 'C:\\private'; },
    (value) => { value.research.topic = 'x'.repeat(121); },
    (value) => { value.research.includeSessionHistory = 'true'; },
    (value) => { value.intent = 'reply'; },
  ]) {
    const invalid = structuredClone(research); mutate(invalid);
    assert.throws(() => validateInterpretation(invalid, catalog), /Nothing was dispatched/);
  }
  const f = await fixture(t, { content: JSON.stringify(research) });
  await f.interpreter.interpret(requestId, 'Find easy retrofit sessions.', [], 'Speed / performance',
    [{ id: 'ctx-retrofit', name: 'AzRetroFit', aliases: ['AZ Retrofit'], basePath: 'PRIVATE-FOLDER', focus: 'PRIVATE-CONTEXT' }]);
  const prompt = f.calls.message.prompt;
  assert.match(prompt, /AzRetroFit/);
  assert.ok(!prompt.includes('PRIVATE-FOLDER'));
  assert.ok(!prompt.includes('PRIVATE-CONTEXT'));
});

test('preserves independent work, conditional checks and status exclusions without turning exclusions into work bans', () => {
  const proposed = plan();
  const result = validateInterpretation(proposed, catalog);
  assert.deepEqual(result, proposed);
  proposed.actions[0].request = 'Changed outside validation.';
  assert.equal(result.actions[0].request, 'Refresh context.');
  assert.deepEqual(result.actions[4].after, [after('refresh-x')]);
  assert.deepEqual(catalogForInterpretation([{ ...catalog[0], basePath: 'private path', transcript: 'private text' }]), [catalog[0]]);
  const excludedCheck = plan();
  excludedCheck.actions.push(status('forbidden-check', y));
  assert.throws(() => validateInterpretation(excludedCheck, catalog), /explicit exclusion/);
});

test('clarification input retains bounded request/question context without weakening the controller', async (t) => {
  const f = await fixture(t);
  const clarification = { request: 'Refresh X, not Y.', question: 'Which existing X session?' };
  await f.interpreter.interpret(requestId, x, catalog, 'Speed / performance', [], clarification);
  const input = JSON.parse(f.calls.message.prompt.split('Input JSON:\n')[1]);
  assert.deepEqual(input.clarification, clarification);
  assert.equal(input.utterance, x);
  assert.match(f.calls.message.prompt, /Never treat a clarification reply as a tool permission approval/);
  for (const invalid of [{ ...clarification, request: 'x'.repeat(10001) },
    { ...clarification, question: 'x'.repeat(4001) }, { ...clarification, extra: true }]) {
    await assert.rejects(f.interpreter.interpret(requestId, x, catalog, 'Speed / performance', [], invalid), /Invalid clarification context/);
  }
  assert.equal(f.calls.sends, 1);
});

test('rejects unknown identities, busy work and malformed or executable response fields before dispatch', () => {
  for (const mutate of [
    (value) => { value.actions[0].sessionId = requestId; },
    (value) => { value.actions[0].id = undefined; },
    (value) => { value.actions[0].command = 'powershell'; },
    (value) => { value.actions[3].request = 'Ask the agent for updates.'; },
    (value) => { value.intent = 'reply'; },
    (value) => { value.actions[0].request = 'x'.repeat(1001); },
    (value) => { value.excludedStatusSessionIds.push(requestId); },
    (value) => { value.excludedStatusSessionIds.push(y); },
    (value) => { value.normalizedText = '\u0928\u092e\u0938\u094d\u0924\u0947'; },
  ]) {
    const proposed = plan();
    mutate(proposed);
    assert.throws(() => validateInterpretation(proposed, catalog), /Nothing was dispatched/);
  }
  assert.throws(() => validateInterpretation(plan(), catalog.map((row) => ({ ...row, status: 'busy' }))), /busy/);
  assert.throws(() => catalogForInterpretation([catalog[0], catalog[0]]), /duplicate session/);
  const onlyStatus = { ...plan(), actions: [status('check-x', x)] };
  assert.doesNotThrow(() => validateInterpretation(onlyStatus, [{ ...catalog[0], status: 'busy' }, catalog[1]]));
});

test('rejects cycles, missing and repeated dependencies, and duplicate action identities', () => {
  for (const actions of [
    [work('a', x, [after('a')])],
    [work('a', x, [after('b')]), work('b', y, [after('a', 'succeeded')])],
    [work('a', x, [after('missing')])],
    [work('a', x), status('b', x, [after('a'), after('a', 'succeeded')])],
    [work('a', x), work('a', y)],
  ]) assert.throws(() => validateInterpretation({ ...plan(), actions }, catalog), /Nothing was dispatched/);
  assert.doesNotThrow(() => validateInterpretation({ ...plan(), actions: [
    work('a', x), work('b', y, [after('a', 'succeeded')]), status('c', z, [after('b')]),
  ] }, catalog));
});

async function fixture(t, options = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'intercom-interpreter-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const calls = { sends: 0, stops: 0, forces: 0, inventories: 0, deleted: [] };
  let configuration;
  let clientOptions;
  const session = {
    get sessionId() { return configuration.sessionId; },
    rpc: {
      skills: { list: async () => ({ skills: [] }) },
      mcp: { listConfigured: async () => ({ servers: [] }) },
      tools: {
        initializeAndValidate: async () => {},
        getCurrentMetadata: async () => {
          calls.inventories++;
          return { tools: options.postTools && calls.inventories > 1 ? [{ name: 'powershell' }] : [] };
        },
      },
    },
    sendAndWait: async (message) => {
      calls.sends++;
      calls.message = message;
      if (options.event) configuration.onEvent(options.event);
      if (options.duringSend) await options.duringSend(configuration);
      return { data: { content: options.content ?? JSON.stringify(plan()) } };
    },
  };
  const client = {
    start: async () => {},
    getStatus: async () => ({ version: options.version ?? '1.0.109' }),
    getAuthStatus: async () => ({ isAuthenticated: true }),
    createSession: async (config) => { configuration = config; return session; },
    deleteSession: async (id) => { calls.deleted.push(id); },
    stop: async () => {
      calls.stops++;
      if (options.cleanupEvent) configuration.onEvent(options.cleanupEvent);
      return options.stopErrors ? [new Error('fixture stop failure')] : [];
    },
    forceStop: async () => {
      calls.forces++;
      if (options.forceError && calls.forces === 1) throw new Error('fixture force failure');
    },
  };
  const interpreter = new RestrictedInterpreter(root, {
    createClient: (configuration) => { clientOptions = configuration; return client; },
    timeout: options.timeout ?? 2000,
  });
  t.after(() => interpreter.close());
  return { interpreter, calls, configuration: () => configuration, clientOptions: () => clientOptions };
}

test('uses a fresh restricted controller, minimal input and owned cleanup, never an existing work session', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.interpreter.interpret(requestId, 'Um, refresh X and Y. Do not check Y.', [
    ...catalog.map((row) => ({ ...row, folder: 'PRIVATE-FOLDER', transcript: 'PRIVATE-CONTEXT' })),
  ]), plan());
  const config = f.configuration();
  assert.ok(!catalog.some((row) => row.id === config.sessionId));
  assert.equal(config.reasoningEffort, 'low');
  assert.deepEqual(config.availableTools, []);
  assert.deepEqual(config.disabledMcpServers, ['github-mcp-server']);
  assert.equal(config.enableConfigDiscovery, false);
  assert.equal(config.enableHostGitOperations, false);
  assert.equal(config.enableSessionStore, false);
  assert.equal(f.clientOptions().mode, 'empty');
  assert.ok(!f.calls.message.prompt.includes('PRIVATE-FOLDER'));
  assert.ok(!f.calls.message.prompt.includes('PRIVATE-CONTEXT'));
  assert.deepEqual(f.calls.deleted, [config.sessionId]);
  assert.equal(f.calls.stops, 1);
  assert.equal(f.calls.forces, 0);
  assert.equal(f.interpreter.active, null);
});

test('accepts Hindi-script recognition input while requiring Roman interpretation output', async (t) => {
  const f = await fixture(t);
  assert.deepEqual(await f.interpreter.interpret(requestId, '\u0915\u0943\u092a\u092f\u093e refresh X.', catalog), plan());
});

test('clean preflight cannot mask MCP startup, ambient tools, agents or permission requests', async (t) => {
  for (const event of [
    { type: 'session.mcp_servers_loaded', data: { servers: [{ name: 'github-mcp-server', status: 'connected' }] } },
    { type: 'session.skills_loaded', data: { skills: [{ enabled: true }] } },
    { type: 'session.custom_agents_updated', data: { agents: [{ name: 'ambient' }] } },
    { type: 'tool.execution_start', data: { toolName: 'powershell' } },
    { type: 'session.error', data: {} },
  ]) {
    const f = await fixture(t, { event });
    await assert.rejects(f.interpreter.interpret(requestId, 'Refresh X.', catalog), /Nothing was dispatched/);
    assert.equal(f.calls.stops, 1);
    assert.equal(f.calls.deleted.length, 0);
  }
  const permission = await fixture(t, { duringSend: async (config) => {
    assert.equal(config.onPermissionRequest({ kind: 'shell' }).kind, 'denied-no-approval-rule-and-could-not-request-from-user');
  } });
  await assert.rejects(permission.interpreter.interpret(requestId, 'Refresh X.', catalog), /requested a permission/);
});

test('rejects post-model inventory changes, malformed responses, unsupported CLI and cleanup-time violations', async (t) => {
  for (const options of [
    { postTools: true },
    { content: '```json\n{}\n```' },
    { content: JSON.stringify({ ...plan(), actions: [status('forbidden', y)] }) },
    { version: 'unqualified' },
    { cleanupEvent: { type: 'tool.execution_start', data: {} } },
  ]) {
    const f = await fixture(t, options);
    await assert.rejects(f.interpreter.interpret(requestId, 'Refresh X.', catalog), /Nothing was dispatched/);
    assert.equal(f.calls.stops, 1);
  }
});

test('cancels the exact request, discards late answers and keeps an unrelated cancellation harmless', async (t) => {
  let release;
  let began;
  const started = new Promise((resolve) => { began = resolve; });
  const f = await fixture(t, { duringSend: () => {
    began();
    return new Promise((resolve) => { release = resolve; });
  } });
  const request = f.interpreter.interpret(requestId, 'Refresh X.', catalog);
  const rejected = assert.rejects(request, /cancelled/);
  await started;
  await assert.rejects(f.interpreter.interpret(x, 'Refresh X.', catalog), /busy/);
  await f.interpreter.cancel(x);
  assert.equal(f.calls.stops, 0);
  await f.interpreter.cancel(requestId);
  release();
  await rejected;
  assert.equal(f.calls.deleted.length, 0);
  assert.equal(f.calls.stops, 1);
  assert.equal(f.interpreter.active, null);
});

test('bounds an unresponsive model operation and never returns a late success', async (t) => {
  let release;
  const f = await fixture(t, { timeout: 50, duringSend: () => new Promise((resolve) => { release = resolve; }) });
  await assert.rejects(f.interpreter.interpret(requestId, 'Refresh X.', catalog), /timed out/);
  release();
  assert.equal(f.calls.stops, 1);
  assert.equal(f.calls.deleted.length, 0);
});

test('cleanup failures suppress plans, retain ownership and require successful forced cleanup', async (t) => {
  const f = await fixture(t, { stopErrors: true, forceError: true });
  await assert.rejects(f.interpreter.interpret(requestId, 'Refresh X.', catalog), /Forced cleanup failed/);
  assert.equal(f.calls.forces, 1);
  await assert.rejects(f.interpreter.interpret(requestId, 'Refresh X.', catalog), /awaiting cleanup/);
  await f.interpreter.close();
  assert.equal(f.calls.forces, 2);
  assert.equal(f.interpreter.blocked, false);
  assert.equal(f.interpreter.failedClient, null);
});
