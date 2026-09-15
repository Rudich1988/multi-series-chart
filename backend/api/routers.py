from chart.router import router as chart_router

from .ninja_app import api

api.add_router("", chart_router)
