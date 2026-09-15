# Phase 0 Research: Overlaid Multi-Series Performance Chart

All technology choices below were dictated directly by the user's planning input and the
ratified constitution; this phase documents the concrete versions/libraries and the patterns used
to satisfy the spec's functional requirements with them, so Phase 1 design has no open unknowns.

## 1. Backend framework & versions

- **Decision**: Python 3.12, Django 5.x, `django-ninja` 1.x (Pydantic v2-based), `python-dotenv`
  1.x, managed entirely through Poetry with `virtualenvs.in-project true`.
- **Rationale**: Django Ninja was specified by the user. Its 1.x line targets Pydantic v2, so
  Django 5.x (current LTS-adjacent stable at time of writing) is the compatible, actively
  maintained pairing. Python 3.12 is the current stable CPython series with full library support.
  `pydantic-settings` was used initially for `Config` but was dropped (§2) once the user asked for
  `Config` to be a plain Python class reading `.env` via `python-dotenv` directly, rather than a
  `pydantic-settings` model — `pydantic` itself stays (used directly by `chart/dataset_schema.py`,
  §12, and transitively by `django-ninja`).
- **Alternatives considered**: FastAPI (rejected — user explicitly specified Django Ninja);
  Django REST Framework (rejected — heavier, serializer-centric, works against the
  Pydantic-at-the-boundary / dataclass-in-the-middle flow the user mandated).

## 2. Reconciling "no `os.environ()` in code" with Django's settings module

- **Decision**: A single class, `BaseConfig`, lives in `backend/config/settings.py`. It is the only
  place environment variables are read. Django's own `settings.py` (required by the framework)
  imports values **from** this class (via the `config = BaseConfig()` singleton) rather than
  reading `os.environ` itself — Django's settings module becomes a thin adapter, not a second
  source of configuration truth.
