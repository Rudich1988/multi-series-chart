from config.settings import config

from .dto import ChartDataset
from .loader import load_chart_dataset


class ChartService:
    def get_chart_dataset(self) -> ChartDataset:
        return load_chart_dataset(config.DATASET_PATH)


chart_service = ChartService()
