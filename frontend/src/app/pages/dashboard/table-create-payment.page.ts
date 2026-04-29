import { Component, OnInit, inject } from '@angular/core';
import { Router } from '@angular/router';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@Component({
  selector: 'app-table-create-payment-page',
  standalone: true,
  imports: [ProgressSpinnerModule],
  template: `
    <div class="table-create-payment-page">
      <div class="payment-card">
        <h2>Обработка оплаты</h2>
        <p>Проверяем заказ, резервируем бонусы и подготавливаем создание стола.</p>
        <div class="steps">
          <div class="step" [class.active]="step >= 1">1. Проверка заказа</div>
          <div class="step" [class.active]="step >= 2">2. Резервирование</div>
          <div class="step" [class.active]="step >= 3">3. Подтверждение</div>
        </div>
        <p-progressSpinner strokeWidth="4" ariaLabel="Оплата" />
      </div>
    </div>
  `,
  styles: [`
    .table-create-payment-page {
      min-height: 100dvh;
      display: grid;
      place-items: center;
      background: linear-gradient(160deg, #f8fbff, #eef4ff);
      padding: 1rem;
    }
    .payment-card {
      width: min(34rem, 96vw);
      border: 1px solid #dbe4f3;
      border-radius: 1rem;
      background: #fff;
      padding: 1.1rem;
      box-shadow: 0 18px 42px -34px rgba(29, 78, 216, 0.45);
      display: grid;
      gap: 0.75rem;
      text-align: center;
    }
    .payment-card h2 {
      margin: 0;
    }
    .payment-card p {
      margin: 0;
      color: #475569;
    }
    .steps {
      display: grid;
      gap: 0.45rem;
      text-align: left;
    }
    .step {
      border: 1px solid #dbe4f3;
      border-radius: 0.6rem;
      padding: 0.45rem 0.6rem;
      color: #64748b;
    }
    .step.active {
      border-color: #3b82f6;
      color: #1d4ed8;
      background: rgba(219, 234, 254, 0.55);
    }
  `],
})
export class TableCreatePaymentPageComponent implements OnInit {
  private readonly router = inject(Router);
  protected step = 0;

  ngOnInit(): void {
    [1, 2, 3].forEach((value, index) => {
      setTimeout(() => {
        this.step = value;
      }, (index + 1) * 1000);
    });
    setTimeout(() => {
      void this.router.navigate(['/dashboard'], { queryParams: { tableCreatePaymentDone: 1 } });
    }, 3200);
  }
}

