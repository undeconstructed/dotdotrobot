
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

export default function create () {
  let name = adjs[Math.floor(Math.random() * adjs.length)] + ' ' + nouns[Math.floor(Math.random() * nouns.length)];
  return name
}
