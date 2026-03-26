"""
StockMind Analytics — Configuración del microservicio Python
Carga variables de entorno con valores por defecto para desarrollo.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# Servidor Flask
PORT = int(os.getenv("PORT", 8000))
DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# Base de datos MySQL (misma instancia que el backend Java)
DB_CONFIG = {
    "host":     "localhost",
    "port":     3306,
    "database": "stockmind_db",
    "user":     "root",
    "password": "",
}
# Parámetros del modelo predictivo
# Número de períodos históricos a considerar (días de historial)
HISTORY_DAYS = int(os.getenv("HISTORY_DAYS", 90))

# Ventana para media móvil ponderada (semanas)
MOVING_AVG_WINDOW = int(os.getenv("MOVING_AVG_WINDOW", 4))

# Stock de seguridad adicional en la recomendación (porcentaje)
SAFETY_STOCK_PCT = float(os.getenv("SAFETY_STOCK_PCT", 0.20))
