import {
  ChangeDetectionStrategy,
  Component,
  HostListener,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ButtonModule } from 'primeng/button';

interface NavItem {
  label: string;
  link: string;
  fragment?: string;
}

@Component({
  selector: 'app-landing-header',
  standalone: true,
  imports: [RouterLink, ButtonModule],
  templateUrl: './landing-header.component.html',
  styleUrls: ['./landing-header.component.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LandingHeaderComponent {
  private readonly router = inject(Router);

  readonly headerScrolled = input.required<boolean>();
  readonly mobileNavOpen = input.required<boolean>();
  readonly langLabel = input.required<string>();

  readonly langToggle = output<void>();
  readonly mobileNavToggle = output<void>();
  readonly closeMobile = output<void>();

  readonly navItems: NavItem[] = [
    { label: 'Возможности', link: '/welcome', fragment: 'features' },
    { label: 'Для кого', link: '/welcome', fragment: 'industries' },
    { label: 'Расширения', link: '/welcome', fragment: 'pricing' },
    { label: 'API', link: '/welcome', fragment: 'api' },
    { label: 'Помощь', link: '/welcome', fragment: 'faq' },
    { label: 'О нас', link: '/welcome', fragment: 'about' },
  ];

  private readonly currentFragment = computed(() => null as string | null);

  isActive(fragment?: string): boolean {
    return this.currentFragment() === fragment;
  }

  protected goLogin(): void {
    void this.router.navigate(['/auth/login']);
  }

  @HostListener('document:keydown.escape')
  onEscapePress(): void {
    if (this.mobileNavOpen()) {
      this.closeMobile.emit();
    }
  }
}
