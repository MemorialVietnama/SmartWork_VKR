import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

type LandingHeroMockDashTab = 'tables' | 'analytics' | 'settings' | 'subscription';

@Component({
  selector: 'app-landing-hero',
  standalone: true,
  imports: [ButtonModule, CardModule, TagModule],
  templateUrl: './landing-hero.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-hero.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingHeroComponent {
  private readonly router = inject(Router);

  protected readonly mockDashTab = signal<LandingHeroMockDashTab>('tables');

  protected readonly mockNav: { id: LandingHeroMockDashTab; label: string; icon: string }[] = [
    { id: 'tables', label: 'Столы', icon: 'pi pi-th-large' },
    { id: 'analytics', label: 'Аналитика', icon: 'pi pi-chart-bar' },
    { id: 'settings', label: 'Настройки', icon: 'pi pi-cog' },
    { id: 'subscription', label: 'Подписка', icon: 'pi pi-wallet' },
  ];

  protected selectMockTab(tab: LandingHeroMockDashTab): void {
    this.mockDashTab.set(tab);
  }

  protected goLogin(): void {
    void this.router.navigate(['/auth/login']);
  }
}
