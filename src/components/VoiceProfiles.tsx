import { useRef, useState } from 'react';
import { SettingsTabs } from './SettingsTabs';

export function VoiceProfiles({ locked, onPreview, onStop, visible }: {
  visible: boolean;
  locked: boolean;
  onPreview: (text: string, profile: SpeakingProfile) => Promise<boolean>;
  onStop: () => Promise<void>;
}) {
  const [settings, setSettings] = useState<SpeakingProfiles | null>(null);
  const [providers, setProviders] = useState<SpeakingProvider[]>([]);
  const [draft, setDraft] = useState<SpeakingProfile | null>(null);
  const [gender, setGender] = useState('');
  const [text, setText] = useState('Hello. I am Intercom, ready to help with your projects.');
  const [busy, setBusy] = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [tab, setTab] = useState<'Voice' | 'Tune' | 'Profiles' | 'Preview'>('Voice');
  const loading = useRef(false);
  const provider = providers.find((item) => item.id === draft?.providerId);
  const saved = settings?.profiles.find((item) => item.id === draft?.id);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);
  const active = settings?.profiles.find((item) => item.id === settings.activeId);
  const disabled = busy || locked;

  async function act(operation: () => Promise<void>) {
    setBusy(true); setError(''); setMessage('');
    try { await operation(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }
  function accept(next: SpeakingProfiles, id = next.activeId) {
    setSettings(next);
    setDraft(structuredClone(next.profiles.find((item) => item.id === id) ?? next.profiles[0]));
    setGender('');
  }
  async function load() {
    if (loading.current || !window.intercom) return;
    loading.current = true;
    await act(async () => {
      const [next, catalog] = await Promise.all([window.intercom!.voiceProfiles(), window.intercom!.voiceCatalog()]);
      setProviders(catalog); accept(next);
    });
    loading.current = false;
  }

  return <details className="voice-profiles" open={visible} onToggle={(event) => {
    if (event.currentTarget.open && !settings) void load();
  }}>
    <summary className="sr-only">Voice profiles / customize speech</summary>
    {!settings && busy && <p role="status">Loading installed voices and profiles...</p>}
    {!settings && <button className="quiet-button" disabled={disabled || !window.intercom} onClick={() => void load()}>Load voices and profiles</button>}
    {settings && draft && <>
      <p className="voice-profile-active" role="status">Active voice profile: <strong>{active?.name}</strong></p>
      <SettingsTabs tabs={['Voice', 'Tune', 'Profiles', 'Preview'] as const} value={tab} onChange={setTab} label="Speaking voice categories" />
      <div hidden={tab !== 'Profiles'}>
      <label htmlFor="speaking-profile">Saved voice profile</label>
      <select id="speaking-profile" value={saved ? draft.id : ''} disabled={disabled} onChange={(event) => {
        accept(settings, event.target.value); setError(''); setMessage('');
      }}>
        {!saved && <option value="">New unsaved profile</option>}
        {settings.profiles.map((item) => <option key={item.id} value={item.id}>{item.name}{item.id === settings.activeId ? ' (active)' : ''}</option>)}
      </select>
      <label htmlFor="voice-profile-name">Voice profile name</label>
      <input id="voice-profile-name" maxLength={60} value={draft.name} disabled={disabled} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
      </div>
      <div hidden={tab !== 'Voice'}>
      <small title="Gender and accent come from the selected installed voice, not a simulated identity.">{provider?.label ?? 'Provider unavailable'}</small>
      <label htmlFor="speaking-gender">Filter voices by gender</label>
      <select id="speaking-gender" value={gender} disabled={disabled} onChange={(event) => setGender(event.target.value)}>
        <option value="">All installed genders</option>
        {[...new Set(provider?.voices.map((voice) => voice.gender))].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      <label htmlFor="speaking-voice">Speaking voice / accent</label>
      <select id="speaking-voice" value={draft.voiceId ?? ''} disabled={disabled} onChange={(event) => setDraft({ ...draft, voiceId: event.target.value || null })}>
        <option value="">Default installed English voice</option>
        {draft.voiceId && !provider?.voices.some((voice) => voice.id === draft.voiceId) &&
          <option value={draft.voiceId}>{draft.voiceId} / unavailable</option>}
        {provider?.voices.map((voice) => <option key={voice.id} value={voice.id} hidden={!!gender && gender !== voice.gender && voice.id !== draft.voiceId}>
          {voice.id} / {voice.gender} / {voice.culture}
        </option>)}
      </select>
      </div>
      <div hidden={tab !== 'Tune'}>
      {provider?.controls.map((control) => <div className="voice-control" key={control.key}>
        <label htmlFor={`voice-${control.key}`}>{control.label} <output>{draft.parameters[control.key]} {control.unit}</output></label>
        <input id={`voice-${control.key}`} type="range" min={control.min} max={control.max} step={control.step} value={draft.parameters[control.key]}
          disabled={disabled} onChange={(event) => setDraft({ ...draft, parameters: { ...draft.parameters, [control.key]: Number(event.target.value) } })} />
      </div>)}
      <small title="Pitch response depends on the voice. Speed uses Windows' -10 to +10 scale, not a measured multiplier. Volume 0 is silent.">Save to apply edits; preview to try them.</small>
      </div>
      <div className="voice-profile-actions">
        <button className="quiet-button" disabled={disabled || !draft.name.trim() || !provider} onClick={() => void act(async () => {
          accept(await window.intercom!.saveVoiceProfile(draft)); setMessage('Voice profile saved and active.');
        })}>Save &amp; use profile</button>
        <button className="quiet-button" hidden={tab !== 'Tune'} disabled={disabled || !provider} onClick={() => {
          setDraft({ ...draft, parameters: Object.fromEntries(provider!.controls.map((control) => [control.key, control.default])) });
        }}>Reset voice controls</button>
        <button className="quiet-button" hidden={tab !== 'Profiles'} disabled={disabled || !saved || dirty || draft.id === settings.activeId} onClick={() => void act(async () => {
          accept(await window.intercom!.activateVoiceProfile(draft.id)); setMessage('Saved voice profile is active.');
        })}>Use saved profile</button>
        <button className="quiet-button" hidden={tab !== 'Profiles'} disabled={disabled || settings.profiles.length >= 32} onClick={() => {
          setDraft({ ...draft, id: crypto.randomUUID(), name: `${draft.name.slice(0, 55)} copy` }); setMessage('New copy: edit its name and save to keep it.');
        }}>Duplicate profile</button>
        <button className="quiet-button" hidden={tab !== 'Profiles'} disabled={disabled || !saved || draft.id === settings.activeId} onClick={() => void act(async () => {
          accept(await window.intercom!.deleteVoiceProfile(draft.id)); setMessage('Inactive voice profile deleted.');
        })}>Delete profile</button>
      </div>
      <div hidden={tab !== 'Preview'}>
      <label htmlFor="voice-preview-text">Voice preview text</label>
      <textarea id="voice-preview-text" maxLength={300} value={text} disabled={disabled} onChange={(event) => setText(event.target.value)} />
      <div className="voice-profile-actions">
        <button className="quiet-button" disabled={disabled || !text.trim() || !provider} onClick={() => void act(async () => {
          setPreviewing(true);
          try {
            const finished = await onPreview(text, draft);
            setMessage(`${finished ? 'Preview finished.' : 'Preview stopped.'} Preview does not save or activate edits.`);
          }
          finally { setPreviewing(false); }
        })}>Preview voice</button>
        <button className="quiet-button" disabled={!previewing} onClick={() => void onStop().catch((reason: unknown) => setError(String(reason)))}>Stop preview</button>
        <button className="quiet-button" disabled={disabled} onClick={() => void load()}>Reload installed voices</button>
      </div>
      </div>
      <small>Local voices. Unsaved edits stay in this panel.</small>
    </>}
    {message && <p role="status">{message}</p>}
    {error && <p className="voice-error" role="alert">{error}</p>}
  </details>;
}
