import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  HostListener,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed, toObservable } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { catchError, distinctUntilChanged, finalize, of, switchMap, tap } from 'rxjs';

import { MessageService } from 'primeng/api';
import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { ToastModule } from 'primeng/toast';

import { AuthService, CalendarSlotDto, WorkspaceDirectoryDto, WorkspaceDirectoryItemDto, WorkspaceOrderDto } from '../../../core/auth/auth.service';
import { WorkspaceCalendarWidgetComponent } from '../../../shared/workspace-calendar-widget/workspace-calendar-widget.component';
import { TableWorkspaceState } from '../table-workspace.state';
import { CalendarViewMode, toIsoRange, visibleRangeForView, weekStartDayToJs } from './calendar-view.utils';
import { asServicePayload, subservicesTotal } from './directory-payload.models';

@Component({
  selector: 'app-workspace-calendar-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    DialogModule,
    InputTextModule,
    MultiSelectModule,
    ToastModule,
    WorkspaceCalendarWidgetComponent,
  ],
  providers: [MessageService],
  templateUrl: './workspace-calendar.tab.html',
  styleUrl: './workspace-calendar.tab.scss',
})
export class WorkspaceCalendarTabComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly messageService = inject(MessageService);
  protected readonly state = inject(TableWorkspaceState);

  protected readonly viewMode = signal<CalendarViewMode>('month');
  /** Опорная дата; при смене всегда новый объект Date */
  protected readonly anchorDate = signal<Date>(new Date());

  protected readonly slots = signal<CalendarSlotDto[]>([]);
  protected readonly orders = signal<WorkspaceOrderDto[]>([]);
  protected readonly directories = signal<WorkspaceDirectoryDto[]>([]);
  protected readonly slotsLoading = signal(false);
  protected readonly loadError = signal<string | null>(null);

  protected createDialogVisible = false;
  protected createStep = 1;
  protected newTitle = '';
  protected newSelectedEmployeeIds: number[] = [];
  protected newDateFrom = '';
  protected newTimeFrom = '09:00';
  protected newDateTo = '';
  protected newTimeTo = '18:00';
  protected editDialogVisible = false;
  protected editingSlotId: number | null = null;
  protected editTitle = '';
  protected editStart = '';
  protected editEnd = '';
  protected slotMenuVisible = false;
  protected slotMenuX = 0;
  protected slotMenuY = 0;
  protected selectedSlot: CalendarSlotDto | null = null;
  protected selectedOrder: WorkspaceOrderDto | null = null;
  protected selectedContextDateKey = '';
  protected actionError: string | null = null;
  protected orderWarnings: string[] = [];

  protected createOrderDialogVisible = false;
  protected createOrderStep = 1;
  protected orderDate = '';
  protected orderTimeFrom = '09:00';
  protected orderDurationMinutes = 60;
  protected orderTitle = '';
  protected readonly orderClientSelection = signal<number[]>([]);
  protected readonly orderPetIds = signal<number[]>([]);
  protected readonly orderServiceIds = signal<number[]>([]);
  protected readonly orderAssigneeSelection = signal<number[]>([]);
  protected readonly orderPriceAdjustment = signal(0);
  protected readonly orderStatus = signal('queued');
  protected readonly orderStatusSelection = signal<string[]>(['queued']);
  protected editOrderId: number | null = null;
  protected orderDeleteConfirmVisible = false;
  protected orderCompleteDialogVisible = false;
  protected completeOrderId: number | null = null;
  protected completeOrderRating = 5;
  protected completeOrderComment = '';
  protected childOrderDialogVisible = false;
  protected childOrderType: 'follow_up' | 'repeat_copy' = 'follow_up';
  protected childOrderSourceId: number | null = null;

  protected quickCreateClientVisible = false;
  protected quickCreateServiceVisible = false;
  protected quickClientName = '';
  protected quickServiceName = '';
  protected quickServiceCost = 0;
  private pendingFocusOrderId: number | null = null;

  protected readonly weekStartsOn = computed(() => weekStartDayToJs(this.state.detail()?.week_start_day));
  protected readonly calendarEntries = computed<CalendarSlotDto[]>(() => {
    const { from, to } = this.visibleRange();
    const orderSlots: CalendarSlotDto[] = this.orders()
      .filter((order) => this.orderIntersectsRange(order, from, to))
      .map((order) => ({
        id: -order.id,
        title: `Заказ ${order.order_number ?? `#${order.id}`} · ${order.title}${order.status === 'completed' ? ' · завершен' : ''}`,
        starts_at: order.starts_at ?? order.created_at,
        ends_at: order.ends_at ?? order.created_at,
      }));
    return [...this.slots(), ...orderSlots];
  });

  protected readonly clientsDirectory = computed(() => this.directories().find((dir) => dir.kind === 'clients') ?? null);
  protected readonly petsDirectory = computed(() => this.directories().find((dir) => dir.kind === 'pets') ?? null);
  protected readonly servicesDirectory = computed(() => this.directories().find((dir) => dir.kind === 'services') ?? null);
  protected readonly clientOptions = computed(() =>
    (this.clientsDirectory()?.items ?? []).map((it) => ({
      label: this.itemLabel(it),
      value: it.id,
      avatarUrl: this.extractClientAvatar(it),
      subtitle: this.extractClientPhone(it),
    })),
  );
  protected readonly orderClientId = computed(() => this.orderClientSelection()[0] ?? null);
  protected readonly selectedClient = computed(() => {
    const clientId = this.orderClientId();
    return clientId ? (this.clientOptions().find((entry) => entry.value === clientId) ?? null) : null;
  });
  protected readonly serviceOptions = computed(() =>
    (this.servicesDirectory()?.items ?? []).map((it) => ({
      label: this.itemLabel(it),
      value: it.id,
      icon: this.extractServiceIcon(it),
      cost: this.extractCost(it),
      subservices: this.extractServiceSubservices(it),
    })),
  );
  protected readonly selectedServiceOptions = computed(() => {
    const selected = new Set(this.orderServiceIds());
    return this.serviceOptions().filter((entry) => selected.has(entry.value));
  });
  protected readonly clientSelectionLimit = computed(() => (this.groomingSelected() ? 2 : 1));
  protected readonly groomingSelected = computed(() =>
    this.selectedServiceOptions().some((entry) => entry.label.toLowerCase().includes('грум')),
  );
  protected readonly petOptions = computed(() => {
    const selectedIds = new Set(this.orderClientSelection());
    if (selectedIds.size === 0) {
      return [];
    }
    const clientItems = (this.clientsDirectory()?.items ?? []).filter((entry) => selectedIds.has(entry.id));
    const allowedSet = new Set<number>();
    const selectedClientNames = new Set<string>();
    for (const clientItem of clientItems) {
      const payload = this.payloadRecord(clientItem.payload);
      const detail = this.payloadRecord(payload['detail']);
      const allowedPetIdsRaw = detail['petItemIds'];
      const allowedPetIds = Array.isArray(allowedPetIdsRaw)
        ? allowedPetIdsRaw.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
        : [];
      for (const petId of allowedPetIds) {
        allowedSet.add(petId);
      }
      const firstName = String(payload['firstName'] ?? detail['firstName'] ?? '').trim();
      const lastName = String(payload['lastName'] ?? detail['lastName'] ?? '').trim();
      const fullName = `${lastName} ${firstName}`.trim().toLowerCase();
      if (fullName) {
        selectedClientNames.add(fullName);
      }
    }
    if (selectedClientNames.size > 0) {
      for (const petItem of this.petsDirectory()?.items ?? []) {
        const payload = this.payloadRecord(petItem.payload);
        const detail = this.payloadRecord(payload['detail']);
        const ownerId = Number(detail['ownerClientItemId']);
        if (Number.isFinite(ownerId) && selectedIds.has(ownerId)) {
          allowedSet.add(petItem.id);
          continue;
        }
        const ownerName = String(payload['ownerName'] ?? '').trim().toLowerCase();
        if (ownerName && selectedClientNames.has(ownerName)) {
          allowedSet.add(petItem.id);
        }
      }
    }
    return (this.petsDirectory()?.items ?? [])
      .filter((entry) => allowedSet.has(entry.id))
      .map((entry) => ({
        label: this.itemLabel(entry),
        value: entry.id,
        avatarUrl: this.extractPetAvatar(entry),
      }));
  });
  protected readonly employeeOptions = computed(() =>
    this.state.members().map((member) => ({
      label: member.short_name,
      value: member.user_id,
      isOwner: member.is_owner,
      initials: this.initials(member.short_name),
      role: member.position || member.role || (member.is_owner ? 'Владелец' : 'Сотрудник'),
    })),
  );
  protected readonly statusOptions: Array<{ value: string; label: string; icon: string; tone: string }> = [
    { value: 'queued', label: 'В очереди', icon: 'pi pi-clock', tone: 'status-queued' },
    { value: 'in_progress', label: 'В работе', icon: 'pi pi-spin pi-spinner', tone: 'status-progress' },
    { value: 'completed', label: 'Завершен', icon: 'pi pi-check-circle', tone: 'status-completed' },
    { value: 'cancelled', label: 'Отменен', icon: 'pi pi-times-circle', tone: 'status-cancelled' },
  ];
  protected readonly selectedStatusOption = computed(
    () => this.statusOptions.find((entry) => entry.value === this.orderStatus()) ?? this.statusOptions[0],
  );
  protected readonly selectedServiceCost = computed(() =>
    this.selectedServiceOptions().reduce((sum, entry) => sum + entry.cost, 0),
  );
  protected readonly orderPriceTotal = computed(() => this.selectedServiceCost() + Number(this.orderPriceAdjustment() || 0));
  protected readonly selectedClientLabel = computed(() => this.clientOptionByValue(this.orderClientId())?.label ?? '—');
  protected readonly selectedPetLabels = computed(() => {
    const selected = new Set(this.orderPetIds());
    return this.petOptions()
      .filter((entry) => selected.has(entry.value))
      .map((entry) => entry.label);
  });
  protected readonly selectedServiceLabels = computed(() =>
    this.selectedServiceOptions()
      .map((entry) => entry.label)
      .join(', '),
  );
  protected readonly selectedAssigneeLabel = computed(() => {
    const option = this.employeeOptionByValue(this.orderAssigneeSelection()[0]);
    return option?.label ?? 'Без назначения';
  });

  protected readonly visibleRange = computed(() => {
    const anchor = this.anchorDate();
    const ws = this.weekStartsOn();
    return visibleRangeForView(this.viewMode(), anchor, ws);
  });

  protected readonly loadKey = computed(() => {
    const id = this.state.tableId();
    const { from, to } = this.visibleRange();
    const reloadTick = this.state.calendarReloadTick();
    return {
      tableId: id,
      from: from.toISOString(),
      to: to.toISOString(),
      reloadTick,
    };
  });

  constructor() {
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((params) => {
      const focusAt = params.get('focusAt');
      const focusOrderRaw = params.get('focusOrderId');
      const focusOrderId = focusOrderRaw ? Number(focusOrderRaw) : NaN;
      if (focusAt) {
        const d = new Date(focusAt);
        if (Number.isFinite(d.getTime())) {
          this.anchorDate.set(new Date(d.getTime()));
          this.viewMode.set('day');
        }
      }
      if (Number.isFinite(focusOrderId) && focusOrderId > 0) {
        this.pendingFocusOrderId = focusOrderId;
        this.tryFocusPendingOrder();
      }
    });

    toObservable(this.loadKey)
      .pipe(
        distinctUntilChanged(
          (a, b) =>
            a.tableId === b.tableId &&
            a.from === b.from &&
            a.to === b.to &&
            a.reloadTick === b.reloadTick,
        ),
        tap(() => {
          this.loadError.set(null);
          this.slotsLoading.set(true);
        }),
        switchMap(({ tableId, from, to }) => {
          if (!tableId) {
            this.slotsLoading.set(false);
            return of<CalendarSlotDto[]>([]);
          }
          return this.auth.listCalendarSlots(tableId, from, to).pipe(
            catchError(() => {
              this.loadError.set('Не удалось загрузить слоты за выбранный период.');
              return of<CalendarSlotDto[]>([]);
            }),
            finalize(() => this.slotsLoading.set(false)),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((data) => this.slots.set(data));

    toObservable(this.loadKey)
      .pipe(
        distinctUntilChanged((a, b) => a.tableId === b.tableId && a.from === b.from && a.to === b.to && a.reloadTick === b.reloadTick),
        switchMap(({ tableId }) => {
          if (!tableId) {
            return of<WorkspaceOrderDto[]>([]);
          }
          return this.auth.listWorkspaceOrders(tableId, { limit: 200 }).pipe(
            catchError((err) => {
              this.notifyError(this.formatApiError(err, 'Не удалось загрузить заказы.'));
              return of<WorkspaceOrderDto[]>([]);
            }),
          );
        }),
        takeUntilDestroyed(),
      )
      .subscribe((orders) => {
        this.orders.set(orders);
        this.tryFocusPendingOrder();
      });

    toObservable(this.state.tableId)
      .pipe(
        distinctUntilChanged(),
        switchMap((tableId) => {
          if (!tableId) return of<WorkspaceDirectoryDto[]>([]);
          return this.auth.listWorkspaceDirectories(tableId).pipe(catchError(() => of<WorkspaceDirectoryDto[]>([])));
        }),
        takeUntilDestroyed(),
      )
      .subscribe((dirs) => this.directories.set(dirs));
  }

  protected onCalendarAnchorChange(d: Date): void {
    this.anchorDate.set(new Date(d.getTime()));
  }

  protected openCreateSlotDialog(): void {
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    this.createDialogVisible = true;
    this.createStep = 1;
    this.newTitle = '';
    this.newSelectedEmployeeIds = [];
    this.newDateFrom = this.toDateInputValue(now);
    this.newDateTo = this.toDateInputValue(tomorrow);
    this.newTimeFrom = '09:00';
    this.newTimeTo = '18:00';
    this.actionError = null;
  }

  protected openCreateOrderDialog(dateKey?: string): void {
    const now = dateKey ? this.dateFromDayKey(dateKey) : new Date();
    this.createOrderDialogVisible = true;
    this.createOrderStep = 1;
    this.editOrderId = null;
    this.orderDate = this.toDateInputValue(now);
    this.orderTimeFrom = '09:00';
    this.orderDurationMinutes = 60;
    this.orderTitle = '';
    this.orderClientSelection.set([]);
    this.orderPetIds.set([]);
    this.orderServiceIds.set([]);
    this.orderAssigneeSelection.set([]);
    this.orderPriceAdjustment.set(0);
    this.orderStatus.set('queued');
    this.orderStatusSelection.set(['queued']);
    this.orderWarnings = [];
    this.actionError = null;
  }

  protected closeCreateOrderDialog(): void {
    this.createOrderDialogVisible = false;
  }

  protected closeCreateSlotDialog(): void {
    this.createDialogVisible = false;
  }

  protected nextCreateStep(): void {
    if (this.createStep === 1 && this.newTitle.trim().length < 2) {
      this.notifyError('Название слота должно содержать минимум 2 символа.');
      return;
    }
    if (this.createStep < 3) {
      this.actionError = null;
      this.createStep += 1;
    }
  }

  protected prevCreateStep(): void {
    if (this.createStep > 1) {
      this.actionError = null;
      this.createStep -= 1;
    }
  }

  protected refresh(): void {
    const id = this.state.tableId();
    const { from, to } = this.visibleRange();
    if (!id) {
      return;
    }
    const { from: f, to: t } = toIsoRange(from, to);
    this.slotsLoading.set(true);
    this.loadError.set(null);
    this.auth
      .listCalendarSlots(id, f, t)
      .pipe(finalize(() => this.slotsLoading.set(false)))
      .subscribe({
        next: (data) => this.slots.set(data),
        error: () => this.loadError.set('Не удалось загрузить слоты.'),
      });
  }

  protected nextOrderStep(): void {
    this.createOrderStep = Math.min(this.createOrderStep + 1, 7);
    if (this.createOrderStep === 6) {
      this.checkOrderAvailability();
    }
  }

  protected prevOrderStep(): void {
    this.createOrderStep = Math.max(this.createOrderStep - 1, 1);
  }

  protected goOrderStep(step: number): void {
    this.createOrderStep = Math.max(1, Math.min(7, Math.round(step)));
    if (this.createOrderStep === 6) {
      this.checkOrderAvailability();
    }
  }

  protected saveOrderFromStepper(): void {
    const tableId = this.state.tableId();
    const startsAt = this.makeOrderStartDate();
    const endsAt = new Date(startsAt.getTime() + this.orderDurationMinutes * 60_000);
    const payload = {
      title: this.orderTitle.trim() || 'Заказ',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      client_directory_item_id: this.orderClientId(),
      assignee_user_id: this.orderAssigneeSelection()[0] ?? null,
      service_item_ids: [...this.orderServiceIds()],
      custom_directory_links: [],
      price_adjustment: Number(this.orderPriceAdjustment() || 0),
      metadata: {
        selected_pet_item_ids: [...this.orderPetIds()],
      },
      status: this.orderStatus(),
    };
    if (this.editOrderId) {
      this.auth.updateWorkspaceOrder(tableId, this.editOrderId, payload).subscribe({
        next: () => {
          this.createOrderDialogVisible = false;
          this.refreshOrdersAndSlots();
        },
        error: (err) => this.notifyError(this.formatApiError(err, 'Не удалось обновить заказ.')),
      });
      return;
    }
    this.auth.createWorkspaceOrder(tableId, payload).subscribe({
      next: () => {
        this.createOrderDialogVisible = false;
        this.refreshOrdersAndSlots();
      },
      error: (err) => this.notifyError(this.formatApiError(err, 'Не удалось создать заказ.')),
    });
  }

  protected openQuickClientDialog(): void {
    this.quickClientName = '';
    this.quickCreateClientVisible = true;
  }

  protected saveQuickClient(): void {
    const dir = this.clientsDirectory();
    if (!dir || !this.quickClientName.trim()) return;
    this.auth.addWorkspaceDirectoryItem(this.state.tableId(), dir.id, { label: this.quickClientName.trim(), payload: { firstName: this.quickClientName.trim() } }).subscribe({
      next: (item) => {
        this.quickCreateClientVisible = false;
        this.orderClientSelection.set([item.id]);
        this.reloadDirectories();
      },
      error: (err) => this.notifyError(this.formatApiError(err, 'Не удалось создать клиента.')),
    });
  }

  protected openQuickServiceDialog(): void {
    this.quickServiceName = '';
    this.quickServiceCost = 0;
    this.quickCreateServiceVisible = true;
  }

  protected saveQuickService(): void {
    const dir = this.servicesDirectory();
    if (!dir || !this.quickServiceName.trim()) return;
    this.auth.addWorkspaceDirectoryItem(this.state.tableId(), dir.id, {
      label: this.quickServiceName.trim(),
      payload: { title: this.quickServiceName.trim(), cost: Number(this.quickServiceCost || 0) },
    }).subscribe({
      next: (item) => {
        this.quickCreateServiceVisible = false;
        this.orderServiceIds.set([...new Set([...this.orderServiceIds(), item.id])]);
        this.reloadDirectories();
      },
      error: (err) => this.notifyError(this.formatApiError(err, 'Не удалось создать услугу.')),
    });
  }

  protected addSlot(): void {
    const id = this.state.tableId();
    this.actionError = null;
    const title = this.newTitle.trim();
    if (!title || !this.newDateFrom || !this.newDateTo || !this.newTimeFrom || !this.newTimeTo) {
      this.notifyError('Заполните название и время.');
      return;
    }
    const starts_at = new Date(`${this.newDateFrom}T${this.newTimeFrom}`).toISOString();
    const ends_at = new Date(`${this.newDateTo}T${this.newTimeTo}`).toISOString();
    const employeeNames = this.state.members()
      .filter((member) => this.newSelectedEmployeeIds.includes(member.user_id))
      .map((member) => member.short_name);
    const fullTitle = employeeNames.length > 0 ? `${title} (${employeeNames.join(', ')})` : title;
    this.auth.createCalendarSlot(id, { title: fullTitle, starts_at, ends_at }).subscribe({
      next: () => {
        this.createDialogVisible = false;
        this.newTitle = '';
        this.newSelectedEmployeeIds = [];
        this.refresh();
        this.state.bumpContextReload();
      },
      error: (err) => {
        this.notifyError(this.formatApiError(err, 'Не удалось создать слот.'));
      },
    });
  }

  protected removeSlot(slotId: number): void {
    const id = this.state.tableId();
    this.auth.deleteCalendarSlot(id, slotId).subscribe({
      next: () => {
        this.refresh();
        this.state.bumpContextReload();
      },
      error: (err) => {
        this.notifyError(this.formatApiError(err, 'Не удалось удалить.'));
      },
    });
  }

  protected onSlotContextMenu(payload: { slot: CalendarSlotDto; clientX: number; clientY: number }): void {
    this.selectedSlot = payload.slot;
    this.selectedOrder = payload.slot.id < 0 ? this.findOrderByCalendarSlotId(payload.slot.id) : null;
    this.selectedContextDateKey = this.dayKeyFromIso(payload.slot.starts_at);
    const pos = this.normalizeContextMenuPosition(payload.clientX, payload.clientY);
    this.slotMenuX = pos.x;
    this.slotMenuY = pos.y;
    this.slotMenuVisible = true;
  }

  protected onDayContextMenu(payload: { dateKey: string; clientX: number; clientY: number }): void {
    this.selectedSlot = null;
    this.selectedOrder = null;
    this.selectedContextDateKey = payload.dateKey;
    const pos = this.normalizeContextMenuPosition(payload.clientX, payload.clientY);
    this.slotMenuX = pos.x;
    this.slotMenuY = pos.y;
    this.slotMenuVisible = true;
  }

  protected closeSlotMenu(): void {
    this.slotMenuVisible = false;
  }

  @HostListener('document:click')
  protected onDocumentClick(): void {
    if (this.slotMenuVisible) {
      this.closeSlotMenu();
    }
  }

  protected openCreateOrderFromContext(): void {
    this.openCreateOrderDialog(this.selectedContextDateKey || undefined);
    this.slotMenuVisible = false;
  }

  protected openEditSlotDialog(): void {
    if (!this.selectedSlot) {
      return;
    }
    this.editingSlotId = this.selectedSlot.id;
    this.editTitle = this.selectedSlot.title;
    this.editStart = this.toDateTimeLocalValue(this.selectedSlot.starts_at);
    this.editEnd = this.toDateTimeLocalValue(this.selectedSlot.ends_at);
    this.editDialogVisible = true;
    this.slotMenuVisible = false;
  }

  protected saveEditedSlot(): void {
    const tableId = this.state.tableId();
    if (!this.editingSlotId) {
      return;
    }
    const title = this.editTitle.trim();
    if (!title || !this.editStart || !this.editEnd) {
      this.notifyError('Заполните название и время слота.');
      return;
    }
    this.auth
      .updateCalendarSlot(tableId, this.editingSlotId, {
        title,
        starts_at: new Date(this.editStart).toISOString(),
        ends_at: new Date(this.editEnd).toISOString(),
      })
      .subscribe({
        next: () => {
          this.editDialogVisible = false;
          this.editingSlotId = null;
          this.refresh();
          this.state.bumpContextReload();
        },
        error: (err) => {
          this.notifyError(this.formatApiError(err, 'Не удалось обновить слот.'));
        },
      });
  }

  protected deleteSelectedSlot(): void {
    if (!this.selectedSlot) {
      return;
    }
    const id = this.selectedSlot.id;
    this.slotMenuVisible = false;
    this.removeSlot(id);
  }

  protected onSlotDateDrop(payload: { slotId: number; targetDate: string }): void {
    const slotIdNum = Number(payload.slotId);
    if (slotIdNum < 0) {
      const orderId = Math.abs(slotIdNum);
      const order = this.orders().find((item) => Number(item.id) === orderId);
      if (!order) {
        return;
      }
      const startsAt = new Date(order.starts_at ?? order.created_at);
      this.editOrderId = order.id;
      this.createOrderDialogVisible = true;
      this.createOrderStep = 1;
      this.orderDate = payload.targetDate;
      this.orderTimeFrom = `${String(startsAt.getHours()).padStart(2, '0')}:${String(startsAt.getMinutes()).padStart(2, '0')}`;
      this.orderDurationMinutes = Math.max(30, Math.round(((new Date(order.ends_at ?? order.created_at)).getTime() - startsAt.getTime()) / 60000));
      this.orderTitle = order.title;
      this.applyOrderFormFromDto(order);
      this.orderWarnings = [];
      return;
    }
    const slot = this.slots().find((item) => Number(item.id) === slotIdNum);
    if (!slot) {
      return;
    }
    const startsAt = new Date(slot.starts_at);
    const endsAt = new Date(slot.ends_at);
    const durationMs = endsAt.getTime() - startsAt.getTime();
    const [year, month, day] = payload.targetDate.split('-').map(Number);
    const targetStart = new Date(year, month - 1, day, startsAt.getHours(), startsAt.getMinutes(), 0, 0);
    const targetEnd = new Date(targetStart.getTime() + durationMs);
    this.auth
      .updateCalendarSlot(this.state.tableId(), slot.id, {
        starts_at: targetStart.toISOString(),
        ends_at: targetEnd.toISOString(),
      })
      .subscribe({
        next: () => {
          this.refresh();
          this.state.bumpContextReload();
        },
        error: (err) => {
          this.notifyError(this.formatApiError(err, 'Не удалось перенести слот.'));
        },
      });
  }

  protected openEditOrderDialog(): void {
    const order = this.selectedOrder;
    if (!order) return;
    this.editOrderId = order.id;
    this.createOrderDialogVisible = true;
    this.createOrderStep = 1;
    const starts = new Date(order.starts_at ?? order.created_at);
    const ends = new Date(order.ends_at ?? order.created_at);
    this.orderDate = this.toDateInputValue(starts);
    this.orderTimeFrom = `${String(starts.getHours()).padStart(2, '0')}:${String(starts.getMinutes()).padStart(2, '0')}`;
    this.orderDurationMinutes = Math.max(30, Math.round((ends.getTime() - starts.getTime()) / 60000));
    this.orderTitle = order.title;
    this.applyOrderFormFromDto(order);
    this.orderWarnings = [];
    this.slotMenuVisible = false;
  }

  protected openDeleteOrderConfirm(): void {
    if (!this.selectedOrder) return;
    this.orderDeleteConfirmVisible = true;
    this.slotMenuVisible = false;
  }

  protected openCompleteOrderDialog(): void {
    if (!this.selectedOrder) return;
    this.completeOrderId = this.selectedOrder.id;
    this.completeOrderRating = 5;
    this.completeOrderComment = '';
    this.orderCompleteDialogVisible = true;
    this.slotMenuVisible = false;
  }

  protected setCompleteOrderRating(value: number): void {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    this.completeOrderRating = Math.max(1, Math.min(5, Math.round(numeric)));
  }

  protected confirmCompleteOrder(): void {
    if (!this.completeOrderId) return;
    const order = this.orders().find((item) => Number(item.id) === Number(this.completeOrderId));
    const existingMetadata = (order?.metadata && typeof order.metadata === 'object' ? order.metadata : {}) as Record<string, unknown>;
    const metadata = {
      ...existingMetadata,
      client_feedback: {
        rating: this.completeOrderRating,
        comment: this.completeOrderComment.trim() || null,
        rated_at: new Date().toISOString(),
      },
    };
    this.auth.updateWorkspaceOrder(this.state.tableId(), this.completeOrderId, {
      status: 'completed',
      metadata,
    }).subscribe({
      next: () => {
        this.orderCompleteDialogVisible = false;
        this.completeOrderId = null;
        this.completeOrderComment = '';
        this.refreshOrdersAndSlots();
      },
      error: (err) => this.notifyError(this.formatApiError(err, 'Не удалось завершить заказ.')),
    });
  }

  protected deleteSelectedOrderConfirmed(): void {
    if (!this.selectedOrder) return;
    this.auth.deleteWorkspaceOrder(this.state.tableId(), this.selectedOrder.id).subscribe({
      next: () => {
        this.orderDeleteConfirmVisible = false;
        this.refreshOrdersAndSlots();
      },
      error: (err) => this.notifyError(this.formatApiError(err, 'Не удалось удалить заказ.')),
    });
  }

  protected openCreateChildOrderDialog(type: 'follow_up' | 'repeat_copy'): void {
    if (!this.selectedOrder) return;
    this.childOrderSourceId = this.selectedOrder.id;
    this.childOrderType = type;
    this.childOrderDialogVisible = true;
    this.slotMenuVisible = false;
  }

  protected createChildOrderConfirmed(): void {
    if (!this.childOrderSourceId) return;
    this.auth.createWorkspaceChildOrder(this.state.tableId(), this.childOrderSourceId, { child_type: this.childOrderType }).subscribe({
      next: () => {
        this.childOrderDialogVisible = false;
        this.refreshOrdersAndSlots();
      },
      error: (err) => this.notifyError(this.formatApiError(err, 'Не удалось создать дочерний заказ.')),
    });
  }

  protected onOrderClientSelectionChange(values: unknown): void {
    const selected = this.normalizeMultiSelectNumberValues(values).slice(0, this.clientSelectionLimit());
    this.orderClientSelection.set(selected);
    const allowedPetIds = new Set(this.petOptions().map((entry) => entry.value));
    this.orderPetIds.set(this.orderPetIds().filter((entry) => allowedPetIds.has(entry)));
  }

  protected onOrderPetSelectionChange(values: unknown): void {
    const selected = this.normalizeMultiSelectNumberValues(values);
    const allowedPetIds = new Set(this.petOptions().map((entry) => entry.value));
    this.orderPetIds.set(selected.filter((entry) => allowedPetIds.has(entry)));
  }

  protected onOrderAssigneeSelectionChange(values: unknown): void {
    this.orderAssigneeSelection.set(this.normalizeMultiSelectNumberValues(values).slice(0, 1));
  }

  protected onOrderServicesChange(values: unknown): void {
    const normalized = this.normalizeMultiSelectNumberValues(values);
    this.orderServiceIds.set(normalized);
    if (!this.groomingSelected() && this.orderClientSelection().length > 1) {
      this.orderClientSelection.set(this.orderClientSelection().slice(0, 1));
    }
    if (!this.groomingSelected()) {
      this.orderPetIds.set([]);
    }
  }

  protected onOrderStatusSelectionChange(values: unknown): void {
    const selected = this.normalizeMultiSelectStringValues(values).slice(0, 1);
    this.orderStatusSelection.set(selected);
    this.orderStatus.set(selected[0] ?? 'queued');
  }

  protected onOrderPriceAdjustmentChange(value: number | string | null | undefined): void {
    const parsed = Number(value);
    this.orderPriceAdjustment.set(Number.isFinite(parsed) ? parsed : 0);
  }

  protected statusChipClass(statusValue: string): string {
    const option = this.statusOptionByValue(statusValue);
    return option?.tone ?? 'status-queued';
  }

  protected clientOptionByValue(value: number | null | undefined): { label: string; value: number; avatarUrl: string; subtitle: string } | null {
    if (!value) {
      return null;
    }
    return this.clientOptions().find((entry) => entry.value === value) ?? null;
  }

  protected petOptionByValue(value: number | null | undefined): { label: string; value: number; avatarUrl: string } | null {
    if (!value) {
      return null;
    }
    return this.petOptions().find((entry) => entry.value === value) ?? null;
  }

  protected serviceOptionByValue(value: number | null | undefined): { label: string; value: number; icon: string; cost: number; subservices: string[] } | null {
    if (!value) {
      return null;
    }
    return this.serviceOptions().find((entry) => entry.value === value) ?? null;
  }

  protected employeeOptionByValue(value: number | null | undefined): { label: string; value: number; isOwner: boolean; initials: string; role: string } | null {
    if (!value) {
      return null;
    }
    return this.employeeOptions().find((entry) => entry.value === value) ?? null;
  }

  protected statusOptionByValue(value: string | null | undefined): { value: string; label: string; icon: string; tone: string } | null {
    if (!value) {
      return null;
    }
    return this.statusOptions.find((entry) => entry.value === value) ?? null;
  }

  protected selectedClientFromUnknown(value: unknown): { label: string; value: number; avatarUrl: string; subtitle: string } | null {
    const option = this.payloadRecord(value);
    const directValue = Number(option['value']);
    if (Number.isFinite(directValue) && directValue > 0) {
      return this.clientOptionByValue(directValue);
    }
    return this.clientOptionByValue(Number(value));
  }

  protected selectedPetFromUnknown(value: unknown): { label: string; value: number; avatarUrl: string } | null {
    const option = this.payloadRecord(value);
    const directValue = Number(option['value']);
    if (Number.isFinite(directValue) && directValue > 0) {
      return this.petOptionByValue(directValue);
    }
    return this.petOptionByValue(Number(value));
  }

  protected selectedServiceFromUnknown(value: unknown): { label: string; value: number; icon: string; cost: number; subservices: string[] } | null {
    const option = this.payloadRecord(value);
    const directValue = Number(option['value']);
    if (Number.isFinite(directValue) && directValue > 0) {
      return this.serviceOptionByValue(directValue);
    }
    return this.serviceOptionByValue(Number(value));
  }

  protected selectedEmployeeFromUnknown(value: unknown): { label: string; value: number; isOwner: boolean; initials: string; role: string } | null {
    const option = this.payloadRecord(value);
    const directValue = Number(option['value']);
    if (Number.isFinite(directValue) && directValue > 0) {
      return this.employeeOptionByValue(directValue);
    }
    return this.employeeOptionByValue(Number(value));
  }

  protected selectedStatusFromUnknown(value: unknown): { value: string; label: string; icon: string; tone: string } | null {
    const option = this.payloadRecord(value);
    const directValue = String(option['value'] ?? '').trim();
    if (directValue) {
      return this.statusOptionByValue(directValue);
    }
    return this.statusOptionByValue(typeof value === 'string' ? value : null);
  }

  protected toggleEmployeeSelection(userId: number, checked: boolean): void {
    if (checked) {
      if (!this.newSelectedEmployeeIds.includes(userId)) {
        this.newSelectedEmployeeIds = [...this.newSelectedEmployeeIds, userId];
      }
      return;
    }
    this.newSelectedEmployeeIds = this.newSelectedEmployeeIds.filter((id) => id !== userId);
  }

  protected activeEmployeeNames(): string[] {
    return this.state.members()
      .filter((member) => this.newSelectedEmployeeIds.includes(member.user_id))
      .map((member) => member.short_name);
  }

  private toDateInputValue(value: Date): string {
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  private dateFromDayKey(dateKey: string): Date {
    const [year, month, day] = dateKey.split('-').map(Number);
    if (!year || !month || !day) {
      return new Date();
    }
    return new Date(year, month - 1, day);
  }

  private dayKeyFromIso(valueIso: string): string {
    const value = new Date(valueIso);
    return this.toDateInputValue(value);
  }

  private orderIntersectsRange(order: WorkspaceOrderDto, from: Date, to: Date): boolean {
    const startsRaw = order.starts_at ?? order.created_at;
    const endsRaw = order.ends_at ?? startsRaw;
    const starts = new Date(startsRaw);
    const ends = new Date(endsRaw);
    return ends >= from && starts <= to;
  }

  private toDateTimeLocalValue(valueIso: string): string {
    const value = new Date(valueIso);
    const year = value.getFullYear();
    const month = `${value.getMonth() + 1}`.padStart(2, '0');
    const day = `${value.getDate()}`.padStart(2, '0');
    const hours = `${value.getHours()}`.padStart(2, '0');
    const minutes = `${value.getMinutes()}`.padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  }

  private makeOrderStartDate(): Date {
    return new Date(`${this.orderDate}T${this.orderTimeFrom}:00`);
  }

  private checkOrderAvailability(): void {
    const startsAt = this.makeOrderStartDate();
    const endsAt = new Date(startsAt.getTime() + this.orderDurationMinutes * 60_000);
    this.auth
      .checkWorkspaceOrderAvailability(this.state.tableId(), {
        title: this.orderTitle.trim() || 'Заказ',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        client_directory_item_id: this.orderClientId(),
        assignee_user_id: this.orderAssigneeSelection()[0] ?? null,
        service_item_ids: [...this.orderServiceIds()],
        custom_directory_links: [],
        price_adjustment: Number(this.orderPriceAdjustment() || 0),
      })
      .subscribe({
        next: (resp) => {
          this.orderWarnings = (resp.warnings || []).map((w) => w.message);
          if (this.orderWarnings.length > 0) {
            this.notifyWarn(this.orderWarnings.join('\n'));
          }
        },
        error: () => (this.orderWarnings = []),
      });
  }

  private refreshOrdersAndSlots(): void {
    this.refresh();
    this.state.bumpCalendarReload();
    this.state.bumpContextReload();
  }

  private reloadDirectories(): void {
    this.auth.listWorkspaceDirectories(this.state.tableId()).subscribe({
      next: (dirs) => this.directories.set(dirs),
    });
  }

  private itemLabel(item: WorkspaceDirectoryItemDto): string {
    return item.label || String(item.id);
  }

  private applyOrderFormFromDto(order: WorkspaceOrderDto): void {
    const clientId = order.client_directory_item_id ?? null;
    this.orderClientSelection.set(clientId ? [clientId] : []);
    const metadata = this.payloadRecord(order.metadata);
    const petIdsRaw = metadata['selected_pet_item_ids'];
    this.orderPetIds.set(
      Array.isArray(petIdsRaw)
        ? petIdsRaw.map((entry) => Number(entry)).filter((entry) => Number.isFinite(entry))
        : [],
    );
    this.orderServiceIds.set([...(order.service_item_ids ?? [])]);
    this.orderAssigneeSelection.set(order.assignee_user_id ? [order.assignee_user_id] : []);
    this.orderPriceAdjustment.set(Number(order.price_adjustment ?? 0));
    this.orderStatus.set(order.status);
    this.orderStatusSelection.set([order.status]);
  }

  private extractCost(item: WorkspaceDirectoryItemDto): number {
    const payload = asServicePayload(item.payload);
    const subTotal = subservicesTotal(payload);
    if (subTotal > 0) {
      return subTotal;
    }
    const directCost = payload.cost > 0 ? payload.cost : this.toPositiveNumber(item.value);
    return directCost;
  }

  private toPositiveNumber(value: unknown): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  private findOrderByCalendarSlotId(slotId: number): WorkspaceOrderDto | null {
    const targetId = Math.abs(Number(slotId));
    if (!Number.isFinite(targetId)) {
      return null;
    }
    return this.orders().find((order) => Number(order.id) === targetId) ?? null;
  }

  private tryFocusPendingOrder(): void {
    if (!this.pendingFocusOrderId) {
      return;
    }
    const target = this.orders().find((o) => Number(o.id) === this.pendingFocusOrderId);
    if (!target) {
      return;
    }
    this.selectedOrder = target;
    this.selectedSlot = {
      id: -Number(target.id),
      title: `Заказ ${target.order_number ?? `#${target.id}`} · ${target.title}`,
      starts_at: target.starts_at ?? target.created_at,
      ends_at: target.ends_at ?? target.created_at,
    };
    this.pendingFocusOrderId = null;
  }

  private normalizeContextMenuPosition(clientX: number, clientY: number): { x: number; y: number } {
    const menuWidth = 260;
    const menuHeight = 220;
    const margin = 8;
    const maxX = Math.max(margin, window.innerWidth - menuWidth - margin);
    const maxY = Math.max(margin, window.innerHeight - menuHeight - margin);
    return {
      x: Math.min(Math.max(clientX, margin), maxX),
      y: Math.min(Math.max(clientY, margin), maxY),
    };
  }

  private payloadRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object') {
      return {};
    }
    return value as Record<string, unknown>;
  }

  private extractClientAvatar(item: WorkspaceDirectoryItemDto): string {
    const payload = this.payloadRecord(item.payload);
    return String(payload['avatarUrl'] ?? '').trim();
  }

  private extractClientPhone(item: WorkspaceDirectoryItemDto): string {
    const payload = this.payloadRecord(item.payload);
    return String(payload['phone'] ?? '').trim() || 'Телефон не указан';
  }

  private extractServiceIcon(item: WorkspaceDirectoryItemDto): string {
    const payload = this.payloadRecord(item.payload);
    const inner = this.payloadRecord(payload['inner']);
    const subservices = Array.isArray(inner['subservices']) ? inner['subservices'] : [];
    const first = subservices.length > 0 ? this.payloadRecord(subservices[0]) : {};
    return String(first['icon'] ?? '').trim() || 'pi pi-briefcase';
  }

  private extractServiceSubservices(item: WorkspaceDirectoryItemDto): string[] {
    const payload = this.payloadRecord(item.payload);
    const inner = this.payloadRecord(payload['inner']);
    const subservices = Array.isArray(inner['subservices']) ? inner['subservices'] : [];
    return subservices
      .map((entry) => String(this.payloadRecord(entry)['name'] ?? '').trim())
      .filter((entry) => entry.length > 0);
  }

  private normalizeMultiSelectNumberValues(values: unknown): number[] {
    if (!Array.isArray(values)) {
      return [];
    }
    const numeric = values
      .map((value) => {
        if (typeof value === 'number') {
          return value;
        }
        if (value && typeof value === 'object') {
          const record = this.payloadRecord(value);
          const candidate = Number(record['value'] ?? record['id'] ?? NaN);
          return candidate;
        }
        return Number(value);
      })
      .filter((value) => Number.isFinite(value) && value > 0);
    return [...new Set(numeric)];
  }

  private normalizeMultiSelectStringValues(values: unknown): string[] {
    if (!Array.isArray(values)) {
      return [];
    }
    const strings = values
      .map((value) => {
        if (typeof value === 'string') {
          return value.trim();
        }
        if (value && typeof value === 'object') {
          const record = this.payloadRecord(value);
          const candidate = record['value'] ?? record['id'];
          return typeof candidate === 'string' ? candidate.trim() : String(candidate ?? '').trim();
        }
        return String(value ?? '').trim();
      })
      .filter((value) => value.length > 0);
    return [...new Set(strings)];
  }

  private extractPetAvatar(item: WorkspaceDirectoryItemDto): string {
    const payload = this.payloadRecord(item.payload);
    const detail = this.payloadRecord(payload['detail']);
    return String(payload['iconUrl'] ?? detail['avatarUrl'] ?? '').trim();
  }

  private initials(value: string): string {
    const parts = value.trim().split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return 'U';
    }
    return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
  }

  private notifyError(message: string): void {
    this.messageService.add({
      key: 'calendarOrder',
      severity: 'error',
      summary: 'Ошибка',
      detail: message,
      life: 4500,
    });
  }

  private notifyWarn(message: string): void {
    this.messageService.add({
      key: 'calendarOrder',
      severity: 'warn',
      summary: 'Проверка заказа',
      detail: message,
      life: 5000,
    });
  }

  private formatApiError(err: unknown, fallback: string): string {
    const detail = (err as { error?: { detail?: unknown } })?.error?.detail;
    if (typeof detail === 'string' && detail.trim().length > 0) {
      return detail;
    }
    if (Array.isArray(detail)) {
      const message = detail
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry;
          }
          if (entry && typeof entry === 'object') {
            const msg = (entry as { msg?: unknown }).msg;
            return typeof msg === 'string' ? msg : '';
          }
          return '';
        })
        .filter(Boolean)
        .join('; ');
      if (message) {
        return message;
      }
    }
    if (detail && typeof detail === 'object') {
      const message = (detail as { message?: unknown }).message;
      if (typeof message === 'string' && message.trim().length > 0) {
        return message;
      }
    }
    return fallback;
  }

}
