
import runner from './runner.js'

window.game = runner

class State {
  constructor (box) {
    this.box = box
  }
}

let state = new State(document.getElementById('state'))

const mapper = (k, v) => (v instanceof Set || v instanceof Map ? Array.from(v) : v)

class Console {
  constructor (box) {
    this.box = box
    this.list = box.querySelector('ul')
    this.entries = []
  }
  add (ev0) {
    let e0 = document.createElement('li')
    e0.textContent = JSON.stringify(ev0, mapper)
    this.list.appendChild(e0)
    this.entries.push(e0)
    if (this.entries.length > 50) {
      this.list.removeChild(this.entries.shift())
    }
    this.list.scrollIntoView(false)
  }
}

let c0nsole = new Console(document.getElementById('events'))

class Buttons {
  constructor (box) {
    this.box = box
    this.add('look', 'look')
  }
  add (tag, cmd) {
    let b0 = document.createElement('button')
    b0.textContent = tag
    b0.addEventListener('click', e => {
      runner.command(cmd)
    })
    this.box.appendChild(b0)
  }
}

let buttons = new Buttons(document.getElementById('buttons'))

class Entry {
  constructor (box) {
    let form = box.querySelector('form')
    let i = form.querySelector('input')
    form.addEventListener('submit', e => {
      e.preventDefault()
      e.stopPropagation()
      let v = i.value
      if (v) {
        runner.command(v)
      }
      i.value = ''
    })
  }
}

let entry = new Entry(document.getElementById('entry'))

let boxN = document.querySelector('#counter .n')

window.addEventListener('keypress', e => {
  if (e.key === ' ') {
    let paused = runner.pause()
    boxN.classList.toggle('paused', paused)
  }
})

let tick = function() {
  let state = runner.read()
  boxN.textContent = '' + state.n
  if (state.events.length > 0) {
    for (let e of state.events) {
      switch (e.type) {
      // case 'seen':
      //   boxS.textContent = boxS.textContent + '\n' + e.value
      //   break
      default:
        c0nsole.add(e)
      }
    }
  }
  window.requestAnimationFrame(tick)
}

tick()
