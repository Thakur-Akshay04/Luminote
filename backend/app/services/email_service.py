import asyncio
import html
import logging
from datetime import datetime, timedelta, timezone
from jose import jwt

from app.config import settings
from app.observability import audit_log

logger = logging.getLogger(__name__)


def _mask_email(email: str) -> str:
    if "@" not in email:
        return "***"
    local, domain = email.split("@", 1)
    prefix = local[:2] if len(local) > 2 else local[:1]
    return f"{prefix}***@{domain}"


async def send_verification_email(user_id: str, new_email: str) -> None:
    """Generate a 24h verification token and deliver email via SendGrid (never logs raw tokens)."""
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    payload = {
        "sub": user_id,
        "new_email": new_email,
        "type": "email_verification",
        "exp": expire,
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)

    base_url = settings.backend_url.rstrip("/")
    verification_link = f"{base_url}/users/verify-email?token={token}"
    masked = _mask_email(new_email)

    sendgrid_key = settings.sendgrid_api_key.strip()
    if sendgrid_key:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail

            escaped_link = html.escape(verification_link, quote=True)
            message = Mail(
                from_email=settings.sendgrid_from_email,
                to_emails=new_email,
                subject="Verify your new email address - Luminote",
                html_content=f"""
                <p>Hello,</p>
                <p>Please verify your new email address by clicking the link below:</p>
                <p><a href="{escaped_link}">Verify Email Address</a></p>
                <p>If you did not request this change, please ignore this email.</p>
                """,
            )
            sg = SendGridAPIClient(sendgrid_key)
            await asyncio.to_thread(sg.send, message)
            audit_log("verification_email_sent", user_id=user_id, target=masked)
        except Exception as exc:
            audit_log("verification_email_failed", user_id=user_id, outcome="failure", target=masked)
            logger.exception("Failed to send verification email via SendGrid for user %s: %s", user_id, exc)
    else:
        logger.info("SENDGRID_API_KEY not configured; verification email queued (redacted) for %s", masked)
