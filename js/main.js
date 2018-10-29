
import { mkel } from './util.js'
import * as os from './os.js'
import * as apps from './apps.js'
import * as lang from './lang.js'

// create the OS

class MagicModule {
  init () {
  }
  tick () {
  }
  syscall (name, args) {
  }
}

let modules = [
  MagicModule
]
let defaultApps = [
  ['story', apps.Hinter],
  ['manual', apps.Manual],
  ['radar', apps.Radar],
  ['shell', apps.Shell],
  ['status', apps.StatusCmd],
  ['cat', apps.CatCmd],
  ['every', apps.EveryCmd],
  ['forth', apps.ForthCmd],
  ['forthc', apps.ForthCompilerCmd],
  ['magic', apps.MagicCmd],
  ['rmagic', apps.RemoteMagicCmd],
  ['scan', apps.ScanCmd]
]
let defaultIcons = [
  ['huh?', 'story'],
  ['manual', 'manual'],
  ['shell', 'shell'],
  ['radar', 'radar'],
  ['files', 'files'],
  ['editor', 'editor']
]

let theos = new os.Kernel(document.getElementById('main'), modules, defaultApps, defaultIcons)

// put some things in the window for hacking around

window.os = theos
window.lang = lang
window.forth = function (src) {
  return lang.run(lang.parse(src)).res
}
