import os, django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartguard_backend.settings')
django.setup()
from core.models import SystemConfig
sc = SystemConfig.objects.first()
print('FRAME RATE IS:', sc.frame_rate)
