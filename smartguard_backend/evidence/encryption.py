# evidence/encryption.py
# ─────────────────────────────────────────────────────────────────────────────
# AES-256-GCM Encryption for Evidence Clips
#
# Provides at-rest encryption for video evidence clips.
# Each file gets a unique random IV (nonce) and produces an authentication tag
# that detects any tampering with the ciphertext.
#
# Key derivation:
#   EVIDENCE_ENCRYPTION_KEY env var (64-char hex)  →  raw 256-bit key
#   Fallback: Django SECRET_KEY  →  PBKDF2-HMAC-SHA256  →  256-bit key
# ─────────────────────────────────────────────────────────────────────────────

import hashlib
import logging
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from django.conf import settings

logger = logging.getLogger(__name__)

# AES-256-GCM nonce size (96 bits / 12 bytes is the recommended size)
_NONCE_SIZE = 12

# Salt for PBKDF2 fallback derivation (constant per installation)
_KDF_SALT = b"SmartGuard-Evidence-AES256-v1"
_KDF_ITERATIONS = 480_000  # OWASP 2023 recommendation for PBKDF2-HMAC-SHA256


def _derive_key() -> bytes:
    """
    Derive a 256-bit (32-byte) AES key.

    Priority:
      1. EVIDENCE_ENCRYPTION_KEY setting (64-char hex string → 32 bytes)
      2. Fallback: PBKDF2-HMAC-SHA256 from Django SECRET_KEY
    """
    explicit_key = getattr(settings, "EVIDENCE_ENCRYPTION_KEY", "")
    if explicit_key and len(explicit_key) >= 64:
        try:
            return bytes.fromhex(explicit_key[:64])
        except ValueError:
            logger.warning("EVIDENCE_ENCRYPTION_KEY is not valid hex — falling back to PBKDF2.")

    # Fallback: derive from SECRET_KEY
    secret = settings.SECRET_KEY.encode("utf-8")
    return hashlib.pbkdf2_hmac(
        "sha256", secret, _KDF_SALT, _KDF_ITERATIONS
    )


# Cache the key in-process (derived once per worker lifetime)
_cached_key: bytes | None = None


def _get_key() -> bytes:
    global _cached_key
    if _cached_key is None:
        _cached_key = _derive_key()
    return _cached_key


def encrypt_file(plaintext_path: str) -> tuple[str, str, str]:
    """
    Encrypt a file with AES-256-GCM.

    Args:
        plaintext_path: Path to the unencrypted file (e.g. clip.mp4)

    Returns:
        (encrypted_path, iv_hex, tag_hex)
        - encrypted_path: path to the .enc file (plaintext is deleted)
        - iv_hex: hex-encoded 12-byte nonce
        - tag_hex: hex-encoded 16-byte authentication tag

    The ciphertext file layout is:  nonce (12B) || ciphertext+tag
    We also return iv and tag separately so they can be stored in the DB
    for independent verification.
    """
    key = _get_key()
    aesgcm = AESGCM(key)

    # Generate a cryptographically random nonce
    nonce = os.urandom(_NONCE_SIZE)

    # Read plaintext
    with open(plaintext_path, "rb") as f:
        plaintext = f.read()

    # Encrypt (GCM appends a 16-byte auth tag to the ciphertext)
    ciphertext_with_tag = aesgcm.encrypt(nonce, plaintext, None)

    # The last 16 bytes of GCM output are the authentication tag
    tag = ciphertext_with_tag[-16:]
    ciphertext = ciphertext_with_tag[:-16]

    # Write encrypted file: nonce || ciphertext || tag
    encrypted_path = plaintext_path + ".enc"
    with open(encrypted_path, "wb") as f:
        f.write(nonce)
        f.write(ciphertext)
        f.write(tag)

    # Securely delete the plaintext file
    try:
        os.remove(plaintext_path)
        logger.debug("Plaintext deleted: %s", plaintext_path)
    except OSError as e:
        logger.warning("Failed to delete plaintext %s: %s", plaintext_path, e)

    iv_hex = nonce.hex()
    tag_hex = tag.hex()

    logger.info(
        "Encrypted evidence clip: %s → %s (IV=%s…, Tag=%s…)",
        os.path.basename(plaintext_path),
        os.path.basename(encrypted_path),
        iv_hex[:8],
        tag_hex[:8],
    )

    return encrypted_path, iv_hex, tag_hex


def decrypt_file(encrypted_path: str, iv_hex: str, tag_hex: str) -> bytes:
    """
    Decrypt an AES-256-GCM encrypted evidence file.

    Args:
        encrypted_path: Path to the .enc file
        iv_hex: Hex-encoded nonce stored in the DB
        tag_hex: Hex-encoded auth tag stored in the DB

    Returns:
        Decrypted file content as bytes.

    Raises:
        cryptography.exceptions.InvalidTag: if the file has been tampered with
        FileNotFoundError: if the encrypted file doesn't exist
    """
    key = _get_key()
    aesgcm = AESGCM(key)

    nonce = bytes.fromhex(iv_hex)
    expected_tag = bytes.fromhex(tag_hex)

    with open(encrypted_path, "rb") as f:
        file_data = f.read()

    # File layout: nonce (12B) || ciphertext || tag (16B)
    stored_nonce = file_data[:_NONCE_SIZE]
    stored_tag = file_data[-16:]
    ciphertext = file_data[_NONCE_SIZE:-16]

    # Verify nonce and tag match what we stored in DB
    if stored_nonce != nonce:
        raise ValueError("Nonce mismatch — file may have been tampered with.")
    if stored_tag != expected_tag:
        raise ValueError("Auth tag mismatch — file may have been tampered with.")

    # Reconstruct ciphertext+tag for GCM decryption
    ciphertext_with_tag = ciphertext + stored_tag

    plaintext = aesgcm.decrypt(nonce, ciphertext_with_tag, None)

    logger.debug("Decrypted evidence clip: %s (%d bytes)", encrypted_path, len(plaintext))
    return plaintext


def decrypt_file_to_path(encrypted_path: str, iv_hex: str, tag_hex: str,
                         output_path: str) -> str:
    """
    Decrypt an encrypted evidence file and write to a temporary output path.

    Args:
        encrypted_path: Path to the .enc file
        iv_hex: Hex-encoded nonce
        tag_hex: Hex-encoded auth tag
        output_path: Where to write the decrypted file

    Returns:
        output_path (for chaining)
    """
    plaintext = decrypt_file(encrypted_path, iv_hex, tag_hex)
    with open(output_path, "wb") as f:
        f.write(plaintext)
    return output_path
