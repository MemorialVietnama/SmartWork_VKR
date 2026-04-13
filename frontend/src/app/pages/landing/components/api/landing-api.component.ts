import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { SelectButtonModule } from 'primeng/selectbutton';
import type { LandingApiId, LandingSelectOption } from '../../landing.models';

@Component({
  selector: 'app-landing-api',
  standalone: true,
  imports: [FormsModule, CardModule, SelectButtonModule],
  templateUrl: './landing-api.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-api.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingApiComponent {
  readonly apiId = input.required<LandingApiId>();
  readonly apiOptions = input.required<LandingSelectOption<LandingApiId>[]>();

  readonly apiChange = output<LandingApiId>();
}
