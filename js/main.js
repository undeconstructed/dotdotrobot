
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
    this.area.textContent = JSON.stringify(data, mapper)
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
    this.drawGrid(ctx)
    this.drawData(ctx)
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
    for (let e of this.data) {
      ctx.save()
      ctx.fillStyle = e.colour
      ctx.strokeStyle = 'rgb(0,0,0)'
      ctx.beginPath()
      ctx.arc(e.x * this.scale, e.y * this.scale, this.pulse * 10, 0, Math.PI * 2, true)
      ctx.fill()
      ctx.stroke()
      ctx.restore()
    }
  }
  update (data) {
    this.data = JSON.parse(data)
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

class Input extends Cell {
  constructor () {
    super()
    this.element.removeChild(this.element.firstChild)
    let historyBox = document.createElement('div')
    historyBox.classList.add('box')
    historyBox.classList.add('history')
    this.history = new Console(historyBox, e => `${e.n.toTimeString()}: ${e.line}`, e => { console.log(e) })
    this.element.appendChild(historyBox)
    let inputBox = document.createElement('div')
    inputBox.innerHTML = '<form><input type="text" placeholder="$ ..."></form>'
    this.element.appendChild(inputBox)
    this.entry = new Entry(this, inputBox)
  }
  memo (line) {
    this.history.add(line)
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
    e0.addEventListener('click',  e => this.c(e0))
    this.list.appendChild(e0)
    this.entries.push(e0)
    if (this.entries.length > 50) {
      this.list.removeChild(this.entries.shift())
    }
    this.list.scrollIntoView(false)
  }
}

class Buttons {
  constructor (box) {
    this.input = input
    this.box = box
    this.box.classList.add('buttons')
    this.add('look')
    this.add('look+', 'tell eye scan')
    this.add('grab')
    this.add('slots', 'list-slots')
    this.add('parts', 'list-parts')
    this.add('grab')
    this.add('DEBUG describe', 'describe')
  }
  add (tag, cmd) {
    if (!cmd) {
      cmd = tag
    }
    let b0 = document.createElement('button')
    b0.textContent = tag
    b0.addEventListener('click', e => {
      history.add({ n: new Date(), line: cmd })
      runner.command(cmd)
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
        line.split(';').forEach(cmd => runner.command(cmd))
        this.parent.memo({ n: new Date(), line: line })
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
        map.update(e.val)
        break
      case 'state':
        state.update(e.val)
        break
      default:
      }
      events.add(e)
    }
  }
  window.requestAnimationFrame(tick)
}

tick()

input.focus()
