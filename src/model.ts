export const profiles = ['Speed / performance', 'Balanced', 'Accuracy'] as const;
export type Profile = typeof profiles[number];
export interface Context {
  id: string;
  name: string;
  subtitle: string;
  aliases: string[];
  color: string;
  slot: number;
  basePath?: string;
}

export interface MeshEdge { source: string; target: string; type: string; confidence: string; relationshipClass: string }
export interface MeshSnapshot {
  contexts: Context[];
  edges: MeshEdge[];
  source: string;
  generatedAt: string;
  loadedAt: string;
  demo: boolean;
}

export const contexts: Context[] = [
  { id: 'intercom', name: 'Intercom', subtitle: 'Voice workspace', aliases: ['intercom', 'voice workspace'], color: '#67e8d0', slot: 8 },
  { id: 'workshop', name: 'Workshop', subtitle: 'Build & experiment', aliases: ['workshop', 'lab'], color: '#e9bd7a', slot: 31 },
  { id: 'atlas', name: 'Atlas', subtitle: 'Research & discovery', aliases: ['atlas', 'research'], color: '#9ab9ff', slot: 53 },
  { id: 'fieldnotes', name: 'Fieldnotes', subtitle: 'Ideas & writing', aliases: ['fieldnotes', 'notes'], color: '#c4a0ed', slot: 76 },
  { id: 'studio', name: 'Studio', subtitle: 'Design & motion', aliases: ['studio', 'design'], color: '#ee9eaa', slot: 98 },
  { id: 'harbor', name: 'Harbor', subtitle: 'Planning & reflection', aliases: ['harbor', 'planning'], color: '#8ec6e0', slot: 119 },
];

const normalized = (text: string) => text.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export function resolveTarget(text: string, catalog = contexts): Context[] {
  const input = ` ${normalized(text)} `;
  return catalog.filter((context) => context.aliases.some((alias) => input.includes(` ${normalized(alias)} `)));
}

export const isProfile = (value: string | null): value is Profile => profiles.some((profile) => profile === value);
export const graphCapacity = 144;
export function spherePosition(slot: number, capacity = graphCapacity): [number, number, number] {
  const y = 1 - (2 * (slot + 0.5)) / capacity;
  const r = Math.sqrt(1 - y * y);
  const theta = slot * Math.PI * (3 - Math.sqrt(5));
  return [Math.cos(theta) * r * 2.45, y * 2.45, Math.sin(theta) * r * 2.45];
}

export type Phase = 'routing' | 'running' | 'finished-unverified' | 'cancelled';
export interface Job {
  id: string;
  contextId: string;
  request: string;
  profile: Profile;
  phase: Phase;
  sequence: number;
}
export interface JobEvent { jobId: string; sequence: number; phase: Phase }
export function applyEvent(job: Job, event: JobEvent): Job {
  if (event.jobId !== job.id || event.sequence <= job.sequence) return job;
  const next: Record<Phase, Phase[]> = {
    routing: ['running', 'cancelled'],
    running: ['finished-unverified', 'cancelled'],
    'finished-unverified': [],
    cancelled: [],
  };
  if (!next[job.phase].includes(event.phase)) return job;
  return { ...job, phase: event.phase, sequence: event.sequence };
}

export function activePath(job: Job | null): number[] {
  if (!job || job.phase === 'cancelled' || job.phase === 'finished-unverified') return [];
  const context = contexts.find((item) => item.id === job.contextId);
  if (!context) return [];
  return job.phase === 'routing' ? [context.slot] : [context.slot, context.slot + 1, context.slot + 2];
}
