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
      `frontend/src/{config,api,types,components/MultiSeriesChart}`, `frontend/tests/{unit,integration}`)
- [X] T002 [P] Initialize the backend Poetry project in `backend/pyproject.toml` with
      `django`, `django-ninja`, `pydantic-settings` as dependencies and
      `virtualenvs.in-project = true` (per constitution Principle II)
- [X] T003 [P] Scaffold the Django project shell in `backend/project/settings.py`,
      `backend/project/urls.py`, `backend/project/asgi.py`, and `backend/manage.py`
      (minimal, unused SQLite `DATABASES` entry per `research.md` §3)
- [X] T004 [P] Initialize the frontend Vite + React + TypeScript project in `frontend/package.json`,
      `frontend/tsconfig.json`, `frontend/vite.config.ts`, `frontend/index.html`, with `echarts` as
      a dependency
- [ ] T005 [P] Write `backend/Dockerfile` (Poetry install into the in-project venv, no global pip
      installs)
- [ ] T006 [P] Write `frontend/Dockerfile` (`npm ci` into local `node_modules`, no global npm
      installs)
- [ ] T007 Write root `docker-compose.yml` wiring the `backend` and `frontend` services together
      with their port mappings (depends on T005, T006)
- [ ] T008 Write root `Makefile` with `up`, `down`, and `logs` targets wrapping
      `docker compose` (depends on T007)
- [ ] T009 [P] Configure backend linting/formatting (ruff + black) in `backend/pyproject.toml`
- [ ] T010 [P] Configure frontend linting/formatting (eslint + prettier) in `frontend/`

**Checkpoint**: `make up` builds both containers (even though they serve nothing feature-specific
yet).

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Infrastructure every user story needs. **No user story work starts before this phase
is done.**

- [ ] T011 [P] Implement the single `Config` (`pydantic-settings` `BaseSettings`) in
      `backend/config/settings.py` (API prefix, allowed CORS origins, dataset file path — no
      `os.environ()` calls anywhere else in the backend)
- [ ] T012 Wire `backend/project/settings.py` to import its values from
      `config.settings.Config` rather than reading environment variables itself (depends on T011;
      research.md §2)
- [ ] T013 [P] Configure CORS in `backend/project/settings.py`, sourcing allowed origins from
      `Config` (depends on T012) — required from the first browser fetch onward, not just at
      deployment time
- [ ] T014 [P] Define the domain dataclasses `SeriesData`, `ChartDataset`, `ROIThresholdConfig` in
      `backend/domain/models.py` per `data-model.md` (no `pydantic`/`ninja` imports)
- [ ] T015 [P] Create the seed dataset `backend/data/sample_dataset.json` (dates + all 4 series'
      values + `roi_threshold`) matching the shape in `contracts/chart-api.md`
- [ ] T016 Create the `NinjaAPI` instance and router-registration scaffold in
      `backend/api/ninja_app.py`, mounted from `backend/project/urls.py` (depends on T012)
- [ ] T017 [P] Define the domain exception(s) (e.g. `ChartDataUnavailableError`) and register their
      `@api.exception_handler(...)` mapping to HTTP responses in `backend/api/exceptions.py`
      (depends on T016; research.md §5)
- [ ] T018 [P] Implement the frontend `Config` in `frontend/src/config/index.ts`, reading
      `import.meta.env.VITE_*` once (no other file reads `import.meta.env` directly)
- [ ] T019 [P] Define the frontend DTO types (`SeriesDto`, `RoiThresholdDto`,
      `ChartDataResponseDto`) in `frontend/src/types/chart.ts` per `data-model.md`
- [ ] T020 [P] Scaffold `frontend/src/App.tsx` and `frontend/src/main.tsx` rendering an empty
      `MultiSeriesChart` container (depends on T004)

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
      `backend/tests/contract/test_chart_endpoint.py`, asserting the response shape in
      `contracts/chart-api.md` (dates/series/roi_threshold fields, 4-series invariant, `null`
      handling for missing values)
- [ ] T022 [P] [US1] Unit test for `chart_service.get_chart_dataset()` in
      `backend/tests/unit/test_chart_service.py`, asserting it loads `sample_dataset.json` into a
      valid `ChartDataset` (dates ascending/unique, exactly 4 series, values aligned to dates)

### Implementation for User Story 1

- [ ] T023 [US1] Implement `chart_service.get_chart_dataset()` in
      `backend/services/chart_service.py`, loading `backend/data/sample_dataset.json` and building
      a `ChartDataset` (depends on T014, T015)
- [ ] T024 [P] [US1] Define the Pydantic boundary schemas (`ChartDataResponse`, `SeriesSchema`,
      `ROIThresholdSchema`) in `backend/api/schemas/chart.py`, plus the dataclass↔schema mapping
      functions (depends on T014)
- [ ] T025 [US1] Implement the thin `GET /chart-data` router in `backend/api/routers/chart.py`:
      calls `chart_service.get_chart_dataset()` once and returns the mapped schema, no business
      logic, no `try/except` (depends on T023, T024, T016)
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
      e.g. `backend/tests/fixtures/roi_no_crossing.json`, plus a backend unit test confirming the
      service can serve it unchanged (depends on T023)

**Checkpoint**: All 3 chart-behavior user stories (US1–US3) work independently.

---

## Phase 6: User Story 4 - Run the project with your own data in one command (Priority: P2)

**Goal**: A reviewer goes from a clean clone to viewing the chart with their own substituted
datasets, using only the README and one command.

**Independent Test**: On a clean checkout, follow only the README to substitute the 4 datasets and
run `make up`; confirm the chart reflects the new data end-to-end.

### Implementation for User Story 4

- [ ] T039 [US4] Finalize `docker-compose.yml` environment wiring: the frontend's
      `VITE_API_BASE_URL` pointing at the backend service, and the backend's CORS-allowed-origins
      env var pointing at the frontend service (depends on T007, T013)
- [ ] T040 [US4] Finalize `Makefile` targets (`up` builds + starts both services; `down` stops them;
      `logs` tails both) at the repository root (depends on T008)
- [ ] T041 [P] [US4] Write the root `README.md`: prerequisites, `make up`, and step-by-step
      instructions for substituting the 4 datasets by editing `backend/data/sample_dataset.json`
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
- [ ] T045 [P] Review `backend/api/routers/chart.py` and `backend/api/` for router thinness, zero
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
- Within US1: T021/T022 (tests) in parallel; T024/T026 in parallel; T029/T030 (tests) in parallel.
- Different user stories (US2, US3, US4) can be staffed in parallel once US1's Foundational output
  (`buildChartOption.ts` skeleton, the live endpoint) exists, since each touches a distinct concern
  within `buildChartOption.ts`/`MultiSeriesChart.tsx` or an entirely separate file (README, Compose).

---

## Parallel Example: User Story 1

```bash
# Tests, together:
Task: "Contract test for GET /chart-data in backend/tests/contract/test_chart_endpoint.py"
Task: "Unit test for chart_service.get_chart_dataset() in backend/tests/unit/test_chart_service.py"

# Backend schema + frontend client, together (independent files):
Task: "Define Pydantic schemas in backend/api/schemas/chart.py"
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
