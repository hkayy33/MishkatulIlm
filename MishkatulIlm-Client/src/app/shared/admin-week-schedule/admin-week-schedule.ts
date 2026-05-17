import { Component, computed, effect, input, output, signal } from '@angular/core';
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

export interface AdminWeekLesson {
  id: string;
  startsAtUtc: string;
  endsAtUtc: string;
  studentName: string;
  subjectLabels: string[];
  studentLessonNote?: string | null;
  attendanceStatus: 'attending' | 'not_attending';
}

export interface AdminWeekDayCell {
  date: Date;
  dayKey: string;
  weekdayLabel: string;
  dayNum: number;
  isToday: boolean;
  lessonCount: number;
}

@Component({
  selector: 'app-admin-week-schedule',
  standalone: true,
  templateUrl: './admin-week-schedule.html',
  styleUrl: './admin-week-schedule.scss',
})
export class AdminWeekSchedule {
  readonly lessons = input<AdminWeekLesson[]>([]);
  readonly loading = input(false);
  readonly timeZoneId = input('UTC');
  readonly weekStart = input<Date>(startOfWeekMonday(new Date()));

  readonly weekChanged = output<Date>();

  protected readonly selectedDay = signal<Date | null>(null);
  protected readonly selectedLessonId = signal<string | null>(null);
  /** Exposed for template bindings so expansion updates re-render reliably. */
  protected readonly expandedSubjectLessonIds = signal<ReadonlySet<string>>(new Set());
  protected readonly expandedNoteLessonIds = signal<ReadonlySet<string>>(new Set());

  protected readonly weekStartDate = computed(() => startOfWeekMonday(this.weekStart()));

  protected readonly weekRangeLabel = computed(() => formatWeekRangeLabel(this.weekStartDate()));

  protected readonly lessonsByDayKey = computed(() => {
    const tz = this.timeZoneId();
    const map = new Map<string, AdminWeekLesson[]>();
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

  protected readonly weekDays = computed((): AdminWeekDayCell[] => {
    const start = this.weekStartDate();
    const byKey = this.lessonsByDayKey();
    const tz = this.timeZoneId();
    return weekDayDates(start).map((date) => {
      const dayKey = dayKeyForLocalCalendarDate(date, tz);
      return {
        date,
        dayKey,
        weekdayLabel: date.toLocaleDateString('en-GB', { weekday: 'short' }),
        dayNum: date.getDate(),
        isToday: isToday(date),
        lessonCount: byKey.get(dayKey)?.length ?? 0,
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

  protected readonly selectedLesson = computed(() => {
    const id = this.selectedLessonId();
    if (!id) return null;
    return this.selectedDayLessons().find((l) => l.id === id) ?? null;
  });

  constructor() {
    let lastWeekStartMs = -1;
    effect(() => {
      const weekMs = this.weekStartDate().getTime();
      if (lastWeekStartMs >= 0 && weekMs !== lastWeekStartMs) {
        this.expandedSubjectLessonIds.set(new Set());
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
      if (selectedId && lessons.some((l) => l.id === selectedId)) return;
      this.selectedLessonId.set(lessons[0]?.id ?? null);
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

  protected selectLesson(lesson: AdminWeekLesson, event: Event): void {
    event.stopPropagation();
    this.selectedLessonId.set(lesson.id);
  }

  protected isLessonSelected(lesson: AdminWeekLesson): boolean {
    return this.selectedLessonId() === lesson.id;
  }

  protected hasNote(lesson: AdminWeekLesson): boolean {
    return Boolean(lesson.studentLessonNote?.trim());
  }

  protected isSelected(date: Date): boolean {
    const selected = this.selectedDay();
    return selected !== null && isSameCalendarDay(selected, date);
  }

  protected formatLessonTime(lesson: AdminWeekLesson): string {
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

  protected isPast(lesson: AdminWeekLesson): boolean {
    return new Date(lesson.endsAtUtc).getTime() < Date.now();
  }

  protected attendanceLabel(lesson: AdminWeekLesson): string {
    if (lesson.attendanceStatus === 'not_attending') {
      return this.isPast(lesson) ? 'Did not attend' : 'Not attending';
    }
    return this.isPast(lesson) ? 'Attended' : 'Attending';
  }

  protected isSubjectsExpanded(lessonId: string): boolean {
    return this.expandedSubjectLessonIds().has(lessonId);
  }

  protected toggleSubjects(lessonId: string, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    const next = new Set(this.expandedSubjectLessonIds());
    if (next.has(lessonId)) next.delete(lessonId);
    else next.add(lessonId);
    this.expandedSubjectLessonIds.set(next);
  }

  protected toggleNote(lesson: AdminWeekLesson, event: Event): void {
    event.stopPropagation();
    event.preventDefault();
    this.selectedLessonId.set(lesson.id);
    const next = new Set(this.expandedNoteLessonIds());
    if (next.has(lesson.id)) next.delete(lesson.id);
    else next.add(lesson.id);
    this.expandedNoteLessonIds.set(next);
  }

}
