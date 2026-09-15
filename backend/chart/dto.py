from dataclasses import dataclass
from datetime import date

from chart.types import ChartType, SeriesKey


@dataclass(frozen=True)
class SeriesData:
    key: SeriesKey
    name: str
    chart_type: ChartType
    color: str
    decimals: int
    values: list[float | None]


@dataclass(frozen=True)
class ROIThresholdConfig:
    value: float
    above_color: str
    at_or_below_color: str


@dataclass(frozen=True)
class ChartDataset:
    dates: list[date]
    series: list[SeriesData]
    roi_threshold: ROIThresholdConfig
