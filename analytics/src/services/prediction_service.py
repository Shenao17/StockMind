"""
StockMind Analytics — Servicio de Predicción
=============================================
Orquesta la obtención de datos históricos, la ejecución del modelo
predictivo y la persistencia de resultados.
"""

from datetime import datetime
from src.services.database_service import (
    get_sales_history,
    get_all_active_products,
    save_prediction
)
from src.models.demand_model import predict_demand
from config import HISTORY_DAYS


def get_prediction_for_product(product_id: int, stock_current: int = 0,
                                stock_minimum: int = 5) -> dict:
    """
    Genera la predicción de demanda completa para un producto.

    Flujo:
    1. Obtiene historial de ventas de MySQL (últimos HISTORY_DAYS días)
    2. Ejecuta el modelo predictivo
    3. Persiste el resultado en demand_predictions
    4. Retorna el resultado enriquecido

    Args:
        product_id:    ID del producto en la base de datos
        stock_current: Stock actual del producto
        stock_minimum: Stock mínimo configurado

    Returns:
        dict con predicción completa lista para serializar como JSON
    """
    # 1. Historial de ventas
    history_df = get_sales_history(product_id, HISTORY_DAYS)

    # 2. Generar predicción
    result = predict_demand(history_df, stock_current, stock_minimum)

    # 3. Determinar etiqueta del período (semana actual en formato ISO)
    now = datetime.now()
    week_label  = now.strftime("%Y-W%V")  # Ej: "2024-W03"
    month_label = now.strftime("%Y-%m")   # Ej: "2024-03"

    # 4. Persistir predicción semanal
    save_prediction(
        product_id  = product_id,
        period_type = "WEEKLY",
        period_label = week_label,
        predicted_qty = result["weeklyForecast"],
        confidence    = result["confidence"] or 0.0,
        model_used    = result["modelUsed"],
        recommendation = result["recommendation"]
    )

    # 5. Persistir predicción mensual
    save_prediction(
        product_id  = product_id,
        period_type = "MONTHLY",
        period_label = month_label,
        predicted_qty = result["monthlyForecast"],
        confidence    = result["confidence"] or 0.0,
        model_used    = result["modelUsed"],
        recommendation = result["recommendation"]
    )

    # 6. Enriquecer resultado con metadatos
    result["productId"]   = product_id
    result["generatedAt"] = now.isoformat()
    result["periodWeek"]  = week_label
    result["periodMonth"] = month_label

    return result


def get_all_recommendations() -> list:
    """
    Genera recomendaciones de reabastecimiento para todos los productos activos.

    Para cada producto:
    - Obtiene historial de ventas
    - Ejecuta predicción
    - Incluye en la lista solo si la cantidad recomendada > 0 O el stock es crítico

    Returns:
        Lista de dicts ordenada por prioridad (stock crítico primero)
    """
    products = get_all_active_products()
    recommendations = []

    for product in products:
        pid           = product["id"]
        stock_current = product["stock_current"]
        stock_minimum = product["stock_minimum"]

        try:
            prediction = get_prediction_for_product(pid, stock_current, stock_minimum)

            is_critical = stock_current <= stock_minimum

            entry = {
                "productId":       pid,
                "productName":     product["name"],
                "sku":             product["sku"],
                "category":        product["category_name"],
                "stockCurrent":    stock_current,
                "stockMinimum":    stock_minimum,
                "isCritical":      is_critical,
                "weeklyForecast":  prediction["weeklyForecast"],
                "monthlyForecast": prediction["monthlyForecast"],
                "recommendation":  prediction["recommendation"],
                "modelUsed":       prediction["modelUsed"],
                "confidence":      prediction["confidence"]
            }

            # Incluir siempre si es crítico, o si hay recomendación > 0
            if is_critical or prediction["recommendation"] > 0:
                recommendations.append(entry)

        except Exception as e:
            print(f"[PredictionService] Error en producto {pid}: {e}")
            continue

    # Ordenar: primero críticos, luego por mayor recomendación
    recommendations.sort(key=lambda x: (-int(x["isCritical"]), -x["recommendation"]))

    return recommendations
