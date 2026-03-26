"""
StockMind Analytics — Rutas de Predicción (Blueprint Flask)
============================================================
Define los endpoints REST del microservicio de analítica.

GET /predict/<product_id>   → Predicción de demanda para un producto
GET /recommend              → Recomendaciones para todos los productos
"""

from flask import Blueprint, jsonify, request
from src.services.prediction_service import (
    get_prediction_for_product,
    get_all_recommendations
)
from src.services.database_service import get_all_active_products

predictions_bp = Blueprint("predictions", __name__)


@predictions_bp.route("/predict/<int:product_id>", methods=["GET"])
def predict(product_id: int):
    """
    Genera y retorna la predicción de demanda para el producto indicado.

    Parámetros de query opcionales:
        stockCurrent  (int) — sobreescribe el valor de BD para simulación
        stockMinimum  (int) — sobreescribe el valor de BD para simulación

    Response 200:
    {
        "productId": 1,
        "weeklyForecast": 12.5,
        "monthlyForecast": 54.1,
        "confidence": 0.81,
        "modelUsed": "linear_regression",
        "recommendation": 30,
        "weeksOfHistory": 8,
        "dataPoints": 56,
        "averageDailySales": 1.78,
        "generatedAt": "2024-03-15T10:22:00",
        "periodWeek": "2024-W11",
        "periodMonth": "2024-03"
    }
    """
    # Obtener stock actual del producto desde BD (si no se pasan como query params)
    products = get_all_active_products()
    product_data = next((p for p in products if p["id"] == product_id), None)

    if not product_data:
        return jsonify({
            "error": f"Producto con ID {product_id} no encontrado o inactivo",
            "code": "PRODUCT_NOT_FOUND"
        }), 404

    # Permitir sobreescribir stock para simulaciones
    stock_current = int(request.args.get("stockCurrent", product_data["stock_current"]))
    stock_minimum = int(request.args.get("stockMinimum", product_data["stock_minimum"]))

    try:
        result = get_prediction_for_product(product_id, stock_current, stock_minimum)

        # Enriquecer con datos del producto
        result["productName"] = product_data["name"]
        result["sku"]         = product_data["sku"]
        result["category"]    = product_data["category_name"]
        result["stockCurrent"] = stock_current
        result["stockMinimum"] = stock_minimum
        result["isCritical"]   = stock_current <= stock_minimum

        return jsonify(result), 200

    except Exception as e:
        print(f"[PredictionsRoute] Error generando predicción para producto {product_id}: {e}")
        return jsonify({
            "error": "Error al generar la predicción",
            "detail": str(e),
            "code": "PREDICTION_ERROR"
        }), 500


@predictions_bp.route("/recommend", methods=["GET"])
def recommend():
    """
    Genera recomendaciones de reabastecimiento para todos los productos activos.
    Prioriza productos en stock crítico y con mayor demanda proyectada.

    Response 200:
    [
        {
            "productId": 5,
            "productName": "Agua Cristal 600ml",
            "stockCurrent": 10,
            "stockMinimum": 30,
            "isCritical": true,
            "weeklyForecast": 25.0,
            "monthlyForecast": 108.25,
            "recommendation": 120,
            "modelUsed": "weighted_moving_avg",
            "confidence": null
        },
        ...
    ]
    """
    try:
        recommendations = get_all_recommendations()
        return jsonify({
            "total": len(recommendations),
            "critical": sum(1 for r in recommendations if r["isCritical"]),
            "recommendations": recommendations
        }), 200

    except Exception as e:
        print(f"[PredictionsRoute] Error generando recomendaciones: {e}")
        return jsonify({
            "error": "Error al generar recomendaciones",
            "detail": str(e),
            "code": "RECOMMENDATION_ERROR"
        }), 500
