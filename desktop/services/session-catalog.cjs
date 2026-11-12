const fs = require('node:fs/promises');
const path = require('node:path');
const { VoiceHost, requireId } = require('./voice.cjs');
const { catalogForInterpretation } = require('./interpreter.cjs');

const workspaceKey = (value) => path.resolve(value).toLowerCase();
function overlapsWorkspace(a, b) {
  a = workspaceKey(a); b = workspaceKey(b);
  return a === b || a.startsWith(b.endsWith(path.sep) ? b : b + path.sep) ||
    b.startsWith(a.endsWith(path.sep) ? a : a + path.sep);
}

class SessionCatalog {
  constructor(profile, mesh, dependencies = {}) {
    this.mesh = mesh;
    this.discovery = dependencies.discovery ?? new VoiceHost(profile, () => {});
    this.tail = Promise.resolve();
    this.pending = new Set();
    this.cancelled = new Set();
  }

  read(requestId) {
    requestId = requireId(requestId);
    if (this.pending.has(requestId)) return Promise.reject(new Error('This discovery request is already pending.'));
    this.pending.add(requestId);
    const pending = this.tail.then(() => {
      if (this.closed) throw new Error('Session discovery is closed.');
      if (this.cancelled.has(requestId)) throw new Error('Session discovery cancelled before it started.');
      return this.discovery.exclusive(requestId, async (operation) => {
              const contexts = this.mesh()?.contexts;
              if (!Array.isArray(contexts) || contexts.length > 512) throw new Error('Load the real Context Mesh before discovering work sessions.');
              const roots = new Map();
              const warnings = [];
              const canonical = async (folder, identity) => {
                if (typeof folder !== 'string' || !path.isAbsolute(folder)) throw new Error(`Invalid workspace for ${identity}.`);
                try {
                  const resolved = await fs.realpath(folder);
                  if (!(await fs.stat(resolved)).isDirectory()) throw new Error(`Workspace for ${identity} is not a directory.`);
                  return resolved;
                } catch (error) {
                  if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error;
                  warnings.push(`${identity}: workspace unavailable (${error.code}); excluded from routing.`);
                  return null;
                }
              };
              for (const context of contexts) {
                const root = await canonical(context.basePath, context.id);
                if (!root) continue;
                const key = workspaceKey(root);
                if (roots.has(key)) throw new Error('Multiple mesh contexts resolve to the same workspace. Resolve that ambiguity before routing.');
                roots.set(key, { context, root });
        }
              const sessions = [];
              const seen = new Set();
              for await (const page of this.discovery.catalogPages(operation)) {
                for (const row of page.sessions) {
                  if (row.can_resume !== true || row.source !== 'copilot_cli') continue;
                  const id = requireId(row.session_id);
                  if (seen.has(id)) throw new Error('Agency returned a duplicate session identity. Nothing was routed.');
                  seen.add(id);
                  const workspace = await canonical(row.folder, id);
                  if (!workspace) continue;
                  const match = roots.get(workspaceKey(workspace));
                  if (!match) continue;
                  if (row.summary != null && typeof row.summary !== 'string') throw new Error('A session catalog name is malformed. Nothing was routed.');
                  const name = row.summary?.trim() || `Unnamed session (${id})`;
                  if (!row.summary?.trim()) warnings.push(`${id}: Agency supplied no catalog name; shown as "${name}". Use its exact ID rather than guessing a target.`);
                  if (name.length > 1000) throw new Error('A session catalog name exceeds the 1,000-character limit. Nothing was routed.');
                  sessions.push({
                    id, name, status: row.status === 'idle' ? 'idle' : 'busy',
                    contextId: match.context.id, contextName: match.context.name, workspace,
                  });
                }
              }
              if (operation.cancelled) throw new Error('Session discovery cancelled. Nothing was routed.');
              catalogForInterpretation(sessions);
              return { sessions, warnings, observedAt: new Date().toISOString() };
      });
          }).finally(() => { this.pending.delete(requestId); this.cancelled.delete(requestId); });
    this.tail = pending.catch(() => {});
    return pending;
  }

  async close() {
    this.closed = true;
    try { if (this.discovery.work) await this.discovery.cancel(this.discovery.work.id); }
    finally { await this.tail; }
  }

  async cancel(id) {
    id = requireId(id);
    if (this.pending.has(id)) this.cancelled.add(id);
    if (this.discovery.work?.id === id) await this.discovery.cancel(id);
  }
}

module.exports = { SessionCatalog, workspaceKey, overlapsWorkspace };
