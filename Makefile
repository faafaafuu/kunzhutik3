COMPOSE=docker compose

.PHONY: up down logs bot-logs ps migrate test lint

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f

bot-logs:
	$(COMPOSE) logs -f telegram-bot

ps:
	$(COMPOSE) ps

migrate:
	$(COMPOSE) exec api alembic upgrade head

test:
	cd services/api && python3 -m pytest -q

lint:
	python3 -m compileall services
