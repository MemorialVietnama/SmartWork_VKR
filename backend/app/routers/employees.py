from __future__ import annotations

import json
import secrets
from datetime import UTC, date, datetime, timedelta

import redis.asyncio as redis
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.db.session import get_db
from app.models.table import Table
from app.models.table_member import TableMember
from app.models.user import User
from app.routers.auth import _send_registration_code, get_current_user
from app.schemas.employee import (
    EmployeeTableBindingDto,
    EmployeeTableBindingUpdateRequest,
    EmployeeCreateRequest,
    EmployeeDto,
    EmployeeUpdateRequest,
    InviteAcceptRequest,
    InviteInfoResponse,
    InviteCreateRequest,
    InviteCreateResponse,
    RegisterByInviteRequest,
    RegisterByInviteResponse,
    TempCredentialsDto,
)

router = APIRouter()

TEMP_CREDS_TTL_SECONDS = 48 * 60 * 60
INVITE_TTL_SECONDS = 48 * 60 * 60


def _calc_age(birth_date: date) -> int:
    now = datetime.now(UTC).date()
    age = now.year - birth_date.year
    if (now.month, now.day) < (birth_date.month, birth_date.day):
        age -= 1
    return age


async def _read_temp_credentials(employee_id: int) -> TempCredentialsDto | None:
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = await r.get(f"employee_temp_creds:{employee_id}")
    finally:
        await r.aclose()
    if not raw:
        return None
    payload = json.loads(raw)
    expires_at = datetime.fromisoformat(payload["expires_at"])
    if expires_at <= datetime.now(UTC):
        return None
    return TempCredentialsDto(login=payload["login"], password=payload["password"], expires_at=expires_at)


def _to_dto(user: User, temp_credentials: TempCredentialsDto | None = None) -> EmployeeDto:
    return EmployeeDto(
        id=user.id,
        last_name=user.last_name,
        first_name=user.first_name,
        middle_name=user.middle_name,
        birth_date=user.birth_date,
        phone=user.phone,
        email=user.login if "@" in user.login else None,
        position=user.position,
        note=user.note,
        temp_credentials=temp_credentials,
    )


def _owner_short_name(user: User) -> str:
    last_name = (user.last_name or "").strip()
    first_name = (user.first_name or "").strip()
    if not last_name and not first_name:
        return user.login
    first_initial = f"{first_name[0]}." if first_name else ""
    return f"{last_name} {first_initial}".strip()


@router.get("/my", response_model=list[EmployeeDto])
async def my_employees(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EmployeeDto]:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может смотреть сотрудников")
    res = await db.execute(select(User).where(User.owner_id == current_user.id).order_by(User.created_at.desc()))
    employees = res.scalars().all()
    out: list[EmployeeDto] = []
    for employee in employees:
        out.append(_to_dto(employee, await _read_temp_credentials(employee.id)))
    return out


