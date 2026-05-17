import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { StudentLessonRow } from '../../core/models/student-portal.models';
import {
  addCalendarDays,
  calendarDayKeyInZone,
  dayKeyForLocalCalendarDate,
  formatWeekRangeLabel,
  isSameCalendarDay,
  isToday,
  startOfWeekMonday,
  weekDayDates,
} from '../../core/utils/week-schedule.util';

export interface WeekDayCell {
  date: Date;
  dayKey: string;
  weekdayLabel: string;
  dayNum: number;
  isToday: boolean;
  lessonCount: number;
}

@Component({
  selector: 'app-student-week-schedule',
  standalone: true,
  imports: [FormsModule],
  templateUrl: './student-week-schedule.html',
  styleUrl: './student-week-schedule.scss',
})
export class StudentWeekSchedule {
  readonly lessons = input<StudentLessonRow[]>([]);
  readonly loading = input(false);
  readonly timeZoneId = input('UTC');
  readonly updatingSlotId = input<string | null>(null);
  readonly weekStart = input<Date>(startOfWeekMonday(new Date()));

  readonly weekChanged = output<Date>();
  readonly attendanceChange = output<{ slotId: string; status: 'attending' | 'not_attending' }>();
  readonly lessonNoteChange = output<{ slotId: string; note: string }>();

  protected readonly selectedDay = signal<Date | null>(null);
  protected readonly selectedLessonId = signal<string | null>(null);
  protected readonly expandedNoteLessonIds = signal<ReadonlySet<string>>(new Set());
  protected readonly noteDraft = signal('');

  protected readonly weekStartDate = computed(() => startOfWeekMonday(this.weekStart()));

  protected readonly weekRangeLabel = computed(() => formatWeekRangeLabel(this.weekStartDate()));

  protected readonly lessonsByDayKey = computed(() => {
    const tz = this.timeZoneId();
    const map = new Map<string, StudentLessonRow[]>();
    for (const lesson of this.lessons()) {
      const key = calendarDayKeyInZone(lesson.startsAtUtc, tz);
      const list = map.get(key) ?? [];
      list.push(lesson);
      map.set(key, list);
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startsAtUtc.localeCompare(b.startsAtUtc));
    }
    return map;
  });

  protected readonly weekDays = computed((): WeekDayCell[] => {
    const start = this.weekStartDate();
    const byKey = this.lessonsByDayKey();
    const tz = this.timeZoneId();
    return weekDayDates(start).map((date) => {
      const dayKey = dayKeyForLocalCalendarDate(date, tz);
      const lessonsForDay = byKey.get(dayKey) ?? [];
      return {
        date,
        dayKey,
        weekdayLabel: date.toLocaleDateString('en-GB', { weekday: 'short' }),
        dayNum: date.getDate(),
        isToday: isToday(date),
        lessonCount: lessonsForDay.length,
      };
    });
  });

  protected readonly selectedDayLessons = computed(() => {
    const day = this.selectedDay();
    if (!day) return [];
    const key = dayKeyForLocalCalendarDate(day, this.timeZoneId());
    return [...(this.lessonsByDayKey().get(key) ?? [])];
  });

  protected readonly selectedDayLabel = computed(() => {
    const day = this.selectedDay();
    if (!day) return '';
    return day.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  });

  constructor() {
    let lastWeekStartMs = -1;
    effect(() => {
      const weekMs = this.weekStartDate().getTime();
      if (lastWeekStartMs >= 0 && weekMs !== lastWeekStartMs) {
        this.expandedNoteLessonIds.set(new Set());
      }
      lastWeekStartMs = weekMs;
    });

    effect(() => {
      this.weekStart();
      const days = this.weekDays();
      const current = this.selectedDay();
      if (current && days.some((d) => isSameCalendarDay(d.date, current))) return;
      const todayCell = days.find((d) => d.isToday);
      const withLessons = days.find((d) => d.lessonCount > 0);
      this.selectedDay.set(todayCell?.date ?? withLessons?.date ?? days[0]?.date ?? null);
    });

    effect(() => {
      const lessons = this.selectedDayLessons();
      const selectedId = this.selectedLessonId();
      if (selectedId && lessons.some((l) => l.slotId === selectedId)) return;
      this.selectedLessonId.set(lessons[0]?.slotId ?? null);
    });

    effect(() => {
      const id = this.selectedLessonId();
      const lesson = this.lessons().find((l) => l.slotId === id);
      this.noteDraft.set(lesson?.studentNote ?? '');
    });
  }

  protected prevWeek(): void {
    this.weekChanged.emit(addCalendarDays(this.weekStartDate(), -7));
  }

  protected nextWeek(): void {
    this.weekChanged.emit(addCalendarDays(this.weekStartDate(), 7));
  }

  protected selectDay(date: Date): void {
    this.selectedDay.set(date);
    this.selectedLessonId.set(null);
    this.expandedNoteLessonIds.set(new Set());
  }

  protected isSelected(date: Date): boolean {
    const selected = this.selectedDay();
    return selected !== null && isSameCalendarDay(selected, date);
  }

  protected selectLesson(lesson: StudentLessonRow, event: Event): void {
    event.stopPropagation();
    this.selectedLessonId.set(lesson.slotId);
    this.noteDraft.set(lesson.studentNote ?? '');
  }

  protected isLessonSelected(lesson: StudentLessonRow): boolean {
    return this.selectedLessonId() === lesson.slotId;
  }

  protected hasNote(lesson: StudentLessonRow): boolean {
    return Boolean(lesson.studentNote?.trim());
  }

  protected isNoteExpanded(slotId: string): boolean {
    return this.expandedNoteLessonIds().has(slotId);
  }

  protected toggleNote(lesson: StudentLessonRow, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const id = lesson.slotId;
    if (this.expandedNoteLessonIds().has(id)) {
      this.expandedNoteLessonIds.set(new Set());
      return;
    }
    this.expandedNoteLessonIds.set(new Set([id]));
    this.selectedLessonId.set(id);
    this.noteDraft.set(lesson.studentNote ?? '');
  }

  protected saveNote(lesson: StudentLessonRow, event: Event): void {
    event.stopPropagation();
    this.lessonNoteChange.emit({ slotId: lesson.slotId, note: this.noteDraft() });
  }

  protected formatLessonTime(lesson: StudentLessonRow): string {
    const start = new Date(lesson.startsAtUtc);
    const end = new Date(lesson.endsAtUtc);
    const tz = this.timeZoneId();
    const fmt = (d: Date) =>
      new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      }).format(d);
    return `${fmt(start)}–${fmt(end)}`;
  }

  protected isPast(lesson: StudentLessonRow): boolean {
    return new Date(lesson.endsAtUtc).getTime() < Date.now();
  }

  protected attendanceLabel(lesson: StudentLessonRow): string {
    if (lesson.attendanceStatus === 'not_attending') {
      return this.isPast(lesson) ? 'Did not attend' : 'Cannot attend';
    }
    return this.isPast(lesson) ? 'Attended' : 'Attending';
  }

  protected toggleAttendance(lesson: StudentLessonRow, event: Event): void {
    event.stopPropagation();
    const status = lesson.attendanceStatus === 'not_attending' ? 'attending' : 'not_attending';
    this.attendanceChange.emit({ slotId: lesson.slotId, status });
  }

  protected toggleAttendanceLabel(lesson: StudentLessonRow): string {
    if (this.updatingSlotId() === lesson.slotId) return 'Saving…';
    return lesson.attendanceStatus === 'not_attending' ? 'Mark as attending' : 'Cannot attend';
  }
}
