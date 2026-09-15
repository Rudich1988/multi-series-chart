# Contract: Chart Data API

One combined REST endpoint (per the Q1 clarification), owned by `chart/router.py`, backed by
`chart/service.py`. This is the **only** endpoint the frontend calls to render the chart.

## `GET /api/chart-data`

Returns the full, date-aligned dataset for all 4 series plus the ROI confirmed threshold
configuration, in one response — no client-side merging/alignment required (FR-002).

### Request

No path/body parameters for this feature. No query parameters are required to view the default
dataset (the one currently active in the backend-side data source, per research.md #3).

| Query param | Type | Required | Notes |
|---|---|---|---|
| — | — | — | Reserved for future use (e.g., date-range filtering); out of scope for this feature |

### Response `200 OK`

`Content-Type: application/json`

```jsonc
{
  "dates": ["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"],
  "series": [
    {
      "key": "cost",
      "name": "Cost",
      "chart_type": "area",
      "color": "#F5E1A4",
      "decimals": 2,
      "values": [2.04, 25.85, 44.36, 55.65, 63.75]
    },
    {
      "key": "cpa",
      "name": "CPA",
      "chart_type": "bar",
      "color": "#5B8DEF",
      "decimals": 2,
      "values": [0.68, 0.86, 1.23, 0.79, 0.71]
    },
    {
      "key": "roi_confirmed",
      "name": "ROI confirmed",
      "chart_type": "spline",
      "color": "#1B5E20",
      "decimals": 2,
      "values": [610.78, 180.50, 161.47, 56.33, 357.25]
    },
    {
      "key": "conversions",
      "name": "Conversions",
      "chart_type": "line",
      "color": "#B026C7",
      "decimals": 0,
      "values": [3, 30, 36, 70, 90]
    }
  ],
  "roi_threshold": {
    "value": 150.0,
    "above_color": "#1B5E20",
    "at_or_below_color": "#8BC34A"
  }
}
```

### Field notes

- `dates`: ascending, unique, ISO `YYYY-MM-DD`. Every `series[i].values` array has exactly this
  many entries, in the same order (index `j` of `values` corresponds to `dates[j]`).
- `series`: always exactly 4 entries, one per `SeriesKey` (`cost`, `cpa`, `roi_confirmed`,
  `conversions`) — order is not significant; the frontend keys off `key`, not array position.
- `values[j]`: `null` when that series has no data for `dates[j]` (FR-012) — the frontend renders a
  gap/break in that series at that date (per the Q2 clarification) and shows "no data" in the
  tooltip row for that series at that date.
- `roi_threshold.value`: values in `roi_confirmed.values` strictly greater than this are rendered
  in `above_color`; values `<=` this are rendered in `at_or_below_color` (spec Edge Cases: exactly
  on the threshold counts as at/below).

### Response `503` (backend data source unavailable) or `500` (dataset misconfigured)

`Content-Type: application/json`, produced by a centralized `@api.exception_handler` (research.md
§5, §12), never by a router-level `try/except`. Two distinct causes, two distinct codes:

- `503` — `ChartDataUnavailableError`: the dataset file is missing/unreadable. Reserved for genuine
  runtime unavailability; in practice rare, since a malformed-or-missing file is meant to fail
  `make up` at startup (research.md §12) before any request can reach this path.
- `500` — `InvalidDatasetError`: the dataset file exists but fails validation (wrong shape, length
  mismatch, missing series). A server-side data problem, not the caller's fault.

```jsonc
{
  "error": {
    "code": "CHART_DATA_UNAVAILABLE",
    "message": "Chart data could not be loaded."
  }
}
```
```jsonc
{
  "error": {
    "code": "INVALID_DATASET",
    "message": "Chart data is misconfigured."
  }
}
```

Neither of these is a `4xx` — no client caused them. If a client-facing input path is ever added
(e.g. submitting a dataset via a form/POST — not part of this feature, see research.md §12), a
malformed *client* submission must map to `422 Unprocessable Entity`, which Django Ninja produces
automatically when a route's body is typed as `chart/dataset_schema.py`'s `RawDatasetFile` —
entirely separate from the two error paths above.

The frontend maps any non-2xx response (or a network failure) to the error/empty state required by
FR-013. A `200` is never returned for a failure case — the frontend does not need to inspect the
body to detect an error.

## Consumption contract (frontend side)

- On mount, the frontend requests `GET {config.apiBaseUrl}/api/chart-data` exactly once (no
  polling — this is a static evaluation dataset, not a live feed) and shows the loading indicator
  (FR-013a) until the promise settles.
- On success, the response is parsed directly into `ChartDataResponseDto` (see `data-model.md`)
  with no reshaping beyond typing — the frontend does not recompute `color`, `chart_type`,
  `decimals`, or `roi_threshold`.
- On failure (non-2xx or network error), the frontend shows the error state (FR-013) and does not
  render a partial chart.
