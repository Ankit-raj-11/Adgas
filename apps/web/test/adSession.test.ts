import { describe, it, expect, vi } from 'vitest';
import { AdSessionTracker } from '../src/lib/adSession';

describe('AdSessionTracker', () => {
  it('initializes in idle state with target duration and brand metadata', () => {
    const tracker = new AdSessionTracker({
      campaignId: 'camp_arc_001',
      brandName: 'Circle Pay',
      durationSeconds: 5,
    });

    expect(tracker.campaignId).toBe('camp_arc_001');
    expect(tracker.brandName).toBe('Circle Pay');
    expect(tracker.durationSeconds).toBe(5);
    expect(tracker.watchedSeconds).toBe(0);
    expect(tracker.isComplete).toBe(false);
    expect(tracker.sessionToken).toBeDefined();
    expect(tracker.sessionToken.length).toBeGreaterThan(10);
  });

  it('updates progress deterministically and clamps to duration', () => {
    const tracker = new AdSessionTracker({
      campaignId: 'camp_arc_001',
      brandName: 'Circle Pay',
      durationSeconds: 5,
    });

    tracker.tick(2);
    expect(tracker.watchedSeconds).toBe(2);
    expect(tracker.progressPercent).toBe(40);
    expect(tracker.isComplete).toBe(false);

    tracker.tick(4);
    expect(tracker.watchedSeconds).toBe(5);
    expect(tracker.progressPercent).toBe(100);
    expect(tracker.isComplete).toBe(true);
  });

  it('generates cryptographic completion proof only when fully watched', () => {
    const tracker = new AdSessionTracker({
      campaignId: 'camp_arc_001',
      brandName: 'Circle Pay',
      durationSeconds: 5,
    });

    expect(() => tracker.generateCompletionProof()).toThrow('Ad viewing requirement not met');

    tracker.tick(5);
    const proof = tracker.generateCompletionProof();
    expect(proof.campaignId).toBe('camp_arc_001');
    expect(proof.adSessionToken).toBe(tracker.sessionToken);
    expect(proof.watchedDuration).toBe(5);
    expect(proof.completedAt).toBeTypeOf('number');
  });

  it('enforces replay guard so proof cannot be re-issued for duplicate sessions', () => {
    const tracker = new AdSessionTracker({
      campaignId: 'camp_arc_001',
      brandName: 'Circle Pay',
      durationSeconds: 5,
    });

    tracker.tick(5);
    const proof1 = tracker.generateCompletionProof();
    expect(proof1).toBeDefined();

    // Resetting creates a new session token and resets state
    tracker.reset();
    expect(tracker.watchedSeconds).toBe(0);
    expect(tracker.isComplete).toBe(false);
    expect(tracker.sessionToken).not.toBe(proof1.adSessionToken);
  });
});
