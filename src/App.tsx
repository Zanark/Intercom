import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activePath, applyEvent, contexts, isProfile, profiles, resolveTarget } from './model';
import type { Context, Job, Profile } from './model';
import { MicrophonePicker } from './MicrophonePicker';

const profileKey = 'intercom.prototype.profile';
const Mesh = lazy(() => import('./Mesh'));
const phaseLabel = {
  routing: 'Resolving demo route',
  running: 'Simulated session working',
  'finished-unverified': 'Demo finished - not verified',
  cancelled: 'Demo cancelled',
};

function Icon({ name }: { name: 'mesh' | 'float' | 'mic' | 'arrow' | 'pin' | 'close' | 'minus' | 'restore' }) {
  const paths = {
    mesh: <><circle cx="12" cy="12" r="8" /><ellipse cx="12" cy="12" rx="3.5" ry="8" /><path d="M4 12h16M6 6l12 12M6 18 18 6" /></>,
    float: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M14 4v6h6M10 14l-6 6" /></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    pin: <><path d="m8 3 8 0-1 6 4 4H5l4-4-1-6ZM12 13v8" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    minus: <path d="M5 12h14" />,
    restore: <><rect x="5" y="8" width="11" height="11" rx="1" /><path d="M9 8V4h11v11h-4" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function App() {
  const [desktop, setDesktop] = useState<DesktopState>({ floating: false, onTop: false, paused: false });
  const [profile, setProfile] = useState<Profile>(profiles[0]);
  const [storageReady, setStorageReady] = useState(false);
  const [error, setError] = useState('');
  const [request, setRequest] = useState('In Workshop, outline the next release.');
  const [candidates, setCandidates] = useState<Context[] | null>(null);
  const [proposal, setProposal] = useState<Context | null>(null);
  const [selectedId, setSelectedId] = useState('intercom');
  const [job, setJob] = useState<Job | null>(null);
  const [motion, setMotion] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const speakingGeneration = useRef(0);
  const busy = job?.phase === 'routing' || job?.phase === 'running';
  const slots = useMemo(() => activePath(job), [job]);
  const desktopAvailable = !!window.intercom;

  const stopSpeech = useCallback(() => {
    speakingGeneration.current++;
    window.speechSynthesis?.cancel();
    utterance.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      setError('System speech is unavailable in this runtime. The written result remains available.');
      return;
    }
    stopSpeech();
    const voices = window.speechSynthesis.getVoices().filter((voice) => voice.localService);
    if (!voices.length) {
      setError('No local system voice is available yet. No cloud voice was selected; use the written demo result.');
      return;
    }
    const speech = new SpeechSynthesisUtterance(text);
    speech.voice = voices.find((voice) => voice.lang.toLowerCase().startsWith('en')) ?? voices[0];
    speech.rate = 1.04;
    const generation = speakingGeneration.current;
    speech.onend = () => { if (generation === speakingGeneration.current) { setSpeaking(false); utterance.current = null; } };
    speech.onerror = (event) => {
      if (generation !== speakingGeneration.current) return;
      setSpeaking(false);
      utterance.current = null;
      setError(`Local speech failed: ${event.error}. The written result remains available.`);
    };
    utterance.current = speech;
    setSpeaking(true);
    window.speechSynthesis.speak(speech);
  }, [stopSpeech]);

  const windowAction = useCallback(async (action: WindowAction) => {
    if (!window.intercom) {
      setError('Desktop window controls require the Electron app. A browser page cannot float transparently over your desktop.');
      return;
    }
    try {
      const state = await window.intercom.windowAction(action);
      setDesktop(state);
    } catch (reason) {
      setError(`Window action failed: ${reason instanceof Error ? reason.message : String(reason)}`);
    }
  }, []);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(profileKey);
      if (isProfile(stored)) setProfile(stored);
      else if (stored !== null) setError('The saved profile was invalid. Speed / performance has been restored.');
    } catch {
      setError('Profile storage is unavailable. The selected profile will last only for this launch.');
    }
    setStorageReady(true);
    const remove = window.intercom?.onWindowState(setDesktop);
    if (window.intercom) void windowAction('state');
    return () => { remove?.(); window.speechSynthesis?.cancel(); };
  }, [windowAction]);

  useEffect(() => {
    if (!storageReady) return;
    try { localStorage.setItem(profileKey, profile); }
    catch { setError('The profile could not be saved. It will last only for this launch.'); }
  }, [profile, storageReady]);

  useEffect(() => {
    if (!job || !busy) return;
    const event = {
      jobId: job.id,
      sequence: job.sequence + 1,
      phase: job.phase === 'routing' ? 'running' as const : 'finished-unverified' as const,
    };
    const timer = setTimeout(() => setJob((current) => current ? applyEvent(current, event) : current), job.phase === 'routing' ? 1000 : 6500);
    return () => clearTimeout(timer);
  }, [job, busy]);

  useEffect(() => {
    if (job?.phase === 'finished-unverified' && voiceEnabled) {
      speak(`Demo only. The simulated ${contexts.find((context) => context.id === job.contextId)?.name} session has finished. No real work was performed.`);
    }
  }, [job, voiceEnabled, speak]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (window.intercom && ((event.ctrlKey && event.shiftKey && event.key.toLowerCase() === 'm') || (event.key === 'Escape' && desktop.floating))) {
        event.preventDefault();
        void windowAction('toggle-floating');
      }
      if (event.key === 'Escape') {
        stopSpeech();
        setProposal(null);
        setCandidates(null);
      }
    }
    function onVisibility() { if (document.hidden) stopSpeech(); }
    window.addEventListener('keydown', onKey);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [stopSpeech, desktop.floating, windowAction]);

  function prepare(text = request) {
    if (busy || !text.trim()) return;
    setError('');
    setProposal(null);
    const matches = resolveTarget(text);
    if (matches.length === 1) {
      setProposal(matches[0]);
      setSelectedId(matches[0].id);
      setCandidates(null);
    } else {
      setCandidates(matches.length ? matches : contexts);
    }
  }
  function confirm() {
    if (!proposal || busy) return;
    stopSpeech();
    setJob({
      id: crypto.randomUUID(), contextId: proposal.id, request: request.trim(),
      profile, phase: 'routing', sequence: 0,
    });
    setProposal(null);
    setCandidates(null);
  }
  const selected = contexts.find((context) => context.id === selectedId)!;

  return <main className={desktop.floating ? 'app floating' : 'app'} data-floating={desktop.floating}>
    <header className="titlebar chrome">
      <a className="brand" href="#" onClick={(event) => event.preventDefault()}><Icon name="mesh" /><span>intercom<span className="brand-dot">.</span></span></a>
      <div className="titlebar-center">YOUR CONTEXT, CONNECTED</div>
      <div className="window-actions">
        <button aria-label="Minimize" disabled={!desktopAvailable} onClick={() => void windowAction('minimize')}><Icon name="minus" /></button>
        <button aria-label="Close Intercom" disabled={!desktopAvailable} onClick={() => void windowAction('close')}><Icon name="close" /></button>
      </div>
    </header>

    <aside className="sidebar chrome">
      <div className="eyebrow">WORKSPACE</div>
      <h1>A little less switching.<br /><span>A little more flow.</span></h1>
      <p className="muted intro">One conversation.<br />All your contexts, in reach.</p>
      <div className="context-list" aria-label="Synthetic demo contexts">
        <div className="list-heading"><span>CONTEXTS</span><span>06</span></div>
        {contexts.map((context) => <button key={context.id} className={`context-row ${context.id === selectedId ? 'selected' : ''}`} onClick={() => setSelectedId(context.id)} aria-pressed={context.id === selectedId}>
          <span className="context-mark" style={{ '--context-color': context.color } as React.CSSProperties}>{context.name.slice(0, 1)}</span>
          <span><strong>{context.name}</strong><small>{context.subtitle}</small></span><span className="context-indicator" />
        </button>)}
      </div>
      <div className="sidebar-note"><span className="status-dot" />Local prototype<br /><small>Synthetic contexts. No live sessions.</small></div>
    </aside>

    <section className="center" aria-label="Context mesh">
      <div className="mesh-heading chrome"><div><div className="eyebrow">CONTEXT MESH</div><h2>Everything has a connection.</h2></div><span className="fixture-badge">FIXTURE DATA</span></div>
      <Suspense fallback={<p className="mesh-loading" role="status">Loading the demo mesh...</p>}>
        <Mesh activeSlots={slots} selectedId={selectedId} profile={busy && job ? job.profile : profile} motion={motion} paused={desktop.paused} />
      </Suspense>
      <div className="mesh-caption chrome"><span className="selected-context" style={{ color: selected.color }}>{selected.name}</span><span>Drag to explore<span className="caption-dot"> / </span>Scroll to zoom</span></div>
      <div className="mesh-toolbar chrome">
        <span className="legend"><i />Demo path <i className="dim" />Topology</span>
        <button className="quiet-button" aria-pressed={motion} onClick={() => setMotion(!motion)}>{motion ? 'Pause drift' : 'Enable drift'}</button>
        <button className="quiet-button float-button" disabled={!desktopAvailable} onClick={() => void windowAction('toggle-floating')}><Icon name="float" />Floating mesh</button>
      </div>
      <div className="floating-handle" aria-label="Move floating mesh" title="Drag to move. Ctrl+Shift+M or Escape restores the full view." />
      <div className="floating-tools">
        <span className="floating-demo">DEMO</span>
        <button title="Restore workspace (Escape)" aria-label="Restore workspace" onClick={() => void windowAction('toggle-floating')}><Icon name="restore" /></button>
        <button title="Always on top" aria-label="Always on top" aria-pressed={desktop.onTop} onClick={() => void windowAction('toggle-top')}><Icon name="pin" /></button>
        <button title="Close" aria-label="Close floating mesh" onClick={() => void windowAction('close')}><Icon name="close" /></button>
      </div>
    </section>

    <aside className="activity chrome">
      <div className="eyebrow">THE CONVERSATION</div>
      <div className="activity-title"><span className="status-dot" /><span>{busy ? 'Demo in progress' : 'Ready when you are'}</span></div>
      <div className="message assistant"><span className="message-label">INTERCOM / DEMO</span><p>Your workspace, without the window shuffle.</p><p className="muted">Try a synthetic request below. I&apos;ll show the route, not run a real agent.</p></div>
      <MicrophonePicker />
      {job && <div className="job-card" aria-live="polite">
        <div className="message-label">SIMULATED ACTIVITY</div>
        <strong>{phaseLabel[job.phase]}</strong>
        <p>{contexts.find((context) => context.id === job.contextId)?.name}</p>
        <small>{job.profile} snapshot</small>
        {job.phase === 'finished-unverified' && <p className="result">The fixture emitted a completion event. No files changed, no live session ran, and no outcome was verified.</p>}
        {busy && <button className="quiet-button" onClick={() => setJob((current) => current ? applyEvent(current, { jobId: current.id, sequence: current.sequence + 1, phase: 'cancelled' }) : current)}>Cancel demo job</button>}
      </div>}
      <div className="profile-section"><label htmlFor="profile">Processing priority</label><select id="profile" value={profile} onChange={(event) => { if (isProfile(event.target.value)) setProfile(event.target.value); }}>
        {profiles.map((item) => <option key={item}>{item}</option>)}
      </select><small>Prototype: rendering budget only. Applies to the next demo job; no inference engine is connected.</small></div>
      <label className="voice-toggle"><input type="checkbox" checked={voiceEnabled} onChange={(event) => { setVoiceEnabled(event.target.checked); if (!event.target.checked) stopSpeech(); }} />Read demo results using a local system voice</label>
      <button className="quiet-button" disabled={!speaking} onClick={stopSpeech}>Stop speech <span className="muted">(does not cancel work)</span></button>
    </aside>

    <footer className="composer chrome">
      <div className="composer-icon"><Icon name="mic" /></div>
      <form onSubmit={(event) => { event.preventDefault(); prepare(); }}>
        <label htmlFor="request">A VOICE WORKSPACE, IN PREVIEW</label>
        <div className="input-row"><input id="request" maxLength={1000} value={request} disabled={busy} onChange={(event) => { setRequest(event.target.value); setProposal(null); setCandidates(null); }} placeholder="Try: In Workshop, outline the next release." /><button className="send-button" type="submit" disabled={busy || !request.trim()} aria-label="Prepare demo request"><Icon name="arrow" /></button></div>
      </form>
      <button className="sample-button" disabled={busy} onClick={() => { const sample = 'In Atlas, summarize the research plan.'; setRequest(sample); prepare(sample); }}>Simulate voice request</button>
    </footer>

    {(proposal || candidates) && <div className="confirmation chrome" role="region" aria-label="Demo request confirmation">
      {proposal ? <><div><span className="message-label">CONFIRM DEMO TARGET</span><p><strong>{proposal.name}</strong> / synthetic session only</p><small>No terminal, agent, or microphone will be started.</small></div><button className="primary-button" onClick={confirm}>Run simulation</button></> :
        <div><span className="message-label">WHICH DEMO CONTEXT?</span><p>The target is missing or ambiguous. Choose explicitly.</p><div className="candidate-list">{candidates!.map((context) => <button key={context.id} className="quiet-button" onClick={() => { setProposal(context); setSelectedId(context.id); setCandidates(null); }}>{context.name}</button>)}</div></div>}
      <button className="quiet-button" onClick={() => { setProposal(null); setCandidates(null); }}>Dismiss</button>
    </div>}
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">x</button></div>}
  </main>;
}
