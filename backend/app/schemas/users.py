from pydantic import BaseModel, EmailStr

class ChangeEmailRequest(BaseModel):
    new_email: EmailStr
    confirm_new_email: EmailStr

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

class ChangeNameRequest(BaseModel):
    display_name: str
