import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DialogModule } from 'primeng/dialog';
import { ButtonModule } from 'primeng/button';
import { StepperModule } from 'primeng/stepper';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { TableCreateOtgComponent } from '../../components/table-create-otg/table-create-otg.component';

interface EmployeeCardView {
  id: number;
  firstName: string;
  lastName: string;
  position: string;
}

interface SubscriptionBonusView {
  key: string;
  title: string;
  price: number;
  kind: 'quantity' | 'toggle';
  maxQty?: number;
}

interface TableCreateFormView {
  title: string;
  description: string;
  preset: 'barbershop' | 'grooming' | 'custom';
  customPresetName: string;
  selectedEmployeeIds: number[];
  bonusValues: Record<string, number>;
  timeFormat: 'us' | 'eu';
  weekStartDay: 'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday';
  workDayStart: string;
  workDayEnd: string;
}

@Component({
  selector: 'app-dashboard-table-create-dialog',
  standalone: true,
  imports: [FormsModule, DialogModule, ButtonModule, StepperModule, InputSwitchModule, InputTextModule, MessageModule, TableCreateOtgComponent],
  templateUrl: './dashboard-table-create-dialog.component.html',
  styleUrl: './dashboard-table-create-dialog.component.scss',
})
export class DashboardTableCreateDialogComponent {
  readonly visible = input(false);
  readonly visibleChange = output<boolean>();
  readonly tableCodeDialogVisible = input(false);
  readonly tableCodeDialogVisibleChange = output<boolean>();
  readonly tableCreateCode = input('');
  readonly tableCreateCodeChange = output<string>();
  readonly tableFormError = input<string | null>(null);
  readonly creatingTable = input(false);
  readonly tableCreateStep = input(1);
  readonly tableCreateStepChange = output<number>();
  readonly tableForm = input.required<TableCreateFormView>();
  readonly ownerEmployees = input<EmployeeCardView[]>([]);
  readonly subscriptionBonuses = input<SubscriptionBonusView[]>([]);
  readonly submitCreate = output<void>();
  readonly confirmCreate = output<void>();
  readonly toggleEmployee = output<{ employeeId: number; checked: boolean }>();
  readonly changeBonusQuantity = output<{ bonusKey: string; delta: number; maxQty: number }>();
  readonly setBonusToggle = output<{ bonusKey: string; enabled: boolean }>();
  readonly nextStep = output<void>();
  readonly prevStep = output<void>();

  protected selectStep(step: number): void {
    this.tableCreateStepChange.emit(step);
  }

  protected selectedEmployees(): EmployeeCardView[] {
    return this.ownerEmployees().filter((item) => this.tableForm().selectedEmployeeIds.includes(item.id));
  }

  protected employeeInitials(employee: EmployeeCardView): string {
    return `${employee.lastName[0] ?? ''}${employee.firstName[0] ?? ''}`.toUpperCase();
  }

  protected bonusValue(key: string): number {
    return this.tableForm().bonusValues[key] ?? 0;
  }

  protected selectedBonusesCount(): number {
    return this.subscriptionBonuses().filter((bonus) => this.bonusValue(bonus.key) > 0).length;
  }

  protected bonusMonthlyTotal(): number {
    return this.subscriptionBonuses().reduce((sum, bonus) => sum + this.bonusValue(bonus.key) * bonus.price, 0);
  }

  protected formatRub(value: number): string {
    return `${new Intl.NumberFormat('ru-RU').format(value)} ₽`;
  }

  protected presetDescription(preset: 'barbershop' | 'grooming' | 'custom'): string {
    if (preset === 'barbershop') {
      return 'Быстрый запуск для мастеров, смен и регулярных записей клиентов.';
    }
    if (preset === 'grooming') {
      return 'Сценарий для груминг-салонов: уход, интервалы и сервисные напоминания.';
    }
    return 'Гибкий кастомный режим. Подходит для вашей уникальной структуры стола.';
  }
}
