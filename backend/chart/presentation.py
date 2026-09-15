from dataclasses import dataclass

from config.presentation import PresentationConfig

from .types import ChartType, SeriesKey


@dataclass(frozen=True)
class SeriesMetadata:
    name: str
    chart_type: ChartType
    color: str
    decimals: int


SERIES_METADATA: dict[SeriesKey, SeriesMetadata] = {
    SeriesKey(key): SeriesMetadata(**meta)
    for key, meta in PresentationConfig.SERIES_METADATA.items()
}

ROI_THRESHOLD_ABOVE_COLOR = PresentationConfig.ROI_THRESHOLD_ABOVE_COLOR
ROI_THRESHOLD_AT_OR_BELOW_COLOR = PresentationConfig.ROI_THRESHOLD_AT_OR_BELOW_COLOR
