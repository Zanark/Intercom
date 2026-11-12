import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { MAX_RECORDING_SECONDS, Recording } from '../voice/recording';
import { MicrophonePicker } from './MicrophonePicker';
import { VoiceProfiles } from './VoiceProfiles';
import { VoiceWaves } from './VoiceWaves';
import { GlassBubble } from './GlassBubble';
import { MicRipples } from './MicRipples';
import { SettingsTabs, type SettingsTab } from './SettingsTabs';
import { ResearchSynthesis } from './ResearchSynthesis';
import type { Profile } from '../domain/model';

type Phase = 'idle' | 'connecting' | 'setup' | 'opening' | 'listening' | 'transcribing' | 'checking' | 'running';
const labels: Record<Phase, string> = {
  idle: 'Ready to talk', connecting: 'Checking the existing session...', setup: 'Checking local speech engine...',
  opening: 'Opening your selected microphone...', listening: 'Listening - click the microphone again when finished',
  transcribing: 'Transcribing locally...', checking: 'Resolving your request...', running: 'Copilot is responding...',
};

function subscribeToVisibility(onChange: () => void) {
  document.addEventListener('visibilitychange', onChange);
  return () => document.removeEventListener('visibilitychange', onChange);
}

export function VoiceConversation({ onRecordingChange, onPhaseChange, onWorkRequest, floating, paused, controlsHost, tab, advancedGeneral, onOpenTab, panelOpen, setPanelOpen, profile }: {
  profile: Profile;
  onRecordingChange: (recording: boolean) => void;
  onPhaseChange: (phase: string | null) => void;
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
  const [inputTab, setInputTab] = useState<'Microphone' | 'Recognition' | 'Speech check'>('Microphone');
  const [recognition, setRecognition] = useState<RecognitionSettings | null>(null);
  const [speechCheck, setSpeechCheck] = useState<{ text: string; details: string; warning?: string } | null>(null);
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
  const [diagnostics, setDiagnostics] = useState<DiagnosticStatus | null>(null);
  const [warning, setWarning] = useState('');
  const [catalogWarnings, setCatalogWarnings] = useState<string[]>([]);
  const [researchReport, setResearchReport] = useState<IntercomResearchReport | null>(null);
  const reportRequest = useRef<string | null>(null);
  const [voice, setVoice] = useState(true);
  const [autoSend, setAutoSend] = useState(true);
  const [autoListen, setAutoListen] = useState(true);
  const [liveTranscription, setLiveTranscription] = useState(false);
  const [liveDraft, setLiveDraft] = useState<string | null>(null);
  const [speaking, setSpeaking] = useState(false);
  const [delivery, setDelivery] = useState<'orchestrate' | 'chat' | WorkMode>('orchestrate');
  const panel = useRef<HTMLElement>(null);
  const active = useRef<string | null>(null);
  const recorder = useRef<Recording | null>(null);
  const finalizing = useRef<string | null>(null);
  const preview = useRef<{
    stopped: boolean; requestId: string | null;
    timer: ReturnType<typeof setTimeout> | null; pending: Promise<void> | null;
  } | null>(null);
  const localCheck = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mounted = useRef(true);
  const speechEpoch = useRef(0);
  const followUpEpoch = useRef(0);
  const busy = phase !== 'idle';
  const recording = phase === 'opening' || phase === 'listening';
  const canSend = delivery !== 'chat' || connected;
  const requestLimit = delivery === 'orchestrate' ? 10000 : 1000;
  const stopLabel = !localCheck.current && autoSend && canSend ? 'Stop & send' : 'Stop & transcribe';
  const openFeedback = useCallback(() => { setPanelOpen(true); onOpenTab('Talk'); }, [onOpenTab, setPanelOpen]);

  useEffect(() => {
    void window.intercom?.diagnosticPhase(phase).catch((reason: unknown) => setWarning(`Diagnostic reporting failed: ${String(reason)}`));
  }, [phase]);

  useEffect(() => {
    let active = true;
    void window.intercom?.diagnosticsStatus().then((status) => { if (active) setDiagnostics(status); })
      .catch((reason: unknown) => { if (active) setWarning(`Diagnostics unavailable: ${String(reason)}`); });
    const remove = window.intercom?.onDiagnosticsChanged(setDiagnostics);
    return () => { active = false; remove?.(); };
  }, []);

  useEffect(() => {
    onPhaseChange(['setup', 'opening', 'listening', 'transcribing'].includes(phase) ? labels[phase] : null);
    return () => onPhaseChange(null);
  }, [phase, onPhaseChange]);

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
  async function stopPreview() {
    const current = preview.current;
    if (!current) return;
    current.stopped = true;
    if (current.timer) clearTimeout(current.timer);
    try { if (current.requestId) await window.intercom?.cancelVoice(current.requestId); }
    finally {
      await current.pending;
      if (preview.current === current) preview.current = null;
    }
  }

  function startPreview(id: string, recording: Recording) {
    const current: NonNullable<typeof preview.current> = {
      stopped: false, requestId: null, timer: null, pending: null,
    };
    preview.current = current;
    const eligible = () => !current.stopped && active.current === id && recorder.current === recording;
    const update = async () => {
      if (!eligible()) return;
      try {
        const wave = recording.snapshot();
        if (wave && window.intercom) {
          current.requestId = crypto.randomUUID();
          const result = await window.intercom.transcribeVoice(current.requestId, wave);
          if (eligible()) setLiveDraft(result.text);
        }
      } catch (reason) {
        if (eligible()) {
          current.stopped = true;
          setWarning(`Live transcription paused: ${report(reason)} Recording continues; stop the microphone for final recognition.`);
          openFeedback();
        }
      } finally {
        current.requestId = null;
        if (eligible()) current.timer = setTimeout(() => { current.pending = update(); }, 3000);
      }
    };
    current.timer = setTimeout(() => { current.pending = update(); }, 3000);
  }

  async function stopSpeech() {
    speechEpoch.current++;
    await window.intercom?.stopVoiceSpeech();
    if (mounted.current) setSpeaking(false);
  }
  async function say(value: string) {
    if (!window.intercom) return false;
    if (!voice) return true;
    const epoch = ++speechEpoch.current;
    setSpeaking(true);
    try {
      await window.intercom.speakVoice(value);
      return mounted.current && epoch === speechEpoch.current;
    }
    catch (reason) {
      if (mounted.current && epoch === speechEpoch.current) setWarning(`Speech output failed: ${report(reason)} The written response remains available.`);
      return false;
    }
    finally { if (mounted.current && epoch === speechEpoch.current) setSpeaking(false); }
  }

  useEffect(() => {
    mounted.current = true;
    void window.intercom?.voiceSettings().then((settings) => { if (mounted.current) setSessionId(settings.sessionId); })
      .catch((reason: unknown) => { if (mounted.current) { setError(report(reason)); openFeedback(); } });
    void window.intercom?.recognitionSettings().then((settings) => { if (mounted.current) setRecognition(settings); })
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
      void stopPreview().catch(console.error);
      void recorder.current?.cancel().catch(console.error);
      if (id) void window.intercom?.cancelVoice(id).catch(console.error);
      if (id) void window.intercom?.cancelInterpretation(id).catch(console.error);
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

  async function configureRecognition(engine: 'whisper' | 'windows') {
    if (active.current || checkingMic || !window.intercom) return;
    const id = crypto.randomUUID();
    active.current = id;
    setPhase('setup'); setError('');
    try {
      const settings = await window.intercom.configureRecognition(id, engine);
      if (active.current === id) setRecognition(settings);
    } catch (reason) { if (active.current === id) { setError(report(reason)); openFeedback(); } }
    finally { if (active.current === id) { active.current = null; setPhase('idle'); } }
  }

  async function setRecognitionLanguage(language: string) {
    if (active.current || checkingMic || !window.intercom || (language !== 'auto' && language !== 'en' && language !== 'hi')) return;
    const id = crypto.randomUUID();
    active.current = id;
    setPhase('setup'); setError('');
    try {
      const settings = await window.intercom.setRecognitionLanguage(id, language);
      if (active.current === id) { setRecognition(settings); setSpeechCheck(null); }
    } catch (reason) { if (active.current === id) { setError(report(reason)); openFeedback(); } }
    finally { if (active.current === id) { active.current = null; setPhase('idle'); } }
  }

  async function send(value: string, id: string) {
    if (!window.intercom || active.current !== id) return;
    const replyEpoch = followUpEpoch.current;
    setCatalogWarnings([]);
    reportRequest.current = id;
    setResearchReport(null);
    if (delivery === 'orchestrate') {
      setPhase('checking');
      void say('I am checking your request and existing sessions.');
      const result = await window.intercom.orchestrate(id, value, profile);
      if (active.current !== id) return;
      setText(result.interpretation.normalizedText);
      setAnswer(`${result.planId ? 'Plan queued. ' : ''}${result.interpretation.message}`);
      setCatalogWarnings(result.warnings);
      setResearchReport(result.researchReport ?? null);
      openFeedback();
      if (!result.planId && result.interpretation.intent !== 'clarify') void say(result.interpretation.message.slice(0, 4400));
      if (!result.planId && result.interpretation.intent === 'clarify') {
        await stopSpeech();
        if (active.current !== id) return;
        const completed = await say(result.interpretation.message.slice(0, 4400));
        if (completed && autoListen &&
            followUpEpoch.current === replyEpoch && active.current === id && mounted.current && !document.hidden) {
          active.current = null;
          await startRecording(false, true);
        }
      }
      return;
    }
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

  async function finishRecording(id: string, limitReached = false) {
    if (active.current !== id || !recorder.current || finalizing.current === id) return;
    finalizing.current = id;
    const recording = recorder.current;
    const testOnly = localCheck.current;
    clearTimer(); setPhase('transcribing'); setLevel(0);
    try {
      const wave = await recording.stop().finally(stopPreview);
      if (recorder.current === recording) recorder.current = null;
      if (active.current !== id) return;
      const started = performance.now();
      const result = await window.intercom!.transcribeVoice(id, wave);
      if (active.current !== id) return;
      const limitWarning = limitReached || recording.diagnostics.seconds >= MAX_RECORDING_SECONDS
        ? 'Five-minute recording limit reached. Your transcript is preserved; review or edit it before sending. Nothing was sent.' : undefined;
      const lowResolution = (recording.input?.deviceRate ?? 16000) < 16000;
      const inputWarning = lowResolution ? 'The browser reports input below 16 kHz. Upsampling cannot recover missing detail; review names and exclusions before sending.' : result.warning;
      if (testOnly) {
        setSpeechCheck({ text: result.text, warning: limitWarning || inputWarning || (result.reviewRequired ? 'Recognition is uncertain. Check the words carefully.' : undefined),
          details: `${recording.input?.captureRate} Hz mono PCM16; ${recording.diagnostics.seconds.toFixed(1)}s recorded; ${((performance.now() - started) / 1000).toFixed(1)}s recognition${result.language ? `; detected ${result.language}` : ''}. No request sent.` });
        return;
      }
      setText(result.text);
      setLiveDraft(null);
      openFeedback();
      const reviewRequired = Boolean(limitWarning) || result.reviewRequired || lowResolution || result.text.length > requestLimit;
      if (reviewRequired) setWarning(result.text.length > requestLimit
        ? `Recognized ${result.text.length} characters. The request limit is ${requestLimit.toLocaleString('en-US')}; shorten the transcript below before sending. Nothing was sent.`
        : limitWarning || inputWarning || 'Local recognition is uncertain. Your transcript is preserved below; review or edit it, then send explicitly. Nothing was sent.');
      if (autoSend && canSend && !reviewRequired) await send(result.text, id);
    } catch (reason) { if (active.current === id) { setError(report(reason)); openFeedback(); } }
    finally {
      if (finalizing.current === id) finalizing.current = null;
      if (active.current === id) { setLiveDraft(null); localCheck.current = false; active.current = null; setPhase('idle'); }
    }
  }

  async function startRecording(testOnly = false, followUp = false) {
    if (active.current || checkingMic || !window.intercom) return;
    const id = crypto.randomUUID();
    const replyEpoch = followUpEpoch.current;
    active.current = id; setPhase('setup'); setError(''); setWarning('');
    localCheck.current = testOnly;
    let inputReady = false;
    try {
      await stopSpeech();
      if (active.current !== id) return;
      await window.intercom.recognitionReady(id);
      if (active.current !== id) return;
      if (followUp) {
        const state = await window.intercom.windowAction('state');
        if (active.current !== id) return;
        if (state.paused || document.hidden || !mounted.current || followUpEpoch.current !== replyEpoch) {
          active.current = null; localCheck.current = false; setPhase('idle');
          return;
        }
      }
      inputReady = true;
      setPhase('opening');
      if (testOnly) { setSpeechCheck(null); setPanelOpen(true); onOpenTab('Input'); setInputTab('Speech check'); }
      else {
        if (!followUp) setAnswer('');
        setLiveDraft(liveTranscription ? '' : null);
        if (liveTranscription || followUp) openFeedback();
        else { setText(''); setPanelOpen(false); }
      }
      const recording = new Recording(setLevel, () => {
        if (active.current === id) void cancel('The microphone disconnected. Nothing was sent.');
      }, () => { void finishRecording(id, true); });
      recorder.current = recording;
      await recording.start(device);
      if (active.current !== id) return;
      setPhase('listening');
      if (liveTranscription && !testOnly) startPreview(id, recording);
      timer.current = setTimeout(() => { void finishRecording(id, true); }, MAX_RECORDING_SECONDS * 1000);
    } catch (reason) {
      if (active.current === id) {
        if (inputReady) void window.intercom.reportDiagnosticFailure('microphone-failed')
          .catch((failure: unknown) => setWarning(`Diagnostic reporting failed: ${report(failure)}`));
        await recorder.current?.cancel();
        recorder.current = null; localCheck.current = false; active.current = null; setLiveDraft(null); setPhase('idle'); setError(`${inputReady ? 'Microphone failed' : 'Speech engine unavailable'}: ${report(reason)}`); openFeedback();
      }
    }
  }

  async function cancel(message = 'Cancelled. If already dispatched, inspect Copilot history before retrying.') {
    followUpEpoch.current++;
    const id = active.current;
    if (!id) return;
    active.current = null;
    clearTimer();
    try { await Promise.all([stopPreview(), recorder.current?.cancel(), window.intercom?.cancelVoice(id), window.intercom?.cancelInterpretation(id), stopSpeech()]); }
    catch (reason) { message = `Cancellation could not be confirmed: ${report(reason)}`; }
    recorder.current = null; localCheck.current = false; setLiveDraft(null); setLevel(0); setPhase('idle'); setError(message); openFeedback();
  }

  async function reopenReport() {
    if (!researchReport || !window.intercom) return;
    const id = researchReport.id;
    try {
      await window.intercom.openResearchReport(id);
      if (!mounted.current || reportRequest.current !== id) return;
      setResearchReport({ ...researchReport, opened: true, openError: undefined });
      setError('');
    } catch (reason) {
      if (mounted.current && reportRequest.current === id) setError(`Report opening failed: ${report(reason)}`);
    }
  }

  return <><section ref={panel} className="live-conversation" aria-label="Live voice conversation" data-panel-open={panelOpen} hidden={!floating && (tab === 'Work' || (tab === 'Advanced' && !advancedGeneral))}>
    <div hidden={!floating && tab !== 'Talk'} className="conversation-tab">
    {floating && <button className="quiet-button voice-panel-close" onClick={() => setPanelOpen(false)}>Hide voice settings</button>}
    <div className="conversation-status" role="status">{checkingMic ? 'Checking microphone...' : phase === 'idle' ? delivery === 'orchestrate' ? 'Intercom is ready. Talk naturally; existing sessions are discovered for each request.' : connected ? 'Session connected. Ready when you are.' : 'Ready to listen. Connect a session to send.' : labels[phase]}</div>
    <div className="conversation-feedback">
    {diagnostics?.error && <p className="voice-error" role="alert">{diagnostics.error} Logs may be incomplete: {diagnostics.directory}</p>}
    {error && <p className="voice-error" role="alert">{error}</p>}
    {warning && <p className="voice-error" role="alert">{warning}</p>}
    {catalogWarnings.length > 0 && <details className="catalog-diagnostics"><summary>{catalogWarnings.length} session catalog notices (not context-reading failures)</summary>
      <p>These affect live routing. Saved-context research has its own source-coverage audit.</p>
      {catalogWarnings.map((notice, index) => <p key={index}>{notice}</p>)}</details>}
    {answer && <div className="live-result" aria-live="polite"><div className="message-label">{delivery === 'orchestrate' ? 'INTERCOM / REQUEST RECEIPT' : 'COPILOT RESPONSE / SESSION RESPONSE'}</div><p>{answer}</p></div>}
    {researchReport && <div className="research-receipt">
      <p>{researchReport.partial ? 'Partial source coverage - see the report audit.' : 'Available saved sources inspected.'}</p>
      <small>{researchReport.path}</small>
      {researchReport.openError && <p role="alert">{researchReport.openError}</p>}
      <button className="quiet-button" disabled={busy} onClick={() => void reopenReport()}>Open context report</button>
      <ResearchSynthesis key={researchReport.id} report={researchReport} profile={profile} disabled={busy}
        onQueued={() => { setAnswer('Cited synthesis queued in the selected existing session. Tool permissions remain manual; the illustrated result will open after a valid response.'); onOpenTab('Work'); }} />
    </div>}
    </div>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (active.current || (delivery === 'chat' && !connected) || !text.trim()) return;
      if (text.trim().length > requestLimit) { setError(`Shorten the transcript to ${requestLimit.toLocaleString('en-US')} characters or fewer before sending. Nothing was sent.`); return; }
      const id = crypto.randomUUID(); active.current = id; setError(''); setWarning(''); setAnswer('');
      void send(text.trim(), id).catch((reason: unknown) => { if (active.current === id) { setError(report(reason)); openFeedback(); } })
        .finally(() => { if (active.current === id) { active.current = null; setPhase('idle'); } });
    }}>
      <label htmlFor="voice-transcript">Transcript / typed fallback</label>
      <label className="voice-toggle"><input type="checkbox" checked={liveTranscription} disabled={busy} onChange={(event) => setLiveTranscription(event.target.checked)} />Live transcription (local draft)</label>
      <textarea id="voice-transcript" maxLength={requestLimit} value={liveDraft ?? text} disabled={busy} onChange={(event) => setText(event.target.value)} placeholder="Tell Intercom which existing sessions to work with and what to do." />
      {liveTranscription && <small>Periodic local drafts while the mic is on, not word-by-word streaming. Uses more GPU/CPU; only final recognition can be sent after stopping.</small>}
      <button className="quiet-button" disabled={busy || !canSend || !text.trim() || text.trim().length > requestLimit} type="submit">{delivery === 'orchestrate' ? 'Send to Intercom' : delivery === 'chat' ? 'Send text to Copilot' : 'Prepare work from text'}</button>
    </form>
    {delivery === 'chat' && !connected && <button className="quiet-button" onClick={() => { onOpenTab('Session'); if (floating) void window.intercom?.windowAction('toggle-floating').catch((reason: unknown) => setError(report(reason))); }}>Connect a session</button>}
    {recording && <button className="quiet-button" aria-label="Cancel recording" onClick={() => void cancel()}>Cancel recording</button>}
    <button className="quiet-button" disabled={!speaking} onClick={() => {
      followUpEpoch.current++;
      void stopSpeech().catch((reason: unknown) => setWarning(report(reason)));
    }}>Stop voice playback</button>
    <small>{!recognition ? 'Checking speech configuration.' : !recognition.ready ? 'Set up local multilingual speech in Input / Recognition.' :
      recognition.engine === 'windows' ? 'Legacy Windows English (US) recognition selected.' : `Local multilingual Whisper selected (${recognition.backend}). Roman output and filler cleanup occur during Intercom interpretation.`}</small>
    </div>
    <div hidden={floating || tab !== 'Input'} className="voice-setup">
    <SettingsTabs tabs={['Microphone', 'Recognition', 'Speech check'] as const} value={inputTab} onChange={setInputTab} label="Input categories" />
    <div hidden={inputTab !== 'Microphone'}>
    <MicrophonePicker onSelect={setDevice} locked={busy} onCheckingChange={setCheckingMic} />
    <small id="voice-recording-help">{phase === 'opening' ? 'Microphone starting; input may be active.' : phase === 'listening' ? 'Microphone ON. Audio stays in memory; maximum 5 minutes. Automatic cutoff requires transcript review.' : `Microphone off. Up to 5 minutes per recording. Click Speak, talk, then click ${stopLabel}.`}</small>
    <small>Push-to-talk, with one automatic reply recording after an Intercom clarification question when enabled. No wake word or continuous listening.</small>
    </div>
    <div hidden={inputTab !== 'Recognition'} className="recognition-settings">
      <h3>Local speech recognition</h3>
      <p role="status">{!recognition ? 'Reading engine settings...' : !recognition.ready ? 'Multilingual engine needs one-time setup.' :
        recognition.engine === 'windows' ? 'Legacy Windows English (US)' : `Whisper large-v3-turbo / ${recognition.backend === 'vulkan' ? 'Vulkan GPU' : 'CPU'}`}</p>
      <button className="quiet-button" disabled={busy || checkingMic || !window.intercom} onClick={() => void configureRecognition('whisper')}>Choose local Whisper engine</button>
      <button className="quiet-button" disabled={busy || checkingMic || !window.intercom} onClick={() => void configureRecognition('windows')}>Use legacy English recognition</button>
      <label htmlFor="recognition-language">Recognition language</label>
      <select id="recognition-language" value={recognition?.language ?? 'auto'} disabled={busy || checkingMic || !recognition?.ready || recognition.engine !== 'whisper'}
        onChange={(event) => void setRecognitionLanguage(event.target.value)}>
        <option value="auto">Auto / mixed Hindi-English</option><option value="en">English</option><option value="hi">Hindi</option>
      </select>
      <small>{recognition?.source === 'bundled' ? 'Included local speech is selected automatically; no folder setup is needed.' : 'Custom engines require the prepared pinned model/runtime folder.'} GPU never silently falls back. English/Hindi/Hinglish accuracy remains unqualified.</small>
      <button className="quiet-button" onClick={() => setInputTab('Speech check')}>Open speech check</button>
    </div>
    <div hidden={inputTab !== 'Speech check'} className="recognition-settings">
      <h3>Local speech check</h3>
      <button className="quiet-button" disabled={busy || checkingMic || !recognition?.ready} onClick={() => void startRecording(true)}>Test speech locally</button>
      <small>Speak, then click the bubble to stop. This test never sends a request and keeps your working draft. Audio is not saved. Hindi may appear in its original script here; Roman cleanup happens during Intercom interpretation.</small>
      {!recognition?.ready && <small>Set up an engine in Recognition before testing.</small>}
      {speechCheck && <div className="speech-check">
        <label htmlFor="speech-check-transcript">Local test transcript</label>
        <textarea id="speech-check-transcript" readOnly value={speechCheck.text} rows={2} />
        <small>{speechCheck.details}</small>
        {speechCheck.warning && <p role="alert">{speechCheck.warning}</p>}
      </div>}
    </div>
    </div>
    <div hidden={floating || tab !== 'Session'} className="voice-session">
    <h3>Your existing session</h3>
    <label htmlFor="voice-delivery">Voice request destination</label>
    <select id="voice-delivery" value={delivery} disabled={busy} onChange={(event) => {
      const value = event.target.value;
      if (value === 'orchestrate' || value === 'chat' || value === 'background' || value === 'terminal') setDelivery(value);
    }}><option value="orchestrate">Intercom / route to existing sessions</option><option value="chat">Legacy conversation / no work tools</option><option value="background">Manual background task / confirm below</option><option value="terminal">New terminal task / confirm below</option></select>
    {delivery === 'orchestrate' && <p>Intercom interprets requests, researches saved mesh context and routes work to existing sessions. Research opens a private evidence report without resuming sessions. Clear work plans retain eligibility checks and tool permissions.</p>}
    {!window.intercom && <p role="alert">Live voice requires the Windows desktop app, not the browser preview.</p>}
    <div hidden={delivery !== 'chat'}>
      <p className="connection-state" role="status">{connected ? 'Session connected - settings' : 'Connect your dedicated session'}</p>
      <label htmlFor="voice-session">Existing session ID</label>
      <input id="voice-session" value={sessionId} disabled={busy} onChange={(event) => { setSessionId(event.target.value); setConnected(false); }} placeholder="Paste full session UUID" spellCheck={false} />
      <button className="quiet-button" disabled={busy || !sessionId.trim() || !window.intercom} onClick={() => void configure()}>Connect existing session</button>
      <small>Close that session&apos;s terminal first. No new session or competing writer will be created.</small>
    {!canSend && <small>Connecting never sends your transcript. Use Send text to Copilot explicitly.</small>}
    <small>Legacy conversation has no work tools. Manual work retains target/task confirmation and permissions.</small>
    </div>
    </div>
    <div hidden={floating || tab !== 'Voice'} className="voice-playback">
    <h3>Your speaking voice</h3>
    <label className="voice-toggle"><input type="checkbox" checked={voice} onChange={(event) => { followUpEpoch.current++; setVoice(event.target.checked); if (!event.target.checked) void stopSpeech().catch((reason: unknown) => setWarning(report(reason))); }} />Speak progress and responses (local Windows voice)</label>
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
      <label className="voice-toggle"><input type="checkbox" checked={autoListen} onChange={(event) => {
        followUpEpoch.current++; setAutoListen(event.target.checked);
      }} />Automatically listen for clarification replies</label>
      <small>Opens the selected mic after Intercom finishes a clarification question, or shows it with voice off. Click the mic to finish; Cancel stops capture. No automatic recording for ordinary replies, work results or permission prompts. Stop voice playback also cancels that pending reply recording.</small>
      <label className="voice-toggle"><input type="checkbox" checked={autoSend} disabled={busy} onChange={(event) => setAutoSend(event.target.checked)} />Send recognized text automatically after stopping</label>
      <small>Only clear, in-limit speech. Uncertain speech waits for review. Intercom executes clear plans directly; manual delivery modes retain target/task confirmation.</small>
      <details><summary>Local diagnostics</summary>
      <p>{diagnostics?.policy ?? 'Diagnostics are available in the desktop app.'}</p>
      {diagnostics && <small aria-label="Diagnostics directory">{diagnostics.directory}</small>}
      {!!diagnostics?.droppedEvents && <small>{diagnostics.droppedEvents} diagnostic events omitted to bound resource use.</small>}
      <button className="quiet-button" disabled={!diagnostics} onClick={() => {
        void window.intercom?.openDiagnostics().catch((reason: unknown) => { setError(report(reason)); openFeedback(); });
      }}>Open diagnostics folder</button>
      </details>
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
