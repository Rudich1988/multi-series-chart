from enum import StrEnum
from typing import Literal

ChartType = Literal["area", "bar", "spline", "line"]


class SeriesKey(StrEnum):
    COST = "cost"
    CPA = "cpa"
    ROI_CONFIRMED = "roi_confirmed"
    CONVERSIONS = "conversions"
