"""
StockMind Analytics — Servicio de conexión a MySQL
====================================================
Provee funciones utilitarias para consultar el historial de ventas
directamente desde la base de datos MySQL compartida con el backend Java.

El microservicio Python tiene acceso de SOLO LECTURA al historial de ventas
para construir los modelos predictivos. La escritura de predicciones se realiza
también desde este servicio para persistir los resultados en demand_predictions.
"""

import mysql.connector
from mysql.connector import Error
from config import DB_CONFIG
import pandas as pd
from datetime import datetime, timedelta


def get_connection():
    """
    Crea y retorna una conexión a MySQL usando la configuración centralizada.
    Lanza una excepción si la conexión falla.
    """
    return mysql.connector.connect(**DB_CONFIG)


def test_connection() -> bool:
    """Verifica que la conexión a MySQL sea exitosa. Retorna True/False."""
    try:
        conn = get_connection()
        conn.close()
        return True
    except Error:
        return False


def get_sales_history(product_id: int, days: int = 90) -> pd.DataFrame:
    """
    Obtiene el historial de ventas de un producto en los últimos N días.

    Consulta la tabla sale_details JOIN sales para obtener:
    - Fecha de la venta (agrupada por día)
    - Cantidad total vendida en ese día

    Returns:
        DataFrame con columnas ['sale_date', 'quantity_sold']
        Ordenado por fecha ascendente, con días sin ventas completados con 0.
    """
    query = """
        SELECT
            DATE(s.created_at) AS sale_date,
            SUM(sd.quantity)   AS quantity_sold
        FROM sale_details sd
        JOIN sales s ON sd.sale_id = s.id
        WHERE sd.product_id = %s
          AND s.status = 'COMPLETED'
          AND s.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)
        GROUP BY DATE(s.created_at)
        ORDER BY sale_date ASC
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, (product_id, days))
        rows = cursor.fetchall()
        cursor.close()
        conn.close()

        df = pd.DataFrame(rows)

        if df.empty:
            # Retornar DataFrame vacío con estructura correcta
            return pd.DataFrame(columns=["sale_date", "quantity_sold"])

        df["sale_date"] = pd.to_datetime(df["sale_date"])
        df["quantity_sold"] = df["quantity_sold"].astype(float)

        # Completar días sin ventas con 0 (serie de tiempo continua)
        date_range = pd.date_range(
            start=df["sale_date"].min(),
            end=datetime.now().date(),
            freq="D"
        )
        df = df.set_index("sale_date").reindex(date_range, fill_value=0).reset_index()
        df.columns = ["sale_date", "quantity_sold"]

        return df

    except Error as e:
        print(f"[DatabaseService] Error consultando historial: {e}")
        return pd.DataFrame(columns=["sale_date", "quantity_sold"])


def get_all_active_products() -> list:
    """
    Retorna todos los productos activos con su stock actual y mínimo.
    Usado por el endpoint /recommend para generar recomendaciones globales.
    """
    query = """
        SELECT
            p.id,
            p.name,
            p.sku,
            p.stock_current,
            p.stock_minimum,
            c.name AS category_name
        FROM products p
        JOIN categories c ON p.category_id = c.id
        WHERE p.active = TRUE
        ORDER BY p.name
    """
    try:
        conn = get_connection()
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query)
        products = cursor.fetchall()
        cursor.close()
        conn.close()
        return products
    except Error as e:
        print(f"[DatabaseService] Error consultando productos: {e}")
        return []


def save_prediction(product_id: int, period_type: str, period_label: str,
                    predicted_qty: float, confidence: float,
                    model_used: str, recommendation: int):
    """
    Persiste una predicción de demanda en la tabla demand_predictions.
    Permite rastrear la evolución de las predicciones a lo largo del tiempo.
    """
    query = """
        INSERT INTO demand_predictions
            (product_id, period_type, period_label, predicted_quantity,
             confidence, model_used, recommendation)
        VALUES (%s, %s, %s, %s, %s, %s, %s)
    """
    try:
        conn = get_connection()
        cursor = conn.cursor()
        cursor.execute(query, (
            product_id, period_type, period_label,
            round(predicted_qty, 2), round(confidence, 4),
            model_used, recommendation
        ))
        conn.commit()
        cursor.close()
        conn.close()
    except Error as e:
        print(f"[DatabaseService] Error guardando predicción: {e}")
