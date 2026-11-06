"""
Aislamiento entre empresas contra un MySQL REAL, con el esquema oficial (migraciones Flyway).

Solo corre si existe la variable ANALYTICS_MYSQL_HOST (en el CI hay un servicio MySQL; en local
se puede levantar uno desechable). Aplica las migraciones V1 y V2 del backend, crea dos empresas
con datos y comprueba que ninguna consulta de analytics cruza de una a otra.

  ANALYTICS_MYSQL_HOST / _PORT / _USER / _PASSWORD  (usuario con permiso para crear la base)
"""
import glob
import os
from datetime import datetime, timedelta

import pytest

HOST = os.getenv("ANALYTICS_MYSQL_HOST")
pytestmark = pytest.mark.skipif(not HOST, reason="Requiere ANALYTICS_MYSQL_HOST (MySQL real)")

DB_NAME = "stockmind_analytics_test"
MIGRATIONS = os.path.join(os.path.dirname(__file__), "..", "..", "backend", "src", "main", "resources", "db", "migration")


def _conn(database=None):
    import mysql.connector
    return mysql.connector.connect(
        host=HOST, port=int(os.getenv("ANALYTICS_MYSQL_PORT", 3306)),
        user=os.getenv("ANALYTICS_MYSQL_USER", "root"),
        password=os.getenv("ANALYTICS_MYSQL_PASSWORD", ""),
        database=database, autocommit=True)


@pytest.fixture(scope="module")
def world():
    """Crea la base con las migraciones reales y dos empresas con productos y ventas."""
    admin = _conn()
    cur = admin.cursor()
    cur.execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
    cur.execute(f"CREATE DATABASE {DB_NAME} CHARACTER SET utf8mb4")
    admin.close()

    conn = _conn(DB_NAME)
    cur = conn.cursor()
    for path in sorted(glob.glob(os.path.join(MIGRATIONS, "V*.sql"))):
        with open(path, encoding="utf-8") as f:
            for _ in cur.execute(f.read(), multi=True):
                pass

    cur.execute("INSERT INTO organizations (id, name, contact_email, status, origin) VALUES "
                "(2, 'Empresa B', 'b@test.com', 'ACTIVE', 'PLATFORM_ADMIN')")
    ids = {}
    for org in (1, 2):
        cur.execute("INSERT INTO users (organization_id, username, email, password_hash, role) "
                    "VALUES (%s, 'u', %s, 'x', 'ADMIN')", (org, f"u{org}@test.com"))
        user_id = cur.lastrowid
        cur.execute("INSERT INTO categories (organization_id, name) VALUES (%s, 'Cat')", (org,))
        cat_id = cur.lastrowid
        cur.execute("INSERT INTO products (organization_id, category_id, name, sku, price, stock_current, stock_minimum) "
                    "VALUES (%s, %s, %s, 'SKU-1', 10, 3, 5)", (org, cat_id, f"Producto empresa {org}"))
        product_id = cur.lastrowid
        # una venta reciente (hace 2 días) del producto de cada empresa
        when = datetime.now() - timedelta(days=2)
        cur.execute("INSERT INTO sales (organization_id, user_id, total, status, created_at) "
                    "VALUES (%s, %s, 50, 'COMPLETED', %s)", (org, user_id, when))
        sale_id = cur.lastrowid
        cur.execute("INSERT INTO sale_details (sale_id, product_id, quantity, unit_price, subtotal) "
                    "VALUES (%s, %s, %s, 10, %s)", (sale_id, product_id, 5 * org, 50 * org))
        ids[org] = product_id
    conn.close()
    yield ids

    admin = _conn()
    admin.cursor().execute(f"DROP DATABASE IF EXISTS {DB_NAME}")
    admin.close()


@pytest.fixture
def db(world, monkeypatch):
    import src.services.database_service as database_service
    monkeypatch.setattr(database_service, "DB_CONFIG", {
        "host": HOST, "port": int(os.getenv("ANALYTICS_MYSQL_PORT", 3306)),
        "user": os.getenv("ANALYTICS_MYSQL_USER", "root"),
        "password": os.getenv("ANALYTICS_MYSQL_PASSWORD", ""), "database": DB_NAME})
    return database_service


def test_each_organization_only_sees_its_own_products(db, world):
    a = db.get_all_active_products(1)
    b = db.get_all_active_products(2)
    assert [p["id"] for p in a] == [world[1]]
    assert [p["id"] for p in b] == [world[2]]
    assert db.get_all_active_products(999) == []


def test_sales_history_does_not_cross_organizations(db, world):
    assert db.get_sales_history(1, world[1], 30)["quantity_sold"].sum() == 5
    assert db.get_sales_history(2, world[2], 30)["quantity_sold"].sum() == 10
    # la empresa 1 pide el producto de la 2 (y al revés): nada
    assert db.get_sales_history(1, world[2], 30).empty
    assert db.get_sales_history(2, world[1], 30).empty


def test_predictions_are_stored_in_the_right_organization_only(db, world):
    conn = _conn(DB_NAME)
    cur = conn.cursor()
    cur.execute("DELETE FROM demand_predictions")

    db.save_prediction(2, world[2], "WEEKLY", "2026-W01", 10.0, 0.5, "weighted_moving_avg", 1)
    db.save_prediction(1, world[2], "WEEKLY", "2026-W01", 99.0, 0.5, "weighted_moving_avg", 1)  # producto ajeno

    cur.execute("SELECT organization_id, product_id, predicted_quantity FROM demand_predictions")
    rows = cur.fetchall()
    conn.close()
    assert rows == [(2, world[2], 10.0)], "solo se guarda la predicción de la empresa dueña del producto"


def test_services_end_to_end_stay_inside_the_organization(db, world, monkeypatch):
    import src.services.prediction_service as svc
    monkeypatch.setattr(svc, "get_sales_history", db.get_sales_history)
    monkeypatch.setattr(svc, "get_all_active_products", db.get_all_active_products)
    monkeypatch.setattr(svc, "save_prediction", db.save_prediction)

    recs_1 = svc.get_all_recommendations(1)
    recs_2 = svc.get_all_recommendations(2)
    assert {r["productId"] for r in recs_1} == {world[1]}
    assert {r["productId"] for r in recs_2} == {world[2]}
    assert recs_1[0]["productName"] == "Producto empresa 1"
