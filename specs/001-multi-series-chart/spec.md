# Feature Specification: Overlaid Multi-Series Performance Chart

**Feature Branch**: `001-multi-series-chart`

**Created**: 2026-09-15

**Status**: Draft

**Input**: User description: "Нужен интерактивный график с 4 наложенными time-series на одной оси X (даты): Cost — area, CPA — bar, ROI confirmed — spline, Conversions — line. Референс поведения и стиля — папка specs/reference/frames/ (кадры chart-demo.gif, разложенные по отдельности, frame_01.png ... frame_21.png). Разбери по кадрам и повтори точно: общий тултип при ховере с датой и всеми 4 значениями с цветными кружками; halo-подсветка точки на каждой серии при ховере; быстрый fade тултипа (~100-150мс); жёсткая смена цвета сегмента на spline ROI confirmed при пересечении порога. Данные приходят с backend через REST API, frontend только рендерит. Итоговый результат — GitHub-репозиторий с инструкцией по запуску одной командой и подстановке своих 4 наборов данных."

## Clarifications

Ambiguous points not resolved directly from the reference frames, the constitution, or a clearly
reasonable default (see **Assumptions**) were clarified interactively below.

### Session 2026-09-15

- Q: Should the backend expose all 4 series through a single combined REST endpoint (one response
  with dates + all 4 series' values), or as separate per-series endpoints that the frontend has to
  align by date itself? → A: Single combined endpoint returns all 4 series pre-aligned by date in
  one response.
- Q: When a series has no value for a given date, how should that series' chart mark itself render
  at that date (not just the tooltip row)? → A: Visible gap/break in that series at that date (area
  fill stops, no bar, line/spline breaks) — other series render normally for that date.
- Q: Should the chart show an explicit loading indicator while the initial data request is in
  flight, or show nothing until data arrives (error state only on failure)? → A: Explicit loading
  indicator (e.g., spinner/skeleton) shown until data arrives or an error occurs.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - View the combined performance chart (Priority: P1)

An analyst opens the dashboard and sees Cost, CPA, ROI confirmed, and Conversions plotted
together over the same date axis — Cost as a filled area, CPA as bars, ROI confirmed as a smoothed
(spline) line, and Conversions as a straight-segment line with point markers — so they can compare
all four metrics for the same time window at a glance, without switching between separate charts.

**Why this priority**: This is the chart itself. Without it, nothing else (hover, thresholds) has
anything to act on. It is the minimum slice that delivers visible value.

**Independent Test**: Load the page with a backend-provided dataset and confirm all four series
render, correctly typed (area/bar/spline/line), aligned to one shared date axis, each readable
despite very different value ranges (e.g., CPA ~0.6–1.2 vs ROI confirmed ~50–600).

**Acceptance Scenarios**:

1. **Given** the backend returns data for all 4 series over the same set of dates, **When** the
   page loads, **Then** the chart renders Cost as a filled area, CPA as bars, ROI confirmed as a
   smoothed line, and Conversions as a straight-line series with markers, all sharing one X axis
   of dates.
2. **Given** the four series have very different value magnitudes, **When** the chart renders,
   **Then** every series remains visually legible (none is flattened to a near-flat line by
   another series' scale).
3. **Given** the backend request fails or returns no data, **When** the page loads, **Then** the
   user sees a clear message explaining the chart could not be loaded, instead of a blank or
   broken chart.
4. **Given** the page has just loaded, **When** the initial data request is still in flight,
   **Then** the user sees an explicit loading indicator (e.g., spinner/skeleton) instead of a
   blank area, until the data arrives or the error state (Scenario 3) applies.

---

### User Story 2 - Inspect exact values at a date via hover (Priority: P2)

An analyst moves the mouse across the chart and, at any horizontal position, immediately sees a
single tooltip with that date and all 4 metric values, each labeled with a colored dot matching
its series' color, while the corresponding point on each of the 4 series is highlighted with a
soft halo in that series' color. The tooltip and halo appear and disappear almost instantly as the
mouse moves or leaves the chart.

**Why this priority**: This is the core interactive/analytical payoff of an overlaid chart — the
ability to read precise, correctly-attributed values at any moment without ambiguity. It depends
on Story 1 existing first.

**Independent Test**: Hover over several distinct X positions on a rendered chart and confirm one
tooltip appears per position (not one per series), listing the date and all 4 values with matching
colored dots, and that all 4 series show a halo at that X position simultaneously. Confirm
appearance/disappearance reads as near-instant, not a slow fade.

**Acceptance Scenarios**:

1. **Given** the chart is rendered, **When** the user hovers over a point along the X axis,
   **Then** a single tooltip appears showing the date and the Cost, CPA, ROI confirmed, and
   Conversions values for that date, each preceded by a colored dot matching that series' color in
   the chart.
2. **Given** the user is hovering at a given X position, **When** the tooltip is visible, **Then**
   each of the 4 series shows a halo highlight around its point at that same X position, in that
   series' color.
3. **Given** the user moves the mouse from one X position to another, **When** the new position is
   reached, **Then** the tooltip content, its position, and all 4 halos update together to the new
   date — never showing stale or mismatched values.
4. **Given** the user moves the mouse onto the chart or off it, **When** hover starts or ends,
   **Then** the tooltip and halos appear/disappear with a fast, near-instantaneous fade — clearly
   not a slow (multi-hundred-millisecond) animation.
5. **Given** the user hovers near the first or last date on the axis, **When** the tooltip would
   otherwise render partly outside the chart area, **Then** the tooltip stays fully visible within
   the chart's bounds.

---

### User Story 3 - Spot ROI confirmed performance zones at a glance (Priority: P3)

An analyst looks at the ROI confirmed spline and can immediately tell, from color alone, which
stretches of time were above vs. below a defined performance threshold — the line switches sharply
between a dark-green shade (above threshold) and a light-green shade (at/below threshold) exactly
at the date where the value crosses that threshold, with no gradient blending across the crossing.

**Why this priority**: This is a refinement of the ROI confirmed series introduced in Story 1 — it
adds insight but the chart is already usable without it, so it is lower priority than Stories 1–2.

**Independent Test**: Render a dataset whose ROI confirmed values cross the threshold at least
once, and confirm the spline shows two distinct, flat (non-gradient) colors with a sharp boundary
exactly at the crossing point; render a dataset that never crosses the threshold and confirm the
spline renders in a single consistent color.

**Acceptance Scenarios**:

1. **Given** ROI confirmed values that are above the threshold for a stretch of dates and below it
   for another, **When** the chart renders, **Then** the spline segment over the above-threshold
   stretch is dark green and the segment over the at/below-threshold stretch is light green, with
   a sharp (not gradual) color change at the crossing point.
2. **Given** ROI confirmed values that never cross the threshold, **When** the chart renders,
   **Then** the entire spline renders in the single color matching its threshold state (no
   artificial break is introduced).
3. **Given** the threshold value changes (a different dataset is loaded), **When** the chart
   re-renders, **Then** the color split follows the new threshold, without frontend code changes.

---

### User Story 4 - Run the project with your own data in one command (Priority: P2)

A reviewer clones the repository, follows the README to point the project at their own 4 datasets
(Cost, CPA, ROI confirmed, Conversions), and starts the entire stack — backend and frontend — with
a single command, then sees the chart rendering their substituted data.

**Why this priority**: This is the final deliverable requirement — the project must be evaluable
by someone who is not the original author, with minimal friction. It is independent of the visual
polish in Stories 2–3 (a reviewer must be able to stand the project up even to see those), so it
ranks alongside the hover interaction in priority.

**Independent Test**: On a clean checkout (no pre-existing local setup), follow only the README
instructions to substitute a new set of 4 datasets and start the project with one command; confirm
the chart displays the substituted data end-to-end.

**Acceptance Scenarios**:

1. **Given** a clean clone of the repository, **When** the documented single command is run,
   **Then** both backend and frontend start successfully and the chart is reachable and rendering.
2. **Given** the README's instructions for substituting data, **When** a reviewer replaces the 4
   datasets with their own values, **Then** the running chart reflects the new data without code
   changes.
3. **Given** no dependency is installed globally on the reviewer's machine, **When** the project is
   started, **Then** it still runs correctly (backend and frontend dependencies are fully
   contained within the project/containers).

---

### Edge Cases

- What happens when a series has a missing/null value for a date that other series do have data
  for? The tooltip row for that series must show it distinctly (e.g., "no data") rather than a
  misleading number or a broken layout, and that series' own chart mark must show a visible
  gap/break at that date (no area fill, no bar, line/spline breaks) rather than connecting across
  the gap or rendering a zero — the other series render normally for that same date.
- What happens when the mouse moves rapidly across many X positions in quick succession? Only the
  tooltip and halos for the latest hovered position must be visible — no stacking or lag of stale
  tooltips.
- What happens when the chart has only one data point, or a very large number of points? The chart
  must still render without overlapping/unreadable bars or markers, and hover must still resolve
  to the correct single nearest point.
- What happens when ROI confirmed values sit exactly on the threshold? The spec treats "at
  threshold" as belonging to the at/below-threshold (light green) state, per Story 3's acceptance
  criteria.
- What happens when the backend is temporarily unreachable after the chart has already loaded once
  (e.g., a refresh)? The user must see an explicit error/empty state, not a stale or blank chart
  presented as if it were current.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The system MUST render 4 overlaid time series sharing a single X axis of dates:
  Cost as a filled area, CPA as bars, ROI confirmed as a smoothed (spline) line, and Conversions as
  a straight-segment line with point markers.
- **FR-002**: The system MUST obtain all chart data (values for all 4 series, per date) from a
  single combined backend REST endpoint that returns all 4 series pre-aligned by date in one
  response; the frontend MUST NOT compute, derive, merge/align, or store business data itself — it
  only renders what the API returns.
- **FR-003**: Each series MUST remain visually legible regardless of the other series' value
  ranges (per the reference, magnitudes differ by orders of magnitude between series).
- **FR-004**: Each series MUST have a fixed, distinct color used consistently across the chart
  marks, the tooltip's colored dots, and the halo highlight.
- **FR-005**: On hovering any X position within the chart's date range, the system MUST show a
  single shared tooltip containing the date and the values of all 4 series at that date, each
  value preceded by a colored dot matching that series' chart color.
- **FR-006**: On the same hover, the system MUST highlight the point on each of the 4 series at
  that X position with a soft halo rendered in that series' color, all 4 halos shown together.
- **FR-007**: The tooltip and halos MUST update together, without delay or mismatch, as the
  hovered X position changes.
- **FR-008**: The tooltip and halos MUST appear and disappear with a fast, near-instantaneous
  fade — perceptibly quick (on the order of ~100–150ms), not a slow animation — when hover starts
  or ends.
- **FR-009**: The tooltip MUST remain fully visible within the chart's bounds even when hovering
  near the first or last date (it must reposition rather than clip or overflow).
- **FR-010**: The ROI confirmed spline MUST render in two distinct, flat colors — dark green above
  a threshold value and light green at or below it — switching sharply (no gradient) exactly at
  the date where the value crosses the threshold.
- **FR-011**: The threshold value (and the two colors' meaning) used for FR-010 MUST be determined
  by the backend and delivered to the frontend as data/configuration; the frontend MUST NOT
  hardcode or independently compute the threshold, consistent with "frontend only renders."
- **FR-012**: If a series has no value for a given date, the system MUST represent that clearly in
  the tooltip (e.g., an explicit "no data" indication) rather than omitting the row or showing a
  misleading value, AND that series' own chart mark MUST show a visible gap/break at that date
  (no area fill, no bar, line/spline breaks) — it MUST NOT connect straight across the gap or
  render the missing value as zero. Other series with data for that date render normally.
- **FR-013**: If the backend API is unreachable or returns an error, the system MUST show a clear
  error/empty state instead of a blank, partial, or stale chart.
- **FR-013a**: While the initial data request is in flight, the system MUST show an explicit
  loading indicator (e.g., spinner/skeleton) instead of a blank chart area, until data arrives or
  the error state (FR-013) applies.
- **FR-014**: The complete stack (backend REST API + frontend) MUST start with a single documented
  command, with backend dependencies isolated via Poetry (in-project virtual environment) and
  frontend dependencies isolated via a local `node_modules`, with no global host installs.
- **FR-015**: The repository MUST include a README documenting how to substitute the 4 datasets
  (Cost, CPA, ROI confirmed, Conversions) with new values and how to start the whole stack with
  that single command.
- **FR-016**: The final visual style and hover/threshold behavior MUST match the reference frames
  in `specs/reference/frames/` (chart marks, tooltip layout and content, halo appearance, fast
  fade timing, and hard color-split behavior on ROI confirmed).

### Key Entities

- **Series**: One of the 4 tracked metrics (Cost, CPA, ROI confirmed, Conversions). Attributes:
  identifier/name, chart type (area/bar/spline/line), display color.
- **Data Point**: A single (date, value) pair belonging to one Series. A date may have a missing
  value for a given Series.
- **Chart Dataset**: The full set of Data Points for all 4 Series over a shared date range,
  pre-aligned by date and returned in a single response by one combined backend endpoint for a
  given chart load.
- **ROI Threshold Configuration**: The threshold value and the two color states (above/at-or-below)
  used to split the ROI confirmed spline's rendering, sourced from the backend.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A single hover action reveals all 4 metric values for a date — users never need more
  than one hover to read a complete row of data.
- **SC-002**: Tooltip and halo appearance/disappearance is perceived as immediate — testers
  consistently describe it as "instant"/"fast," not as a visible fade, when compared side-by-side
  against a deliberately slow (~500ms) animation.
- **SC-003**: 100% of rendered points on the ROI confirmed spline are unambiguously assignable to
  one of the two threshold colors, with the color boundary visually aligned to the exact crossing
  point (no visible blended/gradient pixels at the boundary).
- **SC-004**: A reviewer unfamiliar with the project can go from a fresh clone to viewing the chart
  with their own substituted datasets in under 10 minutes, using only the README and one start
  command.
- **SC-005**: All 4 overlapping series remain individually identifiable (by shape/type and color)
  without consulting any documentation outside the chart and its tooltip.

## Assumptions

- The pink page background, left-hand metrics sidebar, and top "Tdy" bar visible in the reference
  frames belong to the third-party tool the reference GIF was captured from — they are page chrome,
  not part of this feature. Only the chart canvas itself (axes, series, tooltip, halo, color-split
  behavior) is in scope for visual/behavioral fidelity.
- Because the 4 series differ in magnitude by orders of magnitude (e.g., CPA ~0.6–1.2 vs ROI
  confirmed ~50–600) yet all remain legible together in the reference, each series is assumed to be
  rendered on its own independent value scale (not one shared linear Y axis) — matching what the
  reference visually implies.
- Number formatting follows the reference: Cost, CPA, and ROI confirmed display with 2 decimal
  places; Conversions displays as a whole number. Dates display as `DD.MM.YYYY`.
- Data granularity/volume is assumed to be daily points over a typical reporting window (on the
  order of tens to low hundreds of points); no gap-filling or resampling logic is implied — the
  frontend renders whichever dates the backend returns, in order.
- No authentication/authorization is in scope — this is an evaluation project, not a
  multi-tenant product.
- No explicit chart legend is required beyond the tooltip's colored dots plus labels, since the
  reference does not show one; if a legend is later desired, it is out of scope for this spec.
- "Substituting datasets" (User Story 4) means editing a documented, backend-side data source
  (e.g., seed/config files consumed by the API) — not requiring any frontend code change — and does
  not require a data-upload UI.
- Desktop browser usage is assumed as the primary target; no specific mobile/responsive behavior
  is implied by the reference frames.
