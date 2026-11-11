/// <reference types="vite/client" />

type WindowAction = 'state' | 'toggle-floating' | 'toggle-top' | 'toggle-maximize' | 'shrink-floating' | 'grow-floating' | 'minimize' | 'close';
interface DesktopState {
  floating: boolean; onTop: boolean; maximized: boolean; paused: boolean;
  floatingSize: { side: number; min: number; max: number } | null;
}
type WorkMode = 'background' | 'terminal';
interface WorkProposal {
  id: string; contextId: string; contextName: string; sessionId: string; workspace: string;
  request: string; mode: WorkMode; profile: import('./model').Profile; expiresAt: number;
}
interface WorkJob extends WorkProposal {
  phase: 'starting' | 'running' | 'awaiting-approval' | 'responded' | 'failed' | 'unknown' | 'cancelled' | 'terminal-opened';
  text: string; activity: string; observedContextIds: string[]; acknowledged: boolean;
  startedAt: string; completedAt?: string; error?: string; notificationWarning?: string; cleanupNeeded?: boolean;
  effective?: { model: string; effort: string; approval: string };
  permission: null | { id: string; details: string; options: { optionId: string; name: string; kind: 'allow_once' | 'reject_once' }[] };
}
interface WorkVoiceProposal { id: string; text: string; mode: WorkMode }
interface SpeakingProfile {
  id: string; name: string; providerId: string; voiceId: string | null;
  parameters: Record<string, number>;
}
interface SpeakingProfiles { schemaVersion: 1; activeId: string; profiles: SpeakingProfile[] }
interface SpeakingProvider {
  id: string; label: string;
  features: { arbitraryIdentity: boolean; timbre: boolean; emotion: boolean };
  controls: { key: string; label: string; min: number; max: number; step: number; default: number; unit: string }[];
  voices: { id: string; gender: string; culture: string }[];
}
interface Window {
  intercom?: {
    loadContextMesh(): Promise<import('./model').MeshSnapshot>;
    workState(): Promise<WorkJob | null>;
    workSessions(contextId: string): Promise<{ id: string; status: string }[]>;
    prepareWork(contextId: string, sessionId: string, text: string, mode: WorkMode, profile: import('./model').Profile): Promise<WorkProposal>;
    confirmWork(id: string): Promise<WorkJob>;
    approveWork(id: string, permissionId: string, optionId: string): Promise<void>;
    acknowledgeWork(id: string): Promise<void>;
    cancelWork(id: string): Promise<void>;
    onWorkProgress(callback: (job: WorkJob) => void): () => void;
    voiceSettings(): Promise<{ sessionId: string }>;
    voiceProfiles(): Promise<SpeakingProfiles>;
    voiceCatalog(): Promise<SpeakingProvider[]>;
    saveVoiceProfile(profile: SpeakingProfile): Promise<SpeakingProfiles>;
    activateVoiceProfile(id: string): Promise<SpeakingProfiles>;
    deleteVoiceProfile(id: string): Promise<SpeakingProfiles>;
    previewVoice(text: string, profile: SpeakingProfile): Promise<void>;
    configureVoiceSession(id: string, sessionId: string): Promise<{ sessionId: string; workspace: string }>;
    transcribeVoice(id: string, wave: ArrayBuffer): Promise<{ text: string; confidence: number }>;
    sendVoicePrompt(id: string, text: string): Promise<{ requestId: string; sessionId: string; text: string; warning?: string }>;
    cancelVoice(id: string): Promise<void>;
    speakVoice(text: string): Promise<void>;
    stopVoiceSpeech(): Promise<void>;
    onVoiceProgress(callback: (event: { requestId?: string; phase: string; message: string }) => void): () => void;
    windowAction(action: WindowAction): Promise<DesktopState>;
    onWindowState(callback: (state: DesktopState) => void): () => void;
  };
}
