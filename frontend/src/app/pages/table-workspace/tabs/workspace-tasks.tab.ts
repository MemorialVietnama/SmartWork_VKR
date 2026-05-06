import { CommonModule } from '@angular/common';
import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ButtonModule } from 'primeng/button';
import { CardModule } from 'primeng/card';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { TextareaModule } from 'primeng/textarea';

import { AuthService, WorkspaceTaskDto } from '../../../core/auth/auth.service';
import { TableWorkspaceState } from '../table-workspace.state';

type TaskStatus = 'new' | 'waiting' | 'done';
type TaskPriority = 'low' | 'medium' | 'high';

interface TaskMeta {
  description: string;
  priority: TaskPriority;
  dueDate: string;
  tags: string[];
  checklist: { id: string; text: string; done: boolean }[];
}

interface WorkspaceTaskView extends WorkspaceTaskDto {
  description: string;
  priority: TaskPriority;
  dueDate: string;
  tags: string[];
  checklist: { id: string; text: string; done: boolean }[];
}

interface TaskDialogForm {
  title: string;
  description: string;
  status: TaskStatus;
  assignee_user_id: number | null;
  priority: TaskPriority;
  dueDate: string;
  tagsInput: string;
  checklistInput: string;
}

@Component({
  selector: 'app-workspace-tasks-tab',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputTextModule,
    TextareaModule,
    DialogModule,
    DragDropModule,
  ],
  templateUrl: './workspace-tasks.tab.html',
  styleUrl: './workspace-tasks.tab.scss',
})
export class WorkspaceTasksTabComponent implements OnInit {
  private readonly auth = inject(AuthService);
  protected readonly state = inject(TableWorkspaceState);

  protected readonly err = signal<string | null>(null);
  protected readonly loading = signal(false);
  protected readonly dialogVisible = signal(false);
  protected readonly editingTaskId = signal<number | null>(null);
  protected readonly creating = signal(false);
  protected readonly savingTask = signal(false);
  protected readonly deletingTaskId = signal<number | null>(null);
  protected readonly searchQuery = signal('');
  protected readonly assigneeFilter = signal<number | null>(null);
  protected readonly priorityFilter = signal<'all' | TaskPriority>('all');
  protected readonly showOverdueOnly = signal(false);
  protected readonly board = signal<Record<TaskStatus, WorkspaceTaskView[]>>({
    new: [],
    waiting: [],
    done: [],
  });
  protected readonly statuses: { key: TaskStatus; label: string }[] = [
    { key: 'new', label: 'Новые' },
    { key: 'waiting', label: 'В ожидании' },
    { key: 'done', label: 'Готово' },
  ];
  protected readonly priorities: { key: TaskPriority; label: string }[] = [
    { key: 'low', label: 'Низкий' },
    { key: 'medium', label: 'Средний' },
    { key: 'high', label: 'Высокий' },
  ];
  protected readonly dialogForm = signal<TaskDialogForm>({
    title: '',
    description: '',
    status: 'new',
    assignee_user_id: null,
    priority: 'medium',
    dueDate: '',
    tagsInput: '',
    checklistInput: '',
  });
  protected readonly totalCount = computed(
    () => this.board().new.length + this.board().waiting.length + this.board().done.length,
  );
  protected readonly monitoringStats = computed(() => {
    const board = this.board();
    const all = [...board.new, ...board.waiting, ...board.done];
    const urgent = all.filter((task) => (task.priority === 'high' || this.isOverdue(task)) && task.status !== 'done').length;
    return {
      total: all.length,
      urgent,
      inWork: board.waiting.length,
      done: board.done.length,
    };
  });
  protected readonly connectedDropLists = computed(() =>
    this.statuses.map((status) => this.dropListId(status.key)),
  );
  protected readonly hasActiveFilters = computed(
    () =>
      this.searchQuery().trim().length > 0 ||
      this.assigneeFilter() !== null ||
      this.priorityFilter() !== 'all' ||
      this.showOverdueOnly(),
  );
  private readonly taskMeta = signal<Record<number, TaskMeta>>({});

  ngOnInit(): void {
    this.refresh();
  }

  protected get tasksUnlocked(): boolean {
    return this.state.bonusQty('unlock_tasks') > 0;
  }

  protected refresh(): void {
    this.err.set(null);
    if (!this.tasksUnlocked) {
      this.board.set({ new: [], waiting: [], done: [] });
      return;
    }
    this.loading.set(true);
    this.taskMeta.set(this.readTaskMeta());
    this.auth.listWorkspaceTasks(this.state.tableId()).subscribe({
      next: (tasks) => {
        this.board.set(this.mapTasksToBoard(tasks));
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.err.set('Не удалось загрузить задачи.');
      },
    });
  }

  protected dropListId(status: TaskStatus): string {
    return `task-drop-${status}`;
  }

