from twilio.rest import Client
from django.conf import settings
from django.core.mail import send_mail
from django.conf import settings

def send_sms(to_number: str, body: str):
    if not (settings.TWILIO_ACCOUNT_SID and settings.TWILIO_AUTH_TOKEN and settings.TWILIO_FROM_NUMBER):
        return None

    client = Client(settings.TWILIO_ACCOUNT_SID, settings.TWILIO_AUTH_TOKEN)
    message = client.messages.create(
        from_=settings.TWILIO_FROM_NUMBER,
        to=to_number,  # +639XXXXXXXXX
        body=body,
    )
    return message.sid


def send_email_notification(subject, message, to_list):
    send_mail(
        subject,
        message,
        settings.DEFAULT_FROM_EMAIL,
        to_list,
        fail_silently=False,
    )
