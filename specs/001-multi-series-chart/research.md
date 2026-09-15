# Phase 0 Research: Overlaid Multi-Series Performance Chart

All technology choices below were dictated directly by the user's planning input and the
ratified constitution; this phase documents the concrete versions/libraries and the patterns used
to satisfy the spec's functional requirements with them, so Phase 1 design has no open unknowns.

## 1. Backend framework & versions

- **Decision**: Python 3.12, Django 5.x, `django-ninja` 1.x (Pydantic v2-based), `pydantic-settings`
  2.x, managed entirely through Poetry with `virtualenvs.in-project true`.
- **Rationale**: Django Ninja was specified by the user. Its 1.x line targets Pydantic v2, so
  Django 5.x (current LTS-adjacent stable at time of writing) is the compatible, actively
  maintained pairing. Python 3.12 is the current stable CPython series with full library support.
- **Alternatives considered**: FastAPI (rejected — user explicitly specified Django Ninja);
  Django REST Framework (rejected — heavier, serializer-centric, works against the
  Pydantic-at-the-boundary / dataclass-in-the-middle flow the user mandated).

## 2. Reconciling "no `os.environ()` in code" with Django's settings module

- **Decision**: A single `pydantic-settings` `BaseSettings` class lives in `backend/config/`. It is
  the only place environment variables are read. Django's own `settings.py` (required by the
  framework) imports values **from** this `Config` instance rather than reading `os.environ`
  itself — Django's settings module becomes a thin adapter, not a second source of configuration
  truth.
- **Rationale**: Satisfies the "single Config class, no magic env access scattered in code"
  constraint while still giving Django the settings module it requires to boot.
- **Alternatives considered**: `django-environ` (rejected — user explicitly asked for a
  `pydantic-settings` `BaseSettings` class); reading `os.environ` directly in Django `settings.py`
  (rejected — violates the stated constraint).

## 3. Data storage for the 4 datasets

- **Decision**: The 4 datasets (Cost, CPA, ROI confirmed, Conversions) plus the ROI threshold
  configuration are stored as versioned, human-editable data files (JSON) under a dedicated
  `backend/data/` directory, loaded by the service layer at request time (or process start).
  Django is configured with a minimal SQLite database only to satisfy the framework's boot
  requirement (`DATABASES` setting) — no application data is persisted there, and no
  models/migrations are needed for this feature.
