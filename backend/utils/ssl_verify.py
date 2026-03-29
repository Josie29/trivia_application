"""
TLS certificate bundle resolution for HTTP clients (e.g. Streamlink).

Corporate proxies may re-sign HTTPS; Python may not trust that root without an
explicit PEM file (``SSL_CERT_FILE``) or a temporary insecure mode for local
debugging.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path

import certifi

logger = logging.getLogger(__name__)

_ENV_INSECURE = "TWITCH_STREAMLINK_INSECURE_SSL"
_ENV_STREAMLINK_VERIFY = "STREAMLINK_SSL_VERIFY"


def _env_disables_verify() -> bool:
    """Return True if env explicitly disables TLS verification for Streamlink."""
    if os.environ.get(_ENV_INSECURE, "").strip().lower() in ("1", "true", "yes"):
        return True
    raw = os.environ.get(_ENV_STREAMLINK_VERIFY, "").strip().lower()
    if not raw:
        return False
    return raw in ("0", "false", "no", "off")


def resolve_streamlink_ssl_verify() -> bool | str:
    """
    Return the value for Streamlink's ``http-ssl-verify`` option (requests ``verify=``).

    Disables verification when:
        - ``TWITCH_STREAMLINK_INSECURE_SSL`` is ``1`` / ``true`` / ``yes``, or
        - ``STREAMLINK_SSL_VERIFY`` is ``false`` / ``0`` / ``no`` / ``off``.

    Otherwise: ``SSL_CERT_FILE`` or ``REQUESTS_CA_BUNDLE`` if set to an existing
    file, else ``certifi.where()``.

    Returns:
        ``False`` to skip verification, or a filesystem path to a PEM CA bundle.

    Raises:
        FileNotFoundError: When ``SSL_CERT_FILE`` or ``REQUESTS_CA_BUNDLE`` is set
            but the path does not exist.
    """
    if _env_disables_verify():
        logger.warning(
            "TLS certificate verification is disabled for Streamlink (%s or %s). "
            "Do not use in production.",
            _ENV_INSECURE,
            _ENV_STREAMLINK_VERIFY,
        )
        return False

    for env_name in ("SSL_CERT_FILE", "REQUESTS_CA_BUNDLE"):
        raw = os.environ.get(env_name, "").strip()
        if not raw:
            continue
        path = Path(raw).expanduser()
        if not path.is_file():
            raise FileNotFoundError(
                f"{env_name} is set to {raw!r} but that file does not exist. "
                "Fix the path, or unset the variable to use certifi's public CA bundle."
            )
        return str(path.resolve())

    return certifi.where()
