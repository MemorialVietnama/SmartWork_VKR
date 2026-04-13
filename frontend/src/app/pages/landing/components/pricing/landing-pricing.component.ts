import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DividerModule } from 'primeng/divider';
import { InputSwitchModule } from 'primeng/inputswitch';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import type { LandingPricingExampleRow } from '../../landing.models';

@Component({
  selector: 'app-landing-pricing',
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, DividerModule, InputSwitchModule, TableModule, TagModule],
  templateUrl: './landing-pricing.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-pricing.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingPricingComponent {
  readonly billingYearly = input.required<boolean>();
  readonly pricingExampleRows = input.required<LandingPricingExampleRow[]>();

  readonly billingChange = output<boolean>();
  /** «Начать бесплатно» — на экран входа */
  readonly loginClick = output<void>();
  readonly registerClick = output<void>();
}
