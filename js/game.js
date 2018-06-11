
import { assert, split, join, distance } from './util.js'
import * as random from './random.js'
import Machine from './machine.js'
import * as lang from './lang.js'

class Thing {
  constructor (opts) {
    opts = opts || {}
    this.parent = opts.parent || null
    this.size = opts.size || 'small'
    this.position = opts.position || null
    this.colour = opts.colour || 'white'
    this.motion = opts.motion || null
  }
  place (parent, opts) {
    return parent.accept(this, opts)
  }
  get area () {
    let p = this.parent
    while (p != null) {
      if (p instanceof Area) {
        return p
      }
      p = p.parent
    }
    return p
  }
  get piece () {
    let p = this.parent
    while (p != null) {
      if (p instanceof Piece) {
        return p
      }
      p = p.parent
    }
    return p
  }
  tick () {
  }
  accept () {
    assert(false, 'tried to get a thing to accept something')
    return false
  }
  toString () {
    return 'thing'
  }
}

class Programmable extends Thing {
  constructor (opts) {
    super(opts)
    // this thing is the actual computer
    this.machine = new Machine(50, 20, 10, 10)
    // results of execution
    this._results = []
    // universally installed programs
    this.addOp('log', (m, s) => {
      console.log('log', s.pop())
    })
    // default programs
    this.installProgram('delete', { f: (m, args) => {
      m.takeVariable(args)
    }})
    this.installProgram('install', { f: (m, args) => {
      // this compiles and installs a program
      let [name, src] = split(args)
      let app = null
      try {
        app = lang.parse(src)
      } catch (e) {
        return {
          typ: 'error',
          val: 'can\'t compile: ' + e
        }
      }
      this.installProgram(name, { app, src })
      return 'ok'
    } })
    this.installProgram('script', { f: (m, args) => {
      // this is a dynamicly inputted program
      let src = args
      let app = null
      try {
        app = lang.parse(src)
      } catch (e) {
        return {
          typ: 'error',
          val: 'can\'t compile: ' + e
        }
      }
      try {
        // XXX - this may run out of runtime
        let { res, used } = lang.run(app, { m: this.memory, ops: this.ops, runFor: this.cp0 })
        this.cp0 -= used
        return {
          typ: 'res',
          val: res
        }
      } catch (e) {
        return {
          typ: 'error',
          val: 'crash: ' + e
        }
      }
    }})
    this.installProgram('list-programs', { f: (m, args) => {
      return m.listPrograms()
    } })
    this.installProgram('dump-program', { f: (m, args) => {
      return m.describeProgram(args)
    } })
    this.installProgram('describe', { f: (m, args) => {
      return this.toString()
    } })
  }
  addOp (name, func) {
    this.machine.addOp(name, func)
  }
  compileProgram (name, src) {
    this.machine.installProgram(name, { src: src, app: lang.parse(src) })
  }
  installProgram (name, program) {
    this.machine.installProgram(name, program)
  }
  command (command) {
    return this.machine.enqueue(command)
  }
  tick () {
    this.machine.tick()
    this.execute()
  }
  execute () {
    let res = this.machine.execute()
    this._results = this._results.concat(res)
  }
  results () {
    let r = this._results
    this._results = []
    return r
  }
}

class Component extends Programmable {
  constructor () {
    super()
    this.inputBus = []
    this.outputBus = []
    this.addOp('return', (m, s) => {
      let [name, val] = [s.pop(), s.pop()]
      this.outputBus.push([ 'output', name, val ])
    })
  }
  control (cmd) {
    return this.inputBus.push(cmd)
  }
  read () {
    return this.outputBus.shift()
  }
  tick () {
    let input = this.inputBus.shift()
    if (input) {
      // this is the component control protocol
      switch (input[0]) {
      case 'read': {
        let name = input[1]
        let value = this.memory.get(name)
        this.outputBus.push([ 'read', name, value ])
        break
      }
      case 'write': {
        let name = input[1][0]
        let value = input[1][1]
        this.memory.set(name, value)
        this.outputBus.push([ 'written', name ])
        break
      }
      case 'queue':
        if (this.command(input[1])) {
          this.outputBus.push([ 'queued', input[1] ])
        } else {
          this.outputBus.push([ 'queuefull', input[1] ])
        }
        break
      }
    }
    super.tick()
    for (let r of this.results()) {
      this.outputBus.push([ 'res', r ])
    }
  }
  toString () {
    return 'component'
  }
}

