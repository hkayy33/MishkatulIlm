import { DatePipe } from '@angular/common';
import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import type { AvailabilitySlotRow, WeekOneLessonPick } from '../../core/models/calendar.models';
import { lessonsOverlap } from '../../core/utils/lesson-duration';
import { addMinutesToIso, formatSlotRange } from '../../core/utils/datetime-local';
import {
  durationLabel,
  durationsFromStart,
  mergeDayAvailability,
  normalizeAvailabilityRows,
  normalizeSlotStartIso,
  SCHEDULE_DURATION_OPTIONS,
  SCHEDULE_GRID_STEP_MINUTES,
  calendarDayKeyInZone,
  utcCivilDayKeyFromCalendarDate,
} from '../../core/utils/schedule-grid';
import { parseLessonAttendanceStatus } from '../../core/utils/attendance.util';
import { formatSlotRangeInZone, timeZoneOffsetLabel } from '../../core/utils/timezone.util';
import {
  calendarWeekStartKeyInZone,
  dayKeyForLocalCalendarDate,
} from '../../core/utils/week-schedule.util';

export type SlotVisualState =
  | 'open'
  | 'booked'
  | 'booked-student'
  | 'outside-preference'
  | 'selected-start'
  | 'selected-range'
  | 'confirmed';

export interface DaySlotView {
  startsAtUtc: string;
  endsAtUtc: string;
  tutorTimeLabel: string;
  studentTimeLabel: string | null;
  state: SlotVisualState;
  studentName?: string | null;
  attendanceStatus?: 'attending' | 'not_attending' | null;
  releaseKey?: string | null;
}

export interface DayMonthSummary {
  available: number;
  booked: number;
  hasPicks: boolean;
}

@Component({
  selector: 'app-admin-lesson-calendar',
  standalone: true,
  imports: [DatePipe],
  templateUrl: './admin-lesson-calendar.html',
  styleUrl: './admin-lesson-calendar.scss',
})
export class AdminLessonCalendar {
  readonly availability = input<AvailabilitySlotRow[]>([]);
  readonly loading = input(false);
  readonly pickMode = input(false);
  readonly requiredSelections = input(1);
  /** When set, caps how many start-week lessons can be added (resolve flow uses a high limit). */
  readonly selectionLimit = input<number | null>(null);
  readonly selectedLessons = model<WeekOneLessonPick[]>([]);
  readonly selectionError = output<string | null>();
  readonly monthChanged = output<Date>();
  /** IANA time zone for the tutor (admin). */
  readonly tutorTimeZoneId = input('UTC');
  readonly tutorDisplayName = input('Tutor');
  readonly tutorLocationLabel = input('');
  /** When scheduling a student, pass their zone and label. */
  readonly studentTimeZoneId = input<string | null>(null);
  readonly studentDisplayName = input<string | null>(null);
  readonly studentLocationLabel = input<string | null>(null);
  /** When rescheduling, pass the student id so their bookings can be released for new picks. */
  readonly releaseableStudentUserId = input<string | null>(null);

  protected readonly durationOptions = SCHEDULE_DURATION_OPTIONS;
  protected readonly releasedBookingKeys = signal<ReadonlySet<string>>(new Set());
  protected readonly durationLabel = durationLabel;

  protected readonly viewMonth = signal(
    new Date(new Date().getFullYear(), new Date().getMonth(), 1),
  );
  protected readonly selectedDay = signal<Date | null>(null);
  protected readonly draftStartUtc = signal<string | null>(null);
  protected readonly draftDurationMinutes = signal<number>(30);

  protected readonly monthLabel = computed(() => {
    const d = this.viewMonth();
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  });

  protected readonly enforceStartWeekAnchor = computed(
    () => this.pickMode() && !this.releaseableStudentUserId(),
  );

  protected readonly weekOneAnchorKey = computed(() => {
    const first = this.selectedLessons()[0];
    if (!first) return null;
    return calendarWeekStartKeyInZone(first.startsAtUtc, this.tutorTimeZoneId());
  });

