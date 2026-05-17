import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { LocationsApiService } from '../../../core/services/locations-api.service';
import { SchedulingSettingsService } from '../../../core/services/scheduling-settings.service';
import {
  locationLabel,
  resolveTimeZoneId,
  timeZoneShortName,
} from '../../../core/utils/timezone.util';
import {
  SearchableSelect,
  type SearchableSelectOption,
} from '../../../shared/searchable-select/searchable-select';

@Component({
  selector: 'app-admin-details',
  standalone: true,
  imports: [FormsModule, SearchableSelect],
  templateUrl: './admin-details.html',
  styleUrl: './admin-details.scss',
})
export class AdminDetails implements OnInit {
  private readonly settingsService = inject(SchedulingSettingsService);
  private readonly locationsApi = inject(LocationsApiService);

  protected readonly saving = signal(false);
  protected readonly saveMessage = signal<string | null>(null);
  protected readonly saveError = signal<string | null>(null);
  protected readonly loadingCountries = signal(false);
  protected readonly loadingCities = signal(false);
  protected readonly locationLoadError = signal<string | null>(null);

  protected tutorDisplayName = '';
  protected readonly selectedCountryId = signal('');
  protected readonly selectedCountryName = signal('');
  protected readonly selectedCityName = signal('');
  protected allCountries: SearchableSelectOption[] = [];
  protected allCities: SearchableSelectOption[] = [];
  private pendingCityName = '';

  protected readonly settingsLoading = this.settingsService.loading;
  protected readonly settingsLoadError = this.settingsService.loadError;

  protected readonly resolvedTimeZoneId = computed(() =>
    resolveTimeZoneId(this.selectedCountryName(), this.selectedCityName()),
  );

  protected readonly locationPreview = computed(() =>
    locationLabel(this.selectedCountryName(), this.selectedCityName()),
  );

  protected readonly timeZonePreview = computed(() =>
    timeZoneShortName(this.resolvedTimeZoneId()),
  );

  ngOnInit(): void {
    this.loadCountries();
    void this.settingsService.ensureLoaded().then((row) => {
      if (this.settingsService.loadError()) return;
      this.tutorDisplayName = row.tutorDisplayName;
      this.selectedCountryName.set(row.tutorCountry);
      this.pendingCityName = row.tutorCity;
      void this.matchCountryFromName(row.tutorCountry);
    });
  }

  protected onCountrySelected(countryId: string): void {
    this.selectedCountryId.set(countryId);
    const match = this.allCountries.find((c) => c.value === countryId);
    this.selectedCountryName.set(match?.label ?? '');
    this.selectedCityName.set('');
    this.allCities = [];

    const id = Number(countryId);
    if (!id) return;

    this.loadingCities.set(true);
    this.locationLoadError.set(null);
    this.locationsApi
      .getCities(id)
      .pipe(finalize(() => this.loadingCities.set(false)))
      .subscribe({
        next: (items) => {
          this.allCities = items.map((c) => ({ value: c.name, label: c.name }));
          if (this.pendingCityName) {
            const match = this.allCities.find(
              (c) => c.label.toLowerCase() === this.pendingCityName.toLowerCase(),
            );
            this.selectedCityName.set(match?.value ?? this.pendingCityName);
            this.pendingCityName = '';
          }
        },
        error: () => {
          this.locationLoadError.set('Could not load cities. Try selecting the country again.');
        },
      });
  }

  protected onCitySelected(cityName: string): void {
    this.selectedCityName.set(cityName);
  }

  protected save(): void {
    const name = this.tutorDisplayName.trim();
    const country = this.selectedCountryName().trim();
    const city = this.selectedCityName().trim();

    if (!name || !country || !city) {
      this.saveError.set('Enter your display name, country, and city.');
      this.saveMessage.set(null);
      return;
    }

    this.saving.set(true);
    this.saveError.set(null);
    this.saveMessage.set(null);

    const tutorTimeZoneId = resolveTimeZoneId(country, city);
    void this.settingsService
      .save({
        tutorDisplayName: name,
        tutorCountry: country,
        tutorCity: city,
        tutorTimeZoneId,
      })
      .then(() => {
        this.saveMessage.set('Tutor details saved. Calendar times will use this location.');
      })
      .catch((err: unknown) => {
        this.saveError.set(
          err instanceof Error ? err.message : 'Could not save tutor details.',
        );
      })
      .finally(() => this.saving.set(false));
  }

  private loadCountries(): void {
    this.loadingCountries.set(true);
    this.locationsApi
      .getCountries()
      .pipe(finalize(() => this.loadingCountries.set(false)))
      .subscribe({
        next: (items) => {
          this.allCountries = items.map((c) => ({ value: c.code, label: c.name }));
          const savedCountry = this.selectedCountryName().trim();
          if (savedCountry) {
            void this.matchCountryFromName(savedCountry);
          }
        },
        error: () => {
          this.locationLoadError.set('Could not load countries.');
        },
      });
  }

  private async matchCountryFromName(countryName: string): Promise<void> {
    if (!countryName || this.allCountries.length === 0) return;
    const match = this.allCountries.find(
      (c) => c.label.toLowerCase() === countryName.toLowerCase(),
    );
    if (!match) return;

    this.selectedCountryId.set(match.value);
    this.onCountrySelected(match.value);
  }
}
