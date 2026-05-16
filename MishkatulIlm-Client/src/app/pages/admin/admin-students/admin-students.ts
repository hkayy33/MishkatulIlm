import { DatePipe } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AdminApiService, type AdminStudentRow, type AdminUserRow } from '../../../core/services/admin-api.service';

@Component({
  selector: 'app-admin-students',
  standalone: true,
  imports: [DatePipe, FormsModule],
  templateUrl: './admin-students.html',
  styleUrl: './admin-students.scss',
})
export class AdminStudents {
  private readonly adminApi = inject(AdminApiService);

  protected readonly users = signal<AdminUserRow[]>([]);
  protected readonly students = signal<AdminStudentRow[]>([]);
  protected readonly loadError = signal<string | null>(null);
  protected readonly createError = signal<string | null>(null);
  protected readonly createOk = signal<string | null>(null);
  protected readonly loading = signal(true);
  protected readonly creating = signal(false);

  protected createEmail = '';
  protected createPassword = '';
  protected createFirst = '';
  protected createLast = '';
  protected createIsAdmin = false;

  constructor() {
    this.reload();
  }

  reload(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.adminApi.listUsers().subscribe({
      next: (list) => {
        this.users.set(list);
        this.adminApi.listStudents().subscribe({
          next: (s) => {
            this.students.set(s);
            this.loading.set(false);
          },
          error: () => {
            this.loadError.set('Could not load students.');
            this.loading.set(false);
          },
        });
      },
      error: () => {
        this.loadError.set('Could not load users.');
        this.loading.set(false);
      },
    });
  }

  onCreateSubmit(event: Event): void {
    event.preventDefault();
    this.createError.set(null);
    this.createOk.set(null);

    const email = this.createEmail.trim();
    const password = this.createPassword;
    const firstName = this.createFirst.trim();
    const lastName = this.createLast.trim();

    if (!email || !password || !firstName || !lastName) {
      this.createError.set('Fill in every field.');
      return;
    }
    if (password.length < 8) {
      this.createError.set('Password must be at least 8 characters.');
      return;
    }

    this.creating.set(true);
    this.adminApi
      .createUser({
        email,
        password,
        firstName,
        lastName,
        isAdmin: this.createIsAdmin,
      })
      .subscribe({
        next: () => {
          this.createOk.set('Account created. They can sign in with that email and password.');
          this.createEmail = '';
          this.createPassword = '';
          this.createFirst = '';
          this.createLast = '';
          this.createIsAdmin = false;
          this.creating.set(false);
          this.reload();
        },
        error: (err: { error?: { message?: string }; status?: number; message?: string }) => {
          const msg =
            err?.error?.message ??
            (err?.status === 503
              ? 'Server is missing Supabase:ServiceRoleKey. Add it on the API to enable account creation.'
              : err?.message ?? 'Could not create the account.');
          this.createError.set(msg);
          this.creating.set(false);
        },
      });
  }
}
