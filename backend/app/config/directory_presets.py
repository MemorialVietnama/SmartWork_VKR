"""Предустановки справочников по типу стола (только при создании стола)."""

from __future__ import annotations

from typing import Final

# Типы животных для справочника «Питомцы» (встроенный подсправочник).
ANIMAL_TYPES: Final[tuple[str, ...]] = (
    "Собака",
    "Кошка",
    "Попугай",
    "Кролик",
    "Хорёк",
    "Рептилия",
    "Другое",
)

# (kind, отображаемое имя) — kind стабилен для API и фронта.
PRESET_DIRECTORY_SEED: Final[dict[str, list[tuple[str, str]]]] = {
    "barbershop": [
        ("services", "Услуги"),
        ("clients", "Клиенты"),
    ],
    "grooming": [
        ("services", "Услуги"),
        ("clients", "Клиенты"),
        ("pets", "Питомцы"),
    ],
}

# Опечатки и варианты написания → канонический ключ PRESET_DIRECTORY_SEED / поля стола.
PRESET_ALIASES: Final[dict[str, str]] = {
    "grumming": "grooming",
    "groomin": "grooming",
    "груминг": "grooming",
    "грамминг": "grooming",
    "barber": "barbershop",
    "barber_shop": "barbershop",
    "парикмахерская": "barbershop",
}


def canonical_preset(preset: str | None) -> str | None:
    if not preset:
        return None
    s = preset.strip()
    if not s:
        return None
    k = s.lower()
    return PRESET_ALIASES.get(k, k)


def normalize_table_preset(preset: str) -> str:
    """Значение для колонки tables.preset: канон + исправление опечаток."""
    c = canonical_preset(preset)
    return c if c else preset.strip()


def preset_has_directory_template(preset: str | None) -> bool:
    """У предустановки есть шаблон справочников (barbershop / grooming, не custom)."""
    if not preset or not str(preset).strip():
        return False
    c = canonical_preset(str(preset).strip())
    return bool(c and c in PRESET_DIRECTORY_SEED)


def directories_for_preset(preset: str | None) -> list[tuple[str, str]]:
    if not preset:
        return []
    key = canonical_preset(preset.strip()) or preset.strip().lower()
    if key == "custom":
        return []
    return list(PRESET_DIRECTORY_SEED.get(key, []))


