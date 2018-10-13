
import { mkel } from './util.js'
import runner from './runner.js'
import OS from './os.js'
import * as apps from './apps.js'
import * as lang from './lang.js'

// some debuggy stuff

let dbg_box = mkel('div')
dbg_box.className = 'debugui'
document.body.appendChild(dbg_box)

function update_debug (s) {
  dbg_box.textContent = `n = ${s.n}`
}

// create the OS

let os = new OS(document.getElementById('main'))

// install apps
os.addApp('story', apps.Hinter)
os.addApp('manual', apps.Manual)
os.addApp('radar', apps.Radar)
os.addApp('shell', apps.Shell)
os.addApp('status', apps.StatusCmd)
os.addApp('cat', apps.CatCmd)
os.addApp('forth', apps.ForthCmd)
os.addApp('forthc', apps.ForthCompilerCmd)
os.addApp('magic', apps.MagicCmd)
os.addApp('rmagic', apps.RemoteMagicCmd)

// add some icons
os.addIcon('huh?', 'story')
os.addIcon('manual', 'manual')
os.addIcon('shell', 'shell')
os.addIcon('radar', 'radar')
os.addIcon('files', 'files')
os.addIcon('editor', 'editor')

// os.launch('story')

// put some things in the window for hacking around

window.os = os
window.lang = lang
window.forth = function (src) {
  return lang.run(lang.parse(src)).res
}

// this is just for the pause button

// window.addEventListener('keypress', e => {
//   if (e.key === ' ') {
//     let paused = runner.pause()
//     dbg_box.classList.toggle('paused', paused)
//   }
// })

// connect the OS to the simulation

let read = function() {
  let s = runner.read()
  // update_debug(s)
  os.tick(s)
  window.requestAnimationFrame(read)
}

read()
