from datetime import date

from pydantic import BaseModel, model_validator

from .types import SeriesKey


class RawThreshold(BaseModel):
    value: float


class RawDatasetFile(BaseModel):
    dates: list[date]
    series: dict[SeriesKey, list[float | None]]
    roi_threshold: RawThreshold

    @model_validator(mode="after")
    def check_shape(self) -> "RawDatasetFile":
        if len(self.dates) != len(set(self.dates)):
            raise ValueError("dates must be unique")
        if self.dates != sorted(self.dates):
            raise ValueError("dates must be ascending")
        if set(self.series.keys()) != set(SeriesKey):
            expected = sorted(key.value for key in SeriesKey)
            raise ValueError(f"series must contain exactly these keys: {expected}")
        for key, values in self.series.items():
            if len(values) != len(self.dates):
                raise ValueError(
                    f"series '{key}' has {len(values)} values but expected "
                    f"{len(self.dates)} (to match dates)"
                )
        return self
