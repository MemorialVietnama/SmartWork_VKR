import aiosmtplib
from email.message import EmailMessage

from app.core.config import settings


def _build_html_email(subject: str, body_text: str) -> str:
    safe_text = body_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br/>")
    return f"""
<!doctype html>
<html lang="ru">
  <body style="margin:0;padding:0;background:#f6f8fb;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="620" cellspacing="0" cellpadding="0" style="max-width:620px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:18px 22px;background:linear-gradient(90deg,#111827,#1f2937);">
                <div style="font-size:20px;font-weight:800;letter-spacing:0.4px;color:#ffffff;">SMARTWORK</div>
                <div style="font-size:12px;color:#cbd5e1;margin-top:4px;">{subject}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 22px;font-size:14px;line-height:1.6;color:#1e293b;">
                {safe_text}
              </td>
            </tr>
            <tr>
              <td style="padding:12px 22px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
                SmartWork • service notification
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
"""


async def send_email(to_email: str, subject: str, body_text: str) -> None:
    """
    Отправка письма через SMTP (MailHog в Docker).
    """
    msg = EmailMessage()
    msg["From"] = settings.EMAIL_FROM
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.set_content(body_text)
    msg.add_alternative(_build_html_email(subject=subject, body_text=body_text), subtype="html")

    await aiosmtplib.send(
        msg,
        hostname=settings.SMTP_HOST,
        port=settings.SMTP_PORT,
    )

