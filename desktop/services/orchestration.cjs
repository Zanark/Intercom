const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { WorkHost } = require('./work.cjs');
const { requireId } = require('./voice.cjs');
const { priorities } = require('./acp.cjs');
const { RestrictedInterpreter, validateInterpretation } = require('./interpreter.cjs');
const { SessionCatalog, workspaceKey, overlapsWorkspace } = require('./session-catalog.cjs');
const { ResearchHost } = require('./research.cjs');

const terminal = new Set(['responded', 'succeeded', 'failed', 'blocked', 'cancelled', 'unknown']);
const phases = new Set(['queued', 'starting', 'running', 'awaiting-approval', ...terminal]);
const finished = new Set(['responded', 'succeeded', 'failed', 'cancelled']);
const jobPhases = new Set(['starting', 'running', 'awaiting-approval', 'responded', 'failed', 'cancelled', 'unknown']);

function validateSavedOutcome(job) {
  requireId(job.id);
  if (!jobPhases.has(job.phase) || typeof job.text !== 'string' || job.text.length > 32000 ||
      typeof job.startedAt !== 'string' || !Number.isFinite(Date.parse(job.startedAt)) ||
      (job.completedAt !== undefined && (typeof job.completedAt !== 'string' || !Number.isFinite(Date.parse(job.completedAt)))) ||
      (job.error !== undefined && (typeof job.error !== 'string' || job.error.length > 32000))) {
    throw new Error('Invalid saved action outcome.');
  }
}

class OrchestrationHost {
  constructor(profile, mesh, publish, dependencies = {}) {
    this.root = path.join(profile, 'orchestration');
    this.mesh = mesh; this.publish = publish;
    this.catalog = dependencies.catalog ?? new SessionCatalog(profile, mesh);
    this.interpreter = dependencies.interpreter ?? new RestrictedInterpreter(profile);
    this.research = dependencies.research ?? new ResearchHost(profile, { openPath: dependencies.openReport });
    this.assertExternalAvailable = dependencies.assertAvailable ?? (() => {});
    this.makeWork = dependencies.makeWork ?? ((...args) => new WorkHost(...args));
    this.plans = []; this.active = new Map(); this.operations = new Set();
    this.tail = Promise.resolve(); this.mutations = Promise.resolve();
    this.ready = this.recover();
    void this.ready.catch((error) => { this.failure = error; console.error('Intercom orchestration recovery failed:', error.message); });
  }

