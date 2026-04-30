# accounts/serializers.py

import re
from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()


# ── Phone number validator ─────────────────────────────────────────────────────
_E164_RE = re.compile(r'^\+\d{7,15}$')

def validate_e164(value: str) -> str:
    """
    Accepts:
      - empty string / None  → allowed (phone is optional)
      - +63XXXXXXXXXX        → Philippine mobile (E.164)
      - +[country][number]   → any valid E.164
    Strips spaces/dashes for user convenience.
    """
    if not value:
        return value
    cleaned = value.strip().replace(' ', '').replace('-', '')
    if not _E164_RE.match(cleaned):
        raise serializers.ValidationError(
            "Enter a valid international phone number starting with + "
            "(e.g. +639171234567)."
        )
    return cleaned


# ── Existing serializers (kept unchanged except phone_number added) ────────────

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model  = User
        fields = [
            "id", "username", "email", "first_name", "last_name",
            "role", "is_locked", "phone_number",
        ]
        read_only_fields = ["id", "is_locked"]


class RegisterSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True)

    class Meta:
        model  = User
        fields = [
            "username", "email", "first_name", "last_name",
            "password", "role", "phone_number",
        ]

    def validate_phone_number(self, value):
        return validate_e164(value)

    def create(self, validated_data):
        user = User.objects.create_user(
            username=validated_data["username"],
            email=validated_data["email"],
            first_name=validated_data.get("first_name", ""),
            last_name=validated_data.get("last_name", ""),
            password=validated_data["password"],
        )
        user.role         = validated_data.get("role", "STAFF")
        user.phone_number = validated_data.get("phone_number", "")
        user.save()
        return user


# ── Admin user management serializers ─────────────────────────────────────────

class AdminUserListSerializer(serializers.ModelSerializer):
    """
    Full read-only view of a user for the admin panel table.
    Includes display_name, login history, lockout state, and phone_number.
    """
    display_name  = serializers.SerializerMethodField()
    failed_logins = serializers.IntegerField(
        source="failed_login_attempts", read_only=True
    )

    class Meta:
        model  = User
        fields = [
            "id",
            "username",
            "email",
            "first_name",
            "last_name",
            "display_name",
            "role",
            "is_active",
            "is_locked",
            "failed_logins",
            "last_login",
            "date_joined",
            "phone_number",        # ← NEW
        ]
        read_only_fields = fields  # list serializer is read-only

    def get_display_name(self, obj):
        name = f"{obj.first_name} {obj.last_name}".strip()
        return name if name else obj.username


class AdminUserCreateSerializer(serializers.ModelSerializer):
    """
    Validates and creates a new user from the Admin panel.
    Password is required. Phone number is optional (used for SMS alerts).
    """
    password = serializers.CharField(write_only=True, min_length=8)

    class Meta:
        model  = User
        fields = [
            "username",
            "email",
            "first_name",
            "last_name",
            "password",
            "role",
            "is_active",
            "phone_number",        # ← NEW
        ]

    def validate_username(self, value):
        if User.objects.filter(username__iexact=value).exists():
            raise serializers.ValidationError(
                "A user with this username already exists."
            )
        return value

    def validate_email(self, value):
        if value and User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError(
                "A user with this email address already exists."
            )
        return value

    def validate_password(self, value):
        if len(value) < 8:
            raise serializers.ValidationError(
                "Password must be at least 8 characters."
            )
        if not re.search(r'[A-Z]', value):
            raise serializers.ValidationError(
                "Password must contain at least one uppercase letter."
            )
        if not re.search(r'\d', value):
            raise serializers.ValidationError(
                "Password must contain at least one number."
            )
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', value):
            raise serializers.ValidationError(
                "Password must contain at least one special character."
            )
        return value

    def validate_phone_number(self, value):
        return validate_e164(value)

    def create(self, validated_data):
        password     = validated_data.pop("password")
        phone_number = validated_data.pop("phone_number", "")
        user         = User(**validated_data)
        user.set_password(password)
        user.phone_number = phone_number
        user.save()
        return user


class AdminUserUpdateSerializer(serializers.ModelSerializer):
    """
    Partial update of a user from the Admin panel.
    Does NOT expose password — use the reset-password endpoint instead.
    Username and email uniqueness checks exclude the user being edited.
    Includes phone_number for SMS routing.
    """

    class Meta:
        model  = User
        fields = [
            "username",
            "email",
            "first_name",
            "last_name",
            "role",
            "is_active",
            "phone_number",        # ← NEW
        ]

    def validate_username(self, value):
        user = self.instance
        if (
            User.objects.filter(username__iexact=value)
            .exclude(pk=user.pk)
            .exists()
        ):
            raise serializers.ValidationError(
                "A user with this username already exists."
            )
        return value

    def validate_email(self, value):
        user = self.instance
        if (
            value
            and User.objects.filter(email__iexact=value)
            .exclude(pk=user.pk)
            .exists()
        ):
            raise serializers.ValidationError(
                "A user with this email address already exists."
            )
        return value

    def validate_phone_number(self, value):
        return validate_e164(value)


class AdminPasswordResetSerializer(serializers.Serializer):
    """
    Admin-initiated password reset. No old-password check required.
    """
    password         = serializers.CharField(write_only=True, min_length=8)
    confirm_password = serializers.CharField(write_only=True, min_length=8)

    def validate(self, attrs):
        if attrs["password"] != attrs["confirm_password"]:
            raise serializers.ValidationError(
                {"confirm_password": "Passwords do not match."}
            )
        return attrs