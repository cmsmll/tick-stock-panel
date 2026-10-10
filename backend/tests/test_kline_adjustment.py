from datetime import date, datetime, timedelta
from types import SimpleNamespace

import polars as pl
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.services import kline_adjustment as service


class Provider:
    def __init__(self):
        self.calls = []

    def get_chart_daily(self, symbol, start, end, asset_type, adjust):
        self.calls.append((symbol, start, end, asset_type, adjust))
        price = {"none": 10.0, "forward": 6.3, "backward": 23.7}[adjust]
        return pl.DataFrame([dict(symbol=symbol, date=date(2026, 1, 1) + timedelta(days=i),
                                 open=price - 1, high=price + 2, low=price - 2,
                                 close=price, volume=100.0, amount=123456.0) for i in range(10)])

    def get_chart_minute(self, symbol, start, end, asset_type, adjust):
        return pl.DataFrame([dict(symbol=symbol, datetime=datetime(2026, 1, 10, 9, 31),
                                 open=21., high=24., low=20., close=23.7,
                                 volume=100., amount=123456.)])


@pytest.fixture
def provider(monkeypatch):
    provider = Provider()
    service._cache.clear()
    monkeypatch.setattr(service, "_resolve_provider", lambda dataset: ("fake", provider))
    return provider


@pytest.mark.parametrize("mode,price", [("none", 10), ("forward", 6.3), ("backward", 23.7)])
def test_daily_uses_provider_prices_and_recomputes_indicators(provider, mode, price):
    rows, source = service.daily_rows("600000.SH", date(2026, 1, 6), date(2026, 1, 10), "stock", mode)
    assert source == "fake"
    assert len(rows) == 5
    assert rows[0]["close"] == price
    assert rows[0]["open"] == price - 1
    assert rows[0]["ma5"] == pytest.approx(price)
    assert rows[0]["amount"] == 123456
    assert provider.calls[0][-1] == mode
    assert provider.calls[0][1].date() < date(2026, 1, 6)


def test_cache_separates_modes_and_reuses_same_request(provider):
    args = ("600000.SH", date(2026, 1, 6), date(2026, 1, 10), "stock")
    service.daily_rows(*args, "none")
    service.daily_rows(*args, "none")
    service.daily_rows(*args, "forward")
    assert len(provider.calls) == 2


def test_minute_keeps_source_prices_amount_and_uses_same_source_previous_close(provider):
    result = service.minute_rows("600000.SH", date(2026, 1, 10), "stock", "backward")
    assert result["rows"][0]["close"] == 23.7
    assert result["rows"][0]["amount"] == 123456
    assert result["prev_close"] == 23.7


def test_unsupported_does_not_fallback(provider, monkeypatch):
    monkeypatch.setattr(service, "_resolve_provider", lambda dataset: ("legacy", object()))
    with pytest.raises(NotImplementedError):
        service.daily_rows("600000.SH", date(2026, 1, 6), date(2026, 1, 10), "stock", "forward")


def test_api_passes_mode_and_returns_upstream_error(provider, monkeypatch):
    from app.api.kline import router
    app = FastAPI()
    app.include_router(router)
    app.state.repo = SimpleNamespace(resolve_asset_type=lambda symbol: "stock", get_stock_info=lambda symbol: {})
    with TestClient(app) as client:
        params = dict(symbol="600000.SH", start_date="2026-01-06", end_date="2026-01-10", adjust="backward")
        response = client.get("/api/kline/daily", params=params)
        assert response.status_code == 200
        assert response.json()["rows"][0]["close"] == 23.7
        assert client.get("/api/kline/daily", params={**params, "adjust": "invalid"}).status_code == 422
        service._cache.clear()
        def fail(*args):
            raise RuntimeError("upstream failed")
        monkeypatch.setattr(provider, "get_chart_daily", fail)
        assert client.get("/api/kline/daily", params=params).status_code == 502

@pytest.mark.parametrize("mode", ["none", "forward", "backward"])
def test_tickflow_adapter_passes_mode_unchanged(monkeypatch, mode):
    from app.data_providers import tickflow_provider as tp
    calls = []
    def get(symbol, **kwargs):
        calls.append(kwargs)
        return dict(timestamp=[1767663060000], open=[19.1], high=[24.2], low=[18.3],
                    close=[23.7], volume=[100], amount=[123456])
    monkeypatch.setattr(tp, "get_client", lambda: SimpleNamespace(klines=SimpleNamespace(get=get)))
    provider = tp.TickFlowProvider()
    start, end = datetime(2026, 1, 6), datetime(2026, 1, 7)
    daily = provider.get_chart_daily("600000.SH", start, end, "stock", mode)
    minute = provider.get_chart_minute("600000.SH", start, end, "stock", mode)
    assert [call["adjust"] for call in calls] == [mode, mode]
    assert [call["period"] for call in calls] == ["1d", "1m"]
    assert daily["close"][0] == minute["close"][0] == 23.7
    assert daily["amount"][0] == minute["amount"][0] == 123456
    assert minute["datetime"][0].hour == 9


