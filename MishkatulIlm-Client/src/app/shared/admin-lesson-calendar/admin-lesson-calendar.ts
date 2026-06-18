import { DatePipe } from '@angular/common';
import { Component, computed, effect, input, model, output, signal } from '@angular/core';
import type { AvailabilitySlotRow, WeekOneLessonPick } from '../../core/models/calendar.models';
import { lessonsOverlap } from '../../core/utils/lesson-duration';
import { addMinutesToIso, formatSlotRange } from '../../core/utils/datetime-local';
import {
  durationLabel,
  durationsFromStart,
  durationsFromManageStart,
  mergeDayAvailability,
  normalizeAvailabilityRows,
  normalizeSlotStartIso,
  SCHEDULE_DURATION_OPTIONS,
  SCHEDULE_GRID_STEP_MINUTES,
  FREE_TRIAL_DURATION_MINUTES,
  FREE_TRIAL_TITLE,
  calendarDayKeyInZone,
  utcCivilDayKeyFromCalendarDate,
  addUtcMinutesIso,
} from '../../core/utils/schedule-grid';
import { parseLessonAttendanceStatus } from '../../core/utils/attendance.util';
import { formatSlotRangeInZone, formatTimeInZone, timeZoneOffsetLabel } from '../../core/utils/timezone.util';
import {
  calendarWeekStartKeyInZone,
  dayKeyForLocalCalendarDate,
} from '../../core/utils/week-schedule.util';

export const SCHEDULE_SUB_STEP_MINUTES = 15;

export type SlotOccupancyState =
  | 'open'
  | 'booked'
  | 'booked-student'
  | 'outside-preference'
  | 'confirmed'
  | 'admin-entry';

export type SlotSelectionState = 'selected-start' | 'selected-range';

export type SlotRowKind = 'grid-30' | 'extension-15';

export interface DaySlotView {
  startsAtUtc: string;
  endsAtUtc: string;
  rowKind: SlotRowKind;
  tutorTimeLabel: string;
  studentTimeLabel: string | null;
  occupancyState: SlotOccupancyState;
  selectionState: SlotSelectionState | null;
  studentName?: string | null;
  attendanceStatus?: 'attending' | 'not_attending' | null;
  releaseKey?: string | null;
  slotId?: string | null;
  title?: string | null;
  description?: string | null;
  freeSegmentStartsAtUtc?: string | null;
  entryStartsAtUtc?: string | null;
  entryEndsAtUtc?: string | null;
}

export interface AdminCalendarSlotPick {
  slotId: string;
  startsAtUtc: string;
  endsAtUtc: string;
  title: string | null;
  description: string | null;
}

export interface AdminCalendarSlotCreate {
  startsAtUtc: string;
  durationMinutes: number;
  title: string;
  description: string | null;
}

export interface DayMonthSummary {
  available: number;
  booked: number;
  hasPicks: boolean;
}

