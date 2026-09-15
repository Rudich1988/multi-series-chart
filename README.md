# Multi-Series Chart

An interactive chart overlaying 4 time-series on one date axis — Cost (area), CPA (bar), ROI
confirmed (spline, color-split at a threshold), and Conversions (line) — with a shared hover
tooltip and per-series halo highlighting. Backend: Django + Django Ninja (REST API). Frontend:
React + TypeScript + Apache ECharts. The frontend only renders; all data and business logic live
in the backend.

## Prerequisites

- Docker + Docker Compose
- `make`

No local Python or Node install is required — backend dependencies are isolated in an in-project
Poetry virtual environment and frontend dependencies in a local `node_modules`, both built and run
entirely inside their containers.

## Run it

```sh
git clone <repo-url>
cd multi-series-chart
make up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api/chart-data

Stop the stack with `make down`. Tail both containers' logs with `make logs`.

No `.env` file is required — every backend setting, `SECRET_KEY` included, has a sensible default
baked into `backend/config/settings.py`. For anything beyond local/demo use (a real deployment, a
non-default CORS origin, ...), copy `backend/.env.example` to `backend/.env` and set what you need;
`.env` is git-ignored, so it never leaves your machine.

## Substituting your own data

1. Open `backend/chart/data/sample_dataset.json`. It holds only numbers: a `dates` array, one
   values array per series (`cost`, `cpa`, `roi_confirmed`, `conversions` — same length as
   `dates`, `null` for a missing value on a given date), and `roi_threshold.value`.
2. Replace the values with your own 4 datasets and, optionally, the threshold value. Series
   names, chart types, colors, and display precision are fixed in
   `backend/chart/presentation.py` and don't need to be touched.
3. Run `make up` again.

The running chart reflects the new data end-to-end, with no code changes.

## Tests

```sh
docker compose run --rm backend poetry run pytest
docker compose run --rm frontend npm run test
```

## Project layout

- `backend/` — Django + Django Ninja REST API (`chart/` holds everything domain-specific; see
  `specs/001-multi-series-chart/research.md` for the architecture rationale)
- `frontend/` — React + TypeScript + Vite + ECharts, renders the chart from the backend's data
- `specs/001-multi-series-chart/` — the full spec-driven design record (spec, plan, research,
  data model, API contract, and a step-by-step validation guide in `quickstart.md`)