  protected tasksByStatus(status: TaskStatus): WorkspaceTaskView[] {
    return this.board()[status];
  }

  protected filteredTasksByStatus(status: TaskStatus): WorkspaceTaskView[] {
    return this.tasksByStatus(status).filter((task) => this.taskMatchesFilters(task));
  }

  protected assigneeName(assigneeId: number | null): string {
    if (!assigneeId) {
      return 'Без ответственного';
    }
    const member = this.state.members().find((item) => item.user_id === assigneeId);
    return member?.short_name ?? 'Не найден';
  }

  protected openCreateDialog(initialStatus: TaskStatus = 'new'): void {
    this.creating.set(true);
    this.editingTaskId.set(null);
    this.dialogForm.set({
      title: '',
      description: '',
      status: initialStatus,
      assignee_user_id: null,
      priority: 'medium',
      dueDate: '',
      tagsInput: '',
      checklistInput: '',
    });
    this.dialogVisible.set(true);
  }

  protected openEditDialog(task: WorkspaceTaskView): void {
    this.creating.set(false);
    this.editingTaskId.set(task.id);
    this.dialogForm.set({
      title: task.title,
      description: task.description,
      status: this.normalizeStatus(task.status),
      assignee_user_id: task.assignee_user_id,
      priority: task.priority,
      dueDate: task.dueDate,
      tagsInput: task.tags.join(', '),
      checklistInput: task.checklist.map((item) => item.text).join('\n'),
    });
    this.dialogVisible.set(true);
  }

  protected closeDialog(): void {
    this.dialogVisible.set(false);
    this.editingTaskId.set(null);
  }

  protected setDialogTitle(value: string): void {
    this.dialogForm.update((form) => ({ ...form, title: value }));
  }

  protected setDialogDescription(value: string): void {
    this.dialogForm.update((form) => ({ ...form, description: value }));
  }

  protected setDialogStatus(value: TaskStatus): void {
    this.dialogForm.update((form) => ({ ...form, status: this.normalizeStatus(value) }));
  }

  protected setDialogPriority(value: TaskPriority): void {
    this.dialogForm.update((form) => ({ ...form, priority: this.normalizePriority(value) }));
  }

  protected setDialogAssignee(value: string): void {
    if (value === '') {
      this.dialogForm.update((form) => ({ ...form, assignee_user_id: null }));
      return;
    }
    const parsed = Number(value);
    this.dialogForm.update((form) => ({
      ...form,
      assignee_user_id: Number.isFinite(parsed) ? parsed : null,
    }));
  }

  protected setDialogDueDate(value: string): void {
    this.dialogForm.update((form) => ({ ...form, dueDate: value }));
  }

  protected setDialogTagsInput(value: string): void {
    this.dialogForm.update((form) => ({ ...form, tagsInput: value }));
  }

  protected setDialogChecklistInput(value: string): void {
    this.dialogForm.update((form) => ({ ...form, checklistInput: value }));
  }

  protected setSearchQuery(value: string): void {
    this.searchQuery.set(value);
  }

  protected setAssigneeFilter(value: string): void {
    if (!value) {
      this.assigneeFilter.set(null);
      return;
    }
    const id = Number(value);
    this.assigneeFilter.set(Number.isFinite(id) ? id : null);
  }

  protected setPriorityFilter(value: 'all' | TaskPriority): void {
    this.priorityFilter.set(value);
  }

  protected toggleOverdueFilter(): void {
    this.showOverdueOnly.update((state) => !state);
  }

  protected resetFilters(): void {
    this.searchQuery.set('');
    this.assigneeFilter.set(null);
    this.priorityFilter.set('all');
    this.showOverdueOnly.set(false);
  }

  protected isOverdue(task: WorkspaceTaskView): boolean {
    if (!task.dueDate || task.status === 'done') {
      return false;
    }
    const due = new Date(task.dueDate);
    const now = new Date();
    due.setHours(23, 59, 59, 999);
    return due.getTime() < now.getTime();
  }

  protected checklistProgress(task: WorkspaceTaskView): string {
    if (task.checklist.length === 0) {
      return '0/0';
    }
    const done = task.checklist.filter((item) => item.done).length;
    return `${done}/${task.checklist.length}`;
  }

  protected tagClass(tag: string): string {
    const normalized = tag.trim().toLowerCase();
    if (normalized === 'срочно' || normalized === 'urgent') {
      return 'tag-urgent';
    }
    if (normalized === 'проблема' || normalized === 'bug') {
      return 'tag-problem';
    }
    return 'tag-default';
  }

