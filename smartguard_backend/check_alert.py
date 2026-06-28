"""Test script: publish a manual override and check if snapshot was created."""
import os, django, time, json, redis
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'smartguard_backend.settings')
django.setup()
from dotenv import load_dotenv
load_dotenv()

from alerts.models import Alert

# Get the current highest alert ID
before = Alert.objects.order_by('-id').first()
before_id = before.id if before else 0
print(f"Latest alert before test: id={before_id}")

# Publish a manual override for Camera 1 (which uses local webcam, should always have frames)
r = redis.Redis(
    host='127.0.0.1',
    port=int(os.environ.get('CLOUD_REDIS_PORT', 6379)),
    password=os.environ.get('REDIS_PASSWORD')
)
msg = {'camera_id': 1, 'behavior_type': 'Test - Debug', 'notes': 'debug test', 'user': 'debug@test.com'}
subs = r.publish('manual_override', json.dumps(msg))
print(f"Published to {subs} subscribers")

# Wait for alert to be created
print("Waiting 3 seconds for detection worker to process...")
time.sleep(3)

# Check new alert
after = Alert.objects.filter(id__gt=before_id).order_by('-id').first()
if after:
    snap = after.snapshot.name if after.snapshot else "NONE"
    print(f"New alert created: id={after.id}, camera={after.camera_id}, snapshot='{snap}'")
    if after.snapshot:
        local_path = after.snapshot.path
        exists = os.path.exists(local_path)
        print(f"Snapshot local path: {local_path}")
        print(f"File exists locally: {exists}")
        if exists:
            print(f"File size: {os.path.getsize(local_path)} bytes")
    else:
        print("NO SNAPSHOT - frame_bgr was likely None (no frames in buffer for this camera)")
else:
    print("NO NEW ALERT CREATED - detection worker didn't process the message")
