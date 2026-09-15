# Quickstart: Overlaid Multi-Series Performance Chart

Validation guide for this feature. Covers standing up the stack, and a runnable scenario per user
story in `spec.md`. Implementation details (file bodies, full test suites) belong in `tasks.md` and
the implementation phase, not here.

## Prerequisites

- Docker + Docker Compose
- `make`
- No local Python or Node install required — everything runs inside the containers, per the
  constitution (Principle II).

## Setup & run (validates User Story 4, FR-014)

```sh
git clone <repo-url>
cd multi-series-chart
make up
```

Expected outcome: both containers build and start; the frontend is reachable at the documented
local URL (e.g. `http://localhost:5173`) and successfully loads chart data from the backend at the
documented API URL (e.g. `http://localhost:8000/api/chart-data`). No step in this flow requires a
locally installed Python interpreter, Node runtime, or globally installed package.

Stop the stack: `make down`.

## Scenario 1 — View the combined chart (User Story 1)

1. With the stack running (`make up`), open the frontend URL in a browser.
2. **Expected**: a single chart renders with 4 overlaid series sharing one date X axis — Cost as a
   filled area, CPA as bars, ROI confirmed as a smoothed line, Conversions as a straight-segment
   line with point markers. All 4 remain individually legible despite differing value magnitudes
   (SC-005).
3. Stop the backend container (`docker compose stop backend`) and reload the frontend.
   **Expected**: a clear error/empty state is shown, not a blank or broken chart (FR-013). Restart
   the backend (`docker compose start backend`) before continuing.

## Scenario 2 — Hover tooltip + halo (User Story 2)

1. With the chart loaded, hover the mouse over any point along the date axis.
2. **Expected**: a single tooltip appears near-instantly, showing the date and all 4 series'
   values, each preceded by a colored dot matching that series' chart color (FR-005); each of the
   4 series shows a halo at that same X position, in its own color (FR-006).
3. Move the mouse to a different X position.
   **Expected**: tooltip content, position, and all 4 halos update together — no stale or
   mismatched values at any point during the move (FR-007).
4. Move the mouse off the chart entirely.
   **Expected**: tooltip and halos disappear with a fast, near-instant fade — clearly not a slow,
   multi-hundred-millisecond animation (FR-008, SC-002).
5. Hover near the first and last dates on the axis.
   **Expected**: the tooltip stays fully within the chart's bounds, repositioning rather than
   clipping (FR-009).

## Scenario 3 — ROI confirmed threshold color split (User Story 3)

1. With the default sample dataset loaded (crossing the threshold at least once — see "Substituting
   data" below to confirm/adjust), inspect the ROI confirmed spline without hovering.
2. **Expected**: the spline shows two flat colors (dark green above the threshold, light green at
   or below it) with a sharp, non-gradient boundary exactly at the date where the value crosses the
   threshold (FR-010, SC-003).
3. Edit the sample dataset's ROI confirmed values so they never cross the threshold (see below),
   restart via `make up`, and reload.
   **Expected**: the entire spline renders in one consistent color — no artificial break is
   introduced.

## Scenario 4 — Substitute your own 4 datasets (User Story 4, SC-004)

1. Locate the backend-side data source documented in the top-level `README.md` (the JSON file(s)
   under `backend/chart/data/`, per `research.md` §3).
2. Replace the values for Cost, CPA, ROI confirmed, and Conversions (and, optionally, the
   `roi_threshold` value) with your own — the file holds only numbers (dates, one array of values
   per series, and the threshold value); colors/types/decimals are fixed in
   `backend/chart/presentation.py` and don't need to be touched (`data-model.md`'s "Fixed Series
   Presentation" note). The HTTP response shape a browser actually receives still matches
   `contracts/chart-api.md` — the service fills in the fixed fields when building it.
3. Run `make up` again.
4. **Expected**: the running chart reflects the new data end-to-end, with no code changes, within
   the "clone to viewing your data" budget of under 10 minutes for a first-time reviewer (SC-004).

## Notes for automated tests (implementation phase)

- Backend contract tests should assert the response shape in `contracts/chart-api.md` exactly
  (field names, `null` handling for missing values, the 4-series/date-alignment invariant from
  `data-model.md`).
- Frontend tests should assert on rendered ECharts `option` (series count/types, tooltip trigger
  mode, `visualMap` pieces for the ROI split) rather than pixel output, since exact fade timing
  (~100–150ms) is a perceptual target (SC-002), not something to assert as a literal millisecond
  value in unit tests.
