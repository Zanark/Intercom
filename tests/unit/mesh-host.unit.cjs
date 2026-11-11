const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mkdtemp, writeFile, rm, open } = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { loadMesh, projectMesh } = require('../../desktop/services/mesh.cjs');

function fixture(name = 'Real Workspace') {
  return {
    schemaVersion: 1, generatedAt: '2026-11-10T12:00:00Z',
    contexts: [{ id: 'ctx-a', name, basePath: process.cwd(), freshness: { label: 'fresh' }, memory: 'PRIVATE_SENTINEL' },
      { id: 'ctx-b', name: 'Another Context', basePath: os.tmpdir() }],
    graph: {
      nodes: [{ id: 'ctx-a', type: 'context', detail: 'PRIVATE_SENTINEL', outlineColor: '#123abc' },
        { id: 'ctx-b', type: 'context' }, { id: 'memory-a', type: 'memory', label: 'PRIVATE_SENTINEL' }],
      edges: [
        { source: 'ctx-a', target: 'ctx-b', type: 'cross-reference', confidence: 'high', relationshipClass: 'declared-context-handoff', evidence: ['PRIVATE_SENTINEL'] },
        { source: 'ctx-b', target: 'ctx-a', type: 'cross-reference', confidence: 'low', relationshipClass: 'path-mention' },
        { source: 'ctx-a', target: 'memory-a', type: 'contains-memory' },
      ],
    },
    social: { messages: ['PRIVATE_SENTINEL'] },
  };
}
test('projects real identities and evidenced topology, excluding private bodies and incidental links', () => {
  const projection = projectMesh(fixture(), 'source.json');
  assert.equal(projection.demo, false);
  assert.deepEqual(projection.contexts.map((context) => context.id), ['ctx-a', 'ctx-b']);
  assert.equal(projection.edges.length, 1);
  assert.equal(projection.edges[0].target, 'ctx-b');
  assert.equal(JSON.stringify(projection).includes('PRIVATE_SENTINEL'), false);
});
test('rejects incompatible, duplicate and dangling snapshots instead of silently showing fixtures', () => {
  const unsupported = fixture(); unsupported.schemaVersion = 2;
  assert.throws(() => projectMesh(unsupported), /Unsupported/);
  const duplicate = fixture(); duplicate.contexts.push(duplicate.contexts[0]);
  assert.throws(() => projectMesh(duplicate), /duplicate contexts/);
  const dangling = fixture(); dangling.graph.edges[0].target = 'missing';
  assert.throws(() => projectMesh(dangling), /dangling/);
  const fakeContext = fixture(); fakeContext.graph.nodes[0].type = 'memory';
  assert.throws(() => projectMesh(fakeContext), /invalid/);
});
test('worker reads changed disk contents on every call and reports missing, malformed and oversized sources', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'intercom-mesh-'));
  const source = path.join(directory, 'index.json');
  try {
    await assert.rejects(loadMesh(source), /could not be loaded/);
    await writeFile(source, JSON.stringify(fixture('First launch')));
    assert.equal((await loadMesh(source)).contexts[0].name, 'First launch');
    await writeFile(source, JSON.stringify(fixture('Next launch')));
    assert.equal((await loadMesh(source)).contexts[0].name, 'Next launch');
    await writeFile(source, '{invalid');
    await assert.rejects(loadMesh(source), /could not be loaded/);
    const handle = await open(source, 'w');
    await handle.truncate(64 * 1024 * 1024 + 1); await handle.close();
    await assert.rejects(loadMesh(source), /smaller than 64 MiB/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});