class Composite extends Programmable {
  constructor (opts) {
    super(opts)
    this.slots = new Set()
    this.parts = new Map()
    // where composed result is after tick
    this.composition = null
    // tell as an op
    this.addOp('tell', (m, s) => {
      let [tgt, src] = [s.pop(), s.pop()]
      let part = this.parts.get(tgt)
      if (part) {
        let cmd = [ 'queue', src ]
        if (part.control(cmd)) {
          s.push('ok')
        } else {
          s.push('overflow')
        }
      } else {
        s.push('no part')
      }
    })
    // tell as an app
    this.compileProgram('tell', '"argv" load split1 swap tell ;')
    // tell as a native program
    this.installProgram('tellx', { f: (m, args) => {
      if (args) {
        let [tgt, src] = split(args)
        let part = this.parts.get(tgt)
        if (part) {
          let cmd = [ 'queue', src ]
          if (part.control(cmd)) {
            return {
              typ: 'debug',
              val: 'command pushed to ' + tgt
            }
          } else {
            return {
              typ: 'error',
              val: 'command overflow on ' + tgt
            }
          }
        }
      }
      return 'error'
    } })
    this.installProgram('list-slots', { f: (m, args) => {
      return [...this.slots]
    } })
    this.installProgram('list-parts', { f: (m, args) => {
      let list = {}
      this.parts.forEach((v, k) => {
        list[k] = v.toString()
      })
      return list
    } })
  }
  addSlot (name) {
    this.slots.add(name)
  }
  accept (component, opts) {
    assert(component instanceof Component)
    if (!this.slots.has(opts.slot)) {
      return false
    }
    this.parts.set(opts.slot, component)
    component.parent = this
    return true
  }
  tick () {
    super.tick()
    this.parts.forEach((part, slot) => part.tick())
    this.composition = this.compose()
  }
  compose () {
    let res = []
    this.parts.forEach((part, slot) => {
      let r = null
      while ((r = part.read()) != null) {
        if (r[0] === 'output') {
          res.push({
            typ: r[1],
            src: slot,
            val: r[2]
          })
        } else {
          res.push({
            typ: 'debug',
            src: slot,
            val: r
          })
        }
      }
    })
    if (res.length > 0) {
      if (this.machine.hasProgram('compose')) {
        this.machine.setVariable('res', res)
        // TODO - this might overflow
        this.command('compose res')
        // TODO - this might not finish
        this.execute()
        return 'composed'
      }
      return res
    }
    return null
  }
  toString () {
    if (this.parts.size > 0) {
      return 'composite with [' + join(this.parts.values(), ',') + ']'
    } else {
      return 'composite'
    }
  }
}

class Piece extends Composite {
  constructor (opts) {
    super(opts)
  }
  move (newParent, opts) {
    return this.parent.pass(this, newParent, opts)
  }
  toString () {
    return 'piece ' + super.toString()
  }
}

class Area extends Thing {
  constructor (w, h) {
    super()
    this.w = w
    this.h = h
    this.children = new Set()
  }
  place (parent, x, y) {
    return parent.accept(this, { x: x, y: y })
  }
  tick () {
    for (let child of this.children) {
      child.tick()
    }
    for (let child of this.children) {
      if (child.motion) {
        let m = child.motion
        let nx = child.position.x + m.x
        let ny =  child.position.y + m.y
        if (nx < 0) nx = 0
        if (ny < 0) ny = 0
        if (nx > this.w) nx = this.w
        if (ny > this.h) ny = this.h
        child.position.x = nx
        child.position.y = ny
        // motion stops immediately for now
        child.motion = { x: 0, y: 0 }
      }
    }
  }
  accept (child, opts) {
    assert(child instanceof Thing)
    this.children.add(child)
    child.parent = this
    child.position = {
      x: opts.x || 0,
      y: opts.y || 0
    }
    return true
  }
  remove (child) {
    return this.children.delete(child)
  }
  pass (child, newParent, opts) {
    if (this.children.has(child)) {
      if (newParent.accept(child, opts)) {
        this.children.delete(child)
        return true
      }
    }
    return false
  }
  visibleTo (child) {
    let out = []
    for (let e of this.children) {
      if (e === child) {
        continue
      }
      let dist = distance(child.position, e.position)
      if (dist < 50) {
        out.push({
          x: child.position.x - e.position.x,
          y: child.position.y - e.position.y,
          e: e
        })
      }
    }
    return out
  }
  toString () {
    if (this.children.size > 0) {
      return 'area with [' + join(this.children, ',') + ']'
    } else {
      return 'area'
    }
  }
}

