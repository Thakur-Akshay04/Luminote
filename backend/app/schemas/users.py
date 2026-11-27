import bleach
from pydantic import BaseModel, EmailStr, Field, field_validator


class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    confirm_new_email: EmailStr


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1, max_length=256)
    new_password: str = Field(..., min_length=8, max_length=256)


class ChangeNameRequest(BaseModel):
    display_name: str = Field(..., max_length=100)

    @field_validator("display_name")
    @classmethod
    def validate_name(cls, v: str) -> str:
        v_stripped = v.strip()
        if not v_stripped:
            raise ValueError("Name cannot be empty")
        if len(v_stripped) > 50:
            raise ValueError("Name must not exceed 50 characters")
        if not all(char.isalpha() or char.isspace() or char in "-'" for char in v_stripped):
            raise ValueError("Name contains invalid characters")
        return bleach.clean(v_stripped, tags=[], strip=True)
