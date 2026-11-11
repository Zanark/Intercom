const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { stopTree } = require('./voice.cjs');

const agentMode = 'https://agentclientprotocol.com/protocol/session-modes#agent';
const priorities = { 'Speed / performance': 'low', Balanced: 'medium', Accuracy: 'high' };

function option(options, id) { return options?.find((item) => item.id === id); }
function supports(options, id, value) {
  const setting = option(options, id);
  return setting?.type === 'select' && setting.options?.some((item) => item.value === value);
}
function manualPolicy(options) {
  return option(options, 'allow_all')?.currentValue === 'off' && option(options, 'mode')?.currentValue === agentMode;
}

class AcpClient {
  constructor(sessionId, workspace, update, permission, spawnProcess = spawn) {
    this.sessionId = sessionId;
    this.workspace = workspace;
    this.update = update;
    this.permission = permission;
    this.spawnProcess = spawnProcess;
    this.pending = new Map();
    this.permissions = new Map();
    this.sequence = 0;
    this.ready = false;
    this.stopping = false;
    this.done = false;
  }

  start() {
    const child = this.spawnProcess('copilot.exe', ['--acp', '--no-auto-update', '--no-custom-instructions', '--disable-builtin-mcps'], {
      cwd: this.workspace, shell: false, windowsHide: true,
      env: { ...process.env, COPILOT_ALLOW_ALL: 'false', COPILOT_ASSISTED_APPROVAL: 'false' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    this.child = child;
    let pending = '';
    let bytes = 0;
    const decoder = new StringDecoder('utf8');
    let stderr = '';
    this.exited = new Promise((resolve) => child.once('close', resolve));
    child.stdout.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) { this.fail(new Error('ACP stream exceeded 16 MiB. Outcome unverified.')); return; }
      pending += decoder.write(chunk);
      if (pending.length > 1024 * 1024) { this.fail(new Error('Oversized ACP message. Outcome unverified.')); return; }
      const lines = pending.split('\n');
      pending = lines.pop();
      try { for (const line of lines) if (line.trim()) this.accept(JSON.parse(line)); }
      catch (error) { this.fail(new Error(`Invalid ACP stream: ${error.message}`)); }
    });
    child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-2000); });
    child.stdin.on('error', (error) => { if (!this.stopping) this.fail(error); });
    child.once('error', (error) => this.fail(new Error(`Copilot could not start: ${error.message}`)));
    child.once('close', (code) => {
      this.done = true;
      const error = this.failure ?? new Error(`Copilot disconnected (${code}). Outcome unverified.${stderr ? ` ${stderr}` : ''}`);
      for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
      this.pending.clear();
      for (const permission of this.permissions.values()) clearTimeout(permission.timer);
      this.permissions.clear();
    });
  }

  write(message) {
    if (this.failure) throw this.failure;
    if (this.done || this.child?.stdin.destroyed) throw new Error('Copilot transport is closed.');
    this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n');
  }

  request(method, params, timeout = 60000) {
    if (this.failure) return Promise.reject(this.failure);
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => this.fail(new Error(`Copilot ${method} timed out. Outcome unverified; no retry made.`)), timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.write({ id, method, params }); }
      catch (error) { clearTimeout(timer); this.pending.delete(id); reject(error); }
    });
  }

  accept(message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0' ||
        (Object.hasOwn(message, 'id') && !(typeof message.id === 'string' ||
          (typeof message.id === 'number' && Number.isSafeInteger(message.id)))) ||
        (Object.hasOwn(message, 'method') && typeof message.method !== 'string')) throw new Error('Unsupported RPC envelope.');
    if (message.method && Object.hasOwn(message, 'id')) {
      if (message.method !== 'session/request_permission' || !this.ready ||
          message.params?.sessionId !== this.sessionId || this.permissions.size >= 8) {
        this.write({ id: message.id, error: { code: -32601, message: 'Unsupported client request; no permission granted.' } });
        return;
      }
      const params = message.params;
      const options = params.options?.filter((item) => ['allow_once', 'reject_once'].includes(item.kind) &&
        typeof item.optionId === 'string' && typeof item.name === 'string');
      const details = JSON.stringify(params.toolCall);
      if (!options?.some((item) => item.kind === 'reject_once') || !details || details.length > 64000 ||
          !params.toolCall?.toolCallId || this.permissions.has(String(message.id))) throw new Error('Invalid permission request. Nothing was approved.');
      const id = String(message.id);
      const timer = setTimeout(() => {
        const pending = this.permissions.get(id);
        if (pending) {
          this.permissions.delete(id);
          this.write({ id: pending.rpcId, result: { outcome: { outcome: 'cancelled' } } });
          this.fail(new Error('Permission request expired. No approval was granted; inspect before retrying.'));
        }
      }, 120000);
      this.permissions.set(id, { rpcId: message.id, options, timer });
      this.permission({ id, details, options });
      return;
    }
    if (message.method === 'session/update') {
      if (message.params?.sessionId !== this.sessionId) throw new Error('ACP session identity changed.');
      if (!this.ready) return; // A load replays history; never announce replay as live work.
      const update = message.params.update;
      if (update?.sessionUpdate === 'config_option_update' && !manualPolicy(update.configOptions)) {
        throw new Error('Copilot changed its confirmed manual approval policy. Work stopped; outcome unverified.');
      }
      this.update(update);
      return;
    }
    if (Object.hasOwn(message, 'id')) {
      const request = this.pending.get(message.id);
      if (!request) throw new Error('Unexpected ACP response ID.');
      this.pending.delete(message.id); clearTimeout(request.timer);
      if (message.error) request.reject(new Error(message.error.message || 'Copilot rejected the request.'));
      else if (!Object.hasOwn(message, 'result')) request.reject(new Error('Missing ACP response result.'));
      else request.resolve(message.result);
    }
  }

  approve(id, optionId) {
    const permission = this.permissions.get(id);
    if (!permission || !permission.options.some((item) => item.optionId === optionId)) throw new Error('This approval is stale or invalid.');
    this.permissions.delete(id); clearTimeout(permission.timer);
    this.write({ id: permission.rpcId, result: { outcome: { outcome: 'selected', optionId } } });
  }

  async open(profile) {
    this.start();
    const initialized = await this.request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'Intercom', version: '0.1.0' } });
    if (initialized.protocolVersion !== 1 || initialized.agentCapabilities?.loadSession !== true) throw new Error('Installed Copilot cannot resume existing sessions through ACP.');
    this.canClose = !!initialized.agentCapabilities.sessionCapabilities?.close;
    const loaded = await this.request('session/load', { sessionId: this.sessionId, cwd: this.workspace, mcpServers: [] });
    if (loaded.sessionId !== undefined && loaded.sessionId !== this.sessionId) throw new Error('ACP loaded a different session. No prompt sent.');
    let options = loaded.configOptions;
    const set = async (id, value) => {
      if (!supports(options, id, value)) throw new Error(`Copilot does not expose the required ${id}=${value} setting. No prompt sent.`);
      const result = await this.request('session/set_config_option', { sessionId: this.sessionId, configId: id, value });
      options = result.configOptions;
      if (option(options, id)?.currentValue !== value) throw new Error(`Copilot did not confirm ${id}=${value}. No prompt sent.`);
    };
    await set('mode', agentMode);
    await set('allow_all', 'off');
    if (!manualPolicy(options)) throw new Error('Manual approval policy could not be verified. No prompt sent.');
    const effort = priorities[profile];
    if (!effort) throw new Error('Invalid processing priority.');
    let effectiveEffort = 'inherited (no supported control)';
    if (supports(options, 'reasoning_effort', effort)) { await set('reasoning_effort', effort); effectiveEffort = effort; }
    this.ready = true;
    return { model: option(options, 'model')?.currentValue ?? 'inherited', effort: effectiveEffort, approval: 'Manual; existing saved approvals still apply' };
  }

  prompt(text) {
    if (!this.ready) throw new Error('Copilot manual policy is not ready.');
    return this.request('session/prompt', { sessionId: this.sessionId, prompt: [{ type: 'text', text }] }, 15 * 60 * 1000);
  }

  fail(error) {
    if (this.failure) return;
    this.failure = error;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(error); }
    this.pending.clear();
    void this.stop().catch((reason) => { this.failure = new Error(`${error.message} Could not stop owned process: ${reason.message}`); });
  }

  async stop() {
    if (this.stopOperation) return this.stopOperation;
    this.stopping = true;
    this.stopOperation = this.stopOwned();
    try { await this.stopOperation; }
    catch (error) { this.stopOperation = null; throw error; }
  }

  async stopOwned() {
    for (const permission of this.permissions.values()) {
      clearTimeout(permission.timer);
      if (!this.done && !this.child?.stdin.destroyed) {
        try { this.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: permission.rpcId, result: { outcome: { outcome: 'cancelled' } } }) + '\n'); }
        catch (error) { this.failure ??= error; }
      }
    }
    this.permissions.clear();
    if (!this.child || this.done) return;
    let timer;
    this.child.stdin.end();
    try {
      await Promise.race([this.exited, new Promise((resolve) => { timer = setTimeout(resolve, 3000); })]);
    } finally { clearTimeout(timer); }
    if (this.done) return;
    await stopTree(this.child);
    try {
      await Promise.race([this.exited, new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('Owned Copilot process did not confirm exit. Inspect it before starting more work.')), 5000);
      })]);
    } finally { clearTimeout(timer); }
  }

  async close() {
    if (!this.failure && this.ready && this.canClose && !this.stopping) await this.request('session/close', { sessionId: this.sessionId }, 15000);
    await this.stop();
  }
}

module.exports = { AcpClient, manualPolicy, priorities };
