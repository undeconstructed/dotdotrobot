
import runner from './runner.js'
import * as lang from './lang.js'
import OS from './os.js'

// for running code in the browser
window.lang = function (src) {
  return lang.run(lang.parse(src)).s
}

// some debuggy stuff

const mapper = (k, v) => (v instanceof Set || v instanceof Map ? Array.from(v) : v)

function timeF(d) {
  let [h, m, s] = [d.getHours(), d.getMinutes(), d.getSeconds()]
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}

class DebugUI {
  constructor () {
    this.box = document.createElement('div')
    this.box.className = 'debugui'
    document.body.appendChild(this.box)
  }
  update (s) {
    this.box.textContent = `n = ${s.n}`
  }
}

let debugUI = new DebugUI()

// the installed apps come now

class StatusCmd {
  main (os) {
    os.write(1, 'not good')
    os.exit()
  }
}

class CatCmd {
  main (os) {
    this.os = os
    this.os.read(0, 'in')
  }
  wake (tag, data) {
    if (tag === 'in') {
      if (data === '') {
        this.os.exit()
      } else {
        this.os.write(1, data)
        this.os.read(0, 'in')
      }
    }
  }
}

class Shell {
  constructor () {
    this.prompt = '$ '
    this.commands = {
      'exit': () => {
        this.os.exit()
      },
      'debug': () => {
        console.log(this)
        this.addLine('test ' + this)
      },
      'handles': () => {
        this.addLine(this.os.getHandles())
      },
      'self': () => {
        this.addLine(this.os.getSelf())
      },
      'time': () => {
        this.addLine(this.os.getTime())
      }
    }
  }
  main (os) {
    this.os = os
    this.window = os.newWindow('console', 'shell')
    this.window.moveTo(50, 50)
    this.window.resize(600, 400)
    this.scroller = document.createElement('div')
    this.scroller.classList.add('scroller')
    this.scroller.addEventListener('click', (e) => {
      this.inputBox.focus()
    })
    this.drawnLines = document.createElement('ul')
    this.scroller.appendChild(this.drawnLines)
    this.inputLine = document.createElement('div')
    this.inputLine.classList.add('inputline')
    this.promptBox = document.createElement('span')
    this.promptBox.textContent = this.prompt
    this.inputLine.appendChild(this.promptBox)
    this.inputBox = document.createElement('input')
    this.inputBox.addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        let i = this.inputBox.value
        this.inputBox.value = ''
        // this wouldn't be allowed, because it's trying to make os calls from an event handler
        // this.onInput(i)
        this.os.defer(() => this.onInput(i))
        this.inputBox.focus()
      }
    })
    this.inputLine.appendChild(this.inputBox)
    this.scroller.appendChild(this.inputLine)
    this.window.setBody(this.scroller)
  }
  setPrompt (prompt) {
    this.prompt = prompt
    this.promptBox.textContent = this.prompt
  }
  onInput (i) {
    if (this.proc) {
      this.addLine(i)
      // forward to the running app
      this.os.write(this.proc.in, i)
    } else {
      // try to launch an app
      this.addLine(this.prompt + i)
      this.run(i)
    }
  }
  run (i) {
    let cmd = this.commands[i]
    if (cmd) {
      cmd()
    } else {
      this.proc = this.os.launch(i)
      if (this.proc) {
        this.prompt0 = this.prompt
        this.setPrompt('')
        this.addLine('> launched ' + this.proc.id)
        this.os.read(this.proc.out, 'fromapp')
      } else {
        this.addLine('unknown')
      }
    }
  }
  wake (tag, data) {
    if (tag === 'fromapp') {
      if (data === 0) {
        this.onExit()
      } else {
        this.onOutput(data)
        this.os.read(this.proc.out, 'fromapp')
      }
    }
  }
  onOutput (e) {
    this.addLine(e)
  }
  onExit () {
    this.os.close(this.proc.in)
    this.os.close(this.proc.out)
    this.addLine('> exited ' + this.proc.id)
    this.proc = null
    this.setPrompt(this.prompt0)
  }
  addLine (i) {
    let e = document.createElement('li')
    e.textContent = i
    this.drawnLines.appendChild(e)
  }
}

