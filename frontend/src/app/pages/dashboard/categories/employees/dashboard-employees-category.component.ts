import { Component, ViewEncapsulation, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';
import { TagModule } from 'primeng/tag';

@Component({
  selector: 'app-dashboard-employees-category',
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputTextModule, TagModule],
  templateUrl: './dashboard-employees-category.component.html',
  styleUrl: './dashboard-employees-category.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardEmployeesCategoryComponent {
  readonly ctx = input<unknown>(null);
}
