import { useEffect, useRef, useState } from 'react';
import type { Context, Profile } from './model';

const finished = new Set<WorkJob['phase']>(['responded', 'failed', 'unknown', 'cancelled', 'terminal-opened']);
const labels: Record<WorkJob['phase'], string> = {
  starting: 'Connecting to the confirmed session', running: 'Copilot working in the background',
  'awaiting-approval': 'Copilot needs your permission', responded: 'Copilot finished responding - review the result',
  failed: 'Work needs attention', unknown: 'Outcome unknown - inspect before retrying',
  cancelled: 'Owned work stopped - partial changes may remain', 'terminal-opened': 'Terminal launched - manually owned',
};

interface Props {
  contexts: Context[];
  contextId: string;
  profile: Profile;
  voiceProposal: WorkVoiceProposal | null;
  onSelect: (contextId: string) => void;
  onJob: (job: WorkJob | null) => void;
  recording: boolean;
  hidden: boolean;
}

export function WorkPanel({ contexts, contextId, profile, voiceProposal, onSelect, onJob, recording, hidden }: Props) {
  const [request, setRequest] = useState('');
  const [mode, setMode] = useState<WorkMode>('background');
  const [sessions, setSessions] = useState<{ id: string; status: string }[]>([]);
  const [sessionId, setSessionId] = useState('');
  const [proposal, setProposal] = useState<WorkProposal | null>(null);
  const [job, setJob] = useState<WorkJob | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [announce, setAnnounce] = useState(true);
  const version = useRef(0);
  const received = useRef(0);
  const announced = useRef(new Set<string>());
  const liveCompletions = useRef(new Set<string>());
  const context = contexts.find((item) => item.id === contextId);
  const working = !!job && !finished.has(job.phase);
  const report = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);

  useEffect(() => {
    let mounted = true;
    const sequence = received.current;
    void window.intercom?.workState().then((current) => {
      if (mounted && received.current === sequence) { setJob(current); onJob(current); }
    }).catch((reason: unknown) => { if (mounted) setError(report(reason)); });
    const remove = window.intercom?.onWorkProgress((current) => {
      if (current.completedAt) liveCompletions.current.add(current.id);
      received.current++; setJob(current); onJob(current);
    });
    return () => { mounted = false; remove?.(); };
  }, [onJob]);

  useEffect(() => {
    version.current++; setProposal(null); setSessions([]); setSessionId('');
  }, [contextId]);
  useEffect(() => { version.current++; setProposal(null); }, [profile]);
  useEffect(() => {
    if (!voiceProposal) return;
    version.current++; setProposal(null); setRequest(voiceProposal.text); setMode(voiceProposal.mode);
  }, [voiceProposal]);
  useEffect(() => {
    if (!job?.completedAt || !finished.has(job.phase) || !announce || recording || job.acknowledged ||
        announced.current.has(job.id) || !liveCompletions.current.has(job.id) || !window.intercom) return;
    // Restored receipts stay visible, but are not re-announced on every launch.
    announced.current.add(job.id);
    const value = job.phase === 'responded'
      ? `${job.contextName}. Copilot has finished responding. ${job.text.slice(0, 2500)}. Review the written result; task success is not independently verified.`
      : `${job.contextName}. ${labels[job.phase]}. ${job.error ?? job.text.slice(0, 1000)}`;
    void window.intercom.speakVoice(value.slice(0, 4400)).catch((reason: unknown) => setError(`Work speech failed: ${report(reason)}`));
  }, [job, announce, recording]);

  async function act(operation: () => Promise<unknown>) {
    if (busy) return;
    setBusy(true); setError('');
    try { await operation(); } catch (reason) { setError(report(reason)); }
    finally { setBusy(false); }
  }
  function invalidate() { version.current++; setProposal(null); }
  return <section className="work-panel" aria-label="Confirmed existing-session work" hidden={hidden}>
    <details open><summary>Real session work / terminal</summary>
      <label htmlFor="work-context">Target context</label>
      <select id="work-context" value={contextId} disabled={busy || recording} onChange={(event) => onSelect(event.target.value)}>
        {!context && <option value="">Load the real mesh first</option>}
        {contexts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
      </select>
      <small>{context?.basePath ?? 'No real context selected.'}</small>
      <button className="quiet-button" disabled={!context || busy || recording || !window.intercom} onClick={() => void act(async () => {
        invalidate(); const revision = version.current;
        const found = await window.intercom!.workSessions(contextId);
        if (revision !== version.current) return;
        setSessions(found); setSessionId('');
        if (!found.length) setError('No resumable existing sessions in this exact workspace. No new session was created.');
      })}>Find existing sessions</button>
      <label htmlFor="work-session">Choose an existing session</label>
      <select id="work-session" value={sessionId} disabled={busy || recording} onChange={(event) => { invalidate(); setSessionId(event.target.value); }}>
        <option value="">Select explicitly</option>
        {sessions.map((item) => <option key={item.id} value={item.id} disabled={item.status !== 'idle'}>{item.id} / {item.status}</option>)}
      </select>
      <label htmlFor="work-mode">Execution</label>
      <select id="work-mode" value={mode} disabled={busy || recording} onChange={(event) => { invalidate(); if (event.target.value === 'background' || event.target.value === 'terminal') setMode(event.target.value); }}>
        <option value="background">Background / in-app approvals and result</option><option value="terminal">New terminal / manual ownership</option>
      </select>
      <label htmlFor="work-request">Confirmed task</label>
      <textarea id="work-request" maxLength={1000} value={request} disabled={busy || recording} onChange={(event) => { invalidate(); setRequest(event.target.value); }} />
      <button className="quiet-button" disabled={busy || working || recording || !sessionId || !request.trim()} onClick={() => void act(async () => {
        const revision = version.current;
        const prepared = await window.intercom!.prepareWork(contextId, sessionId, request, mode, profile);
        if (revision === version.current) setProposal(prepared);
      })}>Review target and task</button>
      {proposal && <div className="work-confirmation" role="region" aria-label="Real work confirmation">
        <strong>{proposal.contextName}</strong><p>{proposal.workspace}</p><p>{proposal.sessionId}</p><p>{proposal.request}</p>
        <small>{proposal.mode} / {proposal.profile}. Agent mode, allow-all OFF, no new session. Existing saved Copilot approvals still apply. Supported reasoning effort follows the chosen priority; model stays inherited. These session settings persist.</small>
        <button className="primary-button" disabled={busy || recording} onClick={() => void act(async () => {
          setProposal(null);
          await window.intercom!.confirmWork(proposal.id);
        })}>Confirm this target and task</button>
        <button className="quiet-button" onClick={invalidate}>Dismiss proposal</button>
      </div>}
      <small>Busy sessions are refused at dispatch. One owned job; no model polling. A new terminal requires manual task entry and is not monitored or reported as completed.</small>
    </details>
    <label className="voice-toggle"><input type="checkbox" checked={announce} onChange={(event) => setAnnounce(event.target.checked)} />Speak work completion and attention updates</label>
    {job && <div className="job-card real-job" aria-live="polite">
      <div className="message-label">REAL WORK RECEIPT / {job.contextName}</div><strong>{labels[job.phase]}</strong>
      <small>{job.sessionId}<br />{job.profile}</small><p>{job.activity}</p>
      {job.effective && <small>Model: {job.effective.model}. Reasoning: {job.effective.effort}. {job.effective.approval}.</small>}
      {job.permission && <div className="permission-request" role="region" aria-label="Copilot tool permission">
        <strong>Agent-requested operation. Review the full details:</strong><pre>{job.permission.details}</pre>
        {job.permission.options.map((item) => <button key={item.optionId} className={item.kind === 'allow_once' ? 'primary-button' : 'quiet-button'} disabled={busy || recording}
          onClick={() => void act(() => window.intercom!.approveWork(job.id, job.permission!.id, item.optionId))}>{item.kind === 'allow_once' ? 'Allow this operation once' : 'Reject this operation'}</button>)}
        <small>No always-allow option is offered. Approval expires after two minutes.</small>
      </div>}
      {job.text && <p className="result">{job.text}</p>}
      {job.error && <p role="alert">{job.error}</p>}
      {job.notificationWarning && <p role="alert">{job.notificationWarning}</p>}
      {(!finished.has(job.phase) || job.cleanupNeeded) && <button className="quiet-button" disabled={busy} onClick={() => void act(() => window.intercom!.cancelWork(job.id))}>Cancel owned work</button>}
      {finished.has(job.phase) && !job.acknowledged && <button className="quiet-button" disabled={busy || job.cleanupNeeded} onClick={() => void act(() => window.intercom!.acknowledgeWork(job.id))}>Acknowledge receipt</button>}
      <small>Agent-reported results are not independent verification. Work survives panel changes, not app exit; an interrupted run is never silently retried.</small>
    </div>}
    {error && <p className="voice-error" role="alert">{error}</p>}
  </section>;
}