  async recover() {
    const file = path.join(this.root, 'plans.json');
    let data;
    try {
      if ((await fs.stat(file)).size > 8 * 1024 * 1024) throw new Error('Orchestration receipt exceeds its size bound.');
      data = JSON.parse(await fs.readFile(file, 'utf8'));
    } catch (error) { if (error.code === 'ENOENT') return; throw error; }
    if (data.version !== 1 || !Array.isArray(data.plans) || data.plans.length > 8) throw new Error('Invalid orchestration receipt.');
    const ids = new Set();
    for (const plan of data.plans) {
      if (requireId(plan.id) !== plan.id) throw new Error('Invalid canonical saved plan identity.');
      if (ids.has(plan.id) || !Object.hasOwn(priorities, plan.profile) ||
          (plan.researchReportId !== undefined && requireId(plan.researchReportId) !== plan.researchReportId) ||
          !Array.isArray(plan.targets) || plan.targets.length > 256 ||
          !['active', 'finished', 'cancelled', 'unknown'].includes(plan.phase) ||
          typeof plan.cancelled !== 'boolean' || typeof plan.acknowledged !== 'boolean' ||
          typeof plan.createdAt !== 'string' || !Number.isFinite(Date.parse(plan.createdAt)) ||
          !Array.isArray(plan.actions)) throw new Error('Invalid saved orchestration plan.');
      ids.add(plan.id);
      validateInterpretation(plan.interpretation, plan.targets);
      const actionIds = new Set(plan.interpretation.actions.map((action) => action.id));
      if (plan.interpretation.intent !== 'plan' || plan.actions.length !== actionIds.size) throw new Error('Invalid saved orchestration actions.');
      for (const target of plan.targets) {
        if (typeof target.contextId !== 'string' || !target.contextId ||
            typeof target.workspace !== 'string' || !path.isAbsolute(target.workspace)) throw new Error('Invalid saved orchestration target.');
      }
      for (const action of plan.actions) {
        if (!actionIds.delete(action.id) || !phases.has(action.phase) ||
            (action.error !== undefined && (typeof action.error !== 'string' || action.error.length > 32000))) throw new Error('Invalid saved action receipt.');
        if (action.job) {
          validateSavedOutcome(action.job);
          const definition = plan.interpretation.actions.find((item) => item.id === action.id);
          if (definition.kind !== 'work' || action.job.sessionId !== definition.sessionId ||
              (action.job.activity !== undefined && (typeof action.job.activity !== 'string' || action.job.activity.length > 32000)) ||
              (action.job.cleanupNeeded !== undefined && typeof action.job.cleanupNeeded !== 'boolean') ||
              (action.job.observedContextIds !== undefined && (!Array.isArray(action.job.observedContextIds) ||
                action.job.observedContextIds.length > 512 || action.job.observedContextIds.some((id) => typeof id !== 'string' || id.length > 512)))) {
            throw new Error('Invalid saved action job.');
          }
          if (action.researchError !== undefined && (typeof action.researchError !== 'string' || action.researchError.length > 32000)) {
            throw new Error('Invalid saved synthesis error.');
          }
          if (action.researchReport && (!plan.researchReportId || action.researchReport.id !== plan.researchReportId ||
              typeof action.researchReport.summary !== 'string' || action.researchReport.summary.length > 2000 ||
              typeof action.researchReport.path !== 'string' || !path.isAbsolute(action.researchReport.path))) {
            throw new Error('Invalid saved synthesis receipt.');
          }
          action.job.permission = null;
          action.job.observedContextIds ??= [];
        }
        if (action.phase === 'responded' && !action.job) throw new Error('Missing saved work outcome evidence.');
        if (action.status && (!['idle', 'busy'].includes(action.status.availability) ||
            typeof action.status.observedAt !== 'string' ||
            !Number.isFinite(Date.parse(action.status.observedAt)) ||
            (action.status.receipt && (typeof action.status.receipt.text !== 'string' ||
              action.status.receipt.text.length > 32000)))) throw new Error('Invalid saved status snapshot.');
        if (action.status?.receipt) validateSavedOutcome(action.status.receipt);
        if (action.phase === 'succeeded' && (!action.status ||
            plan.interpretation.actions.find((item) => item.id === action.id).kind !== 'status')) throw new Error('Missing saved status outcome evidence.');
        if (!terminal.has(action.phase) || action.job?.cleanupNeeded) {
          action.phase = 'unknown';
          action.error = 'Intercom restarted before this action was settled. Inspect the existing session and workspace; no automatic retry or previous-process cancellation was made.';
          if (action.job) action.job.cleanupNeeded = false;
        }
      }
      if (plan.phase === 'active' || plan.actions.some((action) => action.phase === 'unknown')) plan.phase = 'unknown';
    }
    this.plans = data.plans;
    await this.save();
  }

  async state() { await this.ready; return structuredClone(this.plans); }
  emit() { this.publish({ plans: structuredClone(this.plans), requestActivity: structuredClone(this.requestActivity), error: this.failure?.message }); }

