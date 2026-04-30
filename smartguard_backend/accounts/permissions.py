# accounts/permissions.py

from rest_framework.permissions import BasePermission


class IsAdminRole(BasePermission):
    """
    Grants access only to authenticated users with role='ADMIN'.
    Used to protect user management endpoints from OPS_MANAGER and STAFF.
    """

    message = "Only Administrators can access user management."

    def has_permission(self, request, view):
        return (
            request.user is not None
            and request.user.is_authenticated
            and getattr(request.user, "role", None) == "ADMIN"
        )