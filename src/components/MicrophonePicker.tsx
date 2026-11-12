import { useCallback, useEffect, useRef, useState } from 'react';
import { Recording } from '../voice/recording';

const storageKey = 'intercom.prototype.microphone';

export function MicrophonePicker({ onSelect, locked = false, onCheckingChange }: { onSelect?: (id: string) => void; locked?: boolean; onCheckingChange?: (busy: boolean) => void }) {
  const [selected, setSelected] = useState('default');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [level, setLevel] = useState(0);
  const [diagnostics, setDiagnostics] = useState('');
  const mounted = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const recorder = useRef<Recording | null>(null);
  const missing = loaded && selected !== 'default' && !devices.some((device) => device.deviceId === selected);
  useEffect(() => { onSelect?.(selected); }, [onSelect, selected]);

  const refresh = useCallback(async () => {
    const available = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === 'audioinput' && device.deviceId);
    if (mounted.current) {
      setDevices(available);
      setLoaded(true);
    }
    return available;
  }, []);

  useEffect(() => {
    mounted.current = true;
    try { setSelected(localStorage.getItem(storageKey) || 'default'); }
    catch { setError('Microphone preferences cannot be read. Choose a device for this launch.'); }
    return () => {
      mounted.current = false;
      stream.current?.getTracks().forEach((track) => track.stop());
      void recorder.current?.cancel().catch(console.error);
    };
  }, []);

  useEffect(() => {
    if (!loaded || !navigator.mediaDevices) return;
    const changed = () => {
      void refresh().catch((reason: unknown) => {
        if (mounted.current) setError(`Microphone list refresh failed: ${reason instanceof Error ? reason.message : String(reason)}`);
      });
    };
    navigator.mediaDevices.addEventListener('devicechange', changed);
    return () => navigator.mediaDevices.removeEventListener('devicechange', changed);
  }, [loaded, refresh]);

  async function check(load: boolean) {
    if (busy || locked) return;
    setBusy(true);
    onCheckingChange?.(true);
    setError('');
    setDiagnostics(''); setLevel(0);
    setStatus(load ? 'Opening microphone briefly...' : 'Speak for two seconds to check the selected input...');
    let opened: MediaStream | undefined;
    let recording: Recording | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this runtime.');
      if (load) {
        opened = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        stream.current = opened;
      } else {
        let disconnected = false;
        recording = new Recording((rms) => { if (mounted.current) setLevel(rms); }, () => { disconnected = true; });
        recorder.current = recording;
        await recording.start(selected);
        await new Promise((resolve) => setTimeout(resolve, 2000));
        if (!mounted.current) return;
        if (disconnected) throw new Error('The selected microphone disconnected during the check.');
        try { await recording.stop(); }
        finally {
          const stats = recording.diagnostics;
          setDiagnostics(`Browser input: ${stats.deviceRate ?? 'unknown'} Hz. Recognition: ${stats.captureRate} Hz, mono PCM16. Peak ${(stats.peak * 100).toFixed(1)}%; RMS ${(stats.rms * 100).toFixed(1)}%.`);
        }
        if (recording.diagnostics.clipped > 0.01) throw new Error('The input is clipping. Lower the microphone gain or move farther away, then test again.');
      }
      if (!mounted.current) return;
      const available = await refresh();
      if (!available.length) throw new Error('No microphone devices are available.');
      setStatus(load ? 'Devices loaded. Microphone is off.' : 'Selected microphone opens successfully. Signal detected; microphone is off. No transcription or request was sent.');
    } catch (reason) {
      if (mounted.current) {
        setStatus('');
        setError(`Microphone access failed: ${reason instanceof Error ? reason.message : String(reason)} Check Windows microphone privacy permissions and whether the device is connected.`);
      }
    } finally {
      opened?.getTracks().forEach((track) => track.stop());
      try { await recording?.cancel(); }
      catch (reason) {
        const message = `Microphone cleanup failed: ${reason instanceof Error ? reason.message : String(reason)}`;
        if (mounted.current) { setStatus(''); setError(message); }
        else console.error(message);
      }
      recorder.current = null;
      stream.current = null;
      if (mounted.current) { setBusy(false); setLevel(0); }
      onCheckingChange?.(false);
    }
  }

  function choose(value: string) {
    setSelected(value);
    setDiagnostics('');
    setStatus('Selection saved for recording. Click Speak to start.');
    setError('');
    try { localStorage.setItem(storageKey, value); }
    catch { setError('The microphone choice could not be saved. It will last only for this launch.'); }
  }

  return <section className="microphone-panel" aria-label="Microphone settings">
    <label htmlFor="microphone">Microphone device</label>
    <select id="microphone" value={selected} disabled={busy || locked} onChange={(event) => choose(event.target.value)}>
      <option value="default">System default</option>
      {selected !== 'default' && !devices.some((device) => device.deviceId === selected) &&
        <option value={selected}>{loaded ? 'Saved microphone - unavailable' : 'Saved microphone - load devices to verify'}</option>}
      {devices.filter((device) => device.deviceId !== 'default').map((device, index) =>
        <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
    </select>
    <div className="microphone-actions">
      <button className="quiet-button" disabled={busy || locked} onClick={() => void check(true)}>{loaded ? 'Refresh devices' : 'Load microphones'}</button>
      <button className="quiet-button" disabled={busy || locked || !loaded || missing || !devices.length} onClick={() => void check(false)}>Test selected</button>
    </div>
    <small>Load checks access. Test measures two seconds of local input, then turns it off; no audio is saved or sent.</small>
    {busy && <meter aria-label="Microphone test level" min="0" max="0.15" value={level} />}
    {status && <p role="status">{status}</p>}
    {diagnostics && <small aria-label="Microphone diagnostics">{diagnostics}</small>}
    {missing && <p role="alert">The saved microphone is unavailable. Reconnect it or choose another; no device was substituted.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
