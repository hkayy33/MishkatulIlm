import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../tokens/api-base-url.token';

export interface AdminUserRow {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  onboardingCompleted: boolean;
  createdAtUtc: string;
}

export interface AdminStudentRow {
  userId: string;
  email: string;
  firstName: string;
  lastName: string;
  ageRange: string;
  gender: string;
  currentLevel: string;
  lessonFrequency: string;
  subjectCodes: string[];
  preferredAvailability: string[];
}

export interface AdminCreateUserBody {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  isAdmin?: boolean;
}

@Injectable({ providedIn: 'root' })
export class AdminApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  private base(path: string): string {
    return `${this.apiBaseUrl}/api/admin${path}`;
  }

  listUsers(): Observable<AdminUserRow[]> {
    return this.http.get<AdminUserRow[]>(this.base('/users'));
  }

  listPendingApplications(): Observable<AdminUserRow[]> {
    return this.http.get<AdminUserRow[]>(this.base('/applications/pending'));
  }

  listStudents(): Observable<AdminStudentRow[]> {
    return this.http.get<AdminStudentRow[]>(this.base('/students'));
  }

  createUser(body: AdminCreateUserBody): Observable<{ userId: string }> {
    return this.http.post<{ userId: string }>(this.base('/users'), body);
  }
}
