---

description: "Task list for Overlaid Multi-Series Performance Chart"
---

# Tasks: Overlaid Multi-Series Performance Chart

**Input**: Design documents from `/specs/001-multi-series-chart/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/chart-api.md, quickstart.md

**Tests**: Included. Not explicitly mandated by the spec, but `plan.md` already commits to pytest/
vitest as the testing stack and `quickstart.md` documents what backend contract tests and frontend
tests should assert — this task list follows through on that, at a proportionate (not full-TDD)
level, in line with the constitution's "reviewer-grade clarity" principle.

**Organization**: Tasks are grouped by user story (spec.md priorities: US1=P1, US2=P2, US3=P3,
US4=P2) so each story is independently implementable and testable.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Maps the task to its user story (US1–US4)
- File paths are exact, per `plan.md`'s Project Structure

## Path Conventions

Per `plan.md`: `backend/...` (Django + Django Ninja, Poetry-managed) and `frontend/...` (React +
TypeScript + Vite + ECharts, `node_modules`-managed), with `docker-compose.yml`, `Makefile`, and
`README.md` at the repository root.

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repository/project scaffolding — no feature behavior yet.

- [X] T001 Create the top-level `backend/` and `frontend/` directory skeletons per `plan.md`'s
      Project Structure (empty subdirectories: `backend/{config,project,api/{routers,schemas},domain,services,data,tests/{unit,contract,integration}}`,
      `frontend/src/{config,api,types,components/MultiSeriesChart}`, `frontend/tests/{unit,integration}`).
      **Superseded**: the backend skeleton was layer-first (`api/{routers,schemas}`, `domain/`,
      `services/`, `data/`, `tests/` as top-level siblings); restructured domain-first into
      `backend/chart/` (holding `types.py`/`dto.py`/`presentation.py`/`dataset_schema.py`/
      `loader.py`/`exceptions.py`/`service.py`/`schemas.py`/`router.py`/`data/`/`tests/`) with
      only `api/` (shared `NinjaAPI` +
      exception-handler registration), `config/`, and `project/` staying outside it — see
      research.md §11 and `plan.md`'s current Project Structure for the layout actually in place.
- [X] T002 [P] Initialize the backend Poetry project in `backend/pyproject.toml` with
      `django`, `django-ninja`, `pydantic-settings` as dependencies and
      `virtualenvs.in-project = true` (per constitution Principle II). **Superseded**:
      `pydantic-settings` was later removed (T011) once `Config` was rewritten as a plain class;
      `pydantic` (used directly by `chart/dataset_schema.py`) and `python-dotenv` (used directly by
      `BaseConfig`) are the actual current direct dependencies for this concern.
- [X] T003 [P] Scaffold the Django project shell in `backend/project/settings.py`,
      `backend/project/urls.py`, `backend/project/asgi.py`, and `backend/manage.py`
      (minimal, unused SQLite `DATABASES` entry per `research.md` §3)
  - [X] T004 [P] Initialize the frontend Vite + React + TypeScript project in `frontend/package.json`,
        `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, with `echarts` as
        a dependency
- [X] T005 [P] Write `backend/Dockerfile` (Poetry install into the in-project venv, no global pip
      installs)
- [X] T006 [P] Write `frontend/Dockerfile` (`npm ci` into local `node_modules`, no global npm
      installs)
- [X] T007 Write root `docker-compose.yml` wiring the `backend` and `frontend` services together
      with their port mappings (depends on T005, T006)
- [X] T008 Write root `Makefile` with `up`, `down`, and `logs` targets wrapping
      `docker compose` (depends on T007)
- [X] T009 [P] Configure backend linting/formatting (ruff, lint + format) in `backend/pyproject.toml`
- [X] T010 [P] Configure frontend linting/formatting (oxlint + prettier) in `frontend/`

