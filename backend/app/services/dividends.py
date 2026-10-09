"""按独立能力路由读取分红历史；不跨源降级，不把失败当成无分红。"""
from app.data_providers import custom
from app.data_providers.dividends import DividendRecord
from app.services import preferences


class DividendUnavailableError(ValueError):
    pass


def get_dividends(symbol: str) -> dict:
    provider_name = preferences.get_dividend_provider()
    if not custom.provider_has_dataset(provider_name, "dividends"):
        raise DividendUnavailableError("分红派息数据源不可用，请前往数据源配置")
    provider = custom.get_provider(provider_name)
    fetch = getattr(provider, "get_dividends", None)
    if not callable(fetch):
        raise DividendUnavailableError("当前数据源尚未实现分红派息查询")
    records = [DividendRecord.model_validate(row) for row in fetch(symbol)]
    if any(row.symbol != symbol for row in records):
        raise ValueError("分红数据标的不一致")
    records.sort(key=lambda row: row.ex_date, reverse=True)
    return {"provider": provider_name, "data": [row.model_dump(mode="json") for row in records]}
