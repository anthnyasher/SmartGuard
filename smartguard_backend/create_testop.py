import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartguard_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

if not User.objects.filter(username='testop').exists():
    user = User.objects.create_user(
        username='testop',
        password='testop',
        role='OPS_MANAGER',
        is_active=True,
        dpa_consent=True,
        email='testop@example.com'
    )
    print("Created testop user.")
else:
    print("testop user already exists.")
