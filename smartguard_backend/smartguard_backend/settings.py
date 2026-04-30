"""
Django settings for smartguard_backend project.
"""

import os
from pathlib import Path
from datetime import timedelta

# ── Twilio ─────────────────────────────────────────────────────────────────────
TWILIO_ACCOUNT_SID  = os.environ.get("TWILIO_ACCOUNT_SID",  "")
TWILIO_AUTH_TOKEN   = os.environ.get("TWILIO_AUTH_TOKEN",   "")
TWILIO_FROM_NUMBER  = os.environ.get("TWILIO_FROM_NUMBER",  "")

BASE_DIR = Path(__file__).resolve().parent.parent

# ── Core ───────────────────────────────────────────────────────────────────────
SECRET_KEY = 'django-insecure-^==a$(7@an64!0t!8y)-0tt))ibbz%^(nd34)38_7x4po8p*z%'
DEBUG      = True
ALLOWED_HOSTS = ["*"]

# ── Apps ───────────────────────────────────────────────────────────────────────
INSTALLED_APPS = [
    "daphne", 
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'rest_framework_simplejwt.token_blacklist',
    'corsheaders',
    'accounts',
    'cameras',
    'alerts.apps.AlertsConfig',
    'logging_info.apps.LoggingInfoConfig',
    'evidence.apps.EvidenceConfig',
    'config.apps.ConfigConfig',
    'ir',
    'django_extensions',
]
ASGI_APPLICATION = "smartguard_backend.asgi.application"
# at the bottom or near ASGI_APPLICATION
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [("127.0.0.1", 6379)],
            "capacity": 1500,           # max messages per channel before dropping
            "expiry": 10,               # seconds before unread messages expire
        },
    },
}


AUTH_USER_MODEL = 'accounts.CustomUser'

# ── Middleware ─────────────────────────────────────────────────────────────────
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]

ROOT_URLCONF = 'smartguard_backend.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': [],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'smartguard_backend.wsgi.application'

# ── Database ───────────────────────────────────────────────────────────────────
DATABASES = {
    'default': {
        'ENGINE':   'django.db.backends.postgresql',
        'NAME':     'smartguard_db',
        'USER':     'smartguard',
        'PASSWORD': 'smgh123!',
        'HOST':     'localhost',
        'PORT':     '5432',
    }
}

# ── BCrypt Password Hashing ────────────────────────────────────────────────────
# Install first: pip install django[bcrypt]
#
# Django uses the FIRST hasher for all NEW passwords.
# Existing PBKDF2 hashes are automatically re-hashed to BCrypt
# the next time each user logs in — no data migration needed.
PASSWORD_HASHERS = [
    'django.contrib.auth.hashers.BCryptSHA256PasswordHasher',  # ← primary (NEW)
    'django.contrib.auth.hashers.PBKDF2PasswordHasher',        # ← fallback for old hashes
    'django.contrib.auth.hashers.PBKDF2SHA1PasswordHasher',
]

# ── Password Validation ────────────────────────────────────────────────────────
AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]

# ── Internationalisation ───────────────────────────────────────────────────────
LANGUAGE_CODE = 'en-us'
TIME_ZONE     = 'UTC'
USE_I18N      = True
USE_TZ        = True

STATIC_URL = 'static/'

# ── DRF ───────────────────────────────────────────────────────────────────────
REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

# ── JWT ───────────────────────────────────────────────────────────────────────
SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME':        timedelta(minutes=30),
    'REFRESH_TOKEN_LIFETIME':       timedelta(days=1),
    'ROTATE_REFRESH_TOKENS':        True,
    'BLACKLIST_AFTER_ROTATION':     True,
    'ALGORITHM':                    'HS256',
    'AUTH_HEADER_TYPES':            ('Bearer',),
}

# ── CORS ──────────────────────────────────────────────────────────────────────
CORS_ALLOWED_ORIGINS = [
    'http://localhost:5173',
]

CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
]

# ── Login redirects (DRF browsable API) ───────────────────────────────────────
LOGIN_REDIRECT_URL = '/api/alerts/'
LOGIN_URL          = '/api-auth/login/'

# ── Email ─────────────────────────────────────────────────────────────────────
EMAIL_BACKEND       = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST          = 'smtp.gmail.com'
EMAIL_PORT          = 587
EMAIL_USE_TLS       = True
EMAIL_HOST_USER     = 'smartguardalerts01@gmail.com'
EMAIL_HOST_PASSWORD = 'ijzdntbwdfsbgzjf'
DEFAULT_FROM_EMAIL  = EMAIL_HOST_USER

# ── Dev debug prints (remove in production) ───────────────────────────────────
print(">>> USING SETTINGS FROM:", __file__)
print(">>> LOGIN_REDIRECT_URL =", LOGIN_REDIRECT_URL)
print(">>> LOGIN_URL =", LOGIN_URL)

# (timedelta already imported at top)

#CACHES = {
#    "default": {
#        "BACKEND": "django_redis.cache.RedisCache",
#        "LOCATION": "redis://127.0.0.1:6379/0",
#        "OPTIONS": {
#            "CLIENT_CLASS": "django_redis.client.DefaultClient",
#        }
#    }
#}

#LOGIN_LOCK_MAX_ATTEMPTS = 5
#LOGIN_LOCK_DURATION_SECONDS = 2 * 60  # 2 minutes, match your model constant

# ── Media files (snapshots, evidence clips) ────────────────────────────────────
MEDIA_ROOT = BASE_DIR / "media"
MEDIA_URL  = "/media/"