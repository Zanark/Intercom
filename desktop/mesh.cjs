const fs = require('node:fs/promises');
const path = require('node:path');
const { Worker, isMainThread, parentPort, workerData } = require('node:worker_threads');

const defaultMeshPath = path.join(path.parse(process.env.USERPROFILE || process.cwd()).root,
  'devdesk', 'Copilot', 'CopilotSessions', 'context-network', 'output', 'context-index.json');
const sourcePath = () => process.env.INTERCOM_CONTEXT_MESH_PATH || defaultMeshPath;

function projectMesh(data, source, loadedAt = new Date().toISOString()) {
  if (data?.schemaVersion !== 1 || !Array.isArray(data.contexts) ||
      !Array.isArray(data.graph?.nodes) || !Array.isArray(data.graph?.edges) ||
      !Number.isFinite(Date.parse(data.generatedAt))) throw new Error('Unsupported or invalid Context Mesh snapshot.');
  if (data.contexts.length > 512 || data.graph.nodes.length > 100000 || data.graph.edges.length > 200000) {
    throw new Error('Context Mesh exceeds the supported graph bounds.');
  }
  const text = (value, limit) => typeof value === 'string' && value.trim().length > 0 &&
    value.length <= limit && !Array.from(value).some((character) => character.charCodeAt(0) < 32);
  const nodes = new Map();
  for (const node of data.graph.nodes) {
    if (!text(node?.id, 200) || nodes.has(node.id)) throw new Error('Context Mesh has invalid or duplicate graph node IDs.');
    nodes.set(node.id, node);
  }
  const ids = new Set();
  const contexts = data.contexts.map((context) => {
    if (!text(context?.id, 200) || ids.has(context.id) || !text(context.name, 1024) ||
        !text(context.basePath, 32768) || !path.isAbsolute(context.basePath) ||
        nodes.get(context.id)?.type !== 'context') throw new Error('Context Mesh has invalid or duplicate contexts.');
    ids.add(context.id);
    const node = nodes.get(context.id);
    const readable = context.name.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2');
    return {
      id: context.id, name: context.name, basePath: context.basePath,
      subtitle: ['fresh', 'aging', 'stale', 'unknown'].includes(context.freshness?.label) ? context.freshness.label : 'unknown',
      aliases: [...new Set([context.name, readable, path.basename(context.basePath)])],
      color: /^#[0-9a-f]{6}$/i.test(node.outlineColor) ? node.outlineColor : '#85dec5',
    };
  }).sort((a, b) => a.id.localeCompare(b.id)).map((context, slot) => ({ ...context, slot }));
  const edges = [];
  for (const edge of data.graph.edges) {
    if (!nodes.has(edge?.source) || !nodes.has(edge.target) || !text(edge.type, 100)) throw new Error('Context Mesh has an invalid relationship or dangling endpoint.');
    if (ids.has(edge.source) && ids.has(edge.target) && edge.confidence === 'high' &&
        ['structural', 'declared-context-handoff'].includes(edge.relationshipClass)) {
      edges.push({ source: edge.source, target: edge.target, type: edge.type, confidence: 'high', relationshipClass: edge.relationshipClass });
    }
  }
  return { contexts, edges, source, generatedAt: data.generatedAt, loadedAt, demo: false };
}

async function readMesh(source) {
  const handle = await fs.open(source, 'r');
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > 64 * 1024 * 1024) throw new Error('Context Mesh must be a JSON file smaller than 64 MiB.');
    // Keep an unexpected concurrent replacement/growth bounded too.
    const buffer = Buffer.alloc(Math.min(stat.size + 1, 64 * 1024 * 1024 + 1));
    let length = 0;
    while (length < buffer.length) {
      const { bytesRead } = await handle.read(buffer, length, buffer.length - length, null);
      if (!bytesRead) break;
      length += bytesRead;
    }
    if (length !== stat.size) throw new Error('Context Mesh changed while loading. Retry after its publisher finishes.');
    return projectMesh(JSON.parse(buffer.subarray(0, length).toString('utf8').replace(/^\uFEFF/, '')), source);
  } finally { await handle.close(); }
}

function loadMesh(source = sourcePath()) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(__filename, { workerData: { source } });
    const timer = setTimeout(() => { void worker.terminate(); reject(new Error('Context Mesh loading timed out.')); }, 15000);
    let received = false;
    worker.once('message', (message) => {
      received = true;
      clearTimeout(timer);
      if (message.error) reject(new Error(`Context Mesh could not be loaded from ${source}: ${message.error}`));
      else resolve(message.snapshot);
    });
    worker.once('error', (error) => { clearTimeout(timer); reject(error); });
    worker.once('exit', (code) => {
      clearTimeout(timer);
      if (!received) reject(new Error(`Context Mesh reader exited without a snapshot (${code}).`));
    });
  });
}

if (!isMainThread) {
  readMesh(workerData.source).then((snapshot) => parentPort.postMessage({ snapshot }))
    .catch((error) => parentPort.postMessage({ error: error.message }));
}

module.exports = { loadMesh, projectMesh, sourcePath };
