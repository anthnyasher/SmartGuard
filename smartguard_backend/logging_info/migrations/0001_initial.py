# logging_info/migrations/0001_initial.py
# Run: python manage.py migrate logging_info

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    initial = True

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
    ]

    operations = [
        migrations.CreateModel(
            name='AuditLog',
            fields=[
                ('id',          models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('username',    models.CharField(blank=True, max_length=150)),
                ('ip_address',  models.GenericIPAddressField(blank=True, null=True)),
                ('user_agent',  models.TextField(blank=True)),
                ('device_info', models.CharField(blank=True, max_length=255)),
                ('category',    models.CharField(
                    choices=[
                        ('OPERATIONAL',   'Operational'),
                        ('USER_ACTIVITY', 'User Activity'),
                        ('DETECTION',     'Alert & Detection'),
                        ('SECURITY',      'Security Threats'),
                        ('AUDIT',         'Audit'),
                    ],
                    default='OPERATIONAL',
                    max_length=30,
                )),
                ('level', models.CharField(
                    choices=[
                        ('INFO',     'Info'),
                        ('WARNING',  'Warning'),
                        ('MEDIUM',   'Medium'),
                        ('HIGH',     'High'),
                        ('CRITICAL', 'Critical'),
                    ],
                    default='INFO',
                    max_length=10,
                )),
                ('action', models.CharField(
                    choices=[
                        ('LOGIN_SUCCESS',      'Login Success'),
                        ('LOGIN_FAILED',       'Login Failed'),
                        ('LOGIN_LOCKED',       'Account Locked'),
                        ('LOGIN_UNLOCKED',     'Account Unlocked'),
                        ('LOGOUT',             'Logout'),
                        ('OTP_SENT',           'OTP Sent'),
                        ('OTP_SUCCESS',        'OTP Verified'),
                        ('OTP_FAILED',         'OTP Failed'),
                        ('OTP_EXPIRED',        'OTP Expired'),
                        ('NEW_IP_LOGIN',       'Login from New IP'),
                        ('SESSION_EXPIRED',    'Session Expired'),
                        ('USER_CREATED',       'User Created'),
                        ('USER_UPDATED',       'User Updated'),
                        ('USER_DELETED',       'User Deleted'),
                        ('USER_ACTIVATED',     'User Activated'),
                        ('USER_DEACTIVATED',   'User Deactivated'),
                        ('PASSWORD_RESET',     'Password Reset'),
                        ('PASSWORD_CHANGED',   'Password Changed'),
                        ('CAMERA_ADDED',       'Camera Added'),
                        ('CAMERA_UPDATED',     'Camera Updated'),
                        ('CAMERA_DELETED',     'Camera Deleted'),
                        ('CAMERA_ONLINE',      'Camera Online'),
                        ('CAMERA_OFFLINE',     'Camera Offline'),
                        ('ALERT_CREATED',      'Alert Created'),
                        ('ALERT_REVIEWED',     'Alert Reviewed'),
                        ('ALERT_ESCALATED',    'Alert Escalated'),
                        ('ALERT_FALSE_POS',    'Alert Marked False Positive'),
                        ('ALERT_CLOSED',       'Alert Closed'),
                        ('ALERT_ACKNOWLEDGED', 'Alert Acknowledged'),
                        ('EVIDENCE_ACCESSED',  'Evidence Accessed'),
                        ('EVIDENCE_DOWNLOAD',  'Evidence Downloaded'),
                        ('CONFIG_CHANGED',     'System Configuration Changed'),
                        ('BACKUP_CREATED',     'Backup Created'),
                        ('BACKUP_RESTORED',    'Backup Restored'),
                        ('BRUTE_FORCE',        'Brute Force Detected'),
                        ('BLOCKED_IP',         'Repeated Blocked IP'),
                        ('INTEGRITY_FAIL',     'Integrity Check Failure'),
                        ('SUSPICIOUS_ACCESS',  'Suspicious Access Attempt'),
                    ],
                    max_length=40,
                )),
                ('message',   models.TextField()),
                ('source',    models.CharField(blank=True, max_length=100)),
                ('extra',     models.JSONField(blank=True, default=dict)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('user', models.ForeignKey(
                    blank=True, null=True,
                    on_delete=django.db.models.deletion.SET_NULL,
                    related_name='audit_logs',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
            options={
                'ordering': ['-timestamp'],
            },
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['category'], name='logging_inf_categor_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['level'], name='logging_inf_level_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['action'], name='logging_inf_action_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['timestamp'], name='logging_inf_timesta_idx'),
        ),
        migrations.AddIndex(
            model_name='auditlog',
            index=models.Index(fields=['user'], name='logging_inf_user_idx'),
        ),
    ]