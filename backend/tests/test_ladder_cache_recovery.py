from datetime import date
from types import SimpleNamespace

import polars as pl
import pytest
from fastapi import HTTPException

from app.api.screener import limit_ladder
from app.services.screener import ScreenerService
from app.tickflow.repository import KlineRepository


def test_cold_enriched_refresh_loads_instruments_before_limit_signals(tmp_path, monkeypatch):
    repo = object.__new__(KlineRepository)
    repo.store = SimpleNamespace(data_dir=tmp_path)
    repo._instruments_cache = None
    repo._enriched_cache = None
    repo._enriched_glob = str(tmp_path / 'kline_daily_enriched/date=*/part.parquet')
    for day, price in [(date(2026, 10, 8), 10.0), (date(2026, 10, 9), 11.0)]:
        path = tmp_path / 'kline_daily_enriched' / f'date={day}' / 'part.parquet'
        path.parent.mkdir(parents=True)
        pl.DataFrame([dict(symbol='600000.SH', date=day, open=price, high=price, low=price,
                           close=price, raw_close=price, raw_high=price, raw_low=price,
                           volume=1000.0, amount=10000.0)]).write_parquet(path)
    def load_instruments():
        repo._instruments_cache = pl.DataFrame({'symbol': ['600000.SH'], 'name': ['测试']})
    monkeypatch.setattr(repo, '_refresh_instruments', load_instruments)
    monkeypatch.setattr(repo, 'get_matrix_data_generation', lambda _: 0)
    monkeypatch.setattr(repo, '_latest_enriched_date_duckdb', lambda: date(2026, 10, 9))
    monkeypatch.setattr(repo, 'get_historical_shares', lambda: pl.DataFrame())
    monkeypatch.setattr(repo, '_live_agg_baseline_date', lambda day: day)
    monkeypatch.setattr(repo, '_build_live_agg', lambda _: None)
    monkeypatch.setattr(repo, '_restore_missing_latest_rows', lambda day, today, history: today)
    repo._refresh_enriched_impl()
    assert 'signal_limit_up' in repo._enriched_cache.columns
    assert repo._enriched_cache['signal_limit_up'].to_list() == [True]
    assert repo._enriched_cache['consecutive_limit_ups'].to_list() == [1]


def test_ladder_rejects_incomplete_signal_cache(monkeypatch):
    monkeypatch.setattr(ScreenerService, '_load_enriched_for_date', lambda *args: pl.DataFrame({'symbol': ['600000.SH']}))
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(repo=object())))
    with pytest.raises(HTTPException) as error:
        limit_ladder(request, as_of=date(2026, 10, 9), direction='up', ext_columns=None)
    assert error.value.status_code == 503


@pytest.mark.parametrize('fake_symbol,expected_up', [('999999.SH', 1), ('600000.SH', 0), (None, 1)])
def test_ladder_only_subtracts_fake_boards_in_current_signal_set(monkeypatch, fake_symbol, expected_up):
    frame = pl.DataFrame({
        'symbol': ['600000.SH'], 'name': ['测试'], 'close': [11.0], 'change_pct': [0.1],
        'signal_limit_up': [True], 'signal_limit_down': [False],
        'consecutive_limit_ups': [1], 'consecutive_limit_downs': [0],
        'signal_broken_limit_up': [False], 'signal_limit_down_recovery': [False],
    })
    monkeypatch.setattr(ScreenerService, '_load_enriched_for_date', lambda *args: frame)
    monkeypatch.setattr(ScreenerService, 'load_prior_consecutive', lambda *args: pl.DataFrame())
    depth = SimpleNamespace(
        get_sealed_map=lambda *args, **kwargs: {fake_symbol: {'sealed': False, 'vol': 0}},
        is_sealed_ready=lambda _: True, get_sealed_age=lambda _: 0,
    )
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(repo=object(), depth_service=depth if fake_symbol else None)))
    result = limit_ladder(request, as_of=date(2026, 10, 9), direction='up', ext_columns=None)
    assert result['counts'] == {'up': expected_up, 'down': 0}
    assert result['tiers'][0]['stocks'][0]['status'] == ('broken' if expected_up == 0 else 'limit_up')
