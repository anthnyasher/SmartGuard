# accounts/migrations/0003_otptoken_last_login_ip.py
# Adds:
#   - CustomUser.last_login_ip   (tracks last IP for new-device detection)
#   - OTPToken model             (Admin 2FA)
#   - Updates MAX_ATTEMPTS to 3  (FRS 1.B)
#
# Run: python manage.py migrate accounts

import django.db.models.deletion
from django.conf import settings
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_customuser_phone_number'),
    ]

    operations = [
        # ── Add last_login_ip to CustomUser ────────────────────────────────────
        migrations.AddField(
            model_name='customuser',
            name='last_login_ip',
            field=models.GenericIPAddressField(blank=True, null=True),
        ),

        # ── Create OTPToken table ──────────────────────────────────────────────
        migrations.CreateModel(
            name='OTPToken',
            fields=[
                ('id',         models.BigAutoField(auto_created=True, primary_key=True, serialize=False)),
                ('token',      models.CharField(max_length=6)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('expires_at', models.DateTimeField()),
                ('used',       models.BooleanField(default=False)),
                ('ip_address', models.GenericIPAddressField(blank=True, null=True)),
                ('user', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='otp_tokens',
                    to=settings.AUTH_USER_MODEL,
                )),
            ],
        ),
    ]