@router.post("", response_model=EmployeeDto)
async def create_employee(
    req: EmployeeCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeeDto:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может создавать сотрудников")
    if _calc_age(req.birth_date) < 16:
        raise HTTPException(status_code=400, detail="Сотруднику должно быть минимум 16 лет")

    login = (req.email or "").strip().lower()
    temp_credentials: TempCredentialsDto | None = None
    plain_password: str

    if login:
        exists = await db.execute(select(User).where(User.login == login))
        if exists.scalar_one_or_none():
            raise HTTPException(status_code=409, detail="Аккаунт с таким email уже существует")
        plain_password = f"Sw-{secrets.token_urlsafe(8)}"
    else:
        login = f"temp_{secrets.token_urlsafe(6).lower()}@temp.smartwork.local"
        plain_password = f"Sw-{secrets.token_urlsafe(6)}"

    employee = User(
        first_name=req.first_name.strip(),
        last_name=req.last_name.strip(),
        middle_name=req.middle_name.strip() if req.middle_name else None,
        login=login,
        password_hash=hash_password(plain_password),
        role="staff",
        is_active=True,
        phone=req.phone.strip(),
        birth_date=req.birth_date,
        position=req.position.strip(),
        note=req.note.strip() if req.note else None,
        owner_id=current_user.id,
    )
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    if req.email is None or not req.email.strip():
        expires_at = datetime.now(UTC) + timedelta(seconds=TEMP_CREDS_TTL_SECONDS)
        temp_credentials = TempCredentialsDto(login=login, password=plain_password, expires_at=expires_at)
        r = redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            await r.setex(
                f"employee_temp_creds:{employee.id}",
                TEMP_CREDS_TTL_SECONDS,
                json.dumps(
                    {"login": login, "password": plain_password, "expires_at": expires_at.isoformat()},
                ),
            )
        finally:
            await r.aclose()

    return _to_dto(employee, temp_credentials)


@router.delete("/{employee_id}")
async def detach_employee(
    employee_id: int,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может откреплять сотрудников")
    res = await db.execute(select(User).where(User.id == employee_id, User.owner_id == current_user.id))
    employee = res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")
    employee.owner_id = None
    db.add(employee)
    await db.commit()
    return {"detail": "Сотрудник откреплен"}


@router.put("/{employee_id}", response_model=EmployeeDto)
async def update_employee(
    employee_id: int,
    req: EmployeeUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeeDto:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может редактировать сотрудников")
    if _calc_age(req.birth_date) < 16:
        raise HTTPException(status_code=400, detail="Сотруднику должно быть минимум 16 лет")

    res = await db.execute(select(User).where(User.id == employee_id, User.owner_id == current_user.id))
    employee = res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    employee.last_name = req.last_name.strip()
    employee.first_name = req.first_name.strip()
    employee.middle_name = req.middle_name.strip() if req.middle_name else None
    employee.birth_date = req.birth_date
    employee.phone = req.phone.strip()
    employee.position = req.position.strip()
    employee.note = req.note.strip() if req.note else None
    db.add(employee)
    await db.commit()
    await db.refresh(employee)
    return _to_dto(employee, await _read_temp_credentials(employee.id))


@router.post("/invite", response_model=InviteCreateResponse)
async def create_invite(
    req: InviteCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InviteCreateResponse:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может создавать приглашения")

    table_res = await db.execute(select(Table).where(Table.id == req.table_id, Table.owner_id == current_user.id))
    table = table_res.scalar_one_or_none()
    if not table:
        raise HTTPException(status_code=404, detail="Стол не найден")

    code = secrets.token_urlsafe(18)
    expires_at = datetime.now(UTC) + timedelta(seconds=INVITE_TTL_SECONDS)
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await r.setex(
            f"table_invite:{code}",
            INVITE_TTL_SECONDS,
            json.dumps(
                {"table_id": table.id, "owner_id": current_user.id, "expires_at": expires_at.isoformat()},
            ),
        )
    finally:
        await r.aclose()

    return InviteCreateResponse(code=code, expires_at=expires_at)


@router.post("/accept-invite")
async def accept_invite(
    req: InviteAcceptRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    if current_user.role != "staff":
        raise HTTPException(status_code=403, detail="Приглашения доступны только сотрудникам")

    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = await r.get(f"table_invite:{req.code}")
    finally:
        await r.aclose()
    if not raw:
        raise HTTPException(status_code=400, detail="Инвайт не найден или истек")
    payload = json.loads(raw)
    owner_id = int(payload["owner_id"])
    table_id = int(payload["table_id"])

    if current_user.owner_id is not None and current_user.owner_id != owner_id:
        raise HTTPException(status_code=409, detail="Сотрудник уже привязан к другому владельцу")

    current_user.owner_id = owner_id
    db.add(current_user)

    existing_member = await db.execute(
        select(TableMember).where(TableMember.table_id == table_id, TableMember.user_id == current_user.id),
    )
    if not existing_member.scalar_one_or_none():
        db.add(TableMember(table_id=table_id, user_id=current_user.id))
    await db.commit()
    return {"detail": "Приглашение принято"}


@router.get("/invite/{code}", response_model=InviteInfoResponse)
async def invite_info(
    code: str,
    db: AsyncSession = Depends(get_db),
) -> InviteInfoResponse:
    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = await r.get(f"table_invite:{code}")
    finally:
        await r.aclose()
    if not raw:
        raise HTTPException(status_code=404, detail="Инвайт не найден или истек")
    payload = json.loads(raw)
    owner_id = int(payload["owner_id"])
    table_id = int(payload["table_id"])
    expires_at = datetime.fromisoformat(payload["expires_at"])

    owner_res = await db.execute(select(User).where(User.id == owner_id))
    owner = owner_res.scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=404, detail="Владелец не найден")
    table_res = await db.execute(select(Table).where(Table.id == table_id))
    table = table_res.scalar_one_or_none()

    return InviteInfoResponse(
        owner_short_name=_owner_short_name(owner),
        table_id=table.id if table else None,
        table_title=table.title if table else None,
        expires_at=expires_at,
    )


@router.post("/invite/{code}/register", response_model=RegisterByInviteResponse)
async def register_by_invite(
    code: str,
    req: RegisterByInviteRequest,
    db: AsyncSession = Depends(get_db),
) -> RegisterByInviteResponse:
    if _calc_age(req.birth_date) < 16:
        raise HTTPException(status_code=400, detail="Сотруднику должно быть минимум 16 лет")

    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        raw = await r.get(f"table_invite:{code}")
    finally:
        await r.aclose()
    if not raw:
        raise HTTPException(status_code=404, detail="Инвайт не найден или истек")
    payload = json.loads(raw)
    owner_id = int(payload["owner_id"])
    table_id = int(payload["table_id"])

    owner_res = await db.execute(select(User).where(User.id == owner_id))
    owner = owner_res.scalar_one_or_none()
    if not owner:
        raise HTTPException(status_code=404, detail="Владелец не найден")

    login = req.email.strip().lower()
    exists_res = await db.execute(select(User).where(User.login == login))
    existing = exists_res.scalar_one_or_none()
    if existing and existing.is_active:
        raise HTTPException(status_code=409, detail="User already exists")

    employee = existing or User(
        login=login,
        role="staff",
    )
    employee.first_name = req.first_name.strip()
    employee.last_name = req.last_name.strip()
    employee.middle_name = req.middle_name.strip() if req.middle_name else None
    temp_password = f"SwA1!{secrets.token_urlsafe(8)}"
    employee.password_hash = hash_password(temp_password)
    employee.is_active = False
    employee.phone = req.phone.strip()
    employee.avatar_data_url = req.avatar_data_url.strip() if req.avatar_data_url else None
    employee.birth_date = req.birth_date
    employee.position = "Сотрудник"
    employee.note = None
    employee.owner_id = owner_id
    employee.role = "staff"
    db.add(employee)
    await db.commit()
    await db.refresh(employee)

    r = redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        await r.setex(
            f"invite_bind:{login}",
            INVITE_TTL_SECONDS,
            json.dumps({"owner_id": owner_id, "table_id": table_id}),
        )
    finally:
        await r.aclose()

    await _send_registration_code(employee)

    return RegisterByInviteResponse(
        detail="Код подтверждения отправлен на email.",
        login=login,
        owner_short_name=_owner_short_name(owner),
    )


@router.get("/table-bindings", response_model=list[EmployeeTableBindingDto])
async def employee_table_bindings(
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[EmployeeTableBindingDto]:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может просматривать привязки")

    employees_res = await db.execute(select(User.id).where(User.owner_id == current_user.id))
    employee_ids = [item[0] for item in employees_res.all()]
    if not employee_ids:
        return []

    tables_res = await db.execute(select(Table.id).where(Table.owner_id == current_user.id))
    owner_table_ids = {item[0] for item in tables_res.all()}

    members_res = await db.execute(select(TableMember).where(TableMember.user_id.in_(employee_ids)))
    by_employee: dict[int, list[int]] = {employee_id: [] for employee_id in employee_ids}
    for member in members_res.scalars().all():
        if member.table_id in owner_table_ids:
            by_employee.setdefault(member.user_id, []).append(member.table_id)

    return [
        EmployeeTableBindingDto(employee_id=employee_id, table_ids=sorted(set(by_employee.get(employee_id, []))))
        for employee_id in employee_ids
    ]


@router.put("/{employee_id}/table-bindings", response_model=EmployeeTableBindingDto)
async def update_employee_table_bindings(
    employee_id: int,
    req: EmployeeTableBindingUpdateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> EmployeeTableBindingDto:
    if current_user.role != "owner":
        raise HTTPException(status_code=403, detail="Только владелец может менять привязки")

    employee_res = await db.execute(select(User).where(User.id == employee_id, User.owner_id == current_user.id))
    employee = employee_res.scalar_one_or_none()
    if not employee:
        raise HTTPException(status_code=404, detail="Сотрудник не найден")

    tables_res = await db.execute(select(Table.id).where(Table.owner_id == current_user.id))
    allowed_table_ids = {item[0] for item in tables_res.all()}
    target_table_ids = {table_id for table_id in req.table_ids if table_id in allowed_table_ids}

    existing_res = await db.execute(select(TableMember).where(TableMember.user_id == employee_id))
    existing = existing_res.scalars().all()
    for member in existing:
        if member.table_id in allowed_table_ids:
            await db.delete(member)

    for table_id in target_table_ids:
        db.add(TableMember(table_id=table_id, user_id=employee_id))

    await db.commit()
    return EmployeeTableBindingDto(employee_id=employee_id, table_ids=sorted(target_table_ids))
