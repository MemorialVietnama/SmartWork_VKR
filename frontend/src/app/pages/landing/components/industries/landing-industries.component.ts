import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { SelectButtonModule } from 'primeng/selectbutton';
import type { LandingIndustryId, LandingSelectOption } from '../../landing.models';

@Component({
  selector: 'app-landing-industries',
  standalone: true,
  imports: [FormsModule, ButtonModule, SelectButtonModule],
  templateUrl: './landing-industries.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-industries.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingIndustriesComponent {
  readonly industryId = input.required<LandingIndustryId>();
  readonly industryOptions = input.required<LandingSelectOption<LandingIndustryId>[]>();

  readonly industryChange = output<LandingIndustryId>();
  readonly registerClick = output<void>();
}
