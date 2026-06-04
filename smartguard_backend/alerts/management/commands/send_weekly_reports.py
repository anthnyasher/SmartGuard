import logging
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.core.mail import EmailMultiAlternatives
from django.conf import settings
from alerts.models import Alert
from accounts.models import CustomUser

log = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Aggregates weekly detections and emails a summary HTML report to Ops Managers.'

    def handle(self, *args, **options):
        now = timezone.now()
        start_of_week = now - timedelta(days=7)
        
        alerts = Alert.objects.filter(created_at__gte=start_of_week)
        total_alerts = alerts.count()
        critical_alerts = alerts.filter(severity='CRITICAL').count()
        high_alerts = alerts.filter(severity='HIGH').count()
        
        managers = CustomUser.objects.filter(role__in=['ADMIN', 'OPS_MANAGER'], is_active=True)
        emails = [m.email for m in managers if m.email]
        
        if not emails:
            self.stdout.write(self.style.WARNING('No managers found with valid email addresses. Aborting.'))
            return
            
        subject = f'SmartGuard Weekly Security Report ({start_of_week.strftime("%b %d")} - {now.strftime("%b %d")})'
        
        html_content = f"""
        <html>
        <body style="font-family: Arial, sans-serif; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto;">
            <div style="background-color: #0f1623; padding: 20px; text-align: center; border-radius: 8px 8px 0 0;">
                <h2 style="color: white; margin: 0;">SmartGuard Weekly Report</h2>
            </div>
            <div style="padding: 20px; border: 1px solid #eaedf4; border-top: none; border-radius: 0 0 8px 8px;">
                <p>Hello,</p>
                <p>Here is your weekly security summary from <strong>{start_of_week.strftime("%B %d, %Y")}</strong> to <strong>{now.strftime("%B %d, %Y")}</strong>.</p>
                
                <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
                    <tr>
                        <td style="padding: 15px; background-color: #f0f2f7; border-radius: 8px; text-align: center;">
                            <h3 style="margin: 0; color: #0f1623; font-size: 24px;">{total_alerts}</h3>
                            <p style="margin: 0; color: #4b5568;">Total Incidents</p>
                        </td>
                        <td style="padding: 10px;"></td>
                        <td style="padding: 15px; background-color: rgba(220, 38, 38, 0.1); border-radius: 8px; text-align: center;">
                            <h3 style="margin: 0; color: #dc2626; font-size: 24px;">{critical_alerts}</h3>
                            <p style="margin: 0; color: #dc2626;">Critical Alerts</p>
                        </td>
                        <td style="padding: 10px;"></td>
                        <td style="padding: 15px; background-color: rgba(180, 83, 9, 0.1); border-radius: 8px; text-align: center;">
                            <h3 style="margin: 0; color: #b45309; font-size: 24px;">{high_alerts}</h3>
                            <p style="margin: 0; color: #b45309;">High Alerts</p>
                        </td>
                    </tr>
                </table>
                
                <p style="margin-top: 30px;">Please log in to the <a href="https://smartguard.54.206.184.54.nip.io" style="color: #2563eb;">SmartGuard Dashboard</a> to review these incidents in detail and verify any unreviewed alerts.</p>
                
                <p style="color: #9aa3b2; font-size: 12px; margin-top: 40px; text-align: center;">This is an automated message from the SmartGuard AI Worker.</p>
            </div>
        </body>
        </html>
        """
        
        msg = EmailMultiAlternatives(
            subject,
            f"SmartGuard Weekly Report: {total_alerts} total incidents, {critical_alerts} critical.",
            settings.DEFAULT_FROM_EMAIL or 'noreply@smartguard.com',
            emails
        )
        msg.attach_alternative(html_content, "text/html")
        
        try:
            msg.send(fail_silently=False)
            self.stdout.write(self.style.SUCCESS(f'Successfully sent weekly report to {len(emails)} users.'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to send email: {e}'))
