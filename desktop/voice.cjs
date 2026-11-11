const { spawn } = require('node:child_process');
const fs = require('node:fs/promises');
const path = require('node:path');
const { StringDecoder } = require('node:string_decoder');
const { VoiceProfiles, WindowsSpeechProvider } = require('./synthesis.cjs');

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function requireId(value) {
  if (typeof value !== 'string' || !uuid.test(value)) throw new Error('Enter the full existing Copilot session ID.');
  return value.toLowerCase();
}

function eligibleSession(catalog, id) {
  const found = catalog.sessions?.find((row) => row.session_id?.toLowerCase() === id);
  if (!found?.can_resume || found.source !== 'copilot_cli') throw new Error('That existing local Copilot session was not found or cannot be resumed. No new session was created.');
  if (found.status !== 'idle') throw new Error('This session is in use. Close its terminal/session before letting Intercom resume it; Intercom will not attach a second writer.');
  if (typeof found.folder !== 'string' || !path.isAbsolute(found.folder)) throw new Error('The session has no valid local workspace.');
  return found;
}

function waveBytes(value) {
  if (!(value instanceof ArrayBuffer) || value.byteLength < 46 || value.byteLength > 6000044) throw new Error('Invalid or oversized recording.');
  const wave = Buffer.from(value);
  if (wave.toString('ascii', 0, 4) !== 'RIFF' || wave.toString('ascii', 8, 12) !== 'WAVE' ||
      wave.toString('ascii', 12, 16) !== 'fmt ' || wave.readUInt32LE(16) !== 16 ||
      wave.readUInt16LE(20) !== 1 || wave.readUInt16LE(22) !== 1 ||
      wave.readUInt16LE(34) !== 16 || wave.toString('ascii', 36, 40) !== 'data' ||
      wave.readUInt32LE(40) !== wave.length - 44 || wave.readUInt32LE(4) !== wave.length - 8 ||
      (wave.length - 44) % 2 !== 0) throw new Error('Expected mono 16-bit PCM WAV audio.');
  const rate = wave.readUInt32LE(24);
  if (rate < 8000 || rate > 48000 || wave.readUInt32LE(28) !== rate * 2 ||
      wave.readUInt16LE(32) !== 2 || (wave.length - 44) / (rate * 2) > 61) throw new Error('Recording exceeds the supported sample rate or one-minute limit.');
  return wave;
}

function resultReader(sessionId) {
  let answer = '';
  let complete;
  let terminal;
  return {
    accept(event) {
      if (event.type === 'tool.execution_start' && event.data?.toolName !== 'task_complete') {
        throw new Error('Copilot attempted a tool outside conversation-only mode. Outcome is unverified; inspect the session before retrying.');
      }
      if (event.type === 'session.task_complete') {
        complete = event.data?.success === true;
        if (typeof event.data?.summary === 'string') answer = event.data.summary.trim();
      }
      if (event.type === 'assistant.message' && complete === undefined &&
          typeof event.data?.content === 'string') answer = event.data.content.trim();
      if (event.type === 'result') terminal = event;
    },
    finish() {
      if (complete === false || !answer || answer.length > 32000 ||
          terminal?.sessionId?.toLowerCase() !== sessionId || terminal.exitCode !== 0) {
        throw new Error('No matching successful Copilot response was received. The request may have reached the session; inspect it before retrying.');
      }
      return answer;
    },
  };
}

function stopTree(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    // Terminate only the tree rooted at the process this host spawned.
    const killer = spawn('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    const timer = setTimeout(() => {
      killer.kill();
      reject(new Error('Stopping the owned process timed out. Its exit is unverified; inspect the session before retrying.'));
    }, 5000);
    killer.on('error', (error) => { clearTimeout(timer); reject(error); });
    killer.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0 || child.exitCode !== null || child.signalCode !== null) resolve();
      else reject(new Error('Could not stop the owned process. Check the session before retrying.'));
    });
  });
}

class VoiceHost {
  constructor(profile, publish) {
    this.profile = profile;
    this.publish = publish;
    this.work = null;
    this.speech = null;
    this.speechEpoch = 0;
    this.catalogPending = null;
    this.catalogWork = null;
    this.profiles = new VoiceProfiles(profile, [new WindowsSpeechProvider(async (operation, mode, input) =>
      this.process(operation, 'powershell.exe', await this.speechCommand(), { input, mode, timeout: mode === 'voices' ? 20000 : 180000 }))]);
  }

  async settings() {
    try { return { sessionId: requireId(JSON.parse(await fs.readFile(path.join(this.profile, 'voice-settings.json'), 'utf8')).sessionId) }; }
    catch (error) {
      if (error.code === 'ENOENT') return { sessionId: '' };
      throw new Error(`Voice settings could not be read: ${error.message}`, { cause: error });
    }
  }

