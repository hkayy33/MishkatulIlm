import { DatePipe } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import type { StudentLessonRow } from '../../core/models/student-portal.models';
import { formatSlotRangeInZone } from '../../core/utils/timezone.util';

@Component({
  selector: 'app-student-lesson-calendar',
  standalone: true,
  imports: [DatePipe],
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

  protected readonly viewMonth = signal(this.startOfMonth(new Date()));
  protected readonly selectedDay = signal<Date | null>(null);

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
    const map = new Map<string, StudentLessonRow[]>();
    for (const lesson of this.lessons()) {
      const key = this.dayKey(new Date(lesson.startsAtUtc));
      const list = map.get(key) ?? [];
      list.push(lesson);
      map.set(key, list);
    }
    return map;
  });

  protected readonly selectedDayLessons = computed(() => {
    const day = this.selectedDay();
    if (!day) return [];
    return [...(this.lessonsByDay().get(this.dayKey(day)) ?? [])].sort((a, b) =>
      a.startsAtUtc.localeCompare(b.startsAtUtc),
    );
  });

  protected lessonCount(date: Date): number {
    return this.lessonsByDay().get(this.dayKey(date))?.length ?? 0;
  }

  protected prevMonth(): void {
    const d = this.viewMonth();
    const next = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    this.viewMonth.set(next);
    this.selectedDay.set(null);
    this.monthChanged.emit(next);
  }

  protected nextMonth(): void {
    const d = this.viewMonth();
    const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
    this.viewMonth.set(next);
    this.selectedDay.set(null);
    this.monthChanged.emit(next);
  }

  protected selectDay(date: Date): void {
    this.selectedDay.set(date);
  }

  protected formatLesson(lesson: StudentLessonRow): string {
    return formatSlotRangeInZone(lesson.startsAtUtc, lesson.endsAtUtc, this.timeZoneId());
  }

  protected setAttendance(lesson: StudentLessonRow, attending: boolean): void {
    const status = attending ? 'attending' : 'not_attending';
    if (lesson.attendanceStatus === status) return;
    this.attendanceChange.emit({ slotId: lesson.slotId, status });
  }

  protected toggleAttendance(lesson: StudentLessonRow): void {
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

  private dayKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  private startOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), 1);
  }
}
