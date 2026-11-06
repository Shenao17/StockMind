"""Orquestación de predicciones con el acceso a datos simulado."""
import pandas as pd
import pytest

import src.services.prediction_service as svc


def history(weekly):
    rows = []
    monday = pd.Timestamp("2026-01-05")
    for w, qty in enumerate(weekly):
        for d in range(7):
            rows.append({"sale_date": monday + pd.Timedelta(days=7 * w + d),
                         "quantity_sold": float(qty) if d == 0 else 0.0})
    return pd.DataFrame(rows)


@pytest.fixture
def saved(monkeypatch):
    calls = []
    monkeypatch.setattr(svc, "save_prediction", lambda **kw: calls.append(kw))
    return calls


class TestPredictionForProduct:
    def test_returns_prediction_and_persists_weekly_and_monthly(self, monkeypatch, saved):
        monkeypatch.setattr(svc, "get_sales_history", lambda org, pid, days: history([10, 20, 30, 40, 50]))
        r = svc.get_prediction_for_product(7, 5, stock_current=2, stock_minimum=5)

        assert r["productId"] == 5
        assert r["modelUsed"] == "linear_regression"
        assert {c["period_type"] for c in saved} == {"WEEKLY", "MONTHLY"}
        weekly = next(c for c in saved if c["period_type"] == "WEEKLY")
        monthly = next(c for c in saved if c["period_type"] == "MONTHLY")
        assert weekly["predicted_qty"] == r["weeklyForecast"]
        assert monthly["predicted_qty"] == r["monthlyForecast"]
        assert weekly["period_label"] == r["periodWeek"]
        assert monthly["period_label"] == r["periodMonth"]
        assert weekly["product_id"] == 5
        assert all(c["organization_id"] == 7 for c in saved)   # se guarda en la empresa correcta

    def test_no_confidence_is_saved_as_zero(self, monkeypatch, saved):
        monkeypatch.setattr(svc, "get_sales_history", lambda org, pid, days: history([]))
        r = svc.get_prediction_for_product(7, 1, 0, 5)
        assert r["confidence"] is None
        assert all(c["confidence"] == 0.0 for c in saved)


class TestRecommendations:
    def products(self):
        return [
            {"id": 1, "name": "Critico bajo", "sku": "A", "stock_current": 1, "stock_minimum": 5, "category_name": "X"},
            {"id": 2, "name": "Critico alto", "sku": "B", "stock_current": 0, "stock_minimum": 5, "category_name": "X"},
            {"id": 3, "name": "Sano", "sku": "C", "stock_current": 100000, "stock_minimum": 5, "category_name": "X"},
            {"id": 4, "name": "Reponer", "sku": "D", "stock_current": 10, "stock_minimum": 5, "category_name": "X"},
        ]

    def test_filters_sorts_and_flags_critical(self, monkeypatch, saved):
        monkeypatch.setattr(svc, "get_all_active_products", lambda org: self.products())
        sales = {1: [1, 1, 1], 2: [50, 50, 50], 3: [1, 1, 1], 4: [30, 30, 30]}
        monkeypatch.setattr(svc, "get_sales_history", lambda org, pid, days: history(sales[pid]))

        recs = svc.get_all_recommendations(7)
        ids = [r["productId"] for r in recs]

        assert 3 not in ids                       # stock de sobra y sin recomendación
        assert {r["productId"] for r in recs if r["isCritical"]} == {1, 2}
        assert ids[:2] == [2, 1]                  # críticos primero, mayor recomendación primero
        assert ids[-1] == 4                       # no crítico al final

    def test_failing_product_is_skipped(self, monkeypatch, saved):
        monkeypatch.setattr(svc, "get_all_active_products", lambda org: self.products())

        def flaky(org, pid, days):
            if pid == 2:
                raise RuntimeError("boom")
            return history([5, 5, 5])
        monkeypatch.setattr(svc, "get_sales_history", flaky)

        ids = [r["productId"] for r in svc.get_all_recommendations(7)]
        assert 2 not in ids
        assert 1 in ids

    def test_no_products(self, monkeypatch):
        monkeypatch.setattr(svc, "get_all_active_products", lambda org: [])
        assert svc.get_all_recommendations(7) == []

    def test_only_the_organizations_products_are_used(self, monkeypatch, saved):
        asked = []
        monkeypatch.setattr(svc, "get_all_active_products", lambda org: asked.append(org) or [])
        svc.get_all_recommendations(42)
        assert asked == [42]
