

const colours = [
  'red',
  'blue',
  'gray',
  'green'
]

const adjs = [
  'spiny',
  'greasy',
  'shiny',
  'purple'
]

const nouns = [
  'creeper',
  'snooper',
  'browser'
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
