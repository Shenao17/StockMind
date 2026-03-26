"""
StockMind Analytics — Modelo de Predicción de Demanda
======================================================
Implementa dos estrategias de predicción complementarias:

1. Media Móvil Ponderada (WMA - Weighted Moving Average):
   Promedio de las últimas N semanas donde las semanas más recientes
   tienen mayor peso. Simple, interpretable y robusto con pocos datos.

2. Regresión Lineal Simple:
   Ajusta una línea de tendencia sobre la serie histórica semanal.
   Más precisa cuando existe una tendencia clara (crecimiento/decrecimiento).

La estrategia se selecciona automáticamente según la cantidad de datos:
- Menos de 4 semanas de historial → WMA
- 4 o más semanas → Regresión lineal si R² > 0.3, sino WMA

Esto garantiza que el microservicio siempre entregue una estimación útil,
incluso para productos con poco historial de ventas.
"""

import numpy as np
import pandas as pd
from sklearn.linear_model import LinearRegression
from sklearn.metrics import r2_score
from datetime import datetime, timedelta
from config import MOVING_AVG_WINDOW, SAFETY_STOCK_PCT


def aggregate_weekly(df: pd.DataFrame) -> pd.DataFrame:
    """
    Agrega el DataFrame diario a resumen semanal.

    Args:
        df: DataFrame con ['sale_date', 'quantity_sold'] (frecuencia diaria)

    Returns:
        DataFrame semanal con ['week', 'quantity_sold']
    """
    if df.empty:
        return pd.DataFrame(columns=["week", "quantity_sold"])

    df = df.copy()
    df["sale_date"] = pd.to_datetime(df["sale_date"])
    df["week"] = df["sale_date"].dt.to_period("W")
    weekly = df.groupby("week")["quantity_sold"].sum().reset_index()
    weekly["week_num"] = range(len(weekly))
    return weekly


def weighted_moving_average(weekly_qty: np.ndarray, window: int) -> float:
    """
    Calcula la media móvil ponderada (WMA) de las últimas N semanas.
    Los pesos son linealmente crecientes: la semana más reciente tiene
    el mayor peso.

    Args:
        weekly_qty: Array de cantidades vendidas por semana (cronológico)
        window: Número de semanas a considerar

    Returns:
        Estimación de demanda para la siguiente semana
    """
    data = weekly_qty[-window:] if len(weekly_qty) >= window else weekly_qty
    n = len(data)
    weights = np.arange(1, n + 1, dtype=float)  # [1, 2, 3, ..., n]
    weights /= weights.sum()                     # normalizar a suma = 1
    return float(np.dot(weights, data))


def linear_regression_forecast(weekly_qty: np.ndarray) -> tuple[float, float]:
    """
    Ajusta una regresión lineal sobre la serie temporal semanal
    y predice el valor de la siguiente semana.

    Args:
        weekly_qty: Array de cantidades vendidas por semana

    Returns:
        Tuple (predicción_próxima_semana, r2_score)
        R² indica qué tan bien la tendencia lineal explica los datos (0–1).
    """
    n = len(weekly_qty)
    X = np.arange(n).reshape(-1, 1)
    y = weekly_qty

    model = LinearRegression()
    model.fit(X, y)

    # Predicción para el período siguiente
    next_period = np.array([[n]])
    prediction = float(model.predict(next_period)[0])

    # Calidad del ajuste
    y_pred = model.predict(X)
    r2 = float(r2_score(y, y_pred)) if n > 2 else 0.0

    # Asegurar que la predicción no sea negativa
    prediction = max(0.0, prediction)

    return prediction, r2


def predict_demand(df: pd.DataFrame, stock_current: int,
                   stock_minimum: int) -> dict:
    """
    Función principal del módulo. Recibe el historial de ventas diario
    y genera la predicción semanal y mensual, junto con la recomendación
    de reabastecimiento.

    Args:
        df:            DataFrame diario con historial de ventas
        stock_current: Stock disponible actualmente
        stock_minimum: Stock mínimo configurado para el producto

    Returns:
        dict con las claves:
            weeklyForecast   - Demanda estimada para la próxima semana
            monthlyForecast  - Demanda estimada para el próximo mes
            confidence       - R² del modelo (0–1), o None si se usó WMA
            modelUsed        - 'linear_regression' o 'weighted_moving_avg'
            recommendation   - Cantidad sugerida a reabastecer
            weeksOfHistory   - Semanas de historial disponibles
            dataPoints       - Días de historial disponibles
            averageDailySales - Promedio diario histórico
    """
    # ── Sin datos históricos: estimación mínima basada en stock mínimo
    if df.empty or df["quantity_sold"].sum() == 0:
        return {
            "weeklyForecast":    stock_minimum,
            "monthlyForecast":   stock_minimum * 4,
            "confidence":        None,
            "modelUsed":         "default_minimum",
            "recommendation":    max(0, stock_minimum - stock_current),
            "weeksOfHistory":    0,
            "dataPoints":        0,
            "averageDailySales": 0.0,
            "note": "Sin historial de ventas. Se usa stock mínimo como estimación base."
        }

    # ── Datos de contexto
    avg_daily = float(df["quantity_sold"].mean())
    data_points = len(df)

    # ── Agregación semanal
    weekly = aggregate_weekly(df)
    weekly_qty = weekly["quantity_sold"].values
    n_weeks = len(weekly_qty)

    # ── Selección del modelo
    weekly_forecast = 0.0
    r2 = None
    model_used = "weighted_moving_avg"

    if n_weeks >= 4:
        # Intentar regresión lineal
        lr_forecast, lr_r2 = linear_regression_forecast(weekly_qty)
        if lr_r2 > 0.3:
            # La tendencia lineal explica al menos el 30% de la varianza → usar
            weekly_forecast = lr_forecast
            r2 = lr_r2
            model_used = "linear_regression"
        else:
            # Baja calidad de ajuste → volver a WMA
            weekly_forecast = weighted_moving_average(weekly_qty, MOVING_AVG_WINDOW)
    else:
        # Pocas semanas de historial → WMA directo
        weekly_forecast = weighted_moving_average(weekly_qty, min(n_weeks, MOVING_AVG_WINDOW))

    weekly_forecast = max(0.0, weekly_forecast)
    monthly_forecast = weekly_forecast * 4.33  # semanas promedio por mes

    # ── Recomendación de reabastecimiento
    # Fórmula: demanda mensual proyectada + stock de seguridad - stock actual
    # El stock de seguridad es un porcentaje adicional (configurable)
    safety_stock = monthly_forecast * SAFETY_STOCK_PCT
    reorder_qty  = monthly_forecast + safety_stock - stock_current + stock_minimum
    recommendation = max(0, round(reorder_qty))

    return {
        "weeklyForecast":    round(weekly_forecast, 2),
        "monthlyForecast":   round(monthly_forecast, 2),
        "confidence":        round(r2, 4) if r2 is not None else None,
        "modelUsed":         model_used,
        "recommendation":    recommendation,
        "weeksOfHistory":    n_weeks,
        "dataPoints":        data_points,
        "averageDailySales": round(avg_daily, 2)
    }
