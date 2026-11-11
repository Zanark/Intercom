const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const controls = [
  { key: 'pitch', label: 'Pitch', min: -12, max: 12, step: 1, default: 0, unit: 'semitones' },
  { key: 'rate', label: 'Speed', min: -10, max: 10, step: 1, default: 1, unit: 'Windows rate' },
  { key: 'volume', label: 'Volume', min: 0, max: 100, step: 1, default: 100, unit: '%' },
];
const profileId = /^(default|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

class WindowsSpeechProvider {
  constructor(run) {
    this.run = run;
    this.id = 'windows-local';
    this.label = 'Windows local / offline';
    this.controls = controls;
    this.features = { arbitraryIdentity: false, timbre: false, emotion: false };
  }

  validate(profile) {
    if (profile.voiceId !== null && (typeof profile.voiceId !== 'string' || !profile.voiceId.trim() || profile.voiceId.length > 200)) {
      throw new Error('Choose a valid installed speaking voice.');
    }
    if (!profile.parameters || typeof profile.parameters !== 'object' ||
        Object.keys(profile.parameters).length !== controls.length) throw new Error('Invalid voice controls.');
    for (const control of controls) {
      const value = profile.parameters[control.key];
      if (!Number.isInteger(value) || value < control.min || value > control.max) {
        throw new Error(`${control.label} must be ${control.min} to ${control.max}.`);
      }
    }
  }

  async catalog(operation) {
    const voices = JSON.parse(await this.run(operation, 'voices'));
    if (!Array.isArray(voices) || voices.length > 256 || voices.some((voice) =>
      typeof voice.id !== 'string' || !voice.id || voice.id.length > 200 ||
      typeof voice.gender !== 'string' || voice.gender.length > 40 ||
      typeof voice.culture !== 'string' || voice.culture.length > 80) ||
      new Set(voices.map((voice) => voice.id)).size !== voices.length) throw new Error('Windows returned an invalid voice catalog.');
    if (!voices.length) throw new Error('No enabled Windows speaking voices are installed.');
    return { id: this.id, label: this.label, controls: this.controls, features: this.features, voices };
  }

  speak(text, profile, operation) {
    return this.run(operation, 'speak', JSON.stringify({ text, voiceId: profile.voiceId, ...profile.parameters }));
  }
}

// Providers own validation, discovery and cancellable playback; jobs only request speech.
class VoiceProfiles {
  constructor(directory, providers) {
    this.directory = directory;
    this.providers = new Map(providers.map((provider) => [provider.id, provider]));
    this.tail = Promise.resolve();
  }

  validate(profile) {
    if (!profile || !profileId.test(profile.id) || typeof profile.name !== 'string' ||
        !profile.name.trim() || profile.name.length > 60 ||
        [...profile.name].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) throw new Error('A voice profile needs a valid ID and a name of 1-60 characters.');
    const provider = this.providers.get(profile.providerId);
    if (!provider) throw new Error('That speech provider is not installed. No fallback voice was substituted.');
    provider.validate(profile);
    return structuredClone({ id: profile.id, name: profile.name.trim(), providerId: profile.providerId, voiceId: profile.voiceId, parameters: profile.parameters });
  }

  async read() {
    let bytes;
    try {
      const file = await fs.open(path.join(this.directory, 'voice-profiles.json'), 'r');
      try {
        const buffer = Buffer.alloc(65537);
        let bytesRead = 0;
        while (bytesRead < buffer.length) {
          const next = await file.read(buffer, bytesRead, buffer.length - bytesRead, bytesRead);
          if (!next.bytesRead) break;
          bytesRead += next.bytesRead;
        }
        bytes = buffer.subarray(0, bytesRead);
      } finally { await file.close(); }
    }
    catch (error) {
      if (error.code !== 'ENOENT') throw new Error(`Voice profiles could not be read: ${error.message}`, { cause: error });
      return { schemaVersion: 1, activeId: 'default', profiles: [
        { id: 'default', name: 'Standard', providerId: 'windows-local', voiceId: null, parameters: { pitch: 0, rate: 1, volume: 100 } },
      ] };
    }
    if (bytes.length > 65536) throw new Error('Voice profiles exceed the supported size.');
    let state;
    try { state = JSON.parse(bytes.toString('utf8')); }
    catch (error) { throw new Error(`Voice profiles are malformed: ${error.message}`, { cause: error }); }
    if (!state || state.schemaVersion !== 1 || !Array.isArray(state.profiles) || !state.profiles.length || state.profiles.length > 32) throw new Error('Unsupported or invalid voice profile file.');
    const profiles = state.profiles.map((profile) => this.validate(profile));
    if (new Set(profiles.map((profile) => profile.id)).size !== profiles.length ||
        new Set(profiles.map((profile) => profile.name.toLowerCase())).size !== profiles.length ||
        !profiles.some((profile) => profile.id === state.activeId)) throw new Error('Voice profiles have duplicate identities/names or a missing active profile.');
    return { schemaVersion: 1, activeId: state.activeId, profiles };
  }

  change(update) {
    const result = this.tail.then(async () => {
      const state = await this.read();
      update(state);
      await fs.mkdir(this.directory, { recursive: true });
      const temporary = path.join(this.directory, `voice-profiles-${randomUUID()}.tmp`);
      try {
        await fs.writeFile(temporary, JSON.stringify(state) + '\n', { encoding: 'utf8', flag: 'wx', mode: 0o600 });
        await fs.rename(temporary, path.join(this.directory, 'voice-profiles.json'));
      } finally { await fs.rm(temporary, { force: true }); }
      return state;
    });
    this.tail = result.catch(() => {});
    return result;
  }

  save(value) {
    const profile = this.validate(value);
    return this.change((state) => {
      if (state.profiles.some((item) => item.id !== profile.id && item.name.toLowerCase() === profile.name.toLowerCase())) throw new Error('That voice profile name is already in use.');
      const index = state.profiles.findIndex((item) => item.id === profile.id);
      if (index < 0 && state.profiles.length >= 32) throw new Error('Keep at most 32 voice profiles.');
      if (index < 0) state.profiles.push(profile);
      else state.profiles[index] = profile;
      state.activeId = profile.id;
    });
  }

  activate(id) {
    return this.change((state) => {
      if (!state.profiles.some((profile) => profile.id === id)) throw new Error('That voice profile no longer exists.');
      state.activeId = id;
    });
  }

  remove(id) {
    return this.change((state) => {
      if (state.activeId === id) throw new Error('Use another voice profile before deleting the active one.');
      const index = state.profiles.findIndex((profile) => profile.id === id);
      if (index < 0) throw new Error('That voice profile no longer exists.');
      state.profiles.splice(index, 1);
    });
  }

  async speak(text, override, operation) {
    await this.tail;
    const state = override ? null : await this.read();
    const profile = this.validate(override ?? state.profiles.find((item) => item.id === state.activeId));
    if (operation.cancelled) throw new Error('Voice playback cancelled.');
    await this.providers.get(profile.providerId).speak(text, profile, operation);
  }
}

module.exports = { VoiceProfiles, WindowsSpeechProvider };
