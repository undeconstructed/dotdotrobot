
import { assert, split, join, distance, popArgs } from './util.js'
import * as random from './random.js'
import Machine from './machine.js'
import * as lang from './lang.js'

/**
 * DotLive is all the things in the game that have some sort of life.
 */
class DotLive {
  constructor (run) {
    assert(run instanceof Run)
    this.run = run
  }
  get hz() {
    return this.run.hz
  }
  tick () {
  }
}

/**
 * DotObject is all the things in the game that have some sort of life of their
 * own.
 */
class DotObject extends DotLive {
  constructor (run, opts) {
    super(run)
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
    let o = this
    let p = o.parent
    while (!(p instanceof Area)) {
      o = p
      p = o.parent
    }
    return o
  }
  tick () {
  }
  accept () {
    assert(false, 'tried to get a thing to accept something')
    return false
  }
  move (newParent, opts) {
    return this.parent.pass(this, newParent, opts)
  }
  toString () {
    return 'thing'
  }
}

/**
 * Area can contain objects, and lay them out in some sort of geography.
 */
class Area extends DotObject {
  constructor (run, w, h) {
    super(run)
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
    assert(child instanceof DotObject)
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

/**
 * World is the containers of all things.
 */
class World extends Area {
  constructor (run, w, h) {
    super(run, w, h)
  }
  move () {
    assert(false, 'tried to move world')
    return false
  }
  toString () {
    return 'world ' + super.toString()
  }
}

/**
 * Programmables have a Machine in them.
 */
class Programmable extends DotObject {
  constructor (run, opts) {
    super(run, opts)
    // this thing is the actual computer
    this.machine = new Machine(100 / this.hz, 20, 10, 10)
    // results of execution
    this._results = []
    // universally installed programs
    this.addHardWord('log', (m, s) => {
      console.log('log', s.pop())
    })
    this.addHardWord('describe', (m, s) => {
      s.push(this.toString())
    })
  }
  addHardWord (name, func) {
    this.machine.addHardWord(name, func)
  }
  compileWord (name, src) {
    this.machine.installWord(name, { src: src, app: lang.parse(src) })
  }
  command (cmd) {
    cmd.app = lang.parse(cmd.src)
    return this.machine.enqueue(cmd)
  }
  tick () {
    this.machine.tick()
    this.execute()
  }
  execute () {
    let res = this.machine.execute()
    for (let r of res) {
      if (r.e) {
        console.log(r.e)
        delete r.e
      }
    }
    this._results = this._results.concat(res)
  }
  results () {
    let r = this._results
    this._results = []
    return r
  }
}

/**
 * SocketComposite can have other programmable things (Components) inserted
 * into them.
 */
class SocketComposite extends Programmable {
  constructor (run, opts) {
    super(run, opts)
    this.slots = new Set()
    this.parts = new Map()
    // where composed result is after tick
    this.composition = null
    // hardware functions
    this.addHardWord('list-slots', (m, s) => {
      return [...this.slots]
    })
    this.addHardWord('list-parts', (m, s) => {
      let list = {}
      this.parts.forEach((v, k) => {
        list[k] = v.toString()
      })
      return list
    })
    this.addHardWord('tell', (m, s) => {
      let [tgt, src] = [s.pop(), s.pop()]
      let part = this.parts.get(tgt)
      if (part) {
        // XXX - is this right place to compile?
        let app = lang.parse(src)
        let cmd = [ 'queue', [ null, app ] ]
        if (part.socket.send(cmd)) {
          s.push('ok')
        } else {
          s.push('overflow')
        }
      } else {
        s.push('no part')
      }
    })
    this.addHardWord('copy', (m, s) => {
      // let [data, tgt, name] = [s.pop(), s.pop(), s.pop()]
      let args = popArgs(s, ['data', 'tgt', 'name'])
      let part = this.parts.get(args.tgt)
      if (part) {
        let cmd = [ 'write', [ args.name, args.data ] ]
        part.socket.send(cmd)
        s.push('ok')
      } else {
        s.push('no part')
      }
    })
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
    component.socket.plug(this)
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
      while ((r = part.socket.recv()) != null) {
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
      if (this.machine.hasWord('compose')) {
        this.machine.setVariable('res', res)
        // TODO - this might overflow
        this.command({ src: '"res" compose' })
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

/**
 * SocketComponents have sockets so they can be inserted into a SocketComposite thing.
 */
class SocketComponent extends Programmable {
  constructor (run) {
    super(run)
    this.socket0 = this.machine.newSocket()
    this.addHardWord('return', (m, s) => {
      let [name, val] = [s.pop(), s.pop()]
      this.socket0.push([ 'output', name, val ])
    })
  }
  get socket () {
    return this.socket0
  }
  tick () {
    super.tick()
    for (let r of this.results()) {
      if (r.id) {
        this.socket0.push([ 'res', r ])
      }
    }
  }
  toString () {
    return 'component'
  }
}

/**
 * SimpleComposites can have lightweight components inserted, which are
 * directly controlled from the owners Machine.
 */
class SimpleComposite extends Programmable {
  constructor(run, opts) {
    super(run, opts)
    this.slots = new Set()
    this.parts = new Map()
  }
  addSlot (name) {
    this.slots.add(name)
  }
  install (slot, component) {
    assert(component instanceof SimpleComponent)
    if (!this.slots.has(slot) || this.parts.get(slot)) {
      return false
    }
    this.parts.set(slot, component)
    component.linkUp(this, slot)
    let ops = component.ops
    for (let k of Object.keys(ops)) {
      this.machine.addHardWord(slot + '-' + k, ops[k])
    }
    return true
  }
  uninstall (slot) {
    // TODO
  }
  tick () {
    super.tick()
    for (let part of this.parts.values()) {
      part.tick()
    }
  }
  accept (piece) {
    for (let part of this.parts.values()) {
      if (part.accept(piece)) {
        return true
      }
    }
    return false
  }
  pass (piece, newParent, opts) {
    for (let part of this.parts.values()) {
      if (part.pass(piece, newParent, opts)) {
        return true
      }
    }
    return false
  }
}

/**
 * SimpleComponents are tightly coupled with their parent, and do not have their
 * own Machines.
 */
class SimpleComponent extends DotLive {
  constructor (run, opts) {
    super(run)
    this.owner = null
    this.ops = opts.ops || {}
  }
  linkUp (owner, id) {
    assert(owner instanceof SimpleComposite)
    this.owner = owner
    this.id = id
  }
  accept (piece) {
    return false
  }
  pass (piece, newParent, opts) {
    return false
  }
  toString () {
    return 'simple component'
  }
}

/**
 * ScannerCore is functionality of a scanner, for use in components etc.
 */
class ScannerCore {
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

/**
 * ScannerSocketComponent is a basic scanner as a SocketComponent.
 */
class ScannerSocketComponent extends SocketComponent {
  constructor (run) {
    super(run)
    this.core = new ScannerCore()
    this.scanning = 0
    this.timeToScan = 1
    this.addHardWord('scan', (m, s) => {
      this.scanning = this.timeToScan
      s.push('scanning')
    })
    this.compileWord('do-scan', 'scan ;')
    this.compileWord('onscan', '"seen" load tojson "seen" return ;')
  }
  tick () {
    if (this.scanning > 0) {
      if ((--this.scanning) == 0) {
        let o = this.core.scan(this)
        this.machine.setVariable('seen', o)
        if (this.machine.hasWord('onscan')) {
          this.command({ src: 'onscan' })
        }
      }
    }
    super.tick()
  }
  toString () {
    return 'scanner ' + super.toString()
  }
}

/**
 * ScannerSimpleComponent is a basic scanner as a SimpleComponent.
 */
class ScannerSimpleComponent extends SimpleComponent {
  constructor(run) {
    super(run, {
      ops: {
        'scan': (m, s) => {
          if (this.scanning > 0) {
            s.push('already scanning')
            return
          }
          let args = popArgs(s, [ 'target', 'hook' ])
          this.args = args
          this.scanning = this.timeToScan
          s.push('scanning')
        }
      }
    })
    this.core = new ScannerCore()
    this.scanning = 0
    this.timeToScan = 1 * this.hz
  }
  tick () {
    if (this.scanning > 0) {
      if ((--this.scanning) <= 0) {
        this.scanning = 0
        let o = this.core.scan(this.owner)
        this.owner.machine.setVariable(this.args.target, o)
        this.owner.command({ src: this.args.hook })
      }
    }
  }
  toString () {
    return 'scanner ' + super.toString()
  }
}

/**
 * ArmCore is the functionality of an arm, for use in components etc.
 */
class ArmCore {
}

/**
 * ArmSocketComponent is a basic arm as a SocketComponent.
 */
class ArmSocketComponent extends SocketComponent {
  constructor (run) {
    super(run)
    this.howLongToGrab = 3
    this.grabbing = 0
    this.holding = null
    this.addHardWord('grab', (m, s) => {
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
    this.addHardWord('release', (m, s) => {
      // let owner = this.piece
      if (this.holding) {
        if (this.holding.socket) {
          this.holding.socket.unplug()
        }
        this.holding.move(this.area, this.holding.position)
        s.push('ok')
      } else {
        s.push('not holding anything!')
      }
    })
    this.addHardWord('holding', (m, s) => {
      if (this.holding) {
        s.push(this.holding.toString())
      } else {
        s.push('nothing')
      }
    })
    this.addHardWord('tell', (m, s) => {
      let src = s.pop()
      if (this.holding) {
        let socket = this.holding.socket
        if (socket) {
          // XXX - is this right place to compile?
          let app = lang.parse(src)
          let cmd = [ 'queue', [ null, app ] ]
          socket.send(cmd)
          s.push('ok')
          return
        } else {
          s.push('no socket')
          return
        }
      }
      s.push('not holding anything!')
    })
    this.addHardWord('copy', (m, s) => {
      let args = popArgs(s, ['data', 'name'])
      if (this.holding) {
        let socket = this.holding.socket
        if (socket) {
          let cmd = [ 'write', [ args.name, args.data ] ]
          socket.send(cmd)
          s.push('ok')
          return
        } else {
          s.push('no socket')
          return
        }
      }
      s.push('not holding anything!')
    })
    this.compileWord('do-grab', 'grab "grab" return ;')
    this.compileWord('ongrab', 'holding "grabbed" return ;')
    this.compileWord('onmiss', '"missed" "missed" return ; ')
    this.compileWord('do-tell' , 'program "programmed" return ;')
    this.compileWord('do-release', 'release "released" return ;')
  }
  tick () {
    if (this.grabbing > 0) {
      if ((--this.grabbing) == 0) {
        let near = this.area.visibleTo(this.piece)
        for (let e of near) {
          if (e.e.move(this)) {
            if (this.holding.socket) {
              this.holding.socket.plug(this)
            }
            this.command({ src: 'ongrab' })
            break
          }
        }
        if (this.holding == null) {
          this.command({ src: 'onmiss' })
        }
      }
    }
    if (this.holding) {
      this.holding.tick()
      // stop the thing dead
      this.holding.motion = null
    }
    super.tick()
  }
  accept (o) {
    this.holding = o
    o.parent = this
    return true
  }
  pass (o, newParent, opts) {
    if (this.holding === o) {
      if (newParent.accept(o, opts)) {
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

/**
 * ArmSimpleComponent is a basic arm as a SimpleComponent.
 */
class ArmSimpleComponent extends SimpleComponent {
  constructor(run) {
    super(run, {
      ops: {
        'grab': (m, s) => {
          if (this.holding) {
            s.push('already holding!')
            return
          }
          if (this.grabbing > 0) {
            s.push('already grabbing!')
          }
          let args = popArgs(s, [ 'hook' ])
          this.args = args
          this.grabbing = this.timeToGrab
          s.push('grabbing...')
        },
        'release': (m, s) => {
          if (this.holding) {
            if (this.holding.socket) {
              this.holding.socket.unplug()
            }
            this.holding.move(this.owner.area, this.holding.position)
            s.push('ok')
          } else {
            s.push('not holding anything!')
          }
        },
        'holding': (m, s) => {
          if (this.holding) {
            s.push(this.holding.toString())
          } else {
            s.push('nothing')
          }
        },
        'tell': (m, s) => {
          let [src] = popN(s, 1)
          if (this.holding) {
            let socket = this.holding.socket
            if (socket) {
              // XXX - is this right place to compile?
              let app = lang.parse(src)
              let cmd = [ 'queue', [ null, app ] ]
              socket.send(cmd)
              s.push('ok')
              return
            } else {
              s.push('no socket')
              return
            }
          }
          s.push('not holding anything!')
        },
        'copy': (m, s) => {
          let args = popArgs(s, ['data', 'name'])
          if (this.holding) {
            let socket = this.holding.socket
            if (socket) {
              let cmd = [ 'write', [ args.name, args.data ] ]
              socket.send(cmd)
              s.push('ok')
              return
            } else {
              s.push('no socket')
              return
            }
          }
          s.push('not holding anything!')
        }
      }
    })
    this.core = new ArmCore()
    this.grabbing = 0
    this.timeToGrab = 5 * this.hz
    this.holding = null
  }
  tick () {
    if (this.grabbing > 0) {
      if ((--this.grabbing) <= 0) {
        this.grabbing = 0
        let near = this.owner.area.visibleTo(this.owner.piece)
        for (let e of near) {
          if (e.e.move(this.owner)) {
            if (this.holding.socket) {
              this.holding.socket.plug(this)
            }
            break
          }
        }
        this.owner.command({ src: this.args.hook })
      }
    }
    if (this.holding) {
      this.holding.tick()
      // stop the thing dead
      this.holding.motion = null
    }
  }
  accept (o) {
    this.holding = o
    o.parent = this.owner
    return true
  }
  pass (o, newParent, opts) {
    if (this.holding === o) {
      if (newParent.accept(o, opts)) {
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

/**
 * SocketPlayer uses the SocketComposite system.
 */
class SocketPlayer extends SocketComposite {
  constructor (run, opts) {
    super(run, opts)
    // default extension points
    this.addSlot('arm-1')
    this.addSlot('arm-2')
    this.addSlot('eye')
    // some default components
    this.accept(new ArmSocketComponent(this.run), { slot: 'arm-1' })
    this.accept(new ScannerSocketComponent(this.run), { slot: 'eye' })
    // hardwords
    this.addHardWord('state', (m, s) => {
      s.push({
        position: this.position,
        power: [100, 100],
        wear: [10, 100]
      })
    })
    this.addHardWord('return', (m, s) => {
      let args = popArgs(s, [ 'data', 'name' ])
      this.events.push({
        typ: args.name,
        val: args.data
      })
    })
    // XXX - only exists because can't write this as app
    this.addHardWord('compose0', (m, s) => {
      let res = m.get(s.pop())
      // turn composite result into more user friendly things
      if (res) {
        let events = m.get('out') || []
        for (let r of res) {
          if (r.typ === 'res') {
            if (r.id) {
              events.push(r)
            }
          } else if (r.typ === 'debug') {
            // console.log('debug', r)
          } else {
            events.push(r)
          }
        }
        m.set('out', events)
      }
      s.push('ok')
    })
    // some default words
    this.compileWord('look', '"scan" "eye" tell ;')
    this.compileWord('grab', '"grab" "arm-1" tell ;')
    this.compileWord('compose', 'compose0 ;')
  }
  tick () {
    super.tick()
    if (this.composition) {
      if (this.composition === 'composed') {
        // look for any composed events in memory
        let out = this.machine.takeVariable('out')
        if (out) {
          this.events = this.events.concat(out)
        }
      } else {
        // else events direct from components
        this.events = this.events.concat(this.composition)
      }
    }
    if (this.machine.timeLeft > 0 && this.machine.hasWord('idle')) {
      this.command({ src: 'idle' })
      this.execute()
    }
  }
}

/**
 * SimplePlayer uses the SimpleComposite system.
 */
class SimplePlayer extends SimpleComposite {
  constructor (run, opts) {
    super(run, opts)
    // default extension points
    this.addSlot('arm-1')
    this.addSlot('arm-2')
    this.addSlot('eye')
    // events for sending back out of the game
    this.events = []
    // some default components
    this.install('eye', new ScannerSimpleComponent(this.run))
    this.install('arm-1', new ArmSimpleComponent(this.run))
    // hardwords
    this.addHardWord('state', (m, s) => {
      s.push({
        position: this.position,
        power: [100, 100],
        wear: [10, 100]
      })
    })
    this.addHardWord('return', (m, s) => {
      let args = popArgs(s, [ 'data', 'name' ])
      this.events.push({
        typ: args.name,
        val: args.data
      })
    })
    // some default words
    this.compileWord('look', '"seen" "on-scan" eye-scan ;')
    this.compileWord('on-scan', '"seen" load to-json "seen" return ;')
    this.compileWord('grab', '"on-grab" arm-1-grab ;')
    this.compileWord('on-grab', 'arm-1-holding "grabbed" return ;')
    this.compileWord('release', 'arm-1-release ;')
  }
  tick () {
    super.tick()
    if (this.machine.timeLeft > 0 && this.machine.hasWord('idle')) {
      this.command({ src: 'idle' })
      this.execute()
    }
  }
}

/**
 * Player is an object that has a special link to the game's control system.
 */
class Player extends SimplePlayer {
  constructor (run) {
    super(run, { colour: 'pink', size: 'medium' })
    // events for sending back out of the game
    this.events = []
    // some default words
    this.compileWord('sample', '1 2 + ;')
    this.compileWord('help', '"try typing list-programs" ;"')
    this.compileWord('get-state', 'state "state" return "ok" ;')
    this.compileWord('set-idle', '"idle" compile ;')
  }
  startTick (commands) {
    this.events = []
    if (commands) {
      for (let c of commands) {
        if (!this.command(c)) {
          this.events.push({
            typ: 'error',
            val: `command overflow`,
            cmd: c.id
          })
        }
      }
    }
  }
  endTick () {
    let res = this.results()
    if (res) {
      for (let r of res) {
        if (r.id) {
          this.events.push(r)
        }
      }
    }
    return this.events
  }
  toString () {
    return 'player ' + super.toString()
  }
}

/**
 * Robot1 is a basic robot. It has a Socket to control it, if you can plug into
 * it.
 */
class Robot1 extends Programmable {
  constructor (run, name, colour) {
    super(run, { colour })
    // internal state
    this.socket0 = this.machine.newSocket()
    this.machine.setVariable('name', name)
    this.time = 0
    this.power = { x: 0, y: 0 }
    // hardwired components
    this.scanner = new ScannerCore()
    // ops
    this.machine.addHardWord('power', (m, s) => {
      let [y, x] = [s.pop(), s.pop()]
      this.power.x = x
      this.power.y = y
    })
    this.machine.addHardWord('scan', (m, s) => {
      let o = this.scanner.scan(this)
      s.push(o)
    })
    // programs
    this.compileWord('doodle', ':r 0 4 rand 2 - ; r r power ;')
    this.compileWord('explore', '1 ;')
  }
  get socket () {
    return this.socket0
  }
  tick () {
    this.n++
    super.tick()
    if (this.machine.timeLeft > 0 && this.machine.hasWord('idle')) {
      this.command({ src: 'idle' })
      this.machine.execute()
    }
    this.motion = { x: this.power.x, y: this.power.y }
    for (let r of this.results()) {
      this.socket0.push([ 'res', r ])
    }
  }
  toString () {
    return `${this.colour} robot '${this.machine.getVariable('name')}' ` + super.toString()
  }
}

/**
 * Run is an episode of the game.
 */
class Run {
  constructor (hz) {
    this.hz = hz
    this.n = 0
    this.world = new World(this, 100, 100)
    this.player = new Player(this)
    this.player.place(this.world, { x: 10, y: 20 })
    this.addRandomRobot({ x: 12, y: 16 })
    this.addRandomRobot({ x: 1, y: 1 })
    this.addRandomRobot({ x: 8, y: 22 })
    this.addRandomRobot({ x: 80, y: 90 })
  }
  addRandomRobot (opts) {
    new Robot1(this, random.name(), random.colour()).place(this.world, opts)
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

/**
 * Game is everything someone has done or is doing.
 */
export default class Game {
  constructor (hz) {
    this.run = new Run(hz)
  }
  toString () {
    return 'game\n' + this.run
  }
}
