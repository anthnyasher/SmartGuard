# accounts/views.py
# ─────────────────────────────────────────────────────────────────────────────
# Fixes applied:
#   - log_audit import wrapped in try/except → login never crashes from logging failure
#   - OTP email sent in background thread → Admin login is fast
#   - Lockout is permanent, no countdown
#   - forgot_password_view + reset_password_confirm_view (OTP-based, all roles)
#   - OPS role handled alongside OPS_MANAGER in redirects
# ─────────────────────────────────────────────────────────────────────────────

import threading
import logging

from django.contrib.auth import get_user_model
from django.core.mail import send_mail
from django.conf import settings
from django.shortcuts import get_object_or_404
from django.utils import timezone

from rest_framework import generics, status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.tokens import RefreshToken

from .models import OTPToken
from .serializers import (
    UserSerializer,
    RegisterSerializer,
    AdminUserListSerializer,
    AdminUserCreateSerializer,
    AdminUserUpdateSerializer,
    AdminPasswordResetSerializer,
)
from .permissions import IsAdminRole
from rest_framework_simplejwt.tokens import RefreshToken, TokenError

User   = get_user_model()
logger = logging.getLogger(__name__)


# ── Helpers ────────────────────────────────────────────────────────────────────

def get_client_ip(request):
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _safe_log(action, message, **kwargs):
    """
    Fire-and-forget audit log.  Wrapped in try/except so that a missing
    AuditLog table (e.g. migrations not yet run) never crashes a login request.
    """
    try:
        from logging_info.utils import log_audit
        log_audit(action=action, message=message, **kwargs)
    except Exception as exc:
        logger.warning("Audit log skipped (%s): %s", action, exc)


def _send_email_async(subject, body, to_list):
    """Send email in a background thread so the HTTP response is not delayed."""
    def _send():
        try:
            send_mail(
                subject=subject,
                message=body,
                from_email=settings.DEFAULT_FROM_EMAIL,
                recipient_list=to_list,
                fail_silently=True,
            )
        except Exception as exc:
            logger.error("Email send failed: %s", exc)

    threading.Thread(target=_send, daemon=True).start()


def _notify_lockout_admins(username, ip):
    """Notify all Admin users asynchronously when an account is locked."""
    try:
        admin_emails = list(
            User.objects.filter(role='ADMIN', is_active=True)
            .exclude(email='')
            .values_list('email', flat=True)
        )
        if admin_emails:
            _send_email_async(
                subject=f"[SmartGuard] Account Locked — {username}",
                body=(
                    f"The account '{username}' has been permanently locked after "
                    f"{User.MAX_ATTEMPTS} consecutive failed login attempts.\n\n"
                    f"Source IP: {ip}\n"
                    f"Time: {timezone.now():%Y-%m-%d %H:%M:%S UTC}\n\n"
                    f"Go to Access Control → Unlock to restore access."
                ),
                to_list=admin_emails,
            )
    except Exception as exc:
        logger.warning("Lockout notification failed: %s", exc)


