import { useCallback, useEffect, useRef, useState } from 'react';

const storageKey = 'intercom.prototype.microphone';

export function MicrophonePicker() {
  const [selected, setSelected] = useState('default');
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const mounted = useRef(true);
  const stream = useRef<MediaStream | null>(null);
  const missing = loaded && selected !== 'default' && !devices.some((device) => device.deviceId === selected);

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
    if (busy) return;
    setBusy(true);
    setError('');
    setStatus('Opening microphone briefly...');
    let opened: MediaStream | undefined;
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Microphone access is unavailable in this runtime.');
      opened = await navigator.mediaDevices.getUserMedia({
        audio: load || selected === 'default' ? true : { deviceId: { exact: selected } },
        video: false,
      });
      stream.current = opened;
      if (!mounted.current) return;
      const available = await refresh();
      if (!available.length) throw new Error('No microphone devices are available.');
      setStatus(load ? 'Devices loaded. Microphone is off.' : 'Selected microphone checked. Input is off.');
    } catch (reason) {
      if (mounted.current) {
        setStatus('');
        setError(`Microphone access failed: ${reason instanceof Error ? reason.message : String(reason)} Check Windows microphone privacy permissions and whether the device is connected.`);
      }
    } finally {
      opened?.getTracks().forEach((track) => track.stop());
      stream.current = null;
      if (mounted.current) setBusy(false);
    }
  }

  function choose(value: string) {
    setSelected(value);
    setStatus('Selection saved for microphone checks. Speech input is not connected.');
    setError('');
    try { localStorage.setItem(storageKey, value); }
    catch { setError('The microphone choice could not be saved. It will last only for this launch.'); }
  }

  return <section className="microphone-panel" aria-label="Microphone settings">
    <label htmlFor="microphone">Microphone device</label>
    <select id="microphone" value={selected} disabled={busy} onChange={(event) => choose(event.target.value)}>
      <option value="default">System default</option>
      {selected !== 'default' && !devices.some((device) => device.deviceId === selected) &&
        <option value={selected}>{loaded ? 'Saved microphone - unavailable' : 'Saved microphone - load devices to verify'}</option>}
      {devices.filter((device) => device.deviceId !== 'default').map((device, index) =>
        <option key={device.deviceId} value={device.deviceId}>{device.label || `Microphone ${index + 1}`}</option>)}
    </select>
    <div className="microphone-actions">
      <button className="quiet-button" disabled={busy} onClick={() => void check(true)}>{loaded ? 'Refresh devices' : 'Load microphones'}</button>
      <button className="quiet-button" disabled={busy || !loaded || missing || !devices.length} onClick={() => void check(false)}>Test selected</button>
    </div>
    <small>Loading or testing briefly opens a mic, then stops it. No audio is saved or sent; speech input is not connected.</small>
    {status && <p role="status">{status}</p>}
    {missing && <p role="alert">The saved microphone is unavailable. Reconnect it or choose another; no device was substituted.</p>}
    {error && <p role="alert">{error}</p>}
  </section>;
}
