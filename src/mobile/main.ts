// Телефонная сборка (D57): сначала мост window.recallo к Worker с ядром, затем тот же интерфейс, что на Mac.
// Порядок импортов важен: модули выполняются по порядку, и интерфейс находит мост уже готовым.
import './bridge'
import '../renderer/src/main'
import { keepStorage, startOffline } from './offline'

startOffline()
keepStorage()