class World extends Area {
  constructor (run, w, h) {
    super(w, h)
    this.run = run
  }
  move () {
    assert(false, 'tried to move world')
    return false
  }
  toString () {
    return 'world ' + super.toString()
  }
}

class ArmCore1 {
}

class Arm1 extends Component {
  constructor () {
    super()
    this.howLongToGrab = 3
    this.grabbing = 0
    this.holding = null
    this.addOp('grab', (m, s) => {
      if (this.holding) {
        s.push('already holding!')
        return
      }
      if (this.grabbing === 0) {
        this.grabbing = this.howLongToGrab
        s.push('grabbing...')
        return
      }
      s.push('already grabbing!')
    })
    this.addOp('release', (m, s) => {
      // let owner = this.piece
      if (this.holding) {
        this.holding.move(this.area, this.holding.position)
        s.push('released')
      } else {
        s.push('not holding anything!')
      }
    })
    this.addOp('holding', (m, s) => {
      s.push(this.holding.toString())
    })
    this.addOp('program', (m, s) => {
      if (this.holding) {
        this.holding.installProgram('idle', { alias: 'doodle' })
        s.push('programmed')
        return
      }
      s.push('not now')
    })
    this.compileProgram('grab', 'grab "grab" return ;')
    this.compileProgram('ongrab', 'holding "grabbed" return ;')
    this.compileProgram('onmiss', '"missed" "missed" return ; ')
    this.compileProgram('program' , 'program "programmed" return ;')
    this.compileProgram('release', 'release "released" return ;')
  }
  tick () {
    if (this.grabbing > 0) {
      if ((--this.grabbing) == 0) {
        let near = this.area.visibleTo(this.piece)
        for (let e of near) {
          if (e.e instanceof Piece) {
            e.e.move(this)
            this.command('ongrab')
            break
          }
        }
        if (this.holding == null) {
          this.command('onmiss')
        }
      }
    }
    // XXX - should things be entirely disabled when grabbed?
    // if (this.holding) {
    //   this.holding.tick()
    // }
    super.tick()
  }
  accept (piece) {
    assert(piece instanceof Piece)
    this.holding = piece
    piece.parent = this
    return true
  }
  pass (piece, newParent, opts) {
    if (this.holding === piece) {
      if (newParent.accept(piece, opts)) {
        this.holding = null
        return true
      }
    }
    return false
  }
  toString () {
    return 'arm ' + super.toString()
  }
}

class ScannerCore1 {
  scan (host) {
    let near = host.area.visibleTo(host.piece)
    let o = near.map(e => ({
      x: e.x,
      y: e.y,
      size: e.e.size,
      colour: e.e.colour
    }))
    return o
  }
}

class Scanner1 extends Component {
  constructor () {
    super()
    this.core = new ScannerCore1()
    this.scanning = 0
    this.timeToScan = 1
    this.addOp('scan', (m, s) => {
      this.scanning = this.timeToScan
      s.push('scanning')
    })
    this.compileProgram('scan', 'scan ;')
    this.compileProgram('onscan', '"seen" load tojson "seen" return ;')
  }
  tick () {
    if (this.scanning > 0) {
      if ((--this.scanning) == 0) {
        let o = this.core.scan(this)
        this.machine.setVariable('seen', o)
        this.command('onscan')
      }
    }
    super.tick()
  }
  toString () {
    return 'scanner ' + super.toString()
  }
}

