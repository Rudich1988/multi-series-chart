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
      **Note for T023**: `chart/service.py` delegates to `chart/loader.py`'s
      `load_chart_dataset()`, which validates this file via `chart/dataset_schema.py` (Pydantic)
      before merging it with `SERIES_METADATA`/`ROI_THRESHOLD_*_COLOR` to build the
      `SeriesData`/`ROIThresholdConfig` objects — see T023a/T023b below and research.md §12. The
      HTTP response shape itself (`contracts/chart-api.md`) is unchanged.
- [X] T016 Create the `NinjaAPI` instance and router-registration scaffold in
      `backend/api/ninja_app.py`, mounted from `backend/project/urls.py` (depends on T012)
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

- [ ] T021 [P] [US1] Contract test for `GET /chart-data` in
      `backend/chart/tests/contract/test_chart_endpoint.py`, asserting the response shape in
      `contracts/chart-api.md` (dates/series/roi_threshold fields, 4-series invariant, `null`
      handling for missing values)
- [ ] T022 [P] [US1] Unit test for `chart_service.get_chart_dataset()` in
      `backend/chart/tests/unit/test_chart_service.py`, asserting it returns a valid `ChartDataset`
      (dates ascending/unique, exactly 4 series, values aligned to dates) by loading the real
      `sample_dataset.json` end-to-end through `chart/loader.py`
- [ ] T022a [P] [US1] Unit test for `chart/loader.py`'s `load_chart_dataset()` in
      `backend/chart/tests/unit/test_loader.py` — added per research.md §12: assert it raises
      `InvalidDatasetError` on a mismatched-length series and on a missing `SeriesKey`, raises
      `ChartDataUnavailableError` on a missing file, and correctly merges a valid file's raw values
      with `chart/presentation.py`'s fixed metadata

### Implementation for User Story 1

- [ ] T023a [P] [US1] Define `chart/dataset_schema.py` — added per research.md §12: a Pydantic
      `RawDatasetFile` model validating the raw dataset file's shape (`dates` ascending/unique,
      `series: dict[SeriesKey, list[float | None]]` with exactly the 4 keys and each list's length
      matching `dates`, `roi_threshold.value`) — the one file in `chart/` besides `schemas.py` that
      imports `pydantic`, kept separate from `schemas.py` since it validates a different boundary
      (the file, not an HTTP request) with a different lifecycle (once at startup, not per request)
- [ ] T023b [US1] Implement `chart/loader.py`'s `load_chart_dataset(path) -> ChartDataset` — added
      per research.md §12: reads the file, validates via `chart/dataset_schema.py` (raising
      `InvalidDatasetError` on failure, `ChartDataUnavailableError` if the file can't be read),
      merges the validated raw values with `chart/presentation.py`'s `SERIES_METADATA`/
      `ROI_THRESHOLD_*_COLOR`, builds a `ChartDataset` (depends on T014, T015, T017, T023a)
- [ ] T023 [US1] Implement `chart_service.get_chart_dataset()` in `backend/chart/service.py` as a
      thin wrapper delegating to `chart/loader.py`'s `load_chart_dataset(config.DATASET_PATH)` —
      `service.py` itself imports no `pydantic`/`ninja` (depends on T023b)
- [ ] T024 [P] [US1] Define the Pydantic boundary schemas (`ChartDataResponse`, `SeriesSchema`,
      `ROIThresholdSchema`) in `backend/chart/schemas.py`, plus the dataclass↔schema mapping
      functions (depends on T014)
- [ ] T025 [US1] Implement the thin `GET /chart-data` router in `backend/chart/router.py`:
      calls `chart_service.get_chart_dataset()` and returns the mapped schema, no business logic,
      no `try/except`; registered onto the shared `api` instance from `api/ninja_app.py`. **Also
      calls `load_chart_dataset` once at module import time** (research.md §12) so a malformed
      dataset file crashes `make up` immediately with a clear traceback, instead of surfacing as a
      confusing `500`/`503` on the first browser request
      (depends on T023, T024, T016)
- [ ] T026 [P] [US1] Implement the frontend API client `fetchChartData()` in
      `frontend/src/api/chartApi.ts`, calling `${config.apiBaseUrl}/chart-data` and typing the
      result as `ChartDataResponseDto` (depends on T018, T019)
- [ ] T027 [US1] Implement `buildChartOption()` base series mapping (area/bar/spline/line types,
      one independent value scale per series) in
      `frontend/src/components/MultiSeriesChart/buildChartOption.ts` (depends on T019)
- [ ] T028 [US1] Implement `MultiSeriesChart.tsx` in
      `frontend/src/components/MultiSeriesChart/MultiSeriesChart.tsx`: fetches via `chartApi`,
      shows a loading indicator while in flight (FR-013a), shows an error state on failure
      (FR-013), otherwise renders the ECharts instance from `buildChartOption()` (depends on T026,
      T027)
- [ ] T029 [P] [US1] Frontend unit test for `buildChartOption()`'s series construction in
      `frontend/tests/unit/buildChartOption.test.ts` (correct type/color/scale per series)
- [ ] T030 [P] [US1] Frontend integration test for `MultiSeriesChart`'s loading/error/success
      states in `frontend/tests/integration/MultiSeriesChart.test.tsx`

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Inspect exact values at a date via hover (Priority: P2)

**Goal**: A single shared tooltip (date + all 4 colored values) and a per-series halo appear
together on hover, updating live and fading in/out fast.

**Independent Test**: Hover at several X positions on the rendered chart; confirm one tooltip (not
four) with correctly colored rows, 4 simultaneous halos, instant updates on move, fast fade on
enter/leave, and correct in-bounds positioning near the first/last date.

### Tests for User Story 2

- [ ] T031 [P] [US2] Unit test for the tooltip formatter's output (date line + one row per series
      with colored dot + value, "no data" for `null`) in
      `frontend/tests/unit/tooltipFormatter.test.ts`

