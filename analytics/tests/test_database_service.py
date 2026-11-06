"""Servicio de base de datos con una conexión MySQL simulada (nunca toca MySQL real)."""
from datetime import datetime, timedelta

import pandas as pd
import pytest
from mysql.connector import Error

import src.services.database_service as db


class FakeCursor:
    def __init__(self, rows=None, raise_on_execute=False):
        self.rows = rows or []
        self.raise_on_execute = raise_on_execute
        self.executed = []

    def execute(self, query, params=None):
        if self.raise_on_execute:
            raise Error("fallo simulado")
        self.executed.append((query, params))

    def fetchall(self):
        return self.rows

    def close(self):
        pass


class FakeConn:
    def __init__(self, cursor):
        self._cursor = cursor
        self.committed = False

    def cursor(self, dictionary=False):
        return self._cursor

    def commit(self):
        self.committed = True

    def close(self):
        pass


@pytest.fixture
def use_cursor(monkeypatch):
    def _install(cursor):
        conn = FakeConn(cursor)
        monkeypatch.setattr(db, "get_connection", lambda: conn)
        return conn
    return _install


class TestSalesHistory:
    def test_empty_result_keeps_structure(self, use_cursor):
        use_cursor(FakeCursor(rows=[]))
        df = db.get_sales_history(7, 1, 90)
        assert df.empty
        assert list(df.columns) == ["sale_date", "quantity_sold"]

    def test_fills_missing_days_with_zero_up_to_today(self, use_cursor):
        three_days_ago = (datetime.now() - timedelta(days=3)).date()
        use_cursor(FakeCursor(rows=[{"sale_date": three_days_ago, "quantity_sold": 5}]))
        df = db.get_sales_history(7, 1, 90)
        assert len(df) == 4                       # hace 3 días, 2, 1 y hoy
        assert df["quantity_sold"].sum() == 5
        assert (df["quantity_sold"] == 0).sum() == 3
        assert df["sale_date"].is_monotonic_increasing

    def test_passes_product_and_days_as_parameters(self, use_cursor):
        cur = FakeCursor(rows=[])
        use_cursor(cur)
        db.get_sales_history(5, 7, 30)
        query, params = cur.executed[0]
        assert params == (5, 7, 30)               # (empresa, producto, días): parametrizado
        assert "%s" in query
        assert "s.organization_id = %s" in query  # siempre limitado a la empresa

    def test_database_error_returns_empty_frame(self, use_cursor):
        use_cursor(FakeCursor(raise_on_execute=True))
        df = db.get_sales_history(7, 1, 90)
        assert df.empty
        assert list(df.columns) == ["sale_date", "quantity_sold"]


class TestProductsAndPredictions:
    def test_active_products(self, use_cursor):
        rows = [{"id": 1, "name": "A", "sku": "S", "stock_current": 3, "stock_minimum": 5, "category_name": "C"}]
        use_cursor(FakeCursor(rows=rows))
        assert db.get_all_active_products(7) == rows

    def test_active_products_error_returns_empty_list(self, use_cursor):
        use_cursor(FakeCursor(raise_on_execute=True))
        assert db.get_all_active_products(7) == []

    def test_products_query_is_scoped_to_the_organization(self, use_cursor):
        cur = FakeCursor(rows=[])
        use_cursor(cur)
        db.get_all_active_products(42)
        query, params = cur.executed[0]
        assert params == (42,)
        assert "p.organization_id = %s" in query

    def test_save_prediction_rounds_and_commits(self, use_cursor):
        cur = FakeCursor()
        conn = use_cursor(cur)
        db.save_prediction(7, 1, "WEEKLY", "2026-W01", 12.3456, 0.98765, "linear_regression", 30)
        query, params = cur.executed[0]
        # el producto debe pertenecer a la empresa: (..., id_producto, id_empresa)
        assert params == ("WEEKLY", "2026-W01", 12.35, 0.9877, "linear_regression", 30, 1, 7)
        assert "p.organization_id = %s" in query
        assert conn.committed is True

    def test_save_prediction_error_does_not_raise(self, use_cursor):
        use_cursor(FakeCursor(raise_on_execute=True))
        db.save_prediction(7, 1, "WEEKLY", "2026-W01", 1.0, 0.5, "weighted_moving_avg", 0)

    def test_test_connection(self, monkeypatch):
        monkeypatch.setattr(db, "get_connection", lambda: FakeConn(FakeCursor()))
        assert db.test_connection() is True

        def boom():
            raise Error("sin conexión")
        monkeypatch.setattr(db, "get_connection", boom)
        assert db.test_connection() is False
