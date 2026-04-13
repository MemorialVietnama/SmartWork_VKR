import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-table-create-otg',
  standalone: true,
  imports: [FormsModule, InputTextModule, ButtonModule],
  templateUrl: './table-create-otg.component.html',
  styleUrl: './table-create-otg.component.scss',
})
export class TableCreateOtgComponent {
  readonly code = input('');
  readonly loading = input(false);
  readonly title = input('Подтверждение создания стола');
  readonly description = input('На почту отправлен код. Введите его для завершения создания.');
  readonly confirmLabel = input('Подтвердить и создать');
  readonly valueChange = output<string>();
  readonly back = output<void>();
  readonly confirm = output<void>();

  protected onCodeInput(value: string): void {
    const normalized = value.replace(/\s+/g, '').slice(0, 6);
    this.valueChange.emit(normalized);
  }

  protected previewSlots(): string[] {
    const normalized = this.code().replace(/\s+/g, '').slice(0, 6);
    return Array.from({ length: 6 }, (_, index) => normalized[index] ?? '•');
  }
}
