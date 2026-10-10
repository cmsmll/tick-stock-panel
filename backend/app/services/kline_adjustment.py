"""看板行情：直接使用数据源指定口径的 OHLC，仅在本地计算技术指标。"""
from collections import OrderedDict
from datetime import date, datetime, time, timedelta
from threading import Lock
from time import monotonic

import polars as pl

from app.data_providers import custom as custom_sources
from app.data_providers.registry import get_provider
from app.indicators.pipeline import compute_indicators
from app.services import preferences

CHART_INDICATORS = {
    "ma5", "ma10", "ma20", "ma60", "macd_dif", "macd_dea", "macd_hist",
    "rsi_6", "rsi_14", "rsi_24", "kdj_k", "kdj_d", "kdj_j",
    "boll_upper", "boll_lower", "boll_mid", "change_pct",
    "vol_ma5", "vol_ma10", "vol_ratio_5d",
}
# 短 TTL 避免重复图表请求；历史前复权也会随新除权事件变化，不能永久缓存。
_cache: OrderedDict = OrderedDict()
_lock = Lock()


def _resolve_provider(dataset):
    name = (preferences.get_daily_data_provider() if dataset == "daily"
            else preferences.get_minute_data_provider())
    if name == "tickflow":
        return name, get_provider(name)
    if not custom_sources.provider_has_dataset(name, dataset):
        raise NotImplementedError("当前数据源不支持该行情，请检查数据源配置")
    return name, custom_sources.get_provider(name)


def _fetch(name, provider, dataset, symbol, start, end, asset_type, adjust):
    if adjust not in {"none", "forward", "backward"}:
        raise ValueError("不支持的复权方式")
    method = getattr(provider, f"get_chart_{dataset}", None)
    if not callable(method):
        raise NotImplementedError("当前数据源不支持直接获取所选口径的行情")
    key = (name, dataset, symbol, start, end, asset_type, adjust)
    with _lock:
        cached = _cache.get(key)
        if cached and monotonic() - cached[0] < 10:
            return cached[1].clone()
    # 网络请求不持有缓存锁；失败不缓存，也不跨源回退。
    df = method(symbol, datetime.combine(start, time.min), datetime.combine(end, time.max),
                asset_type, "none" if asset_type == "index" else adjust)
    if not isinstance(df, pl.DataFrame):
        raise ValueError("数据源返回了无效行情")
    if not df.is_empty():
        time_col = "date" if dataset == "daily" else "datetime"
        required = {"symbol", time_col, "open", "high", "low", "close", "volume"}
        if not required.issubset(df.columns):
            raise ValueError("数据源行情字段不完整")
        day = pl.col(time_col) if dataset == "daily" else pl.col(time_col).dt.date()
        df = df.filter((pl.col("symbol") == symbol) & day.is_between(start, end))
        df = df.unique(subset=["symbol", time_col], keep="last").sort(time_col)
        if df.filter(pl.col("close").is_null() | ~pl.col("close").is_finite()).height:
            raise ValueError("数据源行情价格无效")
    with _lock:
        _cache[key] = (monotonic(), df.clone())
        _cache.move_to_end(key)
        while len(_cache) > 64:
            _cache.popitem(last=False)
    return df


def daily_rows(symbol: str, start: date, end: date, asset_type: str, adjust: str):
    name, provider = _resolve_provider("daily")
    df = _fetch(name, provider, "daily", symbol, start - timedelta(days=365), end, asset_type, adjust)
    if df.is_empty():
        return [], name
    df = compute_indicators(df, needed=CHART_INDICATORS)
    return df.filter(pl.col("date").is_between(start, end)).to_dicts(), name


def minute_rows(symbol: str, day: date, asset_type: str, adjust: str):
    name, provider = _resolve_provider("minute")
    df = _fetch(name, provider, "minute", symbol, day, day, asset_type, adjust)
    prev_close = None
    daily_summary = None
    # 昨收也必须来自分钟行情同一数据源、同一复权口径；缺失则不画昨收基线。
    if not df.is_empty() and callable(getattr(provider, "get_chart_daily", None)):
        daily = _fetch(name, provider, "daily", symbol, day - timedelta(days=30),
                       day, asset_type, adjust)
        if not daily.is_empty():
            previous = daily.filter(pl.col("date") < day)
            current = daily.filter(pl.col("date") == day)
            if not previous.is_empty():
                prev_close = previous["close"][-1]
            if not current.is_empty():
                daily_summary = current.to_dicts()[-1]
    return {"rows": df.to_dicts(), "prev_close": prev_close,
            "provider": name, "source": "live" if not df.is_empty() else "none",
            "date": day, "asset_type": asset_type, "adjust": adjust, "price_limit": None,
            "daily_summary": daily_summary}
