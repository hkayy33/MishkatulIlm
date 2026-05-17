import { inject, Injectable, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type {
  SchedulingSettings,
  UpdateSchedulingSettingsBody,
} from '../models/scheduling-settings.models';
import { formatHttpError } from '../utils/http-error.util';
import { AdminApiService } from './admin-api.service';

@Injectable({ providedIn: 'root' })
export class SchedulingSettingsService {
  private readonly adminApi = inject(AdminApiService);

  readonly settings = signal<SchedulingSettings | null>(null);
  readonly loading = signal(false);
  readonly loadError = signal<string | null>(null);

  async ensureLoaded(force = false): Promise<SchedulingSettings> {
    const cached = this.settings();
    if (cached && !force) return cached;

    this.loading.set(true);
    this.loadError.set(null);
    try {
      const raw = await firstValueFrom(this.adminApi.getSchedulingSettings());
      const row = normalizeSettings(raw);
      this.settings.set(row);
      return row;
    } catch (err) {
      this.loadError.set(formatHttpError(err, 'Could not load tutor settings.'));
      return {
        tutorDisplayName: 'Tutor',
        tutorCountry: '',
        tutorCity: '',
        tutorTimeZoneId: 'UTC',
      };
    } finally {
      this.loading.set(false);
    }
  }

  async save(body: UpdateSchedulingSettingsBody): Promise<SchedulingSettings> {
    try {
      const raw = await firstValueFrom(this.adminApi.updateSchedulingSettings(body));
      const row = normalizeSettings(raw);
      this.settings.set(row);
      this.loadError.set(null);
      return row;
    } catch (err) {
      throw new Error(formatHttpError(err, 'Could not save tutor details.'));
    }
  }
}

function normalizeSettings(raw: SchedulingSettings): SchedulingSettings {
  const r = raw as SchedulingSettings & {
    TutorDisplayName?: string;
    TutorCountry?: string;
    TutorCity?: string;
    TutorTimeZoneId?: string;
  };
  return {
    tutorDisplayName: r.tutorDisplayName ?? r.TutorDisplayName ?? 'Tutor',
    tutorCountry: r.tutorCountry ?? r.TutorCountry ?? '',
    tutorCity: r.tutorCity ?? r.TutorCity ?? '',
    tutorTimeZoneId: r.tutorTimeZoneId ?? r.TutorTimeZoneId ?? 'UTC',
  };
}
