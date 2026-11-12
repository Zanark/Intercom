const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { modelName } = require('./recognition.cjs');

const events = new Set(['app.start', 'app.ready', 'app.exit', 'app.second-instance', 'app.failure', 'ipc.start', 'ipc.finish',
  'ipc.failure', 'process.start', 'process.exit', 'process.failure', 'renderer.failure', 'voice.phase']);
const stringFields = new Set(['operation', 'span', 'component', 'phase', 'backend', 'reason', 'signal']);
const numberFields = new Set(['pid', 'exitCode', 'durationMs', 'bytes']);

function errorMetadata(error) {
  const kinds = new Set(['Error', 'TypeError', 'RangeError', 'SyntaxError', 'AbortError']);
  let code;
  for (let cause = error, depth = 0; cause && depth < 4; cause = cause.cause, depth++) {
    if (typeof cause.code === 'string' && /^(?:E[A-Z0-9_]{1,39}|ERR_[A-Z0-9_]{1,60})$/.test(cause.code)) code = cause.code;
  }
  return { kind: kinds.has(error?.name) ? error.name : 'Error', ...(code ? { code } : {}) };
}

class Diagnostics {
  constructor(profile, { version, resourcesPath = '', metrics = () => [], native = () => null,
    onFailure = () => {}, maxBytes = 1024 * 1024, history = 3 } = {}) {
    this.directory = path.join(profile, 'diagnostics');
    this.version = version;
    this.resourcesPath = resourcesPath;
    this.metrics = metrics;
    this.native = native;
    this.onFailure = onFailure;
    this.maxBytes = maxBytes;
    this.history = history;
    this.runId = randomUUID();
    this.pending = Promise.resolve();
    this.queued = 0;
    this.dropped = 0;
    this.error = null;
  }

  status() {
    return { directory: this.directory, error: this.error, droppedEvents: this.dropped,
      policy: 'Local metadata only. No audio, transcripts, prompts, responses, raw errors, environment or memory dumps.' };
  }

  notifyFailure() {
    try { this.onFailure(this.status()); }
    catch (error) { console.error('Diagnostic status delivery failed:', errorMetadata(error)); }
  }

  async snapshot() {
    const resources = [];
    if (this.resourcesPath) {
      for (const name of ['app.asar', path.join('speech', modelName), path.join('speech', 'runtime', 'intercom-recognition.exe')]) {
        try {
          const stat = await fs.stat(path.join(this.resourcesPath, name));
          resources.push({ name, exists: true, bytes: stat.size, modifiedAt: stat.mtime.toISOString() });
        } catch (error) { resources.push({ name, exists: false, error: errorMetadata(error) }); }
      }
    }
    let processes;
    try {
      processes = this.metrics().slice(0, 32).map((item) => ({
        pid: item.pid, type: item.type, workingSetKiB: item.memory?.workingSetSize,
      }));
    } catch (error) { processes = { error: errorMetadata(error) }; }
    let native;
    try { native = this.native(); }
    catch (error) { native = { error: errorMetadata(error) }; }
    return { capturedAt: new Date().toISOString(), pid: process.pid, platform: process.platform, arch: process.arch,
      electron: process.versions.electron, node: process.versions.node,
      executable: process.execPath, resourcesPath: this.resourcesPath,
      uptimeSeconds: Math.floor(process.uptime()), memoryBytes: process.memoryUsage(),
      native, resources, processes };
  }

  record(event, fields = {}, error) {
    if (!events.has(event)) throw new Error('Unsupported diagnostic event.');
    if (this.queued >= 128) {
      this.dropped++;
      this.error = 'Diagnostic queue full; some events were not saved.';
      if (this.dropped === 1) this.notifyFailure();
      return this.pending;
    }
    const safe = {};
    for (const [key, value] of Object.entries(fields)) {
      if (stringFields.has(key) && typeof value === 'string' && /^[a-zA-Z0-9:_.-]{1,96}$/.test(value)) safe[key] = value;
      if (numberFields.has(key) && Number.isFinite(value)) safe[key] = value;
    }
    const entry = { at: new Date().toISOString(), runId: this.runId, version: this.version,
      pid: process.pid, event, ...safe, ...(error ? { error: errorMetadata(error) } : {}) };
    this.queued++;
    this.pending = this.pending.then(async () => {
      await fs.mkdir(this.directory, { recursive: true });
      const file = path.join(this.directory, 'events.jsonl');
      let size = 0;
      try { size = (await fs.stat(file)).size; }
      catch (reason) { if (reason.code !== 'ENOENT') throw reason; }
      const line = JSON.stringify(entry) + '\n';
      if (size + Buffer.byteLength(line) > this.maxBytes) {
        await fs.rm(path.join(this.directory, `events.${this.history}.jsonl`), { force: true });
        for (let index = this.history - 1; index >= 0; index--) {
          try { await fs.rename(path.join(this.directory, index ? `events.${index}.jsonl` : 'events.jsonl'),
            path.join(this.directory, `events.${index + 1}.jsonl`)); }
          catch (reason) { if (reason.code !== 'ENOENT') throw reason; }
        }
      }
      await fs.appendFile(file, line, 'utf8');
      if (error) {
        const snapshot = { ...entry, snapshot: await this.snapshot() };
        const temporary = path.join(this.directory, 'last-failure.tmp');
        await fs.writeFile(temporary, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
        await fs.rename(temporary, path.join(this.directory, 'last-failure.json'));
      }
    }).catch((reason) => {
      this.error = `Diagnostic persistence failed (${errorMetadata(reason).code || 'unknown'}).`;
      this.notifyFailure();
    }).finally(() => { this.queued--; });
    return this.pending;
  }

  async run(operation, handler) {
    const span = randomUUID();
    const started = Date.now();
    await this.record('ipc.start', { operation, span });
    try {
      const result = await handler();
      await this.record('ipc.finish', { operation, span, durationMs: Date.now() - started });
      return result;
    } catch (error) {
      await this.record('ipc.failure', { operation, span, durationMs: Date.now() - started }, error);
      throw error;
    }
  }

  flush() { return this.pending; }
}

module.exports = { Diagnostics, errorMetadata };
