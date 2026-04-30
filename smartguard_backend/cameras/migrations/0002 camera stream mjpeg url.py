# cameras/migrations/0002_camera_stream_mjpeg_url.py
# Generated manually — run: python manage.py migrate

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        # Replace '0001_initial' with whatever your last migration is
        ('cameras', '0001_initial'),
    ]

    operations = [
        migrations.AddField(
            model_name='camera',
            name='stream_mjpeg_url',
            field=models.CharField(blank=True, default='', max_length=500),
        ),
    ]