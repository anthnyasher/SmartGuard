import redis, os
from dotenv import load_dotenv
load_dotenv()
try:
    r = redis.Redis(host=os.environ.get('REDIS_HOST', '54.206.184.54'), port=6379, password=os.environ.get('REDIS_PASSWORD', None))
    print('Pinging Redis...')
    print(r.ping())
    val = r.get('frame:1')
    print(f'frame:1 exists: {val is not None}')
    if val:
        print(f'frame size: {len(val)} bytes')
except Exception as e:
    print('Failed:', e)
