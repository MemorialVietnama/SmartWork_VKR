import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { ButtonModule } from 'primeng/button';

interface EmployeeFormView {
  lastName: string;
  firstName: string;
  middleName: string;
  birthDate: string;
  phone: string;
  email: string;
  position: string;
  note: string;
  avatarDataUrl: string;
}

@Component({
  selector: 'app-dashboard-employee-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, InputTextModule, MessageModule, ButtonModule],
  templateUrl: './dashboard-employee-dialog.component.html',
  styleUrl: './dashboard-employee-dialog.component.scss',
})
export class DashboardEmployeeDialogComponent {
  readonly visible = input(false);
  readonly mode = input<'create' | 'edit'>('create');
  readonly form = input.required<EmployeeFormView>();
  readonly formError = input<string | null>(null);
  readonly visibleChange = output<boolean>();
  readonly submit = output<void>();
  readonly avatarSelected = output<Event>();
  readonly clearAvatar = output<void>();
}
