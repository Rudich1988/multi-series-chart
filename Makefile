.PHONY: up down logs lint test

up:
	docker compose up --build -d

down:
	docker compose down

logs:
	docker compose logs -f

lint:
	docker compose run --rm backend poetry run ruff check .
	docker compose run --rm backend poetry run ruff format --check .
	docker compose run --rm frontend npm run lint
	docker compose run --rm frontend npm run format:check

test:
	docker compose run --rm backend poetry run pytest
	docker compose run --rm frontend npm run test
