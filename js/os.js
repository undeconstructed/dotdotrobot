
import runner from './runner.js'
import { assert, mkel } from './util.js'
import * as lang from './lang.js'

const STDIN = 0
const STDOUT = 1

// XXX process and stream really aren't classes, they aren't allowed to do anything without the kernel's consent

class Kernel {
  constructor (element) {
    this.element = element
    this.time = 0
    this.apps = {}
    this.tasks = []
    this.streams = new Map()
    this.streamCounter = this.streams.size
    this.processes = new Map()
    this.processCounter = 0
    this.windows = new Map()
    this.windowCounter = 0
    this.topWindow = null
    this.timeouts = new Map()
    this.timeoutCounter = 0
    // dodgy magic
    this.magics = new Map()
    this.magicCounter = 0
    this.expects = new Map()
    // topbar
    this.topBox = mkel('div', { classes: [ 'os', 'topbar' ] })
    this.timeBox = mkel('div', { classes: [ 'os', 'clock' ] })
    this.topBox.appendChild(this.timeBox)
    // dock
    let dockBox = mkel('div', { classes: [ 'os', 'dockbox' ] })
    this.dockBox = mkel('div', { classes: [ 'os', 'dock' ] })
    dockBox.appendChild(this.dockBox)
    // assemble UI
    this.element.appendChild(this.topBox)
    this.element.appendChild(dockBox)
    // window management
    this.element.addEventListener('mousemove', (e) => {
      if (this.moving) {
        this.doMove(e)
      }
    })
    this.element.addEventListener('mouseup', (e) => {
      if (this.moving) {
        this.stopMove(e)
      }
    })
    // tick
    window.setTimeout(() => this.tick(), 0)
  }
  // external API
  addApp (cmd, app) {
    this.apps[cmd] = app
  }
  addIcon (label, cmd) {
    let n = this.icons++
    let iconCore = mkel('div', { text: label })
    let iconBox = mkel('div', { classes: [ 'os', 'icon' ] })
    iconBox.appendChild(iconCore)
    this.dockBox.appendChild(iconBox)
    iconBox.addEventListener('click', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.launch(cmd)
    })
  }
  launch (cmd, args) {
    let p = this.createProcess(cmd, args)
    if (!p) {
      return null
    }
    this.enqueue(() => p.run())
    return p.id
  }
  // window syscalls
  newWindow (proc, clazz, title, body) {
    let id = this.streamCounter++
    let w = new OSWindow(id, proc.id, clazz, title, body)
    this.windows.set(id, w)

    w.z = 1
    if (this.topWindow) {
      this.topWindow.box.classList.remove('focused')
      w.z = this.topWindow.z + 1
    }
    w.box.style.zIndex = w.z
    w.box.classList.add('focused')
    this.topWindow = w

    w.box.addEventListener('mousedown', (e) => {
      if (w != this.topWindow) {
        this.topWindow.box.classList.remove('focused')
        w.z = this.topWindow.z + 1
        w.box.style.zIndex = w.z
        w.box.classList.add('focused')
        this.topWindow = w
      }
    })
    w.titleBar.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.startMove(e, w)
    }, { capture: false })
    w.closeButton.addEventListener('click', (e) => {
      e.stopPropagation()
      this.wakeProcess(proc.id, 'window_close', id)
    })

    // this.enqueue(() => {
      this.element.appendChild(w.box)
    // })

    return id
  }
  moveWindow (proc, id, x, y) {
    let win = this.windows.get(id)
    if (!win) {
      this.os.crashProcess(proc)
      throw new Error('no window ' + handle)
    }
    win.moveTo(x, y)
  }
  resizeWindow (proc, id, w, h) {
    let win = this.windows.get(id)
    if (!win) {
      this.crashProcess(proc)
      throw new Error('no window ' + id)
    }
    win.resize(w, h)
  }
  closeWindow (proc, id) {
    let w = this.windows.get(id)
    if (!w) {
      this.crashProcess(proc)
      throw new Error('no window ' + id)
    }
    this.removeWindow(w)
  }
  // window internals
  startMove (e, w) {
    this.moving = { x: e.clientX, y: e.clientY, w: w }
  }
  doMove (e) {
    let b = this.moving.w.box
    let dx = e.clientX - this.moving.x
    let dy = e.clientY - this.moving.y
    let nx = b.offsetLeft + dx
    let ny = Math.max(40, b.offsetTop + dy)
    this.moving.w.moveTo(nx, ny)
    this.moving.x = e.clientX
    this.moving.y = e.clientY
  }
  stopMove (e) {
    this.moving = null
  }
  removeWindow (w) {
    this.windows.delete(w.id)
    this.element.removeChild(w.box)
  }
  // stream syscalls
  newStream (proc) {
    let id = this.streamCounter++
    let stream = new Stream(id, proc.id)
    this.streams.set(id, stream)
    return stream
  }
  openStream (proc, url) {
    if (url[0] == 'radio') {
      let tx = this.newStream(proc)
      let rx = this.newStream(proc)
      tx.d = 'tx'
      rx.d = 'rx'
      tx.freq = url[1]
      rx.freq = url[1] + 1
      return { tx, rx }
    }
    return null
  }
  // process syscalls
  launchProcess (proc, cmd, args) {
    let p = this.createProcess(cmd, args)
    if (!p) {
      return -1
    }

    let newStdin = p.handles.get(STDIN)
    let newStdout = p.handles.get(STDOUT)

    let ret = {
      id: p.id,
      in: proc.addStream(newStdin),
      out: proc.addStream(newStdout)
    }

    this.enqueue(() => p.run())

    return ret
  }
  signal (proc, tgt, sig) {
    let tgtProc = this.processes.get(tgt)
    if (tgtProc) {
      if (sig === 9) {
        this.exitProcess(tgtProc)
      } else {
        tgtProc.wake('sig', sig)
      }
    }
  }
  listProcesses (proc) {
    let l = []
    for (let p of this.processes.values()) {
      l.push({
        id: p.id,
        cmd: p.cmd
      })
    }
    return l
  }
  // process internals
  exitProcess (proc) {
    proc.running = false
    if (proc.id) {
      for (let [id, s] of proc.handles) {
        s.unlink(proc.id)
      }
      for (let [id, w] of this.windows) {
        if (w.owner === proc.id) {
          this.removeWindow(w)
          this.windows.delete(id)
        }
      }
      for (let [id, m] of this.magics) {
        if (m.proc === proc.id) {
          this.magics.delete(id)
        }
      }
      for (let [inTag, e] of this.expects) {
        if (e.proc === proc.id) {
          this.expects.delete(inTag)
        }
      }
      for (let [id, t] of this.timeouts) {
        if (t.proc === proc.id) {
          this.timeouts.delete(id)
        }
      }
      // TODO - clean up magics and expects
      this.processes.delete(proc.id)
      proc.id = 0
    }
  }
  crashProcess (proc, e) {
    console.log('crashing', proc, e)
    this.exitProcess(proc)
  }
  // timer syscalls
  setTimeout (proc, time, tag) {
    let id = ++this.timeoutCounter
    this.timeouts.set(id, {
      proc: proc.id,
      tag: tag,
      time: time
    })
    return id
  }
  // hardware syscalls
  magic (proc, data, tag) {
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
  }
  expect (proc, inTag, outTag) {
    this.expects.set(inTag, {
      proc: proc.id,
      inTag: inTag,
      outTag: outTag
    })
  }
  // internals
  enqueue (task) {
    this.tasks.push(task)
  }
  tick () {
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
          this.wakeProcess(m.proc, m.tag, e.val)
        }
      } else if (e.typ === 'ret') {
        // named returns
        let ex = this.expects.get(e.tag)
        if (ex) {
          this.expects.delete(ex.inTag)
          this.wakeProcess(ex.proc, ex.outTag, e.val)
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
      // pump all streams, regardless of state
      this.pump(stream)
    }

    // process timeouts
    for (let [id, t] of this.timeouts) {
      t.time--
      if (t.time <= 0) {
        this.timeouts.delete(id)
        this.wakeProcess(t.proc, t.tag)
      }
    }

    // any other OS tasks
    for (let t of this.tasks) {
      t()
    }
    this.tasks = []

    // tick processes
    for (let [id, p] of this.processes) {
      p.tick()
    }

    window.setTimeout(() => this.tick(), 100)
  }
  pump (stream) {
    if (stream.reader) {
      if (stream.lines.length > 0) {
        let l = stream.lines.pop()
        let r = stream.reader
        stream.reader = null
        this.wakeProcess(r.proc, r.tag, l)
      } else if (!stream.open) {
        let r = stream.reader
        stream.reader = null
        this.wakeProcess(r.proc, r.tag, 0)
      }
    }
    if (stream.procs.size == 0) {
      stream.open = false
      this.streams.delete(stream.id)
    }
  }
  createProcess (cmd, args) {
    let app = this.apps[cmd]
    if (!app) {
      return null
    }
    let loaded = null
    try {
      loaded = new app()
    } catch (e) {
      return null
    }
    app.wake = app.wake || (() => null)
    let id = ++this.processCounter
    let p = new Process(this, id, loaded, args, cmd)
    this.processes.set(id, p)
    return p
  }
  wakeProcess (id, tag, data) {
    let proc = this.processes.get(id)
    assert(proc, 'no process')
    proc.wake(tag, data)
  }
}