  constructor() {
    effect(() => {
      this.releaseableStudentUserId();
      this.availability();
      this.releasedBookingKeys.set(new Set());
    });
  }

  protected readonly grid = computed(() => {
    const start = this.viewMonth();
    const year = start.getFullYear();
    const month = start.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    const cells: { date: Date | null; inMonth: boolean }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: null, inMonth: false });
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: new Date(year, month, day), inMonth: true });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, inMonth: false });
    return cells;
  });

  protected readonly normalizedAvailability = computed(() =>
    normalizeAvailabilityRows(this.availability()),
  );

  protected readonly slotsByDayKey = computed(() => {
    const tz = this.tutorTimeZoneId();
    const map = new Map<string, AvailabilitySlotRow[]>();
    for (const slot of this.normalizedAvailability()) {
      const key = calendarDayKeyInZone(slot.startsAtUtc, tz);
      const list = map.get(key) ?? [];
      list.push(slot);
      map.set(key, list);
    }
    return map;
  });

  protected readonly selectedDaySlots = computed(() => {
    const day = this.selectedDay();
    if (!day) return [];
    const cellKey = dayKeyForLocalCalendarDate(day, this.tutorTimeZoneId());
    const matching = (this.slotsByDayKey().get(cellKey) ?? []).slice().sort((a, b) =>
      a.startsAtUtc.localeCompare(b.startsAtUtc),
    );
    if (matching.length > 0) {
      return matching;
    }
    return mergeDayAvailability(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      [],
    );
  });

  protected readonly effectiveDaySlots = computed((): AvailabilitySlotRow[] => {
    const raw = this.selectedDaySlots();
    const studentId = this.releaseableStudentUserId();
    const released = this.releasedBookingKeys();
    if (!studentId || released.size === 0) {
      return raw;
    }

    const pass1 = raw.map((slot) => {
      if (!this.isReleasableStudentBooking(slot) || !released.has(this.bookingReleaseKey(slot))) {
        return slot;
      }
      return {
        ...slot,
        isAvailable: true,
        studentUserId: null,
        studentName: null,
        slotId: null,
        attendanceStatus: null,
        studentLessonNote: null,
        availableDurationMinutes: [...SCHEDULE_DURATION_OPTIONS],
      };
    });

    return pass1.map((slot) => {
      if (!slot.isAvailable) {
        return slot;
      }
      const durations = durationsFromStart(slot.startsAtUtc, pass1);
      return {
        ...slot,
        availableDurationMinutes:
          durations.length > 0 ? durations : (slot.availableDurationMinutes ?? []),
      };
    });
  });

  protected readonly daySlotViews = computed((): DaySlotView[] => {
    const draftStart = this.draftStartUtc();
    const draftDuration = this.draftDurationMinutes();
    const draftSteps = draftStart ? draftDuration / SCHEDULE_GRID_STEP_MINUTES : 0;

    const tutorTz = this.tutorTimeZoneId();
    const studentTz = this.studentTimeZoneId();
    const effectiveByStart = new Map(
      this.effectiveDaySlots().map((s) => [normalizeSlotStartIso(s.startsAtUtc), s]),
    );

    return this.selectedDaySlots().map((rawSlot) => {
      const effective =
        effectiveByStart.get(normalizeSlotStartIso(rawSlot.startsAtUtc)) ?? rawSlot;
      return {
        startsAtUtc: rawSlot.startsAtUtc,
        endsAtUtc: rawSlot.endsAtUtc,
        tutorTimeLabel: formatSlotRangeInZone(rawSlot.startsAtUtc, rawSlot.endsAtUtc, tutorTz),
        studentTimeLabel: studentTz
          ? formatSlotRangeInZone(rawSlot.startsAtUtc, rawSlot.endsAtUtc, studentTz)
          : null,
        state: this.slotVisualState(rawSlot, effective, draftStart, draftSteps),
        studentName: rawSlot.studentName,
        attendanceStatus: rawSlot.studentUserId
          ? parseLessonAttendanceStatus(rawSlot.attendanceStatus)
          : null,
        releaseKey: this.isReleasableStudentBooking(rawSlot)
          ? this.bookingReleaseKey(rawSlot)
          : null,
      };
    });
  });

  protected readonly draftDurationChoices = computed(() => {
    const start = this.draftStartUtc();
    if (!start) return [];
    return durationsFromStart(start, this.effectiveDaySlots());
  });

  protected readonly canConfirmDraft = computed(() => {
    const start = this.draftStartUtc();
    if (!start) return false;
    const duration = this.draftDurationMinutes();
    return this.draftDurationChoices().includes(duration);
  });

  protected readonly draftSummaryLabel = computed(() => {
    const start = this.draftStartUtc();
    if (!start) return '';
    const duration = this.draftDurationMinutes();
    const end = addMinutesToIso(start, duration);
    const tutor = formatSlotRangeInZone(start, end, this.tutorTimeZoneId());
    const studentTz = this.studentTimeZoneId();
    if (!studentTz) {
      return `${tutor} (${durationLabel(duration)})`;
    }
    const student = formatSlotRangeInZone(start, end, studentTz);
    return `${tutor} · student ${student} (${durationLabel(duration)})`;
  });

  protected readonly maxSelectableLessons = computed(() => {
    if (this.releaseableStudentUserId()) {
      return this.selectionLimit() ?? 16;
    }
    return this.selectionLimit() ?? this.requiredSelections();
  });

  protected readonly picksRemaining = computed(
    () => this.maxSelectableLessons() - this.selectedLessons().length,
  );

  protected readonly timezoneBanner = computed(() => {
    const studentTz = this.studentTimeZoneId();
    if (!studentTz || studentTz === this.tutorTimeZoneId()) {
      return null;
    }
    const name = this.studentDisplayName() ?? 'Student';
    const loc = this.studentLocationLabel();
    const offset = timeZoneOffsetLabel(this.tutorTimeZoneId(), studentTz);
    return loc ? `${name} (${loc}) — ${offset}` : `${name} — ${offset}`;
  });

  protected readonly sideRangeLabel = computed(() => {
    const tutor = this.tutorDisplayName();
    return `8am – 10pm · ${tutor}'s time · 30-minute slots`;
  });

  protected bookedSlotLabel(slot: DaySlotView): string {
    const name = slot.studentName?.trim() || 'Booked';
    if (slot.attendanceStatus === 'not_attending') {
      return `${name} · Not attending`;
    }
    return name;
  }

  protected daySummary(date: Date): DayMonthSummary {
    const cellKey = dayKeyForLocalCalendarDate(date, this.tutorTimeZoneId());
    const slots = this.slotsByDayKey().get(cellKey) ?? [];
    const hasPicks = this.selectedLessons().some((lesson) => {
      const end = addMinutesToIso(lesson.startsAtUtc, lesson.durationMinutes);
      return (
        calendarDayKeyInZone(lesson.startsAtUtc, this.tutorTimeZoneId()) === cellKey ||
        this.overlapsLocalDay(lesson.startsAtUtc, end, date)
      );
    });
    const isActuallyBooked = (s: AvailabilitySlotRow) =>
      !s.isAvailable && Boolean(s.studentUserId ?? s.studentName);
    const available = slots.filter((s) => s.isAvailable).length;
    const booked = slots.filter(isActuallyBooked).length;
    return {
      available,
      booked,
      hasPicks,
    };
  }

  protected prevMonth(): void {
    const d = this.viewMonth();
    const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    this.viewMonth.set(next);
    this.clearDraft();
    this.selectedDay.set(null);
    this.monthChanged.emit(next);
  }

  protected nextMonth(): void {
    const d = this.viewMonth();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    this.viewMonth.set(next);
    this.clearDraft();
    this.selectedDay.set(null);
    this.monthChanged.emit(next);
  }

  protected selectDay(date: Date): void {
    this.selectedDay.set(date);
    this.clearDraft();
    this.selectionError.emit(null);
  }

  protected formatLesson(lesson: WeekOneLessonPick): string {
    const end = addMinutesToIso(lesson.startsAtUtc, lesson.durationMinutes);
    const tutor = formatSlotRangeInZone(
      lesson.startsAtUtc,
      end,
      this.tutorTimeZoneId(),
    );
    const studentTz = this.studentTimeZoneId();
    if (!studentTz) {
      return `${tutor} (${durationLabel(lesson.durationMinutes)})`;
    }
    const student = formatSlotRangeInZone(lesson.startsAtUtc, end, studentTz);
    return `${tutor} · student ${student} (${durationLabel(lesson.durationMinutes)})`;
  }

  protected isSlotClickable(slot: DaySlotView): boolean {
    if (!this.pickMode()) return false;
    if (slot.state === 'booked') {
      return false;
    }
    if (slot.state === 'booked-student') {
      return true;
    }
    if (slot.state === 'confirmed') {
      return true;
    }
    if (
      this.picksRemaining() <= 0 &&
      slot.state !== 'selected-start' &&
      slot.state !== 'selected-range'
    ) {
      return false;
    }
    if (this.enforceStartWeekAnchor()) {
      const anchorKey = this.weekOneAnchorKey();
      if (
        anchorKey &&
        calendarWeekStartKeyInZone(slot.startsAtUtc, this.tutorTimeZoneId()) !== anchorKey
      ) {
        return false;
      }
    }
    return (
      slot.state === 'open' ||
      slot.state === 'outside-preference' ||
      slot.state === 'selected-start' ||
      slot.state === 'selected-range'
    );
  }

  protected onSlotClick(slot: DaySlotView): void {
    if (slot.state === 'booked-student' && slot.releaseKey) {
      this.toggleBookingRelease(slot.releaseKey);
      return;
    }

    if (slot.state === 'confirmed') {
      const lesson = this.findLessonCoveringSlot(slot.startsAtUtc);
      if (lesson) {
        this.removeLesson(lesson);
      }
      return;
    }

    if (!this.isSlotClickable(slot) && slot.state !== 'selected-start' && slot.state !== 'selected-range') {
      return;
    }

    if (this.draftStartUtc() === slot.startsAtUtc) {
      this.clearDraft();
      return;
    }

    this.draftStartUtc.set(slot.startsAtUtc);
    const choices = durationsFromStart(slot.startsAtUtc, this.effectiveDaySlots());
    this.draftDurationMinutes.set(choices[0] ?? 30);
    this.selectionError.emit(null);
  }

  protected onDurationPick(minutes: number): void {
    if (!this.draftDurationChoices().includes(minutes)) return;
    this.draftDurationMinutes.set(minutes);
    this.selectionError.emit(null);
  }

  protected confirmDraftLesson(): void {
    const startsAtUtc = this.draftStartUtc();
    const durationMinutes = this.draftDurationMinutes();

    if (!startsAtUtc) {
      this.selectionError.emit('Select a start time for the lesson.');
      return;
    }
    if (!this.canConfirmDraft()) {
      this.selectionError.emit('That duration is not available for the selected start time.');
      return;
    }
    if (this.picksRemaining() <= 0) {
      this.selectionError.emit('You have selected all required lessons for this week.');
      return;
    }

    const pick: WeekOneLessonPick = { startsAtUtc, durationMinutes };
    if (this.enforceStartWeekAnchor()) {
      const anchorKey = this.weekOneAnchorKey();
      if (
        anchorKey &&
        calendarWeekStartKeyInZone(startsAtUtc, this.tutorTimeZoneId()) !== anchorKey
      ) {
        this.selectionError.emit('All lessons must be in the same calendar week.');
        return;
      }
    }

    const current = [...this.selectedLessons()];
    if (current.some((l) => lessonsOverlap(l, pick))) {
      this.selectionError.emit('This lesson overlaps one you already added.');
      return;
    }

    current.push(pick);
    this.selectedLessons.set(current.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc)));
    this.clearDraft();
    this.selectionError.emit(null);
  }

  protected clearDraft(): void {
    this.draftStartUtc.set(null);
    this.draftDurationMinutes.set(30);
    this.selectionError.emit(null);
  }

  protected removeLesson(lesson: WeekOneLessonPick): void {
    this.selectedLessons.set(
      this.selectedLessons().filter((l) => l.startsAtUtc !== lesson.startsAtUtc),
    );
    this.selectionError.emit(null);
  }

  private slotVisualState(
    rawSlot: AvailabilitySlotRow,
    effectiveSlot: AvailabilitySlotRow,
    draftStart: string | null,
    draftSteps: number,
  ): SlotVisualState {
    if (this.isReleasableStudentBooking(rawSlot) && !this.isBookingReleased(rawSlot)) {
      return 'booked-student';
    }
    if (!effectiveSlot.isAvailable) return 'booked';
    if (effectiveSlot.matchesStudentPreference === false) return 'outside-preference';

    const startMs = new Date(effectiveSlot.startsAtUtc).getTime();
    if (draftStart) {
      const draftStartMs = new Date(draftStart).getTime();
      const draftEndMs = draftStartMs + draftSteps * SCHEDULE_GRID_STEP_MINUTES * 60 * 1000;
      if (startMs >= draftStartMs && startMs < draftEndMs) {
        return normalizeSlotStartIso(effectiveSlot.startsAtUtc) === normalizeSlotStartIso(draftStart)
          ? 'selected-start'
          : 'selected-range';
      }
    }

    if (this.isCoveredByConfirmedLesson(effectiveSlot.startsAtUtc)) return 'confirmed';
    return 'open';
  }

  private isReleasableStudentBooking(slot: AvailabilitySlotRow): boolean {
    const studentId = this.releaseableStudentUserId();
    if (!studentId || !slot.studentUserId) return false;
    return !slot.isAvailable && String(slot.studentUserId) === String(studentId);
  }

  private isBookingReleased(slot: AvailabilitySlotRow): boolean {
    return this.releasedBookingKeys().has(this.bookingReleaseKey(slot));
  }

  private bookingReleaseKey(slot: AvailabilitySlotRow): string {
    if (slot.slotId) return String(slot.slotId);
    return `${slot.studentUserId}|${slot.startsAtUtc}|${slot.endsAtUtc}`;
  }

  private toggleBookingRelease(releaseKey: string): void {
    const next = new Set(this.releasedBookingKeys());
    if (next.has(releaseKey)) {
      next.delete(releaseKey);
    } else {
      next.add(releaseKey);
    }
    this.releasedBookingKeys.set(next);
    this.clearDraft();
    this.selectionError.emit(null);
  }

  private isCoveredByConfirmedLesson(slotStartUtc: string): boolean {
    return this.findLessonCoveringSlot(slotStartUtc) !== null;
  }

  private findLessonCoveringSlot(slotStartUtc: string): WeekOneLessonPick | null {
    const t = new Date(slotStartUtc).getTime();
    for (const lesson of this.selectedLessons()) {
      const start = new Date(lesson.startsAtUtc).getTime();
      const end = new Date(addMinutesToIso(lesson.startsAtUtc, lesson.durationMinutes)).getTime();
      if (t >= start && t < end) return lesson;
    }
    return null;
  }

  private overlapsLocalDay(startIso: string, endIso: string, day: Date): boolean {
    const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
    const dayEnd = dayStart + 24 * 60 * 60 * 1000;
    const start = new Date(startIso).getTime();
    const end = new Date(endIso).getTime();
    return start < dayEnd && end > dayStart;
  }
}
