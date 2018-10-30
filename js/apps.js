
import { mkel } from './util.js'
import * as lang from './lang.js'
import * as os from './os.js'

export class Lib {
  constructor () {
    this.cbs = new Map()
    this.cbCount = 0
  }
  queue (task) {
    let id = 'cb-' + this.cbCount++
    this.cbs.set(id, task)
    this.defer(id)
  }
  wake (tag, data) {
    let t = this.cbs.get(tag)
    if (t) {
      this.cbs.delete(tag)
      t(data)
    }
  }
  print (line) {
    this.sys('write', os.STDOUT, line)
  }
  read (cb) {
    let id = 'cb-' + this.cbCount++
    this.cbs.set(id, t)
    this.sys('read', os.STDIN, id)
  }
  gets (tag) {
    this.sys('read', os.STDIN, tag)
  }
  newWindow (title, clazz, body) {
    let win = this.sys('newWindow', title, clazz)
    document.getElementById(win.bd).appendChild(body)
    return win.id
  }
}

export class StatusCmd extends Lib {
  main () {
    this.print('not good')
    this.exit()
  }
}

export class CatCmd extends Lib {
  main () {
    this.gets('in')
  }
  loop () {
    this.read()
  }
  wake (tag, data) {
    super.wake(tag, data)

    if (tag === 'in') {
      if (data === '') {
        this.exit()
      } else {
        this.print(`read: ${data}`)
        this.gets('in')
      }
    } else if (tag === 'sig') {
      this.print(`sig: ${data}`)
    }
  }
}

export class EveryCmd extends Lib {
  main () {
    this.sys('timeout', 10, 'ping')
  }
  wake (tag, data) {
    if (tag === 'ping') {
      this.print(`ping`)
      this.sys('timeout', 10, 'ping')
    } else if (tag === 'sig') {
      this.exit(0)
    }
  }
}

export class ForthCmd extends Lib {
  main () {
    this.gets('in')
  }
  wake (tag, data) {
    if (tag === 'in') {
      if (data === '') {
        this.exit()
      } else {
        let res = this.run(data)
        this.print(res)
        this.gets('in')
      }
    }
  }
  run (src) {
    try {
      return '' + lang.run(lang.parse(src)).res
    } catch (e) {
      return '' + e
    }
  }
}

export class ForthCompilerCmd extends Lib {
  main () {
    let file = this.args[1]
    if (!file) {
      this.print(`usage: ${this.args[0]} <file>`)
      this.exit(1)
    }
    let data = this.sys('readFile', file)
    try {
      let res = lang.parse(data)
      this.print(`binary: ${JSON.stringify(res)}`)
    } catch (e) {
      this.print(`error: ${e}`)
    }
    this.exit()
  }
}

export class MagicCmd extends Lib {
  main () {
    this.gets('in')
  }
  wake (tag, data) {
    if (tag === 'in') {
      if (data === '') {
        this.exit()
      } else {
        this.sys('magic', data, 'res')
      }
    } else if (tag === 'res') {
      this.print(`rx: ${data}`)
      this.gets('in')
    }
  }
}

export class RemoteMagicCmd extends Lib {
  main () {
    let freq = this.args[1]
    if (!freq) {
      this.print(`usage: ${this.args[0]} <frequency>`)
      this.exit(1)
    }
    this.counter = 1
    this.streams = this.sys('open', [ 'radio', freq ])
    if (!this.streams) {
      this.print(`error: can't open radio`)
      this.exit(1)
    }
    this.gets('in')
  }
  wake (tag, data) {
    if (tag === 'in') {
      if (data === '') {
        this.exit()
      } else {
        let toSend = {
          id: this.counter++,
          src: data
        }
        this.sys('write', this.streams.tx, JSON.stringify(toSend))
        this.sys('read', this.streams.rx, 'res')
      }
    } else if (tag === 'res') {
      let res = JSON.parse(data)
      if (res.id) {
        this.print(`rx: ${res.id} (${res.typ}) ${res.val}`)
      } else {
        this.print(`??: ${data}`)
      }
      this.gets('in')
    }
  }
}

export class ScanCmd extends Lib {
  main () {
    this.print('scanning...')
    this.sys('expect', 'seen', 'seen')
    this.sys('magic', '`"seen" load "seen" return` "on-scan" compile "on-scan" eye-scan', 'res')
  }
  wake (tag, data) {
    if (tag === 'res') {
      this.print(`rx: ${data}`)
    } else if (tag === 'seen') {
      this.print(`rx: ${data}`)
      this.exit()
    }
  }
}

