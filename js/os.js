
import runner from './runner.js'
import * as lang from './lang.js'

const STDIN = 0
const STDOUT = 1

function mkel(tag, opts) {
  opts = opts || {}
  let e = document.createElement(tag)
  if (opts.classes) {
    e.classList.add(...opts.classes)
  }
  if (opts.style) {
    e.style = style
  }
  if (opts.text) {
    e.textContent = opts.text
  }
  return e
}

// XXX process and stream really aren't classes, they aren't allowed to do anything without the kernel's consent

class Kernel {
  constructor (element) {
    this.element = element
    this.time = 0
    this.icons = 0
    this.apps = {}
    this.streams = new Map()
    this.streamCounter = this.streams.size
    this.processes = new Map()
    this.processCounter = 0
    this.windows = new Set()
    this.windowCounter = 0
    this.topWindow = null
    // dodgy magic
    this.magics = new Map()
    this.magicCounter = 0
    // html stuff for desktop
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
    // clock
    this.timeBox = mkel('div')
    this.timeBox.classList.add('clock')
    this.element.appendChild(this.timeBox)
  }
  addApp (cmd, app) {
    this.apps[cmd] = app
  }
  addIcon (label, cmd) {
    let n = this.icons++
    let iconBox = mkel('div', { classes: [ 'os', 'icon' ], text: label })
    iconBox.style = `top: ${10 * (n + 1) + 50 * n}px;`
    this.element.appendChild(iconBox)
    iconBox.addEventListener('dblclick', (e) => {
      e.preventDefault()
      e.stopPropagation()
      this.launch(cmd)
    })
  }
  launch (cmd, parent) {
    let app = this.apps[cmd]
    let loaded = null
    try {
      loaded = new app()
    } catch (e) {
      return null
    }
    let id = ++this.processCounter
    let proc = new Process(this, id, loaded)
    this.processes.set(id, proc)
    let ret = {
      id: id,
    }
    if (parent) {
      let newStdin = proc.handles.get(STDIN)
      let newStdout = proc.handles.get(STDOUT)
      ret.in = parent.addStream(newStdin)
      ret.out = parent.addStream(newStdout)
    }
    this.defer(() => proc.run())
    return ret
  }
  newWindow (proc, clazz, title) {
    let win = new OSWindow(proc, clazz, title)
    this.windows.add(win)
    this.element.appendChild(win.box)
    win.box.addEventListener('mousedown', (e) => {
      if (win != this.topWindow) {
        win.box.style.zIndex = this.topWindow.box.style.zIndex + 1
        this.topWindow = win
      }
    })
    win.titleBar.addEventListener('mousedown', (e) => {
      e.preventDefault()
      this.startMove(e, win)
    }, { capture: false })
    win.box.style.zIndex = (this.topWindow ? this.topWindow.box.style.zIndex + 1 : 1)
    this.topWindow = win
    return win
  }
  closeWindow (proc, win) {
    this.windows.delete(win)
    this.element.removeChild(win.box)
  }
  startMove (e, w) {
    this.moving = { x: e.clientX, y: e.clientY, w: w }
  }
  doMove (e) {
    let b = this.moving.w.box
    let dx = e.clientX - this.moving.x
    let dy = e.clientY - this.moving.y
    this.moving.w.moveTo(b.offsetLeft + dx, b.offsetTop + dy)
    this.moving.x = e.clientX
    this.moving.y = e.clientY
  }
  stopMove (e) {
    this.moving = null
  }
  open (proc, url) {
    let stream = this.newStream(proc)
    // TODO
    return stream
  }
  exit (proc) {
    proc.running = false
    if (proc.id) {
      for (let stream of proc.handles.values()) {
        stream.unlink(proc)
      }
      for (let win of proc.windows.values()) {
        this.closeWindow(proc, win)
      }
      this.processes.delete(proc.id)
      proc.id = 0
    }
  }
  crash (proc, e) {
    console.log('crashing', proc.id, e)
    this.exit(proc)
  }
  newStream (proc) {
    let id = this.streamCounter++
    let stream = new Stream(this, id, proc)
    this.streams.set(id, stream)
    return stream
  }
  magic (proc, data, tag) {
    let id = ++this.magicCounter
    runner.command({
      id: id,
      src: data
    })
    if (tag) {
      this.magics.set(id, {
        proc: proc,
        tag: tag
      })
    }
    return id
  }
  tick (state) {
    this.time = state.n
    this.timeBox.textContent = Math.floor(this.time / 10)

    for (let e of state.events) {
      if (e.typ === 'res') {
        let m = this.magics.get(e.id)
        if (m) {
          this.defer(() => {
            m.proc.wake(m.tag, e.val)
          })
          this.magics.delete(e.id)
        }
      } else {
        console.log('lost event', e)
      }
    }

    // XXX - OS work shouldn't be tied to animation tick

    // TODO - write to/from network streams
  }
  pump (stream) {
    if (stream.reader) {
      if (stream.lines.length > 0) {
        let l = stream.lines.pop()
        let r = stream.reader
        stream.reader = null
        this.defer(() => {
          r.proc.wake(r.tag, l)
        })
      } else if (!stream.open) {
        let r = stream.reader
        stream.reader = null
        this.defer(() => {
          r.proc.wake(r.tag, 0)
        })
      }
    }
    if (stream.procs.size == 0) {
      stream.open = false
      this.streams.delete(stream.id)
    }
  }
  defer (task) {
    window.setTimeout(task, 0)
  }
}

