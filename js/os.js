
const STDIN = 0
const STDOUT = 1

class Kernel {
  constructor (element) {
    this.element = element
    this.time = 0
    this.icons = 0
    this.apps = {}
    this.streams = []
    this.procCounter = 0
    this.processes = []
    this.windows = []
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
    iconBox.style = `position: absolute; left: 10px; top: ${10 * (n + 1) + 50 * n}px; width: 50px; height: 50px; background-color: gray;`
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
    let id = ++this.procCounter
    let proc = new Process(this, id, loaded)
    this.processes[id] = proc
    let ret = {}
    if (this.parent) {
      let newStdin = proc.handles[STDIN]
      let newStdout = proc.handles[STDOUT]
      let inid = this.parent.addStream(newStdin)
      let outid = this.parent.addStream(newStdout)
      ret = {
        in: inid,
        out: outid
      }
    }
    this.defer(() => proc.run())
    return ret
  }
  newWindow (clazz, title) {
    let w = new OSWindow(this, clazz, title)
    this.windows.push(w)
    this.element.appendChild(w.box0)
    w.box0.addEventListener('mousedown', (e) => {
      if (e.target === w.title0) {
        e.preventDefault()
        this.startMove(e, w)
      }
    }, { capture: false })
    return w
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
    if (proc.id) {
      for (let stream of proc.handles) {
        if (stream.owner = proc) {
          stream.close()
        }
      }
      delete this.processes[proc.id]
      proc.id = 0
    }
  }
  crash (proc) {
    console.log('crashing', proc)
    this.exit(proc)
  }
  newStream () {
    let stream = new Stream(this)
    this.streams.push(stream)
    return stream
  }
  tick (state) {
    this.time = state.n
    this.timeBox.textContent = Math.floor(this.time / 10)

    // TODO - write to/from network streams

    for (let s of this.streams) {
      if (s.reader) {
        if (s.lines.length > 0) {
          let l = s.lines.pop()
          let r = s.reader
          s.reader = null
          this.defer(() => {
            s.reader.proc.wake(s.reader.tag, l)
          })
        } else if (!s.open) {
          let r = s.reader
          s.reader = null
          this.defer(() => {
            s.reader.proc.wake('exit', l)
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
  constructor (os, owner) {
    this.os = os
    this.owner = owner
    this.open = true
    this.lines = []
    this.reader = null
  }
  write (i) {
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
    this.handles = [ os.newStream(), os.newStream() ]
    this.handleCount = this.handles.length
    this.hasWindows = false
  }
  addStream (stream) {
    let id = this.handleCount++
    this.handles[id] = stream
    return id
  }
  newWindow(clazz, title) {
    let window = this.os.newWindow(clazz, title)
    this.hasWindows = true
    return window
  }
  getTime () {
    return os.time
  }
  open (url) {
    let id = ++this.handleCount
    this.os.open(this, url)
    this.handles[id] = url
  }
  close (handle) {
    this.handles[handle].close()
    delete this.handles[handle]
  }
  read (handle, tag) {
    let stream = this.handles[handle]
    if (!stream) {
      this.os.crash(this)
      throw new Error('no stream ' + handle)
    }
    stream.read(this, tag)
  }
  write (handle, data) {
    let stream = this.handles[handle]
    if (!stream) {
      this.os.crash(this)
      throw new Error('no stream ' + handle)
    }
    this.handles[handle].write(data)
  }
  exit () {
    this.os.exit(this)
  }
  recv (tag, data) {
    this.app.recv(tag, data)
  }
  launch (cmd) {
    return this.os.launch(cmd, this)
  }
  run () {
    let x = this
    let iface = {
      newWindow (...args) {
        return x.newWindow(...args)
      },
      getTime () {
        return x.getTime()
      },
      read (...args) {
        return x.read(...args)
      },
      write (...args) {
        return x.write(...args)
      },
      exit () {
        return x.exit()
      },
      launch (...args) {
        return x.launch(...args)
      }
    }
    // TODO - catch
    this.app.main(iface)
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
}

export default Kernel
