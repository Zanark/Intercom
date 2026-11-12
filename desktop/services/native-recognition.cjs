const { spawn } = require('node:child_process');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');

class NativeRecognitionWorker {
  constructor(root, backend, { spawnWorker = spawn, startupTimeout = 180000, stopTimeout = 5000, diagnostics } = {}) {
    this.root = root;
    this.backend = backend;
    this.spawnWorker = spawnWorker;
    this.startupTimeout = startupTimeout;
    this.stopTimeout = stopTimeout;
    this.diagnostics = diagnostics;
    this.worker = null;
    this.sequence = 0;
    this.idleFailure = null;
  }

  async stop(worker = this.worker, reason = new Error('Local recognition worker stopped. Nothing was sent.'), expected = false) {
    if (!worker) return;
    if (!worker.failure) worker.failure = reason;
    if (expected && !worker.stopping) worker.expectedStop = true;
    if (!worker.stopping) {
      worker.stopping = new Promise((resolve, reject) => {
        if (worker.closed) { resolve(); return; }
        const timer = setTimeout(() => reject(new Error('The owned recognition worker did not stop. Recognition is blocked until it exits.')), this.stopTimeout);
        worker.child.once('close', () => { clearTimeout(timer); resolve(); });
        // This helper never creates children; terminate exactly this owned process.
        worker.child.kill();
      });
    }
    return worker.stopping;
  }

  launch() {
    const runtime = path.join(this.root, 'runtime');
    const systemRoot = process.env.SystemRoot || 'C:\\Windows';
    const child = this.spawnWorker(path.join(runtime, 'intercom-recognition.exe'), [
      path.join(this.root, 'ggml-large-v3-turbo-q5_0.bin'), this.backend, String(process.pid),
    ], { windowsHide: true, shell: false, cwd: runtime, stdio: ['pipe', 'pipe', 'pipe'],
      env: { SystemRoot: systemRoot, WINDIR: systemRoot, PATH: path.join(systemRoot, 'System32'),
        OPENBLAS_NUM_THREADS: '4', OMP_NUM_THREADS: '4' } });
    const worker = { child, ready: false, closed: false, pending: null, failure: null, diagnostics: '', stopping: null };
    this.worker = worker;
    void this.diagnostics?.record('process.start', { component: 'recognition', backend: this.backend, pid: child.pid });
    let payload = '';
    let bytes = 0;
    const decoder = new StringDecoder('utf8');
    const fail = (error) => {
      void this.diagnostics?.record('process.failure', { component: 'recognition', pid: child.pid }, error);
      void this.stop(worker, error).catch((reason) => worker.pending?.reject(reason));
    };
    child.on('error', (error) => fail(new Error('The pinned recognition helper could not start. Nothing was sent.', { cause: error })));
    child.stdin.on('error', () => fail(new Error('The private recognition pipe failed. Nothing was sent.')));
    child.stderr.on('data', (chunk) => { worker.diagnostics = (worker.diagnostics + chunk.toString('utf8')).slice(-4000); });
    child.stdout.on('data', (chunk) => {
      if (worker.failure || this.worker !== worker) return;
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024 + 1) { fail(new Error('Local recognition exceeded its structured-output limit. Nothing was sent.')); return; }
      payload += decoder.write(chunk);
      let end;
      while ((end = payload.indexOf('\n')) !== -1) {
        const line = payload.slice(0, end);
        payload = payload.slice(end + 1);
        bytes = Buffer.byteLength(payload, 'utf8');
        try {
          const value = JSON.parse(line);
          const pending = worker.pending;
          if (!pending) throw new Error('Unexpected recognition response. Nothing was sent.');
          if (!worker.ready) {
            if (value.type !== 'ready' || value.protocol !== 1 || value.backend !== this.backend) {
              throw new Error('The local recognition worker returned an invalid backend or protocol. Nothing was sent.');
            }
            // The pinned helper emits readiness only after model initialization and
            // an actual Vulkan0 initialization diagnostic, never after CPU fallback.
            worker.ready = true;
          } else if (value.id !== pending.id) throw new Error('A stale recognition response was rejected. Nothing was sent.');
          worker.pending = null;
          pending.resolve(value);
        } catch (error) { fail(error); return; }
      }
    });
    child.on('close', (code, signal) => {
      worker.closed = true;
      if (this.worker === worker) this.worker = null;
      const error = worker.failure || new Error(`Local recognition worker exited (${code}). Nothing was sent. ${worker.diagnostics.trim()}`);
      void this.diagnostics?.record(worker.expectedStop ? 'process.exit' : 'process.failure',
        { component: 'recognition', pid: child.pid, exitCode: code, signal,
          reason: worker.expectedStop ? 'stopped' : 'unexpected' }, worker.expectedStop ? undefined : error);
      if (!worker.failure && !worker.pending) this.idleFailure = error;
      worker.pending?.reject(error);
      worker.pending = null;
    });
    return worker;
  }

  async operation(work, worker, timeout, send) {
    if (work.cancelled || work.controller?.signal.aborted) throw new Error('Local recognition cancelled.');
    if (worker.pending || worker.stopping) throw new Error('The local recognition worker is busy or stopping.');
    let timer;
    const abort = () => { void this.stop(worker, new Error('Local recognition cancelled.'), true).catch((error) => worker.pending?.reject(error)); };
    work.recognitionStop = () => this.stop(worker, new Error('Local recognition cancelled.'), true);
    work.controller?.signal.addEventListener('abort', abort, { once: true });
    try {
      const result = await new Promise((resolve, reject) => {
        const id = ++this.sequence;
        if (id > 0xffffffff) { reject(new Error('Recognition sequence exhausted. Restart the application.')); return; }
        worker.pending = { id, resolve, reject };
        timer = setTimeout(() => {
          void this.stop(worker, new Error('Local recognition timed out. Nothing was sent.'))
            .catch((error) => worker.pending?.reject(error));
        }, timeout);
        try { send?.(id); }
        catch (error) { void this.stop(worker, error).catch(reject); }
      });
      if (work.cancelled) throw new Error('Local recognition cancelled.');
      return result;
    } finally {
      clearTimeout(timer);
      work.controller?.signal.removeEventListener('abort', abort);
      delete work.recognitionStop;
    }
  }

  async ready(work) {
    if (work.cancelled || work.controller?.signal.aborted) throw new Error('Local recognition cancelled.');
    if (this.idleFailure) {
      const error = this.idleFailure;
      this.idleFailure = null;
      throw error;
    }
    const worker = this.worker || this.launch();
    if (!worker.ready) await this.operation(work, worker, this.startupTimeout);
    if (worker.stopping || worker.closed) throw new Error('The recognition worker is stopping. Retry after it exits.');
    return worker;
  }

  async transcribe(work, wave, language, timeout) {
    const worker = await this.ready(work);
    return this.operation(work, worker, timeout, (id) => {
      const header = Buffer.alloc(16);
      header.write('ICR1');
      header.writeUInt32LE(id, 4);
      header.writeUInt32LE(['auto', 'en', 'hi'].indexOf(language), 8);
      header.writeUInt32LE(wave.length, 12);
      worker.child.stdin.write(header);
      worker.child.stdin.write(wave);
    });
  }

  async close() { await this.stop(this.worker, undefined, true); }
}

module.exports = { NativeRecognitionWorker };