@pytest.mark.parametrize("mode,upstream", [("none", "none"), ("forward", "qfq"), ("backward", "hfq")])
def test_stocksdk_chart_mode_and_strict_errors(monkeypatch, mode, upstream):
    from app.plugins.stocksdk import provider as sp
    calls = []
    def run(job, **kwargs):
        calls.append(job)
        return {"rows": {"600000.SH": [
            dict(date="2026-01-06", open=19.1, high=24.2, low=18.3,
                 close=23.7, volume=100, amount=123456)]}}
    monkeypatch.setattr(sp.bridge, "run_job", run)
    provider = sp.StockSDKProvider()
    start, end = datetime(2026, 1, 6), datetime(2026, 1, 7)
    df = provider.get_chart_daily("600000.SH", start, end, "stock", mode)
    assert calls[0]["adjust"] == upstream
    assert calls[0]["strict"] is True
    assert df["close"][0] == 23.7
    with pytest.raises(NotImplementedError):
        provider.get_chart_minute("600000.SH", start, end, "stock", "forward")


@pytest.mark.parametrize("mode", ["none", "forward", "backward"])
def test_fuyao_chart_bypasses_raw_dump_and_preserves_price(monkeypatch, mode):
    from app.plugins.fuyao import provider as fp
    provider = fp.FuyaoProvider()
    calls = []
    def historical(symbol, start, end, adjust):
        calls.append(adjust)
        return [dict(date_ms=fp._ms_of_date(date(2026, 1, 6)), open_price=19.1,
                     high_price=24.2, low_price=18.3, close_price=23.7, volume=10000, turnover=123456)]
    monkeypatch.setattr(provider, "_get_client", lambda: SimpleNamespace(historical_kline=historical))
    df = provider.get_chart_daily("600000.SH", datetime(2026, 1, 6), datetime(2026, 1, 7), "stock", mode)
    assert calls == [mode]
    assert df["close"][0] == 23.7
    assert df["volume"][0] == 100
    assert df["amount"][0] == 123456


def test_api_minute_empty_unsupported_and_failed(provider, monkeypatch):
    from app.api.kline import router
    app = FastAPI()
    app.include_router(router)
    app.state.repo = SimpleNamespace(resolve_asset_type=lambda symbol: "stock", get_stock_info=lambda symbol: {})
    params = dict(symbol="600000.SH", date="2026-01-10", adjust="backward")
    with TestClient(app) as client:
        result = client.get("/api/kline/minute", params=params)
        assert result.status_code == 200
        assert result.json()["rows"][0]["close"] == 23.7
        assert result.json()["daily_summary"]["close"] == 23.7
        assert client.get("/api/kline/minute", params=dict(symbol="600000.SH", adjust="none")).status_code == 422
        service._cache.clear()
        monkeypatch.setattr(provider, "get_chart_minute", lambda *args: pl.DataFrame())
        empty = client.get("/api/kline/minute", params=params)
        assert empty.status_code == 200
        assert empty.json()["rows"] == []
        assert empty.json()["source"] == "none"
        service._cache.clear()
        def fail(*args):
            raise NotImplementedError("当前源不支持复权分时")
        monkeypatch.setattr(provider, "get_chart_minute", fail)
        assert client.get("/api/kline/minute", params=params).status_code == 409
        def network(*args):
            raise RuntimeError("upstream error")
        monkeypatch.setattr(provider, "get_chart_minute", network)
        assert client.get("/api/kline/minute", params=params).status_code == 502


def test_provider_switch_cache_expiry_and_index_mode(provider, monkeypatch):
    args = ("600000.SH", date(2026, 1, 6), date(2026, 1, 10), "stock", "forward")
    service.daily_rows(*args)
    other = Provider()
    monkeypatch.setattr(service, "_resolve_provider", lambda dataset: ("other", other))
    service.daily_rows(*args)
    assert len(other.calls) == 1
    monkeypatch.setattr(service, "monotonic", lambda: 10**12)
    service.daily_rows(*args)
    assert len(other.calls) == 2
    service.daily_rows("000001.SH", date(2026, 1, 6), date(2026, 1, 10), "index", "backward")
    assert other.calls[-1][-1] == "none"
