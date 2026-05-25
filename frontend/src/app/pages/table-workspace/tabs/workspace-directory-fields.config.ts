export type CustomFieldType =
  | 'text'
  | 'number'
  | 'photo'
  | 'boolean'
  | 'date'
  | 'datetime'
  | 'email'
  | 'phone'
  | 'url'
  | 'json'
  | 'relation';

export type RelationConfig = {
  directoryId: number | null;
  displayFieldKey: string;
  multiple: boolean;
};

export type CustomField = {
  id: string;
  key: string;
  label: string;
  type: CustomFieldType;
  relation: RelationConfig | null;
};

export type RelationModeValue = 'multiple';

export const CUSTOM_FIELD_TYPE_OPTIONS: Array<{ value: CustomFieldType; label: string }> = [
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

export const RELATION_MODE_OPTIONS: Array<{ label: string; value: RelationModeValue }> = [
  { label: 'Множественный выбор', value: 'multiple' },
];

export const SUPPORTED_CUSTOM_FIELD_TYPES = new Set<CustomFieldType>([
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
