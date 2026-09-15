# Phase 1 Data Model: Overlaid Multi-Series Performance Chart

This model spans two representations per the layered architecture (research.md #4):
**backend dataclasses** (service layer, no Pydantic/HTTP knowledge) and the **HTTP contract shape**
they are converted to/from at the boundary (see `contracts/chart-api.md`). Both describe the same
four entities identified in `spec.md` § Key Entities.

## Entities

### SeriesKey (enum) — `backend/chart/types.py`

Canonical identifiers for the 4 fixed series. Fixed set — not user-extensible in this feature.
Lives in `chart/types.py`, not `chart/dto.py`: this is framework-free vocabulary (an enum and
the `ChartType` literal alongside it), not a dataclass, so both the dataclass layer
(`chart/dto.py`) and the HTTP boundary (`chart/schemas.py`) import it from this one neutral
place within the domain — no duplicated definitions, and the dependency direction stays
schemas → types, never the reverse. (`types.py`/`dto.py`/`presentation.py`/`dataset_schema.py`/
`loader.py`/`exceptions.py`/`service.py`/`schemas.py`/`router.py` all live together inside
`chart/` — the project's one domain folder — per research.md §11; only the shared `NinjaAPI`
instance and its exception-handler registration live outside it, in `api/`. `dto.py` — not
`models.py` — because in Django, `models.py` conventionally means ORM models, and these are plain
dataclasses.)

| Value | Display Name | Chart Type | Reference Color (approx.) |
|---|---|---|---|
| `cost` | Cost | area | pale yellow `#F5E1A4` |
| `cpa` | CPA | bar | blue `#5B8DEF` |
| `roi_confirmed` | ROI confirmed | spline | dark green `#1B5E20` / light green `#8BC34A` (threshold-split, see `ROIThresholdConfig`) |
| `conversions` | Conversions | line (straight segments + square markers) | magenta/purple `#B026C7` |

### Series (backend dataclass: `SeriesData`) — `backend/chart/dto.py`

One metric's full time series.

| Field | Type | Notes |
|---|---|---|
| `key` | `SeriesKey` | Canonical id |
| `name` | `str` | Display name shown in tooltip rows |
| `chart_type` | `str` (`"area" \| "bar" \| "spline" \| "line"`) | Drives ECharts series type on the frontend |
| `color` | `str` (hex) | Single fixed color; for `roi_confirmed` this is the "above threshold" color — the "at/below" color is carried separately in `ROIThresholdConfig` |
| `decimals` | `int` | Display precision (2 for cost/cpa/roi_confirmed, 0 for conversions) — resolves the spec's number-formatting assumption without hardcoding it in the frontend |
| `values` | `list[float \| None]` | Same length and index-alignment as `ChartDataset.dates`; `None` = missing value for that date (FR-012) |

**Fixed Series Presentation**: `name`, `chart_type`, `color`, and `decimals` are **not** read from
the substitutable dataset file — they come from a fixed constant table, `PresentationConfig` in
**`backend/config/presentation.py`** (a plain Python class, string-keyed by series — `"cost"`,
`"cpa"`, ... — no `pydantic`, no `.env`), matching the reference exactly. `backend/chart/
presentation.py` builds the domain-typed `SERIES_METADATA: dict[SeriesKey, SeriesMetadata]` from
it. Only `values` (per series), the shared `dates`, and `roi_threshold.value` are reviewer-editable
data (see `research.md` §3). This guarantees a reviewer substituting their own 4 datasets cannot
accidentally change the chart's colors/types and break reference-fidelity (constitution Principle
IV) — and the service needs no per-request "if this key then this color" branching, just a dict
lookup. The two `ROIThresholdConfig` colors (`ROI_THRESHOLD_ABOVE_COLOR`/
`ROI_THRESHOLD_AT_OR_BELOW_COLOR`) are fixed the same way, also on `PresentationConfig`; only the
threshold's numeric `value` is reviewer-editable.

All of `PresentationConfig` — the ROI threshold colors included — is a hardcoded class constant,
not `.env`-driven: none of it should ever be reviewer-editable, not even via an optional override
(an earlier draft made the ROI colors `Config`-overridable; reverted per user feedback). This is
separate from `backend/config/settings.py`'s `BaseConfig`, which holds the genuinely
environment-varying settings (`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`,
`API_PREFIX`, `DATASET_PATH`, `LOG_LEVEL`) — see `research.md` §2.

**Validating the file before any of this runs**: the raw file is checked against
`chart/dataset_schema.py`'s `RawDatasetFile` (Pydantic — dates ascending/unique, exactly the 4
`SeriesKey`s present, every values-array length matching `dates`) by `chart/loader.py` before it's
merged with `SERIES_METADATA` into a `ChartDataset`. A malformed file raises `InvalidDatasetError`;
a missing/unreadable one raises `ChartDataUnavailableError` — see `research.md` §12.

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

The router (`chart/router.py`) is the only place these two representations meet: it calls
`chart/service.py`'s `get_chart_dataset() -> ChartDataset`, then constructs
`ChartDataResponse.from_dataclass(...)` (or an equivalent explicit mapping function) for
serialization. The service layer never imports `ninja` or `pydantic`.

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
