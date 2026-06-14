export interface SchedulingSettings {
  tutorDisplayName: string;
  tutorCountry: string;
  tutorCity: string;
  tutorTimeZoneId: string;
  paymentHourlyRateUsd: number;
  paymentAccountName: string;
  paymentAccountNumber: string;
  paymentSortCode: string;
  paymentBankName: string;
  paymentInstructions: string;
}

export interface UpdateSchedulingSettingsBody {
  tutorDisplayName: string;
  tutorCountry: string;
  tutorCity: string;
  tutorTimeZoneId: string;
  paymentHourlyRateUsd: number;
  paymentAccountName: string;
  paymentAccountNumber: string;
  paymentSortCode: string;
  paymentBankName: string;
  paymentInstructions: string;
}