class Hinter {
  constructor () {
    this.lines = [
      'ah nuts, the world\'s been destroyed again. let\'s see what we can put back together.',
      'and since this is a video game, I guess I\'ve lost my memory too',
      'and probably this is all notes I wrote to myself in case this exact thing happened',
      'since I\'m reading this I guess I\'ve plugged in the laptop to the control centre .. yes',
      'let\'s open a shell and see what\'s working, the status command should work'
    ]
    this.whichLine = 0
  }
  main (os) {
    this.os = os
    this.window = os.newWindow('hinter', 'story')
    this.view = document.createElement('div')
    this.line = document.createElement('p')
    this.line.textContent = this.lines[this.whichLine]
    this.view.appendChild(this.line)
    let nextButton = document.createElement('button')
    nextButton.textContent = 'more?'
    nextButton.addEventListener('click', (e) => {
      if (this.whichLine < this.lines.length -1 ) {
        this.whichLine++
        this.line.textContent = this.lines[this.whichLine]
      }
    })
    this.view.appendChild(nextButton)
    this.window.setBody(this.view)
    this.window.moveTo(100, 100)
  }
  wake () {}
}

class StateViewer {
  main (os) {
    this.os = os
    this.window = os.newWindow('viewer', 'state')
    this.text = document.createElement('div')
  }
  update (e) {
    this.text.textContent = JSON.stringify(e.val, mapper, '  ')
  }
}

class Radar {
  constructor () {
    this.data = new Map()
    this.w = 800
    this.h = 800
    this.scale = 10
    this.mouse = { x: 0, y: this.h / -2 }
  }
  main (os) {
    this.os = os
    this.window = os.newWindow('hinter', 'radar')
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.w
    this.canvas.height = this.h
    // this.canvas.style = 'height: 100%; width: 100%;'
    this.window.setBody(this.canvas)
    this.canvas.addEventListener('mousemove', e => {
      let [sx, sy] = [this.box.scrollLeft, this.box.scrollTop]
      let [cx, cy] = [e.x - this.canvas.offsetLeft + sx, e.y - this.canvas.offsetTop + sy]
      this.mouse = { x: cx, y: cy }
    })
    this.draw()
  }
  centre () {
    this.canvas.scrollIntoView({ block: 'center', inline: 'center' })
  }
  draw (e) {
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
      let s1 = true
      for (let set of what) {
        let x0 = this.w / 2 + set.x * this.scale
        let y0 = this.h / 2 + set.y * this.scale
        if (s1) {
          s1 = false
          if (who !== 'self') {
            this.drawScanPoint(ctx, x0, y0)
          }
          this.drawScanRange(ctx, x0, y0, set.range)
        }
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
    let input = JSON.parse(e.val)
    let [name, x, y, range, timeout, data] = input
    let list = this.data.get(name) || []
    list.unshift({
      source: name, x: x, y: y, range: range, t: timeout, data: data
    })
    if (list.length > timeout) {
      list.pop()
    }
    this.data.set(name, list)
  }
}

let os = new OS(document.getElementById('main'))
// apps
os.addApp('status', StatusCmd)
os.addApp('story', Hinter)
os.addApp('radar', Radar)
os.addApp('shell', Shell)
os.addApp('cat', CatCmd)
// icons
os.addIcon('huh?', 'story')
os.addIcon('shell', 'shell')
os.addIcon('radar', 'radar')

window.os = os

// this is just for the pause button

window.addEventListener('keypress', e => {
  if (e.key === ' ') {
    let paused = runner.pause()
    debugUI.box.classList.toggle('paused', paused)
  }
})

// this connects the OS to the simulation

let read = function() {
  let s = runner.read()
  debugUI.update(s)
  os.tick(s)
  window.requestAnimationFrame(read)
}

read()
