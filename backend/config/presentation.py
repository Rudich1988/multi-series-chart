class PresentationConfig:
    ROI_THRESHOLD_ABOVE_COLOR = "#1B5E20"
    ROI_THRESHOLD_AT_OR_BELOW_COLOR = "#8BC34A"

    SERIES_METADATA = {
        "cost": {
            "name": "Cost",
            "chart_type": "area",
            "color": "#F5E1A4",
            "decimals": 2,
        },
        "cpa": {
            "name": "CPA",
            "chart_type": "bar",
            "color": "#5B8DEF",
            "decimals": 2,
        },
        "roi_confirmed": {
            "name": "ROI confirmed",
            "chart_type": "spline",
            "color": ROI_THRESHOLD_ABOVE_COLOR,
            "decimals": 2,
        },
        "conversions": {
            "name": "Conversions",
            "chart_type": "line",
            "color": "#B026C7",
            "decimals": 0,
        },
    }
