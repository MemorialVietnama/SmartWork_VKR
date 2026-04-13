import { ChangeDetectionStrategy, Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { DividerModule } from 'primeng/divider';

@Component({
  selector: 'app-landing-footer',
  standalone: true,
  imports: [RouterLink, ButtonModule, DividerModule],
  templateUrl: './landing-footer.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-footer.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingFooterComponent {}
