from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.financials import router
from app.data_providers import custom
from app.plugins.fuyao.provider import FuyaoProvider
from app.services import preferences


@pytest.mark.parametrize("code", [3002, "3002"])
def test_fuyao_no_adjustment_events_returns_empty_through_api(monkeypatch, code):
    from app.plugins.fuyao.client import FuyaoClient

    upstream = FuyaoClient("test")
    upstream._http.close()
    upstream._http = httpx.Client(
        base_url="https://example.test",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={
            "code": code, "message": "No adjustment events for thscode=001246.SZ", "data": None,
        })),
    )
    provider = FuyaoProvider()
    monkeypatch.setattr(provider, "_get_client", lambda: upstream)
    monkeypatch.setattr(preferences, "get_dividend_provider", lambda: "fuyao")
    monkeypatch.setattr(custom, "provider_has_dataset", lambda *args: True)
    monkeypatch.setattr(custom, "get_provider", lambda name: provider)
    app = FastAPI()
    app.include_router(router)
    try:
        result = TestClient(app).get("/api/financials/dividends?symbol=001246.SZ")
        assert result.status_code == 200
        assert result.json() == {"provider": "fuyao", "data": []}
    finally:
        upstream.close()


@pytest.mark.parametrize("code,message", [
    (3002, "Unknown symbol"),
    (3002, "No adjustment events for thscode=600000.SH"),
    (4001, "No adjustment events for thscode=001246.SZ"),
    (1001, "Invalid API key"),
])
def test_fuyao_other_errors_are_not_empty_dividends(code, message):
    from app.plugins.fuyao.client import FuyaoClient, FuyaoError

    client = FuyaoClient("test")
    client._http.close()
    client._http = httpx.Client(
        base_url="https://example.test",
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json={
            "code": code, "message": message, "data": None,
        })),
    )
    try:
        with pytest.raises(FuyaoError):
            client.dividend_events("001246.SZ")
    finally:
        client.close()


def test_dividend_default_and_matrix(monkeypatch):
    from app.data_providers.capabilities import build_capability_matrix

    monkeypatch.setattr(preferences, "load", lambda: {})
    assert preferences.get_dividend_provider() == "fuyao"
    monkeypatch.setattr(preferences, "load", lambda: {"dividend_data_provider": "tickflow"})
    assert preferences.get_dividend_provider() == "fuyao"
    monkeypatch.setattr(custom, "list_sources", lambda: [])
    for ready in (True, False):
        monkeypatch.setattr(custom, "list_plugins", lambda ready=ready: [{
            "name": "fuyao", "datasets": ["dividends"], "available": ready,
            "status": "ok" if ready else "未配置 Key",
        }])
        cap = next(c for c in build_capability_matrix({}, "expert")["capabilities"]
                   if c["id"] == "dividends")
        assert cap["usable"] is ready
        assert cap["tf_available"] is False
        assert cap["effective"] == "fuyao"
        assert len(cap["candidates"] if ready else cap["pending"]) == 1


def test_dividend_client_rejects_missing_list(monkeypatch):
    from app.plugins.fuyao.client import FuyaoClient, FuyaoError

    client = FuyaoClient("test")
    try:
        monkeypatch.setattr(client, "_get", lambda *args: {})
        with pytest.raises(FuyaoError):
            client.dividend_events("601919.SH")
        monkeypatch.setattr(client, "_get", lambda *args: {"item": []})
        assert client.dividend_events("601919.SH") == []
    finally:
        client.close()


def test_fuyao_dividends_normalization(monkeypatch):
    provider = FuyaoProvider()
    client = SimpleNamespace(dividend_events=lambda symbol: [
        {"ex_date_ms": 1779724800000, "dividend_per_share": 1, "per_share_bonus": 0.4},
        {"ex_date_ms": 1761580800000, "dividend_per_share": 1, "per_share_bonus": 0},
    ])
    monkeypatch.setattr(provider, "_get_client", lambda: client)
    rows = provider.get_dividends("300533.SZ")
    assert rows[0] == {"symbol": "300533.SZ", "ex_date": "2026-05-26",
                       "cash_per_share": 1.0, "bonus_per_share": 0.4, "currency": "CNY"}
    assert rows[1]["ex_date"] == "2025-10-28"


