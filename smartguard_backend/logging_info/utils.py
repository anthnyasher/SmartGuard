# logging_info/utils.py
# ─────────────────────────────────────────────────────────────────────────────
# Utility functions for audit logging.
#
#   parse_device_info(ua_string)  — returns "Chrome on Windows 10 (Desktop)"
#   get_client_ip(request)        — extracts real IP respecting X-Forwarded-For
#   log_audit(...)                — fire-and-forget audit log creation
# ─────────────────────────────────────────────────────────────────────────────

import logging

logger = logging.getLogger(__name__)


# ── Device / browser parsing ─────────────────────────────────────────────────
# Pure-Python, no external dependency required.

def parse_device_info(ua_string: str) -> str:
    """
    Returns a compact human-readable device description from a raw User-Agent
    string.  No third-party library required.

    Examples:
        "Chrome on Windows 10 (Desktop)"
        "Firefox on macOS (Desktop)"
        "Safari on iOS (Mobile)"
        "Unknown Browser on Android (Mobile)"
    """
    ua = ua_string or ""

    # ── Browser ───────────────────────────────────────────────────────────────
    if "OPR/" in ua or "Opera/" in ua:
        browser = "Opera"
    elif "Edg/" in ua or "Edge/" in ua:
        browser = "Edge"
    elif "Chrome/" in ua and "Chromium" not in ua:
        browser = "Chrome"
    elif "Firefox/" in ua:
        browser = "Firefox"
    elif "Safari/" in ua and "Chrome" not in ua:
        browser = "Safari"
    elif "MSIE" in ua or "Trident/" in ua:
        browser = "Internet Explorer"
    elif "curl" in ua.lower():
        browser = "cURL"
    elif "python" in ua.lower():
        browser = "Python HTTP"
    else:
        browser = "Unknown Browser"

    # ── Operating system ──────────────────────────────────────────────────────
    if "Windows NT 10.0" in ua:
        os_label = "Windows 10/11"
    elif "Windows NT 6.3" in ua:
        os_label = "Windows 8.1"
    elif "Windows NT 6.1" in ua:
        os_label = "Windows 7"
    elif "Windows" in ua:
        os_label = "Windows"
    elif "iPad" in ua:
        os_label = "iPadOS"
    elif "iPhone" in ua:
        os_label = "iOS"
    elif "Mac OS X" in ua:
        os_label = "macOS"
    elif "Android" in ua:
        # Try to extract Android version
        import re
        m = re.search(r"Android\s([\d.]+)", ua)
        os_label = f"Android {m.group(1)}" if m else "Android"
    elif "Linux" in ua:
        os_label = "Linux"
    elif "CrOS" in ua:
        os_label = "ChromeOS"
    else:
        os_label = "Unknown OS"

    # ── Form factor ───────────────────────────────────────────────────────────
    mobile_keywords = ("Mobile", "Android", "iPhone", "iPad", "iPod", "BlackBerry", "IEMobile")
    device_type = "Mobile" if any(k in ua for k in mobile_keywords) else "Desktop"

    return f"{browser} on {os_label} ({device_type})"


def get_client_ip(request) -> str | None:
    """
    Extracts the real client IP, respecting X-Forwarded-For from Nginx/proxies.
    Returns None if no IP can be determined.
    """
    xff = request.META.get("HTTP_X_FORWARDED_FOR")
    if xff:
        # X-Forwarded-For: client, proxy1, proxy2  →  take first (real client)
        return xff.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR") or None


# ── Main audit log helper ────────────────────────────────────────────────────

def log_audit(
    *,
    action: str,
    message: str,
    category: str           = "USER_ACTIVITY",
    level: str              = "INFO",
    source: str             = "",
    user                    = None,
    username: str           = "",
    ip_address: str | None  = None,
    user_agent: str         = "",
    extra: dict | None      = None,
    request                 = None,       # convenience — extracts ip + ua automatically
) -> None:
    """
    Fire-and-forget helper to create an AuditLog entry.

    Call from any view, signal, or background task.
    If 'request' is provided, ip_address and user_agent are extracted automatically
    (they still override individually if passed explicitly).

    Usage:
        log_audit(
            action="LOGIN_SUCCESS",
            message="User admin@fairprice.com signed in successfully.",
            category="USER_ACTIVITY",
            level="INFO",
            source="Authentication",
            user=user_obj,
            request=request,
        )
    """
    from .models import AuditLog

    # Auto-extract from request if supplied
    if request is not None:
        if not ip_address:
            ip_address = get_client_ip(request)
        if not user_agent:
            user_agent = request.META.get("HTTP_USER_AGENT", "")
        if user is None and hasattr(request, "user") and request.user.is_authenticated:
            user = request.user

    # Username snapshot
    resolved_username = username or (getattr(user, "username", "") if user else "")

    # Device info parsed once here
    device_info = parse_device_info(user_agent) if user_agent else ""

    try:
        AuditLog.objects.create(
            user        = user,
            username    = resolved_username,
            ip_address  = ip_address,
            user_agent  = user_agent,
            device_info = device_info,
            category    = category,
            level       = level,
            action      = action,
            message     = message,
            source      = source,
            extra       = extra or {},
        )
    except Exception as exc:
        # Never let logging failure crash the main request
        logger.error("AuditLog write failed: %s", exc, exc_info=True)