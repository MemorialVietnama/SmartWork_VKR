import { Component, input, output } from '@angular/core';
import { DialogModule } from 'primeng/dialog';
import { MessageModule } from 'primeng/message';
import { ButtonModule } from 'primeng/button';

interface TableMemberEmployeeView {
  id: number;
  firstName: string;
  lastName: string;
}

@Component({
  selector: 'app-dashboard-table-members-dialog',
  standalone: true,
  imports: [DialogModule, MessageModule, ButtonModule],
  templateUrl: './dashboard-table-members-dialog.component.html',
  styleUrl: './dashboard-table-members-dialog.component.scss',
})
export class DashboardTableMembersDialogComponent {
  readonly visible = input(false);
  readonly visibleChange = output<boolean>();
  readonly tableTitle = input<string | null>(null);
  readonly employees = input<TableMemberEmployeeView[]>([]);
  readonly actionError = input<string | null>(null);
  readonly addEmployee = output<number>();
}
