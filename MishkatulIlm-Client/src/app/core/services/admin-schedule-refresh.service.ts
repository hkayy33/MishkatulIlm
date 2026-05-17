import { Injectable } from '@angular/core';
import { Subject } from 'rxjs';

export interface AdminScheduleChangedEvent {
  studentUserId?: string;
}

/** Notifies admin views to reload calendar and student lesson data after schedule changes. */
@Injectable({ providedIn: 'root' })
export class AdminScheduleRefreshService {
  private readonly changed = new Subject<AdminScheduleChangedEvent>();

  readonly scheduleChanged$ = this.changed.asObservable();

  notifyScheduleChanged(studentUserId?: string): void {
    this.changed.next({ studentUserId });
  }
}
