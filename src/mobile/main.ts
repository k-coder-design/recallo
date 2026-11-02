// Phone build (D57): first the window.recallo bridge to the Worker with the core, then the same interface as on the Mac.
// Import order matters: modules run in order, so the interface finds the bridge ready.
import './bridge'
import '../renderer/src/main'
import { keepStorage, startOffline } from './offline'
import { markStandalone } from './viewport'

markStandalone()
startOffline()
keepStorage()
