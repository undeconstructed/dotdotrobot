
import runner from './runner.js'

// expose the game interface for old fashioned scripts
window.game = runner

class UIThing {
}

class State extends UIThing {
  constructor (box) {
    super()
    this.box = box
    this.box.classList.add('drawn')
    this.area = document.createElement('div')
    this.box.appendChild(this.area)
  }
  update (data) {
    this.area.textContent = JSON.stringify(data, mapper)
  }
}

const mapper = (k, v) => (v instanceof Set || v instanceof Map ? Array.from(v) : v)

class Console extends UIThing {
  constructor (box, f) {
    super()
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
    this.list.appendChild(e0)
    this.entries.push(e0)
    if (this.entries.length > 50) {
      this.list.removeChild(this.entries.shift())
    }
    this.list.scrollIntoView(false)
  }
}

class Buttons extends UIThing {
  constructor (box) {
    super()
    this.box = box
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

let buttons = new Buttons(document.getElementById('buttons'))

class Entry extends UIThing {
  constructor (box) {
    super()
    this.box = box
    let form = box.querySelector('form')
    let i = form.querySelector('input')
    form.addEventListener('submit', e => {
      e.preventDefault()
      e.stopPropagation()
      let line = i.value
      if (line) {
        runner.command(line)
        history.add({ n: new Date(), line: line })
      }
      i.value = ''
    })
    form.addEventListener('keypress', e => {
      e.stopPropagation()
      return true
    })
  }
  focus () {
    this.box.querySelector('input').focus()
  }
}


let state = new State(document.getElementById('state'))
let events = new Console(document.getElementById('events'), e => { let n = e.n; delete e.n; return `${n}: ${JSON.stringify(e, mapper)}`})
let entry = new Entry(document.getElementById('entry'))
let history = new Console(document.getElementById('history'), e => `${e.n.toTimeString()}: ${e.line}`)

let boxN = document.querySelector('#counter .n')

window.addEventListener('keypress', e => {
  if (e.key === ' ') {
    let paused = runner.pause()
    boxN.classList.toggle('paused', paused)
  }
})

let tick = function() {
  let s = runner.read()
  boxN.textContent = '' + s.n
  if (s.events.length > 0) {
    for (let e of s.events) {
      switch (e.typ) {
      case 'seen':
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

entry.focus()