export class Shell extends Lib {
  constructor () {
    super()
    this.prompt = '$ '
    this.commands = {
      'exit': () => {
        this.exit()
      },
      'debug': () => {
        console.log(this)
        this.addLine('test ' + this)
      },
      'handles': () => {
        this.addLine(this.sys('getHandles').join(' '))
      },
      'self': () => {
        this.addLine(this.sys('getSelf'))
      },
      'time': () => {
        this.addLine(this.sys('getTime'))
      },
      'ls': () => {
        let ls = this.sys('listFiles')
        for (let file of ls) {
          this.addLine(file)
        }
      },
      'read': (args) => {
        let data = this.sys('readFile', args[1])
        this.addLine(data)
      },
      'ps': (args) => {
        let data = this.sys('listProcesses')
        for (let p of data) {
          this.addLine(`${p.id} ${p.cmd}`)
        }
      },
      'kill': (args) => {
        this.sys('signal', parseInt(args[1]), parseInt(args[2]))
      }
    }
  }
  main () {
    this.drawnLines = mkel('ul')

    this.inputLine = mkel('div', { classes: [ 'inputline' ] })
    this.promptBox = mkel('span', { text: this.prompt })
    this.inputLine.appendChild(this.promptBox)
    this.inputBox = mkel('input')
    this.inputBox.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        let i = this.inputBox.value
        this.inputBox.value = ''
        // this wouldn't be allowed, because it's trying to make os calls from an event handler
        // this.onInput(i)
        this.queue(() => this.onInput(i))
        this.inputBox.focus()
      }
    })
    this.inputLine.appendChild(this.inputBox)

    let scrolled = mkel('div')
    scrolled.appendChild(this.drawnLines)
    scrolled.appendChild(this.inputLine)

    let scroller = mkel('div', { classes: [ 'scroller' ] })
    scroller.appendChild(scrolled)
    scroller.addEventListener('click', (e) => {
      this.focus()
    })

    this.buttonBox = mkel('div', { classes: [ 'buttons' ] })
    let intButton = mkel('button', { text: 'int'} )
    intButton.addEventListener('click', (e) => {
      this.queue(() => this.onInt())
    })
    let killButton = mkel('button', { text: 'kill'} )
    killButton.addEventListener('click', (e) => {
      this.queue(() => this.onKill())
    })
    this.buttonBox.appendChild(intButton)
    this.buttonBox.appendChild(killButton)

    let body = mkel('div', { classes: [ 'body' ] })
    body.appendChild(scroller)
    body.appendChild(this.buttonBox)

    this.window = this.newWindow('console', 'shell', body)
    this.sys('moveWindow', this.window, 50, 50)
    this.sys('resizeWindow', this.window, 600, 400)
  }
  focus () {
    this.inputLine.scrollIntoView()
    this.inputBox.focus()
  }
  setPrompt (prompt) {
    this.prompt = prompt
    this.promptBox.textContent = this.prompt
  }
  onInput (i) {
    if (this.proc) {
      this.addLine(i)
      // forward to the running app
      this.sys('write', this.proc.tx, i)
    } else {
      // try to launch an app
      let args = i.trim().split(/\s+/)
      this.addLine(this.prompt + i)
      if (args[0]) {
        this.run(args[0], args)
      }
    }
  }
  onInt () {
    if (this.proc) {
      this.sys('signal', this.proc.id, 1)
    }
  }
  onKill () {
    if (this.proc) {
      this.sys('signal', this.proc.id, 9)
    }
  }
  run (i, args) {
    let cmd = this.commands[i]
    if (cmd) {
      cmd(args)
    } else {
      this.proc = this.sys('launch', i, args)
      if (this.proc) {
        this.prompt0 = this.prompt
        this.setPrompt('')
        this.addLine('> launched ' + this.proc.id)
        this.sys('read', this.proc.rx, 'fromapp')
      } else {
        this.addLine(`${i}: command not found`)
      }
    }
  }
  wake (tag, data) {
    super.wake(tag, data)
    if (tag === 'fromapp') {
      if (data === 0) {
        this.onExit()
      } else {
        this.onOutput(data)
        this.sys('read', this.proc.rx, 'fromapp')
      }
    } else if (tag === 'window_close') {
      this.exit()
    }
  }
  onOutput (e) {
    this.addLine(e)
  }
  onExit () {
    this.sys('close', this.proc.tx)
    this.sys('close', this.proc.rx)
    this.addLine('> exited ' + this.proc.id)
    this.proc = null
    this.setPrompt(this.prompt0)
  }
  addLine (i) {
    let e = mkel('li')
    e.textContent = i
    this.drawnLines.appendChild(e)
    this.inputLine.scrollIntoView()
  }
}