  async exclusive(id, operation) {
    requireId(id);
    if (this.work) throw new Error('Another voice operation is still running.');
    const work = { id, child: null, cancelled: false };
    this.work = work;
    try { return await operation(work); }
    finally { if (this.work === work) this.work = null; }
  }

  async process(work, executable, args, { input, cwd, mode, onEvent, timeout = 45000 } = {}) {
    if (work.cancelled) throw new Error('Operation cancelled.');
    return new Promise((resolve, reject) => {
      const child = spawn(executable, args, {
        cwd, windowsHide: true, shell: false,
        env: mode ? { ...process.env, INTERCOM_SPEECH_MODE: mode } : process.env,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      work.child = child;
      let output = '';
      let stderr = '';
      let pending = '';
      let failure;
      let bytes = 0;
      const decoder = new StringDecoder('utf8');
      const terminate = (error) => {
        if (failure) return;
        failure = error;
        void stopTree(child).catch((reason) => { failure = new Error(`${error.message} ${reason.message}`); });
      };
      const timer = setTimeout(() => terminate(new Error(mode ? 'Local speech operation timed out.' : 'Operation timed out. Dispatch outcome is unverified; inspect the session before retrying.')), timeout);
      child.on('error', (error) => { failure = new Error(`${path.basename(executable)} could not start: ${error.message}`); });
      child.stdin.on('error', (error) => { if (error.code !== 'EPIPE') terminate(error); });
      child.stdout.on('data', (chunk) => {
        bytes += chunk.length;
        if (bytes > 8 * 1024 * 1024) { terminate(new Error(`${mode ? 'Local speech' : 'Copilot'} output exceeded the bounded response limit.`)); return; }
        const text = decoder.write(chunk);
        if (!onEvent) { output += text; return; }
        pending += text;
        const lines = pending.split('\n');
        pending = lines.pop();
        try { for (const line of lines) if (line.trim()) onEvent(JSON.parse(line)); }
        catch (error) { terminate(new Error(`Invalid Copilot event stream: ${error.message}`)); }
      });
      child.stderr.on('data', (chunk) => { stderr = (stderr + chunk.toString('utf8')).slice(-4000); });
      child.on('close', (code) => {
        clearTimeout(timer);
        if (work.child === child) work.child = null;
        if (work.cancelled) { reject(new Error(mode ? 'Local speech operation cancelled.' : 'Cancelled. A dispatched prompt may remain in Copilot history; no automatic retry was made.')); return; }
        if (failure) { reject(failure); return; }
        if (code !== 0) { reject(new Error(stderr.trim() || `Process exited with code ${code}. No success was confirmed.`)); return; }
        try {
          if (onEvent && pending.trim()) onEvent(JSON.parse(pending + decoder.end()));
          resolve(output + (onEvent ? '' : decoder.end()));
        } catch (error) { reject(error); }
      });
      child.stdin.end(input);
    });
  }

  async *catalogPages(work) {
    let cursor;
    const seen = new Set();
    for (let page = 0; page < 4; page++) {
      const args = ['hub', 'list-local-sessions', '--json', '--limit', '500'];
      if (cursor) args.push('--cursor', cursor);
      const catalog = JSON.parse(await this.process(work, 'agency.exe', args));
      if (!Array.isArray(catalog.sessions) || catalog.sessions.length > 500) throw new Error('Agency returned an invalid session catalog.');
      yield catalog;
      if (!catalog.next_cursor) return;
      if (typeof catalog.next_cursor !== 'string' || seen.has(catalog.next_cursor)) throw new Error('Agency returned an invalid repeated cursor.');
      seen.add(catalog.next_cursor);
      cursor = catalog.next_cursor;
    }
    throw new Error('Local session discovery exceeded its page bound. No replacement was created.');
  }

  async discover(work, sessionId) {
    for await (const catalog of this.catalogPages(work)) {
      if (catalog.sessions?.some((row) => row.session_id?.toLowerCase() === sessionId)) {
        const found = eligibleSession(catalog, sessionId);
        if (!(await fs.stat(found.folder)).isDirectory()) throw new Error('The session workspace is unavailable.');
        return found;
      }
    }
    throw new Error('The designated session was not found within the local discovery bound. No replacement was created.');
  }

  configure(id, sessionId) {
    sessionId = requireId(sessionId);
    return this.exclusive(id, async (work) => {
      work.sessionId = sessionId;
      this.assertAvailable?.(sessionId);
      const found = await this.discover(work, sessionId);
      if (work.cancelled) throw new Error('Connection cancelled.');
      await fs.mkdir(this.profile, { recursive: true });
      await fs.writeFile(path.join(this.profile, 'voice-settings.json'), JSON.stringify({ sessionId }) + '\n', 'utf8');
      return { sessionId, workspace: found.folder };
    });
  }

  async speechCommand() {
    const script = await fs.readFile(path.join(__dirname, 'speech.ps1'), 'utf8');
    return ['-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', Buffer.from(script, 'utf16le').toString('base64')];
  }

  transcribe(id, audio) {
    const input = waveBytes(audio);
    return this.exclusive(id, async (work) => {
      const result = JSON.parse(await this.process(work, 'powershell.exe', await this.speechCommand(), { input, mode: 'recognize' }));
      if (typeof result?.text !== 'string' || !result.text.trim()) throw new Error('No English (US) speech was recognized. Nothing was sent. Check the input meter and try again.');
      if (result.text.length > 10000) throw new Error('Recognition returned more than 10,000 characters, exceeding the supported transcript size. Nothing was sent.');
      if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) throw new Error('Local recognition returned an invalid confidence score. Nothing was sent.');
      const text = result.text.trim();
      return { text, confidence: result.confidence, reviewRequired: result.confidence < 0.35 || text.length > 1000 };
    });
  }

  send(id, text) {
    if (typeof text !== 'string' || !text.trim() || text.length > 1000) throw new Error('A request must contain 1-1000 characters.');
    return this.exclusive(id, async (work) => {
      const { sessionId } = await this.settings();
      requireId(sessionId);
      work.sessionId = sessionId;
      this.assertAvailable?.(sessionId);
      this.publish({ requestId: id, phase: 'checking', message: 'Checking that your existing session is idle...' });
      const found = await this.discover(work, sessionId);
      const reader = resultReader(sessionId);
      this.publish({ requestId: id, phase: 'running', message: 'Copilot is responding in your existing session...' });
      await this.process(work, 'copilot.exe', [
        `--resume=${sessionId}`, '--no-auto-update', '--no-custom-instructions',
        '--available-tools', 'task_complete', '--deny-tool', 'shell', 'write',
        '--disable-builtin-mcps', '--no-ask-user', '--output-format=json',
        '-p', `Intercom voice conversation. Reply briefly in English. Do not use any work tools. User request:\n${text}`,
      ], { cwd: found.folder, onEvent: (event) => reader.accept(event), timeout: 180000 });
      const response = { requestId: id, sessionId, text: reader.finish(), completedAt: new Date().toISOString() };
      try { await fs.writeFile(path.join(this.profile, 'last-response.json'), JSON.stringify(response) + '\n', 'utf8'); }
      catch (error) { response.warning = `Response received, but it could not be saved: ${error.message}`; }
      return response;
    });
  }

  async cancel(id) {
    requireId(id);
    const work = this.work;
    if (work?.id !== id) return;
    work.cancelled = true;
    await stopTree(work.child);
  }

  async stopSpeech() {
    this.speechEpoch++;
    const speech = this.speech;
    if (!speech) return;
    speech.cancelled = true;
    speech.controller.abort();
    await stopTree(speech.child);
  }

  voiceCatalog() {
    if (!this.catalogPending) {
      const operation = { child: null, cancelled: false, controller: new AbortController() };
      this.catalogWork = operation;
      this.catalogPending = (async () => {
        const catalogs = [];
        for (const provider of this.profiles.providers.values()) catalogs.push(await provider.catalog(operation));
        return catalogs;
      })()
        .finally(() => { this.catalogPending = null; this.catalogWork = null; });
    }
    return this.catalogPending;
  }

  async speak(text, profile) {
    if (typeof text !== 'string' || !text.trim() || text.length > 4500) throw new Error('Invalid spoken response.');
    if (profile !== undefined) profile = this.profiles.validate(profile);
    const epoch = ++this.speechEpoch;
    if (this.speech) {
      this.speech.cancelled = true;
      this.speech.controller.abort();
      await stopTree(this.speech.child);
    }
    if (epoch !== this.speechEpoch) throw new Error('Local speech operation cancelled.');
    const speech = { child: null, cancelled: false, controller: new AbortController() };
    this.speech = speech;
    try { await this.profiles.speak(text, profile, speech); }
    finally { if (this.speech === speech) this.speech = null; }
  }

  async close() {
    if (this.catalogWork) { this.catalogWork.cancelled = true; this.catalogWork.controller.abort(); }
    await Promise.all([this.work ? this.cancel(this.work.id) : undefined, this.stopSpeech(), stopTree(this.catalogWork?.child)]);
  }
}

module.exports = { VoiceHost, eligibleSession, waveBytes, resultReader, stopTree, requireId };
