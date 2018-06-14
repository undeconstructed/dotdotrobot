
import Game from './game.js'

// all globals here to keep them out of the exported object
let hz = 1
let game = new Game(hz)
let commands = []
let events = []
let timeout = null
let paused = false

let tick = function() {
  let toSend = commands.length > 0 ? commands : null
  let newEvents = game.run.tick(toSend)
  commands = []
  if (newEvents.length > 0) {
    events = events.concat(newEvents)
  }
  timeout = window.setTimeout(tick, 1000 / hz)
}

class Runner {
  command (command) {
    commands.push(command)
  }
  read () {
    let events0 = events
    events = []
    return {
      n: game.run.n,
      events: events0
    }
  }
  pause () {
    paused = !paused
    if (paused) {
      window.clearTimeout(timeout)
    } else {
      timeout = window.setTimeout(tick, 1000 / hz)
    }
    console.log((paused ? '' : 'un') + 'paused')
    return paused
  }
}

let runner = new Runner()

window.setTimeout(tick, 0)

export default runner
