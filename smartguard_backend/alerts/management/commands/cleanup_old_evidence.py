import os
import logging
from datetime import timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from alerts.models import Alert

log = logging.getLogger(__name__)

class Command(BaseCommand):
    help = 'Deletes old alerts and their evidence (snapshots/clips) older than a specified number of days.'

    def add_arguments(self, parser):
        parser.add_argument('--days', type=int, default=30, help='Number of days to keep evidence')
        parser.add_argument('--dry-run', action='store_true', help='Do not actually delete anything')

    def handle(self, *args, **options):
        days = options['days']
        dry_run = options['dry_run']
        
        cutoff_date = timezone.now() - timedelta(days=days)
        old_alerts = Alert.objects.filter(created_at__lt=cutoff_date)
        
        count = old_alerts.count()
        if count == 0:
            self.stdout.write(self.style.SUCCESS(f'No alerts older than {days} days found.'))
            return

        self.stdout.write(f'Found {count} alerts older than {days} days.')

        deleted_count = 0
        for alert in old_alerts:
            # Delete snapshot file if it exists
            if alert.snapshot and alert.snapshot.name:
                try:
                    if not dry_run and os.path.isfile(alert.snapshot.path):
                        os.remove(alert.snapshot.path)
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Could not delete snapshot for alert {alert.id}: {e}'))
            
            # Delete clip file if it exists
            if hasattr(alert, 'clip') and alert.clip and alert.clip.name:
                try:
                    if not dry_run and os.path.isfile(alert.clip.path):
                        os.remove(alert.clip.path)
                except Exception as e:
                    self.stdout.write(self.style.WARNING(f'Could not delete clip for alert {alert.id}: {e}'))
                    
            if not dry_run:
                alert.delete()
            deleted_count += 1
            
        if dry_run:
            self.stdout.write(self.style.SUCCESS(f'[DRY RUN] Would have deleted {deleted_count} old alerts and their media files.'))
        else:
            self.stdout.write(self.style.SUCCESS(f'Successfully deleted {deleted_count} old alerts and their media files.'))
