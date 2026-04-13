export type LandingFeatureId = 'calendar' | 'tasks' | 'analytics' | 'staff' | 'references';
export type LandingIndustryId = 'barber' | 'grooming' | 'beauty' | 'confectionery' | 'fitness' | 'custom';
export type LandingApiId = 'booking' | 'tasks' | 'analytics' | 'webhook';

export interface LandingSelectOption<T extends string> {
  readonly label: string;
  readonly value: T;
  readonly icon: string;
}

export interface LandingPricingExampleRow {
  readonly name: string;
  readonly icon: string;
  readonly description: string;
  readonly cost: string;
  readonly costSeverity: 'success' | null;
}

export interface LandingFaqItem {
  readonly q: string;
  readonly a: string;
}
