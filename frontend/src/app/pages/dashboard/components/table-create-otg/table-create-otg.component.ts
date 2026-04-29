import { Component, ElementRef, QueryList, ViewChildren, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-table-create-otg',
  standalone: true,
  imports: [FormsModule, ButtonModule],
  templateUrl: './table-create-otg.component.html',
  styleUrl: './table-create-otg.component.scss',
})
export class TableCreateOtgComponent {
  @ViewChildren('otgInput') private readonly otgInputs!: QueryList<ElementRef<HTMLInputElement>>;

  readonly code = input('');
  readonly loading = input(false);
  readonly title = input('Подтверждение создания стола');
  readonly description = input('На почту отправлен код. Введите его для завершения создания.');
  readonly confirmLabel = input('Подтвердить и создать');
  readonly valueChange = output<string>();
  readonly back = output<void>();
  readonly confirm = output<void>();

  protected slotValue(index: number): string {
    return this.normalizedCode()[index] ?? '';
  }

  protected onSlotInput(index: number, rawValue: string): void {
    const clean = rawValue.replace(/\D+/g, '');
    if (!clean) {
      const next = this.buildCodeWithReplacement(index, '');
      this.valueChange.emit(next);
      return;
    }
    const chars = clean.slice(0, 6).split('');
    const current = this.currentCodeChars();
    let cursor = index;
    chars.forEach((char) => {
      if (cursor > 5) {
        return;
      }
      current[cursor] = char;
      cursor += 1;
    });
    const normalized = current.join('').slice(0, 6);
    this.valueChange.emit(normalized);
    this.focusSlot(Math.min(index + chars.length, 5));
  }

  protected onSlotKeydown(event: KeyboardEvent, index: number): void {
    if (event.key !== 'Backspace') {
      return;
    }
    const current = this.currentCodeChars();
    if (current[index]) {
      current[index] = '';
      this.valueChange.emit(current.join('').slice(0, 6));
      return;
    }
    if (index > 0) {
      current[index - 1] = '';
      this.valueChange.emit(current.join('').slice(0, 6));
      this.focusSlot(index - 1);
    }
  }

  protected onSlotPaste(event: ClipboardEvent, index: number): void {
    const pasted = event.clipboardData?.getData('text') ?? '';
    const clean = pasted.replace(/\D+/g, '').slice(0, 6);
    if (!clean) {
      return;
    }
    event.preventDefault();
    const chars = clean.split('');
    const current = this.currentCodeChars();
    let cursor = index;
    chars.forEach((char) => {
      if (cursor > 5) {
        return;
      }
      current[cursor] = char;
      cursor += 1;
    });
    this.valueChange.emit(current.join('').slice(0, 6));
    this.focusSlot(Math.min(index + chars.length, 5));
  }

  protected previewSlots(): string[] {
    const normalized = this.normalizedCode();
    return Array.from({ length: 6 }, (_, index) => normalized[index] ?? '•');
  }

  private normalizedCode(): string {
    return this.code().replace(/\D+/g, '').slice(0, 6);
  }

  private currentCodeChars(): string[] {
    const normalized = this.normalizedCode();
    return Array.from({ length: 6 }, (_, index) => normalized[index] ?? '');
  }

  private buildCodeWithReplacement(index: number, value: string): string {
    const chars = this.currentCodeChars();
    chars[index] = value;
    return chars.join('').slice(0, 6);
  }

  private focusSlot(index: number): void {
    const arr = this.otgInputs?.toArray() ?? [];
    const target = arr[index]?.nativeElement;
    if (!target) {
      return;
    }
    target.focus();
    target.select();
  }
}
