# accounts/urls.py

from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView

from .views import (
    login_view,
    logout_view,
    verify_otp_view,
    forgot_password_view,
    reset_password_confirm_view,
    RegisterView,
    UserProfileView,
    UsersListCreateView,
    UserDetailView,
    reset_user_password,
    unlock_user_account,
    toggle_user_active,
)

urlpatterns = [
    # ── Authentication ─────────────────────────────────────────────────────────
    path("auth/login/",                   login_view,                   name="login"),
    path("auth/logout/",                  logout_view,                  name="logout"),
    path("auth/verify-otp/",             verify_otp_view,              name="verify-otp"),
    path("auth/forgot-password/",        forgot_password_view,         name="forgot-password"),
    path("auth/reset-password-confirm/", reset_password_confirm_view,  name="reset-password-confirm"),
    path("auth/refresh/",                TokenRefreshView.as_view(),   name="token-refresh"),
    path("auth/register/",               RegisterView.as_view(),       name="register"),
    path("auth/me/",                     UserProfileView.as_view(),    name="user-profile"),

    # ── Admin: User Management ─────────────────────────────────────────────────
    path("users/",                         UsersListCreateView.as_view(), name="user-list-create"),
    path("users/<int:pk>/",                UserDetailView.as_view(),      name="user-detail"),
    path("users/<int:pk>/reset-password/", reset_user_password,           name="user-reset-password"),
    path("users/<int:pk>/unlock/",         unlock_user_account,           name="user-unlock"),
    path("users/<int:pk>/toggle-active/",  toggle_user_active,            name="user-toggle-active"),
]