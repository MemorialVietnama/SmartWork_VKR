import { ChangeDetectionStrategy, Component } from '@angular/core';
@Component({
  selector: 'app-landing-about',
  standalone: true,
  imports: [],
  templateUrl: './landing-about.component.html',
  styleUrls: ['../../landing-shared.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingAboutComponent {}
