import { DatePipe } from '@angular/common';
import { Component, computed, effect, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { StudentLessonRow } from '../../core/models/student-portal.models';
import { calendarDayKeyInZone } from '../../core/utils/schedule-grid';
import { calendarDayKeyFromDate } from '../../core/utils/week-schedule.util';
import { formatSlotRangeInZone } from '../../core/utils/timezone.util';

@Component({
  selector: 'app-student-lesson-calendar',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './student-lesson-calendar.html',
  styleUrl: './student-lesson-calendar.scss',
})
export class StudentLessonCalendar {
  readonly lessons = input<StudentLessonRow[]>([]);
  readonly loading = input(false);
  readonly timeZoneId = input('UTC');
  readonly updatingSlotId = input<string | null>(null);

  readonly monthChanged = output<Date>();
  readonly attendanceChange = output<{ slotId: string; status: 'attending' | 'not_attending' }>();
  readonly lessonNoteChange = output<{ slotId: string; note: string }>();

  protected readonly viewMonth = signal(this.startOfMonth(new Date()));
  protected readonly selectedDay = signal<Date | null>(null);
  protected readonly selectedLessonId = signal<string | null>(null);
  protected readonly expandedNoteLessonIds = signal<ReadonlySet<string>>(new Set());
  protected readonly noteDraft = signal('');

  protected readonly monthLabel = computed(() =>
    this.viewMonth().toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  );

  protected readonly grid = computed(() => {
    const start = this.viewMonth();
    const year = start.getFullYear();
    const month = start.getMonth();
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: { date: Date | null }[] = [];
    for (let i = 0; i < firstDow; i++) cells.push({ date: null });
    for (let day = 1; day <= daysInMonth; day++) {
      cells.push({ date: new Date(year, month, day) });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null });
    return cells;
  });

  protected readonly lessonsByDay = computed(() => {
    const tz = this.timeZoneId();
    const map = new Map<string, StudentLessonRow[]>();
    for (const lesson of this.lessons()) {
      const key = calendarDayKeyInZone(lesson.startsAtUtc, tz);
      const list = map.get(key) ?? [];
      list.push(lesson);
      map.set(key, list);
    }
    return map;
  });

  protected readonly selectedDayLessons = computed(() => {
    const day = this.selectedDay();
    if (!day) return [];
    const cellKey = calendarDayKeyFromDate(day);
    return [...(this.lessonsByDay().get(cellKey) ?? [])].sort((a, b) =>
      a.startsAtUtc.localeCompare(b.startsAtUtc),
    );
  });

  constructor() {
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

  protected lessonCount(date: Date): number {
    return this.lessonsByDay().get(calendarDayKeyFromDate(date))?.length ?? 0;
  }

  protected prevMonth(): void {
    const d = this.viewMonth();
    const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    this.viewMonth.set(next);
    this.selectedDay.set(null);
    this.selectedLessonId.set(null);
    this.expandedNoteLessonIds.set(new Set());
    this.monthChanged.emit(next);
  }

  protected nextMonth(): void {
    const d = this.viewMonth();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    this.viewMonth.set(next);
    this.selectedDay.set(null);
    this.selectedLessonId.set(null);
    this.expandedNoteLessonIds.set(new Set());
    this.monthChanged.emit(next);
  }

  protected selectDay(date: Date): void {
    this.selectedDay.set(date);
    this.selectedLessonId.set(null);
    this.expandedNoteLessonIds.set(new Set());
  }

  protected selectLesson(lesson: StudentLessonRow): void {
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

  protected formatLesson(lesson: StudentLessonRow): string {
    return formatSlotRangeInZone(lesson.startsAtUtc, lesson.endsAtUtc, this.timeZoneId());
  }

  protected setAttendance(lesson: StudentLessonRow, attending: boolean, event?: Event): void {
    event?.stopPropagation();
    const status = attending ? 'attending' : 'not_attending';
    if (lesson.attendanceStatus === status) return;
    this.attendanceChange.emit({ slotId: lesson.slotId, status });
  }

  protected toggleAttendance(lesson: StudentLessonRow, event: Event): void {
    event.stopPropagation();
    this.setAttendance(lesson, lesson.attendanceStatus !== 'attending');
  }

  protected attendanceLabel(lesson: StudentLessonRow): string {
    if (lesson.attendanceStatus === 'not_attending') {
      return this.isPast(lesson) ? 'Did not attend' : 'Cannot attend';
    }
    return this.isPast(lesson) ? 'Attended' : 'Attending';
  }

  protected toggleAttendanceLabel(lesson: StudentLessonRow): string {
    if (this.updatingSlotId() === lesson.slotId) return 'Saving…';
    return lesson.attendanceStatus === 'not_attending' ? 'Mark as attending' : 'Cannot attend';
  }

  protected isPast(lesson: StudentLessonRow): boolean {
    return new Date(lesson.endsAtUtc).getTime() < Date.now();
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
}
