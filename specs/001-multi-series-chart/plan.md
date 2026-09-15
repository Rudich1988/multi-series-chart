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
`backend/data/` are the substitutable data source (research.md §3); Django is configured with a
minimal unused SQLite database purely to satisfy the framework's boot requirement.

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
`SECRET_KEY`) is ever hardcoded in source — such values are read by the `Config` class from a
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
├── config/                   # single Config source (pydantic-settings BaseSettings)
│   ├── __init__.py
│   └── settings.py           # e.g. Config(BaseSettings): api_base_prefix, data_dir, cors_origins...
├── project/                  # Django project shell (framework-required)
│   ├── settings.py           # imports values FROM config.settings.Config, not os.environ
│   ├── urls.py
│   └── asgi.py
├── api/                      # HTTP boundary
│   ├── ninja_app.py          # NinjaAPI instance + router registration + exception handlers wired here
│   ├── routers/
│   │   └── chart.py          # GET /chart-data — thin: parse -> call service -> return
│   ├── schemas/
│   │   └── chart.py          # Pydantic request/response schemas (boundary-only)
│   └── exceptions.py         # domain exception -> HTTP response mapping (@api.exception_handler)
├── domain/
│   └── models.py             # dataclasses: SeriesData, ChartDataset, ROIThresholdConfig
├── services/
│   └── chart_service.py      # business logic: load data source, build ChartDataset; no pydantic/ninja imports
├── data/
│   └── sample_dataset.json   # substitutable dataset — the file User Story 4 documents editing
└── tests/
    ├── unit/                 # services/, domain/
    ├── contract/             # api/routers/ against contracts/chart-api.md
    └── integration/          # end-to-end request -> response

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
constitution's independent-containers requirement and the user's explicit instruction. Backend
follows the layered/DDD split requested (`api/` boundary → `domain/` dataclasses → `services/`
business logic, with `config/` isolated from Django's own required `project/settings.py`).
Frontend isolates all environment-driven configuration in `src/config/` and keeps ECharts
option-building (`buildChartOption.ts`) separate from the React component shell, so the
mapping-from-API-DTO-to-chart-option logic is independently testable.

## Complexity Tracking

*No entries — Constitution Check reported no violations.*
