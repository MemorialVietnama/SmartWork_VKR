import { Component, input, output } from '@angular/core';
import { TagModule } from 'primeng/tag';

interface DashboardUserView {
  first_name?: string | null;
  last_name?: string | null;
  login: string;
}

interface SidebarItemView {
  id: string;
  label: string;
  icon: string;
}

@Component({
  selector: 'app-dashboard-sidebar',
  standalone: true,
  imports: [TagModule],
  templateUrl: './dashboard-sidebar.component.html',
  styleUrl: './dashboard-sidebar.component.scss',
})
export class DashboardSidebarComponent {
  readonly user = input<DashboardUserView | null>(null);
  readonly isOwner = input(false);
  readonly categories = input<SidebarItemView[]>([]);
  readonly selectedCategory = input('');
  readonly badges = input<Record<string, string>>({});
  readonly categorySelect = output<string>();

  protected onSelect(categoryId: string): void {
    this.categorySelect.emit(categoryId);
  }
}
