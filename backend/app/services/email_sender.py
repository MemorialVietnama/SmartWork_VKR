import aiosmtplib
from email.message import EmailMessage

from app.core.config import settings


async def send_email(to_email: str, subject: str, body_text: str) -> None:
    """
    Отправка письма через SMTP (MailHog в Docker).
    """
    msg = EmailMessage()
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body_text)

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
    )