**Checkpoint**: `make up` builds both containers (even though they serve nothing feature-specific
yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story needs. **No user story work starts before this phase
is done.**

- [X] T011 [P] Implement the single config source in `backend/config/settings.py` (API prefix,
      allowed CORS origins, dataset file path — no `os.environ()` calls anywhere else in the
      backend). **Extended later, twice**: (1) `roi_threshold_above_color`/
      `roi_threshold_at_or_below_color` and `log_level` added, initially as `pydantic-settings`
      fields; (2) **superseded**: per user feedback, the whole class was rewritten from
      `pydantic-settings` `BaseSettings` to a plain Python class, `BaseConfig` — reads `.env` via
      `python-dotenv`'s `load_dotenv()` directly (called once at module import), `UPPER_CASE`
      attributes (`SECRET_KEY`, `DEBUG`, `ALLOWED_HOSTS`, `API_PREFIX`, `CORS_ALLOWED_ORIGINS`,
      `DATASET_PATH`, `LOG_LEVEL`); the ROI threshold colors moved out entirely, to a *separate*
      plain class, `PresentationConfig` in **new file `backend/config/presentation.py`**, alongside
      the rest of the series presentation data — see the note under T015. `DEBUG` (default `False`)
      and `ALLOWED_HOSTS` (default `["localhost", "127.0.0.1"]`) are new fields — `ALLOWED_HOSTS`
      wasn't originally requested; adding `DEBUG` surfaced that Django refuses to boot with
      `DEBUG=False` and an empty `ALLOWED_HOSTS` (the scaffold default), so it had to be
      Config-sourced too (research.md §2). `pydantic-settings` was removed from `pyproject.toml`
      (no longer used anywhere); `pydantic` itself was added as an explicit direct dependency
      (already used directly by `chart/dataset_schema.py`, previously only transitive).
- [X] T012 Wire `backend/project/settings.py` to import its values from
      `config.settings.config` (the `BaseConfig` singleton — class renamed from `Config`, see T011)
      rather than reading environment variables itself (depends on T011; research.md §2).
      **Extended later**: added a `LOGGING` dict sourcing its level from `config.LOG_LEVEL` (user
      feedback — no logging existed anywhere; `api/exceptions.py`'s handlers now call
      `logger.exception(exc)`); wired `DEBUG = config.DEBUG` and `ALLOWED_HOSTS = config.ALLOWED_HOSTS`
      (previously `DEBUG = True`/`ALLOWED_HOSTS = []` hardcoded from the scaffold — see T011).
- [X] T013 [P] Configure CORS in `backend/project/settings.py`, sourcing allowed origins from
      `Config` (depends on T012) — required from the first browser fetch onward, not just at
      deployment time
- [X] T014 [P] Define the domain dataclasses `SeriesData`, `ChartDataset`, `ROIThresholdConfig` in
      `backend/chart/dto.py`, with the shared `SeriesKey` enum / `ChartType` literal factored
      out into `backend/chart/types.py` (so `chart/schemas.py` shares one source of truth instead
      of duplicating them), per `data-model.md` (no `pydantic`/`ninja` imports in either file).
      **Superseded file layout**: originally implemented under a top-level `backend/domain/`
      folder; relocated into `backend/chart/` (a domain-first folder, not a technical-layer one) —
      see research.md §11. **Superseded filename**: originally `models.py`; renamed to `dto.py` —
      in Django, `models.py` conventionally means ORM models, and these are plain dataclasses, not
      ORM models (user feedback).
- [X] T015 [P] Create the seed dataset `backend/chart/data/sample_dataset.json` — simplified to
      numbers-only (`dates`, one values array per series, `roi_threshold.value`), not the full
      per-series-object shape from `contracts/chart-api.md` — because `name`/`chart_type`/`color`/
      `decimals` and the two threshold colors are fixed, reference-matched constants, not reviewer
      data; they now live in `backend/config/presentation.py`'s `PresentationConfig` (a plain
      class, no `pydantic`, no `.env` — see research.md §3), with `backend/chart/presentation.py`
      building the domain-typed `SERIES_METADATA` from it.
      **Note for T023**: `chart/loader.py`'s `load_chart_dataset()` validates this
      file via `chart/dataset_schema.py` (Pydantic) before merging it with
      `SERIES_METADATA`/`ROI_THRESHOLD_*_COLOR` to build the `SeriesData`/`ROIThresholdConfig`
      objects — see T023a/T023b below and research.md §12, §13.1. The
      HTTP response shape itself (`contracts/chart-api.md`) is unchanged.
