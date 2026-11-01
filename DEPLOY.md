# Установка Recallo на другой Mac

Инструкция для человека и для ИИ-агента: каждый шаг — готовая команда, без ручных правок файлов. Где нужен интерфейс приложения, это сказано явно.

## Требования

- macOS 13 Ventura или новее.
- Apple Silicon (M1 и новее) или Intel. Проверить: `uname -m` → `arm64` — Apple Silicon, `x86_64` — Intel.
- Для установки из исходников дополнительно: Node.js 22+ и доступ в интернет (npm скачивает зависимости и Electron).

## Комплект

Собирается на Mac, где Recallo уже работает: `npm run kit:mac` → папка `dist/kit/Recallo-<версия>/` и она же одним файлом `dist/kit/Recallo-<версия>.zip` — его и отправляйте. Получатель распаковывает архив двойным кликом и начинает с `START_HERE.md`.

| Файл | Зачем |
| --- | --- |
| `Recallo-<версия>-arm64.dmg` | Готовое приложение для Apple Silicon |
| `Recallo-<версия>-x64.dmg` | Готовое приложение для Intel |
| `Recallo-<версия>-source.zip` | Исходный код — собрать приложение на месте |
| `upgrade-mac.sh` | Обновление уже установленного Recallo с копией базы — см. [UPGRADE.md](UPGRADE.md) |
| `START_HERE.md` | С чего начать: новая установка, обновление или через агента |
| `DEPLOY.md` | Эта инструкция |
| `UPGRADE.md` | Обновление со старых версий: что изменилось, шаги, проверка, откат |
| `AGENT_PROMPT.md` | Готовые промпты для ИИ-агента: новая установка и обновление |
| `SHA256SUMS.txt` | Контрольные суммы: `shasum -a 256 -c SHA256SUMS.txt` |

Слова и прогресс в комплект не входят — их переносят отдельно (раздел «Перенос слов и прогресса»).

## Вариант A. Готовое приложение из DMG (рекомендуется)

Вручную: откройте DMG под свою архитектуру и перетащите Recallo в «Программы».

Командами (агент выполняет из папки с комплектом). Если Recallo уже установлен и открыт, сначала закройте его — агенту нужно согласие пользователя: `osascript -e 'quit app "Recallo"'`. Данные при замене приложения сохраняются.

```bash
ARCH=$(uname -m | sed 's/x86_64/x64/')
DMG=$(ls Recallo-*-"$ARCH".dmg | head -1)
MOUNT=$(mktemp -d)
hdiutil attach -nobrowse -readonly -mountpoint "$MOUNT" "$DMG"
rm -rf /Applications/Recallo.app
ditto "$MOUNT/Recallo.app" /Applications/Recallo.app
hdiutil detach "$MOUNT"
```

Первый запуск. Приложение подписано локально и не нотаризовано Apple, поэтому macOS спросит разрешение:

- правый клик по Recallo в «Программах» → «Открыть» → «Открыть»;
- или «Системные настройки → Конфиденциальность и безопасность» → «Всё равно открыть».

Если macOS пишет, что приложение «повреждено», — это метка «скачано из интернета» на неподписанном приложении. Снимите её (только для Recallo из этого комплекта):

```bash
xattr -dr com.apple.quarantine /Applications/Recallo.app
```

## Вариант B. Сборка из исходников

1. Установите Node.js 22+: с https://nodejs.org или `brew install node`. Проверка: `node -v`.
2. Распакуйте архив и запустите установку — скрипт проверит окружение, поставит зависимости, прогонит проверки и тесты, соберёт приложение под архитектуру этого Mac и скопирует его в «Программы»:

```bash
unzip Recallo-*-source.zip
cd Recallo-*-source
bash scripts/setup-mac.sh
```

Параметры: `--no-install` — только собрать (`dist/mac*/Recallo.app`), не копировать в «Программы»; `--skip-tests` — без проверок, быстрее. Если Recallo уже открыт, установка остановится с просьбой его закрыть — данные при переустановке не теряются. Проверить заранее: `node scripts/mac-app.mjs running` (код выхода 0 — открыт). Процессы MCP-сервера, которые запускает Claude, открытым приложением не считаются.