# ── Login ──────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([AllowAny])
def login_view(request):
    """
    POST /api/auth/login/
    Body: { "username": "...", "password": "..." }

    Non-admin:  returns { access, refresh } immediately on success
    Admin:      returns { requires_otp, otp_session_id } — OTP emailed async
    """
    identifier = request.data.get("username", "").strip()
    password   = request.data.get("password", "")
    ip         = get_client_ip(request)
    ua         = request.META.get("HTTP_USER_AGENT", "")

    if not identifier or not password:
        return Response(
            {"detail": "Username and password are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # ── Find user (by username or email) ──────────────────────────────────────
    user = None
    for field in ("username", "email"):
        try:
            user = User.objects.get(**{field: identifier})
            break
        except User.DoesNotExist:
            pass

    # ── Check lockout ─────────────────────────────────────────────────────────
    if user is not None and user.is_locked_out():
        _safe_log(
            action="LOGIN_LOCKED",
            message=(
                f"Locked account login attempt for '{user.username}' from {ip}."
            ),
            category="SECURITY", level="HIGH",
            source="Login Security",
            user=user, username=user.username,
            ip_address=ip, user_agent=ua,
        )
        return Response(
            {
                "detail": (
                    "This account is locked due to too many failed login attempts. "
                    "Please contact your system administrator to unlock it."
                ),
                "locked": True,
            },
            status=status.HTTP_403_FORBIDDEN,
        )

    # ── Verify password ────────────────────────────────────────────────────────
    if user is None or not user.check_password(password):
        if user is not None:
            user.record_failed_attempt()
            remaining = user.attempts_remaining()
            just_locked = user.is_locked_out()

            if just_locked:
                _safe_log(
                    action="LOGIN_LOCKED",
                    message=(
                        f"Account '{user.username}' permanently locked after "
                        f"{User.MAX_ATTEMPTS} failed attempts from {ip}."
                    ),
                    category="SECURITY", level="HIGH",
                    source="Login Security",
                    user=user, username=user.username,
                    ip_address=ip, user_agent=ua,
                    extra={"attempts": User.MAX_ATTEMPTS},
                )
                _notify_lockout_admins(user.username, ip)
                return Response(
                    {
                        "detail": (
                            "Account locked after too many failed attempts. "
                            "Contact your administrator to regain access."
                        ),
                        "locked": True,
                    },
                    status=status.HTTP_403_FORBIDDEN,
                )

            _safe_log(
                action="LOGIN_FAILED",
                message=(
                    f"Wrong password for '{user.username}' from {ip}. "
                    f"{remaining} attempt(s) remaining."
                ),
                category="SECURITY",
                level="WARNING" if remaining > 1 else "HIGH",
                source="Login Security",
                user=user, username=user.username,
                ip_address=ip, user_agent=ua,
                extra={"attempts_remaining": remaining},
            )
            return Response(
                {
                    "detail":             "Invalid credentials.",
                    "locked":             False,
                    "attempts_remaining": remaining,
                },
                status=status.HTTP_401_UNAUTHORIZED,
            )

        # Unknown identifier
        _safe_log(
            action="LOGIN_FAILED",
            message=f"Login attempt for unknown identifier '{identifier}' from {ip}.",
            category="SECURITY", level="WARNING",
            source="Login Security",
            username=identifier, ip_address=ip, user_agent=ua,
        )
        return Response(
            {"detail": "Invalid credentials.", "locked": False, "attempts_remaining": None},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # ── Account disabled ───────────────────────────────────────────────────────
    if not user.is_active:
        return Response(
            {"detail": "This account is disabled. Contact your administrator."},
            status=status.HTTP_403_FORBIDDEN,
        )

    # ── Admin → 2FA OTP (sent async so response is fast) ──────────────────────
    if user.role == "ADMIN":
        otp = OTPToken.create_for_user(user, token_type="LOGIN", ip_address=ip)

        masked_email = f"{user.email[:3]}***{user.email[user.email.index('@'):]}"

        _send_email_async(
            subject="[SmartGuard] Your Admin Verification Code",
            body=(
                f"Hello {user.first_name or user.username},\n\n"
                f"Your SmartGuard admin verification code is:\n\n"
                f"  {otp.token}\n\n"
                f"Valid for {OTPToken.OTP_LIFETIME_MINUTES} minutes, single use.\n\n"
                f"If you did not attempt to log in, change your password immediately."
            ),
            to_list=[user.email],
        )

        _safe_log(
            action="OTP_SENT",
            message=f"2FA OTP sent to admin '{user.username}' ({masked_email}).",
            category="USER_ACTIVITY", level="INFO",
            source="Authentication",
            user=user, username=user.username,
            ip_address=ip, user_agent=ua,
        )

        return Response(
            {
                "requires_otp":   True,
                "otp_session_id": otp.id,
                "detail":         f"Verification code sent to {masked_email}.",
            },
            status=status.HTTP_200_OK,
        )

    # ── Non-admin → issue JWT ─────────────────────────────────────────────────
    was_new_ip = user.record_successful_login(ip_address=ip)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    _safe_log(
        action="LOGIN_SUCCESS",
        message=f"User '{user.username}' ({user.role}) signed in from {ip}.",
        category="USER_ACTIVITY", level="INFO",
        source="Authentication",
        user=user, username=user.username,
        ip_address=ip, user_agent=ua,
    )

    if was_new_ip:
        _safe_log(
            action="NEW_IP_LOGIN",
            message=f"'{user.username}' logged in from new IP: {ip}.",
            category="SECURITY", level="WARNING",
            source="Login Security",
            user=user, username=user.username,
            ip_address=ip, user_agent=ua,
        )

    refresh = RefreshToken.for_user(user)
    return Response(
        {"access": str(refresh.access_token), "refresh": str(refresh)},
        status=status.HTTP_200_OK,
    )


# ── Logout ─────────────────────────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([IsAuthenticated])
def logout_view(request):
    """
    POST /api/auth/logout/
    Body: { "refresh": "<refresh_token>" }
    Blacklists the refresh token so it cannot be reused.
    """
    refresh_token = request.data.get("refresh", "")
    if not refresh_token:
        return Response(
            {"detail": "Refresh token is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    try:
        token = RefreshToken(refresh_token)
        token.blacklist()
    except TokenError:
        pass  # token already expired or invalid — that's fine

    _safe_log(
        action="LOGOUT",
        message=f"User '{request.user.username}' signed out.",
        category="USER_ACTIVITY",
        level="INFO",
        source="Authentication",
        user=request.user,
        username=request.user.username,
        ip_address=get_client_ip(request),
        user_agent=request.META.get("HTTP_USER_AGENT", ""),
    )
    return Response({"detail": "Logged out successfully."}, status=status.HTTP_200_OK)


# ── OTP Verification (Admin 2FA) ───────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([AllowAny])
def verify_otp_view(request):
    """
    POST /api/auth/verify-otp/
    Body: { "otp_session_id": <int>, "otp_code": "123456" }
    Returns { access, refresh } on success.
    """
    session_id = request.data.get("otp_session_id")
    code       = str(request.data.get("otp_code", "")).strip()
    ip         = get_client_ip(request)
    ua         = request.META.get("HTTP_USER_AGENT", "")

    if not session_id or not code:
        return Response(
            {"detail": "otp_session_id and otp_code are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        otp = OTPToken.objects.select_related("user").get(
            pk=session_id, token_type="LOGIN"
        )
    except OTPToken.DoesNotExist:
        return Response(
            {"detail": "Invalid or expired verification session. Please log in again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = otp.user

    if not otp.is_valid():
        _safe_log(
            action="OTP_EXPIRED",
            message=f"OTP expired for admin '{user.username}' from {ip}.",
            category="SECURITY", level="WARNING",
            source="Authentication",
            user=user, username=user.username,
            ip_address=ip, user_agent=ua,
        )
        return Response(
            {"detail": "Verification code has expired. Please log in again."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if otp.token != code:
        _safe_log(
            action="OTP_FAILED",
            message=f"Wrong OTP entered for admin '{user.username}' from {ip}.",
            category="SECURITY", level="HIGH",
            source="Authentication",
            user=user, username=user.username,
            ip_address=ip, user_agent=ua,
        )
        return Response(
            {"detail": "Incorrect verification code. Please try again."},
            status=status.HTTP_401_UNAUTHORIZED,
        )

    # ── Success ────────────────────────────────────────────────────────────────
    otp.mark_used()
    was_new_ip = user.record_successful_login(ip_address=ip)
    user.last_login = timezone.now()
    user.save(update_fields=["last_login"])

    _safe_log(
        action="OTP_SUCCESS",
        message=f"Admin '{user.username}' completed 2FA from {ip}.",
        category="USER_ACTIVITY", level="INFO",
        source="Authentication",
        user=user, username=user.username,
        ip_address=ip, user_agent=ua,
    )

    if was_new_ip:
        _safe_log(
            action="NEW_IP_LOGIN",
            message=f"Admin '{user.username}' logged in from new IP: {ip}.",
            category="SECURITY", level="WARNING",
            source="Login Security",
            user=user, username=user.username,
            ip_address=ip, user_agent=ua,
        )

    refresh = RefreshToken.for_user(user)
    return Response(
        {"access": str(refresh.access_token), "refresh": str(refresh)},
        status=status.HTTP_200_OK,
    )


# ── Forgot Password (all roles) ────────────────────────────────────────────────

@api_view(["POST"])
@permission_classes([AllowAny])
def forgot_password_view(request):
    """
    POST /api/auth/forgot-password/
    Body: { "email": "user@example.com" }

    Sends a 6-digit OTP to the email if it exists.
    Always returns 200 to avoid email enumeration.
    """
    email = request.data.get("email", "").strip().lower()
    if not email:
        return Response(
            {"detail": "Email address is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        user = User.objects.get(email__iexact=email, is_active=True)
        otp  = OTPToken.create_for_user(user, token_type="RESET")

        _send_email_async(
            subject="[SmartGuard] Password Reset Code",
            body=(
                f"Hello {user.first_name or user.username},\n\n"
                f"Your password reset code for SmartGuard is:\n\n"
                f"  {otp.token}\n\n"
                f"Valid for {OTPToken.OTP_LIFETIME_MINUTES} minutes.\n\n"
                f"If you did not request this, ignore this email."
            ),
            to_list=[user.email],
        )

        _safe_log(
            action="OTP_SENT",
            message=f"Password reset OTP sent to '{user.username}' ({email}).",
            category="USER_ACTIVITY", level="INFO",
            source="Password Reset",
            user=user, username=user.username,
            ip_address=get_client_ip(request),
        )

        # Return the OTP session ID so the client can submit the code
        return Response(
            {
                "detail":         "Reset code sent if the email is registered.",
                "otp_session_id": otp.id,
            },
            status=status.HTTP_200_OK,
        )

    except User.DoesNotExist:
        # Return 200 regardless — never reveal whether the email exists
        return Response(
            {"detail": "Reset code sent if the email is registered."},
            status=status.HTTP_200_OK,
        )


@api_view(["POST"])
@permission_classes([AllowAny])
def reset_password_confirm_view(request):
    """
    POST /api/auth/reset-password-confirm/
    Body: { "otp_session_id": <int>, "otp_code": "123456",
            "new_password": "...", "confirm_password": "..." }
    """
    session_id    = request.data.get("otp_session_id")
    code          = str(request.data.get("otp_code", "")).strip()
    new_password  = request.data.get("new_password", "")
    confirm       = request.data.get("confirm_password", "")
    ip            = get_client_ip(request)

    if not all([session_id, code, new_password, confirm]):
        return Response(
            {"detail": "All fields are required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if new_password != confirm:
        return Response(
            {"detail": "Passwords do not match."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if len(new_password) < 8:
        return Response(
            {"detail": "Password must be at least 8 characters."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        otp = OTPToken.objects.select_related("user").get(
            pk=session_id, token_type="RESET"
        )
    except OTPToken.DoesNotExist:
        return Response(
            {"detail": "Invalid or expired reset session."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if not otp.is_valid():
        return Response(
            {"detail": "Reset code has expired. Please request a new one."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if otp.token != code:
        return Response(
            {"detail": "Incorrect reset code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = otp.user
    otp.mark_used()
    user.set_password(new_password)
    # If account was locked, unlock it on successful password reset
    if user.is_locked:
        user._clear_lockout(save=False)
    user.save()

    _safe_log(
        action="PASSWORD_CHANGED",
        message=f"'{user.username}' successfully reset their password from {ip}.",
        category="AUDIT", level="INFO",
        source="Password Reset",
        user=user, username=user.username,
        ip_address=ip,
    )

    return Response(
        {"detail": "Password reset successfully. You can now log in."},
        status=status.HTTP_200_OK,
    )


# ── Standard auth ─────────────────────────────────────────────────────────────

class RegisterView(generics.CreateAPIView):
    queryset           = User.objects.all()
    serializer_class   = RegisterSerializer
    permission_classes = [AllowAny]


class UserProfileView(generics.RetrieveAPIView):
    serializer_class   = UserSerializer
    permission_classes = [IsAuthenticated]

    def get_object(self):
        return self.request.user


# ── Admin: User Management ─────────────────────────────────────────────────────

class UsersListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminRole]

    def get_queryset(self):
        from django.db.models import Q
        qs = User.objects.all().order_by("id")
        search = self.request.query_params.get("search", "").strip()
        if search:
            qs = qs.filter(
                Q(username__icontains=search) | Q(email__icontains=search)
                | Q(first_name__icontains=search) | Q(last_name__icontains=search)
            )
        role = self.request.query_params.get("role", "").strip().upper()
        if role and role not in ("", "ALL"):
            qs = qs.filter(role=role)
        return qs

    def get_serializer_class(self):
        return AdminUserCreateSerializer if self.request.method == "POST" else AdminUserListSerializer

    def create(self, request, *args, **kwargs):
        serializer = AdminUserCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        _safe_log(
            action="USER_CREATED",
            message=f"Admin '{request.user.username}' created account '{user.username}' ({user.role}).",
            category="AUDIT", level="INFO",
            source="User Management",
            user=request.user, username=request.user.username,
            request=request,
            extra={"new_user_id": user.id, "new_username": user.username, "role": user.role},
        )
        return Response(AdminUserListSerializer(user).data, status=status.HTTP_201_CREATED)


class UserDetailView(generics.RetrieveUpdateDestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminRole]
    queryset           = User.objects.all()

    def get_serializer_class(self):
        if self.request.method in ("PATCH", "PUT"):
            return AdminUserUpdateSerializer
        return AdminUserListSerializer

    def update(self, request, *args, **kwargs):
        partial    = kwargs.pop("partial", False)
        instance   = self.get_object()
        serializer = AdminUserUpdateSerializer(instance, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()

        _safe_log(
            action="USER_UPDATED",
            message=f"Admin '{request.user.username}' updated account '{user.username}'.",
            category="AUDIT", level="INFO",
            source="User Management",
            user=request.user, username=request.user.username,
            request=request,
        )
        return Response(AdminUserListSerializer(user).data)

    def destroy(self, request, *args, **kwargs):
        """
        DELETE requires the Admin's own password to be supplied in the request body.
        Body: { "admin_password": "..." }
        """
        # ── Password confirmation ──────────────────────────────────────────────
        admin_password = request.data.get("admin_password", "")
        if not admin_password:
            return Response(
                {"detail": "Your account password is required to delete a user."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if not request.user.check_password(admin_password):
            _safe_log(
                action="SUSPICIOUS_ACCESS",
                message=(
                    f"Admin '{request.user.username}' supplied wrong password "
                    f"during user deletion attempt."
                ),
                category="SECURITY", level="HIGH",
                source="User Management",
                user=request.user, username=request.user.username,
                request=request,
            )
            return Response(
                {"detail": "Incorrect password. Deletion cancelled."},
                status=status.HTTP_403_FORBIDDEN,
            )

        user = self.get_object()
        if user.pk == request.user.pk:
            return Response(
                {"detail": "You cannot delete your own account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        uname = user.username
        user.delete()

        _safe_log(
            action="USER_DELETED",
            message=f"Admin '{request.user.username}' permanently deleted account '{uname}'.",
            category="AUDIT", level="WARNING",
            source="User Management",
            user=request.user, username=request.user.username,
            request=request,
            extra={"deleted_username": uname},
        )
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminRole])
def reset_user_password(request, pk):
    user = get_object_or_404(User, pk=pk)
    serializer = AdminPasswordResetSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    user.set_password(serializer.validated_data["password"])
    user.save(update_fields=["password"])
    if user.is_locked:
        user._clear_lockout()

    _safe_log(
        action="PASSWORD_RESET",
        message=f"Admin '{request.user.username}' reset password for '{user.username}'.",
        category="AUDIT", level="WARNING",
        source="User Management",
        user=request.user, username=request.user.username,
        request=request,
    )
    return Response(
        {"detail": f"Password for '{user.username}' has been reset successfully."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminRole])
def unlock_user_account(request, pk):
    user = get_object_or_404(User, pk=pk)
    if not user.is_locked and user.failed_login_attempts == 0:
        return Response(
            {"detail": f"User '{user.username}' is not currently locked."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user._clear_lockout()

    _safe_log(
        action="LOGIN_UNLOCKED",
        message=f"Admin '{request.user.username}' unlocked account '{user.username}'.",
        category="SECURITY", level="INFO",
        source="Access Control",
        user=request.user, username=request.user.username,
        request=request,
        extra={"unlocked_username": user.username},
    )
    return Response(
        {"detail": f"User '{user.username}' has been unlocked."},
        status=status.HTTP_200_OK,
    )


@api_view(["POST"])
@permission_classes([IsAuthenticated, IsAdminRole])
def toggle_user_active(request, pk):
    user = get_object_or_404(User, pk=pk)
    if user.pk == request.user.pk:
        return Response(
            {"detail": "You cannot deactivate your own account."},
            status=status.HTTP_400_BAD_REQUEST,
        )
    user.is_active = not user.is_active
    user.save(update_fields=["is_active"])
    state  = "activated" if user.is_active else "deactivated"
    action = "USER_ACTIVATED" if user.is_active else "USER_DEACTIVATED"

    _safe_log(
        action=action,
        message=f"Admin '{request.user.username}' {state} account '{user.username}'.",
        category="AUDIT", level="INFO",
        source="Access Control",
        user=request.user, username=request.user.username,
        request=request,
    )
    return Response(
        {"detail": f"User '{user.username}' has been {state}.", "is_active": user.is_active},
        status=status.HTTP_200_OK,
    )