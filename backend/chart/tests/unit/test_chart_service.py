from datetime import date

from chart.service import chart_service
from chart.types import SeriesKey


def test_get_chart_dataset_returns_valid_dataset():
    dataset = chart_service.get_chart_dataset()

    assert dataset.dates == sorted(dataset.dates)
    assert len(dataset.dates) == len(set(dataset.dates))
    assert all(isinstance(single_date, date) for single_date in dataset.dates)

    series_keys = {series.key for series in dataset.series}
    assert series_keys == set(SeriesKey)

    for series in dataset.series:
        assert len(series.values) == len(dataset.dates)