Собранное на этом же Mac приложение не помечено как скачанное, поэтому macOS не спрашивает разрешения при запуске.

Если `npm ci` не смог собрать модуль базы данных (`better-sqlite3`), установите инструменты разработчика и повторите: `xcode-select --install`.

## Проверка установки

```bash
defaults read /Applications/Recallo.app/Contents/Info.plist CFBundleShortVersionString
open -a Recallo
```

Первая команда печатает версию. После запуска открывается окно Recallo; данные создаются в `~/Library/Application Support/Recallo/` (база `recallo.sqlite`, автокопии в `backups/`).

## Перенос слов и прогресса

Способ 1 — через интерфейс (так делает человек):

1. На старом Mac: Recallo → Settings → Backup → «Create backup…» (или возьмите последний файл из `~/Library/Application Support/Recallo/backups/` — автокопия делается каждый день).
2. Перенесите файл `Recallo backup <дата>.json` на новый Mac.
3. На новом Mac: Settings → Backup → «Restore from backup…» → выберите файл → «Replace and restore».

Способ 2 — копированием базы (подходит агенту, интерфейс не нужен). Recallo должен быть закрыт на обоих Mac (⌘Q):

```bash
# На новом Mac, если файл recallo.sqlite со старого Mac лежит в текущей папке:
mkdir -p ~/Library/Application\ Support/Recallo
cp recallo.sqlite ~/Library/Application\ Support/Recallo/recallo.sqlite
```

Если Recallo на новом Mac уже запускался, его текущая база при этом заменяется — сначала сохраните её копию. На старом Mac безопасная копия открытой базы: `sqlite3 ~/Library/Application\ Support/Recallo/recallo.sqlite ".backup recallo.sqlite"`. Более новая версия Recallo открывает базу старой и обновляет её сама.

## Подключение Claude (MCP)

1. В Recallo: Settings → Agent API → включить (по умолчанию выключено).
2. В Terminal (Claude Code) один раз:

```bash
claude mcp add --scope user recallo -e ELECTRON_RUN_AS_NODE=1 -- "/Applications/Recallo.app/Contents/MacOS/Recallo" "/Applications/Recallo.app/Contents/Resources/app.asar/out/mcp/index.cjs"
```

3. Проверка: `claude mcp list` → `recallo … ✔ Connected` (Recallo должен быть открыт). Для Claude Desktop готовый фрагмент конфигурации — в Settings → Agent API.

Агент работает с карточками, только пока Recallo открыт и Agent API включён; токен хранится у Recallo, в настройки Claude его копировать не нужно.

## Голоса для озвучки

Озвучка использует голоса macOS. Для аргентинского произношения установите голос: «Системные настройки → Универсальный доступ → Устная речь → Системный голос → Управлять голосами…» → Spanish → Argentina (например, Diego Enhanced), затем перезапустите Recallo. Что звучит для каждого варианта — в Settings → Voices.

## Обновление и удаление

- Обновление: закройте Recallo и запустите `bash upgrade-mac.sh` из папки комплекта — он сделает копию базы и заменит приложение. Подробно, с откатом и списком изменений, — [UPGRADE.md](UPGRADE.md). Вручную: новый DMG поверх (Вариант A) или `bash scripts/setup-mac.sh` в новой версии исходников (Вариант B). Данные сохраняются.
- Удаление приложения: `rm -rf /Applications/Recallo.app`. Данные удаляются отдельно и безвозвратно: `~/Library/Application Support/Recallo/` — сначала сделайте копию.

## Сборка комплекта (на исходном Mac)

```bash
npm run kit:mac
```

Собирает в `dist/kit/Recallo-<версия>/` оба DMG, архив исходников без `node_modules` и служебных папок, скрипт обновления и инструкции, считает контрольные суммы и упаковывает папку в `dist/kit/Recallo-<версия>.zip`.
