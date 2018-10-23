
import { mkel } from './util.js'
import OS from './os.js'
import * as apps from './apps.js'
import * as lang from './lang.js'

// create the OS

let os = new OS(document.getElementById('main'))

// install apps

os.addApp('story', apps.Hinter)
os.addApp('manual', apps.Manual)
os.addApp('radar', apps.Radar)
os.addApp('shell', apps.Shell)
os.addApp('status', apps.StatusCmd)
os.addApp('cat', apps.CatCmd)
os.addApp('every', apps.EveryCmd)
os.addApp('forth', apps.ForthCmd)
os.addApp('forthc', apps.ForthCompilerCmd)
os.addApp('magic', apps.MagicCmd)
os.addApp('rmagic', apps.RemoteMagicCmd)
os.addApp('scan', apps.ScanCmd)

// add some icons

os.addIcon('huh?', 'story')
os.addIcon('manual', 'manual')
os.addIcon('shell', 'shell')
os.addIcon('radar', 'radar')
os.addIcon('files', 'files')
os.addIcon('editor', 'editor')

// launch default apps

os.launch('story')

// put some things in the window for hacking around

window.os = os
window.lang = lang
window.forth = function (src) {
  return lang.run(lang.parse(src)).res
}
