import json

import pytest

from chart.exceptions import ChartDataUnavailableError, InvalidDatasetError
from chart.loader import load_chart_dataset
from chart.presentation import SERIES_METADATA


def _write_dataset(path, data):
    path.write_text(json.dumps(data))


def test_load_chart_dataset_merges_valid_file_with_presentation(tmp_path):
    raw_values = {
        "cost": [1.0, 2.0],
        "cpa": [0.5, 0.6],
        "roi_confirmed": [100.0, 200.0],
        "conversions": [1, 2],
    }
    path = tmp_path / "dataset.json"
    _write_dataset(
        path,
        {
            "dates": ["2026-01-01", "2026-01-02"],
            "series": raw_values,
            "roi_threshold": {"value": 150.0},
        },
    )

    dataset = load_chart_dataset(path)

    assert len(dataset.dates) == 2
    assert dataset.roi_threshold.value == 150.0
    for series in dataset.series:
        meta = SERIES_METADATA[series.key]
        assert series.name == meta.name
        assert series.chart_type == meta.chart_type
        assert series.color == meta.color
        assert series.decimals == meta.decimals
        assert series.values == raw_values[series.key]


def test_load_chart_dataset_raises_invalid_dataset_on_length_mismatch(tmp_path):
    path = tmp_path / "dataset.json"
    _write_dataset(
        path,
        {
            "dates": ["2026-01-01", "2026-01-02"],
            "series": {
                "cost": [1.0],
                "cpa": [0.5, 0.6],
                "roi_confirmed": [100.0, 200.0],
                "conversions": [1, 2],
            },
            "roi_threshold": {"value": 150.0},
        },
    )

    with pytest.raises(InvalidDatasetError):
        load_chart_dataset(path)


def test_load_chart_dataset_raises_invalid_dataset_on_missing_series_key(tmp_path):
    path = tmp_path / "dataset.json"
    _write_dataset(
        path,
        {
            "dates": ["2026-01-01"],
            "series": {
                "cost": [1.0],
                "cpa": [0.5],
                "roi_confirmed": [100.0],
            },
            "roi_threshold": {"value": 150.0},
        },
    )

    with pytest.raises(InvalidDatasetError):
        load_chart_dataset(path)


def test_load_chart_dataset_raises_unavailable_on_missing_file(tmp_path):
    missing_path = tmp_path / "does_not_exist.json"

    with pytest.raises(ChartDataUnavailableError):
        load_chart_dataset(missing_path)
