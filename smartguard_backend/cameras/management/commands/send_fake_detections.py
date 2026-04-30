from django.core.management.base import BaseCommand
import time
from cameras.publisher import publish_fake_detection

class Command(BaseCommand):
    help = "Continuously send fake detection data to a camera WebSocket group."

    def add_arguments(self, parser):
        parser.add_argument("--camera-id", type=int, default=4)

    def handle(self, *args, **options):
        camera_id = options["camera_id"]
        self.stdout.write(self.style.SUCCESS(f"Sending fake detections to camera_{camera_id}..."))

        try:
            while True:
                publish_fake_detection(camera_id=camera_id)
                time.sleep(0.5)
        except KeyboardInterrupt:
            self.stdout.write(self.style.WARNING("Stopped."))
