import { Component, input, output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { FormsModule } from '@angular/forms';

interface JoinInvitePreviewView {
  ownerShortName: string;
  tableTitle: string | null;
  expiresAt: string;
}

@Component({
  selector: 'app-dashboard-join-table-dialog',
  standalone: true,
  imports: [DialogModule, ButtonModule, InputTextModule, MessageModule, FormsModule],
  templateUrl: './dashboard-join-table-dialog.component.html',
  styleUrl: './dashboard-join-table-dialog.component.scss',
})
export class DashboardJoinTableDialogComponent {
  readonly visible = input(false);
  readonly code = input('');
  readonly loading = input(false);
  readonly previewLoading = input(false);
  readonly error = input<string | null>(null);
  readonly success = input<string | null>(null);
  readonly preview = input<JoinInvitePreviewView | null>(null);
  readonly visibleChange = output<boolean>();
  readonly codeChange = output<string>();
  readonly previewRequest = output<void>();
  readonly confirmRequest = output<void>();
}
