import re
import bleach
from pydantic import BaseModel, EmailStr, field_validator

class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    confirm_new_email: EmailStr

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ChangeNameRequest(BaseModel):
    display_name: str

    @field_validator("display_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("Name cannot be empty")
        if len(v_stripped) > 50:
            raise ValueError("Name must not exceed 50 characters")
        if not re.match(r"^[a-zA-Z\s\-']+$", v_stripped):
            raise ValueError("Name contains invalid characters")
        return bleach.clean(v_stripped, tags=[], strip=True)
