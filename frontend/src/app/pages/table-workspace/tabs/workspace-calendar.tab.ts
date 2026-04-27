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

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';

import { AuthService, CalendarSlotDto, WorkspaceDirectoryDto, WorkspaceDirectoryItemDto, WorkspaceOrderDto } from '../../../core/auth/auth.service';
import { WorkspaceCalendarWidgetComponent } from '../../../shared/workspace-calendar-widget/workspace-calendar-widget.component';
import { TableWorkspaceState } from '../table-workspace.state';
import { CalendarViewMode, toIsoRange, visibleRangeForView, weekStartDayToJs } from './calendar-view.utils';

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
    WorkspaceCalendarWidgetComponent,
  ],
  templateUrl: './workspace-calendar.tab.html',
  styleUrl: './workspace-calendar.tab.scss',
})
export class WorkspaceCalendarTabComponent {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
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
  protected orderClientId: number | null = null;
  protected orderServiceIds: number[] = [];
  protected orderCustomSelections: Record<string, number[]> = {};
  protected orderAssigneeId: number | null = null;
  protected orderPriceAdjustment = 0;
  protected orderStatus = 'queued';
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
  protected readonly servicesDirectory = computed(() => this.directories().find((dir) => dir.kind === 'services') ?? null);
  protected readonly orderCustomDirectories = computed(() => {
    const enabled = new Set((this.state.detail()?.order_enabled_directory_ids ?? []).map((id) => Number(id)));
    return this.directories().filter((dir) => !dir.kind && enabled.has(dir.id));
  });
  protected readonly serviceOptions = computed(() => (this.servicesDirectory()?.items ?? []).map((it) => ({ label: this.itemLabel(it), value: it.id })));
  protected readonly clientOptions = computed(() => (this.clientsDirectory()?.items ?? []).map((it) => ({ label: this.itemLabel(it), value: it.id })));
  protected readonly selectedServiceCost = computed(() => {
    const services = this.servicesDirectory()?.items ?? [];
    return services
      .filter((it) => this.orderServiceIds.includes(it.id))
      .reduce((sum, it) => sum + this.extractCost(it), 0);
  });
  protected readonly orderPriceTotal = computed(() => this.selectedServiceCost() + Number(this.orderPriceAdjustment || 0));

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
              this.actionError = this.formatApiError(err, 'Не удалось загрузить заказы.');
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
    this.orderClientId = null;
    this.orderServiceIds = [];
    this.orderCustomSelections = {};
    this.orderAssigneeId = null;
    this.orderPriceAdjustment = 0;
    this.orderStatus = 'queued';
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
      this.actionError = 'Название слота должно содержать минимум 2 символа.';
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
    if (this.createOrderStep === 1 && !this.orderDate) {
      this.actionError = 'Выберите дату заказа.';
      return;
    }
    if (this.createOrderStep === 2 && !this.orderClientId) {
      this.actionError = 'Выберите клиента.';
      return;
    }
    if (this.createOrderStep === 3 && this.orderServiceIds.length === 0) {
      this.actionError = 'Выберите хотя бы одну услугу.';
      return;
    }
    this.actionError = null;
    this.createOrderStep = Math.min(this.createOrderStep + 1, 7);
    if (this.createOrderStep === 6) {
      this.checkOrderAvailability();
    }
  }

  protected prevOrderStep(): void {
    this.createOrderStep = Math.max(this.createOrderStep - 1, 1);
    this.actionError = null;
  }

  protected saveOrderFromStepper(): void {
    const tableId = this.state.tableId();
    const startsAt = this.makeOrderStartDate();
    const endsAt = new Date(startsAt.getTime() + this.orderDurationMinutes * 60_000);
    const payload = {
      title: this.orderTitle.trim() || 'Заказ',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      client_directory_item_id: this.orderClientId,
      assignee_user_id: this.orderAssigneeId,
      service_item_ids: [...this.orderServiceIds],
      custom_directory_links: this.buildCustomLinksPayload(),
      price_adjustment: Number(this.orderPriceAdjustment || 0),
      metadata: {
        customDirectories: this.orderCustomSelections,
      },
      status: this.orderStatus,
    };
    if (this.editOrderId) {
      this.auth.updateWorkspaceOrder(tableId, this.editOrderId, payload).subscribe({
        next: () => {
          this.createOrderDialogVisible = false;
          this.refreshOrdersAndSlots();
        },
        error: (err) => (this.actionError = this.formatApiError(err, 'Не удалось обновить заказ.')),
      });
      return;
    }
    this.auth.createWorkspaceOrder(tableId, payload).subscribe({
      next: () => {
        this.createOrderDialogVisible = false;
        this.refreshOrdersAndSlots();
      },
      error: (err) => (this.actionError = this.formatApiError(err, 'Не удалось создать заказ.')),
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
        this.orderClientId = item.id;
        this.reloadDirectories();
      },
      error: (err) => (this.actionError = this.formatApiError(err, 'Не удалось создать клиента.')),
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
        this.orderServiceIds = [...new Set([...this.orderServiceIds, item.id])];
        this.reloadDirectories();
      },
      error: (err) => (this.actionError = this.formatApiError(err, 'Не удалось создать услугу.')),
    });
  }

  protected addSlot(): void {
    const id = this.state.tableId();
    this.actionError = null;
    const title = this.newTitle.trim();
    if (!title || !this.newDateFrom || !this.newDateTo || !this.newTimeFrom || !this.newTimeTo) {
      this.actionError = 'Заполните название и время.';
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
        this.actionError = this.formatApiError(err, 'Не удалось создать слот.');
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
        this.actionError = this.formatApiError(err, 'Не удалось удалить.');
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
      this.actionError = 'Заполните название и время слота.';
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
          this.actionError = this.formatApiError(err, 'Не удалось обновить слот.');
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
      this.orderClientId = order.client_directory_item_id ?? null;
      this.orderServiceIds = [...(order.service_item_ids ?? [])];
      this.orderAssigneeId = order.assignee_user_id ?? null;
      this.orderPriceAdjustment = Number(order.price_adjustment ?? 0);
      this.orderStatus = order.status;
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
          this.actionError = this.formatApiError(err, 'Не удалось перенести слот.');
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
    this.orderClientId = order.client_directory_item_id ?? null;
    this.orderServiceIds = [...(order.service_item_ids ?? [])];
    this.orderAssigneeId = order.assignee_user_id ?? null;
    this.orderPriceAdjustment = Number(order.price_adjustment ?? 0);
    this.orderStatus = order.status;
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
      error: (err) => (this.actionError = this.formatApiError(err, 'Не удалось завершить заказ.')),
    });
  }

  protected deleteSelectedOrderConfirmed(): void {
    if (!this.selectedOrder) return;
    this.auth.deleteWorkspaceOrder(this.state.tableId(), this.selectedOrder.id).subscribe({
      next: () => {
        this.orderDeleteConfirmVisible = false;
        this.refreshOrdersAndSlots();
      },
      error: (err) => (this.actionError = this.formatApiError(err, 'Не удалось удалить заказ.')),
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
      error: (err) => (this.actionError = this.formatApiError(err, 'Не удалось создать дочерний заказ.')),
    });
  }

  protected setCustomSelection(directoryId: number, selected: number[]): void {
    this.orderCustomSelections = { ...this.orderCustomSelections, [String(directoryId)]: selected };
  }

  protected customDirectoryOptions(dir: WorkspaceDirectoryDto): Array<{ label: string; value: number }> {
    return (dir.items ?? []).map((item) => ({ label: this.itemLabel(item), value: item.id }));
  }

  protected customSelectionFor(directoryId: number): number[] {
    return this.orderCustomSelections[String(directoryId)] ?? [];
  }

  protected selectedClientLabel(): string {
    const item = this.clientOptions().find((client) => client.value === this.orderClientId);
    return item?.label ?? '—';
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

  private buildCustomLinksPayload(): Array<Record<string, unknown>> {
    return this.orderCustomDirectories()
      .map((dir) => ({
        directory_id: dir.id,
        item_ids: this.orderCustomSelections[String(dir.id)] ?? [],
      }))
      .filter((entry) => Array.isArray(entry.item_ids) && entry.item_ids.length > 0);
  }

  private checkOrderAvailability(): void {
    const startsAt = this.makeOrderStartDate();
    const endsAt = new Date(startsAt.getTime() + this.orderDurationMinutes * 60_000);
    this.auth
      .checkWorkspaceOrderAvailability(this.state.tableId(), {
        title: this.orderTitle.trim() || 'Заказ',
        starts_at: startsAt.toISOString(),
        ends_at: endsAt.toISOString(),
        client_directory_item_id: this.orderClientId,
        assignee_user_id: this.orderAssigneeId,
        service_item_ids: [...this.orderServiceIds],
        custom_directory_links: this.buildCustomLinksPayload(),
        price_adjustment: Number(this.orderPriceAdjustment || 0),
      })
      .subscribe({
        next: (resp) => (this.orderWarnings = (resp.warnings || []).map((w) => w.message)),
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

  private extractCost(item: WorkspaceDirectoryItemDto): number {
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const raw = payload['cost'];
    const value = Number(raw ?? 0);
    return Number.isFinite(value) ? value : 0;
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
