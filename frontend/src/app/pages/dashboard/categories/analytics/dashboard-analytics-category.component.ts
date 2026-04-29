import { Component, ViewEncapsulation, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { ChartModule } from 'primeng/chart';
import { InputSwitchModule } from 'primeng/inputswitch';
import { TagModule } from 'primeng/tag';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'app-dashboard-analytics-category',
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, ChartModule, InputSwitchModule, TagModule, SelectModule],
  templateUrl: './dashboard-analytics-category.component.html',
  styleUrl: './dashboard-analytics-category.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardAnalyticsCategoryComponent {
  readonly ctx = input<unknown>(null);
}
