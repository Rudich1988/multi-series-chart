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
- **Secrets specifically** (e.g. Django's `SECRET_KEY`): never hardcoded as a *real* secret in
  source, and never committed — `.env` is git-ignored (root `.gitignore`) and was verified never
  tracked (`git log --all -- backend/.env` is empty) and never baked into the built image
  (`backend/.dockerignore` excludes it; verified by running the built image and confirming
  `/app/.env` doesn't exist). **Revised**: `BaseConfig.SECRET_KEY` originally had no default
  (`os.environ["SECRET_KEY"]`, raising `KeyError` immediately if unset) — per user feedback
  ("SECRET_KEY сделай тоже опционным... в принципе ничего не должно быть обязательным"), it now
  has one: `os.environ.get("SECRET_KEY", "django-insecure-dev-placeholder-change-me")`. The
  `"django-insecure-"` prefix mirrors Django's own `startproject` scaffolding convention for
  flagging a key that must never be used in production — it's a real, working key for local/demo
  use, just not a secret one. This makes `.env` fully optional end-to-end: every other `BaseConfig`
  field already had a default, and `docker-compose.yml`'s `env_file` entry was changed from a bare
  path (which makes Compose refuse to start at all if the file is missing —
  verified: `env file .../backend/.env not found`) to `{ path: ./backend/.env, required: false }`.
  Verified by removing `.env` entirely and running `make up` from that state: the stack boots, the
  chart renders correctly in a real browser, and `docker compose logs` shows no error — `.env` is
  now purely an opt-in override mechanism, never a precondition for running the project at all.
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

## 15. Two reference-fidelity bugs found by pixel-measuring the reference frames directly

User report: "на гиф синие столбики очень маленькие, а у нас — большие" (the reference's blue
(CPA) bars are tiny, ours are huge) and the tooltip's rows "не в ряд" (not lined up) and the box
"вроде как больше должен быть по масштабу" (seems like it should be bigger). Both were root-caused
by measuring pixels in `specs/reference/frames/` directly with Pillow, not by eyeballing — visual
bugs like these are exactly the case Principle IV exists for, and "looks about right" isn't a
verification method.

### 15.1 CPA (bar-type) y-axis: `scale: true` was backwards for a low-magnitude bar series

- **Measurement**: in `frame_21.png` (no tooltip covering the bars), scanning every column for the
  bar's blue color and taking the topmost/bottommost matching pixel per bar gave, for all 5 dates
  (CPA values `0.68, 0.86, 1.23, 0.79, 0.71`): top-of-bar `y` within `388–391` for every single
  bar, against a measured baseline (`y=391`) shared with every other series (confirmed
  independently via `Cost`'s and `Conversions`' own zero-based linear fits, see below) — i.e. the
  bars are 1–3px tall and visually indistinguishable from each other, despite an ~80% relative
  range in their actual values.
- **Cross-check**: computed independent zero-based linear px/unit scales for `Cost` (from its
  area's top edge, 2 points: `~3.99 px/unit`) and `Conversions` (from its point markers, 2 points:
  `~2.466 px/unit`) and `ROI confirmed` (from its spline, 2 points: `~0.383 px/unit`) — all three
  fits independently extrapolate back to the same `y=391` baseline at value `0`, confirming each of
  those 3 series really does get its own independent, zero-based axis (not a single axis shared by
  all 4 series — a shared axis was ruled out because the 3 px/unit values differ by ~10x, and a
  shared axis would make them identical). CPA's implied px/unit from its ~1-3px bars
  (`~0.4-2.4 px/unit` for values `0.68-1.23`) is far closer to `ROI confirmed`'s scale
  (`~0.383 px/unit`, built from the *dataset's global max*, `610.78`) than to a scale fit to CPA's
  *own* range (`0.68-1.23`), which would need to be roughly 100x steeper to fill the same pixel
  height other series reach at their own max.
- **First decision (superseded, see 15.1.1)**: bar-type series' `yAxis` was made zero-based with
  `max` = the maximum value across *all* series in the dataset (`globalMaxValue()`), not scaled to
  the bar series' own range.
- **Why the original was wrong (T027)**: the original reasoning — "`scale: true` so a low-magnitude
  series like CPA isn't flattened against a shared zero-based scale" — solved a problem the
  reference doesn't actually have (a *shared* axis flattening CPA) by introducing the opposite one:
  with its *own independent* axis tightly fit to `0.68-1.23`, CPA's small absolute differences
  filled nearly the entire chart height, which is the "giant bars" bug reported.

#### 15.1.1 Revised: `globalMaxValue()` overcorrected to fully flat/invisible bars

- **User report** (immediately after the fix above shipped): "сейчас они стали абсолютно плоскими.
  их вообще по сути не видно. хотя на gif они все же видны и даже отличаются по высоте слегка" —
  the bars are now completely flat and essentially invisible, but the reference still shows them as
  visible with slightly different heights per value.
- **Why**: `globalMaxValue()` (`610.78`, from `ROI confirmed`) is proportionally far more extreme
  relative to *this app's* ~484px effective plot height than it is relative to the reference
  frame's ~300px plot height. Working the actual numbers: `484 * 1.23 / 610.78 ≈ 0.97px` for CPA's
  largest value — sub-pixel, and every other CPA value is smaller still, so all 5 bars rendered as
  the same ~0px/invisible instead of the reference's already-tiny-but-present `1-3px` with visible
  bar-to-bar variation. A literal "match the reference's implied absolute scale" doesn't survive
  being replayed at a different canvas size — confirms research.md §15.2's earlier point that the
  GIF's original capture resolution isn't recoverable, extended here to mean an *absolute* pixel
  target isn't portable either, only a *qualitative* one is ("small and subdued, but visibly
  varying, never literally flat").
- **Decision**: replaced the global-max approach with `max = (bar series' own max) * BAR_HEADROOM`
  (`BAR_HEADROOM = 6`, i.e. the bar's own peak reaches ~1/6 of the axis height), plus
  `barMinHeight: 2` on the bar series (an ECharts option — a hard floor so no value can round down
  to literally 0px, independent of the axis math). This keeps the bar's *own* relative variation
  (min vs. max) fully intact and visible — unlike the flattened `globalMaxValue()` version, where
  every value collapsed to the same sub-pixel/zero height — while still capping its peak well below
  what the other 3 series reach, keeping it visually subdued. `BAR_HEADROOM = 6` is a deliberate,
  documented constant, not a rederivation of the reference's exact (unrecoverable) pixel ratio —
  the target is the qualitative one above, verified by eye (Playwright screenshot: 5 visibly
  different-height blue bars, none flat) rather than by a pixel-for-pixel match against
  `frame_21.png` this time.
- **Still generalizes to any substituted dataset**: keyed off `chartType === 'bar'` and the bar
  series' *own* values only — doesn't need or read the other 3 series' magnitudes at all, so it
  can't be thrown off by, say, a reviewer's dataset where some other series has an unusually large
  or small range (which `globalMaxValue()` — computed across all 4 series — would have been
  sensitive to).

#### 15.1.2 `BAR_HEADROOM = 6` was still "verified by eye," not by measurement — and a second bug

- **User pushback**: "ну нет, снова большие... скажи, не надо гадать" — still too big, and an
  explicit instruction to stop guessing constants and measure instead. Fair: §15.1.1's `6` was
  picked, then confirmed only by looking at a screenshot and judging it "looks small enough," not
  by measuring an actual pixel height against a stated target.
- **What measuring the live render (not the reference this time) actually found**: took a
  Playwright screenshot with the mouse off-chart, then measured each bar's pure-blue pixel span at
  its known category-center `x`. With `BAR_HEADROOM = 6` the 5 bars measured `44, 56, ~65+, 51, 46`
  px tall on a ~483px-tall chart (9–16% of the height) — consistent with the formula
  (`height = plotHeight * value / (ownMax * 6)`; e.g. `483 * 0.68 / (1.23 * 6) ≈ 44.5px`, matching
  the measured `44` almost exactly) — the *math* was right, `6` was just still too generous a
  fraction for "small."
- **A second, independent bug found in the same screenshot**: the 3 *middle* bars weren't blue at
  all in the screenshot — they were a dull gray-tan (`199, 200, 186`). Computed the exact alpha
  blend of `cost`'s area fill color (`#F5E1A4`, default `areaStyle` opacity `0.7`) over the bar's
  blue (`#5B8DEF`): `0.7*245 + 0.3*91 = 198.8`, `0.7*225 + 0.3*141 = 199.8`, `0.7*164 + 0.3*239 =
  186.5` — reproduces the measured color almost exactly. So `cost`'s semi-transparent area was
  being drawn *on top of* the bars (only the leftmost/rightmost bars, where `cost`'s own value
  happened not to reach down over them, showed true blue) — ECharts doesn't strictly follow series
  array order for z-stacking across different series types; ordering `cost` before `cpa` in
  `data.series` didn't guarantee `cpa` renders above it. Fixed with an explicit `z: 10` on the bar
  series (ECharts default `z` is `2`) — the reference (`frame_21.png` etc.) shows the blue bars as
  fully opaque, always on top of the yellow area, never blended.
- **Recalibrated `BAR_HEADROOM` to `25`, verified by measurement this time, not judgment**: same
  screenshot-and-measure method, now against a stated target (a few percent of chart height,
  comfortably "small" without being sub-pixel) rather than "looks about right." Result: `10, 12,
  18, 11, 10` px for values `0.68, 0.86, 1.23, 0.79, 0.71` — 2–3.7% of the ~483px chart height, all
  pure blue (z-order fix confirmed working), and the values' actual relative variation (`1.23` is
  ~1.8x `0.68`) is preserved and clearly visible in the measured heights (`18` vs `10`, also ~1.8x).
  Screenshot-verified afterward for a sanity check, but the pixel measurement — not the screenshot
  — is what the `25` was chosen and confirmed against.

### 15.2 Tooltip layout: ECharts' default center-aligned content vs. the reference's flush-left column

- **Measurement**: cropped the live tooltip via Playwright (`getBoundingClientRect` on the DOM
  element containing the date text) and compared side-by-side against a crop of
  `frame_10.png`'s white tooltip box. The reference's 5 lines (date + 4 rows) all start at the same
  left `x` — a clean column. The live tooltip's rows were each centered *independently* under the
  widest row (`"ROI confirmed: 161.47"`), so shorter rows (`"CPA: 1.23"`) appeared indented by a
  different amount each — a ragged left edge, not a column. Root cause: ECharts' default tooltip
  content area is `text-align: center`; `tooltipFormatter.ts` never overrode it.
- **Fix**: `formatTooltip()`'s outer wrapper gets `text-align: left`; each row is a flex container
  (dot + label + value on one flex line) instead of relying on inline-element default flow, so the
  dot and text share a consistent baseline regardless of row width.
- **Box size**: measured the reference tooltip's row-to-row spacing (`~29-30px`, from the dark-text
  row bands in `frame_10.png`) — visibly larger than what ECharts' defaults produce (`padding: 5`,
  `~14px` text). Set `tooltip.padding: 14` and `tooltip.textStyle.fontSize: 16` in
  `buildChartOption()` — not an attempt at a pixel-exact match (the reference GIF's original
  capture resolution/DPI is unknown, so an exact px figure isn't recoverable), but enough to make
  the box read as comparably substantial rather than cramped.

## 16. Bar width, per-series hover marker styling, and a real ECharts gotcha (halo not lighting up)

User feedback, all addressed by pixel-measuring/zooming into `specs/reference/frames/` and, for one
item, a live isolated repro rather than by inspection alone:

### 16.1 Bar width

- **Measurement**: `frame_21.png`'s 5 CPA bars are `~29-30px` wide inside a `~118.5px` category
  band (center-to-center distance) — `~25%`. ECharts' default `barWidth` (unset, auto-computed from
  `barCategoryGap`) measured at `~67%` of the band on this chart — visibly "fatter" than the
  reference. Set `barWidth: '25%'` on the bar series explicitly. Re-measured after: `47-48px` bars
  in a `~199.6px` band (`~24%`) — matches.

### 16.2 Hovered-point marker: crisp white+border shape, not a tinted/scaled blob

- **Measurement**: zoomed into `frame_08.png` and `frame_12.png` around the hovered point on each
  series. The marker itself is small, fully opaque, **white-filled with a colored border** — not
  translucent or enlarged. A separate, distinctly *circular*, low-opacity halo sits behind/around
  it, regardless of the marker's own shape:
  - Cost: plain circle marker.
  - ROI confirmed: **diamond** marker (not circle) — only visible on hover, matching its line
    having no persistent marker otherwise.
  - Conversions: its always-visible square marker turns white+bordered *only at the hovered index*;
    every other square along the line stays solid-filled.
- **Fix**: split what was one `emphasis` config (scale + translucent color + `shadowBlur`, from
  T033/§7) into two purposes:
  - `buildPointEmphasis(color)` — the real marker's emphasis, applied to `area`/`spline`/`line`
    series (not `bar`, which keeps its own translucent-glow emphasis from T033 — a bar doesn't
    have a "point" to turn into a small bordered shape, the reference just brightens the bar
    itself). **Colors corrected per direct user feedback** (§16.6) — initially implemented as
    `itemStyle: { color: '#fff', borderColor: color }` (white fill, colored border) from reading
    the crops; the user pointed out live that it's the other way around: `itemStyle: { color,
    borderColor: '#fff' }` — filled in the series' own color, white border.
  - A **separate halo series** per non-bar real series (`buildHaloSeries`, §16.3) for the circular
    glow, since `shadowBlur` on the real marker would blur *that marker's own silhouette* (a
    diamond-shaped blur, a square-shaped blur) — the reference's halo is a plain circle regardless
    of the marker shape underneath.
- Symbols set explicitly per type so there's something well-defined to switch to on emphasis
  (`showSymbol: false` still hides them normally, exactly as established in T033): `area` →
  `circle`, `spline` → `diamond`, `line` keeps its existing always-visible `rect`.

### 16.3 The halo silently never lit up — traced to `tooltip: { show: false }` on the halo series

- **Design**: `buildHaloSeries(series, yAxisIndex)` adds one companion `line` series per non-bar
  real series — same `data`/`yAxisIndex` as its real counterpart, fully invisible normally
  (`showSymbol: false`, `itemStyle: { opacity: 0 }`, `lineStyle: { opacity: 0 }`), with a large
  (`symbolSize: 34`), low-opacity (`0.3`), same-color circle only in its `emphasis` state.
  `silent: true` keeps it out of its own mouse handling. Real series come first in the combined
  `series` array, halo series appended after — `buildRoiVisualMap`'s `seriesIndex` and
  `buildTooltipFormatter`'s `series[point.seriesIndex]` lookup both only ever address the *real*
  first `N` entries, so the formatter explicitly filters out any `seriesIndex >= series.length`
  (a halo) rather than relying on an ECharts-level "exclude from tooltip" option — see why below.
- **First version rendered nothing for the halo at all** — no error, no visible circle, verified by
  pixel-scanning a screenshot around every hovered point and finding zero color deviation from the
  plain background. Root-caused via a live, isolated repro (Playwright driving a direct `import()`
  of the app's bundled `echarts`, iterating on a minimal 1-real + 1-halo-series option) rather than
  by reading ECharts' docs and guessing:
  - Ruled out, each confirmed still working in isolation: `silent: true` on the halo, multiple
    independent y-axes, a non-zero `yAxisIndex` on the halo, `axisPointer: { type: 'none' }`, real
    mouse-driven hover vs. manually dispatching a `highlight` action.
  - Found by isolating the one remaining difference from a working minimal repro: the halo series
    also had `tooltip: { show: false }` (added defensively, to keep it out of the tooltip content,
    which `buildTooltipFormatter`'s index filter already handles on its own). Reproduced with a
    2-series minimal option, toggling only that one field: with `tooltip.show: false`, hovering
    stops including that series in ECharts' default tooltip content *and* the series never enters
    the automatic "highlight every series at the hovered axis index" state that `trigger: 'axis'`
    normally dispatches to every series — so its `emphasis` config never activates, ever. This
    isn't documented anywhere obvious; found purely by bisecting a live reproduction.
  - **Fix**: removed `tooltip: { show: false }` from `buildHaloSeries` entirely. The manual
    `seriesIndex`-based filter in `buildTooltipFormatter` was already sufficient to keep halo data
    out of the rendered tooltip text, so nothing else needed to change — the halo series now
    receives the automatic highlight dispatch like any other series, and its `emphasis` circle
    shows up in sync with its real counterpart for free.

### 16.4 ROI confirmed line: thicker at rest, thinner on hover — revised to implement it directly

- **User observation**: the ROI confirmed line looked thicker in general and thinner specifically
  where the mouse was hovering, comparing screenshots.
- **First pass — investigated, concluded it was an illusion**: zoomed into multiple reference
  frames. In `frame_12.png` (hovering the flat dip), the steep declining segment *above* the hover
  point looked thicker than the flatter segment *at* the hover point. But `frame_04.png` (hovering
  the *steep* segment near `10.06`) showed the same pattern: the steep part right at *that* hover
  point was still the thick-looking one. Since "thick" and "thin" segments appeared together in a
  single frame regardless of where the hover point was, concluded it couldn't be a real
  hover-triggered toggle (`emphasis.lineStyle` is a whole-series override, so a real toggle would
  change the *entire* line, not just one segment) and left it as a bolder constant width only.
- **User re-confirmed the request after seeing the live result** ("при ненаведении зелёная линия
  должна быть жирнее! а при наведении — наоборот. ты посмотри ещё раз"), stated as a direct
  instruction rather than a fresh observation to re-litigate. Implemented as asked rather than
  re-arguing the stills-based analysis: `lineStyle: { width: 4 }` normally,
  `emphasis: { lineStyle: { width: 1.5 } }` on hover. The slope-dependent visual effect from the
  first pass isn't wrong as an *explanation of the reference frames* — it just isn't what the user
  wants implemented here regardless.

### 16.5 The "white" marker wasn't actually turning white — halo painted over it, found by pixel math

- **User report**: "у фиолетовой при наведении снаружи белый, а внутри фиолетовый... а у зелёной —
  белый ромб снаружи и зелёный внутри" — describing the *opposite* of what §16.2 intended (white
  fill, colored border): a colored center with only a paler ring around it.
- **Measurement, not assumption**: sampled the rendered marker's pixels directly. The outer ring
  was the exact, unblended series color (e.g. `(176, 37, 199)`, matching `#B026C7` at full
  saturation) — consistent with the border rendering correctly. The center was `(231, 189, 238)` —
  computed by hand as a linear blend and found to be *exactly* `0.7 × white + 0.3 × (176, 38, 199)`
  (matches to within rounding on all 3 channels) — i.e., the marker's own white fill was real, but
  something 30%-opacity and series-colored was painted over it afterward. That "something" is
  obviously the halo (`buildHaloSeries`'s `emphasis.itemStyle.opacity: 0.3`).
- **Why the border wasn't also tinted, which is what took the longest to explain**: verified with
  an isolated repro that a halo series appended *after* its real marker in the `series` array (thus
  higher default `z`) does *not* uniformly cover the marker — only its fill, not its border stroke.
  This points at zrender (ECharts' renderer) batching fills and strokes as separate passes rather
  than compositing each symbol as one atomic draw; not documented anywhere obvious, found by
  process of elimination (ruled out `silent`, multiple y-axes, `axisPointer`, animation timing,
  `stateAnimation` duration — none of those reproduced or fixed it — before landing on z-order).
- **Fix**: explicit `z` on both sides of the pairing — real point-emphasis series (`area`/`spline`/
  `line`) get `z: 3`, `buildHaloSeries` gets `z: 1` — so the halo is unambiguously behind the marker
  regardless of array position or default per-type z. Verified after the fix: the marker's center
  samples as exact `(255, 255, 255)`, no tint, at multiple wait times (300ms–5s, ruling out this
  ever having been a slow transition that would've resolved on its own).

### 16.6 Marker colors were backwards: fill/border swapped per direct user correction

- **User correction**: "квадратик... снаружи должен быть белый, а внутри — в цвет линии" — the
  fixed-in-§16.5 marker (white fill, colored border) had it backwards; wanted white border, filled
  in the series' own color.
- **Fix**: swapped `buildPointEmphasis`'s two colors — `itemStyle: { color, borderColor: '#fff',
  borderWidth: 2 }` (was `{ color: '#fff', borderColor: color }`). No other change — §16.5's z-order
  fix (halo behind the marker) still applies unchanged, since it was never about which side got
  which color, only about the halo not being allowed to paint over the marker at all. Verified by
  re-sampling the same pixel as §16.5's check: now exact `(176, 38, 199)` (Conversions' own color),
  not white and not a blend.
