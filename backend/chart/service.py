from config.settings import config

from .dto import ChartDataset
from .loader import load_chart_dataset


def get_chart_dataset() -> ChartDataset:
    return load_chart_dataset(config.DATASET_PATH)
