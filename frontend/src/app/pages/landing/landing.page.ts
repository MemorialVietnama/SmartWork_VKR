import { ChangeDetectionStrategy, Component, HostListener, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { LandingAboutComponent } from './components/about/landing-about.component';
import { LandingApiComponent } from './components/api/landing-api.component';
import { LandingFaqComponent } from './components/faq/landing-faq.component';
import { LandingFeaturesComponent } from './components/features/landing-features.component';
import { LandingFooterComponent } from './components/footer/landing-footer.component';
import { LandingHeaderComponent } from './components/header/landing-header.component';
import { LandingHeroComponent } from './components/hero/landing-hero.component';
import { LandingIndustriesComponent } from './components/industries/landing-industries.component';
import { LandingPricingComponent } from './components/pricing/landing-pricing.component';
import type {
  LandingApiId,
  LandingFaqItem,
  LandingFeatureId,
  LandingIndustryId,
  LandingPricingExampleRow,
  LandingSelectOption,
} from './landing.models';

@Component({
  selector: 'app-landing-page',
  standalone: true,
  imports: [
    LandingHeaderComponent,
    LandingHeroComponent,
    LandingFeaturesComponent,
    LandingIndustriesComponent,
    LandingPricingComponent,
    LandingApiComponent,
    LandingAboutComponent,
    LandingFaqComponent,
    LandingFooterComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './landing.page.html',
  styleUrls: ['./landing-shared.scss', './landing.page.scss'],
  host: { class: 'landing-page' },
})
export class LandingPageComponent {
  private readonly router = inject(Router);

  protected readonly headerScrolled = signal(false);
  protected readonly mobileNavOpen = signal(false);
  protected readonly langLabel = signal('RU');
  protected readonly featureId = signal<LandingFeatureId>('calendar');
  protected readonly industryId = signal<LandingIndustryId>('barber');
  protected readonly apiId = signal<LandingApiId>('booking');
  protected readonly billingYearly = signal(false);

  protected readonly featureOptions: LandingSelectOption<LandingFeatureId>[] = [
    { label: 'Календарь', value: 'calendar', icon: 'pi pi-calendar' },
    { label: 'Задачи', value: 'tasks', icon: 'pi pi-list' },
    { label: 'Аналитика', value: 'analytics', icon: 'pi pi-chart-line' },
    { label: 'Сотрудники', value: 'staff', icon: 'pi pi-users' },
    { label: 'Справочники', value: 'references', icon: 'pi pi-book' },
  ];

  protected readonly industryOptions: LandingSelectOption<LandingIndustryId>[] = [
    { label: 'Барбершоп', value: 'barber', icon: 'pi pi-image' },
    { label: 'Груминг', value: 'grooming', icon: 'pi pi-heart' },
    { label: 'Косметология', value: 'beauty', icon: 'pi pi-star' },
    { label: 'Кондитерская', value: 'confectionery', icon: 'pi pi-shopping-bag' },
    { label: 'Фитнес', value: 'fitness', icon: 'pi pi-circle' },
    { label: 'Свой бизнес', value: 'custom', icon: 'pi pi-sparkles' },
  ];

  protected readonly apiOptions: LandingSelectOption<LandingApiId>[] = [
    { label: 'Запись на услугу', value: 'booking', icon: 'pi pi-calendar-plus' },
    { label: 'Создание задач', value: 'tasks', icon: 'pi pi-list' },
    { label: 'Статистика', value: 'analytics', icon: 'pi pi-chart-pie' },
    { label: 'Webhooks', value: 'webhook', icon: 'pi pi-link' },
  ];

  protected readonly pricingExampleRows: LandingPricingExampleRow[] = [
    { name: 'Календарь', icon: 'pi pi-calendar', description: 'Базовая функция', cost: 'Включено', costSeverity: 'success' },
    { name: 'Аналитика стола', icon: 'pi pi-chart-bar', description: 'Статистика по доходам', cost: '+200 ₽/мес', costSeverity: null },
    { name: 'QR для клиентов', icon: 'pi pi-qrcode', description: 'Онлайн-запись', cost: '+150 ₽/мес', costSeverity: null },
    { name: 'Мобильный доступ', icon: 'pi pi-mobile', description: 'Удобство для сотрудников', cost: '+300 ₽/мес', costSeverity: null },
  ];

  protected readonly faqItems: readonly LandingFaqItem[] = [
    {
      q: 'Как быстро начать использовать SmartWork?',
      a: 'Вы можете зарегистрироваться и создать первый стол за 5 минут. Базовая настройка справочников (услуги, сотрудники) займет еще 15–30 минут. Сотрудники обычно осваивают систему за час работы. Полная настройка под все процессы вашего бизнеса займет 1–2 дня.',
    },
    {
      q: 'Какие данные будут доступны в бесплатном плане?',
      a: 'На бесплатном тарифе (Старт) вы получаете 1 рабочий стол, до 3 сотрудников, базовый календарь и справочники. Этого достаточно для пробного периода малого бизнеса. Для расширенной аналитики и API нужно перейти на платный тариф.',
    },
    {
      q: 'Как работает система расширений для столов?',
      a: 'Расширения (дополнительные возможности) покупаются для конкретного стола, а не для всего аккаунта. Например, вы платите за базовый тариф и можете добавить аналитику только для нужного стола. Другие столы могут не иметь эти расширения, что позволяет оптимизировать затраты.',
    },
    {
      q: 'Что такое личная статистика сотрудника?',
      a: 'Это опциональное расширение на сотрудника. Оно позволяет сотруднику видеть свою личную статистику: количество клиентов, доход, рейтинг. Владелец всегда видит все данные, это расширение только для сотрудников.',
    },
    {
      q: 'Как интегрировать SmartWork с моей системой 1С?',
      a: 'Интеграция с 1С может быть доступна на профессиональном тарифе. Мы предоставляем REST API и документацию для синхронизации данных. Вы можете автоматически выгружать данные о доходах, клиентах и услугах.',
    },
    {
      q: 'Какой уровень поддержки вы предоставляете?',
      a: 'На тарифе Старт и Базовый — стандартная поддержка по email (ответ в течение 24 часов). На тарифе Профессиональный — приоритетная поддержка с более коротким сроком ответа. Все вопросы по использованию решаются бесплатно и быстро.',
    },
    {
      q: 'Как защищены данные мои и клиентов?',
      a: 'Все данные зашифрованы при передаче (HTTPS) и хранении. Мы используем PostgreSQL с резервным копированием. Система имеет высокий uptime, регулярное резервное копирование и соответствует требованиям защиты персональных данных.',
    },
    {
      q: 'Можно ли пригласить неограниченно сотрудников?',
      a: 'На тарифах Базовый и Профессиональный можно приглашать неограниченное количество сотрудников. На бесплатном тарифе (Старт) ограничение 3 сотрудника. Каждого сотрудника можно привязать к определённым столам и ограничить его права доступа.',
    },
    {
      q: 'Как происходит оплата и можно ли отменить подписку?',
      a: 'Оплата ежемесячно или ежегодно (со скидкой). Можно отменить подписку в любой момент без штрафов. Данные остаются доступны в течение ограниченного периода после отмены — уточняйте актуальные условия в продукте.',
    },
    {
      q: 'Есть ли мобильное приложение?',
      a: 'SmartWork полностью адаптирован под мобильные устройства — работает в мобильном браузере. Дополнительные каналы уведомлений могут подключаться расширениями в зависимости от тарифа.',
    },
    {
      q: 'Можно ли экспортировать мои данные?',
      a: 'На платных тарифах доступна функция экспорта отчётов в PDF и Excel. Вы можете выгружать аналитику, справочники и истории операций. При необходимости переезда данные можно выгрузить в стандартном формате.',
    },
    {
      q: 'Как связаться с поддержкой?',
      a: 'Напишите через контакты, указанные на сайте продукта, или из раздела настроек аккаунта, если такой канал включён для вашего тарифа.',
    },
  ];

  protected setFeature(id: LandingFeatureId): void {
    this.featureId.set(id);
  }

  protected setIndustry(id: LandingIndustryId): void {
    this.industryId.set(id);
  }

  protected setApi(id: LandingApiId): void {
    this.apiId.set(id);
  }

  protected onBillingChange(yearly: boolean): void {
    this.billingYearly.set(yearly);
  }

  protected toggleLang(): void {
    this.langLabel.update((l) => (l === 'RU' ? 'EN' : 'RU'));
  }

  protected toggleMobileNav(): void {
    this.mobileNavOpen.update((v) => !v);
  }

  protected closeMobileNav(): void {
    this.mobileNavOpen.set(false);
  }

  protected goLogin(): void {
    void this.router.navigate(['/auth/login']);
  }

  protected goRegister(): void {
    void this.router.navigate(['/auth/register']);
  }

  @HostListener('window:scroll')
  onWindowScroll(): void {
    this.headerScrolled.set(window.scrollY > 50);
  }
}
