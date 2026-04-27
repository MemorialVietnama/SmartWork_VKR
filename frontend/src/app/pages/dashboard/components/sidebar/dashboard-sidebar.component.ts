import { Component, input, output } from '@angular/core';
import { TagModule } from 'primeng/tag';
import { RouterLink } from '@angular/router';

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
  imports: [TagModule, RouterLink],
  templateUrl: './dashboard-sidebar.component.html',
  styleUrl: './dashboard-sidebar.component.scss',
})
export class DashboardSidebarComponent {
  readonly user = input<DashboardUserView | null>(null);
  readonly isOwner = input(false);
  readonly categories = input<SidebarItemView[]>([]);
  readonly selectedCategory = input('');
  readonly badges = input<Record<string, string>>({});
  readonly unreadNotifications = input(0);
  readonly categorySelect = output<string>();
  readonly notificationsOpen = output<void>();

  protected onSelect(categoryId: string): void {
    this.categorySelect.emit(categoryId);
  }

  protected openNotifications(): void {
    this.notificationsOpen.emit();
  }
}