export class Hinter extends Lib {
  constructor () {
    super()
    this.lines = [
      'good news! the world has blown up or something, but you can put it back together',
      'that\'s why you\'ve been locked in this box, with just this computer to talk to',
      'the computer is part of a control centre, which hopefully can help fix things',
      'but you might need to learn quite a lot of things to get there...',
      'let\'s open a shell and see what\'s working, the status command should work'
    ]
    this.whichLine = 0
  }
  main () {
    this.line = mkel('div', { text: this.lines[this.whichLine] })

    let prevButton = mkel('button', { text: '<' })
    prevButton.addEventListener('click', (e) => {
      if (this.whichLine > 0) {
        this.whichLine--
        this.line.textContent = this.lines[this.whichLine]
      }
    })
    let nextButton = mkel('button', { text: '>' })
    nextButton.addEventListener('click', (e) => {
      if (this.whichLine < this.lines.length - 1) {
        this.whichLine++
        this.line.textContent = this.lines[this.whichLine]
      }
    })

    let buttons = mkel('div')
    buttons.appendChild(prevButton)
    buttons.appendChild(nextButton)

    this.view = mkel('div')
    this.view.appendChild(this.line)
    this.view.appendChild(buttons)

    this.window = this.newWindow('hinter', 'story', this.view)
    this.sys('moveWindow', this.window, 100, 100)
    this.sys('resizeWindow', this.window, 400, 200)
  }
  wake (tag, data) {
    if (tag === 'window_close') {
      this.exit()
    }
  }
}

export class StateViewer extends Lib {
  main () {
    this.text = mkel('div', { text: 'not done' })
    this.window = this.newWindow('viewer', 'state', this.text)
  }
  update (e) {
    this.text.textContent = JSON.stringify(e.val, mapper, '  ')
  }
  wake (tag, data) {
    if (tag === 'window_close') {
      this.exit()
    }
  }
}

