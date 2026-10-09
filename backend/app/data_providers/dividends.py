"""分红派息标准记录：每股金额为税前原币，送转为每股比例。"""
from datetime import date

from pydantic import BaseModel, Field


class DividendRecord(BaseModel):
    symbol: str
    ex_date: date
    cash_per_share: float = Field(ge=0, allow_inf_nan=False)
    bonus_per_share: float = Field(ge=0, allow_inf_nan=False)
    currency: str
