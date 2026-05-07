# evidence/management/commands/cleanup_evidence.py
# ─────────────────────────────────────────────────────────────────────────────
# Django management command to clean up expired evidence clips.
#
# Usage:
#   python manage.py cleanup_evidence              # run cleanup
#   python manage.py cleanup_evidence --dry-run     # preview without deleting
#
# Schedule this via Windows Task Scheduler or cron to run every hour.
# ─────────────────────────────────────────────────────────────────────────────

from django.core.management.base import BaseCommand

from evidence.cleanup import cleanup_expired_clips


class Command(BaseCommand):
    help = (
        "Delete expired and false-positive evidence clips. "
        "PENDING clips older than EVIDENCE_RETENTION_HOURS are removed. "
        "FALSE_POSITIVE clips are removed immediately."
    )

    def add_arguments(self, parser):
        parser.add_argument(
            "--dry-run",
            action="store_true",
            default=False,
            help="Log what would be deleted without actually deleting anything.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN -- no files will be deleted.\n"))

        stats = cleanup_expired_clips(dry_run=dry_run)

        self.stdout.write("\n-- Evidence Cleanup Results --")
        self.stdout.write(f"  Expired clips deleted:        {stats['expired_deleted']}")
        self.stdout.write(f"  False-positive clips deleted:  {stats['false_positive_deleted']}")
        self.stdout.write(f"  Errors:                        {stats['errors']}")
        self.stdout.write(
            f"  Disk space freed:              "
            f"{stats['bytes_freed'] / (1024 * 1024):.1f} MB"
            if stats['bytes_freed'] else
            f"  Disk space freed:              0 MB"
        )

        if stats["errors"]:
            self.stdout.write(self.style.ERROR(f"\n{stats['errors']} error(s) occurred. Check logs."))
        else:
            self.stdout.write(self.style.SUCCESS("\nCleanup completed successfully."))