export class Radar extends Lib {
  constructor () {
    super()
    this.data = new Map()
    this.w = 800
    this.h = 800
    this.scale = 10
    this.mouse = { x: 0, y: this.h / -2 }
  }
  main () {
    this.canvas = mkel('canvas')
    this.canvas.width = this.w
    this.canvas.height = this.h

    this.box = mkel('div', { classes: [ 'body' ] })
    this.box.appendChild(this.canvas)

    this.canvas.addEventListener('mousemove', e => {
      // let [sx, sy] = [this.box.scrollLeft, this.box.scrollTop]
      // let [cx, cy] = [e.clientX - this.box.offsetLeft + sx, e.clientY - this.box.offsetTop + sy]
      // this.mouse = { x: cx, y: cy }
      this.mouse = { x: e.offsetX, y: e.offsetY }
    })

    this.window = this.newWindow('radar', 'radar', this.box)
    this.sys('moveWindow', this.window, 100, 100)
    this.sys('resizeWindow', this.window, 400, 400)
    this.centre()
    this.draw()

    this.sys('expect', 'seen', 'seen')
    this.sys('magic', '`"seen" load "seen" return` "on-scan" compile "on-scan" eye-scan', 'res')
  }
  centre () {
    this.canvas.scrollIntoView({ block: 'center', inline: 'center' })
  }
  draw (e) {
    if (this.halt) {
      return
    }
    let ctx = this.canvas.getContext('2d')
    // ctx.globalCompositeOperation = 'destination-over'
    ctx.clearRect(0, 0, this.w, this.h)
    // ctx.globalCompositeOperation = 'source-out'
    this.drawGrid(ctx)
    this.drawSelf(ctx)
    this.drawData(ctx)
    this.drawPointerLine(ctx)
    window.requestAnimationFrame(() => this.draw())
  }
  drawGrid (ctx) {
    let gap = 50
    // horizontal
    for (let y = gap; y < this.h; y += gap) {
      this.drawLine(ctx, 0, y, this.h, y)
    }
    // vertical
    for (let x = gap; x < this.w; x += gap) {
      this.drawLine(ctx, x, 0, x, this.w)
    }
  }
  drawLine (ctx, x1, y1, x2, y2) {
    ctx.save()
    ctx.strokeStyle = 'rgba(0,0,0, 0.5)'
    ctx.setLineDash([5, 3])
    ctx.beginPath()
    ctx.moveTo(x1, y1)
    ctx.lineTo(x2, y2)
    ctx.stroke()
    ctx.restore()
  }
  drawData (ctx) {
    ctx.save()
    let alpha = 1
    let fade = 0.5
    for (let [who, what] of [...this.data]) {
      for (let set of what) {
        let x0 = this.w / 2 + set.x * this.scale
        let y0 = this.h / 2 + set.y * this.scale
        if (who !== 'self') {
          // self is always already drawn, even when no data is available
          this.drawScanPoint(ctx, x0, y0)
        }
        this.drawScanRange(ctx, x0, y0, set.range)
        ctx.fillStyle = `rgb(0,255,0,${alpha})`
        for (let e of set.data) {
          ctx.beginPath()
          let dx = e.distance * Math.cos(e.direction)
          let dy = e.distance * Math.sin(e.direction)
          let x = x0 + dx * this.scale
          let y = y0 + dy * this.scale
          ctx.arc(x, y, 10, 0, Math.PI * 2, true)
          ctx.fill()
          alpha = alpha * fade
        }
      }
    }
    ctx.restore()
  }
  drawScanRange (ctx, x, y, r) {
    // ctx.save()
    ctx.fillStyle = 'rgb(255,255,255,0.5)'
    // ctx.strokeStyle = 'rgb(0,0,0)'
    ctx.beginPath()
    ctx.arc(x, y, r * this.scale, 0, Math.PI * 2, true)
    // ctx.clip()Shell
    // ctx.stroke()
    ctx.fill()
    // ctx.restore()
  }
  drawScanPoint (ctx, x, y) {
    ctx.save()
    ctx.fillStyle = 'black'
    ctx.strokeStyle = 'rgb(0,0,0)'
    ctx.beginPath()
    ctx.arc(this.w / 2 + x * this.scale, this.h / 2 + y * this.scale, 5, 0, Math.PI * 2, true)
    ctx.fill()
    // ctx.stroke()
    ctx.restore()
  }
  drawSelf (ctx) {
    ctx.save()
    ctx.fillStyle = 'white'
    ctx.strokeStyle = 'rgb(0,0,0)'
    ctx.beginPath()
    ctx.arc(this.w / 2, this.h / 2, 10, 0, Math.PI * 2, true)
    ctx.fill()
    // ctx.stroke()
    ctx.restore()
  }
  drawPointerLine (ctx) {
    ctx.save()
    ctx.strokeStyle = 'rgba(0,0,0,1)'
    ctx.beginPath()
    let [cx, cy] = [this.w / 2, this.h / 2]
    let [dx, dy] = [cx - this.mouse.x, cy - this.mouse.y]
    let b = Math.atan2(dy, dx)
    let length = Math.max(Math.abs(cx / Math.cos(b)), Math.abs(cy / Math.sin(b)))
    let [ex, ey] = [length * Math.cos(b), length * Math.sin(b)]
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx - ex, cy - ey)
    ctx.stroke()
    ctx.fillStyle = 'rgba(0,0,0,1)'
    let d = (Math.round(b / Math.PI * 180) + 180 + 90) % 360
    ctx.fillText(`${d} degrees`, cx + 10, cy + 20)
    ctx.restore()
  }
  updateSelf (position) {
    this.self = position
  }
  update (e) {
    let [name, x, y, range, timeout, data] = e
    let list = this.data.get(name) || []
    list.unshift({
      source: name, x: x, y: y, range: range, t: timeout, data: data
    })
    if (list.length > timeout) {
      list.pop()
    }
    this.data.set(name, list)
  }
  wake (tag, data) {
    if (tag === 'window_close') {
      this.halt = true
      this.exit()
    } else if (tag === 'seen') {
      this.update(['self', 0, 0, 5, 1, JSON.parse(data)])
    }
  }
}

export class Manual extends Lib {
  main () {
    this.text = mkel('div')
    this.text.textContent = 'manual'
    this.window = this.newWindow('manual', 'manual', this.text)
    this.sys('moveWindow', this.window, 100, 100)
    this.sys('resizeWindow', this.window, 400, 400)
  }
  wake (tag, data) {
    if (tag === 'window_close') {
      this.exit()
    }
  }
}
