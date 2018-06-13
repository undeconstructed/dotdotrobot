
import runner from './runner.js'

// expose the game interface for old fashioned scripts
window.game = runner

const mapper = (k, v) => (v instanceof Set || v instanceof Map ? Array.from(v) : v)

class Grid {
  constructor (element) {
    this.element = element
  }
  add (cell, placement) {
    cell.element.style.gridArea = placement
    this.element.appendChild(cell.element)
  }
}

class Cell {
  constructor (name) {
    this.element = document.createElement('div')
    this.element.className = 'cell'
    if (name) {
      let title = document.createElement('h3')
      title.textContent = name
      this.element.appendChild(title)
    }
    this.box = document.createElement('div')
    this.box.className = 'box'
    this.element.appendChild(this.box)
  }
}

class Title extends Cell {
  constructor() {
    super()
    this.element.removeChild(this.box)
    let title = document.createElement('h1')
    title.textContent = '. . robot'
    this.element.appendChild(title)
  }
}

class State extends Cell {
  constructor () {
    super('state')
    this.box.classList.add('drawn')
    this.area = document.createElement('div')
    this.box.appendChild(this.area)
  }
  update (data) {
    this.area.textContent = JSON.stringify(data, mapper, '  ')
  }
}

class Map extends Cell {
  constructor () {
    super('map')
    this.data = []
    this.w = 500
    this.h = 500
    this.scale = 10
    this.canvas = document.createElement('canvas')
    this.canvas.width = this.w
    this.canvas.height = this.h
    // this.canvas.style = 'height: 100%; width: 100%;'
    this.box.appendChild(this.canvas)
    this.draw()
  }
  draw () {
    this.pulse = 0.5 + Math.abs(Math.sin(Date.now() / 500))
    let ctx = this.canvas.getContext('2d')
    // ctx.globalCompositeOperation = 'destination-over'
    ctx.clearRect(0, 0, this.w, this.h)
    this.drawScanRange(ctx)
    // ctx.globalCompositeOperation = 'source-out'
    this.drawGrid(ctx)
    this.drawSelf(ctx)
    this.drawData(ctx)
    window.requestAnimationFrame(() => this.draw())
  }
  drawScanRange (ctx) {
    // ctx.save()
    ctx.fillStyle = 'white'
    // ctx.strokeStyle = 'rgb(0,0,0)'
    ctx.beginPath()
    ctx.arc(this.w / 2, this.h / 2, 200, 0, Math.PI * 2, true)
    // ctx.clip()
    // ctx.stroke()
    ctx.fill()
    // ctx.restore()
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
    for (let e of this.data) {
      ctx.fillStyle = e.colour
      ctx.strokeStyle = 'rgb(0,0,0)'
      ctx.beginPath()
      ctx.arc((this.w / 2 + e.x * this.scale), (this.h / 2 + e.y * this.scale), this.pulse * 10, 0, Math.PI * 2, true)
      ctx.fill()
      ctx.stroke()
    }
    ctx.restore()
  }
  drawSelf (ctx) {
    ctx.save()
    // ctx.fillStyle = 'white'
    ctx.strokeStyle = 'rgb(0,0,0)'
    ctx.beginPath()
    ctx.arc(this.w / 2, this.h / 2, 10, 0, Math.PI * 2, true)
    // ctx.fill()
    ctx.stroke()
    ctx.restore()
  }
  updateSelf (position) {
    this.self = position
  }
  updateSeen (data) {
    this.data = data
  }
}

class Events extends Cell {
  constructor () {
    super('events')
    this.console = new Console(this.box, e => { let n = e.n; delete e.n; return `${n}: ${JSON.stringify(e, mapper)}` })
  }
  add (ev) {
    this.console.add(ev)
  }
}

function timeF(d) {
  let [h, m, s] = [d.getHours(), d.getMinutes(), d.getSeconds()]
  return `${h < 10 ? '0' : ''}${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`
}

