import logging

from django.http import HttpRequest, HttpResponse

from chart.exceptions import ChartDataUnavailableError, InvalidDatasetError

from .ninja_app import api

logger = logging.getLogger(__name__)


@api.exception_handler(ChartDataUnavailableError)
def handle_chart_data_unavailable(
    request: HttpRequest, exc: ChartDataUnavailableError
) -> HttpResponse:
    logger.exception(exc)
    return api.create_response(
        request,
        {
            "error": {
                "code": "CHART_DATA_UNAVAILABLE",
                "message": "Chart data could not be loaded.",
            }
        },
        status=503,
    )


@api.exception_handler(InvalidDatasetError)
def handle_invalid_dataset(
    request: HttpRequest, exc: InvalidDatasetError
) -> HttpResponse:
    logger.exception(exc)
    return api.create_response(
        request,
        {
            "error": {
                "code": "INVALID_DATASET",
                "message": "Chart data is misconfigured.",
            }
        },
        status=500,
    )
