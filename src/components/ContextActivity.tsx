import type { Context } from '../domain/model';

const labels: Record<IntercomRequestActivity['phase'], string> = {
  discovering: 'Checking existing-session availability',
  interpreting: 'Understanding your request',
  researching: 'Reading saved context evidence',
  reporting: 'Building your private report',
  opening: 'Opening the saved report',
  finished: 'Request finished - observed evidence retained',
  failed: 'Request failed - inspect the details',
  cancelled: 'Request cancelled - earlier reads cannot be undone',
};

export function ContextActivity({ activity, voicePhase, workPhase, contexts, onInspect }: {
  activity?: IntercomRequestActivity; voicePhase: string | null; workPhase: string | null;
  contexts: Context[]; onInspect: (id: string) => void;
}) {
  if (!activity && !voicePhase && !workPhase) return null;
  const names = new Map(contexts.map((context) => [context.id, context.name]));
  const last = activity?.events.at(-1);
  const events = activity?.events.filter((event) => event.status !== 'checking' || event === last).slice().reverse() ?? [];
  return <section className="context-activity" aria-label="Observed context activity" data-phase={voicePhase ? 'voice' : workPhase ? 'working' : activity?.phase}>
    <div role="status"><span className="status-dot" />{voicePhase ?? workPhase ?? (activity && labels[activity.phase])}</div>
    {voicePhase && <p>Audio remains on-device. Earlier evidence below belongs to the previous request; listening is not a context read.</p>}
    {activity && <p>{activity.topic && <strong>{activity.topic} / </strong>}{activity.filesRead} files read / {activity.unavailableSources} unavailable or partial</p>}
    {activity?.error && <p className="context-activity-error">{activity.error}</p>}
    {events.length > 0 && <details>
      <summary>Observed sources ({activity?.events.length} recent events)</summary>
      <p>Source checks are not successful reads. Shared histories identify all indexed owners, not multiple reads. This is host research telemetry, not hidden Copilot reasoning.</p>
      <ol>{events.map((event) => <li key={event.sequence} data-status={event.status}>
        <strong>{event.status === 'read' ? event.error ? 'READ / PARTIAL' : 'READ' : event.status === 'checking' ? 'CHECKING' : 'UNAVAILABLE'}</strong>
        {' / '}{event.kind}{' / '}{new Date(event.at).toLocaleTimeString()}
        <span>{event.contextIds.map((id) => names.has(id) ? <button key={id} onClick={() => onInspect(id)}>{names.get(id)}</button> : <span key={id}>{id}</span>)}</span>
        <code>{event.path}</code>{event.error && <small>{event.error}</small>}
      </li>)}</ol>
    </details>}
  </section>;
}
