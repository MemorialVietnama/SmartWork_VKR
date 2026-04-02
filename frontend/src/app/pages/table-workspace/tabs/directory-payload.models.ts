/** Согласовано с backend app.config.directory_presets.empty_payload_for_kind */

export const PET_ANIMAL_TYPES: readonly string[] = [
  'Собака',
  'Кошка',
  'Попугай',
  'Кролик',
  'Хорёк',
  'Рептилия',
  'Другое',
];

export interface ServiceSubservice {
  name: string;
  cost: number;
  durationMinutes: number;
  icon: string;
}

export interface ServicePayload {
  title: string;
  cost: number;
  description: string;
  inner: {
    displayName: string;
    subservices: ServiceSubservice[];
  };
}

export interface ClientHistoryEntry {
  date: string;
  serviceTitle: string;
}

export interface ClientPayload {
  lastName: string;
  firstName: string;
  petCount: number;
  phone: string;
  detail: {
    lastName: string;
    firstName: string;
    address: string;
    petItemIds: number[];
    serviceHistory: ClientHistoryEntry[];
    rating: number;
  };
}

export interface PetVisitEntry {
  date: string;
  note: string;
}

export interface PetPayload {
  iconUrl: string;
  age: string;
  breed: string;
  subbreed: string;
  ownerName: string;
  ownerPhone: string;
  detail: {
    avatarUrl: string;
    nickname: string;
    age: string;
    breed: string;
    subbreed: string;
    animalType: string;
    health: string;
    behavior: string;
    notes: string;
    ownerInfo: string;
    visitHistory: PetVisitEntry[];
  };
}

export function emptyServicePayload(): ServicePayload {
  return {
    title: '',
    cost: 0,
    description: '',
    inner: { displayName: '', subservices: [] },
  };
}

export function emptyClientPayload(): ClientPayload {
  return {
    lastName: '',
    firstName: '',
    petCount: 0,
    phone: '',
    detail: {
      lastName: '',
      firstName: '',
      address: '',
      petItemIds: [],
      serviceHistory: [],
      rating: 0,
    },
  };
}

export function emptyPetPayload(): PetPayload {
  return {
    iconUrl: '',
    age: '',
    breed: '',
    subbreed: '',
    ownerName: '',
    ownerPhone: '',
    detail: {
      avatarUrl: '',
      nickname: '',
      age: '',
      breed: '',
      subbreed: '',
      animalType: '',
      health: '',
      behavior: '',
      notes: '',
      ownerInfo: '',
      visitHistory: [],
    },
  };
}

export function subservicesTotal(s: ServicePayload): number {
  return (s.inner?.subservices ?? []).reduce((a, x) => a + (Number(x.cost) || 0), 0);
}

export function asServicePayload(raw: unknown): ServicePayload {
  const e = emptyServicePayload();
  if (!raw || typeof raw !== 'object') return e;
  const o = raw as Record<string, unknown>;
  const inner = (o['inner'] as Record<string, unknown>) || {};
  const subsRaw = inner['subservices'];
  const subs = Array.isArray(subsRaw)
    ? (subsRaw as ServiceSubservice[]).map((x) => ({
        name: String(x?.['name'] ?? ''),
        cost: Number(x?.['cost']) || 0,
        durationMinutes: Number(x?.['durationMinutes']) || 0,
        icon: String(x?.['icon'] ?? ''),
      }))
    : [];
  return {
    title: String(o['title'] ?? ''),
    cost: Number(o['cost']) || 0,
    description: String(o['description'] ?? ''),
    inner: {
      displayName: String(inner['displayName'] ?? ''),
      subservices: subs,
    },
  };
}

export function asClientPayload(raw: unknown): ClientPayload {
  const e = emptyClientPayload();
  if (!raw || typeof raw !== 'object') return e;
  const o = raw as Record<string, unknown>;
  const d = (o['detail'] as Record<string, unknown>) || {};
  const petIdsRaw = d['petItemIds'];
  const pets = Array.isArray(petIdsRaw)
    ? (petIdsRaw as unknown[]).map((x) => Number(x)).filter((x) => Number.isFinite(x))
    : [];
  const histRaw = d['serviceHistory'];
  const hist = Array.isArray(histRaw)
    ? (histRaw as ClientHistoryEntry[]).map((x) => ({
        date: String(x?.['date'] ?? ''),
        serviceTitle: String(x?.['serviceTitle'] ?? ''),
      }))
    : [];
  return {
    lastName: String(o['lastName'] ?? ''),
    firstName: String(o['firstName'] ?? ''),
    petCount: Number(o['petCount']) || 0,
    phone: String(o['phone'] ?? ''),
    detail: {
      lastName: String(d['lastName'] ?? ''),
      firstName: String(d['firstName'] ?? ''),
      address: String(d['address'] ?? ''),
      petItemIds: pets,
      serviceHistory: hist,
      rating: Number(d['rating']) || 0,
    },
  };
}

export function asPetPayload(raw: unknown): PetPayload {
  const e = emptyPetPayload();
  if (!raw || typeof raw !== 'object') return e;
  const o = raw as Record<string, unknown>;
  const d = (o['detail'] as Record<string, unknown>) || {};
  const vhRaw = d['visitHistory'];
  const vh = Array.isArray(vhRaw)
    ? (vhRaw as PetVisitEntry[]).map((x) => ({
        date: String(x?.['date'] ?? ''),
        note: String(x?.['note'] ?? ''),
      }))
    : [];
  return {
    iconUrl: String(o['iconUrl'] ?? ''),
    age: String(o['age'] ?? ''),
    breed: String(o['breed'] ?? ''),
    subbreed: String(o['subbreed'] ?? ''),
    ownerName: String(o['ownerName'] ?? ''),
    ownerPhone: String(o['ownerPhone'] ?? ''),
    detail: {
      avatarUrl: String(d['avatarUrl'] ?? ''),
      nickname: String(d['nickname'] ?? ''),
      age: String(d['age'] ?? ''),
      breed: String(d['breed'] ?? ''),
      subbreed: String(d['subbreed'] ?? ''),
      animalType: String(d['animalType'] ?? ''),
      health: String(d['health'] ?? ''),
      behavior: String(d['behavior'] ?? ''),
      notes: String(d['notes'] ?? ''),
      ownerInfo: String(d['ownerInfo'] ?? ''),
      visitHistory: vh,
    },
  };
}

export function cardLabelForKind(kind: string | null | undefined, payload: unknown, fallbackLabel: string): string {
  if (kind === 'services') {
    const s = asServicePayload(payload);
    return s.title || s.inner.displayName || fallbackLabel;
  }
  if (kind === 'clients') {
    const c = asClientPayload(payload);
    const n = `${c.lastName} ${c.firstName}`.trim();
    return n || fallbackLabel;
  }
  if (kind === 'pets') {
    const p = asPetPayload(payload);
    return p.detail.nickname || p.breed || fallbackLabel;
  }
  return fallbackLabel;
}