export type DayTimelineItem =
  | { kind: 'slot'; trackId: string; slot: DaySlotView }
  | {
      kind: 'unified-block';
      trackId: string;
      slot: DaySlotView;
      timeLabel: string;
      studentTimeLabel: string | null;
      occupancyState: SlotOccupancyState;
      selectionState: SlotSelectionState | null;
      statusLabel: string;
    };

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
  /** When true, admin can add calendar entries and open existing ones. */
  readonly manageMode = input(false);
  readonly requiredSelections = input(1);
  /** When set, caps how many start-week lessons can be added (resolve flow uses a high limit). */
  readonly selectionLimit = input<number | null>(null);
  readonly selectedLessons = model<WeekOneLessonPick[]>([]);
  readonly selectionError = output<string | null>();
  readonly monthChanged = output<Date>();
  readonly adminSlotSelected = output<AdminCalendarSlotPick>();
  readonly createSlotRequested = output<AdminCalendarSlotCreate>();
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
  protected readonly draftDurationMinutes = signal<number | null>(null);
  protected readonly draftTitle = signal('');
  protected readonly draftDescription = signal('');
  protected readonly draftIsFreeTrial = signal(false);

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

  protected readonly mergedDaySlots = computed(() => {
    const day = this.selectedDay();
    if (!day) return [];
    const cellKey = dayKeyForLocalCalendarDate(day, this.tutorTimeZoneId());
    const apiSlots = this.slotsByDayKey().get(cellKey) ?? [];
    return mergeDayAvailability(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      apiSlots,
    );
  });

  protected readonly mergedEffectiveDaySlots = computed((): AvailabilitySlotRow[] => {
    const raw = this.mergedDaySlots();
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

    const tutorTz = this.tutorTimeZoneId();
    const studentTz = this.studentTimeZoneId();
    const effectiveByStart = new Map(
      this.mergedEffectiveDaySlots().map((s) => [normalizeSlotStartIso(s.startsAtUtc), s]),
    );

    const rows: DaySlotView[] = [];

    for (const rawSlot of this.mergedDaySlots()) {
      const effective =
        effectiveByStart.get(normalizeSlotStartIso(rawSlot.startsAtUtc)) ?? rawSlot;

      if (effective.isPartiallyBlocked && effective.freeSegmentStartsAtUtc) {
        const freeSlot: AvailabilitySlotRow = {
          ...effective,
          isAvailable: true,
          isPartiallyBlocked: false,
          isAdminCalendarEntry: false,
          slotId: null,
          studentUserId: null,
          studentName: null,
          title: null,
          description: null,
          entryStartsAtUtc: null,
          entryEndsAtUtc: null,
          partialBlockEndsAtUtc: null,
          freeSegmentStartsAtUtc: null,
        };
        rows.push(
          this.buildSlotView({
            startsAtUtc: effective.freeSegmentStartsAtUtc,
            endsAtUtc: effective.endsAtUtc,
            rowKind: 'extension-15',
            rawSlot: freeSlot,
            effectiveSlot: freeSlot,
            draftStart,
            draftDuration,
            tutorTz,
            studentTz,
            occupancyOverride: 'open',
          }),
        );
        continue;
      }

      const draftSplit = this.draftGridCellSplit(
        rawSlot.startsAtUtc,
        rawSlot.endsAtUtc,
        draftStart,
        draftDuration,
        effective.isAvailable,
      );
      if (draftSplit) {
        for (const segment of draftSplit) {
          const segmentSlot: AvailabilitySlotRow =
            segment.kind === 'open'
              ? {
                  ...effective,
                  isAvailable: true,
                  isPartiallyBlocked: false,
                  isAdminCalendarEntry: false,
                  slotId: null,
                  title: null,
                  description: null,
                }
              : effective;
          rows.push(
            this.buildSlotView({
              startsAtUtc: segment.startUtc,
              endsAtUtc: segment.endUtc,
              rowKind: 'extension-15',
              rawSlot: segmentSlot,
              effectiveSlot: segmentSlot,
              draftStart,
              draftDuration,
              tutorTz,
              studentTz,
              occupancyOverride: segment.kind === 'open' ? 'open' : undefined,
            }),
          );
        }
        continue;
      }

      rows.push(
        this.buildSlotView({
          startsAtUtc: rawSlot.startsAtUtc,
          endsAtUtc: rawSlot.endsAtUtc,
          rowKind: 'grid-30',
          rawSlot,
          effectiveSlot: effective,
          draftStart,
          draftDuration,
          tutorTz,
          studentTz,
        }),
      );

      const bookedExtension = this.bookedExtensionInterval(effective);
      if (bookedExtension) {
        rows.push(
          this.buildSlotView({
            startsAtUtc: bookedExtension.startUtc,
            endsAtUtc: bookedExtension.endUtc,
            rowKind: 'extension-15',
            rawSlot,
            effectiveSlot: effective,
            draftStart,
            draftDuration,
            tutorTz,
            studentTz,
            occupancyOverride: effective.isAdminCalendarEntry ? 'admin-entry' : 'booked',
          }),
        );
        continue;
      }

      const draftExtension = this.draftExtensionInterval(
        rawSlot.endsAtUtc,
        draftStart,
        draftDuration,
        effective.isAvailable,
      );
      if (draftExtension) {
        rows.push(
          this.buildSlotView({
            startsAtUtc: draftExtension.startUtc,
            endsAtUtc: draftExtension.endUtc,
            rowKind: 'extension-15',
            rawSlot,
            effectiveSlot: effective,
            draftStart,
            draftDuration,
            tutorTz,
            studentTz,
          }),
        );
      }
    }

    return rows;
  });

  protected readonly dayTimelineItems = computed((): DayTimelineItem[] => {
    const views = this.daySlotViews();
    const items: DayTimelineItem[] = [];
    let index = 0;

    while (index < views.length) {
      const blockSlots: DaySlotView[] = [views[index]];
      while (
        index + blockSlots.length < views.length &&
        this.shouldUnifyBlock(blockSlots[blockSlots.length - 1], views[index + blockSlots.length])
      ) {
        blockSlots.push(views[index + blockSlots.length]);
      }

      if (blockSlots.length > 1) {
        items.push(this.buildUnifiedBlockItem(blockSlots));
        index += blockSlots.length;
        continue;
      }

      const slot = views[index];
      items.push({ kind: 'slot', trackId: `${slot.rowKind}|${slot.startsAtUtc}`, slot });
      index++;
    }

    return items;
  });

  protected readonly draftDurationChoices = computed(() => {
    const start = this.draftStartUtc();
    if (!start) return [];
    if (this.manageMode() && !this.pickMode()) {
      return durationsFromManageStart(start, this.mergedEffectiveDaySlots());
    }
    return durationsFromStart(start, this.mergedEffectiveDaySlots());
  });

  protected readonly canConfirmDraft = computed(() => {
    const start = this.draftStartUtc();
    if (!start) return false;
    const duration = this.draftDurationMinutes();
    if (!duration || !this.draftDurationChoices().includes(duration)) return false;
    if (this.manageMode() && !this.pickMode() && !this.draftIsFreeTrial() && !this.draftTitle().trim()) {
      return false;
    }
    return true;
  });

  protected readonly draftSummaryLabel = computed(() => {
    const start = this.draftStartUtc();
    if (!start) return '';
    const duration = this.draftDurationMinutes();
    const tutorTz = this.tutorTimeZoneId();
    if (!duration) {
      const day = new Intl.DateTimeFormat('en-GB', {
        timeZone: tutorTz,
        weekday: 'short',
        month: 'short',
        day: 'numeric',
      }).format(new Date(start));
      return `${day}, ${formatTimeInZone(start, tutorTz)} — choose duration`;
    }
    const end = addMinutesToIso(start, duration);
    const tutor = formatSlotRangeInZone(start, end, tutorTz);
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

  protected canSelectFreeTrial(): boolean {
    return this.draftDurationChoices().includes(FREE_TRIAL_DURATION_MINUTES);
  }

  protected selectFreeTrialPreset(): void {
    if (!this.canSelectFreeTrial()) {
      this.selectionError.emit('This time cannot fit a 30-minute free trial.');
      return;
    }
    this.draftIsFreeTrial.set(true);
    this.draftDurationMinutes.set(FREE_TRIAL_DURATION_MINUTES);
    this.draftTitle.set(FREE_TRIAL_TITLE);
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
    const occ = slot.occupancyState;
    const sel = slot.selectionState;

    if (this.manageMode()) {
      if (occ === 'booked') return false;
      if (occ === 'admin-entry') return true;
      return (
        occ === 'open' ||
        occ === 'outside-preference' ||
        sel === 'selected-start' ||
        sel === 'selected-range'
      );
    }

    if (!this.pickMode()) return false;
    if (occ === 'booked') {
      return false;
    }
    if (occ === 'booked-student') {
      return true;
    }
    if (occ === 'confirmed') {
      return true;
    }
    if (
      this.picksRemaining() <= 0 &&
      !sel
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
      occ === 'open' ||
      occ === 'outside-preference' ||
      sel === 'selected-start' ||
      sel === 'selected-range'
    );
  }

  protected isTimelineItemClickable(item: DayTimelineItem): boolean {
    if (item.kind === 'unified-block') {
      return this.isSlotClickable(item.slot);
    }
    return this.isSlotClickable(item.slot);
  }

  protected slotStatusLabel(slot: DaySlotView): string {
    if (slot.selectionState) {
      return slot.selectionState === 'selected-start' ? 'Start' : 'Selected';
    }
    if (slot.rowKind === 'extension-15' && slot.occupancyState === 'admin-entry') {
      return '';
    }
    switch (slot.occupancyState) {
      case 'booked':
        return this.bookedSlotLabel(slot);
      case 'booked-student':
        return `${this.bookedSlotLabel(slot)} · click to free`;
      case 'outside-preference':
        return 'Outside preference';
      case 'confirmed':
        return 'In schedule';
      case 'admin-entry':
        return slot.title || 'Calendar entry';
      default:
        return 'Available';
    }
  }

  protected onSlotClick(slot: DaySlotView, _event: MouseEvent): void {
    if (this.manageMode() && slot.occupancyState === 'admin-entry' && slot.slotId) {
      this.emitAdminSlotSelected(slot);
      return;
    }

    if (slot.occupancyState === 'booked-student' && slot.releaseKey) {
      this.toggleBookingRelease(slot.releaseKey);
      return;
    }

    if (slot.occupancyState === 'confirmed') {
      const lesson = this.findLessonCoveringSlot(slot.startsAtUtc);
      if (lesson) {
        this.removeLesson(lesson);
      }
      return;
    }

    if (!this.isSlotClickable(slot) && !slot.selectionState) {
      return;
    }

    if (this.manageMode() && !this.pickMode()) {
      const draft = this.draftStartUtc();
      if (draft && normalizeSlotStartIso(draft) === normalizeSlotStartIso(slot.startsAtUtc)) {
        this.clearDraft();
        return;
      }

      this.beginDraftAt(slot.startsAtUtc);
      return;
    }

    const draft = this.draftStartUtc();
    if (draft && normalizeSlotStartIso(draft) === normalizeSlotStartIso(slot.startsAtUtc)) {
      this.clearDraft();
      return;
    }

    this.beginDraftAt(slot.startsAtUtc);
  }

  protected onDurationPick(minutes: number): void {
    if (!this.draftDurationChoices().includes(minutes)) return;
    this.draftIsFreeTrial.set(false);
    if (this.draftTitle() === FREE_TRIAL_TITLE) {
      this.draftTitle.set('');
    }
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
    if (!durationMinutes) {
      this.selectionError.emit('Choose a duration for this lesson.');
      return;
    }
    if (!this.canConfirmDraft()) {
      if (this.manageMode() && !this.draftTitle().trim()) {
        this.selectionError.emit('Enter a title for this calendar entry.');
        return;
      }
      this.selectionError.emit('That duration is not available for the selected start time.');
      return;
    }

    if (this.manageMode() && !this.pickMode()) {
      this.createSlotRequested.emit({
        startsAtUtc,
        durationMinutes,
        title: this.draftTitle().trim(),
        description: this.draftDescription().trim() || null,
      });
      this.clearDraft();
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
    this.clearDraftFields();
    this.draftIsFreeTrial.set(false);
    this.selectionError.emit(null);
  }

  private clearDraftFields(): void {
    this.draftStartUtc.set(null);
    this.draftDurationMinutes.set(null);
    this.draftTitle.set('');
    this.draftDescription.set('');
  }

  protected removeLesson(lesson: WeekOneLessonPick): void {
    this.selectedLessons.set(
      this.selectedLessons().filter((l) => l.startsAtUtc !== lesson.startsAtUtc),
    );
    this.selectionError.emit(null);
  }

  private buildUnifiedBlockItem(slots: DaySlotView[]): DayTimelineItem {
    const first = slots[0];
    const last = slots[slots.length - 1];
    const selectionState = first.selectionState ?? last.selectionState;
    const rangeStart = selectionState
      ? first.startsAtUtc
      : (first.entryStartsAtUtc ?? first.startsAtUtc);
    const rangeEnd = selectionState
      ? last.endsAtUtc
      : (last.entryEndsAtUtc ?? last.endsAtUtc);
    const tutorTz = this.tutorTimeZoneId();
    const studentTz = this.studentTimeZoneId();

    return {
      kind: 'unified-block',
      trackId: `unified|${first.slotId ?? rangeStart}|${rangeEnd}`,
      slot: first,
      timeLabel: formatSlotRangeInZone(rangeStart, rangeEnd, tutorTz),
      studentTimeLabel: studentTz
        ? formatSlotRangeInZone(rangeStart, rangeEnd, studentTz)
        : null,
      occupancyState: first.occupancyState,
      selectionState,
      statusLabel: this.unifiedBlockStatusLabel(first, selectionState),
    };
  }

  private unifiedBlockStatusLabel(
    gridSlot: DaySlotView,
    selectionState: SlotSelectionState | null,
  ): string {
    if (selectionState) {
      return selectionState === 'selected-start' ? 'Start' : 'Selected';
    }
    if (gridSlot.occupancyState === 'admin-entry') {
      return gridSlot.title || 'Calendar entry';
    }
    if (gridSlot.occupancyState === 'booked') {
      return this.bookedSlotLabel(gridSlot);
    }
    return '';
  }

  private shouldUnifyBlock(current: DaySlotView, next: DaySlotView): boolean {
    if (normalizeSlotStartIso(current.endsAtUtc) !== normalizeSlotStartIso(next.startsAtUtc)) {
      return false;
    }

    const bookedOccupancy =
      current.occupancyState === 'admin-entry' || current.occupancyState === 'booked';
    if (
      bookedOccupancy &&
      current.occupancyState === next.occupancyState &&
      current.slotId &&
      current.slotId === next.slotId
    ) {
      return true;
    }

    if (
      current.occupancyState === 'open' &&
      next.occupancyState === 'open' &&
      current.selectionState &&
      next.selectionState
    ) {
      return true;
    }

    return false;
  }

  private draftGridCellSplit(
    cellStartUtc: string,
    cellEndUtc: string,
    draftStart: string | null,
    draftDurationMinutes: number | null,
    isAvailable: boolean,
  ): { startUtc: string; endUtc: string; kind: 'selected' | 'open' }[] | null {
    if (!draftStart || !draftDurationMinutes || !isAvailable) {
      return null;
    }

    const cellStartMs = new Date(cellStartUtc).getTime();
    const cellEndMs = new Date(cellEndUtc).getTime();
    const draftStartMs = new Date(draftStart).getTime();
    const draftEndMs = draftStartMs + draftDurationMinutes * 60 * 1000;

    if (draftEndMs <= cellStartMs || draftStartMs >= cellEndMs) {
      return null;
    }

    const overlapStartMs = Math.max(cellStartMs, draftStartMs);
    const overlapEndMs = Math.min(cellEndMs, draftEndMs);

    if (overlapStartMs <= cellStartMs && overlapEndMs >= cellEndMs) {
      return null;
    }

    const segments: { startUtc: string; endUtc: string; kind: 'selected' | 'open' }[] = [];

    if (overlapStartMs > cellStartMs) {
      segments.push({
        startUtc: normalizeSlotStartIso(cellStartUtc),
        endUtc: normalizeSlotStartIso(new Date(overlapStartMs).toISOString()),
        kind: 'open',
      });
    }

    if (overlapEndMs > overlapStartMs) {
      segments.push({
        startUtc: normalizeSlotStartIso(new Date(overlapStartMs).toISOString()),
        endUtc: normalizeSlotStartIso(new Date(overlapEndMs).toISOString()),
        kind: 'selected',
      });
    }

    if (overlapEndMs < cellEndMs) {
      segments.push({
        startUtc: normalizeSlotStartIso(new Date(overlapEndMs).toISOString()),
        endUtc: normalizeSlotStartIso(cellEndUtc),
        kind: 'open',
      });
    }

    return segments.length > 1 ? segments : null;
  }

  private buildSlotView(args: {
    startsAtUtc: string;
    endsAtUtc: string;
    rowKind: SlotRowKind;
    rawSlot: AvailabilitySlotRow;
    effectiveSlot: AvailabilitySlotRow;
    draftStart: string | null;
    draftDuration: number | null;
    tutorTz: string;
    studentTz: string | null;
    occupancyOverride?: SlotOccupancyState;
  }): DaySlotView {
    const {
      startsAtUtc,
      endsAtUtc,
      rowKind,
      rawSlot,
      effectiveSlot,
      draftStart,
      draftDuration,
      tutorTz,
      studentTz,
      occupancyOverride,
    } = args;

    const occupancy =
      occupancyOverride ?? this.slotOccupancyState(rawSlot, effectiveSlot, startsAtUtc);

    return {
      startsAtUtc,
      endsAtUtc,
      rowKind,
      tutorTimeLabel: formatSlotRangeInZone(startsAtUtc, endsAtUtc, tutorTz),
      studentTimeLabel: studentTz
        ? formatSlotRangeInZone(startsAtUtc, endsAtUtc, studentTz)
        : null,
      occupancyState: occupancy,
      selectionState: this.slotSelectionStateForInterval(
        startsAtUtc,
        endsAtUtc,
        effectiveSlot,
        occupancy,
        draftStart,
        draftDuration,
      ),
      studentName: rawSlot.studentName,
      attendanceStatus: rawSlot.studentUserId
        ? parseLessonAttendanceStatus(rawSlot.attendanceStatus)
        : null,
      releaseKey: this.isReleasableStudentBooking(rawSlot)
        ? this.bookingReleaseKey(rawSlot)
        : null,
      slotId: rawSlot.slotId ?? null,
      title: rawSlot.title ?? null,
      description: rawSlot.description ?? null,
      freeSegmentStartsAtUtc: rawSlot.freeSegmentStartsAtUtc ?? null,
      entryStartsAtUtc: rawSlot.entryStartsAtUtc ?? null,
      entryEndsAtUtc: rawSlot.entryEndsAtUtc ?? null,
    };
  }

  private bookedExtensionInterval(
    effective: AvailabilitySlotRow,
  ): { startUtc: string; endUtc: string } | null {
    if (effective.isPartiallyBlocked || effective.isAvailable) {
      return null;
    }
    const entryEnd = effective.entryEndsAtUtc;
    if (!entryEnd) {
      return null;
    }
    const cellEndMs = new Date(effective.endsAtUtc).getTime();
    const entryEndMs = new Date(entryEnd).getTime();
    const tailEndMs = cellEndMs + SCHEDULE_SUB_STEP_MINUTES * 60 * 1000;
    if (entryEndMs <= cellEndMs || entryEndMs > tailEndMs) {
      return null;
    }
    return {
      startUtc: effective.endsAtUtc,
      endUtc: normalizeSlotStartIso(entryEnd),
    };
  }

  private draftExtensionInterval(
    cellEndUtc: string,
    draftStart: string | null,
    draftDurationMinutes: number | null,
    isAvailable: boolean,
  ): { startUtc: string; endUtc: string } | null {
    if (!draftStart || !draftDurationMinutes || !isAvailable) {
      return null;
    }
    const cellEndMs = new Date(cellEndUtc).getTime();
    const draftStartMs = new Date(draftStart).getTime();
    const draftEndMs = draftStartMs + draftDurationMinutes * 60 * 1000;
    const tailEndMs = cellEndMs + SCHEDULE_SUB_STEP_MINUTES * 60 * 1000;
    if (draftEndMs <= cellEndMs || draftEndMs > tailEndMs || draftStartMs >= tailEndMs) {
      return null;
    }
    return {
      startUtc: cellEndUtc,
      endUtc: addUtcMinutesIso(cellEndUtc, SCHEDULE_SUB_STEP_MINUTES),
    };
  }

  private slotOccupancyState(
    rawSlot: AvailabilitySlotRow,
    effectiveSlot: AvailabilitySlotRow,
    startsAtUtc: string,
  ): SlotOccupancyState {
    if (this.isReleasableStudentBooking(rawSlot) && !this.isBookingReleased(rawSlot)) {
      return 'booked-student';
    }
    if (effectiveSlot.isAdminCalendarEntry) return 'admin-entry';
    if (!effectiveSlot.isAvailable) return 'booked';
    if (
      this.isCoveredByConfirmedLesson(startsAtUtc) ||
      this.isCoveredByConfirmedLesson(effectiveSlot.startsAtUtc)
    ) {
      return 'confirmed';
    }
    if (effectiveSlot.matchesStudentPreference === false) return 'outside-preference';
    return 'open';
  }

  private slotSelectionStateForInterval(
    intervalStartUtc: string,
    intervalEndUtc: string,
    effectiveSlot: AvailabilitySlotRow,
    occupancy: SlotOccupancyState,
    draftStart: string | null,
    draftDurationMinutes: number | null,
  ): SlotSelectionState | null {
    if (!draftStart) {
      return null;
    }
    if (occupancy === 'booked' || occupancy === 'admin-entry' || occupancy === 'booked-student') {
      return null;
    }

    if (!draftDurationMinutes || draftDurationMinutes <= 0) {
      if (normalizeSlotStartIso(intervalStartUtc) === normalizeSlotStartIso(draftStart)) {
        return 'selected-start';
      }
      return null;
    }

    const intervalStartMs = new Date(intervalStartUtc).getTime();
    const intervalEndMs = new Date(intervalEndUtc).getTime();
    const draftStartMs = new Date(draftStart).getTime();
    const draftEndMs = draftStartMs + draftDurationMinutes * 60 * 1000;

    if (draftEndMs <= intervalStartMs || draftStartMs >= intervalEndMs) {
      return null;
    }
    if (draftStartMs > intervalStartMs || draftEndMs < intervalEndMs) {
      return null;
    }

    void effectiveSlot;
    if (normalizeSlotStartIso(intervalStartUtc) === normalizeSlotStartIso(draftStart)) {
      return 'selected-start';
    }
    return 'selected-range';
  }

  private beginDraftAt(startUtc: string): void {
    this.draftIsFreeTrial.set(false);
    this.draftStartUtc.set(startUtc);
    this.draftDurationMinutes.set(null);
    if (this.manageMode() && !this.pickMode()) {
      this.draftTitle.set('');
      this.draftDescription.set('');
    }
    this.selectionError.emit(null);
  }

  private emitAdminSlotSelected(slot: DaySlotView): void {
    if (!slot.slotId) return;
    this.adminSlotSelected.emit({
      slotId: slot.slotId,
      startsAtUtc: slot.entryStartsAtUtc ?? slot.startsAtUtc,
      endsAtUtc: slot.entryEndsAtUtc ?? slot.endsAtUtc,
      title: slot.title ?? null,
      description: slot.description ?? null,
    });
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
