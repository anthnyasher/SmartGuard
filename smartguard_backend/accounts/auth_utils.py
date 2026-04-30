# smartguard_backend/accounts/auth_utils.py
from django.conf import settings
from django.core.cache import cache

def _user_key(username: str) -> str:
    return username.lower().strip()

def is_redis_locked(username: str) -> bool:
    key = f"login_lock:{_user_key(username)}"
    return cache.get(key) is not None

def register_redis_failed_attempt(username: str) -> int:
    base = _user_key(username)
    key_attempts = f"login_attempts:{base}"
    key_lock     = f"login_lock:{base}"

    attempts = cache.get(key_attempts, 0) + 1
    cache.set(key_attempts, attempts, timeout=settings.LOGIN_LOCK_DURATION_SECONDS)

    if attempts >= settings.LOGIN_LOCK_MAX_ATTEMPTS:
        cache.set(key_lock, "1", timeout=settings.LOGIN_LOCK_DURATION_SECONDS)

    return attempts

def clear_redis_login_counters(username: str) -> None:
    base = _user_key(username)
    cache.delete_many([
        f"login_attempts:{base}",
        f"login_lock:{base}",
    ])
    