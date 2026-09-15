from pathlib import Path

from pydantic import ValidationError

from .dataset_schema import RawDatasetFile
from .dto import ChartDataset, ROIThresholdConfig, SeriesData
from .exceptions import ChartDataUnavailableError, InvalidDatasetError
from .presentation import (
    ROI_THRESHOLD_ABOVE_COLOR,
    ROI_THRESHOLD_AT_OR_BELOW_COLOR,
    SERIES_METADATA,
)


def load_chart_dataset(path: Path) -> ChartDataset:
    try:
        raw_text = path.read_text()
    except OSError as exc:
        raise ChartDataUnavailableError(
            f"could not read dataset file {path}: {exc}"
        ) from exc

    try:
        raw = RawDatasetFile.model_validate_json(raw_text)
    except ValidationError as exc:
        raise InvalidDatasetError(f"{path} failed validation: {exc}") from exc

    series = [
        SeriesData(
            key=key,
            name=meta.name,
            chart_type=meta.chart_type,
            color=meta.color,
            decimals=meta.decimals,
            values=raw.series[key],
        )
        for key, meta in SERIES_METADATA.items()
    ]

    return ChartDataset(
        dates=raw.dates,
        series=series,
        roi_threshold=ROIThresholdConfig(
            value=raw.roi_threshold.value,
            above_color=ROI_THRESHOLD_ABOVE_COLOR,
            at_or_below_color=ROI_THRESHOLD_AT_OR_BELOW_COLOR,
        ),
    )
