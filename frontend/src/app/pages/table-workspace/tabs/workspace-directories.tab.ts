import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TableModule } from 'primeng/table';

import { AuthService, WorkspaceDirectoryDto, WorkspaceDirectoryItemDto } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';
import {
  asClientPayload,
  asPetPayload,
  asServicePayload,
  cardLabelForKind,
  emptyClientPayload,
  emptyPetPayload,
  emptyServicePayload,
  PET_ANIMAL_TYPES,
  subservicesTotal,
  type ClientPayload,
  type PetPayload,
  type ServicePayload,
} from './directory-payload.models';

type TemplateKind = 'services' | 'clients' | 'pets';
type SelectedDirectoryFilter = 'all' | 'services' | 'clients' | 'pets' | 'custom';
type CustomFieldType = 'text' | 'number' | 'photo';
type CustomField = { id: string; key: string; label: string; type: CustomFieldType };

@Component({
  selector: 'app-workspace-directories-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule, DialogModule, TableModule],
  templateUrl: './workspace-directories.tab.html',
  styleUrl: './workspace-directories.tab.scss',
})
export class WorkspaceDirectoriesTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected readonly dirs = signal<WorkspaceDirectoryDto[]>([]);
  protected readonly err = signal<string | null>(null);
  protected readonly search = signal('');
  protected readonly selectedFilter = signal<SelectedDirectoryFilter>('all');
  protected readonly drawerOpen = signal(false);
  protected readonly selectedDirectoryId = signal<number | null>(null);
  protected readonly selectedItemId = signal<number | null>(null);
  protected readonly columnFilters = signal<Record<string, string>>({});
  protected readonly createWizardOpen = signal(false);
  protected readonly createWizardStep = signal(1);
  protected readonly createDirName = signal('');
  protected readonly createDirDescription = signal('');
  protected readonly createDirFields = signal<CustomField[]>([{ id: this.uid(), key: 'title', label: 'Название', type: 'text' }]);
  protected readonly customRowDialogOpen = signal(false);
  protected readonly customRowEditingItemId = signal<number | null>(null);
  protected readonly customRowValues = signal<Record<string, string>>({});

  protected readonly petAnimalTypes = PET_ANIMAL_TYPES;
  protected editor: { kind: TemplateKind; dirId: number; itemId: number | null } | null = null;
  protected editService: ServicePayload = emptyServicePayload();
  protected editClient: ClientPayload = emptyClientPayload();
  protected editPet: PetPayload = emptyPetPayload();

  protected readonly directoryKinds = [
    { key: 'all', label: 'Все' },
    { key: 'services', label: 'Услуги' },
    { key: 'clients', label: 'Клиенты' },
    { key: 'pets', label: 'Питомцы' },
    { key: 'custom', label: 'Свои' },
  ] as const;

  protected readonly stats = computed(() => {
    const list = this.dirs();
    return {
      totalDirs: list.length,
      services: list.filter((d) => d.kind === 'services').length,
      clients: list.filter((d) => d.kind === 'clients').length,
      pets: list.filter((d) => d.kind === 'pets').length,
      custom: list.filter((d) => !d.kind).length,
      totalItems: list.reduce((acc, d) => acc + d.items.length, 0),
    };
  });

  protected readonly visibleDirs = computed(() => {
    const text = this.search().trim().toLowerCase();
    const filter = this.selectedFilter();
    return this.dirs().filter((d) => {
      if (filter !== 'all') {
        if (filter === 'custom' && d.kind) {
          return false;
        }
        if (filter !== 'custom' && d.kind !== filter) {
          return false;
        }
      }
      if (!text) {
        return true;
      }
      const inHeader = d.name.toLowerCase().includes(text);
      const inItems = d.items.some((item) => this.itemSummary(d, item).toLowerCase().includes(text));
      return inHeader || inItems;
    });
  });

  protected readonly selectedDirectory = computed(() =>
    this.dirs().find((dir) => dir.id === this.selectedDirectoryId()) ?? null,
  );

  protected readonly selectedDirectoryFields = computed(() => {
    const dir = this.selectedDirectory();
    if (!dir || dir.kind) {
      return [];
    }
    return this.normalizeFields(dir.schema_fields);
  });

  protected readonly selectedDirectoryFilteredItems = computed(() => {
    const dir = this.selectedDirectory();
    if (!dir) {
      return [];
    }
    const globalSearch = this.search().trim().toLowerCase();
    const columnFilters = this.columnFilters();
    if (dir.kind) {
      return dir.items.filter((item) => this.itemSummary(dir, item).toLowerCase().includes(globalSearch));
    }
    return dir.items.filter((item) => {
      const row = this.rowValueMap(item, dir.id);
      const rowValues = Object.values(row).map((v) => String(v ?? ''));
      if (globalSearch) {
        const hit = rowValues.some((value) => value.toLowerCase().includes(globalSearch));
        if (!hit) {
          return false;
        }
      }
      for (const [key, value] of Object.entries(columnFilters)) {
        const query = value.trim().toLowerCase();
        if (!query) {
          continue;
        }
        if (!String(row[key] ?? '').toLowerCase().includes(query)) {
          return false;
        }
      }
      return true;
    });
  });

  protected readonly canCreateCustomDirectory = computed(() => this.canEdit && this.extraDirCount() < this.maxDirs);

  ngOnInit(): void {
    this.refresh();
  }

  protected get canEdit(): boolean {
    return !!this.state.detail()?.can_edit_settings;
  }

  protected get maxDirs(): number {
    return Math.max(this.state.bonusQty('extra_directories'), 1);
  }

  protected extraDirCount(): number {
    return this.dirs().filter((d) => !d.kind).length;
  }

  protected setSearch(value: string): void {
    this.search.set(value);
  }

  protected setSelectedFilter(value: SelectedDirectoryFilter): void {
    this.selectedFilter.set(value);
  }

  protected openCreateFromList(dir: WorkspaceDirectoryDto): void {
    this.selectedDirectoryId.set(dir.id);
    this.openCreate(dir);
    this.drawerOpen.set(true);
  }

  protected openEditFromList(dir: WorkspaceDirectoryDto, it: WorkspaceDirectoryItemDto): void {
    this.selectedDirectoryId.set(dir.id);
    this.openEdit(dir, it);
    this.drawerOpen.set(true);
  }

  protected closeDrawer(): void {
    this.drawerOpen.set(false);
    this.closeEditor();
  }

  protected refresh(): void {
    this.err.set(null);
    this.auth.listWorkspaceDirectories(this.state.tableId()).subscribe({
      next: (d) => {
        this.dirs.set(d);
        if (this.selectedDirectoryId() && !d.some((dir) => dir.id === this.selectedDirectoryId())) {
          this.selectedDirectoryId.set(null);
        }
        if (this.selectedItemId() && !this.selectedDirectoryFilteredItems().some((it) => it.id === this.selectedItemId())) {
          this.selectedItemId.set(null);
        }
      },
      error: () => this.err.set('Не удалось загрузить справочники.'),
    });
  }

  protected closeEditor(): void {
    this.editor = null;
    this.editService = emptyServicePayload();
    this.editClient = emptyClientPayload();
    this.editPet = emptyPetPayload();
  }

  protected openCreate(dir: WorkspaceDirectoryDto): void {
    if (!dir.kind) {
      return;
    }
    if (dir.kind === 'services') {
      this.editor = { kind: 'services', dirId: dir.id, itemId: null };
      this.editService = emptyServicePayload();
    } else if (dir.kind === 'clients') {
      this.editor = { kind: 'clients', dirId: dir.id, itemId: null };
      this.editClient = emptyClientPayload();
    } else if (dir.kind === 'pets') {
      this.editor = { kind: 'pets', dirId: dir.id, itemId: null };
      this.editPet = emptyPetPayload();
    }
  }

  protected openEdit(dir: WorkspaceDirectoryDto, it: WorkspaceDirectoryItemDto): void {
    if (!dir.kind) {
      return;
    }
    if (dir.kind === 'services') {
      this.editor = { kind: 'services', dirId: dir.id, itemId: it.id };
      this.editService = asServicePayload(it.payload);
    } else if (dir.kind === 'clients') {
      this.editor = { kind: 'clients', dirId: dir.id, itemId: it.id };
      this.editClient = asClientPayload(it.payload);
    } else if (dir.kind === 'pets') {
      this.editor = { kind: 'pets', dirId: dir.id, itemId: it.id };
      this.editPet = asPetPayload(it.payload);
    }
  }

  protected currentDirectoryName(): string {
    if (!this.editor) {
      return '';
    }
    return this.dirs().find((d) => d.id === this.editor?.dirId)?.name ?? '';
  }

  protected openDirectoryDetails(dirId: number): void {
    this.selectedDirectoryId.set(dirId);
    this.selectedItemId.set(null);
    this.columnFilters.set({});
    this.search.set('');
  }

  protected backToDirectoryCards(): void {
    this.selectedDirectoryId.set(null);
    this.selectedItemId.set(null);
    this.columnFilters.set({});
    this.search.set('');
    this.closeDrawer();
  }

  protected setColumnFilter(key: string, value: string): void {
    this.columnFilters.update((current) => ({ ...current, [key]: value }));
  }

  protected openCreateWizard(): void {
    this.err.set(null);
    if (!this.canCreateCustomDirectory()) {
      this.err.set(`Достигнут лимит: ${this.maxDirs} произвольных справочников.`);
      return;
    }
    this.createDirName.set('');
    this.createDirDescription.set('');
    this.createDirFields.set([{ id: this.uid(), key: 'title', label: 'Название', type: 'text' }]);
    this.createWizardStep.set(1);
    this.createWizardOpen.set(true);
  }

  protected closeCreateWizard(): void {
    this.createWizardOpen.set(false);
  }

  protected nextCreateWizardStep(): void {
    if (this.createWizardStep() === 1) {
      if (!this.createDirName().trim()) {
        this.err.set('Введите название справочника.');
        return;
      }
      this.err.set(null);
    }
    if (this.createWizardStep() < 3) {
      this.createWizardStep.update((step) => step + 1);
    }
  }

  protected prevCreateWizardStep(): void {
    if (this.createWizardStep() > 1) {
      this.createWizardStep.update((step) => step - 1);
    }
  }

  protected addCreateField(): void {
    this.createDirFields.update((fields) => [
      ...fields,
      { id: this.uid(), key: `field_${fields.length + 1}`, label: `Поле ${fields.length + 1}`, type: 'text' },
    ]);
  }

  protected removeCreateField(id: string): void {
    this.createDirFields.update((fields) => fields.filter((field) => field.id !== id));
  }

  protected updateCreateField(
    id: string,
    patch: Partial<{ key: string; label: string; type: CustomFieldType }>,
  ): void {
    this.createDirFields.update((fields) =>
      fields.map((field) =>
        field.id === id
          ? {
              ...field,
              ...patch,
              key: patch.key !== undefined ? this.normalizeFieldKey(patch.key) : field.key,
            }
          : field,
      ),
    );
  }

  protected completeCreateWizard(): void {
    if (!this.canCreateCustomDirectory()) {
      this.err.set(`Достигнут лимит: ${this.maxDirs} произвольных справочников.`);
      return;
    }
    const name = this.createDirName().trim();
    if (!name) {
      this.err.set('Введите название справочника.');
      return;
    }
    const fields: CustomField[] = this.createDirFields()
      .map((field): CustomField => ({
        ...field,
        key: this.normalizeFieldKey(field.key),
        label: field.label.trim() || field.key,
      }))
      .filter((field): field is CustomField => field.key.length > 0);
    if (fields.length === 0) {
      this.err.set('Добавьте хотя бы одно поле в конструкторе.');
      return;
    }
    this.auth
      .createWorkspaceDirectory(this.state.tableId(), {
        name,
        description: this.createDirDescription().trim() || null,
        schema_fields: fields.map((field) => ({ key: field.key, label: field.label, type: field.type })),
      })
      .subscribe({
      next: (created) => {
        this.createWizardOpen.set(false);
        this.refresh();
        this.selectedDirectoryId.set(created.id);
      },
      error: (e) => this.err.set(e?.error?.detail ?? 'Ошибка создания справочника'),
    });
  }

  protected saveEditor(): void {
    const e = this.editor;
    if (!e) {
      return;
    }
    const tid = this.state.tableId();
    if (e.kind === 'services') {
      const data = { ...this.editService };
      const sub = subservicesTotal(data);
      if (sub > 0) {
        data.cost = sub;
      }
      const label = cardLabelForKind('services', data, 'Услуга');
      const payload = { ...data } as Record<string, unknown>;
      if (e.itemId == null) {
        this.auth.addWorkspaceDirectoryItem(tid, e.dirId, { label, payload }).subscribe({
          next: () => {
            this.refresh();
            this.closeDrawer();
          },
          error: (err) => this.err.set(err?.error?.detail ?? 'Ошибка сохранения'),
        });
      } else {
        this.auth.patchWorkspaceDirectoryItem(tid, e.dirId, e.itemId, { label, payload }).subscribe({
          next: () => {
            this.refresh();
            this.closeDrawer();
          },
          error: (err) => this.err.set(err?.error?.detail ?? 'Ошибка сохранения'),
        });
      }
      return;
    }
    if (e.kind === 'clients') {
      const data = { ...this.editClient };
      const label = cardLabelForKind('clients', data, 'Клиент');
      const payload = { ...data } as Record<string, unknown>;
      if (e.itemId == null) {
        this.auth.addWorkspaceDirectoryItem(tid, e.dirId, { label, payload }).subscribe({
          next: () => {
            this.refresh();
            this.closeDrawer();
          },
          error: (err) => this.err.set(err?.error?.detail ?? 'Ошибка сохранения'),
        });
      } else {
        this.auth.patchWorkspaceDirectoryItem(tid, e.dirId, e.itemId, { label, payload }).subscribe({
          next: () => {
            this.refresh();
            this.closeDrawer();
          },
          error: (err) => this.err.set(err?.error?.detail ?? 'Ошибка сохранения'),
        });
      }
      return;
    }
    if (e.kind === 'pets') {
      const data = { ...this.editPet };
      const label = cardLabelForKind('pets', data, 'Питомец');
      const payload = { ...data } as Record<string, unknown>;
      if (e.itemId == null) {
        this.auth.addWorkspaceDirectoryItem(tid, e.dirId, { label, payload }).subscribe({
          next: () => {
            this.refresh();
            this.closeDrawer();
          },
          error: (err) => this.err.set(err?.error?.detail ?? 'Ошибка сохранения'),
        });
      } else {
        this.auth.patchWorkspaceDirectoryItem(tid, e.dirId, e.itemId, { label, payload }).subscribe({
          next: () => {
            this.refresh();
            this.closeDrawer();
          },
          error: (err) => this.err.set(err?.error?.detail ?? 'Ошибка сохранения'),
        });
      }
    }
  }

  protected openCustomRowCreate(): void {
    const dir = this.selectedDirectory();
    if (!dir || dir.kind) {
      return;
    }
    const values: Record<string, string> = {};
    for (const field of this.selectedDirectoryFields()) {
      values[field.key] = '';
    }
    this.customRowValues.set(values);
    this.customRowEditingItemId.set(null);
    this.customRowDialogOpen.set(true);
  }

  protected openCustomRowEdit(item: WorkspaceDirectoryItemDto): void {
    const dir = this.selectedDirectory();
    if (!dir || dir.kind) {
      return;
    }
    const values = this.rowValueMap(item, dir.id);
    const stringValues: Record<string, string> = {};
    for (const field of this.selectedDirectoryFields()) {
      stringValues[field.key] = String(values[field.key] ?? '');
    }
    this.customRowValues.set(stringValues);
    this.customRowEditingItemId.set(item.id);
    this.customRowDialogOpen.set(true);
  }

  protected closeCustomRowDialog(): void {
    this.customRowDialogOpen.set(false);
    this.customRowEditingItemId.set(null);
  }

  protected setCustomRowValue(key: string, value: string): void {
    this.customRowValues.update((current) => ({ ...current, [key]: value }));
  }

  protected saveCustomRow(): void {
    const dir = this.selectedDirectory();
    if (!dir || dir.kind) {
      return;
    }
    const fields = this.selectedDirectoryFields();
    if (fields.length === 0) {
      this.err.set('У этого справочника нет сконфигурированных полей.');
      return;
    }
    const payload: Record<string, unknown> = {};
    const values = this.customRowValues();
    for (const field of fields) {
      const raw = (values[field.key] ?? '').trim();
      if (field.type === 'number') {
        payload[field.key] = raw ? Number(raw) : 0;
      } else {
        payload[field.key] = raw;
      }
    }
    const mainField = fields[0];
    const label = String(payload[mainField.key] ?? '').trim() || 'Запись';
    const value = fields.length > 1 ? String(payload[fields[1].key] ?? '').trim() : null;
    const itemId = this.customRowEditingItemId();
    if (itemId === null) {
      this.auth.addWorkspaceDirectoryItem(this.state.tableId(), dir.id, { label, value, payload }).subscribe({
        next: () => {
          this.closeCustomRowDialog();
          this.refresh();
        },
        error: (e) => this.err.set(e?.error?.detail ?? 'Ошибка добавления записи'),
      });
    } else {
      this.auth.patchWorkspaceDirectoryItem(this.state.tableId(), dir.id, itemId, { label, value, payload }).subscribe({
        next: () => {
          this.closeCustomRowDialog();
          this.refresh();
        },
        error: (e) => this.err.set(e?.error?.detail ?? 'Ошибка обновления записи'),
      });
    }
  }

  protected deleteItem(dirId: number, itemId: number): void {
    this.auth.deleteWorkspaceDirectoryItem(this.state.tableId(), dirId, itemId).subscribe({
      next: () => {
        if (this.selectedItemId() === itemId) {
          this.selectedItemId.set(null);
        }
        this.refresh();
      },
      error: (err) => this.err.set(err?.error?.detail ?? 'Ошибка удаления'),
    });
  }

  protected petsDirectoryItems(): WorkspaceDirectoryItemDto[] {
    const p = this.dirs().find((d) => d.kind === 'pets');
    return p?.items ?? [];
  }

  protected addSubservice(): void {
    this.editService.inner.subservices.push({ name: '', cost: 0, durationMinutes: 0, icon: '' });
  }

  protected removeSubservice(i: number): void {
    this.editService.inner.subservices.splice(i, 1);
  }

  protected addClientHistory(): void {
    this.editClient.detail.serviceHistory.push({ date: '', serviceTitle: '' });
  }

  protected removeClientHistory(i: number): void {
    this.editClient.detail.serviceHistory.splice(i, 1);
  }

  protected addPetVisit(): void {
    this.editPet.detail.visitHistory.push({ date: '', note: '' });
  }

  protected removePetVisit(i: number): void {
    this.editPet.detail.visitHistory.splice(i, 1);
  }

  protected togglePetForClient(petId: number, checked: boolean): void {
    const ids = this.editClient.detail.petItemIds;
    if (checked && !ids.includes(petId)) {
      this.editClient.detail.petItemIds = [...ids, petId];
    } else if (!checked) {
      this.editClient.detail.petItemIds = ids.filter((x) => x !== petId);
    }
  }

  protected isPetSelectedForClient(petId: number): boolean {
    return this.editClient.detail.petItemIds.includes(petId);
  }

  protected itemSummary(dir: WorkspaceDirectoryDto, it: WorkspaceDirectoryItemDto): string {
    if (!dir.kind) {
      return `${it.label}: ${it.value ?? '—'}`;
    }
    return cardLabelForKind(dir.kind, it.payload, it.label);
  }

  protected itemBadges(dir: WorkspaceDirectoryDto, it: WorkspaceDirectoryItemDto): string[] {
    if (dir.kind === 'services') {
      const p = asServicePayload(it.payload);
      const badges: string[] = [];
      if (p.cost > 0) {
        badges.push(`${p.cost} ₽`);
      }
      if (p.inner.subservices.length > 0) {
        badges.push(`Подуслуг: ${p.inner.subservices.length}`);
      }
      return badges;
    }
    if (dir.kind === 'clients') {
      const p = asClientPayload(it.payload);
      const badges: string[] = [];
      badges.push(`Рейтинг: ${p.detail.rating}`);
      badges.push(`Питомцев: ${p.petCount}`);
      if (!p.phone.trim()) {
        badges.push('Нет телефона');
      }
      return badges;
    }
    if (dir.kind === 'pets') {
      const p = asPetPayload(it.payload);
      const badges: string[] = [];
      if (p.detail.animalType) {
        badges.push(p.detail.animalType);
      }
      if (p.ownerName) {
        badges.push(`Владелец: ${p.ownerName}`);
      }
      if (p.detail.visitHistory.length > 0) {
        badges.push(`Приёмов: ${p.detail.visitHistory.length}`);
      }
      return badges;
    }
    return [it.value ? 'Заполнено' : 'Пусто'];
  }

  protected directoryKindLabel(dir: WorkspaceDirectoryDto): string {
    if (dir.kind === 'services') {
      return 'Услуги';
    }
    if (dir.kind === 'clients') {
      return 'Клиенты';
    }
    if (dir.kind === 'pets') {
      return 'Питомцы';
    }
    return 'Свой';
  }

  protected sumSubservices(s: ServicePayload): number {
    return subservicesTotal(s);
  }

  protected petCheckboxLabel(it: WorkspaceDirectoryItemDto): string {
    return cardLabelForKind('pets', it.payload, it.label);
  }

  protected addDirectory(): void {
    this.openCreateWizard();
  }

  protected removeDir(dirId: number): void {
    this.auth.deleteWorkspaceDirectory(this.state.tableId(), dirId).subscribe({
      next: () => {
        if (this.selectedDirectoryId() === dirId) {
          this.backToDirectoryCards();
        }
        this.refresh();
      },
      error: (e) => this.err.set(e?.error?.detail ?? 'Ошибка'),
    });
  }

  protected customDirectoryDescription(dirId: number): string {
    return this.dirs().find((d) => d.id === dirId)?.description ?? '';
  }

  protected customPreviewColumns(): CustomField[] {
    return this.createDirFields()
      .map((field) => ({ ...field, key: this.normalizeFieldKey(field.key), label: field.label.trim() || field.key }))
      .filter((field) => field.key.length > 0);
  }

  protected getColumnFilterValue(key: string): string {
    return this.columnFilters()[key] || '';
  }

  protected getCustomRowValue(key: string): string {
    return this.customRowValues()[key] || '';
  }

  protected selectItem(itemId: number): void {
    this.selectedItemId.set(itemId);
  }

  protected selectedItem(): WorkspaceDirectoryItemDto | null {
    const id = this.selectedItemId();
    if (!id) {
      return null;
    }
    return this.selectedDirectoryFilteredItems().find((item) => item.id === id) ?? null;
  }

  protected editSelected(): void {
    const dir = this.selectedDirectory();
    const item = this.selectedItem();
    if (!dir || !item) {
      return;
    }
    if (dir.kind) {
      this.openEditFromList(dir, item);
      return;
    }
    this.openCustomRowEdit(item);
  }

  protected deleteSelected(): void {
    const dir = this.selectedDirectory();
    const item = this.selectedItem();
    if (!dir || !item) {
      return;
    }
    this.deleteItem(dir.id, item.id);
  }

  protected directoryIcon(kind: string | null | undefined): string {
    if (kind === 'services') {
      return 'pi pi-briefcase';
    }
    if (kind === 'clients') {
      return 'pi pi-users';
    }
    if (kind === 'pets') {
      return 'pi pi-heart-fill';
    }
    return 'pi pi-folder';
  }

  protected clientRows(items: WorkspaceDirectoryItemDto[]): Array<{
    item: WorkspaceDirectoryItemDto;
    fullName: string;
    phone: string;
    rating: number;
    petCount: number;
  }> {
    return items.map((item) => {
      const payload = asClientPayload(item.payload);
      return {
        item,
        fullName: `${payload.lastName} ${payload.firstName}`.trim() || item.label,
        phone: payload.phone || '—',
        rating: payload.detail.rating,
        petCount: payload.petCount,
      };
    });
  }

  protected rowValueMap(item: WorkspaceDirectoryItemDto, dirId: number): Record<string, unknown> {
    const dir = this.dirs().find((d) => d.id === dirId);
    const meta = this.normalizeFields(dir?.schema_fields);
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    if (meta.length === 0) {
      return { label: item.label, value: item.value ?? '' };
    }
    const row: Record<string, unknown> = {};
    for (const field of meta) {
      row[field.key] = payload[field.key] ?? '';
    }
    return row;
  }

  protected asTableCell(value: unknown): string {
    if (value === null || value === undefined) {
      return '';
    }
    return String(value);
  }

  private normalizeFields(input: Array<Record<string, unknown>> | null | undefined): CustomField[] {
    if (!Array.isArray(input)) {
      return [];
    }
    return input
      .map((field): CustomField => {
        const typeRaw = String(field['type'] ?? '').toLowerCase();
        const type: CustomFieldType = typeRaw === 'number' || typeRaw === 'photo' ? typeRaw : 'text';
        const key = this.normalizeFieldKey(String(field['key'] ?? ''));
        const label = String(field['label'] ?? '').trim() || key;
        return {
          id: String(field['id'] ?? this.uid()),
          key,
          label,
          type,
        };
      })
      .filter((field) => !!field.key);
  }

  private normalizeFieldKey(raw: string): string {
    return raw
      .trim()
      .toLowerCase()
      .replace(/[^a-zа-я0-9_]+/gi, '_')
      .replace(/^_+|_+$/g, '');
  }

  private uid(): string {
    return Math.random().toString(36).slice(2, 10);
  }
}
