/// <reference types="vite/client" />

type WindowAction = 'state' | 'toggle-floating' | 'toggle-top' | 'toggle-maximize' | 'shrink-floating' | 'grow-floating' | 'minimize' | 'close';
interface DesktopState {
  floating: boolean; onTop: boolean; maximized: boolean; paused: boolean;
  floatingSize: { side: number; min: number; max: number } | null;
}
type WorkMode = 'background' | 'terminal';
interface WorkProposal {
  id: string; contextId: string; contextName: string; sessionId: string; workspace: string;
  request: string; mode: WorkMode; profile: import('./domain/model').Profile; expiresAt: number;
}
interface WorkJob extends WorkProposal {
  phase: 'starting' | 'running' | 'awaiting-approval' | 'responded' | 'failed' | 'unknown' | 'cancelled' | 'terminal-opened';
  text: string; activity: string; observedContextIds: string[]; acknowledged: boolean;
  startedAt: string; completedAt?: string; error?: string; notificationWarning?: string; cleanupNeeded?: boolean;
  effective?: { model: string; effort: string; approval: string };
  permission: null | { id: string; details: string; options: { optionId: string; name: string; kind: 'allow_once' | 'reject_once' }[] };
}
interface WorkVoiceProposal { id: string; text: string; mode: WorkMode }
interface IntercomAction {
  id: string; kind: 'work' | 'status'; sessionId: string; request: string;
  after: { actionId: string; outcome: 'finished' | 'succeeded' }[];
}
interface IntercomInterpretation {
  version: 1; intent: 'reply' | 'clarify' | 'plan' | 'research'; normalizedText: string; message: string;
  actions: IntercomAction[]; excludedStatusSessionIds: string[];
  research?: { topic: string; includeSessionHistory: boolean; synthesisSessionId?: string };
}
interface IntercomResearchReport {
  id: string; path: string; contexts: number; filesRead: number; partial: boolean;
  readableHistories: number; matchingHistories: number; opened: boolean; openError?: string;
  summary?: string; synthesisSessionId?: string;
}
interface IntercomPlan {
  id: string; profile: import('./domain/model').Profile; interpretation: IntercomInterpretation; researchReportId?: string;
  targets: { id: string; name: string; contextId: string; contextName: string; workspace: string }[];
  createdAt: string; phase: 'active' | 'finished' | 'cancelled' | 'unknown'; cancelled: boolean; acknowledged: boolean;
  actions: {
    id: string; phase: Exclude<WorkJob['phase'], 'terminal-opened'> | 'queued' | 'blocked' | 'succeeded';
    job?: WorkJob; error?: string;
    researchReport?: IntercomResearchReport; researchError?: string;
    status?: { observedAt: string; availability: 'idle' | 'busy';
      receipt: Pick<WorkJob, 'id' | 'phase' | 'text' | 'startedAt' | 'completedAt' | 'error'> | null };
  }[];
}
interface IntercomSourceEvent {
  sequence: number; at: string; contextIds: string[]; kind: 'continuity notes' | 'session history';
  path: string; status: 'checking' | 'read' | 'unavailable'; error?: string;
  filesRead: number; unavailableSources: number;
}
interface IntercomRequestActivity {
  id: string; phase: 'discovering' | 'interpreting' | 'researching' | 'reporting' | 'opening' | 'finished' | 'failed' | 'cancelled';
  startedAt: string; topic?: string; events: IntercomSourceEvent[]; observedContextIds: string[];
  filesRead: number; unavailableSources: number; error?: string;
}
interface IntercomOrchestration { plans: IntercomPlan[]; requestActivity?: IntercomRequestActivity; error?: string }
interface SpeakingProfile {
  id: string; name: string; providerId: string; voiceId: string | null;
  parameters: Record<string, number>;
}
interface SpeakingProfiles { schemaVersion: 1; activeId: string; profiles: SpeakingProfile[] }
interface RecognitionSettings {
  version: 1; engine: 'whisper' | 'windows'; backend?: 'cpu' | 'vulkan'; language?: 'auto' | 'en' | 'hi'; root?: string; source?: 'bundled'; ready: boolean;
}
interface SpeakingProvider {
  id: string; label: string;
  features: { arbitraryIdentity: boolean; timbre: boolean; emotion: boolean };
  controls: { key: string; label: string; min: number; max: number; step: number; default: number; unit: string }[];
  voices: { id: string; gender: string; culture: string }[];
}
interface Window {
  intercom?: {
    diagnosticsStatus(): Promise<DiagnosticStatus>;
    diagnosticPhase(phase: string): Promise<void>;
    reportDiagnosticFailure(kind: 'error' | 'unhandled-rejection' | 'microphone-failed'): Promise<void>;
    openDiagnostics(): Promise<void>;
    onDiagnosticsChanged(callback: (status: DiagnosticStatus) => void): () => void;
    orchestrationState(): Promise<IntercomOrchestration>;
    orchestrate(id: string, text: string, profile: import('./domain/model').Profile): Promise<{
      interpretation: IntercomInterpretation; planId: string | null; warnings: string[]; researchReport?: IntercomResearchReport;
    }>;
    openResearchReport(id: string): Promise<void>;
    researchSynthesisTargets(id: string): Promise<{ warnings: string[]; sessions: {
      id: string; name: string; contextName: string; status: 'idle' | 'busy'; reason?: string;
    }[] }>;
    synthesizeResearchReport(id: string, reportId: string, sessionId: string, profile: import('./domain/model').Profile): Promise<{ planId: string }>;
    cancelInterpretation(id: string): Promise<void>;
    cancelPlan(id: string): Promise<void>;
    approvePlanAction(planId: string, actionId: string, jobId: string, permissionId: string, optionId: string): Promise<void>;
    acknowledgePlan(id: string): Promise<void>;
    onOrchestrationProgress(callback: (state: IntercomOrchestration) => void): () => void;
    loadContextMesh(): Promise<import('./domain/model').MeshSnapshot>;
    workState(): Promise<WorkJob | null>;
    workSessions(contextId: string): Promise<{ id: string; status: string }[]>;
    prepareWork(contextId: string, sessionId: string, text: string, mode: WorkMode, profile: import('./domain/model').Profile): Promise<WorkProposal>;
    confirmWork(id: string): Promise<WorkJob>;
    approveWork(id: string, permissionId: string, optionId: string): Promise<void>;
    acknowledgeWork(id: string): Promise<void>;
    cancelWork(id: string): Promise<void>;
    onWorkProgress(callback: (job: WorkJob) => void): () => void;
    voiceSettings(): Promise<{ sessionId: string }>;
    recognitionSettings(): Promise<RecognitionSettings>;
    recognitionReady(id: string): Promise<void>;
    setRecognitionLanguage(id: string, language: 'auto' | 'en' | 'hi'): Promise<RecognitionSettings>;
    configureRecognition(id: string, engine: 'whisper' | 'windows'): Promise<RecognitionSettings>;
    voiceProfiles(): Promise<SpeakingProfiles>;
    voiceCatalog(): Promise<SpeakingProvider[]>;
    saveVoiceProfile(profile: SpeakingProfile): Promise<SpeakingProfiles>;
    activateVoiceProfile(id: string): Promise<SpeakingProfiles>;
    deleteVoiceProfile(id: string): Promise<SpeakingProfiles>;
    previewVoice(text: string, profile: SpeakingProfile): Promise<void>;
    configureVoiceSession(id: string, sessionId: string): Promise<{ sessionId: string; workspace: string }>;
    transcribeVoice(id: string, wave: ArrayBuffer): Promise<{
      text: string; confidence: number | null; tokenProbability?: number; language?: string; engine?: string; reviewRequired: boolean; warning?: string;
    }>;
    sendVoicePrompt(id: string, text: string): Promise<{ requestId: string; sessionId: string; text: string; warning?: string }>;
    cancelVoice(id: string): Promise<void>;
    speakVoice(text: string): Promise<void>;
    stopVoiceSpeech(): Promise<void>;
    onVoiceProgress(callback: (event: { requestId?: string; phase: string; message: string }) => void): () => void;
    windowAction(action: WindowAction): Promise<DesktopState>;
    onWindowState(callback: (state: DesktopState) => void): () => void;
  };
}
interface DiagnosticStatus {
  directory: string; error: string | null; droppedEvents: number; policy: string;
}
