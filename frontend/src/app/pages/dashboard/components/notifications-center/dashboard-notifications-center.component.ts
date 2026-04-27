import { Component, input, output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DatePipe } from '@angular/common';

interface NotificationItemView {
  id: number;
  kind: string;
  title: string;
  message: string;
  priority: 'low' | 'normal' | 'high';
  isRead: boolean;
  createdAt: string;
  payload?: Record<string, unknown> | null;
}

@Component({
  selector: 'app-dashboard-notifications-center',
  standalone: true,
  imports: [DialogModule, ButtonModule, TagModule, DatePipe],
  templateUrl: './dashboard-notifications-center.component.html',
  styleUrl: './dashboard-notifications-center.component.scss',
})
export class DashboardNotificationsCenterComponent {
  readonly visible = input(false);
  readonly loading = input(false);
  readonly canOpenDetachAction = input(false);
  readonly items = input<NotificationItemView[]>([]);
  readonly visibleChange = output<boolean>();
  readonly markAllRead = output<void>();
  readonly markOneRead = output<number>();
  readonly openAction = output<number>();

  protected severity(priority: NotificationItemView['priority']): 'success' | 'info' | 'danger' {
    if (priority === 'high') {
      return 'danger';
    }
    if (priority === 'low') {
      return 'success';
    }
    return 'info';
  }
}
