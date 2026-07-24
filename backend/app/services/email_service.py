import os
import logging
import asyncio
from jose import jwt
from datetime import datetime, timezone, timedelta
from app.config import settings

logger = logging.getLogger(__name__)

async def send_verification_email(user_id: str, new_email: str) -> None:
    await asyncio.sleep(0)
    # Generate token (expires in 24 hours)
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    payload = {
        "sub": user_id,
        "new_email": new_email,
        "type": "email_verification",
        "exp": expire
    }
    token = jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)
    
    # Verification link points to backend route which updates db and redirects to frontend
    verification_link = f"http://localhost:8000/users/verify-email?token={token}"
    
    logger.info("=" * 60)
    logger.info(f"EMAIL VERIFICATION LINK FOR {new_email}:")
    logger.info(verification_link)
    logger.info("=" * 60)
    
    sendgrid_key = os.environ.get("SENDGRID_API_KEY")
    if sendgrid_key:
        try:
            from sendgrid import SendGridAPIClient
            from sendgrid.helpers.mail import Mail
            
            message = Mail(
                from_email="noreply@luminote.com",
                to_emails=new_email,
                subject="Verify your new email address - Luminote",
                html_content=f"""
                <p>Hello,</p>
                <p>Please verify your new email address by clicking the link below:</p>
                <p><a href="{verification_link}">{verification_link}</a></p>
                <p>If you did not request this change, please ignore this email.</p>
                """
            )
            sg = SendGridAPIClient(sendgrid_key)
            sg.send(message)
            logger.info("Verification email sent via SendGrid successfully.")
        except Exception as e:
            logger.exception("Failed to send verification email via SendGrid: %s", e)
    else:
        logger.info("SENDGRID_API_KEY is not configured in the environment. Verification email printed to logs.")
