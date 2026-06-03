"""Authentication: bcrypt password hashing + JWT (Bearer token) + role helpers."""
import os
import uuid
import bcrypt
import jwt
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from typing import Optional

from db import db

JWT_ALGORITHM = "HS256"
bearer_scheme = HTTPBearer(auto_error=False)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def _secret() -> str:
    return os.environ["JWT_SECRET"]


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
        "type": "access",
    }
    return jwt.encode(payload, _secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(
    creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
) -> dict:
    token = creds.credentials if creds else None
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, _secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Session expired. Please log in again.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid session")
    user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=401, detail="User not found or inactive")
    return user


def require_role(*roles):
    async def checker(user: dict = Depends(get_current_user)) -> dict:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="You do not have access to this resource.")
        return user
    return checker


# ---------- Request models ----------
class PatientLinkInfo(BaseModel):
    full_name: str
    age: Optional[int] = None
    relationship: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    notes: Optional[str] = None


class RegisterRequest(BaseModel):
    full_name: str
    email: EmailStr
    password: str = Field(min_length=6)
    role: str  # patient | caregiver
    phone: Optional[str] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    consent_accepted: bool = False
    patient_info: Optional[PatientLinkInfo] = None  # when caregiver registers


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


router = APIRouter(prefix="/api/auth", tags=["auth"])


async def _log(user_id, action, entity_type="", entity_id="", details=""):
    await db.activity_logs.insert_one({
        "id": str(uuid.uuid4()), "user_id": user_id, "action": action,
        "entity_type": entity_type, "entity_id": entity_id, "details": details,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })


async def _public_user(user_id: str) -> dict:
    return await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})


@router.post("/register")
async def register(body: RegisterRequest):
    if body.role not in ("patient", "caregiver"):
        raise HTTPException(status_code=400, detail="Role must be patient or caregiver.")
    email = body.email.lower().strip()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="An account with this email already exists.")

    now = datetime.now(timezone.utc).isoformat()
    user_id = str(uuid.uuid4())
    user_doc = {
        "id": user_id, "full_name": body.full_name.strip(), "email": email,
        "password_hash": hash_password(body.password), "role": body.role,
        "phone": body.phone, "emergency_contact_name": body.emergency_contact_name,
        "emergency_contact_phone": body.emergency_contact_phone,
        "consent_accepted": body.consent_accepted, "is_active": True,
        "onboarding_completed": False, "created_at": now, "updated_at": now,
    }
    await db.users.insert_one(user_doc)

    # Create patient profile + links
    if body.role == "patient":
        patient_id = str(uuid.uuid4())
        await db.patients.insert_one({
            "id": patient_id, "user_id": user_id, "full_name": body.full_name.strip(),
            "age": None, "emergency_contact_name": body.emergency_contact_name,
            "emergency_contact_phone": body.emergency_contact_phone, "notes": "",
            "created_at": now,
        })
    else:  # caregiver
        pinfo = body.patient_info or PatientLinkInfo(full_name="My Loved One")
        patient_id = str(uuid.uuid4())
        await db.patients.insert_one({
            "id": patient_id, "user_id": None, "full_name": pinfo.full_name,
            "age": pinfo.age, "emergency_contact_name": pinfo.emergency_contact_name,
            "emergency_contact_phone": pinfo.emergency_contact_phone,
            "notes": pinfo.notes or "", "created_at": now,
        })
        await db.patient_caregiver_links.insert_one({
            "id": str(uuid.uuid4()), "patient_id": patient_id, "caregiver_id": user_id,
            "relationship": pinfo.relationship or "Family", "permissions": "full",
            "created_at": now,
        })

    await _log(user_id, "register", "user", user_id, f"role={body.role}")
    token = create_access_token(user_id, email, body.role)
    return {"token": token, "user": await _public_user(user_id)}


@router.post("/login")
async def login(body: LoginRequest):
    email = body.email.lower().strip()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")
    if not user.get("is_active", True):
        raise HTTPException(status_code=403, detail="This account has been deactivated.")
    await _log(user["id"], "login", "user", user["id"])
    token = create_access_token(user["id"], email, user["role"])
    return {"token": token, "user": await _public_user(user["id"])}


@router.get("/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# Demo accounts are seeded in seed.py; passwords live ONLY on the backend.
# The frontend asks for a role and the server issues a token for the matching demo user.
DEMO_EMAILS = {
    "patient": "omar@memorymate.app",
    "caregiver": "sarah@memorymate.app",
    "admin": os.environ.get("ADMIN_EMAIL", "admin@memorymate.app"),
}


class DemoLoginRequest(BaseModel):
    role: str


@router.post("/demo-login")
async def demo_login(body: DemoLoginRequest):
    email = DEMO_EMAILS.get(body.role)
    if not email:
        raise HTTPException(status_code=400, detail="Unknown demo role.")
    user = await db.users.find_one({"email": email})
    if not user or not user.get("is_active", True):
        raise HTTPException(status_code=404, detail="Demo account is not available.")
    await _log(user["id"], "demo_login", "user", user["id"])
    token = create_access_token(user["id"], user["email"], user["role"])
    return {"token": token, "user": await _public_user(user["id"])}


class OnboardingRequest(BaseModel):
    consent_accepted: Optional[bool] = None
    emergency_contact_name: Optional[str] = None
    emergency_contact_phone: Optional[str] = None
    onboarding_completed: Optional[bool] = None


@router.patch("/onboarding")
async def update_onboarding(body: OnboardingRequest, user: dict = Depends(get_current_user)):
    update = {k: v for k, v in body.model_dump().items() if v is not None}
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    if update:
        await db.users.update_one({"id": user["id"]}, {"$set": update})
    return await _public_user(user["id"])
