
import runner from './runner.js'

// expose the game interface for old fashioned scripts
window.game = runner

class UIThing {
}

class State extends UIThing {
  constructor (box) {
    super()
    this.box = box
  }
  update (data) {
    this.box.textContent = JSON.stringify(data, mapper)
  }
}

let state = new State(document.getElementById('state'))

const mapper = (k, v) => (v instanceof Set || v instanceof Map ? Array.from(v) : v)

class Console extends UIThing {
  constructor (box) {
    super()
    this.box = box
    this.list = box.querySelector('ul')
    this.entries = []
  }
  add (ev0) {
    let n = ev0.n
    delete ev0.n
    let e0 = document.createElement('li')
    e0.textContent = `${n}: ${JSON.stringify(ev0, mapper)}`
    this.list.appendChild(e0)
    this.entries.push(e0)
    if (this.entries.length > 50) {
      this.list.removeChild(this.entries.shift())
    }
    this.list.scrollIntoView(false)
  }
}

let c0nsole = new Console(document.getElementById('events'))

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

let entry = new Entry(document.getElementById('entry'))

let history = new Console(document.getElementById('history'))

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
        c0nsole.add(e)
      }
    }
  }
  window.requestAnimationFrame(tick)
}

tick()

entry.focus()
