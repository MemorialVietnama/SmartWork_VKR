import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { forkJoin } from 'rxjs';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { MultiSelectModule } from 'primeng/multiselect';
import { TableModule } from 'primeng/table';

import {
  AuthService,
  TemplateDirectoryStateDto,
  WorkspaceDirectoryDto,
  WorkspaceDirectoryItemDto,
} from '../../../core/auth/auth.service';
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
type CustomFieldType = 'text' | 'number' | 'photo' | 'boolean' | 'date' | 'datetime' | 'email' | 'phone' | 'url' | 'json' | 'relation';
type RelationConfig = { directoryId: number | null; displayFieldKey: string; multiple: boolean };
type CustomField = { id: string; key: string; label: string; type: CustomFieldType; relation: RelationConfig | null };
type RelationPayloadValue = { valueId: number | null; valueLabel: string };
type RelationModeValue = 'multiple';

@Component({
  selector: 'app-workspace-directories-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule, DialogModule, TableModule, MultiSelectModule],
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
  protected readonly createDirFields = signal<CustomField[]>([
    { id: this.uid(), key: 'title', label: 'Название', type: 'text', relation: null },
  ]);
  protected readonly customRowDialogOpen = signal(false);
  protected readonly customRowEditingItemId = signal<number | null>(null);
  protected readonly customRowValues = signal<Record<string, string>>({});
  protected readonly customRowRelationMultiValues = signal<Record<string, number[]>>({});
  protected readonly templateDirectories = signal<TemplateDirectoryStateDto[]>([]);
  protected readonly syncingTemplates = signal(false);
  protected readonly templatePickerOpen = signal(false);
  protected readonly templateSelection = signal<string[]>([]);

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

  protected readonly customFieldTypeOptions: Array<{ value: CustomFieldType; label: string }> = [
    { value: 'text', label: 'Текст' },
    { value: 'number', label: 'Число' },
    { value: 'boolean', label: 'Да/Нет' },
    { value: 'date', label: 'Дата' },
    { value: 'datetime', label: 'Дата и время' },
    { value: 'email', label: 'Email' },
    { value: 'phone', label: 'Телефон' },
    { value: 'url', label: 'Ссылка URL' },
    { value: 'json', label: 'JSON' },
    { value: 'photo', label: 'Фото URL' },
    { value: 'relation', label: 'Связь со справочником' },
  ];
  protected readonly relationModeOptions: Array<{ label: string; value: RelationModeValue }> = [
    { label: 'Множественный выбор', value: 'multiple' },
  ];

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
      const rowValues = this.selectedDirectoryFields().map((field) => this.searchableFieldValue(field, row[field.key]));
      if (globalSearch) {
        const hit = rowValues.some((value) => value.includes(globalSearch));
        if (!hit) {
          return false;
        }
      }
      for (const [key, value] of Object.entries(columnFilters)) {
        const query = value.trim().toLowerCase();
        if (!query) {
          continue;
        }
        const field = this.selectedDirectoryFields().find((entry) => entry.key === key);
        if (!field) {
          continue;
        }
        if (!this.searchableFieldValue(field, row[key]).includes(query)) {
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
    const tableId = this.state.tableId();
    const loadDirectories = () =>
      forkJoin({
        dirs: this.auth.listWorkspaceDirectories(tableId),
        templates: this.auth.listTemplateWorkspaceDirectories(tableId),
      }).subscribe({
        next: ({ dirs, templates }) => {
          this.dirs.set(dirs);
          this.templateDirectories.set(templates);
          if (this.selectedDirectoryId() && !dirs.some((dir) => dir.id === this.selectedDirectoryId())) {
            this.selectedDirectoryId.set(null);
          }
          if (this.selectedItemId() && !this.selectedDirectoryFilteredItems().some((it) => it.id === this.selectedItemId())) {
            this.selectedItemId.set(null);
          }
        },
        error: () => this.err.set('Не удалось загрузить справочники.'),
      });
    if (this.canEdit) {
      this.syncingTemplates.set(true);
      this.auth.repairPresetWorkspaceDirectories(tableId).subscribe({
        next: () => {
          this.syncingTemplates.set(false);
          loadDirectories();
        },
        error: () => {
          this.syncingTemplates.set(false);
          loadDirectories();
        },
      });
      return;
    }
    loadDirectories();
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
    this.createDirFields.set([{ id: this.uid(), key: 'title', label: 'Название', type: 'text', relation: null }]);
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
      { id: this.uid(), key: `field_${fields.length + 1}`, label: `Поле ${fields.length + 1}`, type: 'text', relation: null },
    ]);
  }

  protected removeCreateField(id: string): void {
    this.createDirFields.update((fields) => fields.filter((field) => field.id !== id));
  }

  protected updateCreateField(
    id: string,
    patch: Partial<{ key: string; label: string; type: CustomFieldType; relation: RelationConfig | null }>,
  ): void {
    this.createDirFields.update((fields) =>
      fields.map((field) =>
        field.id === id ? this.normalizeCustomField({ ...field, ...patch, key: patch.key !== undefined ? this.normalizeFieldKey(patch.key) : field.key }) : field,
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
        ...this.normalizeCustomField(field),
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
        schema_fields: fields.map((field) => ({
          key: field.key,
          label: field.label,
          type: field.type,
          relation: field.type === 'relation' ? field.relation : null,
        })),
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
    const relationMultiValues: Record<string, number[]> = {};
    for (const field of this.selectedDirectoryFields()) {
      values[field.key] = '';
      if (field.type === 'boolean') {
        values[field.key] = 'false';
      }
      if (field.type === 'relation' && field.relation?.multiple) {
        relationMultiValues[field.key] = [];
      }
    }
    this.customRowValues.set(values);
    this.customRowRelationMultiValues.set(relationMultiValues);
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
    const relationMultiValues: Record<string, number[]> = {};
    for (const field of this.selectedDirectoryFields()) {
      const current = values[field.key];
      if (field.type === 'relation') {
        if (field.relation?.multiple) {
          const list = this.asRelationPayloadList(current);
          relationMultiValues[field.key] = list
            .map((entry) => Number(entry.valueId))
            .filter((value) => Number.isFinite(value));
          stringValues[field.key] = '';
        } else {
          const relation = this.asRelationPayloadSingle(current);
          stringValues[field.key] = relation.valueId !== null ? String(relation.valueId) : '';
        }
      } else if (field.type === 'boolean') {
        stringValues[field.key] = String(Boolean(current));
      } else if (field.type === 'json') {
        stringValues[field.key] = typeof current === 'string' ? current : JSON.stringify(current ?? {});
      } else {
        stringValues[field.key] = String(current ?? '');
      }
    }
    this.customRowValues.set(stringValues);
    this.customRowRelationMultiValues.set(relationMultiValues);
    this.customRowEditingItemId.set(item.id);
    this.customRowDialogOpen.set(true);
  }

  protected closeCustomRowDialog(): void {
    this.customRowDialogOpen.set(false);
    this.customRowEditingItemId.set(null);
    this.customRowRelationMultiValues.set({});
  }

  protected setCustomRowValue(key: string, value: string): void {
    this.customRowValues.update((current) => ({ ...current, [key]: value }));
  }

  protected setCustomRowRelationSingleValue(key: string, value: string): void {
    this.setCustomRowValue(key, value);
  }

  protected setCustomRowRelationMultiValues(key: string, values: number[] | null | undefined): void {
    this.customRowRelationMultiValues.update((current) => ({ ...current, [key]: values ?? [] }));
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
      switch (field.type) {
        case 'number':
          payload[field.key] = raw ? Number(raw) : 0;
          break;
        case 'boolean':
          payload[field.key] = raw === 'true';
          break;
        case 'json':
          payload[field.key] = this.parseJsonSafe(raw);
          break;
        case 'relation': {
          if (field.relation?.multiple) {
            const selectedIds = this.customRowRelationMultiValues()[field.key] ?? [];
            payload[field.key] = selectedIds.map((id) => this.makeRelationPayloadEntry(field, id));
          } else {
            const relationId = Number(raw);
            payload[field.key] = Number.isFinite(relationId) && relationId > 0
              ? this.makeRelationPayloadEntry(field, relationId)
              : { valueId: null, valueLabel: '' };
          }
          break;
        }
        default:
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
    this.err.set('Создание кастомных справочников отключено. Подключайте типовые шаблоны.');
  }

  protected toggleTemplate(kind: string, enabled: boolean): void {
    this.err.set(null);
    this.auth.toggleTemplateWorkspaceDirectory(this.state.tableId(), kind, enabled).subscribe({
      next: () => this.refresh(),
      error: (e) => this.err.set(e?.error?.detail ?? 'Не удалось обновить шаблон справочника'),
    });
  }

  protected openTemplatePicker(): void {
    const selected = this.templateDirectories()
      .filter((tpl) => tpl.enabled)
      .map((tpl) => tpl.kind);
    this.templateSelection.set(selected);
    this.templatePickerOpen.set(true);
  }

  protected closeTemplatePicker(): void {
    this.templatePickerOpen.set(false);
  }

  protected templateOptionItems(): Array<{ label: string; value: string }> {
    return this.templateDirectories().map((tpl) => ({
      value: tpl.kind,
      label: tpl.connected ? `${tpl.name} (preset)` : tpl.name,
    }));
  }

  protected saveTemplateSelection(): void {
    const selected = new Set(this.templateSelection());
    const updates = this.templateDirectories()
      .filter((tpl) => (tpl.enabled && !selected.has(tpl.kind)) || (!tpl.enabled && selected.has(tpl.kind)))
      .map((tpl) => this.auth.toggleTemplateWorkspaceDirectory(this.state.tableId(), tpl.kind, selected.has(tpl.kind)));
    if (updates.length === 0) {
      this.closeTemplatePicker();
      return;
    }
    this.err.set(null);
    forkJoin(updates).subscribe({
      next: () => {
        this.closeTemplatePicker();
        this.refresh();
      },
      error: (e) => this.err.set(e?.error?.detail ?? 'Не удалось применить изменения по справочникам'),
    });
  }

  protected cleanupLegacyCustom(): void {
    this.err.set(null);
    this.auth.cleanupLegacyCustomWorkspaceDirectories(this.state.tableId()).subscribe({
      next: (resp) => {
        this.err.set(`${resp.detail}: удалено ${resp.removed_directories} справочников и ${resp.removed_items} записей.`);
        this.backToDirectoryCards();
        this.refresh();
      },
      error: (e) => this.err.set(e?.error?.detail ?? 'Не удалось удалить legacy-кастомные справочники'),
    });
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
      .map((field) => ({ ...this.normalizeCustomField(field), key: this.normalizeFieldKey(field.key), label: field.label.trim() || field.key }))
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

  protected formatFieldCell(field: CustomField, value: unknown): string {
    if (value === null || value === undefined || value === '') {
      return '—';
    }
    if (field.type === 'boolean') {
      return value ? 'Да' : 'Нет';
    }
    if (field.type === 'relation') {
      if (field.relation?.multiple) {
        const list = this.asRelationPayloadList(value);
        if (list.length === 0) {
          return '—';
        }
        return list.map((entry) => this.formatRelationPayloadEntry(entry)).join(', ');
      }
      return this.formatRelationPayloadEntry(this.asRelationPayloadSingle(value));
    }
    if (field.type === 'json') {
      try {
        return typeof value === 'string' ? value : JSON.stringify(value);
      } catch {
        return String(value);
      }
    }
    return String(value);
  }

  protected previewCellValue(field: CustomField): string {
    switch (field.type) {
      case 'number':
        return '0';
      case 'boolean':
        return 'Да/Нет';
      case 'date':
        return '2026-04-27';
      case 'datetime':
        return '2026-04-27T13:45';
      case 'email':
        return 'user@domain.com';
      case 'phone':
        return '+7 900 000-00-00';
      case 'url':
        return 'https://example.com';
      case 'json':
        return '{"key":"value"}';
      case 'photo':
        return 'url/image';
      case 'relation':
        return 'Связанная запись';
      default:
        return 'Текст';
    }
  }

  protected relationDirectoryOptions(): WorkspaceDirectoryDto[] {
    return this.dirs();
  }

  protected relationDisplayFieldOptions(directoryId: number | null): Array<{ key: string; label: string }> {
    if (!directoryId) {
      return [];
    }
    const dir = this.dirs().find((entry) => entry.id === directoryId);
    if (!dir) {
      return [];
    }
    const options: Array<{ key: string; label: string }> = [{ key: 'label', label: 'Название записи' }];
    const seen = new Set<string>(['label']);
    const schemaFields = this.normalizeFields(dir.schema_fields);
    for (const field of schemaFields) {
      if (!field.key || seen.has(field.key)) {
        continue;
      }
      seen.add(field.key);
      options.push({ key: field.key, label: field.label || this.humanizeFieldKey(field.key) });
    }
    for (const payloadKey of this.directoryPayloadKeys(dir)) {
      if (seen.has(payloadKey)) {
        continue;
      }
      seen.add(payloadKey);
      options.push({ key: payloadKey, label: this.humanizeFieldKey(payloadKey) });
    }
    return options;
  }

  protected setCreateFieldRelationDirectory(fieldId: string, value: string): void {
    const directoryId = value ? Number(value) : null;
    this.createDirFields.update((fields) =>
      fields.map((field) => {
        if (field.id !== fieldId) {
          return field;
        }
        const relation = field.relation ?? this.emptyRelationConfig();
        const options = this.relationDisplayFieldOptions(directoryId);
        const displayFieldKey = options.find((option) => option.key === relation.displayFieldKey)?.key ?? (options[0]?.key ?? 'label');
        return this.normalizeCustomField({ ...field, type: 'relation', relation: { ...relation, directoryId, displayFieldKey } });
      }),
    );
  }

  protected setCreateFieldRelationDisplayField(fieldId: string, value: string): void {
    this.createDirFields.update((fields) =>
      fields.map((field) =>
        field.id === fieldId
          ? this.normalizeCustomField({
              ...field,
              type: 'relation',
              relation: { ...(field.relation ?? this.emptyRelationConfig()), displayFieldKey: value || 'label' },
            })
          : field,
      ),
    );
  }

  protected setCreateFieldRelationMultiple(fieldId: string, checked: boolean): void {
    this.createDirFields.update((fields) =>
      fields.map((field) =>
        field.id === fieldId
          ? this.normalizeCustomField({
              ...field,
              type: 'relation',
              relation: { ...(field.relation ?? this.emptyRelationConfig()), multiple: checked },
            })
          : field,
      ),
    );
  }

  protected relationModeSelection(field: CustomField): RelationModeValue[] {
    return field.relation?.multiple ? ['multiple'] : [];
  }

  protected setCreateFieldRelationModes(fieldId: string, values: RelationModeValue[] | null | undefined): void {
    this.setCreateFieldRelationMultiple(fieldId, (values ?? []).includes('multiple'));
  }

  protected relationOptionsForField(field: CustomField): Array<{ id: number; label: string }> {
    const relationDirId = field.relation?.directoryId;
    if (!relationDirId) {
      return [];
    }
    const targetDir = this.dirs().find((entry) => entry.id === relationDirId);
    if (!targetDir) {
      return [];
    }
    return targetDir.items.map((item) => ({
      id: item.id,
      label: this.resolveRelationItemLabel(targetDir, item, field.relation?.displayFieldKey ?? 'label'),
    }));
  }

  private normalizeFields(input: Array<Record<string, unknown>> | null | undefined): CustomField[] {
    if (!Array.isArray(input)) {
      return [];
    }
    const supportedTypes = new Set<CustomFieldType>([
      'text',
      'number',
      'photo',
      'boolean',
      'date',
      'datetime',
      'email',
      'phone',
      'url',
      'json',
      'relation',
    ]);
    return input
      .map((field): CustomField => {
        const typeRaw = String(field['type'] ?? '').toLowerCase();
        const type: CustomFieldType = supportedTypes.has(typeRaw as CustomFieldType) ? (typeRaw as CustomFieldType) : 'text';
        const key = this.normalizeFieldKey(String(field['key'] ?? ''));
        const label = String(field['label'] ?? '').trim() || key;
        const relationRaw = (field['relation'] ?? null) as Record<string, unknown> | null;
        const relation: RelationConfig | null = type === 'relation'
          ? {
              directoryId: this.toNullableNumber(relationRaw?.['directoryId']),
              displayFieldKey: String(relationRaw?.['displayFieldKey'] ?? 'label') || 'label',
              multiple: Boolean(relationRaw?.['multiple']),
            }
          : null;
        return {
          id: String(field['id'] ?? this.uid()),
          key,
          label,
          type,
          relation,
        };
      })
      .map((field) => this.normalizeCustomField(field))
      .filter((field) => !!field.key);
  }

  private normalizeCustomField(field: CustomField): CustomField {
    if (field.type !== 'relation') {
      return { ...field, relation: null };
    }
    const relation = field.relation ?? this.emptyRelationConfig();
    return {
      ...field,
      relation: {
        directoryId: relation.directoryId,
        displayFieldKey: relation.displayFieldKey || 'label',
        multiple: Boolean(relation.multiple),
      },
    };
  }

  private emptyRelationConfig(): RelationConfig {
    return { directoryId: null, displayFieldKey: 'label', multiple: false };
  }

  private toNullableNumber(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private parseJsonSafe(value: string): unknown {
    if (!value) {
      return {};
    }
    try {
      return JSON.parse(value);
    } catch {
      return { raw: value };
    }
  }

  private makeRelationPayloadEntry(field: CustomField, id: number): RelationPayloadValue {
    const match = this.relationOptionsForField(field).find((option) => option.id === id);
    return { valueId: id, valueLabel: match?.label ?? `Недоступно (#${id})` };
  }

  private asRelationPayloadSingle(value: unknown): RelationPayloadValue {
    const source = (value ?? null) as Record<string, unknown> | null;
    return {
      valueId: this.toNullableNumber(source?.['valueId']),
      valueLabel: String(source?.['valueLabel'] ?? ''),
    };
  }

  private asRelationPayloadList(value: unknown): RelationPayloadValue[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.map((entry) => this.asRelationPayloadSingle(entry)).filter((entry) => entry.valueId !== null || !!entry.valueLabel);
  }

  private formatRelationPayloadEntry(entry: RelationPayloadValue): string {
    if (entry.valueLabel.trim()) {
      return entry.valueLabel;
    }
    if (entry.valueId !== null) {
      return `Недоступно (#${entry.valueId})`;
    }
    return '—';
  }

  private resolveRelationItemLabel(dir: WorkspaceDirectoryDto, item: WorkspaceDirectoryItemDto, displayFieldKey: string): string {
    if (!displayFieldKey || displayFieldKey === 'label') {
      return item.label;
    }
    const payload = (item.payload ?? {}) as Record<string, unknown>;
    const raw = payload[displayFieldKey];
    const formatted = raw === null || raw === undefined || raw === '' ? item.label : String(raw);
    return formatted;
  }

  private directoryPayloadKeys(dir: WorkspaceDirectoryDto): string[] {
    const keys = new Set<string>();
    for (const item of dir.items) {
      const payload = (item.payload ?? {}) as Record<string, unknown>;
      for (const key of Object.keys(payload)) {
        if (key) {
          keys.add(key);
        }
      }
    }
    return [...keys];
  }

  private humanizeFieldKey(key: string): string {
    const base = key
      .replace(/[_\-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!base) {
      return key;
    }
    return base.charAt(0).toUpperCase() + base.slice(1);
  }

  private searchableFieldValue(field: CustomField, value: unknown): string {
    return this.formatFieldCell(field, value).toLowerCase();
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
