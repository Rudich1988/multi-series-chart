from datetime import date

from pydantic import BaseModel, ConfigDict

from .dto import ChartDataset
from .types import ChartType, SeriesKey


class SeriesSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    key: SeriesKey
    name: str
    chart_type: ChartType
    color: str
    decimals: int
    values: list[float | None]


class ROIThresholdSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    value: float
    above_color: str
    at_or_below_color: str


class ChartDataResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    dates: list[date]
    series: list[SeriesSchema]
    roi_threshold: ROIThresholdSchema

    @classmethod
    def from_dataset(cls, dataset: ChartDataset) -> "ChartDataResponse":
        return cls.model_validate(dataset)