class Player extends Piece {
  constructor () {
    super({ colour: 'pink', size: 'medium' })
    // default extension points
    this.addSlot('arm-1')
    this.addSlot('arm-2')
    this.addSlot('eye')
    // events for sending back out of the game
    this.events = []
    // some default components
    this.accept(new Arm1(), { slot: 'arm-1' })
    this.accept(new Scanner1(), { slot: 'eye' })
    // some default programs
    this.compileProgram('sample', '1 2 + ;')
    this.compileProgram('help', '"try typing list-programs" ;"')
    this.compileProgram('look', '"scan" "eye" tell ;')
    this.compileProgram('grab', '"grab" "arm-1" tell ;')
    this.installProgram('set-idle', { f: (m, args) => {
      let prog = args ? args.trim() : null
      if (prog) {
        this.installProgram('idle', { alias: prog })
      } else {
        this.installProgam('idle', null)
      }
      return 'ok'
    } })
    this.installProgram('state', { f: (m, args) => {
      return {
        typ: 'state',
        val: {
          position: this.position,
          power: [100, 100],
          wear: [10, 100]
        }
      }
    } })
    this.installProgram('compose', { f: (m, args) => {
      let res = m.getVariable(args)
      // turn composite result into more user friendly things
      if (res) {
        let events = m.getVariable('out') || []
        for (let r of res) {
          if (r.typ != 'debug') {
            events.push(r)
          } else {
            console.log('debug', r)
          }
        }
        m.setVariable('out', events)
      }
      return 'ok'
    } })
  }
  startTick (commands) {
    this.events = []
    if (commands) {
      for (let c of commands) {
        if (!this.command(c)) {
          this.events.push({
            typ: 'error',
            val: `command overflow`,
            cmd: c
          })
        }
      }
    }
  }
  tick () {
    super.tick()
    if (this.composition) {
      if (this.composition === 'composed') {
        // look for any events in memory
        let out = this.machine.takeVariable('out')
        if (out) {
          this.events = this.events.concat(out)
        }
      } else {
        this.events = this.events.concat(this.composition)
      }
    }
    if (this.machine.timeLeft > 0 && this.machine.hasProgram('idle')) {
      this.command('idle')
      this.execute()
    }
  }
  endTick () {
    let res = this.results()
    if (res) {
      for (let r of res) {
        this.events.push(r)
      }
    }
    return this.events
  }
  toString () {
    return 'player ' + super.toString()
  }
}

class Robot1 extends Piece {
  constructor (name, colour) {
    super({ colour })
    // internal state
    this.name = name
    this.time = 0
    this.power = { x: 0, y: 0 }
    // hardwired components
    this.scanner = new ScannerCore1()
    // ops
    this.machine.addOp('power', (m, s) => {
      let [y, x] = [s.pop(), s.pop()]
      this.power.x = x
      this.power.y = y
    })
    this.machine.addOp('scan', (m, s) => {
      let o = this.scanner.scan(this)
      s.push(o)
    })
    // programs
    this.compileProgram('doodle', ':r 0 4 rand 2 - ; r r power ;')
    this.compileProgram('explore', '1 ;')
  }
  setName (name) {
    this.name = name
  }
  tick () {
    this.n++
    super.tick()
    if (this.machine.timeLeft > 0 && this.machine.hasProgram('idle')) {
      this.command('idle')
      this.machine.execute()
    }
    this.motion = { x: this.power.x, y: this.power.y }
  }
  toString () {
    return `${this.colour} robot '${this.name}' ` + super.toString()
  }
}

class Run {
  constructor () {
    this.n = 0
    this.world = new World(this, 100, 100)
    this.player = new Player()
    this.player.place(this.world, { x: 10, y: 20 })
    this.addRandomRobot({ x: 12, y: 16 })
    this.addRandomRobot({ x: 1, y: 1 })
    this.addRandomRobot({ x: 8, y: 22 })
    this.addRandomRobot({ x: 80, y: 90 })
  }
  addRandomRobot (opts) {
    new Robot1(random.name(), random.colour()).place(this.world, opts)
  }
  accept () {
    return false
  }
  tick (commands) {
    this.n++
    this.player.startTick(commands)
    this.world.tick()
    let events = this.player.endTick()
    for (let e of events) {
      e.n = this.n
    }
    return events
  }
  toString () {
    return 'run\n' + this.world + '\n' + this.player
  }
}

export default class Game {
  constructor () {
    this.run = new Run()
  }
  toString () {
    return 'game\n' + this.run
  }
}
