import { Component, ViewEncapsulation, input } from '@angular/core';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';

@Component({
  selector: 'app-dashboard-tables-category',
  standalone: true,
  imports: [ButtonModule, CardModule],
  templateUrl: './dashboard-tables-category.component.html',
  styleUrl: './dashboard-tables-category.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardTablesCategoryComponent {
  readonly ctx = input<unknown>(null);
}
