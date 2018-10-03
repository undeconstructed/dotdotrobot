
const STDIN = 0
const STDOUT = 1

// XXX process and stream really aren't classes, they aren't allowed to do anything without the kernel's consent

class Kernel {
  constructor (element) {
    this.element = element
    this.time = 0
    this.icons = 0
    this.apps = {}
    this.streams = new Map()
    this.streamCounter = 0
    this.processes = new Map()
    this.processCounter = 0
    this.windows = new Set()
    this.windowCounter = 0
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
    this.timeBox = document.createElement('div')
    this.timeBox.style = 'position: absolute; bottom: 10px; right: 10px;'
    this.element.appendChild(this.timeBox)
  }
  addApp (cmd, app) {
    this.apps[cmd] = app
  }
  addIcon (label, cmd) {
    let n = this.icons++
    let iconBox = document.createElement('div')
    iconBox.classList.add('icon')
    iconBox.style = `top: ${10 * (n + 1) + 50 * n}px;`
    iconBox.textContent = label
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
    this.element.appendChild(win.box0)
    win.box0.addEventListener('mousedown', (e) => {
      if (e.target === win.title0) {
        e.preventDefault()
        this.startMove(e, win)
      }
    }, { capture: false })
    return win
  }
  closeWindow (proc, win) {
    this.windows.delete(win)
    this.element.removeChild(win.box0)
  }
  startMove (e, w) {
    this.moving = { x: e.clientX, y: e.clientY, w: w }
  }
  doMove (e) {
    let b = this.moving.w.box0
    let dx = e.clientX - this.moving.x
    let dy = e.clientY - this.moving.y
    this.moving.w.moveTo(b.offsetLeft + dx, b.offsetTop + dy)
    this.moving.x = e.clientX
    this.moving.y = e.clientY
  }
  stopMove (e) {
    this.moving = null
  }
  exit (proc) {
    proc.running = false
    if (proc.id) {
      for (let stream of proc.handles.values()) {
        stream.unlink(proc)
        if (stream.owner = proc) {
          stream.close()
          stream.owner = null
        }
      }
      for (let win of proc.windows.values()) {
        this.closeWindow(proc, win)
      }
      this.processes.delete(proc.id)
      proc.id = 0
    }
  }
  crash (proc) {
    console.log('crashing', proc.id)
    this.exit(proc)
  }
  newStream (proc) {
    let id = this.streamCounter++
    let stream = new Stream(this, id, proc)
    this.streams.set(id, stream)
    return stream
  }
  tick (state) {
    this.time = state.n
    this.timeBox.textContent = Math.floor(this.time / 10)

    // XXX - OS work shouldn't be tied to animation tick

    // TODO - write to/from network streams

    for (let s of this.streams.values()) {
      if (s.procs.size == 0) {
        this.streams.delete(s.id)
      }
      if (s.reader) {
        if (s.lines.length > 0) {
          let l = s.lines.pop()
          let r = s.reader
          s.reader = null
          this.defer(() => {
            r.proc.wake(r.tag, l)
          })
        } else if (!s.open) {
          let r = s.reader
          s.reader = null
          this.defer(() => {
            r.proc.wake(r.tag, 0)
          })
        }
      }
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
  }
  unlink (proc) {
    this.procs.delete(proc)
    if (this.procs.size == 0) {
      this.open = false
    }
  }
  write (i) {
    if (!this.open) {
      throw new Error('stream closed')
    }
    this.lines.push(i)
  }
  read (proc, tag) {
    this.reader = { proc, tag }
  }
  close () {
    this.open = false
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
    this.windows = new Set()
  }
  addStream (stream) {
    stream.link(this)
    let id = this.handleCounter++
    this.handles.set(id, stream)
    return id
  }
  newWindow(clazz, title) {
    let win = this.os.newWindow(this, clazz, title)
    this.windows.add(win)
    // XXX - this exposes OS internals
    return win
  }
  closeWindow(win) {
    this.os.closeWindow(this, win)
    this.windows.delete(win)
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
  defer (f) {
    this.os.defer((e) => {
      if (!this.running) {
        throw new 'notrunning'
      }
      this.inside++
      try {
        f()
      } catch (e) {
        if (e === 'exit') {
          this.os.exit(this)
        } else {
          this.os.crash(this)
        }
      }
      this.inside--
    })
  }
  run () {
    let x = this

    const allowed = new Set([
      "newWindow",
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
      "defer"
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
          console.log('syscall', x.id, prop)
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
  constructor (os, clazz, title) {
    this.os = os

    this.box0 = document.createElement('div')
    this.box0.classList.add('window')
    this.title0 = document.createElement('div')
    this.title0.classList.add('title')
    this.title0.textContent = title
    this.box0.appendChild(this.title0)
    this.body0 = document.createElement('div')
    this.body0.classList.add('body')
    this.body0.classList.add(clazz)
    this.box0.appendChild(this.body0)
    this.body1 = null
  }
  moveTo (x, y) {
    this.box0.style.left = `${x}px`
    this.box0.style.top =`${y}px`
  }
  resize (w, h) {
    this.box0.style.width = `${w}px`
    this.box0.style.height = `${h}px`
  }
  setBody (element) {
    if (this.body1) {
      this.body0.replaceChild(element, this.body1)
    } else {
      this.body0.appendChild(element)
    }
    this.body1 = element
  }
  close () {
    this.os.closeWindow(this)
  }
}

export default Kernel
