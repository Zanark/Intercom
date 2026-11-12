const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const { VoiceHost, requireId } = require('./voice.cjs');
const { AcpClient, priorities } = require('./acp.cjs');

const terminalPhases = new Set(['responded', 'failed', 'cancelled', 'unknown', 'terminal-opened']);
const phases = new Set(['starting', 'running', 'awaiting-approval', ...terminalPhases]);
const normalized = (value) => path.normalize(value).replace(/[\\]+$/, '').toLowerCase();
const sameWorkspace = (a, b) => normalized(a) === normalized(b);

function terminalCommand(proposal) {
  const payload = Buffer.from(JSON.stringify({ sessionId: proposal.sessionId, workspace: proposal.workspace, request: proposal.request }), 'utf8').toString('base64');
  // User text is only decoded JSON data, never PowerShell source or a wt command.
  const script = `$ErrorActionPreference='Stop'; $p=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${payload}')) | ConvertFrom-Json; Set-Location -LiteralPath $p.workspace; [Console]::WriteLine('Intercom task for manual continuation:'); [Console]::WriteLine($p.request); & copilot.exe ("--resume=" + $p.sessionId) --mode interactive --no-auto-update --no-custom-instructions --disable-builtin-mcps`;
  return ['-NoLogo', '-NoProfile', '-NoExit', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
}

class WorkHost {
  constructor(profile, mesh, publish, notify, dependencies = {}) {
    this.profile = profile; this.mesh = mesh; this.publish = publish; this.notify = notify;
    this.discovery = dependencies.discovery ?? new VoiceHost(profile, () => {});
    this.connect = dependencies.connect ?? ((...args) => new AcpClient(...args));
    this.spawnProcess = dependencies.spawn ?? spawn;
    this.assertAvailable = dependencies.assertAvailable ?? (() => {});
    this.job = null; this.active = null; this.proposal = null;
    this.tail = Promise.resolve();
    this.ready = this.recover();
    void this.ready.catch((error) => console.error('Intercom work receipt could not be recovered:', error.message));
  }

  async recover() {
    const file = path.join(this.profile, 'work-receipt.json');
    let data;
    try {
      if ((await fs.stat(file)).size > 256000) throw new Error('Work receipt exceeds its size bound.');
      data = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (data.version !== 1 || !data.job || !phases.has(data.job.phase) ||
        typeof data.job.request !== 'string' || !data.job.request.trim() || data.job.request.length > 1000 ||
        typeof data.job.text !== 'string' || data.job.text.length > 32000 ||
        typeof data.job.contextId !== 'string' || typeof data.job.contextName !== 'string' ||
        typeof data.job.workspace !== 'string' || !path.isAbsolute(data.job.workspace) ||
        !['background', 'terminal'].includes(data.job.mode) || !Object.hasOwn(priorities, data.job.profile) ||
        typeof data.job.acknowledged !== 'boolean') throw new Error('Invalid saved work receipt. Inspect it before starting more work.');
    requireId(data.job.id); requireId(data.job.sessionId);
    const saved = data.job;
    for (const key of ['activity', 'error', 'notificationWarning']) {
      if (saved[key] !== undefined && (typeof saved[key] !== 'string' || saved[key].length > 32000)) throw new Error(`Invalid saved work ${key}. Inspect the receipt before continuing.`);
    }
    for (const key of ['needsAttention', 'cleanupNeeded']) {
      if (saved[key] !== undefined && typeof saved[key] !== 'boolean') throw new Error(`Invalid saved work ${key}.`);
    }
    for (const key of ['startedAt', 'completedAt']) {
      if (saved[key] !== undefined && (typeof saved[key] !== 'string' || !Number.isFinite(Date.parse(saved[key])))) throw new Error(`Invalid saved work ${key}.`);
    }
    if (saved.observedContextIds !== undefined && (!Array.isArray(saved.observedContextIds) || saved.observedContextIds.length > 512 ||
        saved.observedContextIds.some((id) => typeof id !== 'string' || id.length > 512))) throw new Error('Invalid saved observed contexts.');
    if (saved.effective !== undefined && (!saved.effective || typeof saved.effective !== 'object' ||
        ['model', 'effort', 'approval'].some((key) => typeof saved.effective[key] !== 'string' || saved.effective[key].length > 1000))) throw new Error('Invalid saved effective policy.');
    if (saved.lastApproval !== undefined && (!saved.lastApproval || typeof saved.lastApproval.permissionId !== 'string' ||
        !['allow_once', 'reject_once'].includes(saved.lastApproval.kind) || typeof saved.lastApproval.decidedAt !== 'string' ||
        !Number.isFinite(Date.parse(saved.lastApproval.decidedAt)))) throw new Error('Invalid saved approval decision.');
    this.job = { ...saved, permission: null, observedContextIds: saved.observedContextIds ?? [] };
    if (!terminalPhases.has(this.job.phase) || this.job.cleanupNeeded) {
      this.job.phase = 'unknown';
      this.job.error = 'Intercom restarted with an uncertain previous task or process outcome. No previous-launch process is owned or automatically stopped. Inspect Copilot history, running sessions and the workspace before acknowledging; no automatic retry was made.';
      this.job.cleanupNeeded = false;
      this.job.needsAttention = true;
      this.job.completedAt = new Date().toISOString();
      await this.save();
    }
  }

  save() {
    const content = JSON.stringify({ version: 1, job: this.job }) + '\n';
    const operation = this.tail.then(async () => {
      await fs.mkdir(this.profile, { recursive: true });
      const temporary = path.join(this.profile, `work-${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, path.join(this.profile, 'work-receipt.json'));
      } finally { await fs.rm(temporary, { force: true }); }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }

  context(id) {
    const context = this.mesh()?.contexts.find((item) => item.id === id);
    if (!context?.basePath) throw new Error('Choose a context from the current real mesh, not a fixture.');
    return context;
  }

  async target(contextId, sessionId) {
    const context = this.context(contextId);
    this.assertAvailable(sessionId);
    const row = await this.discovery.exclusive(randomUUID(), (work) => this.discovery.discover(work, requireId(sessionId)));
    const [contextPath, sessionPath] = await Promise.all([fs.realpath(context.basePath), fs.realpath(row.folder)]);
    if (!sameWorkspace(contextPath, sessionPath)) throw new Error('This session does not belong to the selected context workspace.');
    this.assertAvailable(sessionId, sessionPath);
    return { context, row, workspace: sessionPath };
  }

  async list(contextId) {
    const context = this.context(contextId);
    return this.discovery.exclusive(randomUUID(), async (work) => {
      const rows = [];
      for await (const catalog of this.discovery.catalogPages(work)) {
        for (const row of catalog.sessions) if (typeof row.folder === 'string' && sameWorkspace(row.folder, context.basePath) &&
            row.can_resume === true && row.source === 'copilot_cli') {
          rows.push({ id: requireId(row.session_id), status: row.status === 'idle' ? 'idle' : 'busy' });
        }
      }
      return rows;
    });
  }

  async prepare(contextId, sessionId, request, mode, profile) {
    await this.ready;
    if (this.active) throw new Error('One background work or terminal handoff is already active. Speech controls remain available.');
    if (this.job && !this.job.acknowledged) throw new Error('Acknowledge the previous work receipt before replacing it.');
    if (typeof request !== 'string' || !request.trim() || request.length > 1000 ||
        !['background', 'terminal'].includes(mode) || !Object.hasOwn(priorities, profile)) throw new Error('Invalid work proposal.');
    this.proposal = null;
    const { context, workspace } = await this.target(contextId, sessionId);
    this.proposal = {
      id: randomUUID(), contextId, contextName: context.name, sessionId: requireId(sessionId),
      workspace, request: request.trim(), mode, profile, expiresAt: Date.now() + 300000,
    };
    return { ...this.proposal };
  }

  async confirm(id) {
    await this.ready;
    const proposal = this.proposal;
    this.proposal = null;
    if (!proposal || proposal.id !== id || proposal.expiresAt < Date.now()) throw new Error('Confirmation expired or changed. Prepare it again.');
    if (this.active) throw new Error('Work is already active.');
    const active = { id, sessionId: proposal.sessionId, workspace: proposal.workspace, client: null, cancelled: false, dispatched: false, receivedTerminal: false };
    this.active = active;
    try {
      const { workspace } = await this.target(proposal.contextId, proposal.sessionId);
      if (!sameWorkspace(workspace, proposal.workspace)) throw new Error('Session workspace changed. Confirm a fresh proposal.');
      if (active.cancelled) throw new Error('Confirmation cancelled before dispatch.');
      this.job = { ...proposal, phase: 'starting', text: '', activity: 'Connecting to the confirmed existing session...',
        observedContextIds: [], permission: null, acknowledged: false, startedAt: new Date().toISOString() };
      await this.save();
      this.publish(this.job);
      // The durable receipt exists before transport/prompt dispatch. No automatic retry.
      this.running = this.run(active, proposal);
      void this.running.catch((error) => {
        console.error('Work receipt finalization failed:', error);
        this.job.phase = 'unknown'; this.job.error = `Could not persist final outcome: ${error.message}`;
        if (!this.job.cleanupNeeded) this.active = null;
        this.publish(this.job);
      });
      return this.job;
    } catch (error) {
      this.active = null;
      if (this.job?.id === id) {
        this.job.phase = 'failed'; this.job.error = `No task was sent: ${error.message}`;
        this.job.completedAt = new Date().toISOString(); this.publish(this.job);
      }
      throw error;
    }
  }

  progress(active, update) {
    if (this.active !== active || active.cancelled) return;
    if (update?.sessionUpdate === 'agent_message_chunk' && update.content?.type === 'text') {
      const text = this.job.text + update.content.text;
      if (text.length > 32000) throw new Error('Work response exceeds its bounded text limit.');
      this.job.text = text;
      this.job.observedContextIds = [...new Set([...this.job.observedContextIds, this.job.contextId])];
    }
    if (['tool_call', 'tool_call_update'].includes(update?.sessionUpdate)) {
      if (update.status === 'failed' || (update.name === 'task_complete' && update.rawInput?.success === false)) this.job.needsAttention = true;
      if (typeof update.title === 'string') this.job.activity = update.title.slice(0, 256);
      if (['in_progress', 'completed'].includes(update.status)) {
        const observed = new Set([...this.job.observedContextIds, this.job.contextId]);
        for (const location of update.locations?.slice(0, 20) ?? []) {
          if (typeof location.path !== 'string' || !path.isAbsolute(location.path)) continue;
          const candidates = this.mesh()?.contexts.filter((context) => context.basePath &&
            (sameWorkspace(location.path, context.basePath) || normalized(location.path).startsWith(normalized(context.basePath) + path.sep))) ?? [];
          candidates.sort((a, b) => b.basePath.length - a.basePath.length);
          if (candidates[0]) observed.add(candidates[0].id);
        }
        this.job.observedContextIds = [...observed];
      }
    }
    if (!this.progressTimer) this.progressTimer = setTimeout(() => {
      this.progressTimer = null;
      if (this.active === active) this.publish(this.job);
    }, 120);
  }

  async run(active, proposal) {
    try {
      const client = this.connect(proposal.sessionId, proposal.workspace,
        (update) => this.progress(active, update), (permission) => {
          if (this.active !== active || active.cancelled) return;
          if (this.job.permission) throw new Error('Concurrent permission requests are not supported. No approval granted.');
          this.job.phase = 'awaiting-approval'; this.job.permission = permission;
          void this.save().then(() => { if (this.active === active) this.publish(this.job); })
            .catch((error) => client.fail(new Error(`Could not persist approval request: ${error.message}`)));
        });
      active.client = client;
      this.job.effective = await client.open(proposal.profile);
      if (active.cancelled) throw new Error('Cancelled before prompt dispatch.');
      if (proposal.mode === 'terminal') {
        await client.close();
        await this.target(proposal.contextId, proposal.sessionId);
        if (active.cancelled) throw new Error('Cancelled before terminal launch.');
        await new Promise((resolve, reject) => {
          const child = this.spawnProcess('powershell.exe', terminalCommand(proposal), {
            cwd: proposal.workspace, shell: false, windowsHide: false, detached: true, stdio: 'ignore',
            env: { ...process.env, COPILOT_ALLOW_ALL: 'false', COPILOT_ASSISTED_APPROVAL: 'false' },
          });
          child.once('error', reject);
          child.once('spawn', () => { child.unref(); resolve(); });
        });
        this.job.phase = 'terminal-opened';
        this.job.text = 'A separate interactive terminal was launched for the confirmed session. Verify its target and enter the task from this panel manually. No task was automatically sent. Intercom does not own or monitor that terminal; this is not a completion receipt.';
      } else {
        this.job.phase = 'running'; this.job.activity = 'Confirmed task dispatched; waiting for Copilot events.';
        await this.save(); this.publish(this.job);
        if (active.cancelled) throw new Error('Cancelled before prompt dispatch.');
        active.dispatched = true;
        const result = await client.prompt(proposal.request);
        active.receivedTerminal = true;
        if (active.cancelled) throw new Error('Cancelled after dispatch; side effects may remain.');
        if (result.stopReason !== 'end_turn' || !this.job.text.trim()) throw new Error(`Copilot stopped with ${result.stopReason ?? 'no terminal reason'}. Task outcome unverified.`);
        this.job.phase = this.job.needsAttention ? 'failed' : 'responded';
        if (this.job.needsAttention) this.job.error = 'Copilot returned, but at least one tool reported failure. Review the response and workspace before retrying.';
      }
    } catch (error) {
      this.job.phase = active.cancelled ? 'cancelled' : active.dispatched && !active.receivedTerminal ? 'unknown' : 'failed';
      this.job.error = `${error.message} No automatic retry was made; inspect the session for any partial work.`;
    } finally {
      clearTimeout(this.progressTimer); this.progressTimer = null;
      try { await active.client?.close(); }
      catch (error) {
        this.job.phase = 'unknown'; this.job.error = `Owned Copilot transport could not be cleanly closed: ${error.message}`;
        this.job.cleanupNeeded = active.client?.done === false;
      }
      this.job.permission = null;
      this.job.completedAt = new Date().toISOString();
      await this.save();
      if (!this.job.cleanupNeeded) this.active = null;
      this.publish(this.job);
      try { await this.notify(this.job); }
      catch (error) {
        this.job.notificationWarning = `Desktop notification failed: ${error.message}. The durable receipt remains available.`;
        await this.save(); this.publish(this.job);
      }
    }
  }

  async state() { await this.ready; return this.job; }
  async approve(jobId, permissionId, optionId) {
    const active = this.active;
    if (!active || active.id !== jobId || active.cancelled || this.job.permission?.id !== permissionId) throw new Error('This permission request is no longer active.');
    const permission = this.job.permission;
    const selected = permission.options.find((item) => item.optionId === optionId);
    if (!selected) throw new Error('Invalid approval option.');
    this.job.permission = null; this.job.phase = 'running';
    this.job.lastApproval = { permissionId, kind: selected.kind, decidedAt: new Date().toISOString() };
    try { await this.save(); }
    catch (error) {
      active.client.fail(new Error(`Approval decision could not be persisted. No approval granted: ${error.message}`));
      throw error;
    }
    if (this.active !== active || active.cancelled) throw new Error('Work stopped before this approval could be delivered.');
    active.client.approve(permissionId, optionId);
    this.publish(this.job);
  }
  async acknowledge(id) {
    await this.ready;
    if (!this.job || this.job.id !== id || !terminalPhases.has(this.job.phase) || this.active) throw new Error('Only a finished receipt can be acknowledged.');
    this.job.acknowledged = true; await this.save(); this.publish(this.job);
  }
  async cancel(id) {
    const active = this.active;
    if (!active || active.id !== id) return;
    active.cancelled = true;
    if (active.client && !active.client.done && !active.client.failure) active.client.write({ method: 'session/cancel', params: { sessionId: this.job.sessionId } });
    await active.client?.stop();
    if (this.running) await this.running;
    if (this.job.cleanupNeeded && active.client?.done) {
      this.job.cleanupNeeded = false;
      this.job.error = 'Owned transport is now stopped. The previous task outcome remains unverified.';
      await this.save(); this.active = null; this.publish(this.job);
    }
  }
  async close() {
    if (this.active) await this.cancel(this.active.id);
    if (this.discovery.work) await this.discovery.cancel(this.discovery.work.id);
    await this.tail;
  }
}

module.exports = { WorkHost, sameWorkspace, terminalCommand, terminalPhases };
