"""Provider contracts for external market data sources.

The first implementation wraps TickFlow. Other providers (Tushare/AkShare/etc.)
should return the same normalized Polars schemas so storage, indicators and
backtests stay data-source agnostic.
"""
from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime
from typing import Literal, Protocol

import polars as pl

AssetType = Literal["stock", "index", "etf"]
PriceAdjustment = Literal["none", "forward", "backward"]


class ChartPriceProvider(Protocol):
    """可选看板协议；不改变 get_daily/get_minute 的原始价同步契约。

    必须直接请求上游指定口径，不得本地应用因子或静默改口径。
    不支持的资产/模式抛 NotImplementedError，取数失败抛异常，真实空数据返回空表。
    起止时间为北京时间墙钟、含两端；日线返回标准 date 列，分钟返回 datetime 列。
    OHLC 为请求口径，volume 为手，amount 为真实成交额（元），不得随复权缩放。
    """

    def get_chart_daily(
        self, symbol: str, start_time: datetime, end_time: datetime,
        asset_type: AssetType, adjust: PriceAdjustment,
    ) -> pl.DataFrame: ...

    def get_chart_minute(
        self, symbol: str, start_time: datetime, end_time: datetime,
        asset_type: AssetType, adjust: PriceAdjustment,
    ) -> pl.DataFrame: ...


@dataclass(frozen=True)
class ProviderCapabilities:
    instruments: bool = False
    daily: bool = False
    adj_factor: bool = False
    minute: bool = False
    realtime: bool = False
    depth5: bool = False
    financial: bool = False


class MarketDataProvider(Protocol):
    name: str
    capabilities: ProviderCapabilities

    def get_instruments(self, asset_type: AssetType) -> pl.DataFrame:
        """Return normalized instruments: symbol/name/code/exchange/asset_type/source."""

    def get_daily(
        self,
        symbols: list[str],
        start_time: datetime | None,
        end_time: datetime | None,
        asset_type: AssetType,
    ) -> pl.DataFrame:
        """Return normalized daily K rows."""

    def get_adj_factors(
        self,
        symbols: list[str],
        start_time: datetime | None,
        end_time: datetime | None,
        asset_type: AssetType,
    ) -> pl.DataFrame:
        """Return normalized adjustment factors: symbol/trade_date/ex_factor."""

    def get_minute(
        self,
        symbols: list[str],
        start_time: datetime | None,
        end_time: datetime | None,
        asset_type: AssetType,
        freq: str = "1m",
        on_chunk_done: Callable[[int, int], None] | None = None,
    ) -> pl.DataFrame:
        """Return normalized minute K rows. Implementations may return empty.

        on_chunk_done 契约: provider 实现内部以 2 参 (cur, total) 调用;
        3 参 seg_label 适配由 kline_sync._try_custom_minute 包装层负责,
        不应泄漏到 provider 契约层。
        """

    def get_realtime(
        self,
        universes: list[str] | None = None,
        symbols: list[str] | None = None,
    ) -> pl.DataFrame:
        """Return normalized realtime quotes. Implementations may return empty."""

    def get_depth_batch(self, symbols: list[str]) -> dict[str, dict]:
        """Return five-level order books keyed by symbol."""