  save() {
    const content = JSON.stringify({ version: 1, plans: this.plans }) + '\n';
    const operation = this.tail.then(async () => {
      if (Buffer.byteLength(content) > 8 * 1024 * 1024) throw new Error('Orchestration receipt exceeds its size bound.');
      await fs.mkdir(this.root, { recursive: true });
      const temporary = path.join(this.root, `${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
        await fs.rename(temporary, path.join(this.root, 'plans.json'));
      } finally { await fs.rm(temporary, { force: true }); }
    });
    this.tail = operation.catch(() => {});
    return operation;
  }

  assertAvailable(sessionId, workspace) {
    this.assertOwnedAvailable(sessionId, workspace);
    this.assertExternalAvailable(sessionId, workspace);
  }

  assertOwnedAvailable(sessionId, workspace) {
    for (const owner of this.active.values()) {
      if (owner.sessionId === sessionId || (workspace && overlapsWorkspace(owner.workspace, workspace))) {
        throw new Error('Intercom already owns that session or overlapping workspace. Wait or cancel its identified action.');
      }
    }
    if (this.uncertainTarget({ id: sessionId, workspace })) throw new Error('An unacknowledged uncertain action reserves this session/workspace. Inspect it before acknowledging its plan.');
  }

  uncertainTarget(target) {
    return this.plans.some((plan) => !plan.acknowledged && plan.actions.some((action) => {
      if (action.phase !== 'unknown') return false;
      const definition = plan.interpretation.actions.find((item) => item.id === action.id);
      if (definition.kind !== 'work') return false;
      const prior = plan.targets.find((item) => item.id === definition.sessionId);
      return prior.id === target.id || (target.workspace && overlapsWorkspace(prior.workspace, target.workspace));
    }));
  }

  async request(id, text, profile) {
    id = requireId(id);
    if (typeof text !== 'string' || !text.trim() || text.length > 10000 ||
        !Object.hasOwn(priorities, profile)) throw new Error('Provide a 1-10,000 character request and a supported priority.');
    await this.ready;
    if (this.closing || this.failure || this.requesting) throw new Error(this.failure?.message ?? 'Interpretation is busy or closing. No new request was accepted.');
    if (this.plans.some((plan) => plan.id === id)) throw new Error('This request already has a durable plan. No duplicate dispatch was made.');
    let finish;
    const request = { id, cancelled: false, controller: new AbortController(), done: new Promise((resolve) => { finish = resolve; }) };
    this.requesting = request;
    const clarification = this.clarification;
    this.clarification = undefined;
    this.requestActivity = { id, phase: 'discovering', startedAt: new Date().toISOString(),
      events: [], observedContextIds: [], filesRead: 0, unavailableSources: 0 };
    let progressTimer;
    const update = (phase, event) => {
      if (this.requesting !== request || request.cancelled || this.closing) return;
      this.requestActivity.phase = phase;
      if (event) {
        if (event.status === 'read') this.requestActivity.observedContextIds =
          [...new Set([...this.requestActivity.observedContextIds, ...event.contextIds])];
        this.requestActivity.events.push(event);
        this.requestActivity.events = this.requestActivity.events.slice(-128);
        this.requestActivity.filesRead = event.filesRead;
        this.requestActivity.unavailableSources = event.unavailableSources;
        progressTimer ??= setTimeout(() => { progressTimer = undefined; this.emit(); }, 120);
      } else {
        clearTimeout(progressTimer); progressTimer = undefined;
        this.emit();
      }
    };
    this.emit();
    const check = () => {
      if (request.cancelled || this.closing) throw new Error('Request cancelled. No further actions will be dispatched.');
    };
    try {
      let snapshot;
      let catalogError;
      try { snapshot = await this.catalog.read(id); }
      catch (error) {
        catalogError = error;
        snapshot = { sessions: [], warnings: [`Live session discovery is unavailable: ${error.message} Saved-context research remains separate; no live access is established.`] };
      }
      check();
      request.sessions = snapshot.sessions;
      const mesh = this.mesh();
      update('interpreting');
      const interpretation = validateInterpretation(await this.interpreter.interpret(id, text, snapshot.sessions, profile,
        mesh?.contexts ?? [], clarification), snapshot.sessions);
      check();
      if (interpretation.intent === 'clarify') {
        this.clarification = { request: interpretation.normalizedText, question: interpretation.message };
      }
      let researchReport;
      let planId = null;
      if (interpretation.intent === 'research') {
        this.requestActivity.topic = interpretation.research.topic;
        update('researching');
        researchReport = await this.research.run(id, interpretation.research, mesh, request.controller.signal,
          ({ phase, event }) => update(phase, event));
        check();
        interpretation.message = `I found ${researchReport.contexts} matching saved contexts and read ${researchReport.filesRead} usable source files. ` +
          `${researchReport.matchingHistories} of ${researchReport.readableHistories} readable session histories contain topic passages. ` +
          `${researchReport.partial ? 'Source coverage is incomplete; the report lists unavailable files. ' : ''}` +
          `${researchReport.opened ? 'The private report has been opened using the system default handler. ' : `The report is saved, but opening failed: ${researchReport.openError} `}` +
          'This does not prove access to every past session or live conversation. What would you like to do with these contexts?';
        if (interpretation.research.synthesisSessionId) {
          await this.queueSynthesis(id, id, interpretation.research.synthesisSessionId, profile, request);
          planId = id;
          interpretation.message = 'The local evidence is ready. Cited synthesis was queued in your selected existing session; real tool permissions remain manual. The illustrated synthesis will open after a valid response.';
        }
      }
      if (catalogError && interpretation.intent === 'plan') throw new Error(`Work requires fresh live discovery: ${catalogError.message}`);
      if (interpretation.intent === 'plan') await this.submit(id, interpretation, profile, request);
      if (interpretation.intent === 'plan') planId = id;
      check();
      update('finished');
      return { interpretation, planId, warnings: snapshot.warnings, researchReport };
    } catch (error) {
      this.requestActivity.phase = request.cancelled || this.closing ? 'cancelled' : 'failed';
      this.requestActivity.error = error.message;
      this.emit();
      throw error;
    } finally {
      clearTimeout(progressTimer);
      this.requesting = null; finish();
    }
  }

  async researchTargets(reportId) {
    await this.ready;
    await this.research.evidence(requireId(reportId));
    if (this.closing || this.failure) throw new Error(this.failure?.message ?? 'Orchestration is closing.');
    const snapshot = await this.catalog.read(randomUUID());
    return { warnings: snapshot.warnings, sessions: snapshot.sessions.map((session) => {
      let reason;
      try { this.assertAvailable(session.id, session.workspace); }
      catch (error) { reason = error.message; }
      return { id: session.id, name: session.name, contextName: session.contextName,
        status: reason ? 'busy' : session.status, reason };
    }) };
  }

  async queueSynthesis(id, reportId, sessionId, profile, binding) {
    if (this.plans.some((plan) => plan.researchReportId === reportId && !plan.acknowledged)) {
      throw new Error('A synthesis request already owns this report. Review and acknowledge its receipt before requesting another.');
    }
    const request = await this.research.synthesisRequest(reportId);
    if (binding.cancelled || this.closing) throw new Error('Research synthesis cancelled before queueing.');
    binding.researchReportId = reportId;
    await this.submit(id, { version: 1, intent: 'plan', normalizedText: 'Synthesize the collected research evidence.',
      message: 'Create a cited explanation using the selected existing session; tool permissions stay manual.',
      excludedStatusSessionIds: [], actions: [{ id: 'synthesize', kind: 'work', sessionId, request, after: [] }] },
    profile, binding);
  }

  async synthesize(id, reportId, sessionId, profile) {
    id = requireId(id); reportId = requireId(reportId); sessionId = requireId(sessionId);
    if (!Object.hasOwn(priorities, profile)) throw new Error('Choose a supported synthesis priority.');
    await this.ready;
    if (this.closing || this.failure || this.requesting) throw new Error(this.failure?.message ?? 'Another request is still being prepared.');
    let finish;
    const request = { id, cancelled: false, done: new Promise((resolve) => { finish = resolve; }),
      controller: new AbortController() };
    this.requesting = request;
    try {
      const snapshot = await this.catalog.read(id);
      request.sessions = snapshot.sessions;
      await this.queueSynthesis(id, reportId, sessionId, profile, request);
      return { planId: id };
    } finally { this.requesting = null; finish(); }
  }

  async cancelRequest(id) {
    id = requireId(id);
    const request = this.requesting;
    if (request?.id !== id) return;
    request.cancelled = true;
    request.controller.abort(new Error('Research cancelled. No further source reads or report opening were requested.'));
    const results = await Promise.allSettled([this.catalog.cancel?.(id), this.interpreter.cancel(id)]);
    await request.done;
    if (this.plans.some((plan) => plan.id === id)) await this.cancel(id);
    const errors = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
    if (errors.length) throw new AggregateError(errors, 'Could not verify request cancellation cleanup.');
  }

  submit(id, proposal, profile, binding) {
    id = requireId(id);
    const operation = this.mutations.then(async () => {
      await this.ready;
      if (this.closing || this.failure) throw new Error(this.failure?.message ?? 'Orchestration is closing.');
      if (binding?.cancelled) throw new Error('Request cancelled before discovery. Nothing was dispatched.');
      if (!Object.hasOwn(priorities, profile)) throw new Error('Invalid processing priority.');
      if (this.plans.some((plan) => plan.id === id)) throw new Error('This request already has a durable plan. No duplicate dispatch was made.');
      const snapshot = await this.catalog.read(binding?.id ?? randomUUID());
      if (binding?.cancelled || this.closing) throw new Error('Request cancelled before queueing. Nothing was dispatched.');
      const interpretation = validateInterpretation(proposal, snapshot.sessions);
      if (interpretation.intent !== 'plan') throw new Error('Only validated execution plans enter the queue.');
      if (binding) {
        for (const action of interpretation.actions) {
          const prior = binding.sessions.find((row) => row.id === action.sessionId);
          const fresh = snapshot.sessions.find((row) => row.id === action.sessionId);
          if (!prior || prior.contextId !== fresh.contextId || workspaceKey(prior.workspace) !== workspaceKey(fresh.workspace)) {
            throw new Error('The exact target changed after interpretation. Nothing was dispatched.');
          }
        }
      }
      for (const action of interpretation.actions) {
        if (action.kind === 'work' && this.uncertainTarget(snapshot.sessions.find((row) => row.id === action.sessionId))) {
          throw new Error('Inspect and acknowledge the previous uncertain plan before sending more work to this session/workspace.');
        }
      }
      let removed;
      if (this.plans.length >= 8) {
        const removable = this.plans.findIndex((plan) => plan.acknowledged && plan.phase !== 'active');
        if (removable < 0) throw new Error('Acknowledge an earlier plan receipt before adding another.');
        removed = { index: removable, plan: this.plans.splice(removable, 1)[0] };
      }
      const targetIds = new Set([...interpretation.actions.map((action) => action.sessionId), ...interpretation.excludedStatusSessionIds]);
      const plan = {
        id, profile, interpretation, targets: structuredClone(snapshot.sessions.filter((row) => targetIds.has(row.id))),
        ...(binding?.researchReportId ? { researchReportId: binding.researchReportId } : {}),
        createdAt: new Date().toISOString(), phase: 'active', cancelled: false, acknowledged: false,
        actions: interpretation.actions.map((action) => ({ id: action.id, phase: 'queued' })),
      };
      this.plans.push(plan);
      try { await this.save(); }
      catch (error) {
        this.plans.splice(this.plans.indexOf(plan), 1);
        if (removed) this.plans.splice(removed.index, 0, removed.plan);
        throw error;
      }
      if (binding?.cancelled || this.closing) {
        await this.cancel(id);
        throw new Error('Request cancelled before dispatch. The cancelled receipt remains available.');
      }
      this.emit(); this.wake();
      return structuredClone(plan);
    });
    this.mutations = operation.catch(() => {});
    return operation;
  }

  wake() {
    if (this.closing || this.failure) return;
    this.again = true;
    if (this.pumping) return;
    this.pumping = this.pump().catch((error) => {
      this.failure = new Error(`Orchestration stopped: ${error.message}. Inspect receipts; no automatic retry was made.`);
      this.emit();
    }).finally(() => {
      this.pumping = null;
      if (this.again && !this.failure) this.wake();
    });
  }

  async pump() {
    do {
      this.again = false;
      for (const plan of this.plans) {
        if (this.closing || this.failure) return;
        if (plan.phase !== 'active' || plan.cancelled) continue;
        for (const action of plan.actions) {
          if (this.closing || this.failure) return;
          if (action.phase !== 'queued') continue;
          const definition = plan.interpretation.actions.find((item) => item.id === action.id);
          const dependencies = definition.after.map((edge) => ({ edge, action: plan.actions.find((item) => item.id === edge.actionId) }));
          if (dependencies.some((item) => !terminal.has(item.action.phase))) continue;
          if (dependencies.some((item) => item.edge.outcome === 'succeeded' ?
            item.action.phase !== 'succeeded' : !finished.has(item.action.phase))) {
            action.phase = 'blocked';
            action.error = 'A dependency has no qualifying outcome. An agent response is not verified task success.';
            this.again = true;
            continue;
          }
          const target = plan.targets.find((row) => row.id === definition.sessionId);
          if (definition.kind === 'work' && this.uncertainTarget(target)) {
            action.phase = 'blocked';
            action.error = 'An uncertain action reserves this session/workspace. Inspect and acknowledge it; this queued action will not automatically retry.';
            this.again = true;
            continue;
          }
          if (definition.kind === 'work' && (this.active.size >= 2 || [...this.active.values()].some((owner) =>
            owner.sessionId === target.id || overlapsWorkspace(owner.workspace, target.workspace)))) continue;
          action.phase = 'starting';
          await this.save();
          if (plan.cancelled || this.closing || this.failure) { action.phase = 'cancelled'; continue; }
          const operation = definition.kind === 'status' ? this.checkStatus(plan, action, target) : this.execute(plan, action, definition, target);
          this.operations.add(operation);
          void operation.catch((error) => {
            this.failure = new Error(`Action lifecycle failed: ${error.message}. Dispatch stopped; inspect receipts.`);
            console.error(this.failure.message);
          }).finally(() => { this.operations.delete(operation); this.wake(); });
        }
        if (plan.actions.every((action) => terminal.has(action.phase))) {
          plan.phase = plan.actions.some((action) => action.phase === 'unknown') ? 'unknown' : 'finished';
        }
      }
      await this.save(); this.emit();
    } while (this.again && !this.closing && !this.failure);
  }

  async checkStatus(plan, action, target) {
    try {
      const snapshot = await this.catalog.read(randomUUID());
      if (plan.cancelled) { action.phase = 'cancelled'; return; }
      const row = snapshot.sessions.find((item) => item.id === target.id);
      if (!row || row.contextId !== target.contextId || workspaceKey(row.workspace) !== workspaceKey(target.workspace)) throw new Error('The exact status target is no longer available in its original context/workspace.');
      const latest = this.plans.flatMap((item) => item.actions).filter((item) => item.job?.sessionId === target.id)
        .sort((a, b) => Date.parse(b.job.startedAt) - Date.parse(a.job.startedAt))[0]?.job;
      action.status = {
        observedAt: snapshot.observedAt, availability: row.status,
        receipt: latest ? { id: latest.id, phase: latest.phase, text: latest.text,
          startedAt: latest.startedAt, completedAt: latest.completedAt, error: latest.error } : null,
      };
      action.phase = 'succeeded';
    } catch (error) { action.phase = plan.cancelled ? 'cancelled' : 'failed'; action.error = error.message; }
    finally { await this.settle(); }
  }

  async execute(plan, action, definition, target) {
    const key = `${plan.id}:${action.id}`;
    const owner = { sessionId: target.id, workspace: target.workspace, host: null };
    this.active.set(key, owner);
    try {
      this.assertExternalAvailable(target.id, target.workspace);
      const host = this.makeWork(path.join(this.root, 'jobs', plan.id, action.id), this.mesh, (job) => {
        action.job = structuredClone(job);
        if (['starting', 'running', 'awaiting-approval'].includes(job.phase)) action.phase = job.phase;
        this.emit();
      }, async () => {}, {
        assertAvailable: (id, workspace) => {
          if (id !== target.id || (workspace && workspaceKey(workspace) !== workspaceKey(target.workspace))) throw new Error('The session workspace changed after interpretation. Nothing was sent.');
          this.assertExternalAvailable(id, workspace);
        },
      });
      owner.host = host;
      const prepared = await host.prepare(target.contextId, target.id, definition.request, 'background', plan.profile);
      if (plan.cancelled || this.closing) { action.phase = 'cancelled'; return; }
      await host.confirm(prepared.id);
      await host.running;
      action.job = structuredClone(await host.state());
      if (!['responded', 'failed', 'cancelled', 'unknown'].includes(action.job?.phase)) throw new Error('Work returned without a terminal receipt.');
      const outcome = action.job.phase;
      if (plan.researchReportId && outcome === 'responded' && !plan.cancelled && !this.closing) {
        try {
          action.researchReport = await this.research.saveSynthesis(plan.researchReportId, action.job.text,
            { requestId: plan.id, sessionId: target.id }, () => plan.cancelled || !!this.closing);
        } catch (error) { action.researchError = error.message; }
      }
      action.phase = plan.cancelled ? 'cancelled' : outcome;
    } catch (error) {
      if (owner.host?.job) action.job = structuredClone(owner.host.job);
      action.phase = owner.host?.running || owner.host?.job?.phase === 'unknown' ? 'unknown' : plan.cancelled ? 'cancelled' : 'failed';
      action.error = error.message;
    } finally {
      if (!owner.host?.active) this.active.delete(key);
      else { action.phase = 'unknown'; action.error = 'Owned transport cleanup is unverified. Its session/workspace remain reserved.'; }
      await this.settle();
    }
  }

  async settle() {
    try { await this.save(); }
    catch (error) { this.failure = new Error(`Could not persist an action outcome: ${error.message}. Dispatch stopped; inspect individual work receipts.`); }
    this.emit();
  }

  async approve(planId, actionId, jobId, permissionId, optionId) {
    const owner = this.active.get(`${requireId(planId)}:${actionId}`);
    if (!owner?.host || owner.host.job?.id !== requireId(jobId)) throw new Error('This action approval is stale.');
    await owner.host.approve(jobId, permissionId, optionId);
  }

  async cancel(planId) {
    await this.ready;
    const plan = this.plans.find((item) => item.id === requireId(planId));
    if (!plan) throw new Error('The identified plan was not found.');
    plan.cancelled = true; plan.phase = 'cancelled';
    for (const action of plan.actions) if (action.phase === 'queued') action.phase = 'cancelled';
    const errors = [];
    try { await this.save(); }
    catch (error) {
      this.failure = new Error(`Could not persist cancellation: ${error.message}. Dispatch stopped.`);
      errors.push(error);
    }
    this.emit();
    const stopped = await Promise.allSettled([...this.active.entries()].filter(([key]) => key.startsWith(`${plan.id}:`))
      .map(async ([key, owner]) => {
        if (owner.host?.active) await owner.host.cancel(owner.host.active.id);
        if (!owner.host?.active) this.active.delete(key);
      }));
    for (const result of stopped) if (result.status === 'rejected') errors.push(result.reason);
    if (plan.actions.some((action) => action.phase === 'unknown')) plan.phase = 'unknown';
    const previousFailure = this.failure;
    await this.settle();
    if (this.failure && this.failure !== previousFailure) errors.push(this.failure);
    if (errors.length) throw new AggregateError(errors, 'Cancellation encountered persistence or owned-cleanup errors. Inspect the receipts; no automatic retry was made.');
  }

  acknowledge(planId) {
    planId = requireId(planId);
    const operation = this.mutations.then(async () => {
      await this.ready;
      const plan = this.plans.find((item) => item.id === planId);
      if (!plan || plan.phase === 'active' || plan.actions.some((action) => !terminal.has(action.phase)) ||
          [...this.active.keys()].some((key) => key.startsWith(`${plan.id}:`))) throw new Error('Only a settled plan can be acknowledged.');
      plan.acknowledged = true;
      try { await this.save(); }
      catch (error) { plan.acknowledged = false; throw error; }
      this.emit();
    });
    this.mutations = operation.catch(() => {});
    return operation;
  }

  async close() {
    this.closing = true;
    const errors = [];
    const collect = async (operations) => {
      for (const result of await Promise.allSettled(operations)) if (result.status === 'rejected') errors.push(result.reason);
    };
    await collect([this.ready]);
    if (this.requesting) await collect([this.cancelRequest(this.requesting.id)]);
    await collect([this.interpreter.close(), this.mutations]);
    await collect(this.plans.filter((plan) => plan.phase === 'active' ||
      [...this.active.keys()].some((key) => key.startsWith(`${plan.id}:`))).map((plan) => this.cancel(plan.id)));
    await collect([this.pumping, ...this.operations, this.catalog.close(), this.tail]);
    if (this.active.size) errors.push(new Error('An owned transport remains unverified; its workspace is still reserved.'));
    if (errors.length) throw new AggregateError(errors, 'Orchestration cleanup encountered errors. Inspect the receipts before closing or retrying.');
  }
}

module.exports = { OrchestrationHost };
