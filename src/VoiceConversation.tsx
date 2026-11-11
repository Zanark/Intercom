import { useEffect, useRef, useState } from 'react';
import { Recording } from './recording';
import { MicrophonePicker } from './MicrophonePicker';
import { VoiceProfiles } from './VoiceProfiles';

type Phase = 'idle' | 'connecting' | 'opening' | 'listening' | 'transcribing' | 'checking' | 'running';
const labels: Record<Phase, string> = {
  idle: 'Ready to talk', connecting: 'Checking the existing session...',
  opening: 'Opening your selected microphone...', listening: 'Listening - click Stop & send when finished',
  transcribing: 'Transcribing locally...', checking: 'Checking session ownership...', running: 'Copilot is responding...',
};

export function VoiceConversation({ onRecordingChange, onWorkRequest }: {
  onRecordingChange: (recording: boolean) => void;
  onWorkRequest: (text: string, mode: WorkMode) => void;
}) {
  const [sessionId, setSessionId] = useState('');
  const [connected, setConnected] = useState(false);
  const [device, setDevice] = useState('default');
  const [checkingMic, setCheckingMic] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [level, setLevel] = useState(0);
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [voice, setVoice] = useState(true);
  const [autoSend, setAutoSend] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [delivery, setDelivery] = useState<'chat' | WorkMode>('chat');
  const active = useRef<string | null>(null);
  const recorder = useRef<Recording | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const speechEpoch = useRef(0);
  const busy = phase !== 'idle';
  const recording = phase === 'opening' || phase === 'listening';
  const canSend = delivery !== 'chat' || connected;
  const stopLabel = autoSend && canSend ? 'Stop & send' : 'Stop & transcribe';

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
      .catch((reason: unknown) => { if (mounted.current) setError(report(reason)); });
    const remove = window.intercom?.onVoiceProgress((event) => {
      if (event.phase === 'error') { setError(event.message); return; }
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
  }, []);

  async function configure() {
    if (active.current || !window.intercom) return;
    const id = crypto.randomUUID();
    active.current = id;
    setPhase('connecting'); setError(''); setConnected(false);
    try {
      await window.intercom.configureVoiceSession(id, sessionId.trim());
      if (active.current === id) setConnected(true);
    } catch (reason) { if (active.current === id) setError(report(reason)); }
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
      if (autoSend && canSend) await send(result.text, id);
    } catch (reason) { if (active.current === id) setError(report(reason)); }
    finally { if (active.current === id) { active.current = null; setPhase('idle'); } }
  }

  async function startRecording() {
    if (active.current || checkingMic || !window.intercom) return;
    const id = crypto.randomUUID();
    active.current = id; setPhase('opening'); setError(''); setWarning(''); setAnswer(''); setText('');
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
        recorder.current = null; active.current = null; setPhase('idle'); setError(`Microphone failed: ${report(reason)}`);
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
    recorder.current = null; setLevel(0); setPhase('idle'); setError(message);
  }

  return <section className="live-conversation" aria-label="Live voice conversation">
    <div className="message-label">LOCAL SPEECH / EXISTING COPILOT SESSION</div>
    <label htmlFor="voice-delivery">Voice request destination</label>
    <select id="voice-delivery" value={delivery} disabled={busy} onChange={(event) => {
      const value = event.target.value;
      if (value === 'chat' || value === 'background' || value === 'terminal') setDelivery(value);
    }}><option value="chat">Conversation / no work tools</option><option value="background">Background task / confirm below</option><option value="terminal">New terminal task / confirm below</option></select>
    {!window.intercom && <p role="alert">Live voice requires the Windows desktop app, not the browser preview.</p>}
    <details open={!connected}>
      <summary>{connected ? 'Session connected - settings' : 'Connect your dedicated session'}</summary>
      <label htmlFor="voice-session">Existing session ID</label>
      <input id="voice-session" value={sessionId} disabled={busy} onChange={(event) => { setSessionId(event.target.value); setConnected(false); }} placeholder="Paste full session UUID" spellCheck={false} />
      <button className="quiet-button" disabled={busy || !sessionId.trim() || !window.intercom} onClick={() => void configure()}>Connect existing session</button>
      <small>Close that session&apos;s terminal first. No new session or competing writer will be created.</small>
    </details>
    <MicrophonePicker onSelect={setDevice} locked={busy} onCheckingChange={setCheckingMic} />
    <div className="live-controls">
      <button className="primary-button record-button" disabled={!window.intercom || checkingMic || (busy && phase !== 'listening')} aria-pressed={phase === 'listening'} aria-describedby="voice-recording-help"
        onClick={() => { if (phase === 'listening' && active.current) void finishRecording(active.current); else void startRecording(); }}>
        {phase === 'listening' ? stopLabel : 'Speak'}
      </button>
      {busy && <button className="quiet-button" onClick={() => void cancel()}>Cancel request</button>}
      <p role="status">{checkingMic ? 'Checking microphone access...' : phase === 'listening' ? `Listening - click ${stopLabel} when finished` : labels[phase]}</p>
      <meter aria-label="Microphone input level" min="0" max="0.15" value={level} />
      <small id="voice-recording-help">{phase === 'opening' ? 'Microphone starting; input may be active.' : phase === 'listening' ? 'Microphone ON. Audio stays in memory; maximum 60 seconds.' : `Microphone off. Click Speak, talk, then click ${stopLabel}.`}</small>
      {!canSend && <small>Recording and local transcription work without Copilot. To send your transcript, connect an existing session above, then click Send text to Copilot. Connecting alone does not send it.</small>}
    </div>
    <label className="voice-toggle"><input type="checkbox" checked={autoSend} disabled={busy} onChange={(event) => setAutoSend(event.target.checked)} />Send recognized text automatically after stopping</label>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (active.current || (delivery === 'chat' && !connected) || !text.trim()) return;
      const id = crypto.randomUUID(); active.current = id; setError(''); setWarning(''); setAnswer('');
      void send(text.trim(), id).catch((reason: unknown) => { if (active.current === id) setError(report(reason)); })
        .finally(() => { if (active.current === id) { active.current = null; setPhase('idle'); } });
    }}>
      <label htmlFor="voice-transcript">Transcript / typed fallback</label>
      <textarea id="voice-transcript" maxLength={1000} value={text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder="Try: Say hello world." />
      <button className="quiet-button" disabled={busy || (delivery === 'chat' && !connected) || !text.trim()} type="submit">{delivery === 'chat' ? 'Send text to Copilot' : 'Prepare work from text'}</button>
    </form>
    <label className="voice-toggle"><input type="checkbox" checked={voice} onChange={(event) => { setVoice(event.target.checked); if (!event.target.checked) void stopSpeech().catch((reason: unknown) => setWarning(report(reason))); }} />Speak progress and responses (local Windows voice)</label>
    <button className="quiet-button" disabled={!speaking} onClick={() => void stopSpeech().catch((reason: unknown) => setWarning(report(reason)))}>Stop voice playback</button>
    <VoiceProfiles locked={busy || checkingMic} onStop={stopSpeech} onPreview={async (value, profile) => {
      if (!window.intercom) throw new Error('Voice preview requires the desktop app.');
      const epoch = ++speechEpoch.current;
      setSpeaking(true);
      try { await window.intercom.previewVoice(value, profile); return true; }
      catch (reason) { if (epoch === speechEpoch.current) throw reason; return false; }
      finally { if (mounted.current && epoch === speechEpoch.current) setSpeaking(false); }
    }} />
    {error && <p className="voice-error" role="alert">{error}</p>}
    {warning && <p className="voice-error" role="alert">{warning}</p>}
    {answer && <div className="live-result" aria-live="polite"><div className="message-label">COPILOT RESPONSE / VERIFIED SESSION COMPLETION</div><p>{answer}</p></div>}
    <small>English (US), push-to-talk. Conversation mode has no file/work tools; work modes require a separate target/task confirmation and retain Copilot permission prompts. No wake word. Audio stays local; task text uses your existing Copilot account/history.</small>
  </section>;
}
