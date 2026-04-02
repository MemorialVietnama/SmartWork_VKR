import { CommonModule } from '@angular/common';
import { Component, inject, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { InputTextModule } from 'primeng/inputtext';

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

@Component({
  selector: 'app-workspace-directories-tab',
  standalone: true,
  imports: [CommonModule, FormsModule, CardModule, ButtonModule, InputTextModule],
  templateUrl: './workspace-directories.tab.html',
  styleUrl: './workspace-directories.tab.scss',
})
export class WorkspaceDirectoriesTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected dirs: WorkspaceDirectoryDto[] = [];
  protected newDirName = '';
  protected itemLabels: Record<number, string> = {};
  protected itemValues: Record<number, string> = {};
  protected err: string | null = null;

  protected readonly petAnimalTypes = PET_ANIMAL_TYPES;

  /** Редактор карточки предустановленного справочника */
  protected editor: { kind: 'services' | 'clients' | 'pets'; dirId: number; itemId: number | null } | null = null;
  protected editService: ServicePayload = emptyServicePayload();
  protected editClient: ClientPayload = emptyClientPayload();
  protected editPet: PetPayload = emptyPetPayload();

  ngOnInit(): void {
    this.refresh();
  }

  protected get canEdit(): boolean {
    return !!this.state.detail()?.can_edit_settings;
  }

  protected get maxDirs(): number {
    return Math.max(this.state.bonusQty('extra_directories'), 1);
  }

  /** Произвольные справочники (без kind) — лимит extra_directories */
  protected extraDirCount(): number {
    return this.dirs.filter((d) => !d.kind).length;
  }

  protected refresh(): void {
    this.err = null;
    this.auth.listWorkspaceDirectories(this.state.tableId()).subscribe({
      next: (d) => {
        this.dirs = d;
        this.closeEditor();
      },
      error: () => (this.err = 'Не удалось загрузить справочники.'),
    });
  }

  protected closeEditor(): void {
    this.editor = null;
    this.editService = emptyServicePayload();
    this.editClient = emptyClientPayload();
    this.editPet = emptyPetPayload();
  }

  protected isEditorOpen(dirId: number, kind: string | null | undefined): boolean {
    return this.editor !== null && this.editor.dirId === dirId && this.editor.kind === kind;
  }

  protected openCreate(dir: WorkspaceDirectoryDto): void {
    if (!dir.kind) return;
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
    if (!dir.kind) return;
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

  protected saveEditor(): void {
    const e = this.editor;
    if (!e) return;
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
          next: () => this.refresh(),
          error: (err) => (this.err = err?.error?.detail ?? 'Ошибка сохранения'),
        });
      } else {
        this.auth.patchWorkspaceDirectoryItem(tid, e.dirId, e.itemId, { label, payload }).subscribe({
          next: () => this.refresh(),
          error: (err) => (this.err = err?.error?.detail ?? 'Ошибка сохранения'),
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
          next: () => this.refresh(),
          error: (err) => (this.err = err?.error?.detail ?? 'Ошибка сохранения'),
        });
      } else {
        this.auth.patchWorkspaceDirectoryItem(tid, e.dirId, e.itemId, { label, payload }).subscribe({
          next: () => this.refresh(),
          error: (err) => (this.err = err?.error?.detail ?? 'Ошибка сохранения'),
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
          next: () => this.refresh(),
          error: (err) => (this.err = err?.error?.detail ?? 'Ошибка сохранения'),
        });
      } else {
        this.auth.patchWorkspaceDirectoryItem(tid, e.dirId, e.itemId, { label, payload }).subscribe({
          next: () => this.refresh(),
          error: (err) => (this.err = err?.error?.detail ?? 'Ошибка сохранения'),
        });
      }
    }
  }

  protected deleteItem(dirId: number, itemId: number): void {
    this.auth.deleteWorkspaceDirectoryItem(this.state.tableId(), dirId, itemId).subscribe({
      next: () => this.refresh(),
      error: (err) => (this.err = err?.error?.detail ?? 'Ошибка удаления'),
    });
  }

  protected petsDirectoryItems(): WorkspaceDirectoryItemDto[] {
    const p = this.dirs.find((d) => d.kind === 'pets');
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
      return it.value ?? '—';
    }
    return cardLabelForKind(dir.kind, it.payload, it.label);
  }

  protected sumSubservices(s: ServicePayload): number {
    return subservicesTotal(s);
  }

  protected petCheckboxLabel(it: WorkspaceDirectoryItemDto): string {
    return cardLabelForKind('pets', it.payload, it.label);
  }

  protected addDirectory(): void {
    const name = this.newDirName.trim();
    if (!name) return;
    this.auth.createWorkspaceDirectory(this.state.tableId(), name).subscribe({
      next: () => {
        this.newDirName = '';
        this.refresh();
      },
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка'),
    });
  }

  protected addItem(dirId: number): void {
    const label = (this.itemLabels[dirId] ?? '').trim();
    if (!label) return;
    const value = (this.itemValues[dirId] ?? '').trim() || null;
    this.auth.addWorkspaceDirectoryItem(this.state.tableId(), dirId, { label, value }).subscribe({
      next: () => {
        this.itemLabels[dirId] = '';
        this.itemValues[dirId] = '';
        this.refresh();
      },
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка'),
    });
  }

  protected removeDir(dirId: number): void {
    this.auth.deleteWorkspaceDirectory(this.state.tableId(), dirId).subscribe({
      next: () => this.refresh(),
      error: (e) => (this.err = e?.error?.detail ?? 'Ошибка'),
    });
  }
}
