"""Endpoints HTTP de analytics (cliente de pruebas de Flask, datos simulados)."""
import pytest

import src.routes.predictions as routes
from conftest import ORG_ID, gateway_headers

H = gateway_headers()

PRODUCT = {"id": 1, "name": "Mouse", "sku": "ELEC-001", "stock_current": 3,
           "stock_minimum": 5, "category_name": "Electrónica"}


@pytest.fixture
def one_product(monkeypatch):
    monkeypatch.setattr(routes, "get_all_active_products", lambda org: [PRODUCT])


def fake_prediction(org, pid, stock_current, stock_minimum):
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

    def test_health_does_not_require_the_gateway_key(self, client, monkeypatch):
        import src.services.database_service as db
        monkeypatch.setattr(db, "test_connection", lambda: True)
        assert client.get("/health").status_code == 200


class TestGatewayAuthentication:
    """Analytics solo atiende al gateway y siempre para UNA empresa."""

    @pytest.mark.parametrize("path", ["/predict/1", "/recommend"])
    def test_without_internal_key_is_401(self, client, path):
        r = client.get(path, headers={"X-Organization-Id": "7"})
        assert r.status_code == 401
        assert r.get_json()["code"] == "UNAUTHORIZED"

    @pytest.mark.parametrize("path", ["/predict/1", "/recommend"])
    def test_with_wrong_internal_key_is_401(self, client, path):
        r = client.get(path, headers=gateway_headers(key="clave-equivocada"))
        assert r.status_code == 401

    @pytest.mark.parametrize("org", ["", "abc", "0", "-1", "7.5", "7 OR 1=1"])
    def test_invalid_organization_is_400(self, client, org):
        r = client.get("/recommend", headers={"X-Internal-Key": H["X-Internal-Key"], "X-Organization-Id": org})
        assert r.status_code == 400
        assert r.get_json()["code"] == "INVALID_ORGANIZATION"

    def test_missing_organization_is_400(self, client):
        r = client.get("/recommend", headers={"X-Internal-Key": H["X-Internal-Key"]})
        assert r.status_code == 400

    def test_fails_closed_when_the_server_has_no_key_configured(self, client, monkeypatch):
        import config
        monkeypatch.setattr(config, "INTERNAL_API_KEY", "")
        # aunque el cliente mande una clave vacía, no se acepta
        r = client.get("/recommend", headers={"X-Internal-Key": "", "X-Organization-Id": "7"})
        assert r.status_code == 401

    def test_rejected_requests_never_reach_the_services(self, client, monkeypatch):
        called = []
        monkeypatch.setattr(routes, "get_all_recommendations", lambda org: called.append(org) or [])
        client.get("/recommend", headers={"X-Organization-Id": "7"})
        assert called == []


class TestPredict:
    def test_unknown_product_is_404(self, client, monkeypatch):
        monkeypatch.setattr(routes, "get_all_active_products", lambda org: [])
        r = client.get("/predict/999", headers=H)
        assert r.status_code == 404
        assert r.get_json()["code"] == "PRODUCT_NOT_FOUND"

    def test_product_of_another_organization_is_404(self, client, monkeypatch):
        by_org = {7: [PRODUCT], 8: []}
        monkeypatch.setattr(routes, "get_all_active_products", lambda org: by_org.get(org, []))
        monkeypatch.setattr(routes, "get_prediction_for_product", fake_prediction)

        assert client.get("/predict/1", headers=gateway_headers(org=7)).status_code == 200
        assert client.get("/predict/1", headers=gateway_headers(org=8)).status_code == 404

    def test_organization_is_passed_to_the_services(self, client, one_product, monkeypatch):
        seen = {}

        def spy(org, pid, sc, sm):
            seen["args"] = (org, pid, sc, sm)
            return fake_prediction(org, pid, sc, sm)
        monkeypatch.setattr(routes, "get_prediction_for_product", spy)
        client.get("/predict/1", headers=gateway_headers(org=ORG_ID))
        assert seen["args"] == (ORG_ID, 1, 3, 5)

    def test_success_enriches_with_product_data(self, client, one_product, monkeypatch):
        monkeypatch.setattr(routes, "get_prediction_for_product", fake_prediction)
        body = client.get("/predict/1", headers=H).get_json()
        assert body["productName"] == "Mouse"
        assert body["sku"] == "ELEC-001"
        assert body["category"] == "Electrónica"
        assert body["stockCurrent"] == 3
        assert body["isCritical"] is True         # 3 <= 5

    def test_query_overrides_stock_for_simulation(self, client, one_product, monkeypatch):
        seen = {}

        def spy(org, pid, sc, sm):
            seen["args"] = (org, pid, sc, sm)
            return fake_prediction(org, pid, sc, sm)
        monkeypatch.setattr(routes, "get_prediction_for_product", spy)
        body = client.get("/predict/1?stockCurrent=50&stockMinimum=10", headers=H).get_json()
        assert seen["args"] == (ORG_ID, 1, 50, 10)
        assert body["isCritical"] is False

    def test_non_numeric_stock_is_400_not_500(self, client, one_product):
        r = client.get("/predict/1?stockCurrent=abc", headers=H)
        assert r.status_code == 400
        assert r.get_json()["code"] == "INVALID_PARAMETER"

    def test_non_integer_product_id_is_404(self, client):
        assert client.get("/predict/abc", headers=H).status_code == 404

    def test_internal_error_does_not_leak_details(self, client, one_product, monkeypatch):
        def boom(*a, **k):
            raise RuntimeError("SECRETO-INTERNO mysql://user:pass@host")
        monkeypatch.setattr(routes, "get_prediction_for_product", boom)
        r = client.get("/predict/1", headers=H)
        assert r.status_code == 500
        assert "SECRETO-INTERNO" not in r.get_data(as_text=True)
        assert r.get_json()["code"] == "PREDICTION_ERROR"


class TestRecommend:
    def test_success_shape(self, client, monkeypatch):
        recs = [{"productId": 1, "isCritical": True}, {"productId": 2, "isCritical": False}]
        monkeypatch.setattr(routes, "get_all_recommendations", lambda org: recs)
        body = client.get("/recommend", headers=H).get_json()
        assert body["total"] == 2
        assert body["critical"] == 1
        assert body["recommendations"] == recs

    def test_uses_the_organization_from_the_gateway(self, client, monkeypatch):
        asked = []
        monkeypatch.setattr(routes, "get_all_recommendations", lambda org: asked.append(org) or [])
        client.get("/recommend", headers=gateway_headers(org=42))
        client.get("/recommend", headers=gateway_headers(org=43))
        assert asked == [42, 43]

    def test_internal_error_does_not_leak_details(self, client, monkeypatch):
        def boom(org):
            raise RuntimeError("SECRETO-INTERNO")
        monkeypatch.setattr(routes, "get_all_recommendations", boom)
        r = client.get("/recommend", headers=H)
        assert r.status_code == 500
        assert "SECRETO-INTERNO" not in r.get_data(as_text=True)


def test_unknown_route_returns_json_404(client):
    r = client.get("/no-existe")
    assert r.status_code == 404
    assert r.get_json()["code"] == "NOT_FOUND"
