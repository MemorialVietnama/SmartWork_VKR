import { Component, ViewEncapsulation, input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputSwitchModule } from 'primeng/inputswitch';
import { InputTextModule } from 'primeng/inputtext';
import { MessageModule } from 'primeng/message';
import { SelectModule } from 'primeng/select';

@Component({
  selector: 'app-dashboard-settings-category',
  standalone: true,
  imports: [FormsModule, ButtonModule, CardModule, InputSwitchModule, InputTextModule, MessageModule, SelectModule],
  templateUrl: './dashboard-settings-category.component.html',
  styleUrl: './dashboard-settings-category.component.scss',
  encapsulation: ViewEncapsulation.None,
})
export class DashboardSettingsCategoryComponent {
  readonly ctx = input<unknown>(null);
}
