from rest_framework.permissions import BasePermission, SAFE_METHODS

class IsAdminOrOpsReadOnly(BasePermission):
    """
    Admin: full access.
    Ops Manager: read-only.
    Staff: no access.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated:
            return False

        # Admin can do anything
        if user.role == 'ADMIN':
            return True

        # Ops Manager can only read (GET, HEAD, OPTIONS)
        if user.role == 'OPS_MANAGER' and request.method in SAFE_METHODS:
            return True

        # Staff: no access to camera API
        return False