  protected toggleChecklistItem(task: WorkspaceTaskView, itemId: string): void {
    const updatedChecklist = task.checklist.map((item) =>
      item.id === itemId ? { ...item, done: !item.done } : item,
    );
    this.upsertTaskMeta(task.id, {
      description: task.description,
      priority: task.priority,
      dueDate: task.dueDate,
      tags: task.tags,
      checklist: updatedChecklist,
    });
    this.board.update((current) => ({
      ...current,
      [this.normalizeStatus(task.status)]: current[this.normalizeStatus(task.status)].map((item) =>
        item.id === task.id ? { ...item, checklist: updatedChecklist } : item,
      ),
    }));
  }

  protected moveToStatus(task: WorkspaceTaskView, status: TaskStatus): void {
    if (this.normalizeStatus(task.status) === status) {
      return;
    }
    this.auth.updateWorkspaceTask(this.state.tableId(), task.id, { status }).subscribe({
      next: () => this.refresh(),
      error: (e) => this.err.set(e?.error?.detail ?? 'Не удалось изменить статус.'),
    });
  }

  protected saveTask(): void {
    const form = this.dialogForm();
    const title = form.title.trim();
    if (!title) {
      this.err.set('Введите название задачи.');
      return;
    }
    this.savingTask.set(true);
    this.err.set(null);
    if (this.creating()) {
      this.auth
        .createWorkspaceTask(this.state.tableId(), {
          title,
          status: form.status,
          assignee_user_id: form.assignee_user_id,
        })
        .subscribe({
          next: (task) => {
            this.upsertTaskMeta(task.id, {
              description: form.description.trim(),
              priority: form.priority,
              dueDate: form.dueDate,
              tags: this.parseTags(form.tagsInput),
              checklist: this.parseChecklist(form.checklistInput),
            });
            this.savingTask.set(false);
            this.closeDialog();
            this.refresh();
          },
          error: (e) => {
            this.savingTask.set(false);
            this.err.set(e?.error?.detail ?? 'Ошибка создания задачи.');
          },
        });
      return;
    }
    const taskId = this.editingTaskId();
    if (!taskId) {
      this.savingTask.set(false);
      this.err.set('Не удалось определить задачу для обновления.');
      return;
    }
    this.auth
      .updateWorkspaceTask(this.state.tableId(), taskId, {
        title,
        status: form.status,
        assignee_user_id: form.assignee_user_id,
      })
      .subscribe({
        next: () => {
          this.upsertTaskMeta(taskId, {
            description: form.description.trim(),
            priority: form.priority,
            dueDate: form.dueDate,
            tags: this.parseTags(form.tagsInput),
            checklist: this.parseChecklist(form.checklistInput),
          });
          this.savingTask.set(false);
          this.closeDialog();
          this.refresh();
        },
        error: (e) => {
          this.savingTask.set(false);
          this.err.set(e?.error?.detail ?? 'Ошибка обновления задачи.');
        },
      });
  }

  protected dropTask(event: CdkDragDrop<WorkspaceTaskView[]>, status: TaskStatus): void {
    const board = this.board();
    const sourceId = event.previousContainer.id.replace('task-drop-', '') as TaskStatus;
    const sourceTasks = [...board[sourceId]];
    const targetTasks = [...board[status]];
    if (event.previousContainer === event.container) {
      moveItemInArray(targetTasks, event.previousIndex, event.currentIndex);
      this.board.set({
        ...board,
        [status]: targetTasks,
      });
      this.persistCurrentMeta();
      return;
    }
    const movedTask = sourceTasks[event.previousIndex];
    if (!movedTask) {
      return;
    }
    transferArrayItem(sourceTasks, targetTasks, event.previousIndex, event.currentIndex);
    const updatedTask: WorkspaceTaskView = { ...movedTask, status };
    targetTasks[event.currentIndex] = updatedTask;
    this.board.set({
      ...board,
      [sourceId]: sourceTasks,
      [status]: targetTasks,
    });
    this.persistCurrentMeta();
    this.auth.updateWorkspaceTask(this.state.tableId(), movedTask.id, { status }).subscribe({
      next: () => this.refresh(),
      error: (e) => {
        this.err.set(e?.error?.detail ?? 'Не удалось переместить задачу.');
        this.refresh();
      },
    });
  }

  protected removeTask(id: number): void {
    this.deletingTaskId.set(id);
    this.auth.deleteWorkspaceTask(this.state.tableId(), id).subscribe({
      next: () => {
        this.removeTaskMeta(id);
        this.deletingTaskId.set(null);
        this.refresh();
      },
      error: (e) => {
        this.deletingTaskId.set(null);
        this.err.set(e?.error?.detail ?? 'Ошибка удаления задачи.');
      },
    });
  }

  private normalizeStatus(status: string): TaskStatus {
    if (status === 'waiting' || status === 'done') {
      return status;
    }
    return 'new';
  }

