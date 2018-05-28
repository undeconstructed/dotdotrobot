
import Game from './game.js'

let game = new Game()
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
  timeout = window.setTimeout(tick, 1000)
}

class Runner {
  command (command) {
    commands.push(command)
  }
  read () {
    let oldEvents = events
    events = []
    return {
      n: game.run.n,
      events: oldEvents
    }
  }
  pause (w) {
    paused = !paused
    if (paused) {
      window.clearTimeout(timeout)
    } else {
      timeout = window.setTimeout(tick, 1000)
    }
    console.log((paused ? '' : 'un') + 'paused')
    return paused
  }
}

let runner = new Runner()

tick()

export default runner
