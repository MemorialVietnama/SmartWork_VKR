from __future__ import annotations

import json
import logging
import os
import sys
from datetime import datetime, timezone
from logging.config import dictConfig
from typing import Any


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)
        for key in ("request_id", "method", "path", "status_code", "duration_ms", "client_ip"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, ensure_ascii=False)


def configure_logging() -> None:
    level = os.getenv("LOG_LEVEL", "INFO").upper()
    dictConfig(
        {
            "version": 1,
            "disable_existing_loggers": False,
            "formatters": {
                "json": {
                    "()": "app.core.logging.JsonFormatter",
                },
            },
            "handlers": {
                "default": {
                    "class": "logging.StreamHandler",
                    "stream": sys.stdout,
                    "formatter": "json",
                },
            },
            "loggers": {
                "": {"handlers": ["default"], "level": level},
                "uvicorn": {"handlers": ["default"], "level": level, "propagate": False},
                "uvicorn.error": {"handlers": ["default"], "level": level, "propagate": False},
                "uvicorn.access": {"handlers": ["default"], "level": level, "propagate": False},
                "sqlalchemy.engine": {"handlers": ["default"], "level": "WARNING", "propagate": False},
            },
        },
    )
