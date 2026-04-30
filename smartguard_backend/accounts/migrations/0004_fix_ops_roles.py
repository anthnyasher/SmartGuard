# accounts/migrations/0004_fix_ops_role.py
# ─────────────────────────────────────────────────────────────────────────────
# Fixes accounts that were created via the Django shell using role="OPS"
# instead of the correct value role="OPS_MANAGER".
#
# Run: python manage.py migrate accounts
# ─────────────────────────────────────────────────────────────────────────────

from django.db import migrations


def fix_ops_role(apps, schema_editor):
    """Rename role value 'OPS' → 'OPS_MANAGER' for all affected accounts."""
    CustomUser = apps.get_model('accounts', 'CustomUser')
    updated = CustomUser.objects.filter(role='OPS').update(role='OPS_MANAGER')
    if updated:
        print(f"\n  ✓ Fixed {updated} user account(s): role 'OPS' → 'OPS_MANAGER'")


def reverse_fix(apps, schema_editor):
    """Revert OPS_MANAGER back to OPS (only used during migrate --fake rollback)."""
    CustomUser = apps.get_model('accounts', 'CustomUser')
    CustomUser.objects.filter(role='OPS_MANAGER').update(role='OPS')


class Migration(migrations.Migration):

    dependencies = [
        # Depends on the OTPToken migration; adjust if your chain differs
        ('accounts', '0003_otptoken_last_login_ip'),
    ]

    operations = [
        migrations.RunPython(fix_ops_role, reverse_fix),
    ]