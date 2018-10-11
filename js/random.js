

const colours = [
  '255,0,0',
  '0,0,255',
  '255,0,255',
  '150,150,150'
]

const adjs = [
  'spiny',
  'greasy',
  'shiny',
  'slimy'
]

const nouns = [
  'creeper',
  'snooper',
  'browser',
  'agitator',
  'frier'
]

export function pick (a) {
  return a[Math.floor(Math.random() * a.length)]
}

export function name () {
  let name = pick(adjs) + ' ' + pick(nouns)
  return name
}

export function colour () {
  return pick(colours)
}

export function int (min, max) {
  return min + Math.floor(Math.random() * (max - min))
}
