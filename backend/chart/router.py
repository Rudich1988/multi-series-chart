from django.http import HttpRequest
from ninja import Router

from .schemas import ChartDataResponse
from .service import chart_service

router = Router()

# Fail fast at import time: a malformed dataset file crashes `make up` immediately with a
# clear traceback, instead of surfacing as a confusing 500/503 on the first browser request.
chart_service.get_chart_dataset()


@router.get("/chart-data", response=ChartDataResponse)
def get_chart_data(request: HttpRequest) -> ChartDataResponse:
    return ChartDataResponse.from_dataset(chart_service.get_chart_dataset())
