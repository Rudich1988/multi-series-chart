# Multi-Series Chart

Интерактивный график с 4 наложенными временными рядами на одной оси дат — Cost (area), CPA
(bar), ROI confirmed (spline, с жёсткой сменой цвета по порогу) и Conversions (line) — с общим
тултипом при наведении и подсветкой (halo) точки каждой серии. Frontend только рендерит данные,
вся бизнес-логика и данные — на backend.

## Стек

- **Backend**: Python, Django + Django Ninja (REST API), Poetry
- **Frontend**: React + TypeScript + Vite + Apache ECharts
- **Инфраструктура**: Docker Compose, весь стек поднимается одной командой (`make up`)

## Предпосылки

- Docker + Docker Compose
- `make`

Локально устанавливать Python или Node не нужно — зависимости backend изолированы в
in-project виртуальном окружении Poetry, зависимости frontend — в локальном `node_modules`;
всё собирается и запускается внутри контейнеров.

## Запуск

```sh
git clone <repo-url>
cd multi-series-chart
make up
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000/api/chart-data

Остановить стек: `make down`. Смотреть логи обоих контейнеров: `make logs`.

Файл `.env` не обязателен — у каждой настройки backend, включая `SECRET_KEY`, есть
безопасное значение по умолчанию, прописанное в `backend/config/settings.py`. Если нужно что-то
переопределить (для реального деплоя, другого CORS origin и т.д.) — скопируйте
`backend/.env.example` в `backend/.env` и укажите нужные значения; `.env` в `.gitignore`, наружу
не уходит.

## Как подставить свои 4 набора данных

1. Откройте `backend/chart/data/sample_dataset.json`. В файле — только числа: массив `dates`,
   по одному массиву значений на каждую серию (`cost`, `cpa`, `roi_confirmed`, `conversions` —
   длина каждого массива равна длине `dates`; `null` — если на эту дату данных нет) и
   `roi_threshold.value` — пороговое значение для ROI confirmed.
2. Замените значения на свои 4 набора данных и, при желании, пороговое значение. Названия
   серий, тип графика (area/bar/spline/line), цвета и точность отображения (`decimals`)
   зафиксированы в `backend/chart/presentation.py` и трогать их не нужно — они не хранятся
   в файле с данными.
3. Запустите `make up` ещё раз.

Пример структуры `sample_dataset.json`:

```json
{
  "dates": ["2026-06-10", "2026-06-11", "2026-06-12", "2026-06-13", "2026-06-14"],
  "series": {
    "cost": [2.04, 25.85, 44.36, 55.65, 63.75],
    "cpa": [0.68, 0.86, 1.23, 0.79, 0.71],
    "roi_confirmed": [610.78, 180.5, 161.47, 56.33, 357.25],
    "conversions": [3, 30, 36, 70, 90]
  },
  "roi_threshold": { "value": 150.0 }
}
```

График отражает новые данные полностью, без изменения кода.

## Тесты и линтер

```sh
make test   # backend: pytest, frontend: vitest
make lint   # backend: ruff check + ruff format --check, frontend: oxlint + prettier --check
```

Backend отформатирован через `ruff` с ограничением строки в 85 символов (`backend/pyproject.toml`,
`[tool.ruff] line-length`). Frontend отформатирован через `prettier` + `oxlint`.

## Структура проекта

- `backend/` — Django + Django Ninja REST API (`chart/` — всё специфичное для домена; архитектурные
  решения и их обоснование — в `specs/001-multi-series-chart/research.md`)
- `frontend/` — React + TypeScript + Vite + ECharts, рендерит график по данным с backend
- `specs/001-multi-series-chart/` — полная спецификация проекта (spec, plan, research, data model,
  контракт API и пошаговый гайд для ручной проверки в `quickstart.md`)
