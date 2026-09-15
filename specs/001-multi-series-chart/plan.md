# Implementation Plan: Overlaid Multi-Series Performance Chart

**Branch**: `001-multi-series-chart` | **Date**: 2026-09-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-multi-series-chart/spec.md`

## Summary

Render 4 overlaid time series (Cost/area, CPA/bar, ROI confirmed/spline, Conversions/line) sharing
one date X axis, served by a single combined REST endpoint and rendered by a frontend that performs
no business logic. Backend: Python 3.12, Django + Django Ninja, layered (thin routers → Pydantic
boundary → dataclasses → service layer), Poetry-managed. Frontend: React + TypeScript + Vite +
Apache ECharts, chosen specifically because its axis-trigger tooltip and piecewise `visualMap`
natively provide the reference's shared multi-series tooltip/halo and the hard threshold
color-split on the ROI confirmed spline. Both halves run as independent Docker containers, started
together with `make up`.

## Technical Context

**Language/Version**: Python 3.12 (backend); TypeScript 5 / Node 20 LTS (frontend build tooling)

**Primary Dependencies**: Django 5.x + `django-ninja` 1.x + `pydantic` v2 + `pydantic-settings` 2.x
(backend); React 18 + Vite 5 + Apache ECharts (frontend)

**Storage**: No database used for feature data. Backend-side versioned JSON data files under
`backend/chart/data/` are the substitutable data source (research.md §3); Django is configured
with a minimal unused SQLite database purely to satisfy the framework's boot requirement.

**Testing**: `pytest` + `pytest-django` + Django Ninja `TestClient` (backend, run via Poetry/in
container); `vitest` + `@testing-library/react` (frontend, run via `node_modules`/in container)

**Target Platform**: Linux containers (Docker Compose), consumed via any modern desktop browser

**Project Type**: Web application (frontend + backend) → Option 2 structure

**Performance Goals**: Not a throughput-sensitive system (single evaluator, static dataset, one
GET request per page load). The one perceptual target that matters is hover responsiveness: tooltip
and halo show/hide must read as near-instantaneous (~100–150ms fade), per SC-002.

**Constraints**: Docker-only final verification (constitution Principle II); backend deps via
Poetry in-project venv only, frontend deps via local `node_modules` only, no global host installs;
frontend performs no business logic/computation (FR-002, FR-011); single `make up` command starts
the whole stack (FR-014); ROI threshold and per-series color/type/decimals metadata are
backend-owned, never hardcoded in the frontend; no secret/confidential value (e.g. Django's
`SECRET_KEY`) is ever hardcoded in source — such values are read by `BaseConfig` from a
git-ignored `.env` file (`backend/.env`, documented via a committed `backend/.env.example`), per
research.md §2.

**Scale/Scope**: 4 fixed named series, one chart page, daily granularity over roughly tens-to-low-
hundreds of data points (spec Assumptions), no authentication, no multi-tenancy, no live/streaming
updates.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Check | Status |
|---|---|---|
| I. Dockerized, One-Command Stack | `backend/Dockerfile` + `frontend/Dockerfile` independent, `docker-compose.yml` at root, `make up` starts both (research.md §10) | PASS |
| II. No Global Dependencies; Docker Is the Source of Truth | Backend via Poetry in-project venv only; frontend via local `node_modules` only; no host-level installs anywhere in the plan | PASS |
| III. Backend Is a REST API | Django Ninja REST endpoint (`GET /api/chart-data`, contracts/chart-api.md); frontend consumes only via this API | PASS |
| IV. Reference Fidelity Over Speed | ECharts selected specifically because its built-in axis-trigger tooltip and piecewise `visualMap` reproduce the reference's shared tooltip/halo and hard threshold color-split without approximation (research.md §6) | PASS |
| V. Reviewer-Grade Code Clarity | Thin routers, single-purpose service layer, dataclass/Pydantic boundary split, centralized exception handling, single Config source on both sides (research.md §2, §4, §5, §8) — all explicitly aimed at readability | PASS |

No violations identified. **Complexity Tracking is empty** (no gate failures to justify).

*Post-Phase-1 re-check*: Phase 1 design (data-model.md, contracts/chart-api.md, quickstart.md)
introduces no new dependencies, services, or indirection beyond what the table above already
covers — the dataclass/Pydantic split and the single combined endpoint are exactly what Principles
III and V called for. Gate re-confirmed: **PASS**, no violations, Complexity Tracking remains empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-multi-series-chart/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── chart-api.md      # Phase 1 output
└── tasks.md              # Phase 2 output (/speckit-tasks — not created by this command)
```