def seed_items_for_directory(kind: str, preset_canonical: str) -> list[tuple[str, dict]]:
    """По два примера карточки на каждый предустановленный справочник."""
    if kind == "services":
        if preset_canonical == "grooming":
            return [
                (
                    "Комплекс «Груминг стандарт»",
                    {
                        "title": "Комплекс «Груминг стандарт»",
                        "cost": 3500,
                        "description": "Стрижка, купание, сушка, уход за шерстью.",
                        "inner": {
                            "displayName": "Груминг стандарт",
                            "subservices": [
                                {"name": "Мытьё", "cost": 800, "durationMinutes": 25, "icon": ""},
                                {"name": "Стрижка", "cost": 2200, "durationMinutes": 45, "icon": ""},
                                {"name": "Сушка", "cost": 500, "durationMinutes": 20, "icon": ""},
                            ],
                        },
                    },
                ),
                (
                    "Экспресс-уход",
                    {
                        "title": "Экспресс-уход",
                        "cost": 1200,
                        "description": "Мытьё и расчёсывание без стрижки.",
                        "inner": {
                            "displayName": "Экспресс",
                            "subservices": [
                                {"name": "Мытьё и сушка", "cost": 1200, "durationMinutes": 30, "icon": ""},
                            ],
                        },
                    },
                ),
            ]
        return [
            (
                "Стрижка мужская",
                {
                    "title": "Стрижка мужская",
                    "cost": 1200,
                    "description": "Модельная или машинкой по выбору клиента.",
                    "inner": {
                        "displayName": "Мужская стрижка",
                        "subservices": [
                            {"name": "Мытьё", "cost": 200, "durationMinutes": 10, "icon": ""},
                            {"name": "Стрижка", "cost": 1000, "durationMinutes": 35, "icon": ""},
                        ],
                    },
                },
            ),
            (
                "Борода и усы",
                {
                    "title": "Борода и усы",
                    "cost": 800,
                    "description": "Форма бороды, опасная бритва по желанию.",
                    "inner": {
                        "displayName": "Оформление бороды",
                        "subservices": [
                            {"name": "Коррекция", "cost": 500, "durationMinutes": 20, "icon": ""},
                            {"name": "Укладка", "cost": 300, "durationMinutes": 10, "icon": ""},
                        ],
                    },
                },
            ),
        ]
    if kind == "clients":
        return [
            (
                "Сидоров Пётр",
                {
                    "lastName": "Сидоров",
                    "firstName": "Пётр",
                    "petCount": 0,
                    "phone": "+7 900 111-22-33",
                    "detail": {
                        "lastName": "Сидоров",
                        "firstName": "Пётр",
                        "address": "г. Москва, ул. Примерная, д. 1",
                        "petItemIds": [],
                        "serviceHistory": [
                            {"date": "2026-03-15", "serviceTitle": "Стрижка"},
                        ],
                        "rating": 5,
                    },
                },
            ),
            (
                "Петрова Мария",
                {
                    "lastName": "Петрова",
                    "firstName": "Мария",
                    "petCount": 1,
                    "phone": "+7 900 444-55-66",
                    "detail": {
                        "lastName": "Петрова",
                        "firstName": "Мария",
                        "address": "г. Санкт-Петербург, пр. Невский, д. 10",
                        "petItemIds": [],
                        "serviceHistory": [],
                        "rating": 4,
                    },
                },
            ),
        ]
    if kind == "pets":
        return [
            (
                "Барсик",
                {
                    "iconUrl": "",
                    "age": "3 года",
                    "breed": "Британская",
                    "subbreed": "",
                    "ownerName": "Петрова Мария",
                    "ownerPhone": "+7 900 444-55-66",
                    "detail": {
                        "avatarUrl": "",
                        "nickname": "Барсик",
                        "age": "3 года",
                        "breed": "Британская",
                        "subbreed": "",
                        "animalType": "Кошка",
                        "health": "Привит, кастрирован",
                        "behavior": "Спокойный",
                        "notes": "Не любит фен",
                        "ownerInfo": "Петрова Мария, +7 900 444-55-66",
                        "visitHistory": [
                            {"date": "2026-03-20", "note": "Стрижка, купание"},
                        ],
                    },
                },
            ),
            (
                "Рекс",
                {
                    "iconUrl": "",
                    "age": "5 лет",
                    "breed": "Лабрадор",
                    "subbreed": "",
                    "ownerName": "Сидоров Пётр",
                    "ownerPhone": "+7 900 111-22-33",
                    "detail": {
                        "avatarUrl": "",
                        "nickname": "Рекс",
                        "age": "5 лет",
                        "breed": "Лабрадор",
                        "subbreed": "",
                        "animalType": "Собака",
                        "health": "Здоров",
                        "behavior": "Дружелюбный",
                        "notes": "Крупный, нужен мощный фен",
                        "ownerInfo": "Сидоров Пётр, +7 900 111-22-33",
                        "visitHistory": [],
                    },
                },
            ),
        ]
    return []


def empty_payload_for_kind(kind: str) -> dict:
    """Начальная структура карточки по виду справочника."""
    if kind == "services":
        return {
            "title": "",
            "cost": 0,
            "description": "",
            "inner": {
                "displayName": "",
                "subservices": [],
            },
        }
    if kind == "clients":
        return {
            "lastName": "",
            "firstName": "",
            "petCount": 0,
            "phone": "",
            "detail": {
                "lastName": "",
                "firstName": "",
                "address": "",
                "petItemIds": [],
                "serviceHistory": [],
                "rating": 0,
            },
        }
    if kind == "pets":
        return {
            "iconUrl": "",
            "age": "",
            "breed": "",
            "subbreed": "",
            "ownerName": "",
            "ownerPhone": "",
            "detail": {
                "avatarUrl": "",
                "nickname": "",
                "age": "",
                "breed": "",
                "subbreed": "",
                "animalType": "",
                "health": "",
                "behavior": "",
                "notes": "",
                "ownerInfo": "",
                "visitHistory": [],
            },
        }
    return {}
