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


class IsAdminOrOpsManager(BasePermission):
    """
    Grants access to users with role='ADMIN' or role='OPS_MANAGER'.
    Used for evidence clip review and other operational endpoints.
    """

    message = "Only Administrators and Operations Managers can perform this action."

    def has_permission(self, request, view):
        return (
            request.user is not None
            and request.user.is_authenticated
            and getattr(request.user, "role", None) in ("ADMIN", "OPS_MANAGER")
        )