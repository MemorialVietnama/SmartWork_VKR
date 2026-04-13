import { Component, input, output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-dashboard-logout-confirm-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule],
  templateUrl: './dashboard-logout-confirm-dialog.component.html',
  styleUrl: './dashboard-logout-confirm-dialog.component.scss',
})
export class DashboardLogoutConfirmDialogComponent {
  readonly visible = input(false);
  readonly visibleChange = output<boolean>();
  readonly confirm = output<void>();
}
