from rest_framework.permissions import BasePermission, SAFE_METHODS


class AlertPermission(BasePermission):
    """
    Admin and Operations Manager:
      - Read + write all alerts.
    Staff:
      - Read all shoplifting alerts.
      - PATCH only for acknowledgement/notes (serializer enforces field limits).
    """

    def has_permission(self, request, view):
        user = request.user

        if not user or not user.is_authenticated:
            return False

        # Everyone logged-in can read
        if request.method in SAFE_METHODS:
            return True

        # Staff can PATCH (acknowledge) but not POST/DELETE
        if user.role == "STAFF":
            return request.method == "PATCH"

        # Admin and Ops Manager: full write
        return user.role in ["ADMIN", "OPERATIONS_MANAGER"]