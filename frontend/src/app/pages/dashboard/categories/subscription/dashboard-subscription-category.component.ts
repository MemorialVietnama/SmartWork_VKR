import { Component, ViewEncapsulation, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-dashboard-subscription-category',
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputSwitchModule, InputTextModule, TagModule],
  templateUrl: './dashboard-subscription-category.component.html',
  styleUrl: './dashboard-subscription-category.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardSubscriptionCategoryComponent {
  readonly ctx = input<unknown>(null);
}
