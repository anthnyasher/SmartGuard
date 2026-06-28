import os
import sys
import django
from datetime import timedelta
import random

sys.path.append(r'C:\Users\asher\OneDrive\Desktop\SmartGuard\smartguard_backend')
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartguard_backend.settings')
django.setup()

from alerts.models import Alert
from evidence.models import EvidenceClip
from ir.models import IncidentReport
from django.utils import timezone

now = timezone.now()

alerts = list(Alert.objects.all())
for a in alerts:
    a.created_at = now - timedelta(hours=random.uniform(0, 23))
    a.save()

evs = list(EvidenceClip.objects.all())
for e in evs:
    e.created_at = now - timedelta(hours=random.uniform(0, 23))
    e.save()

incs = list(IncidentReport.objects.all())
for i in incs:
    i.created_at = now - timedelta(hours=random.uniform(0, 23))
    i.save()

print(f"Updated {len(alerts)} alerts, {len(evs)} evidence, and {len(incs)} incidents.")
