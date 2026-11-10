import { describe, expect, it } from 'vitest';
import { activePath, applyEvent, contexts, isProfile, resolveTarget, spherePosition } from './model';
import type { Job } from './model';

const job: Job = { id: 'demo-1', contextId: 'workshop', request: 'Test', profile: 'Speed / performance', phase: 'routing', sequence: 0 };

describe('fixture routing', () => {
  it('matches normalized whole aliases but does not guess unknown targets', () => {
    expect(resolveTarget('In WORKSHOP, outline a release.').map((item) => item.id)).toEqual(['workshop']);
    expect(resolveTarget('workshopping something')).toEqual([]);
    expect(resolveTarget('an unknown project')).toEqual([]);
  });
  it('preserves ambiguity across multiple names and colliding aliases', () => {
    expect(resolveTarget('Workshop and Atlas')).toHaveLength(2);
    expect(resolveTarget('lab', [contexts[1], { ...contexts[2], aliases: ['lab'] }])).toHaveLength(2);
  });
});

describe('fixture job lifecycle', () => {
  it('ignores stale, duplicate and foreign events', () => {
    const running = applyEvent(job, { jobId: job.id, sequence: 1, phase: 'running' });
    expect(applyEvent(running, { jobId: job.id, sequence: 1, phase: 'finished-unverified' })).toBe(running);
    expect(applyEvent(running, { jobId: 'other', sequence: 2, phase: 'finished-unverified' })).toBe(running);
    expect(running.profile).toBe('Speed / performance');
  });
  it('requires running before an unverified outcome and never revives cancellation', () => {
    expect(applyEvent(job, { jobId: job.id, sequence: 1, phase: 'finished-unverified' })).toBe(job);
    const cancelled = applyEvent(job, { jobId: job.id, sequence: 1, phase: 'cancelled' });
    expect(applyEvent(cancelled, { jobId: job.id, sequence: 2, phase: 'running' })).toBe(cancelled);
    expect(activePath(cancelled)).toEqual([]);
  });
  it('lights only the simulated route while active and clears it on finish', () => {
    const running = applyEvent(job, { jobId: job.id, sequence: 1, phase: 'running' });
    expect(activePath(running)).toEqual([31, 32, 33]);
    const finished = applyEvent(running, { jobId: job.id, sequence: 2, phase: 'finished-unverified' });
    expect(finished.phase).toBe('finished-unverified');
    expect(activePath(finished)).toEqual([]);
  });
});

it('keeps graph positions stable independently of catalog size', () => {
  expect(spherePosition(31)).toEqual(spherePosition(contexts[1].slot));
  expect(Math.hypot(...spherePosition(31))).toBeCloseTo(2.45);
});

it('accepts only supported stored profiles', () => {
  expect(isProfile('Speed / performance')).toBe(true);
  expect(isProfile(null)).toBe(false);
  expect(isProfile('allow all')).toBe(false);
});
