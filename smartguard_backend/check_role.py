import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartguard_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()
user = User.objects.filter(is_superuser=True).first()
if user:
    print(f'Superuser {user.username} role is {user.role}')
    if user.role != 'ADMIN':
        print('Updating superuser role to ADMIN...')
        user.role = 'ADMIN'
        user.save()
else:
    print('No superuser found.')
