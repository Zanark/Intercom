import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { Recording } from '../voice/recording';
import { MicrophonePicker } from './MicrophonePicker';
import { VoiceProfiles } from './VoiceProfiles';
import { VoiceWaves } from './VoiceWaves';
import { GlassBubble } from './GlassBubble';
import { MicRipples } from './MicRipples';
import type { SettingsTab } from './SettingsTabs';

type Phase = 'idle' | 'connecting' | 'opening' | 'listening' | 'transcribing' | 'checking' | 'running';
const labels: Record<Phase, string> = {
  idle: 'Ready to talk', connecting: 'Checking the existing session...',
  opening: 'Opening your selected microphone...', listening: 'Listening - click Stop & send when finished',
  transcribing: 'Transcribing locally...', checking: 'Checking session ownership...', running: 'Copilot is responding...',
};

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

export function VoiceConversation({ onRecordingChange, onWorkRequest, floating, paused, controlsHost, tab, advancedGeneral, onOpenTab, panelOpen, setPanelOpen }: {
  onRecordingChange: (recording: boolean) => void;
  onWorkRequest: (text: string, mode: WorkMode) => void;
  floating: boolean;
  paused: boolean;
  controlsHost: HTMLElement | null;
  tab: SettingsTab;
  advancedGeneral: boolean;
  onOpenTab: (tab: SettingsTab) => void;
  panelOpen: boolean;
  setPanelOpen: (open: boolean) => void;
}) {
  const [sessionId, setSessionId] = useState('');
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState('default');
  const [checkingMic, setCheckingMic] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [level, setLevel] = useState(0);
  const documentHidden = useSyncExternalStore(subscribeToVisibility, () => document.hidden);
  const glassSurface = useRef<HTMLSpanElement>(null);
  const microphoneFill = useId();
  const microphoneMaterial = useId();
  const inputLevel = Math.min(1, Math.max(0, level / 0.15));
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [voice, setVoice] = useState(true);
  const [autoSend, setAutoSend] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [delivery, setDelivery] = useState<'chat' | WorkMode>('chat');
  const panel = useRef<HTMLElement>(null);
  const active = useRef<string | null>(null);
  const recorder = useRef<Recording | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const speechEpoch = useRef(0);
  const busy = phase !== 'idle';
  const recording = phase === 'opening' || phase === 'listening';
  const canSend = delivery !== 'chat' || connected;
  const stopLabel = autoSend && canSend ? 'Stop & send' : 'Stop & transcribe';
  const openFeedback = useCallback(() => { setPanelOpen(true); onOpenTab('Talk'); }, [onOpenTab, setPanelOpen]);

  useEffect(() => {
    if (panelOpen) panel.current?.scrollTo({ top: 0 });
  }, [panelOpen, error, warning, answer]);

  useEffect(() => {
    function dismiss(event: KeyboardEvent) {
      if (event.key === 'Escape' && floating && panelOpen) {
        event.preventDefault();
        setPanelOpen(false);
      }
    }
    window.addEventListener('keydown', dismiss, true);
    return () => window.removeEventListener('keydown', dismiss, true);
  }, [floating, panelOpen, setPanelOpen]);

  useEffect(() => {
    onRecordingChange(recording);
    return () => onRecordingChange(false);
  }, [onRecordingChange, recording]);

  const report = (reason: unknown) => reason instanceof Error ? reason.message : String(reason);
  function clearTimer() { if (timer.current) clearTimeout(timer.current); timer.current = null; }
  async function stopSpeech() {
    speechEpoch.current++;
    await window.intercom?.stopVoiceSpeech();
    if (mounted.current) setSpeaking(false);
  }
  async function say(value: string) {
    if (!voice || !window.intercom) return;
    const epoch = ++speechEpoch.current;
    setSpeaking(true);
    try { await window.intercom.speakVoice(value); }
    catch (reason) { if (mounted.current && epoch === speechEpoch.current) setWarning(`Speech output failed: ${report(reason)} The written response remains available.`); }
    finally { if (mounted.current && epoch === speechEpoch.current) setSpeaking(false); }
  }

  useEffect(() => {
    mounted.current = true;
    void window.intercom?.voiceSettings().then((settings) => { if (mounted.current) setSessionId(settings.sessionId); })
      .catch((reason: unknown) => { if (mounted.current) { setError(report(reason)); openFeedback(); } });
    const remove = window.intercom?.onVoiceProgress((event) => {
      if (event.phase === 'error') { setError(event.message); openFeedback(); return; }
      if (active.current === event.requestId && (event.phase === 'checking' || event.phase === 'running')) setPhase(event.phase);
    });
    return () => {
      mounted.current = false;
      clearTimer();
      const id = active.current;
      active.current = null;
      void recorder.current?.cancel().catch(console.error);
      if (id) void window.intercom?.cancelVoice(id).catch(console.error);
      void window.intercom?.stopVoiceSpeech().catch(console.error);
      remove?.();
    };
  }, [openFeedback]);

  async function configure() {
    if (active.current || !window.intercom) return;
    const id = crypto.randomUUID();
    active.current = id;
    setPhase('connecting'); setError(''); setConnected(false);
    try {
      await window.intercom.configureVoiceSession(id, sessionId.trim());
      if (active.current === id) setConnected(true);
    } catch (reason) { if (active.current === id) { setError(report(reason)); openFeedback(); } }
    finally { if (active.current === id) { active.current = null; setPhase('idle'); } }
  }

  async function send(value: string, id: string) {
    if (!window.intercom || active.current !== id) return;
    if (delivery !== 'chat') {
      onWorkRequest(value, delivery);
      void say('Review the context, existing session, and task below. Nothing runs until you confirm.');
      return;
    }
    if (!connected) throw new Error('Connect an existing session before sending. Your transcript is still available; nothing was sent.');
    setPhase('checking');
    void say('I am sending your request to Copilot.');
    const result = await window.intercom.sendVoicePrompt(id, value);
    if (active.current !== id) return;
    setAnswer(result.text);
    openFeedback();
    if (result.warning) setWarning(result.warning);
    await stopSpeech();
    if (active.current === id) void say(result.text.length > 4000 ? `${result.text.slice(0, 4000)}. The remaining response is on screen.` : result.text);
  }

  async function finishRecording(id: string) {
    if (active.current !== id || !recorder.current) return;
    const recording = recorder.current;
    clearTimer(); setPhase('transcribing'); setLevel(0);
    try {
      const wave = await recording.stop();
      if (recorder.current === recording) recorder.current = null;
      if (active.current !== id) return;
      const result = await window.intercom!.transcribeVoice(id, wave);
      if (active.current !== id) return;
      setText(result.text);
      openFeedback();
      if (result.reviewRequired) setWarning(result.text.length > 1000
        ? `Recognized ${result.text.length} characters. The request limit is 1,000; shorten the transcript below before sending. Nothing was sent.`
        : 'Windows English (US) recognition has low confidence. Your transcript is preserved below; review or edit it, then send explicitly. Nothing was sent.');
      if (autoSend && canSend && !result.reviewRequired) await send(result.text, id);
    } catch (reason) { if (active.current === id) { setError(report(reason)); openFeedback(); } }
    finally { if (active.current === id) { active.current = null; setPhase('idle'); } }
  }

  async function startRecording() {
    if (active.current || checkingMic || !window.intercom) return;
    const id = crypto.randomUUID();
    active.current = id; setPhase('opening'); setError(''); setWarning(''); setAnswer(''); setText(''); setPanelOpen(false);
    try {
      await stopSpeech();
      if (active.current !== id) return;
      const recording = new Recording(setLevel, () => {
        if (active.current === id) void cancel('The microphone disconnected or the one-minute recording limit was reached. Nothing was sent.');
      });
      recorder.current = recording;
      await recording.start(device);
      if (active.current !== id) return;
      setPhase('listening');
      timer.current = setTimeout(() => { void finishRecording(id); }, 59000);
    } catch (reason) {
      if (active.current === id) {
        await recorder.current?.cancel();
        recorder.current = null; active.current = null; setPhase('idle'); setError(`Microphone failed: ${report(reason)}`); openFeedback();
      }
    }
  }

  async function cancel(message = 'Cancelled. If already dispatched, inspect Copilot history before retrying.') {
    const id = active.current;
    if (!id) return;
    active.current = null;
    clearTimer();
    try { await Promise.all([recorder.current?.cancel(), window.intercom?.cancelVoice(id), stopSpeech()]); }
    catch (reason) { message = `Cancellation could not be confirmed: ${report(reason)}`; }
    recorder.current = null; setLevel(0); setPhase('idle'); setError(message); openFeedback();
  }

  return <><section ref={panel} className="live-conversation" aria-label="Live voice conversation" data-panel-open={panelOpen} hidden={!floating && (tab === 'Work' || (tab === 'Advanced' && !advancedGeneral))}>
    <div hidden={!floating && tab !== 'Talk'} className="conversation-tab">
    {floating && <button className="quiet-button voice-panel-close" onClick={() => setPanelOpen(false)}>Hide voice settings</button>}
    <div className="conversation-status" role="status">{checkingMic ? 'Checking microphone...' : phase === 'idle' ? connected ? 'Session connected. Ready when you are.' : 'Ready to listen. Connect a session to send.' : labels[phase]}</div>
    {error && <p className="voice-error" role="alert">{error}</p>}
    {warning && <p className="voice-error" role="alert">{warning}</p>}
    {answer && <div className="live-result" aria-live="polite"><div className="message-label">COPILOT RESPONSE / VERIFIED SESSION COMPLETION</div><p>{answer}</p></div>}
    <form onSubmit={(event) => {
      event.preventDefault();
      if (active.current || (delivery === 'chat' && !connected) || !text.trim()) return;
      if (text.trim().length > 1000) { setError('Shorten the transcript to 1,000 characters or fewer before sending. Nothing was sent.'); return; }
      const id = crypto.randomUUID(); active.current = id; setError(''); setWarning(''); setAnswer('');
      void send(text.trim(), id).catch((reason: unknown) => { if (active.current === id) { setError(report(reason)); openFeedback(); } })
        .finally(() => { if (active.current === id) { active.current = null; setPhase('idle'); } });
    }}>
      <label htmlFor="voice-transcript">Transcript / typed fallback</label>
      <textarea id="voice-transcript" maxLength={1000} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder="Try: Say hello world." />
      <button className="quiet-button" disabled={busy || (delivery === 'chat' && !connected) || !text.trim() || text.trim().length > 1000} type="submit">{delivery === 'chat' ? 'Send text to Copilot' : 'Prepare work from text'}</button>
    </form>
    {!connected && <button className="quiet-button" onClick={() => { onOpenTab('Session'); if (floating) void window.intercom?.windowAction('toggle-floating').catch((reason: unknown) => setError(report(reason))); }}>Connect a session</button>}
    {recording && <button className="quiet-button" aria-label="Cancel recording" onClick={() => void cancel()}>Cancel recording</button>}
    <button className="quiet-button" disabled={!speaking} onClick={() => void stopSpeech().catch((reason: unknown) => setWarning(report(reason)))}>Stop voice playback</button>
    <small>Local English speech. Recording does not require a session.</small>
    </div>
    <div hidden={floating || tab !== 'Input'} className="voice-setup">
    <h3>Your microphone</h3>
    <MicrophonePicker onSelect={setDevice} locked={busy} onCheckingChange={setCheckingMic} />
    <small id="voice-recording-help">{phase === 'opening' ? 'Microphone starting; input may be active.' : phase === 'listening' ? 'Microphone ON. Audio stays in memory; maximum 60 seconds.' : `Microphone off. Click Speak, talk, then click ${stopLabel}.`}</small>
    <small>English (US), push-to-talk. Nothing listens until you click the microphone.</small>
    </div>
    <div hidden={floating || tab !== 'Session'} className="voice-session">
    <h3>Your existing session</h3>
    <label htmlFor="voice-delivery">Voice request destination</label>
    <select id="voice-delivery" value={delivery} disabled={busy} onChange={(event) => {
      const value = event.target.value;
      if (value === 'chat' || value === 'background' || value === 'terminal') setDelivery(value);
    }}><option value="chat">Conversation / no work tools</option><option value="background">Background task / confirm below</option><option value="terminal">New terminal task / confirm below</option></select>
    {!window.intercom && <p role="alert">Live voice requires the Windows desktop app, not the browser preview.</p>}
      <p className="connection-state" role="status">{connected ? 'Session connected - settings' : 'Connect your dedicated session'}</p>
      <label htmlFor="voice-session">Existing session ID</label>
      <input id="voice-session" value={sessionId} disabled={busy} onChange={(event) => { setSessionId(event.target.value); setConnected(false); }} placeholder="Paste full session UUID" spellCheck={false} />
      <button className="quiet-button" disabled={busy || !sessionId.trim() || !window.intercom} onClick={() => void configure()}>Connect existing session</button>
      <small>Close that session&apos;s terminal first. No new session or competing writer will be created.</small>
    {!canSend && <small>Connecting never sends your transcript. Use Send text to Copilot explicitly.</small>}
    <small>Conversation has no work tools. Work requires target/task confirmation and retains permissions.</small>
    </div>
    <div hidden={floating || tab !== 'Voice'} className="voice-playback">
    <h3>Your speaking voice</h3>
    <label className="voice-toggle"><input type="checkbox" checked={voice} onChange={(event) => { setVoice(event.target.checked); if (!event.target.checked) void stopSpeech().catch((reason: unknown) => setWarning(report(reason))); }} />Speak progress and responses (local Windows voice)</label>
    <VoiceProfiles visible={!floating && tab === 'Voice'} locked={busy || checkingMic} onStop={stopSpeech} onPreview={async (value, profile) => {
      if (!window.intercom) throw new Error('Voice preview requires the desktop app.');
      const epoch = ++speechEpoch.current;
      setSpeaking(true);
      try { await window.intercom.previewVoice(value, profile); return true; }
      catch (reason) { if (epoch === speechEpoch.current) throw reason; return false; }
      finally { if (mounted.current && epoch === speechEpoch.current) setSpeaking(false); }
    }} />
    </div>
    <div hidden={floating || tab !== 'Advanced' || !advancedGeneral}>
      <h3>Delivery behavior</h3>
      <label className="voice-toggle"><input type="checkbox" checked={autoSend} disabled={busy} onChange={(event) => setAutoSend(event.target.checked)} />Send recognized text automatically after stopping</label>
      <small>Only clear, in-limit speech. Uncertain speech always waits for review. Work still requires a separate target and task confirmation.</small>
    </div>
  </section>{controlsHost && createPortal(<div className="live-controls" data-paused={paused || documentHidden} role="group" aria-label="Always available microphone">
      <VoiceWaves active={phase === 'listening'} level={level} paused={paused} />
      <div className="voice-status sr-only">
        <p role="status">{checkingMic ? 'Checking microphone...' : phase === 'idle' ? 'Click Speak to talk' : labels[phase]}</p>
        {phase === 'listening' && <meter aria-label="Microphone input level" min="0" max="0.15" value={level} />}
      </div>
      <button className="primary-button record-button" disabled={!window.intercom || checkingMic} aria-pressed={phase === 'listening'} aria-busy={busy && !recording} aria-describedby="voice-recording-help"
        style={{ '--input-level': inputLevel } as React.CSSProperties}
        aria-label={phase === 'listening' ? stopLabel : busy ? 'Cancel request' : 'Speak'}
        title={phase === 'listening' ? stopLabel : busy ? 'Cancel request' : 'Speak'}
        onClick={() => { if (phase === 'listening' && active.current) void finishRecording(active.current); else if (busy) void cancel(); else void startRecording(); }}>
        <span className="mic-shell" aria-hidden="true">
        <span className="mic-optics">
          <span className="mic-water-surface" ref={glassSurface}>
          <GlassBubble paused={paused || documentHidden} />
          <span className="mic-input-glow" />
          </span>
          <MicRipples active={phase === 'listening'} level={inputLevel} paused={paused || documentHidden} target={glassSurface} />
        </span>
        <svg viewBox="0 0 24 24" fill="none" stroke={`url(#${microphoneMaterial})`} strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
          <defs>
            <clipPath id={microphoneFill}><rect x="9" y="3" width="6" height="12" rx="3" /></clipPath>
            <linearGradient id={microphoneMaterial} x1="5" y1="3" x2="19" y2="22" gradientUnits="userSpaceOnUse">
              <stop stopColor="#f4eaff" /><stop offset=".48" stopColor="#d2c0ff" /><stop offset="1" stopColor="#a1ffe0" />
            </linearGradient>
          </defs>
          {phase === 'listening' && <rect className="mic-level" clipPath={`url(#${microphoneFill})`} x="9" y={15 - inputLevel * 12} width="6" height={inputLevel * 12} fill="currentColor" stroke="none" />}
          <rect x="9" y="3" width="6" height="12" rx="3" /><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8" />
        </svg>
        {busy && !recording && <span className="mic-busy" aria-hidden="true" />}
        </span>
      </button>
    </div>, controlsHost)}</>;
}