- **Rationale**: Spec Assumption (User Story 4) and its clarification say "substituting datasets"
  means editing a documented backend-side data source — this is the simplest, most
  reviewer-legible mechanism (`git diff`-able JSON, no DB setup/migration step required to satisfy
  SC-004's "under 10 minutes" bar) and keeps the business logic (reading + shaping this data) fully
  inside the service layer per the layered-architecture requirement.
- **Alternatives considered**: A real database table + Django admin (rejected — adds migration
  and seeding steps that work against the "single command, <10 minutes" success criterion for no
  functional benefit in a 4-fixed-series, single-tenant tool); CSV (rejected — JSON maps more
  directly onto the nested per-series/per-date shape and needs no extra parsing dependency).

## 4. Layered request flow (Pydantic ↔ dataclass boundary)

- **Decision**: `routers/chart.py` (Django Ninja `@router.get`) receives the request, calls exactly
  one `services/chart_service.py` function, and returns its result. Any query-parameter validation
  uses a Pydantic schema in `api/schemas/`; immediately after validation the router converts it to
  a plain `dataclass` before calling the service. The service returns plain dataclasses
  (`ChartDataset`, `SeriesData`, `ROIThresholdConfig` — see `data-model.md`); the router converts
  that dataclass into the Pydantic response schema for serialization. The service layer imports
  nothing from `pydantic` or `ninja`.
- **Rationale**: Directly implements the user's mandated flow: request → Pydantic validation →
  dataclass → service → dataclass → Pydantic response → client.
- **Alternatives considered**: Passing Pydantic models straight into the service layer (rejected —
  explicitly disallowed by the user's instructions, and it would leak an HTTP-layer concern into
  business logic).

## 5. Centralized error handling

- **Decision**: Domain exceptions (e.g., `ChartDataUnavailableError`) are defined near the service
  layer. A small number of `@api.exception_handler(...)` handlers, registered once where the Ninja
  `NinjaAPI` instance is constructed, translate each domain exception type into the appropriate
  HTTP status + error body. Routers never contain `try/except`.
- **Rationale**: Matches the user's explicit requirement for one centralized translation point
  instead of per-router error handling, and keeps routers "maximally thin."
- **Alternatives considered**: Per-router `try/except` blocks (rejected — explicitly disallowed).

## 6. Frontend framework & charting library

- **Decision**: React 18 + TypeScript 5 + Vite 5, with Apache ECharts (`echarts` package, used via
  its imperative API or a thin React wrapper) as the charting library.
- **Rationale**: User-specified stack. ECharts is chosen specifically because it natively supports
  the two hardest reference-fidelity requirements:
  - A single shared tooltip across multiple series on one category axis
    (`tooltip: { trigger: 'axis' }`), which by default highlights the matching data point in
    *every* series sharing that axis at once — this is exactly the "one tooltip + halo on every
    series at that X" behavior from the reference frames (FR-005, FR-006), with no custom
    per-series hover-sync code needed.
  - A hard, non-gradient color split on a single line series via a `piecewise` `visualMap` bound
    to that series, which recolors segments discretely at a threshold crossing (FR-010) — the
    standard ECharts pattern for "color line segments by value," as opposed to a smooth
    `visualMap` (continuous) or a manual gradient `lineStyle`, both of which would blend at the
    boundary and violate the "sharp, non-gradient" requirement.
- **Alternatives considered**: Recharts/Victory (rejected — no first-class shared-axis-tooltip +
  piecewise-line-color primitive, would require substantially more custom SVG/hover-sync code to
  match the reference, working against Principle IV, "reference fidelity over speed"); Chart.js
  (rejected — no piecewise line color-by-value primitive without a plugin).

## 7. Frontend hover halo

- **Decision**: Implemented via each series' `emphasis` state (`itemStyle` with an enlarged,
  low-opacity `symbolSize`/shadow to render the soft "halo" ring) combined with ECharts'
  axis-trigger tooltip, which automatically emphasizes the matched data point on every series
  sharing the axis when hovering — no manual "find nearest point per series" logic is needed in
  application code (kept out of the frontend, consistent with "frontend only renders").
- **Rationale**: Reuses a built-in ECharts mechanism rather than hand-rolled hover-sync logic,
  minimizing custom code (Principle V, reviewer-grade clarity) while matching the reference frames'
  simultaneous multi-series halo.
- **Alternatives considered**: Manually tracking mouse X position and computing the nearest index
  per series in React state (rejected — duplicates logic ECharts already provides, adds surface
  area for the "stale tooltip" edge case).

## 8. Frontend config

- **Decision**: `frontend/src/config/index.ts` exports one typed `config` object
  (e.g., `{ apiBaseUrl: string }`) populated from `import.meta.env.VITE_*` variables at module
  load, validated/defaulted in one place. No other file reads `import.meta.env` directly.
- **Rationale**: Mirrors the backend's single-Config-source requirement on the frontend side, per
  the user's explicit instruction.
- **Alternatives considered**: Reading `import.meta.env.VITE_API_BASE_URL` ad hoc wherever needed
  (rejected — explicitly disallowed by the user's instructions).

## 9. Testing tools

- **Decision**: Backend — `pytest` + `pytest-django` + Django Ninja's `TestClient`, run inside the
  backend container/Poetry env. Frontend — `vitest` + `@testing-library/react` (the standard
  Vite-native pairing), run inside the frontend container/`node_modules` env.
- **Rationale**: Both are the conventional, low-ceremony choices for their respective stacks and
  keep verification runnable through the same Docker-first flow mandated by the constitution.
- **Alternatives considered**: `unittest`/Django's test runner alone (rejected — `pytest` fixtures
  read more clearly for reviewers); Jest (rejected — `vitest` shares Vite's config/transform
  pipeline, avoiding a second, divergent toolchain).

## 10. Containerization & orchestration

- **Decision**: `backend/Dockerfile` and `frontend/Dockerfile` are independent, multi-stage where
  useful; `docker-compose.yml` at the repo root wires both services plus port mapping; a root
  `Makefile` exposes `make up` (build + start both, detached or foreground per review needs),
  `make down`, and `make logs` as documented conveniences.
- **Rationale**: Directly matches the constitution's Principle I and the user's explicit
  instruction.
- **Alternatives considered**: A single combined Dockerfile/container (rejected — explicitly
  disallowed; violates "independent containers").
