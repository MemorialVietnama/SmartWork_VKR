import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';

type LandingHeroMockDashTab = 'tables' | 'employees' | 'analytics';

@Component({
  selector: 'app-landing-hero',
  standalone: true,
  imports: [RouterLink, ButtonModule, CardModule, TagModule],
  templateUrl: './landing-hero.component.html',
  styleUrls: ['../../landing-shared.scss', './landing-hero.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingHeroComponent {
  private readonly router = inject(Router);

  protected readonly mockDashTab = signal<LandingHeroMockDashTab>('tables');

  protected readonly mockNav: { id: LandingHeroMockDashTab; label: string; icon: string }[] = [
    { id: 'tables', label: 'Столы', icon: 'pi pi-th-large' },
    { id: 'employees', label: 'Сотрудники', icon: 'pi pi-users' },
    { id: 'analytics', label: 'Аналитика', icon: 'pi pi-chart-bar' },
  ];

  protected selectMockTab(tab: LandingHeroMockDashTab): void {
    this.mockDashTab.set(tab);
  }

  protected goLogin(): void {
    void this.router.navigate(['/auth/login']);
  }
}
