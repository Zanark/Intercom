import { useEffect, useRef, useState } from 'react';
import type { Profile } from '../domain/model';

type Catalog = Awaited<ReturnType<NonNullable<Window['intercom']>['researchSynthesisTargets']>>;

export function ResearchSynthesis({ report, profile, disabled, onQueued }: {
  report: IntercomResearchReport; profile: Profile; disabled: boolean; onQueued: () => void;
}) {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [selected, setSelected] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const generation = useRef(0);
  const request = useRef<string | null>(null);
  useEffect(() => () => {
    generation.current++;
    if (request.current) void window.intercom?.cancelInterpretation(request.current).catch((reason: unknown) =>
      console.error('Synthesis preparation cleanup failed:', reason));
  }, []);

  async function act(queue: boolean) {
    if (busy || disabled || !window.intercom) return;
    const current = ++generation.current;
    setBusy(true); setError('');
    try {
      if (queue) {
        const id = crypto.randomUUID(); request.current = id;
        await window.intercom.synthesizeResearchReport(id, report.id, selected, profile);
        if (generation.current === current) onQueued();
      } else {
        const next = await window.intercom.researchSynthesisTargets(report.id);
        if (generation.current === current) { setCatalog(next); setSelected(''); }
      }
    } catch (reason) {
      if (generation.current === current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      request.current = null;
      if (generation.current === current) setBusy(false);
    }
  }
  return <div className="research-synthesis" aria-label="Existing-session research synthesis">
    <p>Want an explanation, not just extracts? Choose the existing session that should synthesize this evidence. No spare session is chosen automatically.</p>
    <button className="quiet-button" disabled={disabled || busy} onClick={() => void act(false)}>{catalog ? 'Refresh synthesis sessions' : 'Choose synthesis session'}</button>
    {catalog && <>
      <label htmlFor="research-synthesis-session">Existing synthesis session</label>
      <select id="research-synthesis-session" value={selected} disabled={disabled || busy} onChange={(event) => setSelected(event.target.value)}>
        <option value="">Select an exact existing idle session</option>
        {catalog.sessions.map((session) => <option key={session.id} value={session.id} disabled={session.status !== 'idle'}>
          {session.contextName} / {session.name} / {session.id} / {session.status}
        </option>)}
      </select>
      {!catalog.sessions.some((session) => session.status === 'idle') && <p>No eligible idle session is available. The local report is still usable.</p>}
      {catalog.warnings.length > 0 && <details><summary>Live discovery notices</summary>{catalog.warnings.map((notice, index) => <p key={index}>{notice}</p>)}</details>}
      <button className="quiet-button" disabled={disabled || busy || !selected} onClick={() => void act(true)}>Synthesize with selected Copilot session</button>
      <small>This sends the owned evidence path to that session; reading it supplies the collected text to Copilot under that session's provider and tool permissions. Manual permissions remain in effect. Busy/stale targets are rechecked; no automatic retry.</small>
    </>}
    {error && <p className="voice-error" role="alert">{error}</p>}
  </div>;
}
