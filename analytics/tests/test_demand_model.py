"""Modelo de predicción de demanda (lógica pura, sin base de datos)."""
import numpy as np
import pandas as pd
import pytest

from src.models.demand_model import (
    aggregate_weekly,
    linear_regression_forecast,
    predict_demand,
    weighted_moving_average,
)


def daily_df(weekly_quantities, start="2026-01-05"):
    """Serie diaria: la cantidad semanal se vende el lunes, el resto de días 0."""
    rows = []
    monday = pd.Timestamp(start)  # 2026-01-05 es lunes
    for w, qty in enumerate(weekly_quantities):
        for d in range(7):
            rows.append({"sale_date": monday + pd.Timedelta(days=7 * w + d),
                         "quantity_sold": float(qty) if d == 0 else 0.0})
    return pd.DataFrame(rows)


class TestAggregateWeekly:
    def test_empty(self):
        out = aggregate_weekly(pd.DataFrame(columns=["sale_date", "quantity_sold"]))
        assert out.empty

    def test_sums_per_week(self):
        out = aggregate_weekly(daily_df([10, 20, 30]))
        assert list(out["quantity_sold"]) == [10, 20, 30]
        assert list(out["week_num"]) == [0, 1, 2]

    def test_does_not_mutate_input(self):
        df = daily_df([5, 5])
        before = df.copy()
        aggregate_weekly(df)
        pd.testing.assert_frame_equal(df, before)


class TestWeightedMovingAverage:
    def test_recent_weeks_weigh_more(self):
        # pesos 1,2,3 → (1*10 + 2*20 + 3*30) / 6 = 23.33
        assert weighted_moving_average(np.array([10, 20, 30]), 3) == pytest.approx(140 / 6)

    def test_constant_series(self):
        assert weighted_moving_average(np.array([7, 7, 7, 7]), 4) == pytest.approx(7)

    def test_window_larger_than_data_uses_all_data(self):
        assert weighted_moving_average(np.array([10, 20]), 4) == pytest.approx((1 * 10 + 2 * 20) / 3)

    def test_only_last_window_counts(self):
        assert weighted_moving_average(np.array([1000, 10, 10]), 2) == pytest.approx(10)

    def test_single_value(self):
        assert weighted_moving_average(np.array([42]), 4) == pytest.approx(42)


class TestLinearRegressionForecast:
    def test_perfect_growth(self):
        pred, r2 = linear_regression_forecast(np.array([10.0, 20.0, 30.0, 40.0]))
        assert pred == pytest.approx(50.0)
        assert r2 == pytest.approx(1.0)

    def test_declining_never_negative(self):
        pred, _ = linear_regression_forecast(np.array([30.0, 20.0, 10.0, 1.0]))
        assert pred >= 0.0

    def test_two_points_has_zero_confidence(self):
        _, r2 = linear_regression_forecast(np.array([10.0, 20.0]))
        assert r2 == 0.0


class TestPredictDemand:
    def test_no_history_uses_minimum(self):
        r = predict_demand(pd.DataFrame(columns=["sale_date", "quantity_sold"]), 3, 10)
        assert r["modelUsed"] == "default_minimum"
        assert r["weeklyForecast"] == 10
        assert r["monthlyForecast"] == 40
        assert r["recommendation"] == 7          # 10 - 3
        assert r["confidence"] is None
        assert r["weeksOfHistory"] == 0

    def test_all_zero_sales_counts_as_no_history(self):
        r = predict_demand(daily_df([0, 0, 0]), 20, 10)
        assert r["modelUsed"] == "default_minimum"
        assert r["recommendation"] == 0          # nunca negativo

    def test_short_history_uses_wma(self):
        r = predict_demand(daily_df([10, 20, 30]), 0, 5)
        assert r["modelUsed"] == "weighted_moving_avg"
        assert r["confidence"] is None
        assert r["weeksOfHistory"] == 3
        assert r["weeklyForecast"] == pytest.approx(140 / 6, abs=0.01)

    def test_clear_trend_uses_linear_regression(self):
        r = predict_demand(daily_df([10, 20, 30, 40, 50]), 0, 5)
        assert r["modelUsed"] == "linear_regression"
        assert r["confidence"] > 0.9
        assert r["weeklyForecast"] == pytest.approx(60.0, abs=0.01)

    def test_noisy_series_falls_back_to_wma(self):
        r = predict_demand(daily_df([10, 50, 12, 48, 11, 49]), 0, 5)
        assert r["modelUsed"] == "weighted_moving_avg"

    def test_monthly_is_weekly_times_4_33(self):
        r = predict_demand(daily_df([10, 10, 10]), 0, 5)
        assert r["monthlyForecast"] == pytest.approx(r["weeklyForecast"] * 4.33, abs=0.02)

    def test_recommendation_formula(self):
        # semanal 10 → mensual 43.3; +20% seguridad = 51.96; - stock 20 + mínimo 5 = 36.96 → 37
        r = predict_demand(daily_df([10, 10, 10]), 20, 5)
        assert r["recommendation"] == 37

    def test_enough_stock_recommends_zero(self):
        r = predict_demand(daily_df([1, 1, 1]), 10_000, 5)
        assert r["recommendation"] == 0

    def test_never_negative_forecast(self):
        r = predict_demand(daily_df([100, 60, 30, 10, 1]), 0, 5)
        assert r["weeklyForecast"] >= 0
        assert r["monthlyForecast"] >= 0
        assert r["recommendation"] >= 0

    def test_output_has_all_documented_keys(self):
        r = predict_demand(daily_df([5, 6, 7]), 1, 5)
        for key in ("weeklyForecast", "monthlyForecast", "confidence", "modelUsed",
                    "recommendation", "weeksOfHistory", "dataPoints", "averageDailySales"):
            assert key in r
