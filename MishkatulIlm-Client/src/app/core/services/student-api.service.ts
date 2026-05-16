import { HttpClient, HttpParams } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';
import type {
  LessonAttendanceStatus,
  StudentLessonRow,
  StudentPortalResponse,
} from '../models/student-portal.models';

@Injectable({ providedIn: 'root' })
export class StudentApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  getPortal(year: number, monthIndex: number): Observable<StudentPortalResponse> {
    const params = new HttpParams()
      .set('year', String(year))
      .set('month', String(monthIndex + 1));
    return this.http.get<StudentPortalResponse>(`${this.apiBaseUrl}/api/student/portal`, { params });
  }

  updateAttendance(slotId: string, attendanceStatus: LessonAttendanceStatus): Observable<StudentLessonRow> {
    return this.http.patch<StudentLessonRow>(
      `${this.apiBaseUrl}/api/student/lessons/${slotId}/attendance`,
      { attendanceStatus },
    );
  }

  requestScheduleChange(note: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(
      `${this.apiBaseUrl}/api/student/schedule-change-request`,
      { note },
    );
  }

  deleteAccount(): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(`${this.apiBaseUrl}/api/student/delete-account`, {
      confirmation: 'DELETE',
    });
  }
}