  private mapTasksToBoard(tasks: WorkspaceTaskDto[]): Record<TaskStatus, WorkspaceTaskView[]> {
    const board: Record<TaskStatus, WorkspaceTaskView[]> = { new: [], waiting: [], done: [] };
    for (const task of tasks) {
      const status = this.normalizeStatus(task.status);
      const meta = this.taskMeta()[task.id] ?? {
        description: '',
        priority: 'medium',
        dueDate: '',
        tags: [],
        checklist: [],
      };
      board[status].push({
        ...task,
        status,
        description: meta.description,
        priority: meta.priority,
        dueDate: meta.dueDate,
        tags: meta.tags,
        checklist: meta.checklist,
      });
    }
    for (const status of this.statuses.map((item) => item.key)) {
      board[status].sort((a, b) => a.id - b.id);
    }
    return board;
  }

  private persistCurrentMeta(): void {
    const nextMeta = { ...this.taskMeta() };
    for (const status of this.statuses.map((item) => item.key)) {
      for (const task of this.board()[status]) {
        nextMeta[task.id] = {
          description: task.description,
          priority: task.priority,
          dueDate: task.dueDate,
          tags: task.tags,
          checklist: task.checklist,
        };
      }
    }
    this.taskMeta.set(nextMeta);
    this.writeTaskMeta(nextMeta);
  }

  private upsertTaskMeta(taskId: number, meta: TaskMeta): void {
    const nextMeta = {
      ...this.taskMeta(),
      [taskId]: meta,
    };
    this.taskMeta.set(nextMeta);
    this.writeTaskMeta(nextMeta);
  }

  private removeTaskMeta(taskId: number): void {
    const nextMeta = { ...this.taskMeta() };
    delete nextMeta[taskId];
    this.taskMeta.set(nextMeta);
    this.writeTaskMeta(nextMeta);
  }

  private readTaskMeta(): Record<number, TaskMeta> {
    const raw = localStorage.getItem(this.taskMetaStorageKey());
    if (!raw) {
      return {};
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, TaskMeta>;
      const result: Record<number, TaskMeta> = {};
      for (const [key, value] of Object.entries(parsed)) {
        const id = Number(key);
        if (!Number.isFinite(id)) {
          continue;
        }
        if (!value || typeof value !== 'object') {
          continue;
        }
        result[id] = {
          description: typeof value.description === 'string' ? value.description : '',
          priority: this.normalizePriority(value.priority),
          dueDate: typeof value.dueDate === 'string' ? value.dueDate : '',
          tags: this.normalizeTags(value.tags),
          checklist: this.normalizeChecklist(value.checklist),
        };
      }
      return result;
    } catch {
      return {};
    }
  }

  private writeTaskMeta(meta: Record<number, TaskMeta>): void {
    localStorage.setItem(this.taskMetaStorageKey(), JSON.stringify(meta));
  }

  private taskMetaStorageKey(): string {
    return `workspace-task-meta:${this.state.tableId()}`;
  }

  private normalizePriority(priority: string): TaskPriority {
    if (priority === 'low' || priority === 'high') {
      return priority;
    }
    return 'medium';
  }

  private parseTags(input: string): string[] {
    return input
      .split(',')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 8);
  }

  private parseChecklist(input: string): { id: string; text: string; done: boolean }[] {
    return input
      .split('\n')
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .slice(0, 12)
      .map((text, index) => ({ id: `${index}-${text.toLowerCase()}`, text, done: false }));
  }

  private normalizeTags(value: unknown): string[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.filter((item): item is string => typeof item === 'string').slice(0, 8);
  }

  private normalizeChecklist(value: unknown): { id: string; text: string; done: boolean }[] {
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map((item, index) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const raw = item as { id?: unknown; text?: unknown; done?: unknown };
        if (typeof raw.text !== 'string' || !raw.text.trim()) {
          return null;
        }
        return {
          id: typeof raw.id === 'string' && raw.id ? raw.id : `${index}-${raw.text.trim().toLowerCase()}`,
          text: raw.text.trim(),
          done: raw.done === true,
        };
      })
      .filter((item): item is { id: string; text: string; done: boolean } => item !== null)
      .slice(0, 12);
  }

  private taskMatchesFilters(task: WorkspaceTaskView): boolean {
    const query = this.searchQuery().trim().toLowerCase();
    if (query) {
      const inTitle = task.title.toLowerCase().includes(query);
      const inDescription = task.description.toLowerCase().includes(query);
      const inTags = task.tags.some((tag) => tag.toLowerCase().includes(query));
      if (!inTitle && !inDescription && !inTags) {
        return false;
      }
    }
    const assignee = this.assigneeFilter();
    if (assignee !== null && task.assignee_user_id !== assignee) {
      return false;
    }
    const priority = this.priorityFilter();
    if (priority !== 'all' && task.priority !== priority) {
      return false;
    }
    if (this.showOverdueOnly() && !this.isOverdue(task)) {
      return false;
    }
    return true;
  }
}