class Input extends Cell {
  constructor () {
    super()
    this.element.removeChild(this.element.firstChild)
    let historyBox = document.createElement('div')
    historyBox.classList.add('box')
    historyBox.classList.add('history')
    this.history = new Console(historyBox, e => `[${e.id}][${timeF(e.time)}] ${e.src}`, e => { this.issue(e.src) })
    this.element.appendChild(historyBox)
    let buttonBox = document.createElement('div')
    buttonBox.classList.add('box')
    this.buttons = new Buttons(this, buttonBox)
    this.element.appendChild(buttonBox)
    let inputBox = document.createElement('div')
    inputBox.innerHTML = '<form><input type="text" placeholder="$ ..."></form>'
    this.element.appendChild(inputBox)
    this.entry = new Entry(this, inputBox)
    this.n = 1
  }
  issue (src) {
    let cmd = {
      id: this.n++,
      src: src
    }
    runner.command(cmd)
    this.memo(cmd)
  }
  memo (cmd) {
    cmd.time = new Date()
    this.history.add(cmd)
  }
  focus () {
    this.entry.focus()
  }
}

class Console {
  constructor (box, f, c) {
    this.box = box
    this.c = c || (e => true)
    this.f = f || (e => JSON.stringify(e, mapper))
    this.box = box
    this.box.classList.add('lines')
    this.list = document.createElement('ul')
    this.box.appendChild(this.list)
    this.entries = []
  }
  add (ev0) {
    let e0 = document.createElement('li')
    e0.textContent = `${this.f(ev0)}`
    e0.addEventListener('click',  e => this.c(ev0))
    this.list.appendChild(e0)
    this.entries.push(e0)
    if (this.entries.length > 50) {
      this.list.removeChild(this.entries.shift())
    }
    this.list.scrollIntoView(false)
  }
}

class Buttons {
  constructor (parent, box) {
    this.parent = parent
    this.box = box
    this.box.classList.add('buttons')
    this.add('look')
  }
  add (tag, cmd) {
    if (!cmd) {
      cmd = tag
    }
    let b0 = document.createElement('button')
    b0.textContent = tag
    b0.addEventListener('click', e => {
      this.parent.issue(cmd)
    })
    this.box.appendChild(b0)
  }
}

class Entry {
  constructor (parent, box) {
    this.parent = parent
    this.box = box
    this.box.classList.add('entry')
    let form = box.querySelector('form')
    this.i = form.querySelector('input')
    form.addEventListener('submit', e => {
      e.preventDefault()
      e.stopPropagation()
      let line = this.i.value
      if (line) {
        this.parent.issue(line)
      }
      this.i.value = ''
    })
    form.addEventListener('keypress', e => {
      e.stopPropagation()
      return true
    })
  }
  focus () {
    this.i.focus()
  }
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

let grid = new Grid(document.getElementById('main'))
// cells
let map = new Map()
let state = new State()
let events = new Events()
let input = new Input()

// grid.add(new Title(), '1 / 1 / 1 / 3')
grid.add(map, '2 / 1 / 4 / 1')
grid.add(state, '2 / 2 / 2 / 2')
grid.add(events, '3 / 2 / 3 / 2')
grid.add(input, 'entry / 1 / entry / 3')

window.addEventListener('keypress', e => {
  if (e.key === ' ') {
    let paused = runner.pause()
    debugUI.box.classList.toggle('paused', paused)
  }
})

let tick = function() {
  let s = runner.read()
  debugUI.update(s)
  if (s.events.length > 0) {
    for (let e of s.events) {
      switch (e.typ) {
      case 'seen':
        // state.update(e.val)
        map.updateSeen(JSON.parse(e.val))
        break
      case 'state':
        state.update(e.val)
        break
      default:
        events.add(e)
      }
    }
  }
  window.requestAnimationFrame(tick)
}

tick()

input.focus()
