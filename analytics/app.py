"""
StockMind — Microservicio de Analítica Predictiva
==================================================
Servidor Flask que expone endpoints REST para predicción de demanda
y recomendaciones de reabastecimiento.

Este servicio consulta directamente la base de datos MySQL para obtener
el historial de ventas y aplica modelos estadísticos para generar
estimaciones de demanda futura por producto.

Endpoints:
    GET  /health            → Estado del microservicio
    GET  /predict/<id>      → Predicción para un producto específico
    GET  /recommend         → Recomendaciones de reabastecimiento para todos

Puerto: 8000 (configurable en config.py)
"""

from flask import Flask, jsonify
from flask_cors import CORS

from config import PORT, DEBUG
from src.routes.predictions import predictions_bp

# ─────────────────────────────────────────────
# Inicialización de la aplicación Flask
# ─────────────────────────────────────────────
app = Flask(__name__)

# CORS: permite peticiones desde el gateway Node.js en desarrollo
CORS(app, origins=["http://localhost:3000", "http://localhost:5500"])

# Registro del blueprint de predicciones
app.register_blueprint(predictions_bp)


# ─────────────────────────────────────────────
# Health check
# ─────────────────────────────────────────────
@app.route("/health", methods=["GET"])
def health():
    """
    Verifica que el microservicio esté activo y pueda conectarse a MySQL.
    Utilizado por el gateway Node.js para confirmar disponibilidad.
    """
    from src.services.database_service import test_connection
    db_ok = test_connection()

    return jsonify({
        "status":  "OK" if db_ok else "DEGRADED",
        "service": "StockMind Analytics Microservice",
        "version": "1.0.0",
        "database": "connected" if db_ok else "unreachable"
    }), 200 if db_ok else 503


# ─────────────────────────────────────────────
# Manejador de errores globales
# ─────────────────────────────────────────────
@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Endpoint no encontrado", "code": "NOT_FOUND"}), 404


@app.errorhandler(500)
def internal_error(e):
    return jsonify({"error": "Error interno del microservicio", "code": "INTERNAL_ERROR"}), 500


# ─────────────────────────────────────────────
# Punto de entrada
# ─────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 55)
    print("  StockMind Analytics Microservice")
    print(f"  Puerto: {PORT}")
    print(f"  Modo debug: {DEBUG}")
    print("=" * 55)
    app.run(host="0.0.0.0", port=PORT, debug=DEBUG)