@pytest.mark.parametrize("bad", [None, float("nan"), -1])
def test_fuyao_missing_or_invalid_cash_fails(monkeypatch, bad):
    provider = FuyaoProvider()
    monkeypatch.setattr(provider, "_get_client", lambda: SimpleNamespace(
        dividend_events=lambda symbol: [{"ex_date_ms": 1779724800000,
                                        "dividend_per_share": bad, "per_share_bonus": 0}]))
    with pytest.raises((ValueError, TypeError)):
        provider.get_dividends("300533.SZ")


def test_dividend_route_independent_of_financial_capability(monkeypatch):
    monkeypatch.setattr(preferences, "get_dividend_provider", lambda: "example")
    monkeypatch.setattr(custom, "provider_has_dataset", lambda name, ds: ds == "dividends")
    monkeypatch.setattr(custom, "get_provider", lambda name: SimpleNamespace(get_dividends=lambda s: []))
    app = FastAPI()
    app.include_router(router)
    client = TestClient(app)
    result = client.get("/api/financials/dividends?symbol=601919.SH")
    assert result.status_code == 200
    assert result.json() == {"provider": "example", "data": []}
    assert client.get("/api/financials/dividends?symbol=../x").status_code == 422
    monkeypatch.setattr(custom, "provider_has_dataset", lambda *args: False)
    assert client.get("/api/financials/dividends?symbol=601919.SH").status_code == 503


def test_dividend_upstream_failure_not_empty_success(monkeypatch):
    monkeypatch.setattr(preferences, "get_dividend_provider", lambda: "example")
    monkeypatch.setattr(custom, "provider_has_dataset", lambda *args: True)
    def fail(symbol):
        raise RuntimeError("upstream failed")
    monkeypatch.setattr(custom, "get_provider", lambda name: SimpleNamespace(get_dividends=fail))
    app = FastAPI()
    app.include_router(router)
    assert TestClient(app).get("/api/financials/dividends?symbol=601919.SH").status_code == 502


def test_dividend_service_sorts_and_uses_current_route(monkeypatch):
    from app.services.dividends import get_dividends

    selected = {"name": "first"}
    monkeypatch.setattr(preferences, "get_dividend_provider", lambda: selected["name"])
    monkeypatch.setattr(custom, "provider_has_dataset", lambda *args: True)
    calls = []

    def provider(name):
        def fetch(symbol):
            calls.append((name, symbol))
            return [{"symbol": symbol, "ex_date": day, "cash_per_share": 0.44,
                     "bonus_per_share": 0, "currency": "CNY"}
                    for day in ("2025-10-24", "2026-06-26")]
        return SimpleNamespace(get_dividends=fetch)

    monkeypatch.setattr(custom, "get_provider", provider)
    result = get_dividends("601919.SH")
    assert result["data"][0]["ex_date"] == "2026-06-26"
    assert result["data"][0]["cash_per_share"] == 0.44
    selected["name"] = "second"
    assert get_dividends("300533.SZ")["provider"] == "second"
    assert calls == [("first", "601919.SH"), ("second", "300533.SZ")]


def test_dividend_service_rejects_wrong_symbol(monkeypatch):
    from app.services.dividends import get_dividends

    monkeypatch.setattr(preferences, "get_dividend_provider", lambda: "example")
    monkeypatch.setattr(custom, "provider_has_dataset", lambda *args: True)
    monkeypatch.setattr(custom, "get_provider", lambda name: SimpleNamespace(
        get_dividends=lambda symbol: [{"symbol": "300533.SZ", "ex_date": "2026-05-26",
                                     "cash_per_share": 1, "bonus_per_share": 0.4, "currency": "CNY"}]))
    with pytest.raises(ValueError, match="标的不一致"):
        get_dividends("601919.SH")