class Stream {
  constructor (os, id, owner) {
    this.os = os
    this.id = id
    this.owner = owner
    this.procs = new Set([ owner ])
    this.open = true
    this.lines = []
    this.reader = null
  }
  link (proc) {
    if (!this.open) {
      throw new Error('stream closed')
    }
    this.procs.add(proc)
    this.os.pump(this)
  }
  unlink (proc) {
    this.procs.delete(proc)
    if (this.owner = proc) {
      this.open = false
      this.owner = null
    }
    this.os.pump(this)
  }
  write (i) {
    if (!this.open) {
      throw new Error('stream closed')
    }
    this.lines.push(i)
    this.os.pump(this)
  }
  read (proc, tag) {
    this.reader = { proc, tag }
    this.os.pump(this)
  }
}

class Process {
  constructor (os, id, app) {
    this.os = os
    this.id = id
    this.app = app
    this.running = false
    this.inside = 0
    this.handles = new Map()
    this.handles.set(STDIN, os.newStream(this))
    this.handles.set(STDOUT, os.newStream(this))
    this.handleCounter = this.handles.size
    this.windows = new Map()
    this.windowCounter = 0
  }
  addStream (stream) {
    stream.link(this)
    let id = this.handleCounter++
    this.handles.set(id, stream)
    return id
  }
  newWindow(clazz, title, body) {
    let win = this.os.newWindow(this, clazz, title)
    let id = ++this.windowCounter
    win.localId = id
    this.windows.set(id, win)
    win.setBody(body)
    return id
  }
  moveWindow (id, x, y) {
    let win = this.windows.get(id)
    if (!win) {
      this.os.crash(this)
      throw new Error('no window ' + handle)
    }
    win.moveTo(x, y)
  }
  resizeWindow (id, w, h) {
    let win = this.windows.get(id)
    if (!win) {
      this.os.crash(this)
      throw new Error('no window ' + handle)
    }
    win.resize(w, h)
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
    let stream = this.os.open(this, url)
    if (stream) {
      return this.addStream(stream)
    }
    return -1
  }
  close (handle) {
    let stream = this.handles.get(handle)
    if (!stream) {
      this.os.crash(this)
      throw new Error('no stream ' + handle)
    }
    stream.unlink(this)
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
  wake (tag, data) {
    this.app.wake && this.defer(() => this.app.wake(tag, data))
  }
  launch (cmd) {
    return this.os.launch(cmd, this)
  }
  onWindowClose (win) {
    this.wake('window_close', win.localId)
  }
  defer (f) {
    this.os.defer((e) => {
      if (!this.running) {
        throw 'notrunning'
      }
      this.inside++
      try {
        f()
      } catch (e) {
        if (e === 'exit') {
          this.os.exit(this)
        } else {
          this.os.crash(this, e)
        }
      }
      this.inside--
    })
  }
  // this is the a syscall to access the other world
  magic (data, tag) {
    return this.os.magic(this, data, tag)
  }
  run () {
    let x = this

    const allowed = new Set([
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
      "launch",
      "defer",
      "magic"
    ])

    const handler = {
      get: function(target, prop, receiver) {
        if (!allowed.has(prop)) {
          console.log('invalid syscall', x.id, prop)
          return null
        }
        if (prop === 'defer') {
          return (...args) => x.defer(...args)
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

    this.running = true
    this.app.main && this.defer(() => {
      this.app.main(iface)
    })
  }
}

class OSWindow {
  constructor (proc, clazz, title) {
    this.proc = proc

    this.box = mkel('div', { classes: ['window'] })

    this.titleBar = mkel('div', { classes: [ 'os', 'title' ] })
    this.titleBox = mkel('div', { text: title })
    this.titleBar.appendChild(this.titleBox)
    let buttonBox = mkel('div', { classes: [ 'buttons' ] })
    let closeButton = mkel('div', { text: 'X' })
    closeButton.addEventListener('click', (e) => {
      e.stopPropagation()
      this.proc.onWindowClose(this)
    })
    buttonBox.appendChild(closeButton)
    this.titleBar.appendChild(buttonBox)
    this.box.appendChild(this.titleBar)

    this.bodyBox = mkel('div', { classes: [ 'body', clazz ] })
    this.box.appendChild(this.bodyBox)

    this.body = null
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

export default Kernel
