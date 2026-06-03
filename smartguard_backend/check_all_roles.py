import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartguard_backend.settings')
django.setup()

from django.contrib.auth import get_user_model
User = get_user_model()

print("All users:")
for u in User.objects.all():
    print(f"- {u.username} | {u.email} | {u.role}")

user = User.objects.filter(username='admin').first()
if user:
    print(f"\nUser 'admin' role is {user.role}")
    if user.role != 'ADMIN':
        print("Changing to ADMIN...")
        user.role = 'ADMIN'
        user.save()
