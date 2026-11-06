"""
Configuración común de las pruebas de analytics.

`config.py` no se versiona (se genera en el Dockerfile o se copia desde
config.py.example), así que las pruebas inyectan un módulo `config` falso
y determinista ANTES de importar el resto del código. Nunca hay acceso a MySQL real.
"""
import sys
import types

import pytest

_fake = types.ModuleType("config")
_fake.PORT = 8000
_fake.DEBUG = False
_fake.DB_CONFIG = {"host": "localhost", "port": 3306, "database": "test", "user": "test", "password": "test"}
_fake.INTERNAL_API_KEY = "clave-interna-solo-para-pruebas-0123456789abcdef"
_fake.HISTORY_DAYS = 90
_fake.MOVING_AVG_WINDOW = 4
_fake.SAFETY_STOCK_PCT = 0.20
sys.modules["config"] = _fake


ORG_ID = 7
INTERNAL_KEY = _fake.INTERNAL_API_KEY


def gateway_headers(org=ORG_ID, key=INTERNAL_KEY):
    """Cabeceras que enviaría el gateway real."""
    return {"X-Internal-Key": key, "X-Organization-Id": str(org)}


@pytest.fixture
def client():
    from app import app
    app.config["TESTING"] = True
    return app.test_client()
