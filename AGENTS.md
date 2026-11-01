# Recallo — заметки для ИИ-агентов

Десктопное приложение для macOS (Electron + React + SQLite) для запоминания английских и испанских слов. Обзор — [README.md](README.md), фазы и решения — [ROADMAP.md](ROADMAP.md).

## Установить на этот Mac

Следуйте [DEPLOY.md](DEPLOY.md). Коротко: из DMG — раздел «Вариант A»; из исходников — `bash scripts/setup-mac.sh` (нужен Node.js 22+). Проверка: `defaults read /Applications/Recallo.app/Contents/Info.plist CFBundleShortVersionString`.

## Команды

- `npm ci` — зависимости (модуль `better-sqlite3` пересобирается под Electron автоматически).
- `npm run typecheck`, `npm test` — проверки; тесты идут через Electron в режиме Node. Тесты ядра идут на двух базах: проект `mac` (better-sqlite3) и `phone` (SQLite WebAssembly).
- `npm run build:mobile` / `npm run dev:mobile` — Recallo: Mobile для iPhone (D57, этапы W0–W5 в ROADMAP.md). Ядро обращается к базе только через интерфейс `Db` из `src/main/db/types.ts` — не используйте в домене API better-sqlite3 сверх него.
- `npm run dev` — запуск для разработки; отдельная папка данных: `RECALLO_USER_DATA=/tmp/recallo npm run dev`.
- `npm run install:mac` — собрать и установить в /Applications. Recallo должен быть закрыт: проверка `node scripts/mac-app.mjs running` (код 0 — открыт); если открыт, установка откажется сама.
- `npm run kit:mac` — комплект для другого Mac: папка `dist/kit/Recallo-<версия>/` и её `.zip` для отправки. Обновление установленного Recallo — `upgrade-mac.sh` из комплекта, см. [UPGRADE.md](UPGRADE.md).

## Правила

- Данные пользователя — `~/Library/Application Support/Recallo/recallo.sqlite`. Перед любым изменением реальных данных сделайте копию: `sqlite3 <база> ".backup <копия>"`. Карточки меняйте через MCP или REST API Recallo, а не SQL — так соблюдаются проверки и не трогается прогресс.
- Закрывать и переустанавливать запущенное приложение — только с согласия пользователя.
- Интерфейс приложения всегда на английском; документация и комментарии в коде — на русском.
- После изменений, заметных пользователю, обновляйте README.md (возможности, версия) и ROADMAP.md (итог фазы, решение Dnn).
- Бизнес-правила — только в `src/main/domain`; интерфейс, REST API и MCP вызывают один и тот же слой.
