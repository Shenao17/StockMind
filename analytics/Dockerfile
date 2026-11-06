FROM python:3.11-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    default-libmysqlclient-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Si config.py no existe, crearlo con valores por defecto para Docker
RUN test -f config.py || echo "\
import os\n\
from dotenv import load_dotenv\n\
load_dotenv()\n\
PORT = int(os.getenv('PORT', 8000))\n\
DEBUG = os.getenv('DEBUG', 'false').lower() == 'true'\n\
DB_CONFIG = {\n\
    'host':     os.getenv('DB_HOST', 'localhost'),\n\
    'port':     int(os.getenv('DB_PORT', 3306)),\n\
    'database': os.getenv('DB_NAME', 'stockmind_db'),\n\
    'user':     os.getenv('DB_USER', 'root'),\n\
    'password': os.getenv('DB_PASSWORD', ''),\n\
}\n\
INTERNAL_API_KEY = os.getenv('INTERNAL_API_KEY', '')\n\
HISTORY_DAYS = int(os.getenv('HISTORY_DAYS', 90))\n\
MOVING_AVG_WINDOW = int(os.getenv('MOVING_AVG_WINDOW', 4))\n\
SAFETY_STOCK_PCT = float(os.getenv('SAFETY_STOCK_PCT', 0.20))\n\
" > config.py

EXPOSE 8000
CMD ["python", "app.py"]