- **Revised from `pydantic-settings` to a plain class**: `BaseConfig` was originally a
  `pydantic-settings` `BaseSettings` model. User feedback: a pydantic object mixes a library into
  every layer that touches `Config` for no benefit here, when a plain class reading `.env` via
  `python-dotenv`'s `load_dotenv()` does the same job. `BaseConfig` now calls
  `load_dotenv(ENV_FILE)` once at module import time, then each field is a class attribute computed
  from `os.environ.get(...)` (or `os.environ[...]` for the one required field). Fields are named in
  `UPPER_CASE` (`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `API_PREFIX`, `CORS_ALLOWED_ORIGINS`,
  `DATASET_PATH`, `LOG_LEVEL`) — idiomatic for a plain settings-holder class (and matches Django's
  own `settings.py` convention), unlike the previous `snake_case` pydantic-model-field style.
- **Rationale**: Satisfies the "single Config class, no magic env access scattered in code"
  constraint while still giving Django the settings module it requires to boot. `os.environ`/
  `load_dotenv` are used in exactly one place (inside `BaseConfig`), never scattered — that was
  always the actual intent of "no `os.environ()` directly in code," not a ban on `os.environ`
  existing anywhere at all.
- **Alternatives considered**: `django-environ` (rejected — redundant with `python-dotenv`, already
  a dependency); keeping `pydantic-settings` (rejected per user feedback above); reading
  `os.environ` directly in Django `settings.py` (rejected — violates the stated constraint).
- **Secrets specifically** (e.g. Django's `SECRET_KEY`): never hardcoded in source.
  `BaseConfig.SECRET_KEY = os.environ["SECRET_KEY"]` — no default, so a missing `.env`/env var
  raises `KeyError` immediately at import time (fail-fast; the error message is a bare `KeyError`
  now rather than pydantic's more descriptive "Field required," a minor readability trade-off for
  dropping the dependency). `.env` is git-ignored (root `.gitignore`); a committed
  `backend/.env.example` documents which variables must be set, with placeholder values. Verified
  by removing `.env` and confirming `manage.py check` fails with `KeyError: 'SECRET_KEY'` instead
  of booting.
- **`DEBUG` and `ALLOWED_HOSTS`**: `DEBUG` (default `False` — user-requested addition; previously
  Django's scaffold default of `DEBUG = True` was left hardcoded in `project/settings.py` and never
  wired to `Config` at all) and `ALLOWED_HOSTS` (default `["localhost", "127.0.0.1"]`, comma-
  separated in `.env`) are both now `Config`-sourced. `ALLOWED_HOSTS` was *not* in the original
  request — added after wiring `DEBUG = config.DEBUG` surfaced a real, previously-masked bug:
  Django refuses to boot with `DEBUG = False` and an empty `ALLOWED_HOSTS` (`ALLOWED_HOSTS = []` was
  the scaffold default, harmless only because `DEBUG` had always been hardcoded `True` before).
  Caught via `make up` failing with `CommandError: You must set settings.ALLOWED_HOSTS if DEBUG is
  False.` — fixed by Config-sourcing `ALLOWED_HOSTS` the same way as `CORS_ALLOWED_ORIGINS`, rather
  than just hardcoding a fixed list in `project/settings.py`, for consistency.
- **`roi_threshold_above_color`/`roi_threshold_at_or_below_color` are *not* on `BaseConfig`** —
  moved to a separate plain class, `PresentationConfig` (§3), alongside the rest of the series
  presentation data. `BaseConfig` only holds genuinely environment-varying settings.

## 3. Data storage for the 4 datasets

- **Decision**: The 4 datasets (Cost, CPA, ROI confirmed, Conversions) plus the ROI threshold
  configuration are stored as versioned, human-editable data files (JSON) under
  `backend/chart/data/`, loaded by the service layer at request time (or process start).
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
- **What actually lives in the file vs. in code**: only numbers — `dates`, one values array per
  series (keyed by `SeriesKey`), and `roi_threshold.value`. `name`/`chart_type`/`color`/`decimals`
  per series, and the two threshold colors, are **not** in the file — they're a fixed constant
  table (`SERIES_METADATA` + the two `ROI_THRESHOLD_*_COLOR` constants) in
  `backend/chart/presentation.py`, which `chart/loader.py`'s `load_chart_dataset()` (see §12,
  §13.1) merges with the raw file data. Originally these were embedded in the file per-series (matching the HTTP response shape
  1:1); moved out once it became clear that would let a reviewer's dataset substitution silently
  change the chart's colors — breaking Principle IV (reference fidelity) — and would force the
  service to fall back to "if this key then this color" branching for any field a reviewer omitted.
  A fixed dict lookup avoids both. This does **not** change `contracts/chart-api.md`'s response
  shape at all — the HTTP layer still returns full per-series metadata; only the *source* of that
  metadata moved from "file" to "code constant."
- **Where exactly the fixed constants live, revised twice**: first draft put
  `SERIES_METADATA`/`ROI_THRESHOLD_*_COLOR` as plain module constants directly in
  `chart/presentation.py`, with the two ROI colors additionally read from `Config` (a
  `pydantic-settings` model at the time). Final design, per user feedback: **all** of the raw
  presentation data (`"Cost"`, `"area"`, `"#F5E1A4"`, ... — every series' name/chart_type/color/
  decimals, plus both ROI threshold colors) lives as plain class-level constants on
  `PresentationConfig` in a **new file, `backend/config/presentation.py`** — not `chart/`, and not
  `pydantic`-anything, just a bare Python class (mirrors `BaseConfig`'s "no library mixed in for
  pure constants" reasoning, §2). `chart/presentation.py` (still in `chart/`) then *builds* the
  domain-typed `SERIES_METADATA: dict[SeriesKey, SeriesMetadata]` from
  `PresentationConfig.SERIES_METADATA`'s raw string-keyed dict — `SeriesKey`/`SeriesMetadata`
  themselves stay in `chart/` (they're domain types, `config/` has no business knowing about them).
  `config/presentation.py` imports nothing from `chart/` — dependency direction stays
  `chart` → `config`, never the reverse (verified by grep). `chart/loader.py` needed **no changes**
  at all for this move — `chart/presentation.py` still exports the same
  `SERIES_METADATA`/`ROI_THRESHOLD_ABOVE_COLOR`/`ROI_THRESHOLD_AT_OR_BELOW_COLOR` names.
- **Why `PresentationConfig` is a plain class with class-level constants, not `.env`-driven**: none
  of this data should ever be reviewer-editable (Principle IV, reference fidelity) — not even via an
  optional `.env` override, which the ROI colors briefly had in an earlier draft. A bare class
  attribute makes that permanent and explicit, and avoids `.env` needing to hold a JSON blob for
  the nested per-series shape.

## 4. Layered request flow (Pydantic ↔ dataclass boundary)

- **Decision**: `chart/router.py` (Django Ninja `@router.get`) receives the request, calls exactly
  one `chart/service.py` function, and returns its result. Any query-parameter validation
  uses a Pydantic schema in `chart/schemas.py`; immediately after validation the router converts it
  to a plain `dataclass` before calling the service. The service returns plain dataclasses
  (`ChartDataset`, `SeriesData`, `ROIThresholdConfig` — see `data-model.md`); the router converts
  that dataclass into the Pydantic response schema for serialization. The service layer imports
  nothing from `pydantic` or `ninja`.
- **Rationale**: Directly implements the user's mandated flow: request → Pydantic validation →
  dataclass → service → dataclass → Pydantic response → client.
- **Alternatives considered**: Passing Pydantic models straight into the service layer (rejected —
  explicitly disallowed by the user's instructions, and it would leak an HTTP-layer concern into
  business logic).
- **Shared vocabulary vs. composite types**: within `chart/`, `types.py` (the `SeriesKey` enum
  and `ChartType` literal — framework-free value types) is separate from `dto.py` (the
  `SeriesData`/`ChartDataset`/`ROIThresholdConfig` dataclasses that use them — renamed from
  `models.py`: in Django, `models.py` conventionally means ORM models, and ours aren't, which
  invited confusion for any Django-familiar reviewer).
  Both `chart/dto.py` and `chart/schemas.py` import `SeriesKey`/`ChartType` from `chart/types.py`,
  so the two never drift into duplicate, independently-maintained copies of the same enum. This
  stays consistent with "service layer imports nothing from pydantic/ninja" — `chart/types.py` has no framework
  import either; it's `schemas.py` reaching *down* into domain vocabulary within the same domain
  folder, not the reverse. See §11 for why this vocabulary lives inside `chart/` at all rather than
  a separate top-level `domain/` folder.

## 5. Centralized error handling

- **Decision**: Domain exceptions (`ChartDataUnavailableError`, `InvalidDatasetError` — see §12)
  are defined in `chart/exceptions.py` — plain `Exception` subclasses, zero `pydantic`/`ninja`
  imports. A small number of `@api.exception_handler(...)` handlers in `api/exceptions.py` import
  those classes, `logger.exception(exc)` them, and translate each to the appropriate HTTP status +
  error body (`ChartDataUnavailableError` → `503`, `InvalidDatasetError` → `500`; both bodies match
  `contracts/chart-api.md`'s error shape). Routers never contain `try/except`.
- **Rationale**: Matches the user's explicit requirement for one centralized translation point
  instead of per-router error handling, and keeps routers "maximally thin."
- **File placement, revised from the original task text**: the exception *classes* live in
  `chart/exceptions.py` (inside the domain, alongside `types.py`/`dto.py`), not
  `api/exceptions.py` — the same reasoning as the `SeriesKey`/`ChartType` split (research.md #4):
  `chart/loader.py` (§12, §13.1) needs to raise these, and if the classes lived in `api/exceptions.py`
  that would mean the domain importing *from* the shared HTTP composition root — the dependency
  direction is supposed to run the other way (see §11). `api/exceptions.py` only imports the
  classes from `chart/` and registers the HTTP mapping — `api/` depending on `chart/`, never the
  reverse.
- **Avoiding a circular import**: `api/ninja_app.py` (the `NinjaAPI` instance) does not import
  `api/exceptions.py` — that would make `ninja_app` depend on `exceptions`, which depends on
  `ninja_app` (for the `api` object to decorate), a cycle. Instead `project/urls.py` — Django's
  natural one-time composition root — imports `api.exceptions` (for its `@api.exception_handler`
  registration side effect) alongside mounting `api.urls`. `api/routers.py` (§11.1) follows the
  same shape for router registration.
- **Alternatives considered**: Per-router `try/except` blocks (rejected — explicitly disallowed).
  Defining the exception class directly in `api/exceptions.py` as the original task text specified
  (rejected once the service-layer import direction was considered — see above).

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
- **Dependency volumes vs. dependency drift**: `docker-compose.yml` bind-mounts host source into
  both containers for live editing, with a *named volume* layered on top of `/app/.venv`
  (backend) and `/app/node_modules` (frontend) so the container's own install isn't shadowed by
  whatever is (or isn't) on the host. This has a sharp edge: a named volume persists across
  `docker compose up --build`, so adding a dependency (e.g. `django-cors-headers` for T013) and
  rebuilding is not enough — the old volume still shadows the image's freshly-installed
  `.venv`/`node_modules`, and the app fails at runtime with a missing-module error even though the
  image itself is correct. Caught exactly this way during T013. **Fix**: both Dockerfiles'
  `CMD` re-syncs dependencies against the current lockfile at *container start*, not just at
  image build — `poetry install --no-root && ...` (backend) and `npm ci && ...` (frontend) — so a
  stale volume self-heals every `make up` instead of silently masking a missing dependency. Cheap
  when nothing changed, correct when something did.

## 11. Domain-first backend structure (`chart/`, not a top-level `domain/`)

- **Decision**: The backend is organized by *domain* first, *technical layer* second — the
  opposite of the folder layout T011–T017 were originally built with (a top-level `domain/` sitting
  alongside `api/`/`services/` as parallel technical-layer folders, each mixing whatever domains
  existed inside it). Now there is one `chart/` folder — the project's single bounded context —
  holding everything specific to it: `types.py`, `presentation.py`, `models.py`, `exceptions.py`,
  `service.py`, `schemas.py`, `router.py`, `data/`, `tests/`. Only what is genuinely cross-domain
  stays outside: `api/` (the shared `NinjaAPI` instance + exception-handler *registration* + router
  *registration*, §11.1 — a second domain would plug into this same `api/`, not get its own copy),
  `config/` (the single global `Config`), and `project/` (Django's own required framework shell).
- **Rationale**: User feedback, directly: a `domain/` folder holding dataclasses/types/exceptions
  for potentially-many domains, sitting apart from `api/routers/`, `api/schemas/`, and `services/`
  which also each mix multiple domains together, is *layer-first* organization — you'd have to
  touch four different top-level folders to see everything about "chart." *Domain-first* means one
  folder answers "what does the chart domain consist of," and the layering rules the user
  originally specified (thin router, Pydantic-only-at-boundary, dataclass-in-the-middle, no
  `pydantic`/`ninja` in the service) still apply *inside* that folder — they were never about where
  domains sit relative to each other, only about what each file is allowed to import.
- **What stays outside a domain folder, and why**: anything that would need to exist even with
  zero domains, or that a second domain would share rather than duplicate. `api/ninja_app.py` (the
  one `NinjaAPI` instance every domain's router mounts onto) and `api/exceptions.py` (the one place
  handler registration happens, importing each domain's exception classes) are exactly that — this
  directly resolves the "the handler feels like it belongs a level above domain" observation: it
  does, because it is the thing every domain plugs into, not something any single domain owns.
- **Alternatives considered**: Keeping `domain/`/`services/`/`api/routers/`/`api/schemas/` as
  top-level technical-layer folders (rejected — the original approach; works fine with exactly one
  domain but doesn't scale and buries "everything about chart" across four locations). A single
  flat `chart/` with no internal file split at all, e.g. one `models.py` holding types + dataclasses
  + exceptions (rejected — loses the single-responsibility-per-file granularity the user separately
  asked for when types.py was split out of models.py; domain-first and single-purpose files are not
  in tension, this project just needed both corrected).

### 11.1 Router registration centralized in `api/routers.py`, symmetric with `api/exceptions.py`

- **Decision**: `chart/router.py` only defines the `Router` and its one endpoint — it no longer
  imports `api.ninja_app` or calls `api.add_router(...)` itself. A new `api/routers.py` imports
  `chart.router.router` and does `api.add_router("", chart_router)`. `project/urls.py` imports
  `api.routers` (side-effect import, same pattern as `api.exceptions`) instead of importing
  `chart.router` directly.
- **Rationale**: User feedback — pointed out that `api/exceptions.py` already centralizes handler
  registration for every domain (a domain only *defines* its exception classes; `api/` does the
  registering), while the router did the opposite: `chart/router.py` was both defining *and*
  self-registering. Two different patterns for the same underlying job ("plug a piece of a domain
  into the shared `api`"). Fixed by making router registration follow the exact same shape as
  exception registration — `api/` now owns *all* domain-pluggability decisions, not just exceptions.
- **No circular import risk**: this only works because `chart/router.py` no longer needs anything
  from `api/` — removing its `api.add_router(...)` call also removed its only reason to import
  `api.ninja_app`. `api/routers.py` can safely import `chart.router` in one direction (`api` →
  `chart`, same direction as `api/exceptions.py` → `chart.exceptions`).
- **Alternatives considered**: Putting the registration call directly in `api/ninja_app.py` instead
  of a separate `api/routers.py` (rejected — no circular-import problem either way, but keeping
  `ninja_app.py` to just the bare instance and `routers.py`/`exceptions.py` as the two "what's
  plugged in" files is more symmetric and keeps each file single-purpose, matching how
  `exceptions.py` was already split out for the same reason). A generic router-registry / list of
  `(prefix, router)` tuples to iterate over (rejected — YAGNI for a single-domain project; the
  explicit one-line `api.add_router(...)` call in `api/routers.py` is exactly as much abstraction
  as `api/exceptions.py` uses today, and a second domain would just add one more explicit line).

## 12. Validating the substitutable dataset file

- **Decision**: The raw dataset file is validated with Pydantic at the point it's loaded — a new
  `chart/dataset_schema.py` (`RawDatasetFile`: `dates`, `series: dict[SeriesKey, list[float | None]]`,
  `roi_threshold.value`, plus a `model_validator` enforcing ascending/unique dates, exactly the 4
  `SeriesKey`s present, and every series' value-list length matching `len(dates)`).
  `chart/loader.py`'s `load_chart_dataset(path) -> ChartDataset` (briefly merged into
  `ChartService` in §13, reverted in §13.1) reads the file, validates it via that model, merges
  the validated raw values with `chart/presentation.py`'s fixed metadata, and builds the
  `chart/dto.py` objects. On a validation failure it raises `InvalidDatasetError`; on a
  missing/unreadable file it raises `ChartDataUnavailableError` — these are now two distinct
  problems ("data present but wrong" vs. "data source unavailable"), previously conflated (there
  was no validation at all before this).
- **Rationale**: There was no validation of the dataset file. Any malformed reviewer edit would
  either go unhandled or get muddled into the `503` meant for "temporarily unavailable" — the wrong
  signal for "this data is permanently wrong until someone fixes the file." The user explicitly
  asked for Pydantic-based validation here, reusable if a non-file input method is ever added.
- **Where the Pydantic import boundary actually is**: validation lives in a separate
  `chart/loader.py`, specifically so `chart/service.py` never imports `pydantic`. This was briefly
  changed in §13 (`loader.py` merged into `ChartService`, making `service.py` import `pydantic`
  directly) and reverted in §13.1 per user feedback — `chart/loader.py` is the current, stable
  state. `chart/schemas.py` (HTTP request/response shaping) and `chart/dataset_schema.py` (raw
  file/input shaping) are kept as two separate files despite both being Pydantic, since they
  validate different things with different lifecycles (once at startup vs. per HTTP request).
- **Status codes — three, not one**: `503` (`ChartDataUnavailableError`) stays reserved for genuine
  runtime unavailability (the file disappears *after* a successful startup — unlikely for static
  data, but the handler exists defensively). `500` (`InvalidDatasetError`) means "the server's own
  data is broken" — a deployment/config problem, not the caller's fault. Neither of these is a
  `4xx`, correctly — no client caused them. If a client-facing input path is ever added (see below),
  a genuinely bad *client* submission must **not** collapse into either of these — it needs a `4xx`.
- **Fail fast at startup, not per-request**: `chart/router.py` calls
  `chart_service.get_chart_dataset()` once at import time (module level), so a malformed file
  crashes the container immediately when `make up` runs, with a clear traceback identifying the
  exact problem (e.g. "series 'cost' has 4 values but expected 5") — not a confusing `500`/`503` on
  the first browser request, long after the reviewer has moved on and forgotten they edited the
  file. Verified by deliberately truncating a series' values array and confirming `manage.py check`
  fails loudly with the precise validation error.
- **Deferred: a form/upload endpoint instead of file-editing**: discussed and explicitly deferred —
  it would reopen the already-clarified User Story 4 decision (file-editing, no upload UI) for work
  that isn't part of what this assignment evaluates. No `Config` toggle field was added for this
  (e.g. a `Literal["file", "form"]` with only one working branch) — an unused branch is exactly the
  half-finished-abstraction problem to avoid (YAGNI). Instead, the validation was designed so this
  would be a thin addition later, with zero duplicated validation logic: a future Ninja route would
  declare `RawDatasetFile` as its request body's type directly, and Django Ninja would automatically
  return `422 Unprocessable Entity` for a malformed *client* submission — its own built-in behavior,
  entirely separate from `ChartDataUnavailableError`/`InvalidDatasetError`, and requiring no new
  exception-handling code at all.
- **Alternatives considered**: Validating with hand-written `if`/`raise` checks instead of Pydantic
  (rejected — user explicitly asked for Pydantic here, and a declarative model reads more clearly
  than a wall of manual assertions for a reviewer). Putting the raw-file validation model in
  `chart/schemas.py` alongside the HTTP schemas (rejected — different boundary, different lifecycle;
  keeping them separate makes it obvious at a glance which one governs a per-request HTTP body vs.
  a once-at-startup file read). Building the form endpoint now (rejected — see "Deferred" above).

## 13. `ChartService` — class-based service, `loader.py` merged in (superseded — see §13.1)

- **Decision**: `chart/service.py` no longer exposes a module-level `get_chart_dataset()` function.
  It defines a single class, `ChartService`, with two methods — `get_chart_dataset(self)` (no
  args, uses `config.DATASET_PATH`) and `load_chart_dataset(self, path)` (explicit path, used
  directly by tests with `tmp_path`-constructed files) — and exports one singleton instance,
  `chart_service = ChartService()`, the same pattern already used for `config`. The standalone
  `chart/loader.py` from §12 was deleted; its logic (read file → validate via
  `chart/dataset_schema.py` → merge with `chart/presentation.py` → build `chart/dto.py` objects) is
  now `ChartService.load_chart_dataset`'s body, unchanged. `chart/router.py` and
  `chart/tests/unit/test_chart_service.py` (which absorbed `test_loader.py`'s four cases) were
  updated to call `chart_service.get_chart_dataset()` / `chart_service.load_chart_dataset(path)`.
- **Rationale**: User feedback — class-based style should prevail over function-based style
  throughout the service layer, and a separate `loader.py` was one file too many for what is really
  one cohesive responsibility ("get me the chart dataset").
- **Trade-off, stated explicitly**: this reopens something §12 had deliberately protected —
  `chart/service.py` now imports `pydantic` (`ValidationError`, `RawDatasetFile`) directly, which
  the original constitution-level instruction ("service layer... ничего не знает о Pydantic")
  argued against. Flagged to the user rather than silently either violating the original rule or
  refusing the new one; proceeding on the user's explicit instruction. `chart/dataset_schema.py`
  stays a separate file regardless (§12's reasoning for that split — different boundary/lifecycle
  from `chart/schemas.py` — is unaffected by this change and still holds).
- **Alternatives considered**: Keeping `load_chart_dataset` as a private method (`_load_chart_dataset`)
  (rejected — T022a's tests need to call it directly with an explicit `tmp_path`; a leading
  underscore would make that an intentional violation of Python's privacy-by-convention for no
  benefit). Catching a bare `Exception` instead of `pydantic.ValidationError` specifically, to avoid
  naming `pydantic` in `service.py` (rejected — hides unrelated bugs behind the same
  `InvalidDatasetError`, and the class still functionally depends on `pydantic`'s validation
  behavior either way; naming the exception precisely is more honest, not less).

### 13.1 Reverted: `loader.py` restored as a standalone file

- **Decision**: The merge in §13 above was undone per user feedback ("не устраивает... loader
  выносим обратно" — noticed too late, doesn't work, move the loader back out). `chart/loader.py`
  exists again with the exact same `load_chart_dataset(path) -> ChartDataset` function it had
  before §13. `ChartService` keeps its class shape (the user did not object to that part) but
  shrinks back to one method: `get_chart_dataset(self)`, which delegates to
  `loader.load_chart_dataset(config.DATASET_PATH)`. The `load_chart_dataset(self, path)` method
  added to the class in §13 is removed — with the logic back in `loader.py`, a same-named class
  method that only forwarded to it would be pure indirection.
- **What this restores**: `chart/service.py` no longer imports `pydantic` — §13's trade-off is
  gone. `chart/dataset_schema.py` was never affected by any of this (still separate, still the
  validation contract a future form endpoint would reuse).
- **Tests**: `chart/tests/unit/test_chart_service.py` shrinks back to its one original test
  (`chart_service.get_chart_dataset()`); the four loader-specific tests move back to their own
  `chart/tests/unit/test_loader.py`, calling `chart.loader.load_chart_dataset` directly — the exact
  split that existed before §13.
- **`chart/router.py` needed no changes** — it already called `chart_service.get_chart_dataset()`,
  never `loader`/`load_chart_dataset` directly, so the public surface it depends on didn't move.

## 14. ROI confirmed threshold color split (`visualMap`) must use finite piece bounds

- **Decision**: `buildRoiVisualMap()` in `buildChartOption.ts` gives both pieces of the ROI
  confirmed threshold split explicit, finite bounds — `[min(threshold, ...values) - 1, threshold]`
  and `[threshold, max(threshold, ...values) + 1]` — instead of the more obviously "correct"
  open-ended version (`{ lte: threshold }` / `{ gt: threshold }`, relying on ECharts' implicit
  ±Infinity bounds for the missing side).
- **Why**: found only via manual browser verification (T037), not by any test. The open-ended
  version passed T036's unit tests (which only inspect the `EChartsOption` object's shape, never
  render it) but crashed the real chart: ECharts 6's line-color-gradient renderer
  (`getVisualGradient`/`clipColorStops` in `echarts/lib/chart/line/LineView.js`) throws
  `TypeError: Cannot read properties of undefined (reading 'coord')` whenever a piecewise
  `visualMap` piece targeting a line series is left open-ended, and React's error boundary then
  renders a blank white page with no other visible signal. Bisected with a minimal in-browser
  reproduction — via Playwright driving a direct `import()` of the app's own bundled `echarts`
  module, so real option variants could be tried against the real renderer without a full
  React/Vite rebuild each time — which ruled out `smooth`, `showSymbol`, `dimension`, and
  `seriesIndex` as the cause: a bare `{ type: 'line', data: [...] }` series with an open-ended
  piecewise `visualMap` and nothing else crashes the same way. This looks like a genuine ECharts 6
  limitation/bug, not a mistake specific to this project's setup.
- **The fix is behaviorally identical, not a workaround with side effects**: bounding both pieces
  to the series' own `[min, max]` (with a small margin) can't exclude any real value, since those
  bounds are derived from the same values — every data point still lands in exactly the piece its
  actual value implies, so the fix changes nothing about which color a value gets, only avoids the
  crash.
- **Lesson for this codebase**: reinforces the same pattern as T026's snake_case/camelCase bug —
  a unit test asserting the *shape* of a pure function's output (`buildChartOption`'s returned
  option object) cannot catch a bug that only manifests when a real rendering engine consumes that
  output. Both bugs were caught only because "start the dev server and use the feature in a real
  browser before reporting a UI task complete" was followed literally, not treated as optional once
  the test suite was green.
