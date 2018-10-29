
import { mkel } from './util.js'
import * as os from './os.js'
import * as apps from './apps.js'
import * as lang from './lang.js'
import runner from './runner.js'

// create the OS

// OS module that interacts with the sim world
let WorldModule = {
  init: function (os) {
    // state
    os.magics = new Map()
    os.magicCounter = 0
    os.expects = new Map()
    // syscalls
    os.syscalls.set('magic', this._magic)
    os.syscalls.set('expect', this._expect)
    // protocols
    os.protocols.set('radio', this._openRadio)
  },
  tick: function () {
    let state = runner.read()
    this.time = state.n

    // update displays
    this.timeBox.textContent = Math.floor(this.time / 10)

    // process any simulation events
    let incoming = new Map()
    for (let e of state.events) {
      if (e.typ === 'res' || e.typ === 'error') {
        // direct results of magic
        let m = this.magics.get(e.id)
        if (m) {
          this.magics.delete(e.id)
          this.wakeProcess(this.getProcess(m.proc), m.tag, e.val)
        }
      } else if (e.typ === 'ret') {
        // named returns
        let ex = this.expects.get(e.tag)
        if (ex) {
          this.expects.delete(ex.inTag)
          this.wakeProcess(this.getProcess(ex.proc), ex.outTag, e.val)
        }
      } else if (e.frequency) {
        // broadcasts
        incoming.set(e.frequency, e.data)
      } else {
        // unknown
        console.log('lost event', e)
      }
    }

    // process streams
    for (let stream of this.streams.values()) {
      // network streams out and in
      if (stream.d === 'tx') {
        let l = stream.lines.pop()
        if (l) {
          runner.command({
            frequency: stream.freq,
            data: l
          })
        }
      } else if (stream.d === 'rx') {
        let inl = incoming.get(stream.freq)
        if (inl) {
          stream.lines.push(inl)
        }
      }
    }
  },
  // syscalls
  _magic: function (proc, data, tag) {
    let id = ++this.magicCounter
    runner.command({
      id: id,
      src: data
    })
    if (tag) {
      this.magics.set(id, {
        proc: proc.id,
        tag: tag
      })
    }
    return id
  },
  _expect: function (proc, inTag, outTag) {
    this.expects.set(inTag, {
      proc: proc.id,
      inTag: inTag,
      outTag: outTag
    })
  },
  // protocols
  _openRadio: function (proc, uri) {
    let freq = parseInt(uri)
    // TODO - keep separate records to avoid annotating streams
    let tx = this.createStream(proc)
    tx.d = 'tx'
    tx.freq = freq
    let rx = this.createStream(proc)
    rx.d = 'rx'
    rx.freq = freq + 1

    return {
      tx: this.addStreamToProcess(proc, tx),
      rx: this.addStreamToProcess(proc, rx)
    }
  }
}

let modules = [
  WorldModule
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
theos.boot()

// put some things in the window for hacking around

window.os = theos
window.lang = lang
window.forth = function (src) {
  return lang.run(lang.parse(src)).res
}