### Implementation for User Story 2

- [ ] T032 [US2] Add the shared axis-trigger tooltip (`tooltip: { trigger: 'axis' }`, `axisPointer`,
      custom formatter producing the date + 4 colored-dot rows, incl. "no data") to
      `buildChartOption()` in `frontend/src/components/MultiSeriesChart/buildChartOption.ts`
      (depends on T027)
- [ ] T033 [US2] Add per-series `emphasis` halo styling (soft ring in that series' color) for all 4
      series in `buildChartOption()` in the same file (depends on T027)
- [ ] T034 [US2] Configure tooltip fade duration (~100–150ms) and in-bounds
      repositioning near the axis edges (FR-008, FR-009) in `buildChartOption.ts` /
      `MultiSeriesChart.tsx` (depends on T032)
- [ ] T035 [P] [US2] Frontend integration test hovering at multiple X positions (including near the
      first/last date) asserting one tooltip + 4 halos + in-bounds positioning in
      `frontend/tests/integration/hoverInteraction.test.tsx`

**Checkpoint**: User Stories 1 and 2 both work independently.

---

## Phase 5: User Story 3 - Spot ROI confirmed performance zones at a glance (Priority: P3)

**Goal**: The ROI confirmed spline renders in two flat colors with a sharp, non-gradient boundary
exactly at the backend-supplied threshold crossing.

**Independent Test**: With a dataset that crosses the threshold, confirm two distinct flat colors
with a sharp boundary at the crossing date; with a dataset that never crosses it, confirm a single
consistent color.

### Tests for User Story 3

- [ ] T036 [P] [US3] Unit test asserting the `visualMap` piecewise configuration's boundary matches
      `roiThreshold.value` and produces exactly two flat colors, in
      `frontend/tests/unit/buildChartOption.test.ts` (new `describe` block for the ROI series)

### Implementation for User Story 3

- [ ] T037 [US3] Add a piecewise `visualMap` (bound to the `roi_confirmed` series' `lineStyle`
      color, `pieces` derived from `roiThreshold.value`/`aboveColor`/`atOrBelowColor`, values at the
      threshold counted as at/below per spec Edge Cases) in `buildChartOption()` in
      `frontend/src/components/MultiSeriesChart/buildChartOption.ts` (depends on T027)
- [ ] T038 [P] [US3] Add a second fixture whose `roi_confirmed` values never cross the threshold,
      e.g. `backend/chart/tests/fixtures/roi_no_crossing.json`, plus a backend unit test confirming
      the service can serve it unchanged (depends on T023)

**Checkpoint**: All 3 chart-behavior user stories (US1–US3) work independently.

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

- [ ] T039 [US4] Finalize `docker-compose.yml` environment wiring: the frontend's
      `VITE_API_BASE_URL` pointing at the backend service, and the backend's CORS-allowed-origins
      env var pointing at the frontend service (depends on T007, T013)
- [ ] T040 [US4] Finalize `Makefile` targets (`up` builds + starts both services; `down` stops them;
      `logs` tails both) at the repository root (depends on T008)
- [ ] T041 [P] [US4] Write the root `README.md`: prerequisites, `make up`, and step-by-step
      instructions for substituting the 4 datasets by editing `backend/chart/data/sample_dataset.json`
      (mirrors `quickstart.md` Scenario 4), per FR-015
- [ ] T042 [US4] Manually verify `quickstart.md`'s Setup and Scenario 4 end-to-end on a clean clone:
      `make up` from scratch, substitute the dataset, confirm the chart reflects it, and confirm no
      step required a local Python/Node install (depends on T039, T040, T041)

**Checkpoint**: All 4 user stories are independently functional; the project is reviewer-runnable.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final checks spanning all stories.

- [ ] T043 [P] Run every scenario in `quickstart.md` end-to-end against the running stack as final
      validation
- [ ] T044 [P] Add a root `.gitignore` (`.venv`/Poetry venv artifacts, `node_modules`, `__pycache__`,
      `dist`, `.env`)
- [ ] T045 [P] Review `backend/chart/router.py` and `backend/api/` for router thinness, zero
      `try/except`, and zero stray `os.environ()` usage (constitution Principles II, V)
- [ ] T046 [P] Review `frontend/src/` for zero business logic (no client-side threshold/format
      computation — everything sourced from `ChartDataResponseDto`) (constitution Principle II)

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
