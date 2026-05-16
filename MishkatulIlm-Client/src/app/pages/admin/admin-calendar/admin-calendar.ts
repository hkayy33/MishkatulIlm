import { Component, computed, signal } from '@angular/core';

@Component({
  selector: 'app-admin-calendar',
  standalone: true,
  imports: [],
  templateUrl: './admin-calendar.html',
  styleUrl: './admin-calendar.scss',
})
export class AdminCalendar {
  /** Month being viewed (local). */
  protected readonly viewMonth = signal(new Date(new Date().getFullYear(), new Date().getMonth(), 1));

  protected readonly monthLabel = computed(() => {
    const d = this.viewMonth();
    return d.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  });

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

  prevMonth(): void {
    const d = this.viewMonth();
    this.viewMonth.set(new Date(d.getFullYear(), d.getMonth() - 1, 1));
  }

  nextMonth(): void {
    const d = this.viewMonth();
    this.viewMonth.set(new Date(d.getFullYear(), d.getMonth() + 1, 1));
  }
}
