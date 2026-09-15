from django.http import HttpRequest
from ninja import Router

from api.ninja_app import api
from config.settings import config

from .loader import load_chart_dataset
from .schemas import ChartDataResponse
from .service import get_chart_dataset

router = Router()

# Fail fast at import time: a malformed dataset file crashes `make up` immediately with a
# clear traceback, instead of surfacing as a confusing 500/503 on the first browser request.
load_chart_dataset(config.DATASET_PATH)


@router.get("/chart-data", response=ChartDataResponse)
def get_chart_data(request: HttpRequest) -> ChartDataResponse:
    return ChartDataResponse.from_dataset(get_chart_dataset())


api.add_router("", router)
