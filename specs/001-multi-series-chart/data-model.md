# Phase 1 Data Model: Overlaid Multi-Series Performance Chart

This model spans two representations per the layered architecture (research.md #4):
**backend dataclasses** (service layer, no Pydantic/HTTP knowledge) and the **HTTP contract shape**
they are converted to/from at the boundary (see `contracts/chart-api.md`). Both describe the same
four entities identified in `spec.md` § Key Entities.

## Entities

### SeriesKey (enum) — `backend/domain/types.py`

Canonical identifiers for the 4 fixed series. Fixed set — not user-extensible in this feature.
Lives in `domain/types.py`, not `domain/models.py`: this is framework-free vocabulary (an enum and
the `ChartType` literal alongside it), not a dataclass, so both the dataclass layer
(`domain/models.py`) and the future HTTP boundary (`api/schemas/chart.py`) import it from this one
neutral place — no duplicated definitions, and the dependency direction stays HTTP → domain, never
the reverse.

| Value | Display Name | Chart Type | Reference Color (approx.) |
|---|---|---|---|
| `cost` | Cost | area | pale yellow `#F5E1A4` |
| `cpa` | CPA | bar | blue `#5B8DEF` |
| `roi_confirmed` | ROI confirmed | spline | dark green `#1B5E20` / light green `#8BC34A` (threshold-split, see `ROIThresholdConfig`) |
| `conversions` | Conversions | line (straight segments + square markers) | magenta/purple `#B026C7` |

### Series (backend dataclass: `SeriesData`) — `backend/domain/models.py`

One metric's full time series.

| Field | Type | Notes |
|---|---|---|
| `key` | `SeriesKey` | Canonical id |
| `name` | `str` | Display name shown in tooltip rows |
| `chart_type` | `str` (`"area" \| "bar" \| "spline" \| "line"`) | Drives ECharts series type on the frontend |
| `color` | `str` (hex) | Single fixed color; for `roi_confirmed` this is the "above threshold" color — the "at/below" color is carried separately in `ROIThresholdConfig` |
| `decimals` | `int` | Display precision (2 for cost/cpa/roi_confirmed, 0 for conversions) — resolves the spec's number-formatting assumption without hardcoding it in the frontend |
| `values` | `list[float \| None]` | Same length and index-alignment as `ChartDataset.dates`; `None` = missing value for that date (FR-012) |

Validation rules:
- `len(values) == len(ChartDataset.dates)` for every series in a given `ChartDataset` (enforced by
  the service layer before returning; a violation is a service-layer bug, not a client input to
  validate).
- `key` is one of the 4 fixed `SeriesKey` values; exactly one `SeriesData` per key per response.

### DataPoint (conceptual, not a standalone transport object)

A `(date, value)` pair for one series. Represented positionally (`dates[i]` ↔ `series.values[i]`)
rather than as a repeated per-point object, per the Q1 clarification ("single combined endpoint,
pre-aligned by date") — this avoids re-sending the date once per series and keeps alignment
explicit and mechanical rather than something the frontend must compute (FR-002).

| Field | Type | Notes |
|---|---|---|
| `date` | `date` (ISO `YYYY-MM-DD` on the wire) | Shared across all 4 series |
| `value` | `float \| None` | `None` = no data for this series on this date |

### ChartDataset (backend dataclass)

The full payload for one chart load — the service layer's return type, and the shape the router
converts to the response schema.

| Field | Type | Notes |
|---|---|---|
| `dates` | `list[date]` | Ascending, unique; the shared X axis |
| `series` | `list[SeriesData]` | Exactly 4 entries, one per `SeriesKey`, all `values` aligned to `dates` |
| `roi_threshold` | `ROIThresholdConfig` | See below |

Validation rules:
- `dates` is strictly ascending with no duplicate dates (service-layer invariant; reasonable
  default per spec Assumptions — no gap-filling/resampling is implied).
- `series` contains exactly the 4 `SeriesKey` values, no more, no fewer.

### ROIThresholdConfig (backend dataclass)

Drives the hard color-split on the `roi_confirmed` spline (FR-010, FR-011). Backend-owned so the
frontend never hardcodes or computes the threshold (constitution: frontend only renders).

| Field | Type | Notes |
|---|---|---|
| `value` | `float` | The crossing threshold. Values `> value` → above-threshold color; values `<= value` → at/below-threshold color (spec Edge Cases: "at threshold" counts as at/below). |
| `above_color` | `str` (hex) | e.g. dark green |
| `at_or_below_color` | `str` (hex) | e.g. light green |

## State / Lifecycle

None of these entities have a lifecycle or state transitions — the chart is read-only, derived
fresh from the backend-side data source on each request (research.md #3). There is no create/
update/delete flow in this feature.

## HTTP Contract Shape (Pydantic schemas, boundary-only)

See `contracts/chart-api.md` for the full request/response contract. Summary of the mapping:

- `ChartDataset` (dataclass) ⇄ `ChartDataResponse` (Pydantic response schema)
- `SeriesData` (dataclass) ⇄ `SeriesSchema` (nested Pydantic schema)
- `ROIThresholdConfig` (dataclass) ⇄ `ROIThresholdSchema` (nested Pydantic schema)

The router (`routers/chart.py`) is the only place these two representations meet: it calls
`chart_service.get_chart_dataset() -> ChartDataset`, then constructs `ChartDataResponse.from_dataclass(...)`
(or an equivalent explicit mapping function) for serialization. The service layer never imports
`ninja` or `pydantic`.

## Frontend Types (TypeScript, mirrors the HTTP contract, not the backend dataclasses)

```ts
type SeriesKey = "cost" | "cpa" | "roi_confirmed" | "conversions";
type ChartType = "area" | "bar" | "spline" | "line";

interface SeriesDto {
  key: SeriesKey;
  name: string;
  chartType: ChartType;
  color: string;       // hex
  decimals: number;
  values: (number | null)[]; // aligned to ChartDataResponse.dates
}

interface RoiThresholdDto {
  value: number;
  aboveColor: string;      // hex
  atOrBelowColor: string;  // hex
}

interface ChartDataResponseDto {
  dates: string[]; // ISO YYYY-MM-DD, ascending
  series: SeriesDto[]; // exactly 4 entries
  roiThreshold: RoiThresholdDto;
}
```

These types live in `frontend/src/types/chart.ts` and are the only shape the chart component
consumes — the frontend does not redefine or recompute any of `name`, `chartType`, `color`,
`decimals`, or the threshold; it only maps this DTO onto ECharts `option` structure (research.md
#6–#8).