class Stream {
  constructor (id, owner) {
    this.id = id
    this.owner = owner
    this.procs = new Set([ owner.id ])
    this.open = true
    this.lines = []
    this.reader = null
  }
  link (proc) {
    if (!this.open) {
      throw new Error('stream closed')
    }
    this.procs.add(proc)
  }
  unlink (proc) {
    this.procs.delete(proc)
    if (this.owner = proc) {
      this.open = false
      this.owner = null
    }
    if (this.reader && this.reader.proc === proc) {
      this.reader = null
    }
  }
  write (i) {
    if (typeof i != 'string') {
      throw new Error('must write string')
    }
    if (!this.open) {
      throw new Error('stream closed')
    }
    this.lines.push(i)
  }
  read (proc, tag) {
    this.reader = { proc: proc.id, tag: tag }
  }
}

class OSWindow {
  constructor (id, owner, clazz, title, body) {
    this.id = id
    this.owner = owner
    this.body = null

    this.box = mkel('div', { classes: ['window'] })

    this.titleBar = mkel('div', { classes: [ 'os', 'title' ] })
    this.titleBox = mkel('div', { text: title })
    this.titleBar.appendChild(this.titleBox)
    let buttonBox = mkel('div', { classes: [ 'buttons' ] })
    this.closeButton = mkel('div', { text: '×' })
    buttonBox.appendChild(this.closeButton)
    this.titleBar.appendChild(buttonBox)
    this.box.appendChild(this.titleBar)

    this.bodyBox = mkel('div', { classes: [ 'body', clazz ] })
    this.box.appendChild(this.bodyBox)

    this.setBody(body)
  }
  moveTo (x, y) {
    this.box.style.left = `${x}px`
    this.box.style.top =`${y}px`
  }
  resize (w, h) {
    this.box.style.width = `${w}px`
    this.box.style.height = `${h}px`
  }
  setBody (element) {
    if (this.body) {
      this.bodyBox.replaceChild(element, this.body)
    } else {
      this.bodyBox.appendChild(element)
    }
    this.body = element
  }
}

