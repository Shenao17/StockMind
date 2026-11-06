"""Endpoints HTTP de analytics (cliente de pruebas de Flask, datos simulados)."""
import pytest

import src.routes.predictions as routes

PRODUCT = {"id": 1, "name": "Mouse", "sku": "ELEC-001", "stock_current": 3,
           "stock_minimum": 5, "category_name": "Electrónica"}


@pytest.fixture
def one_product(monkeypatch):
    monkeypatch.setattr(routes, "get_all_active_products", lambda: [PRODUCT])


def fake_prediction(pid, stock_current, stock_minimum):
    return {"weeklyForecast": 10.0, "monthlyForecast": 43.3, "confidence": None,
            "modelUsed": "weighted_moving_avg", "recommendation": 20, "weeksOfHistory": 3,
            "dataPoints": 21, "averageDailySales": 1.4, "productId": pid}


class TestHealth:
    def test_ok(self, client, monkeypatch):
        import src.services.database_service as db
        monkeypatch.setattr(db, "test_connection", lambda: True)
        r = client.get("/health")
        assert r.status_code == 200
        assert r.get_json()["status"] == "OK"

    def test_degraded_when_db_down(self, client, monkeypatch):
        import src.services.database_service as db
        monkeypatch.setattr(db, "test_connection", lambda: False)
        r = client.get("/health")
        assert r.status_code == 503
        assert r.get_json()["status"] == "DEGRADED"


class TestPredict:
    def test_unknown_product_is_404(self, client, monkeypatch):
        monkeypatch.setattr(routes, "get_all_active_products", lambda: [])
        r = client.get("/predict/999")
        assert r.status_code == 404
        assert r.get_json()["code"] == "PRODUCT_NOT_FOUND"

    def test_success_enriches_with_product_data(self, client, one_product, monkeypatch):
        monkeypatch.setattr(routes, "get_prediction_for_product", fake_prediction)
        body = client.get("/predict/1").get_json()
        assert body["productName"] == "Mouse"
        assert body["sku"] == "ELEC-001"
        assert body["category"] == "Electrónica"
        assert body["stockCurrent"] == 3
        assert body["isCritical"] is True         # 3 <= 5

    def test_query_overrides_stock_for_simulation(self, client, one_product, monkeypatch):
        seen = {}

        def spy(pid, sc, sm):
            seen["args"] = (pid, sc, sm)
            return fake_prediction(pid, sc, sm)
        monkeypatch.setattr(routes, "get_prediction_for_product", spy)
        body = client.get("/predict/1?stockCurrent=50&stockMinimum=10").get_json()
        assert seen["args"] == (1, 50, 10)
        assert body["isCritical"] is False

    def test_non_numeric_stock_is_400_not_500(self, client, one_product):
        r = client.get("/predict/1?stockCurrent=abc")
        assert r.status_code == 400
        assert r.get_json()["code"] == "INVALID_PARAMETER"

    def test_non_integer_product_id_is_404(self, client):
        assert client.get("/predict/abc").status_code == 404

    def test_internal_error_does_not_leak_details(self, client, one_product, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("SECRETO-INTERNO mysql://user:pass@host")
        monkeypatch.setattr(routes, "get_prediction_for_product", boom)
        r = client.get("/predict/1")
        assert r.status_code == 500
        assert "SECRETO-INTERNO" not in r.get_data(as_text=True)
        assert r.get_json()["code"] == "PREDICTION_ERROR"


class TestRecommend:
    def test_success_shape(self, client, monkeypatch):
        recs = [{"productId": 1, "isCritical": True}, {"productId": 2, "isCritical": False}]
        monkeypatch.setattr(routes, "get_all_recommendations", lambda: recs)
        body = client.get("/recommend").get_json()
        assert body["total"] == 2
        assert body["critical"] == 1
        assert body["recommendations"] == recs

    def test_internal_error_does_not_leak_details(self, client, monkeypatch):
        def boom():
            raise RuntimeError("SECRETO-INTERNO")
        monkeypatch.setattr(routes, "get_all_recommendations", boom)
        r = client.get("/recommend")
        assert r.status_code == 500
        assert "SECRETO-INTERNO" not in r.get_data(as_text=True)


def test_unknown_route_returns_json_404(client):
    r = client.get("/no-existe")
    assert r.status_code == 404
    assert r.get_json()["code"] == "NOT_FOUND"
