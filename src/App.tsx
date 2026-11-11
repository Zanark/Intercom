import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { activePath, applyEvent, contexts as fixtureContexts, isProfile, profiles, resolveTarget } from './model';
import type { Context, Job, MeshSnapshot, Profile } from './model';
import { MicrophonePicker } from './MicrophonePicker';
import { VoiceConversation } from './VoiceConversation';
import { WorkPanel } from './WorkPanel';

const profileKey = 'intercom.prototype.profile';
const Mesh = lazy(() => import('./Mesh'));
const emptyContexts: Context[] = [];
const phaseLabel = {
  routing: 'Resolving demo route',
  running: 'Simulated session working',
  'finished-unverified': 'Demo finished - not verified',
  cancelled: 'Demo cancelled',
};

function Icon({ name }: { name: 'float' | 'mic' | 'arrow' | 'pin' | 'close' | 'minus' | 'plus' | 'move' | 'restore' | 'maximize' }) {
  const paths = {
    float: <><rect x="4" y="4" width="16" height="16" rx="3" /><path d="M14 4v6h6M10 14l-6 6" /></>,
    mic: <><rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" /></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6" />,
    pin: <><path d="m8 3 8 0-1 6 4 4H5l4-4-1-6ZM12 13v8" /></>,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    minus: <path d="M5 12h14" />,
    plus: <path d="M5 12h14M12 5v14" />,
    move: <path d="M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4" />,
    maximize: <rect x="5" y="5" width="14" height="14" rx="1" />,
    restore: <><rect x="5" y="8" width="11" height="11" rx="1" /><path d="M9 8V4h11v11h-4" /></>,
  };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

export function App() {
  const [desktop, setDesktop] = useState<DesktopState>({ floating: false, onTop: false, maximized: false, paused: false, floatingSize: null });
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
  const [demo, setDemo] = useState(false);
  const [snapshot, setSnapshot] = useState<MeshSnapshot | null>(null);
  const [meshError, setMeshError] = useState('');
  const [meshLoading, setMeshLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [workProposal, setWorkProposal] = useState<WorkVoiceProposal | null>(null);
  const [realJob, setRealJob] = useState<WorkJob | null>(null);
  const [routeChoices, setRouteChoices] = useState<Context[] | null>(null);
  const meshRequest = useRef(0);
  const invalidateMesh = useCallback(() => { meshRequest.current++; }, []);
  const [recording, setRecording] = useState(false);
  const recordingRef = useRef(false);
  const onRecordingChange = useCallback((value: boolean) => { recordingRef.current = value; setRecording(value); }, []);
  const utterance = useRef<SpeechSynthesisUtterance | null>(null);
  const nativeSpeech = useRef(false);
  const speakingGeneration = useRef(0);
  const busy = job?.phase === 'routing' || job?.phase === 'running';
  const slots = useMemo(() => activePath(job), [job]);
  const desktopAvailable = !!window.intercom;
  const contexts = demo ? fixtureContexts : snapshot?.contexts ?? [];
  const actualContexts = snapshot?.contexts ?? emptyContexts;
  const snapshotAge = snapshot ? Date.parse(snapshot.loadedAt) - Date.parse(snapshot.generatedAt) : 0;
  const graph = useMemo<MeshSnapshot>(() => demo ? {
    contexts: fixtureContexts, edges: [], source: 'Explicit synthetic demonstration',
    generatedAt: '', loadedAt: '', demo: true,
  } : snapshot ?? { contexts: [], edges: [], source: '', generatedAt: '', loadedAt: '', demo: false }, [demo, snapshot]);
  const loadMesh = useCallback(async () => {
    const request = ++meshRequest.current;
    setMeshLoading(true); setMeshError(''); setSnapshot(null);
    try {
      if (!window.intercom) throw new Error('The local Context Mesh requires the desktop app. No fixture was substituted.');
      const current = await window.intercom.loadContextMesh();
      if (request === meshRequest.current) setSnapshot(current);
    } catch (reason) {
      if (request === meshRequest.current) setMeshError(reason instanceof Error ? reason.message : String(reason));
    } finally { if (request === meshRequest.current) setMeshLoading(false); }
  }, []);

  useEffect(() => {
    void loadMesh();
    return invalidateMesh;
  }, [loadMesh, invalidateMesh]);

  const stopSpeech = useCallback(() => {
    speakingGeneration.current++;
    if (nativeSpeech.current) {
      nativeSpeech.current = false;
      void window.intercom?.stopVoiceSpeech().catch((reason: unknown) => setError(`Speech could not be stopped: ${String(reason)}`));
    }
    window.speechSynthesis?.cancel();
    utterance.current = null;
    setSpeaking(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (window.intercom) {
      stopSpeech();
      const generation = speakingGeneration.current;
      nativeSpeech.current = true;
      setSpeaking(true);
      void window.intercom.speakVoice(text).catch((reason: unknown) => {
        if (generation === speakingGeneration.current) setError(`Local speech failed: ${String(reason)}. The written result remains available.`);
      }).finally(() => {
        if (generation === speakingGeneration.current) { nativeSpeech.current = false; setSpeaking(false); }
      });
      return;
    }
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
    if (action === 'toggle-floating' && recordingRef.current) {
      setError('Stop or cancel recording before hiding the microphone controls in Floating Mesh.');
      return;
    }
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
      speak(`Demo only. The simulated ${fixtureContexts.find((context) => context.id === job.contextId)?.name} session has finished. No real work was performed.`);
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
    const matches = resolveTarget(text, fixtureContexts);
    if (matches.length === 1) {
      setProposal(matches[0]);
      setSelectedId(matches[0].id);
      setCandidates(null);
    } else {
      setCandidates(matches.length ? matches : fixtureContexts);
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
  const selected = contexts.find((context) => context.id === selectedId) ?? contexts.find((context) => context.name.toLowerCase() === 'intercom') ?? contexts[0];
  const actualSelected = actualContexts.find((context) => context.id === selectedId) ?? actualContexts.find((context) => context.name.toLowerCase() === 'intercom') ?? actualContexts[0];
  const workActive = !!realJob && ['starting', 'running', 'awaiting-approval'].includes(realJob.phase);
  const observedSlots = useMemo(() => workActive ? actualContexts.filter((context) => realJob?.observedContextIds.includes(context.id)).map((context) => context.slot) : [], [workActive, actualContexts, realJob]);
  function workFromVoice(text: string, mode: WorkMode) {
    const matches = resolveTarget(text, actualContexts);
    setRouteChoices(matches.length > 1 ? matches : null);
    if (matches.length === 1) setSelectedId(matches[0].id);
    setWorkProposal({ id: crypto.randomUUID(), text, mode });
  }

  return <main className={`app${desktop.floating ? ' floating' : ''}${desktop.maximized ? ' maximized' : ''}`} data-floating={desktop.floating} data-maximized={desktop.maximized}>
    <header className="titlebar chrome">
      <a className="brand" href="#" onClick={(event) => event.preventDefault()}><img className="brand-logo" src="./intercom-icon.png" alt="Intercom logo" width="48" height="48" /><span>intercom<span className="brand-dot">.</span></span></a>
      <div className="titlebar-center">YOUR CONTEXT, CONNECTED</div>
      <div className="window-actions">
        <button aria-label="Minimize" disabled={!desktopAvailable} onClick={() => void windowAction('minimize')}><Icon name="minus" /></button>
        <button aria-label={desktop.maximized ? 'Restore window' : 'Maximize window'} title={desktop.maximized ? 'Restore window' : 'Maximize window'} disabled={!desktopAvailable} onClick={() => void windowAction('toggle-maximize')}><Icon name={desktop.maximized ? 'restore' : 'maximize'} /></button>
        <button aria-label="Close Intercom" disabled={!desktopAvailable} onClick={() => void windowAction('close')}><Icon name="close" /></button>
      </div>
    </header>

    <aside className="sidebar chrome">
      <div className="eyebrow">WORKSPACE</div>
      <h1>A little less switching.<br /><span>A little more flow.</span></h1>
      <p className="muted intro">One conversation.<br />All your contexts, in reach.</p>
      <label className="context-search">Find context<input aria-label="Find context" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
      <div className="context-list" aria-label={demo ? 'Synthetic demo contexts' : 'Actual Context Mesh contexts'}>
        <div className="list-heading"><span>CONTEXTS</span><span>{contexts.length.toString().padStart(2, '0')}</span></div>
        {contexts.filter((context) => context.name.toLowerCase().includes(search.toLowerCase())).map((context) => <button key={context.id} title={context.basePath ?? context.name} className={`context-row ${context.id === selected?.id ? 'selected' : ''}`} onClick={() => setSelectedId(context.id)} aria-pressed={context.id === selected?.id}>
          <span className="context-mark" style={{ '--context-color': context.color } as React.CSSProperties}>{context.name.slice(0, 1)}</span>
          <span><strong>{context.name}</strong><small>{context.subtitle}</small></span><span className="context-indicator" />
        </button>)}
      </div>
      <div className="sidebar-note"><span className="status-dot" />{demo ? 'Explicit fixture demo' : 'Local mesh snapshot'}<br /><small>Topology is not live read telemetry.</small>
        {!demo && snapshotAge > 86400000 && <small role="status">Snapshot is over 24 hours old. Fresh disk reads do not regenerate its source.</small>}
        {!demo && snapshotAge < -300000 && <small role="status">Snapshot generation time is in the future. Check the source timestamp or system clock.</small>}
        {!demo && snapshot && <details><summary>Snapshot provenance</summary><small>Generated: {snapshot.generatedAt}<br />Loaded: {snapshot.loadedAt}<br />{snapshot.source}</small></details>}
        {!demo && <button className="quiet-button" disabled={meshLoading || recording} onClick={() => void loadMesh()}>Reload local mesh</button>}
      </div>
    </aside>

    <section className="center" aria-label="Context mesh">
      <div className="mesh-heading chrome"><div><div className="eyebrow">CONTEXT MESH</div><h2>Everything has a connection.</h2></div><span className="fixture-badge">{demo ? 'FIXTURE DATA' : meshLoading ? 'LOADING LOCAL MESH' : snapshot ? 'ACTUAL LOCAL MESH' : 'MESH UNAVAILABLE'}</span></div>
      <Suspense fallback={<p className="mesh-loading" role="status">Loading the mesh renderer...</p>}>
        <Mesh key={demo ? 'fixture' : snapshot?.loadedAt ?? 'empty'} graph={graph} activeSlots={demo ? slots : observedSlots} selectedId={selected?.id ?? ''} profile={busy && job ? job.profile : profile} motion={motion} paused={desktop.paused} />
      </Suspense>
      {!demo && meshError && <p className="mesh-error" role="alert">{meshError}</p>}
      {!demo && meshLoading && <p className="mesh-loading" role="status">Reading the current local snapshot...</p>}
      {!demo && snapshot && contexts.length === 0 && <p className="mesh-loading" role="status">The real snapshot has no registered contexts.</p>}
      <div className="mesh-caption chrome"><span className="selected-context" style={{ color: selected?.color }}>{selected?.name ?? 'No context loaded'}</span><span>Drag to orbit / Right-drag to pan / Scroll to zoom</span></div>
      <div className="mesh-toolbar chrome">
        <span className="legend"><i />{demo ? 'Demo path' : 'Observed job / tool locations'} <i className="dim" />Topology</span>
        <button className="quiet-button" aria-pressed={motion} onClick={() => setMotion(!motion)}>{motion ? 'Pause drift' : 'Enable drift'}</button>
        <button className="quiet-button float-button" disabled={!desktopAvailable || recording} onClick={() => void windowAction('toggle-floating')}><Icon name="float" />Floating mesh</button>
      </div>
      <div className="floating-handle" aria-label="Move floating mesh" title="Grab this handle and drag to move the floating window. Drag the graph itself to orbit.">
        <Icon name="move" /><span>Drag to move</span>
      </div>
      <div className="floating-tools">
        <img className="brand-logo" src="./intercom-icon.png" alt="Intercom logo" width="20" height="20" />
        <span className="floating-demo">{demo ? 'DEMO' : snapshot ? `${contexts.length} CONTEXTS` : 'NO DATA'}</span>
        <button title="Restore workspace (Escape)" aria-label="Restore workspace" onClick={() => void windowAction('toggle-floating')}><Icon name="restore" /></button>
        <button title="Always on top" aria-label="Always on top" aria-pressed={desktop.onTop} onClick={() => void windowAction('toggle-top')}><Icon name="pin" /></button>
        <button title="Close" aria-label="Close floating mesh" onClick={() => void windowAction('close')}><Icon name="close" /></button>
        <div className="floating-size" role="group" aria-label="Floating window size controls">
          <button aria-label="Make floating window smaller" title="Make the floating window smaller (graph zoom stays unchanged)" disabled={!desktop.floatingSize || desktop.floatingSize.side <= desktop.floatingSize.min} onClick={() => void windowAction('shrink-floating')}><Icon name="minus" />Smaller</button>
          <span className="floating-size-value"><span>WINDOW SIZE</span><output aria-label="Floating window size">{desktop.floatingSize?.side ?? 0}px</output></span>
          <button aria-label="Make floating window larger" title="Make the floating window larger (graph zoom stays unchanged)" disabled={!desktop.floatingSize || desktop.floatingSize.side >= desktop.floatingSize.max} onClick={() => void windowAction('grow-floating')}><Icon name="plus" />Larger</button>
        </div>
      </div>
    </section>

    <aside className="activity chrome">
      <div className="eyebrow">THE CONVERSATION</div>
      <button className="quiet-button" onClick={() => { stopSpeech(); setJob(null); setProposal(null); setCandidates(null); setVoiceEnabled(false); setDemo(!demo); }}>{demo ? 'Use live voice' : 'Show fixture demo'}</button>
      {!demo ? <VoiceConversation onRecordingChange={onRecordingChange} onWorkRequest={workFromVoice} /> : <>
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
      <label className="voice-toggle"><input type="checkbox" checked={voiceEnabled} onChange={(event) => { setVoiceEnabled(event.target.checked); if (!event.target.checked) stopSpeech(); }} />Read demo results using a local system voice</label>
      <button className="quiet-button" disabled={!speaking} onClick={stopSpeech}>Stop speech <span className="muted">(does not cancel work)</span></button>
      </>}
      {routeChoices && !demo && <div role="region" aria-label="Choose voice task context"><p>Multiple contexts were mentioned. Choose the target before preparing work.</p>{routeChoices.map((context) =>
        <button className="quiet-button" key={context.id} onClick={() => { setSelectedId(context.id); setRouteChoices(null); }}>{context.name}</button>)}</div>}
      <WorkPanel contexts={actualContexts} contextId={routeChoices ? '' : actualSelected?.id ?? ''} profile={profile} voiceProposal={workProposal}
        onSelect={(id) => { setSelectedId(id); setRouteChoices(null); }} onJob={setRealJob} recording={recording} hidden={demo} />
      <details className="prototype-coverage"><summary>Prototype coverage</summary>
        <p>Push-to-talk and mic selection; local English transcription and spoken replies; real mesh on every launch; explicit context/session routing; confirmed background work or terminal handoff; manual tool prompts; event-driven receipts and desktop notifications; floating mesh; selectable speed-first priorities; application branding.</p>
        <p>No wake word (push-to-talk chosen), simultaneous multi-job execution, unattended approvals, or inferred live retrieval paths. Bright spokes mean observed job output or tool-reported locations, not traversal of topology links. A returned answer is not independent task verification.</p>
      </details>
      <div className="profile-section"><label htmlFor="profile">Processing priority</label><select id="profile" value={profile} onChange={(event) => { if (isProfile(event.target.value)) setProfile(event.target.value); }}>
        {profiles.map((item) => <option key={item}>{item}</option>)}
      </select><small>Controls rendering and supported background reasoning effort (low / medium / high). Copilot retains its model; unsupported effort controls stay inherited. Speech uses the installed local English recognizer.</small></div>
    </aside>

    <footer className="composer chrome">
      {!demo ? <><div className="composer-icon"><Icon name="mic" /></div><div><div className="eyebrow">PUSH TO TALK. A REAL RESPONSE.</div><p className="muted">Connect your dedicated session on the right, choose your mic, then click Speak. Click again to stop and send.</p></div></> : <>
      <div className="composer-icon"><Icon name="mic" /></div>
      <form onSubmit={(event) => { event.preventDefault(); prepare(); }}>
        <label htmlFor="request">A VOICE WORKSPACE, IN PREVIEW</label>
        <div className="input-row"><input id="request" maxLength={1000} value={request} disabled={busy} onChange={(event) => { setRequest(event.target.value); setProposal(null); setCandidates(null); }} placeholder="Try: In Workshop, outline the next release." /><button className="send-button" type="submit" disabled={busy || !request.trim()} aria-label="Prepare demo request"><Icon name="arrow" /></button></div>
      </form>
      <button className="sample-button" disabled={busy} onClick={() => { const sample = 'In Atlas, summarize the research plan.'; setRequest(sample); prepare(sample); }}>Simulate voice request</button>
      </>}
    </footer>

    {(proposal || candidates) && <div className="confirmation chrome" role="region" aria-label="Demo request confirmation">
      {proposal ? <><div><span className="message-label">CONFIRM DEMO TARGET</span><p><strong>{proposal.name}</strong> / synthetic session only</p><small>No terminal, agent, or microphone will be started.</small></div><button className="primary-button" onClick={confirm}>Run simulation</button></> :
        <div><span className="message-label">WHICH DEMO CONTEXT?</span><p>The target is missing or ambiguous. Choose explicitly.</p><div className="candidate-list">{candidates!.map((context) => <button key={context.id} className="quiet-button" onClick={() => { setProposal(context); setSelectedId(context.id); setCandidates(null); }}>{context.name}</button>)}</div></div>}
      <button className="quiet-button" onClick={() => { setProposal(null); setCandidates(null); }}>Dismiss</button>
    </div>}
    {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')} aria-label="Dismiss error">x</button></div>}
  </main>;
}