const ALL_SYSCALLS = [
  "newWindow",
  "moveWindow",
  "resizeWindow",
  "closeWindow",
  "getTime",
  "getSelf",
  "getHandles",
  "open",
  "read",
  "write",
  "close",
  "exit",
  'signal',
  "launch",
  "listFiles",
  "writeFile",
  "readFile",
  "deleteFile",
  "defer",
  "magic",
  "expect",
  "listProcesses",
  "timeout"
]

class Process {
  constructor (os, id, app, args, cmd) {
    this.os = os
    this.id = id
    this.app = app
    this.cmd = cmd
    app.args = args
    this.tasks = []
    this.inside = 0
    this.handles = new Map()
    this.handles.set(STDIN, os.newStream(this))
    this.handles.set(STDOUT, os.newStream(this))
    this.handleCounter = this.handles.size
  }
  // for OS use
  run () {
    let x = this

    const allowed = new Set(ALL_SYSCALLS)

    const handler = {
      get: function(target, prop, receiver) {
        if (!allowed.has(prop)) {
          console.log('invalid syscall', x.id, prop)
          throw 'invalidcall'
        }
        if (prop === 'defer') {
          return (...args) => x.enqueue(...args)
        }
        return (...args) => {
          console.log('syscall', x.id, prop, args)
          if (x.inside < 1) {
            throw 'notinside'
          }
          return x[prop](...args)
        }
      }
    };

    let iface = new Proxy({}, handler)
    this.app.os = iface

    this.running = true
    this.app.main && this.enqueue(() => {
      this.app.main()
    })
  }
  wake (tag, data) {
    this.enqueue(() => this.app.wake(tag, data))
  }
  tick () {
    let task = this.tasks.shift()
    if (task) {
      this.inside++
      try {
        task(this)
      } catch (e) {
        if (e === 'exit') {
          this.os.exitProcess(this)
        } else {
          this.os.crashProcess(this, e)
        }
      }
      this.inside--
    }
  }
  // syscalls
  newWindow(clazz, title, body) {
    let id = this.os.newWindow(this, clazz, title, body)
    return id
  }
  moveWindow (id, x, y) {
    return this.os.moveWindow(this, id, x, y)
  }
  resizeWindow (id, w, h) {
    return this.os.resizeWindow(this, id, w, h)
  }
  closeWindow (id) {
    let win = this.windows.get(id)
    if (!win) {
      this.os.crash(this)
      throw new Error('no window ' + handle)
    }
    this.os.closeWindow(this, win)
    this.windows.delete(id)
  }
  getTime () {
    return this.os.time
  }
  getSelf () {
    return this.id
  }
  getHandles () {
    let ids = Array.from(this.handles.keys()).join(' ')
    return ids
  }
  open (url) {
    let res = this.os.openStream(this, url)
    if (res) {
      let tx = this.addStream(res.tx)
      let rx = this.addStream(res.rx)
      return { tx, rx }
    }
    return -1
  }
  close (handle) {
    let stream = this.handles.get(handle)
    if (!stream) {
      this.os.crashProcess(this)
      throw new Error('no stream ' + handle)
    }
    stream.unlink(this.id)
    delete this.handles.delete(handle)
  }
  read (handle, tag) {
    let stream = this.handles.get(handle)
    if (!stream) {
      this.os.crash(this)
      throw new Error('no stream ' + handle)
    }
    stream.read(this, tag)
  }
  write (handle, data) {
    let stream = this.handles.get(handle)
    if (!stream) {
      this.os.crash(this)
      throw new Error('no stream ' + handle)
    }
    stream.write(data)
  }
  exit () {
    throw 'exit'
  }
  signal (proc, sig) {
    return this.os.signal(this, proc, sig)
  }
  launch (cmd, args) {
    return this.os.launchProcess(this, cmd, args)
  }
  listFiles () {
    return [ 'file' ]
  }
  writeFile (name, data) {
  }
  readFile(name) {
    return ':fun 1 ; fun fun +'
  }
  deleteFile (name) {
  }
  magic (data, tag) {
    return this.os.magic(this, data, tag)
  }
  expect (inTag, outTag) {
    outTag = outTag || inTag
    return this.os.expect(this, inTag, outTag)
  }
  listProcesses () {
    return this.os.listProcesses()
  }
  timeout (time, tag) {
    return this.os.setTimeout(this, time, tag)
  }
  // internals
  addStream (stream) {
    stream.link(this.id)
    let id = this.handleCounter++
    this.handles.set(id, stream)
    return id
  }
  enqueue (task) {
    this.tasks.push(task)
  }
}

export default Kernel
