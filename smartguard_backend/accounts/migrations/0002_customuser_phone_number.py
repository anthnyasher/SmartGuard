# accounts/migrations/0002_customuser_phone_number.py
#
# Adds the phone_number field to the CustomUser model.
# This field is used by the Twilio SMS alert system to route real-time
# shoplifting notifications to staff and operations managers.
#
# Run: python manage.py migrate accounts

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='customuser',
            name='phone_number',
            field=models.CharField(
                blank=True,
                default='',
                help_text=(
                    'Mobile number for SMS alerts. '
                    'Use E.164 format: +63XXXXXXXXXX for Philippine numbers.'
                ),
                max_length=20,
            ),
        ),
    ]