### Source Code (repository root)

```text
backend/
├── Dockerfile
├── pyproject.toml            # Poetry, virtualenvs.in-project = true
├── poetry.lock
├── manage.py
├── config/                   # single source for env-varying settings — plain classes, no pydantic
│   ├── __init__.py
│   ├── settings.py           # BaseConfig: plain class, reads .env via load_dotenv() once;
│   │                          # SECRET_KEY, DEBUG, ALLOWED_HOSTS, API_PREFIX, CORS_ALLOWED_ORIGINS,
│   │                          # DATASET_PATH, LOG_LEVEL — UPPER_CASE class attributes
│   └── presentation.py       # PresentationConfig: plain class, hardcoded series names/chart-types/
│                              # colors/decimals + ROI threshold colors — NOT .env-driven (never
│                              # reviewer-editable); config/ has zero imports from chart/
├── project/                  # Django project shell (framework-required)
│   ├── settings.py           # imports values FROM config.settings.config (BaseConfig instance),
│   │                          # not os.environ directly
│   ├── urls.py               # mounts api.urls; imports api.exceptions for its registration side effect
│   └── asgi.py
├── api/                      # shared HTTP composition root — NOT domain-specific; this is where a
│   │                          # second domain's router/exceptions would also get wired in, if one existed
│   ├── ninja_app.py          # the one NinjaAPI instance, shared across all domains
│   ├── exceptions.py         # imports each domain's exception classes (e.g. chart.exceptions),
│   │                          # registers @api.exception_handler(...) mapping each to an HTTP response —
│   │                          # the exception *class* is NOT defined here, only the HTTP-mapping wiring
│   └── routers.py            # imports each domain's router (e.g. chart.router.router) and calls
│                              # api.add_router(...) — symmetric with exceptions.py (research.md §11.1);
│                              # a domain's own router.py only defines its router, never registers itself
└── chart/                    # the "chart" domain — everything specific to it lives together, not
    │                          # spread across technical layers (routers/schemas/services/dto each own folder)
    ├── types.py               # SeriesKey enum, ChartType literal — framework-free vocabulary
    ├── presentation.py        # SERIES_METADATA + ROI_THRESHOLD_*_COLOR — fixed, reference-matched
    │                          # colors/types/decimals, NOT read from the dataset file (data-model.md);
    │                          # the ROI threshold colors specifically come from config.settings.config
    ├── dto.py                  # dataclasses: SeriesData, ChartDataset, ROIThresholdConfig — named
    │                          # dto.py, not models.py, to avoid Django's ORM-models connotation
    ├── dataset_schema.py       # Pydantic: RawDatasetFile — validates the raw dataset file's shape
    │                          # (research.md §12); one of two places chart/ imports pydantic (with schemas.py)
    ├── loader.py               # load_chart_dataset(path): read file -> validate via dataset_schema.py
    │                          # -> merge with presentation.py -> build dto.py objects. The other of
    │                          # the two files (with dataset_schema.py) that imports pydantic — kept
    │                          # out of service.py on purpose (research.md §12, §13.1)
    ├── exceptions.py           # ChartDataUnavailableError, InvalidDatasetError — plain Exception
    │                          # subclasses, no pydantic/ninja import, so loader.py/service.py can
    │                          # raise them without depending on api/
    ├── service.py              # ChartService class (singleton: chart_service = ChartService()):
    │                          # get_chart_dataset() delegates to loader.load_chart_dataset(path);
    │                          # no pydantic/ninja imports (research.md §13.1)
    ├── schemas.py               # Pydantic request/response schemas (boundary-only)
    ├── router.py                # GET /chart-data — thin: parse -> call service -> return; does NOT
    │                          # import api/ or register itself (api/routers.py does that, §11.1);
    │                          # calls chart_service.get_chart_dataset() once at import time so a
    │                          # malformed dataset file fails `make up` immediately instead of failing on first request
    ├── data/
    │   └── sample_dataset.json  # substitutable dataset — the file User Story 4 documents editing
    └── tests/
        ├── unit/                # service.py (ChartService), loader.py, dto.py
        ├── contract/            # router.py against contracts/chart-api.md
        └── integration/         # end-to-end request -> response

frontend/
├── Dockerfile
├── package.json              # deps resolved into local node_modules only
├── vite.config.ts
├── tsconfig.json
├── index.html
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── config/
│   │   └── index.ts           # single Config source, reads import.meta.env.VITE_*
│   ├── api/
│   │   └── chartApi.ts        # fetch(`${config.apiBaseUrl}/chart-data`) -> ChartDataResponseDto
│   ├── types/
│   │   └── chart.ts            # DTOs mirroring contracts/chart-api.md (data-model.md)
│   └── components/
│       └── MultiSeriesChart/
│           ├── MultiSeriesChart.tsx   # loading/error states + renders the ECharts instance
│           └── buildChartOption.ts    # ChartDataResponseDto -> ECharts `option` (series, tooltip, visualMap)
└── tests/
    ├── unit/                  # buildChartOption.ts (series types, visualMap pieces, tooltip config)
    └── integration/           # MultiSeriesChart loading/error/success states

docker-compose.yml             # wires backend + frontend services
Makefile                       # `make up`, `make down`, `make logs`
README.md                      # setup, data-substitution, and run instructions (FR-015)
```

