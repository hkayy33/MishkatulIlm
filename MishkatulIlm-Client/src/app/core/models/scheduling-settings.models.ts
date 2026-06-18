export interface SchedulingSettings {
  tutorDisplayName: string;
  tutorCountry: string;
  tutorCity: string;
  tutorTimeZoneId: string;
  paymentHourlyRateUsd: number;
  paymentRate45MinUsd: number;
  paymentRate60MinUsd: number;
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
  paymentRate45MinUsd: number;
  paymentRate60MinUsd: number;
  paymentAccountName: string;
  paymentAccountNumber: string;
  paymentSortCode: string;
  paymentBankName: string;
  paymentInstructions: string;
}
