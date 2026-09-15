def test_chart_data_endpoint_returns_expected_shape(client):
    response = client.get("/api/chart-data")

    assert response.status_code == 200
    body = response.json()

    assert set(body.keys()) == {"dates", "series", "roi_threshold"}
    assert body["dates"] == sorted(body["dates"])
    assert len(body["dates"]) == len(set(body["dates"]))

    series_keys = {series["key"] for series in body["series"]}
    assert series_keys == {"cost", "cpa", "roi_confirmed", "conversions"}

    for series in body["series"]:
        assert set(series.keys()) == {
            "key",
            "name",
            "chart_type",
            "color",
            "decimals",
            "values",
        }
        assert len(series["values"]) == len(body["dates"])
        for value in series["values"]:
            assert value is None or isinstance(value, int | float)

    threshold = body["roi_threshold"]
    assert set(threshold.keys()) == {"value", "above_color", "at_or_below_color"}
    assert isinstance(threshold["value"], int | float)