- [X] T016 Create the `NinjaAPI` instance and router-registration scaffold in
      `backend/api/ninja_app.py`, mounted from `backend/project/urls.py` (depends on T012).
      **Extended later**: the actual router-registration *call* moved into a new
      `backend/api/routers.py` (see T025's note) — `ninja_app.py` stays just the bare instance.
- [X] T017 [P] Define the domain exception(s) — `ChartDataUnavailableError` and (added per
      research.md §12) `InvalidDatasetError` — in `backend/chart/exceptions.py` (not
      `api/exceptions.py` as originally written — the service/loader layer needs to raise these, so
      the classes must live in the domain folder, not `api/`, to keep the dependency direction
      correct; see research.md §5) and register their `@api.exception_handler(...)` mapping to HTTP
      responses (`ChartDataUnavailableError` → `503`, `InvalidDatasetError` → `500`, both logged via
      `logger.exception(exc)`) in `backend/api/exceptions.py` (depends on T016; research.md §5, §12)
- [X] T018 [P] Implement the frontend `Config` in `frontend/src/config/index.ts`, reading
      `import.meta.env.VITE_*` once (no other file reads `import.meta.env` directly)
- [X] T019 [P] Define the frontend DTO types (`SeriesDto`, `RoiThresholdDto`,
      `ChartDataResponseDto`) in `frontend/src/types/chart.ts` per `data-model.md`
- [X] T020 [P] Scaffold `frontend/src/App.tsx` and `frontend/src/main.tsx` rendering an empty
      `MultiSeriesChart` container (depends on T004). **Also removed**: the Vite/React demo content
      this displaced — `App.css` and its now-unreferenced assets (`hero.png`, `react.svg`,
      `vite.svg`, `public/icons.svg`), and fixed the leftover `<title>scaffold-tmp</title>` in
      `index.html` (same leftover class as T004's `package.json` name, missed there) to
      "Multi-Series Chart".

**Checkpoint**: Config, domain types, API scaffolding, and frontend scaffolding exist on both
sides — user story implementation can now begin.

---

## Phase 3: User Story 1 - View the combined performance chart (Priority: P1) 🎯 MVP

**Goal**: The 4 series (Cost/area, CPA/bar, ROI confirmed/spline, Conversions/line) render together
on one date axis, sourced from the backend, with loading and error states.

**Independent Test**: Load the page against the backend; confirm all 4 series render, correctly
typed and legible; stop the backend and confirm a clear error state instead of a blank/broken
chart; confirm a loading indicator appears before data arrives.

### Tests for User Story 1

- [X] T021 [P] [US1] Contract test for `GET /chart-data` in
      `backend/chart/tests/contract/test_chart_endpoint.py`, asserting the response shape in
      `contracts/chart-api.md` (dates/series/roi_threshold fields, 4-series invariant, `null`
      handling for missing values). Was red (`404`, no router registered) until T024/T025; now
      passes against the real `GET /api/chart-data` response.
- [X] T022 [P] [US1] Unit test for `chart_service.get_chart_dataset()` in
      `backend/chart/tests/unit/test_chart_service.py`, asserting it returns a valid `ChartDataset`
      (dates ascending/unique, exactly 4 series, values aligned to dates) by loading the real
      `sample_dataset.json` end-to-end. Was red (`ModuleNotFoundError: chart.service`) until T023;
      now passes.
      Added `pytest`/`pytest-django` as dev dependencies and `[tool.pytest.ini_options]`
      (`DJANGO_SETTINGS_MODULE = "project.settings"`) in `pyproject.toml` — no test tooling existed
      before this task.
- [X] T022a [P] [US1] Unit test for `chart/loader.py`'s `load_chart_dataset()` in
      `backend/chart/tests/unit/test_loader.py` — added per research.md §12: assert it raises
      `InvalidDatasetError` on a mismatched-length series and on a missing `SeriesKey`, raises
      `ChartDataUnavailableError` on a missing file, and correctly merges a valid file's raw values
      with `chart/presentation.py`'s fixed metadata, calling `chart.loader.load_chart_dataset`
      directly. **Round-trip note**: briefly folded into `test_chart_service.py` when `loader.py`
      was merged into `ChartService` (research.md §13); restored to its own file in §13.1 when the
      user reverted that merge. **All 4 pass** — `chart/loader.py` was already implemented (built
      ahead of schedule alongside T017).

### Implementation for User Story 1

- [X] T023a [P] [US1] Define `chart/dataset_schema.py` — added per research.md §12: a Pydantic
      `RawDatasetFile` model validating the raw dataset file's shape (`dates` ascending/unique,
      `series: dict[SeriesKey, list[float | None]]` with exactly the 4 keys and each list's length
      matching `dates`, `roi_threshold.value`) — one of the two files in `chart/` that import
      `pydantic` outside `schemas.py` (the other being `loader.py`, see T023b), kept separate
      from `schemas.py` since it validates a different boundary (the file, not an HTTP request)
      with a different lifecycle (once at startup, not per request). Built ahead of schedule
      alongside T017; covered by T022a's tests.
- [X] T023b [US1] Implement `chart/loader.py`'s `load_chart_dataset(path) -> ChartDataset` — added
      per research.md §12: reads the file, validates via `chart/dataset_schema.py` (raising
      `InvalidDatasetError` on failure, `ChartDataUnavailableError` if the file can't be read),
      merges the validated raw values with `chart/presentation.py`'s `SERIES_METADATA`/
      `ROI_THRESHOLD_*_COLOR`, builds a `ChartDataset` (depends on T014, T015, T017, T023a). Built
      ahead of schedule alongside T017; covered by T022a's tests. **Round-trip note**: briefly
      merged into `ChartService` (research.md §13) per an earlier "class-based, no loader.py"
      request, then restored as its own file (§13.1) once the user decided that merge didn't work
      for them — "loader выносим обратно."
- [X] T023 [US1] Implement `ChartService` in `backend/chart/service.py` — a class with one method,
      `get_chart_dataset(self)` (no args, uses `config.DATASET_PATH`), delegating to
      `chart/loader.py`'s `load_chart_dataset(path)`, exported as a singleton
      `chart_service = ChartService()` (same pattern as `config`). `service.py` itself imports no
      `pydantic`/`ninja` — the class wraps `loader.py`, it doesn't absorb it (research.md §13.1;
      an intermediate version briefly did absorb `loader.py` into the class — see §13 — reverted
      per user feedback) (depends on T023b)
- [X] T024 [P] [US1] Define the Pydantic boundary schemas (`ChartDataResponse`, `SeriesSchema`,
      `ROIThresholdSchema`) in `backend/chart/schemas.py`, plus the dataclass↔schema mapping
      functions (depends on T014). The "mapping function" is `ChartDataResponse.from_dataset()`,
      which delegates to Pydantic v2's `model_validate(..., from_attributes=True)` — recursively
      reads the nested `ChartDataset`/`SeriesData`/`ROIThresholdConfig` dataclasses' attributes
      directly, so no hand-written field-by-field copying was needed; verified it reproduces
      `contracts/chart-api.md`'s example response exactly.
- [X] T025 [US1] Implement the thin `GET /chart-data` router in `backend/chart/router.py`:
      calls `chart_service.get_chart_dataset()` and returns the mapped schema, no business logic,
      no `try/except`. **Revised, registration centralized (research.md §11.1)**: originally
      `chart/router.py` self-registered via `api.add_router("", router)` at module level; per user
      feedback (asymmetric with how `api/exceptions.py` centrally registers handlers instead of
      each domain registering its own), that call moved to a new `backend/api/routers.py`
      (`from chart.router import router as chart_router; api.add_router("", chart_router)`) —
      `chart/router.py` itself no longer imports `api` at all. `project/urls.py` now imports
      `api.routers` (not `chart.router` directly) for the side effect, same pattern as
      `api.exceptions` (T017). **Also calls `load_chart_dataset`
      once at module import time** (research.md §12) so a malformed dataset file crashes `make up`
      immediately with a clear traceback, instead of surfacing as a confusing `500`/`503` on the
      first browser request — verified by deliberately truncating a series' values array and
      confirming `manage.py check` fails loudly with the exact validation error, not a silent
      partial boot (depends on T023, T024, T016)
- [X] T026 [P] [US1] Implement the frontend API client `fetchChartData()` in
      `frontend/src/api/chartApi.ts`, calling `${config.apiBaseUrl}/chart-data` and typing the
      result as `ChartDataResponseDto` (depends on T018, T019). **Critical fix found via manual
      browser verification, not by the test suite**: the backend returns snake_case field names
      (`chart_type`, `roi_threshold.above_color`) per `contracts/chart-api.md`, but the frontend
      DTOs are camelCase (`data-model.md`'s "Frontend Types... mirrors the HTTP contract, not the
      backend dataclasses" implies a mapping step). An initial version just did
      `response.json() as ChartDataResponseDto` — a blind cast with no actual mapping — so
      `series.chartType` was `undefined` at runtime and the chart silently rendered nothing (no
      thrown error). Fixed by adding `RawSeries`/`RawRoiThreshold`/`RawChartDataResponse` types
      matching the real wire shape and explicit `toSeriesDto`/`toRoiThresholdDto` mapping
      functions. Caught only because the app was actually opened in a (headless, scripted) browser
      against the real backend — both `buildChartOption`'s unit test and the original
      `MultiSeriesChart` integration test used hand-typed camelCase fixtures that matched the
      *wrong* assumption, so neither failed. T030's test was rewritten as a result (see below).
- [X] T027 [US1] Implement `buildChartOption()` base series mapping (area/bar/spline/line types,
      one independent value scale per series) in
      `frontend/src/components/MultiSeriesChart/buildChartOption.ts` (depends on T019).
      `area`→`line`+`areaStyle`, `bar`→`bar`, `spline`→`line`+`smooth`, `line`→`line`+square
      `symbol` (matching the reference's Conversions markers, data-model.md's Key Entities note).
      Each series gets its own hidden `yAxis` (`scale: true`, so a low-magnitude series like CPA
      isn't flattened against a shared zero-based scale) — satisfies FR-003. `null` values pass
      straight through into ECharts' `data` arrays, which renders them as a gap — satisfies FR-012
      for free, no extra code needed.
- [X] T028 [US1] Implement `MultiSeriesChart.tsx` in
      `frontend/src/components/MultiSeriesChart/MultiSeriesChart.tsx`: fetches via `chartApi`,
      shows a loading indicator while in flight (FR-013a), shows an error state on failure
      (FR-013), otherwise renders the ECharts instance from `buildChartOption()` (depends on T026,
      T027). Uses ECharts' imperative API directly (`echarts.init`/`setOption`/`dispose` in a
      `useEffect`, no extra wrapper dependency like `echarts-for-react`) — matches research.md §6's
      "imperative API or a thin React wrapper."
- [X] T029 [P] [US1] Frontend unit test for `buildChartOption()`'s series construction in
      `frontend/tests/unit/buildChartOption.test.ts` (correct type/color/scale per series)
- [X] T030 [P] [US1] Frontend integration test for `MultiSeriesChart`'s loading/error/success
      states in `frontend/tests/integration/MultiSeriesChart.test.tsx`. **Revised per the T026
      bug**: mocks the network boundary (`global.fetch`, via `vi.stubGlobal`) with realistic
      snake_case backend JSON, not `chartApi` itself — so this test now actually exercises the real
      mapping code and would have caught the T026 bug. `echarts` is still mocked (canvas rendering
      is out of scope for this test; covered instead by manual browser verification below).
      Added `vitest`/`@testing-library/react`/`jsdom` as dev dependencies and a `test` script /
      `vite.config.ts` `test` block / `tests/setup.ts` (RTL `cleanup()`) — no frontend test tooling
      existed before this task, mirroring T022's backend `pytest` setup.

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.
Verified live via `make up` + Playwright (`/usr/bin/google-chrome`) against `quickstart.md`
Scenario 1: (1) success case — chart renders with all 4 series, 1 canvas element, matching the
reference GIF's visual style; (2) `docker compose stop backend` + frontend reload — body text
shows exactly "Failed to load chart data." with 0 canvas elements (FR-013 satisfied, no blank/
broken chart); (3) `docker compose start backend` — frontend recovers to a rendered chart (1
canvas) without a manual page reload, confirming the component doesn't get stuck in the error
state. Stack torn down with `make down` after verification.

---

## Phase 4: User Story 2 - Inspect exact values at a date via hover (Priority: P2)

**Goal**: A single shared tooltip (date + all 4 colored values) and a per-series halo appear
together on hover, updating live and fading in/out fast.

**Independent Test**: Hover at several X positions on the rendered chart; confirm one tooltip (not
four) with correctly colored rows, 4 simultaneous halos, instant updates on move, fast fade on
enter/leave, and correct in-bounds positioning near the first/last date.

### Tests for User Story 2

- [X] T031 [P] [US2] Unit test for the tooltip formatter's output (date line + one row per series
      with colored dot + value, "no data" for `null`) in
      `frontend/tests/unit/tooltipFormatter.test.ts`. **Design decision**: the test targets a new,
      not-yet-implemented pure module `frontend/src/components/MultiSeriesChart/tooltipFormatter.ts`
      exporting `formatTooltip(isoDate: string, rows: TooltipSeriesValue[]): string` — kept separate
      from `buildChartOption.ts` so the HTML-formatting logic (date reformatting, per-series decimal
      precision, "no data" substitution, colored-dot markup) stays independently unit-testable
      without mocking ECharts, mirroring how `buildChartOption.ts` itself is a pure, testable
      function; T032 will wire it into `buildChartOption()`'s `tooltip.formatter`, mapping ECharts'
      raw axis-trigger `params` (plus `data.series[i].name/color/decimals`) into
      `TooltipSeriesValue[]`. Exact row format (colored dot, `Name: value`, `DD.MM.YYYY` date —
      converted from the backend's ISO `YYYY-MM-DD`) taken directly from
      `specs/reference/frames/frame_10.png`. Covers: ISO→`DD.MM.YYYY` date conversion, one row per
      series with value formatted to that series' own `decimals`, series color present per row,
      `null` → "no data" (not a number), and row order preserved. **Was red as expected**
      (`Failed to resolve import ".../tooltipFormatter". Does the file exist?`, verified via
      `docker compose run --rm frontend npm run test -- tooltipFormatter`) — same TDD pattern as
      T021/T022 (test written before the implementation module exists; T032 will make it pass).
      `prettier --write` / `oxlint` clean on the new file.

### Implementation for User Story 2

- [X] T032 [US2] Add the shared axis-trigger tooltip (`tooltip: { trigger: 'axis' }`, `axisPointer`,
      custom formatter producing the date + 4 colored-dot rows, incl. "no data") to
      `buildChartOption()` in `frontend/src/components/MultiSeriesChart/buildChartOption.ts`
      (depends on T027). Makes T031's `tooltipFormatter.ts` real: `buildTooltipFormatter()` wraps
      it, mapping ECharts' `TopLevelFormatterParams` back to `data.series` by `seriesIndex` (not
      array position — the order ECharts calls the formatter with isn't guaranteed to match series
      declaration order). `axisPointer: { type: 'none' }` — the reference
      (`specs/reference/frames/`) has no persistent vertical guide line; only the tooltip + halos
      communicate the hovered X, so no indicator is drawn.
- [X] T033 [US2] Add per-series `emphasis` halo styling (soft ring in that series' color) for all 4
      series in `buildChartOption()` in the same file (depends on T027). One shared `buildEmphasis
      (color)` helper (`scale: 2.5`, `itemStyle: { color, opacity: 0.35, shadowBlur: 20,
      shadowColor: color }`) applied uniformly to all 4 series regardless of chart type — ECharts
      auto-highlights the corresponding data item on every series when `tooltip.trigger: 'axis'`
      fires, so no manual event wiring was needed in `MultiSeriesChart.tsx`. `area`/`spline` switch
      from `symbol: 'none'` to `showSymbol: false`, since `'none'` suppresses the emphasis-state
      symbol too — with `showSymbol: false` the point only appears on hover, matching the
      reference exactly (permanently-visible markers only on the `line` series, per T027).
- [X] T034 [US2] Configure tooltip fade duration (~100–150ms) and in-bounds
      repositioning near the axis edges (FR-008, FR-009) in `buildChartOption.ts` /
      `MultiSeriesChart.tsx` (depends on T032). Both are single `tooltip` option fields, so both
      landed in `buildChartOption.ts` rather than `MultiSeriesChart.tsx`, keeping all ECharts
      config in the one pure/testable function: `transitionDuration: 0.12` (120ms fade, vs.
      ECharts' 400ms default) and `confine: true` (keeps the tooltip inside the chart's bounds,
      auto-flipping side near the first/last date instead of overflowing).
- [X] T035 [P] [US2] Frontend integration test hovering at multiple X positions (including near the
      first/last date) asserting one tooltip + 4 halos + in-bounds positioning in
      `frontend/tests/integration/hoverInteraction.test.tsx`. **Same scope boundary as T030**: real
      mouse-driven canvas hover (halo pixels, live tooltip DOM position) isn't exercisable in
      jsdom without a real ECharts canvas renderer, so `echarts.init` is mocked and the test
      captures the exact `EChartsOption` passed to `setOption()`, then drives `tooltip.formatter`
      directly with fabricated axis-trigger params (the same shape ECharts itself passes) — 4
      tests: all-4-series tooltip content/colors, "no data" for a null value, every series'
      `emphasis.itemStyle.shadowColor` matches its own color (halo configured for all 4, not just
      the ones with visible markers), and `confine`/`transitionDuration` are set correctly. Real
      rendered hover verified manually instead (see checkpoint below).

**Checkpoint**: User Stories 1 and 2 both work independently. Verified live via `make up` (well,
`docker compose up -d`, then `down`) + Playwright (`/usr/bin/google-chrome`) against
`quickstart.md` Scenario 2: hovering mid-chart (12.06.2026) produced one tooltip reading exactly
"12.06.2026 / Cost: 44.36 / CPA: 1.23 / ROI confirmed: 161.47 / Conversions: 36" with correctly
colored dots — pixel-for-pixel matching `specs/reference/frames/frame_10.png` — plus simultaneous
halos on all 4 series (translucent yellow glow on the Cost area, blue glow on the CPA bar, green
ring on the ROI confirmed point, pink ring on the enlarged Conversions marker). Hovering the
first date (10.06.2026) and last date (14.06.2026) reproduced the exact values from
`contracts/chart-api.md`'s sample response and kept the tooltip fully inside the chart bounds,
auto-flipping to the opposite side of the cursor near each edge (FR-009) — no clipping. No console
errors in any case. Fade duration verified via T035's unit-level assertion on
`transitionDuration` (not visually, since a screenshot can't show animation speed).

---

## Phase 5: User Story 3 - Spot ROI confirmed performance zones at a glance (Priority: P3)

**Goal**: The ROI confirmed spline renders in two flat colors with a sharp, non-gradient boundary
exactly at the backend-supplied threshold crossing.

**Independent Test**: With a dataset that crosses the threshold, confirm two distinct flat colors
with a sharp boundary at the crossing date; with a dataset that never crosses it, confirm a single
consistent color.

### Tests for User Story 3

- [X] T036 [P] [US3] Unit test asserting the `visualMap` piecewise configuration's boundary matches
      `roiThreshold.value` and produces exactly two flat colors, in
      `frontend/tests/unit/buildChartOption.test.ts` (new `describe` block for the ROI series).
      **Design decision**: targets `option.visualMap` as a `type: 'piecewise'` config with
      `seriesIndex` pointing at whichever index `roi_confirmed` ends up at in `data.series` (found
      via `.findIndex`, not hardcoded — order-independent, same reasoning as T026/T032's
      `key`-based matching) and exactly 2 `pieces`, colored from `roiThreshold.aboveColor`/
      `atOrBelowColor`. The boundary piece uses `lte`/`gt` (not `max`/`min`, which in ECharts default
      to a `[min, max)` half-open range) specifically so a value exactly equal to
      `roiThreshold.value` is asserted to land in the `lte` (at/below) piece — spec Edge Cases:
      "exactly on the threshold counts as at/below." 3 new tests (targeting/piecewise-type, exactly
      2 colors, boundary placement). **Was red as expected** (`option.visualMap` is `undefined`
      until T037; 3 new tests fail with `TypeError: Cannot read properties of undefined`, the other
      5 existing tests unaffected) — same TDD pattern as T021/T022/T031. `prettier --write`/
      `oxlint`/`tsc -b` clean.

### Implementation for User Story 3

- [X] T037 [US3] Add a piecewise `visualMap` (bound to the `roi_confirmed` series' `lineStyle`
      color, `pieces` derived from `roiThreshold.value`/`aboveColor`/`atOrBelowColor`, values at the
      threshold counted as at/below per spec Edge Cases) in `buildChartOption()` in
      `frontend/src/components/MultiSeriesChart/buildChartOption.ts` (depends on T027). Makes
      T036's test real: `buildRoiVisualMap()` finds `roi_confirmed` by `key` (order-independent),
      builds a `type: 'piecewise'` `visualMap` with `show: false` and two `lte`/`gt` pieces split
      exactly at `roiThreshold.value`. **Critical fix found via manual browser verification, not by
      any test** (same class of bug as T026): the first version left both pieces open-ended
      (`{ lte: value, color }` / `{ gt: value, color }`, relying on ECharts' implicit
      ±Infinity bounds) — this passed T036's unit tests (which only inspect the option object, not
      render it) but crashed the real chart with `Cannot read properties of undefined (reading
      'coord')` inside ECharts 6's `LineView`/`getVisualGradient`, a React error boundary catching
      it and rendering a blank white page. Bisected with a minimal in-browser reproduction (via
      Playwright + a direct `import()` of the app's own `echarts` bundle, isolating `smooth`,
      `showSymbol`, `dimension`, and `seriesIndex` one at a time) down to: ECharts 6's line-color-
      gradient renderer throws on *any* open-ended piece, even in an otherwise-minimal option,
      regardless of those other settings. Fixed by giving both pieces explicit, finite bounds
      derived from the series' own min/max (`Math.min(value, ...roiValues) - 1` /
      `Math.max(value, ...roiValues) + 1`) — every value is within that range by construction, so
      it's behaviorally identical to the open-ended version, just without the crash. T036's tests
      needed no changes (still assert `lte`/`gt` exactly at `roiThreshold.value`, which the fix
      preserves) — confirming, like T026, that config-shape unit tests alone can't catch a renderer
      crash; real browser verification is what caught it.
- [X] T038 [P] [US3] Add a second fixture whose `roi_confirmed` values never cross the threshold,
      e.g. `backend/chart/tests/fixtures/roi_no_crossing.json`, plus a backend unit test confirming
      the service can serve it unchanged (depends on T023). Fixture: same shape/dates as
      `sample_dataset.json`, `roi_confirmed` values `[610.78, 180.5, 300.25, 220.5, 357.25]`, all
      `> 150`. New test in `test_loader.py`,
      `test_load_chart_dataset_serves_a_non_crossing_roi_dataset_unchanged`: loads the fixture via
      `chart.loader.load_chart_dataset` directly (same pattern as the file's other tests — there's
      no way to point the `chart_service` singleton at an arbitrary path, it always reads
      `config.DATASET_PATH`) and asserts the `roi_confirmed` values pass through byte-for-byte
      unchanged and are all `> roi_threshold.value` — confirming the backend has no "crossing"
      special case at all (US3's threshold color split is purely a frontend `visualMap` rendering
      concern on already-loaded values, per T037).

**Checkpoint**: All 3 chart-behavior user stories (US1–US3) work independently. Verified live via
`docker compose up -d`/`down` + Playwright: with the T037 fix applied, the ROI confirmed spline
renders as two genuinely flat colors (dark green above the threshold, bright green at/below) with
a sharp, non-gradient boundary exactly at the dip below 150 — pixel-sampled against
`specs/reference/frames/frame_21.png` beforehand (via Pillow) to confirm the reference itself uses
a hard 2-color split, not a gradient (a naive per-pixel color histogram looked gradient-like at
first, due to anti-aliasing on the thin line's edges; sampling only the most-saturated pixel per
x-column showed exactly 2 flat colors with sharp boundaries). Also re-verified the T037 fix against
T038's non-crossing fixture and a dataset with a `null` gap directly in-browser — neither crashes.
No console errors. Backend: 7/7 pytest passing, `ruff check`/`ruff format --check` clean. Frontend:
20/20 vitest passing, `oxlint`/`prettier`/`tsc -b` clean.

---

## Phase 6: User Story 4 - Run the project with your own data in one command (Priority: P2)

**Goal**: A reviewer goes from a clean clone to viewing the chart with their own substituted
datasets, using only the README and one command.

**Independent Test**: On a clean checkout, follow only the README to substitute the 4 datasets and
run `make up`; confirm the chart reflects the new data end-to-end.

**Deferred, not part of this phase**: a form/upload endpoint as an alternative to editing the file
directly was discussed and explicitly deferred (research.md §12) — reopens the already-clarified
"file-editing, no upload UI" decision for work outside what this assignment evaluates. If it's
ever added, it reuses `chart/dataset_schema.py`'s `RawDatasetFile` as the new route's request-body
type directly — Django Ninja returns `422` on invalid client input automatically, no new
validation/exception code required.

### Implementation for User Story 4

- [X] T039 [US4] Finalize `docker-compose.yml` environment wiring: the frontend's
      `VITE_API_BASE_URL` pointing at the backend service, and the backend's CORS-allowed-origins
      env var pointing at the frontend service (depends on T007, T013). **No `docker-compose.yml`
      change needed** — both sides were already correctly wired since T007/T013: the frontend gets
      `VITE_API_BASE_URL: http://localhost:8000/api` via an explicit `environment:` block (the
      browser needs the host-published port, not the `backend` service hostname, since
      `import.meta.env` is read client-side); the backend's `CORS_ALLOWED_ORIGINS` already
      defaults to `http://localhost:5173` in `config/settings.py`, matching the frontend's
      published port, and stays overridable via `.env` (not moved into `docker-compose.yml`
      `environment:`, which would silently shadow a reviewer's own `.env` override — inconsistent
      with `.env.example`'s "optional override" promise). Considered adding an explicit
      `CORS_ALLOWED_ORIGINS` to the backend's compose `environment:` block for symmetry with the
      frontend, then reverted: it would be redundant with the existing code default and would
      break that override path for no benefit. Verified working, not just by inspection — every
      prior checkpoint's successful cross-origin `fetch()` from the browser (port 5173) to the API
      (port 8000) is only possible if CORS is already correctly configured; a misconfigured origin
      would have surfaced as a CORS console error in those same Playwright runs, and none did.
      **Found and fixed a real doc bug while verifying this**: `backend/.env.example` documented
      `CORS_ALLOWED_ORIGINS=["http://localhost:5173"]` (JSON-array-looking), but
      `config/settings.py` actually parses it as a comma-separated string
      (`.split(",")`) — that literal example would have produced a broken origin
      (`'["http://localhost:5173"]'`, brackets and quotes included) had a reviewer copy-pasted it.
      Fixed the example to the real comma-separated format and added the previously-undocumented
      `ALLOWED_HOSTS`/`DEBUG`/`LOG_LEVEL` overrides for completeness.
- [X] T040 [US4] Finalize `Makefile` targets (`up` builds + starts both services; `down` stops them;
      `logs` tails both) at the repository root (depends on T008). Already complete since T008
      (built ahead of schedule) — `up`/`down`/`logs` all re-verified working during T042's
      checkpoint run, including `make logs` tailing both containers.
- [X] T041 [P] [US4] Write the root `README.md`: prerequisites, `make up`, and step-by-step
      instructions for substituting the 4 datasets by editing `backend/chart/data/sample_dataset.json`
      (mirrors `quickstart.md` Scenario 4), per FR-015. Covers: prerequisites (Docker + `make`, no
      local Python/Node), clone → `make up` (no `.env` setup step — see the SECRET_KEY-default note
      below), the two local URLs, `make down`/`make logs`, dataset substitution steps (mirroring
      `quickstart.md` Scenario 4 — edit `sample_dataset.json`'s numbers only, colors/types/decimals
      are fixed in `chart/presentation.py`), how to run each half's test suite, and a short
      project-layout pointer into `specs/001-multi-series-chart/` for anyone wanting the full
      design record. **Revised after T042**: originally documented `cp backend/.env.example
      backend/.env` with a reminder to set `SECRET_KEY`, as a required step — updated once
      `SECRET_KEY` (and `docker-compose.yml`'s `env_file`) became fully optional (research.md §2),
      so `.env` is now presented purely as an opt-in override.
- [X] T042 [US4] Manually verify `quickstart.md`'s Setup and Scenario 4 end-to-end on a clean clone:
      `make up` from scratch, substitute the dataset, confirm the chart reflects it, and confirm no
      step required a local Python/Node install (depends on T039, T040, T041). Simulated "clean
      clone" by removing both named volumes (`docker compose down -v`, wiping the in-project
      Poetry venv and `node_modules`) rather than actually re-cloning, since `.env` (real,
      git-ignored) needed to stay in place — the volumes are what a real fresh clone wouldn't have
      either. `make up` rebuilt and reinstalled both sides from scratch in ~5s (frontend log:
      "added 116 packages... in 5s"; backend's Poetry resolved instantly from its own image-layer
      cache) and the chart rendered correctly (verified via Playwright, 1 canvas, no console
      errors) — confirms FR-014/SC-004's "single command, no global installs" claim, not just by
      reading the Dockerfiles. Then substituted `sample_dataset.json` with deliberately different
      values (descending Cost/CPA, an oscillating ROI confirmed crossing a new threshold on every
      point, ascending Conversions), ran `make up` again exactly as `quickstart.md` Scenario 4
      documents, and confirmed via a real hovered tooltip that the values were the new ones
      end-to-end (`10.06.2026 / Cost: 999.11 / CPA: 9.11 / ROI confirmed: 42.00 / Conversions:
      111`) with zero code changes — including the US3 threshold color split correctly
      re-evaluating against the new zigzag data and new threshold. Restored `sample_dataset.json`
      to its original committed content afterward (`git diff` confirms no residual change) and
      tore the stack down.

**Checkpoint**: All 4 user stories are independently functional; the project is reviewer-runnable.
Combined with every prior phase's checkpoint (US1–US3, each independently verified live), the
project is now fully reviewer-runnable per FR-014/FR-015/SC-004: clone, `make up`, view the chart,
optionally substitute data and `make up` again — no undocumented step, no local Python/Node
install, no step that only worked because of leftover local state (re-verified from a volumes-wiped
clean state in T042, not just "it still works on my already-set-up machine").

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final checks spanning all stories.

- [X] T043 [P] Run every scenario in `quickstart.md` end-to-end against the running stack as final
      validation. Fresh `make up`, then in one session: **Setup** — both services reachable
      (`200`). **Scenario 1** — 1 canvas, all 4 series rendered; `docker compose stop backend` +
      reload shows exactly "Failed to load chart data." with 0 canvas (FR-013); restarted.
      **Scenario 2** — hovered mid-chart: single tooltip, all 4 colored rows, correct values;
      moved off-chart: confirmed via computed `opacity` (not just DOM presence — text alone
      persists after fade-out since ECharts keeps the tooltip element in the DOM and fades it via
      CSS `opacity`, which a naive "does this text exist" check would misread as "still showing")
      that it actually fades to `opacity: 0`; hovered the first and last dates: tooltip stayed
      fully in-bounds, flipping to the opposite side of the cursor near each edge (FR-009).
      **Scenario 3** — default (crossing) dataset: confirmed the hard 2-color split is still
      correct post-T037-fix; edited `roi_confirmed` to `[610.78, 180.50, 300.25, 220.50, 357.25]`
      (never `<= 150`), `make up` again: spline renders as one consistent dark-green color, no
      artificial break; reverted to the original values (`git diff` confirms no residual change),
      `make up` again: split returns correctly. **Scenario 4** — already exhaustively re-verified
      moments earlier in T042 (substitute → `make up` → confirm end-to-end → restore); not
      repeated identically here since nothing in T043-T046's scope (`.gitignore`, code-cleanliness
      review, `SECRET_KEY` default) touches the substitution path at all. Finished with a full
      re-run of both test suites inside Docker: backend 7/7 pytest + `ruff check`/`ruff format
      --check` clean, frontend 20/20 vitest + `oxlint`/`prettier --check`/`tsc -b` clean. Stack
      torn down (`make down`), working tree confirmed clean of residual data-file edits.
- [X] T044 [P] Add a root `.gitignore` (`.venv`/Poetry venv artifacts, `node_modules`, `__pycache__`,
      `dist`, `.env`). **Investigated before changing anything**: `backend/.venv`,
      `backend/.pytest_cache`, and `backend/.ruff_cache` were already invisible to `git status`,
      but only because each of those tools generates its *own* nested `.gitignore` (`*`) the first
      time it runs — fragile (depends on that generation happening at all) and not reviewer-legible
      from the root `.gitignore` alone. `frontend/node_modules`/`dist` were already covered by
      Vite's scaffolded `frontend/.gitignore` (left as-is — it also covers editor files and logs,
      not just this task's scope). Added explicit root-level rules for all of it
      (`.venv/`, `__pycache__/`, `*.pyc`, `.pytest_cache/`, `.ruff_cache/`, `node_modules/`,
      `dist/`), so the full picture is visible in one place without hunting for nested
      self-ignoring files. `.env`/`!.env.example` were already present from earlier work — kept
      as-is. Verified via `git status --short` before/after: no previously-tracked file became
      newly ignored (this only affects untracked paths).
- [X] T045 [P] Review `backend/chart/router.py` and `backend/api/` for router thinness, zero
      `try/except`, and zero stray `os.environ()` usage (constitution Principles II, V). Clean, no
      changes needed — verified by grep across `backend/`, not just reading the two files in
      isolation: the only `try/except` in application code is in `chart/loader.py` (converts raw
      `OSError`/`ValidationError` into `ChartDataUnavailableError`/`InvalidDatasetError` at the
      file-boundary, exactly where research.md §5's centralized-exception-handling design says it
      belongs — router.py and service.py have zero); `manage.py`'s `try/except ImportError` is
      Django's own unmodified scaffold, out of scope. The only `os.environ`/`os.getenv` calls
      outside `config/settings.py` (the single designated location, research.md §2) are in
      `manage.py`/`wsgi.py`/`asgi.py`'s mandatory `os.environ.setdefault("DJANGO_SETTINGS_MODULE",
      ...)` — Django's own required bootstrap, not application config, and not "business logic"
      reading config ad hoc.
- [X] T046 [P] Review `frontend/src/` for zero business logic (no client-side threshold/format
      computation — everything sourced from `ChartDataResponseDto`) (constitution Principle II).
      Clean, no changes needed — verified by grepping all of `frontend/src` for the threshold value
      (`150`) and any other stray domain constant: the only matches are code comments, not literal
      values in logic. `buildRoiVisualMap()`'s `Math.min`/`Math.max` over the series' own values is
      not business logic — it derives *rendering* bounds (the ECharts crash workaround, T037) for a
      classification (`lte`/`gt` the DTO's own `roiThreshold.value`) that's fully data-driven, not
      a client-side re-derivation of what counts as "above" or "at/below." `tooltipFormatter.ts`'s
      date reformatting (ISO → `DD.MM.YYYY`) and `value.toFixed(decimals)` are presentation
      formatting using a backend-supplied precision (`decimals`), not computed business values —
      matches data-model.md's explicit rationale for shipping `decimals` in the DTO precisely so
      the frontend never has to guess a format.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion (T001–T010) — blocks every user story.
- **User Stories (Phase 3–6)**: All depend on Foundational (Phase 2) completion.
  - US1 (P1) has no dependency on other stories — build it first (MVP).
  - US2 (P2) and US3 (P3) both build on US1's `buildChartOption.ts` and rendered chart, but each
    adds an independent slice (tooltip/halo vs. color split) and is independently testable once
    US1 exists.
  - US4 (P2) depends on Setup's Docker/Compose/Makefile skeleton (T005–T008) and Foundational's
    CORS config (T013), but not on US2/US3 — it can be finished as soon as US1 is running.
- **Polish (Phase 7)**: Depends on all desired user stories being complete.

### Within Each User Story

- Tests (where included) before their corresponding implementation task.
- Backend dataclasses/schemas before the service; service before the router.
- Frontend types/API client before `buildChartOption`; `buildChartOption` before the component that
  consumes it.

### Parallel Opportunities

- Setup: T002, T003, T004, T005, T006, T009, T010 can all run in parallel (distinct files).
- Foundational: T011, T013 (after T012), T014, T015, T017 (after T016), T018, T019, T020 — the
  backend-side and frontend-side tracks are fully parallel with each other.
- Within US1: T021/T022 (tests) in parallel; T023a/T024 in parallel (distinct files, both depend
  only on T014); T023b before T022a/T023 (loader must exist before it can be tested/wrapped);
  T029/T030 (tests) in parallel.
- Different user stories (US2, US3, US4) can be staffed in parallel once US1's Foundational output
  (`buildChartOption.ts` skeleton, the live endpoint) exists, since each touches a distinct concern
  within `buildChartOption.ts`/`MultiSeriesChart.tsx` or an entirely separate file (README, Compose).

---

## Parallel Example: User Story 1

```bash
# Tests, together:
Task: "Contract test for GET /chart-data in backend/chart/tests/contract/test_chart_endpoint.py"
Task: "Unit test for chart_service.get_chart_dataset() in backend/chart/tests/unit/test_chart_service.py"

# Backend schema + frontend client, together (independent files):
Task: "Define Pydantic schemas in backend/chart/schemas.py"
Task: "Implement fetchChartData() in frontend/src/api/chartApi.ts"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1: Setup
2. Phase 2: Foundational (blocking)
3. Phase 3: User Story 1
4. **STOP and VALIDATE** against Scenario 1 in `quickstart.md`
5. This is a demoable MVP: the 4-series chart renders from the real backend, with loading/error
   handling.

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. + User Story 1 → validate via `quickstart.md` Scenario 1 → MVP demo
3. + User Story 2 → validate via Scenario 2 → demo
4. + User Story 3 → validate via Scenario 3 → demo
5. + User Story 4 → validate via Scenario 4 (fresh-clone run) → project is reviewer-ready
6. Phase 7 Polish → final `quickstart.md` full pass

### Parallel Team Strategy

With more than one contributor: complete Setup + Foundational together first (it blocks
everything); then one person can take US1 → US2 → US3 sequentially (they share
`buildChartOption.ts`) while another independently finishes US4 (Docker/Compose/Makefile/README) as
soon as US1's endpoint exists to point the README at.
