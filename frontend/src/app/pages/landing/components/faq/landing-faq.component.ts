import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AccordionModule } from 'primeng/accordion';
import type { LandingFaqItem } from '../../landing.models';

@Component({
  selector: 'app-landing-faq',
  standalone: true,
  imports: [AccordionModule],
  templateUrl: './landing-faq.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-faq.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingFaqComponent {
  readonly faqItems = input.required<readonly LandingFaqItem[]>();
}
