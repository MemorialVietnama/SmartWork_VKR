import { Component, input, output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';

@Component({
  selector: 'app-dashboard-invite-dialog',
  standalone: true,
  imports: [DialogModule],
  templateUrl: './dashboard-invite-dialog.component.html',
  styleUrl: './dashboard-invite-dialog.component.scss',
})
export class DashboardInviteDialogComponent {
  readonly visible = input(false);
  readonly inviteLink = input('');
  readonly visibleChange = output<boolean>();

  protected close(): void {
    this.visibleChange.emit(false);
  }
}
