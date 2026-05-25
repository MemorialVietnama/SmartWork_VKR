export type TemplateKind = 'services' | 'clients' | 'pets';
export type SelectedDirectoryFilter = 'all' | 'services' | 'clients' | 'pets' | 'custom';

export const DIRECTORY_FILTER_OPTIONS: Array<{ key: SelectedDirectoryFilter; label: string }> = [
  { key: 'all', label: 'Все' },
  { key: 'services', label: 'Услуги' },
  { key: 'clients', label: 'Клиенты' },
  { key: 'pets', label: 'Питомцы' },
  { key: 'custom', label: 'Свои' },
];

export const DIRECTORY_KIND_LABELS: Record<TemplateKind | 'custom', string> = {
  services: 'Услуги',
  clients: 'Клиенты',
  pets: 'Питомцы',
  custom: 'Свой',
};

export const DIRECTORY_KIND_ICONS: Record<TemplateKind | 'custom', string> = {
  services: 'pi pi-briefcase',
  clients: 'pi pi-users',
  pets: 'pi pi-heart-fill',
  custom: 'pi pi-folder',
};

export const DIRECTORY_EDITOR_KIND_LABELS: Record<TemplateKind, string> = {
  services: 'услуги',
  clients: 'клиента',
  pets: 'питомца',
};
