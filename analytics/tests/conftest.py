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
_fake.HISTORY_DAYS = 90
_fake.MOVING_AVG_WINDOW = 4
_fake.SAFETY_STOCK_PCT = 0.20
sys.modules["config"] = _fake


@pytest.fixture
def client():
    from app import app
    app.config["TESTING"] = True
    return app.test_client()
