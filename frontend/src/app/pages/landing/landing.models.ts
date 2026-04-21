export type LandingFeatureId = 'calendar' | 'tasks' | 'analytics' | 'staff' | 'references';
export type LandingIndustryId = 'barber' | 'grooming' | 'beauty' | 'confectionery' | 'fitness' | 'custom';
export type LandingApiId = 'booking' | 'tasks' | 'analytics' | 'webhook';

export interface LandingSelectOption<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly icon: string;
}

export interface LandingFaqItem {
  readonly q: string;
  readonly a: string;
}
