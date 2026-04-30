# alerts/signals.py

from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import Alert
from .notifications import send_email_notification
from accounts.models import CustomUser


@receiver(post_save, sender=Alert)
def email_on_critical_alert(sender, instance: Alert, created, **kwargs):
    """
    Send email notifications to Staff / Operations Manager users when
    a HIGH or CRITICAL SHOPLIFTING alert is created.
    """
    # Only on first creation, not on updates
    if not created:
        return

    # Only for shoplifting alerts
    # Only for high-severity alerts
    if instance.severity not in ["HIGH", "CRITICAL"]:
        return

    # Collect recipient emails from active Staff and Operations Managers
       # Build subject
       # Build subject
    subject = f"[SmartGuard] {instance.severity} {instance.behavior_type.replace('_', ' ').title()} Alert"

    # Split recipients by role
    staff_emails = list(
        CustomUser.objects.filter(
            role="STAFF", is_active=True
        ).exclude(email="").values_list("email", flat=True)
    )

    ops_emails = list(
        CustomUser.objects.filter(
            role="OPERATIONS_MANAGER", is_active=True
        ).exclude(email="").values_list("email", flat=True)
    )

    admin_emails = list(
        CustomUser.objects.filter(
            role="ADMIN", is_active=True
        ).exclude(email="").values_list("email", flat=True)
    )

    # If no one to notify, stop
    if not staff_emails and not ops_emails and not admin_emails:
        return

    # Shorter message for Staff
    staff_message = (
    f"Behavior Detected: {instance.behavior_type.replace('_', ' ').title()}\n"
    f"Severity: {instance.severity}\n"
    f"Camera: {instance.camera.name}\n"
    f"Location: {instance.camera.location}\n"
    f"Time: {instance.created_at:%Y-%m-%d %H:%M}\n"
)

    # Detailed message for Admin and Operations Manager
    management_message = (
    f"Alert ID: {instance.id}\n"
    f"Behavior: {instance.behavior_type.replace('_', ' ').title()}\n"
    f"Camera: {instance.camera.name}\n"
    f"Location: {instance.camera.location}\n"
    f"Time: {instance.created_at:%Y-%m-%d %H:%M}\n"
    f"Confidence: {instance.confidence:.2f}\n"
    f"Status: {instance.status}\n"
    f"Open in dashboard: https://your-frontend/alerts/{instance.id}/\n"
)

    if staff_emails:
        send_email_notification(subject, staff_message, list(staff_emails))

    # Ops + Admin get the same detailed message
    management_recipients = list(ops_emails) + list(admin_emails)
    if management_recipients:
        send_email_notification(subject, management_message, management_recipients)
