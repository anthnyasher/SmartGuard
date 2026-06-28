import os
import django

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartguard_backend.settings')
django.setup()

from rest_framework.test import APIRequestFactory
from accounts.views import UserDetailView
from django.contrib.auth import get_user_model

User = get_user_model()
user, _ = User.objects.get_or_create(username='teststaff2', defaults={'role': 'STAFF'})

factory = APIRequestFactory()
request = factory.get('/api/users/1/')
from rest_framework.request import Request
request = Request(request)
request.user = user

view = UserDetailView.as_view()
try:
    response = view(request._request, pk=1)
    print('Response status:', response.status_code)
except Exception as e:
    print('Exception:', type(e), e)
