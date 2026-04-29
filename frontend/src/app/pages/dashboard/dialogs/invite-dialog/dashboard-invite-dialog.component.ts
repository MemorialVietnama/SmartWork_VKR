import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { SelectModule } from 'primeng/select';

interface InviteTableOptionView {
  id: number;
  title: string;
}

@Component({
  selector: 'app-dashboard-invite-dialog',
  standalone: true,
  imports: [DialogModule, FormsModule, ButtonModule, SelectModule],
  templateUrl: './dashboard-invite-dialog.component.html',
  styleUrl: './dashboard-invite-dialog.component.scss',
})
export class DashboardInviteDialogComponent {
  readonly visible = input(false);
  readonly tables = input<InviteTableOptionView[]>([]);
  readonly selectedTableId = input<number | null>(null);
  readonly inviteType = input<'code' | 'link'>('link');
  readonly generating = input(false);
  readonly error = input<string | null>(null);
  readonly inviteCode = input('');
  readonly inviteLink = input('');
  readonly visibleChange = output<boolean>();
  readonly selectedTableIdChange = output<number | null>();
  readonly inviteTypeChange = output<'code' | 'link'>();
  readonly generateInvite = output<void>();

  protected onTableChange(value: number | string | null): void {
    if (value === null || value === '') {
      this.selectedTableIdChange.emit(null);
      return;
    }
    const tableId = typeof value === 'number' ? value : Number(value);
    this.selectedTableIdChange.emit(Number.isFinite(tableId) ? tableId : null);
  }

  protected close(): void {
    this.visibleChange.emit(false);
  }
}