**Structure Decision**: Option 2 (web application: separate `backend/` and `frontend/`), per the
constitution's independent-containers requirement and the user's explicit instruction. Backend is
organized **domain-first, not layer-first**: `chart/` is the one bounded context this project has,
and everything specific to it — types/enums, dataclasses, fixed presentation constants, the
exception class, the service, the Pydantic schemas, and the router — lives together inside
`chart/`, rather than being scattered across technical-layer folders (`routers/`, `schemas/`,
`services/`, `models/`) that would each mix multiple domains together if this project ever grew a
second one. Only what is genuinely cross-domain/global stays outside `chart/`: `api/` (the shared
`NinjaAPI` instance, the exception-handler *registration*, and the router *registration* —
symmetric, research.md §11.1 — both of which a second domain would also plug into), `config/` (the
single `Config` source), and `project/` (Django's own required
framework shell). Within `chart/`, the layering the user originally specified is still enforced —
`router.py` stays thin, `schemas.py` (HTTP) and `dataset_schema.py` (raw dataset file) are the only
two files that import Pydantic, and `service.py`/`dto.py`/`exceptions.py` know nothing about
Pydantic/HTTP (`loader.py` sits between them: it validates the file via `dataset_schema.py` so
`service.py` never has to — briefly merged into `ChartService` in research.md §13, reverted in
§13.1 per user feedback) — it's just that "layer" is
now the organizing principle *inside* a
domain folder, not *instead of* one. Frontend isolates all
environment-driven configuration in `src/config/` and keeps ECharts option-building
(`buildChartOption.ts`) separate from the React component shell, so the mapping-from-API-DTO-to-
chart-option logic is independently testable.

## Complexity Tracking

*No entries — Constitution Check reported no violations.*
