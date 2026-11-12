import { useEffect, useState } from 'react';
import { SettingsTabs } from './SettingsTabs';

const active = new Set(['queued', 'starting', 'running', 'awaiting-approval']);
const labels: Record<IntercomPlan['actions'][number]['phase'], string> = {
  queued: 'Queued', starting: 'Checking the exact existing session', running: 'Copilot working',
  'awaiting-approval': 'Tool permission required', responded: 'Agent responded; task success unverified',
  succeeded: 'Status snapshot captured', failed: 'Failed; review details', blocked: 'Blocked; not dispatched',
  cancelled: 'Cancelled; partial changes may remain', unknown: 'Outcome uncertain; inspect before retrying',
};

export function PlanReceipts({ state }: { state: IntercomOrchestration }) {
  const [planId, setPlanId] = useState('');
  const [actionId, setActionId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'Activity' | 'Permission' | 'Result'>('Activity');
  const plan = state.plans.find((item) => item.id === planId) ??
    state.plans.find((item) => item.actions.some((action) => action.job?.permission)) ?? state.plans[state.plans.length - 1];
  const action = plan?.actions.find((item) => item.id === actionId) ??
    plan?.actions.find((item) => item.job?.permission) ?? plan?.actions[0];
  const definition = plan?.interpretation.actions.find((item) => item.id === action?.id);
  const target = plan?.targets.find((item) => item.id === definition?.sessionId);
  const permission = action?.job?.permission;
  const permissionId = permission?.id;
  const working = plan?.actions.some((item) => active.has(item.phase) || item.job?.cleanupNeeded);
  useEffect(() => { if (permissionId) setTab('Permission'); }, [permissionId, action?.job?.id]);
  async function act(operation: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  return <div aria-label="Orchestration receipts">
    {state.error && <p className="voice-error" role="alert">{state.error}</p>}
    {error && <p className="voice-error" role="alert">{error}</p>}
    {!plan && <p>Talk to Intercom to route work to your existing sessions. Clear requests run without another target confirmation; tool permissions stay manual.</p>}
    {plan && <>
      <div className="plan-selectors">
        <div>
          <label htmlFor="plan-receipt">Request receipt</label>
          <select id="plan-receipt" value={plan.id} onChange={(event) => { setPlanId(event.target.value); setActionId(''); }}>
            {state.plans.map((item) => <option key={item.id} value={item.id}>{new Date(item.createdAt).toLocaleTimeString()} / {item.actions.some((entry) => entry.job?.permission) ? 'Tool permission' : item.phase === 'finished' ? 'Settled - review outcomes' : item.phase}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="plan-action">Action</label>
          <select id="plan-action" value={action?.id ?? ''} onChange={(event) => setActionId(event.target.value)}>
            {plan.actions.map((item) => {
              const task = plan.interpretation.actions.find((entry) => entry.id === item.id)!;
              const session = plan.targets.find((entry) => entry.id === task.sessionId)!;
              return <option key={item.id} value={item.id}>{session.name} / {task.kind} / {labels[item.phase]}</option>;
            })}
          </select>
        </div>
      </div>
      {action && <div className="job-card real-job" aria-live="polite">
        <strong>{labels[action.phase]}</strong>
        <small className="plan-target" title={`${target?.contextName} / ${target?.name}`}>{target?.contextName} / {target?.name}</small>
        <small>{target?.id} / {plan.profile}</small>
        <SettingsTabs tabs={['Activity', 'Permission', 'Result'] as const} value={tab} onChange={setTab} label="Plan action details" />
        <div hidden={tab !== 'Activity'}>
          <label htmlFor="plan-activity">Observed activity</label>
          <textarea id="plan-activity" readOnly rows={3} value={[
            action.job?.activity ?? labels[action.phase],
            ...(definition?.after.map((edge) => `After ${edge.actionId} (${edge.outcome}).`) ?? []),
            ...(action.status ? [`Catalog at ${new Date(action.status.observedAt).toLocaleTimeString()}: ${action.status.availability}.`,
              action.status.receipt ? `Owned receipt: ${action.status.receipt.phase}.` : 'No owned work receipt. Idle is not proof of completion.'] : []),
            'No automatic retries or agent-based polling. Cancelling cannot undo changes already made.',
          ].join('\n')} />
        </div>
        <div hidden={tab !== 'Permission'}>
          {permission ? <div className="permission-request" role="region" aria-label="Orchestrated tool permission">
            <label htmlFor="plan-permission">Review the full operation before deciding</label>
            <textarea id="plan-permission" readOnly rows={3} value={permission.details} />
            {permission.options.map((option) => <button key={option.optionId} className={option.kind === 'allow_once' ? 'primary-button' : 'quiet-button'} disabled={busy}
              onClick={() => void act(() => window.intercom!.approvePlanAction(plan.id, action.id, action.job!.id, permission.id, option.optionId))}>{option.kind === 'allow_once' ? 'Allow this operation once' : 'Reject this operation'}</button>)}
          </div> : <p>No operation is awaiting permission.</p>}
        </div>
        <div hidden={tab !== 'Result'}>
          {action.researchReport && <div className="research-receipt">
            <p>{action.researchReport.summary}</p>
            <small>{action.researchReport.path}</small>
            {action.researchReport.openError && <p role="alert">{action.researchReport.openError}</p>}
            <button className="quiet-button" disabled={busy} onClick={() => void act(() => window.intercom!.openResearchReport(action.researchReport!.id))}>Open synthesized report</button>
          </div>}
          {action.researchError && <p className="voice-error" role="alert">Synthesis report was not completed: {action.researchError}. The source report and original response remain available.</p>}
          <label htmlFor="plan-result">Response / outcome details</label>
          <textarea id="plan-result" readOnly rows={3} value={[
            action.error, action.job?.error, action.job?.text, action.status?.receipt?.error, action.status?.receipt?.text,
          ].filter(Boolean).join('\n\n') || 'No response or outcome details yet.'} />
        </div>
      </div>}
      {working && <button className="quiet-button" title="Cancelling cannot undo changes already made." disabled={busy} onClick={() => void act(() => window.intercom!.cancelPlan(plan.id))}>Cancel this plan</button>}
      {!working && !plan.acknowledged && <button className="quiet-button" disabled={busy} onClick={() => void act(() => window.intercom!.acknowledgePlan(plan.id))}>{plan.phase === 'unknown' ? 'I inspected the uncertain outcome - acknowledge' : 'Acknowledge this receipt'}</button>}
    </>}
  </div>;
}
