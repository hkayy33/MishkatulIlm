import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  earliestUpcomingScheduledLesson,
  projectNextWeeklyOccurrence,
  resolveNextScheduledLesson,
} from './scheduled-lesson.util';

/** Four booked weekly lessons (a full teacher booking block). */
function fourWeekBlock(): { slotId: string; startsAtUtc: string; endsAtUtc: string }[] {
  const start = new Date('2026-06-02T10:00:00.000Z');
  return Array.from({ length: 4 }, (_, week) => {
    const s = new Date(start.getTime() + week * 7 * 24 * 60 * 60 * 1000);
    const e = new Date(s.getTime() + 60 * 60 * 1000);
    return {
      slotId: `slot-${week}`,
      startsAtUtc: s.toISOString(),
      endsAtUtc: e.toISOString(),
    };
  });
}

describe('scheduled-lesson.util (after a 4-week booking block)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-01T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null upcoming lessons when every booked slot has ended', () => {
    const upcoming = earliestUpcomingScheduledLesson(fourWeekBlock());
    expect(upcoming).toBeNull();
  });

  it('may project a next lesson date for admin UI but reuses existing slot ids', () => {
    const booked = fourWeekBlock();
    const projected = projectNextWeeklyOccurrence(booked);

    expect(projected).not.toBeNull();
    expect(projected!.startsAtUtc).toBe('2026-07-07T10:00:00.000Z');
    expect(booked.some((l) => l.slotId === projected!.slotId)).toBe(true);
  });

  it('does not add new lesson rows when resolving next lesson without API data', () => {
    const booked = fourWeekBlock();
    const resolved = resolveNextScheduledLesson(null, booked);

    expect(resolved).not.toBeNull();
    expect(booked.length).toBe(4);
  });
});
