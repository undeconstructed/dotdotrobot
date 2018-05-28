# dotdotrobot

A little idle programming game in a browser

While playing [trimps](https://trimps.github.io), I found myself thinking about
how it could all be automated. But then would I actually be playing the game
anymore?

So, how about an idle game where automation is the point, and all the elements
are programmed. But what if you want to automate the automation by scripting
your browser?

Also, I wanted to play with some new ES6 features, such as modules. Modules
provide a clean interface between code pieces, so might as well say that
meta-automation is allowed too, as long as you don't breach the module boundary.

The simulation runs in the background (although currently in the same thread)
in a module, and provides a serial connection to the simulation, taking in
textual commands, spitting back events.

The UI is another module, which uses only the public interface of runner.js. The
UI updates with requestAnimationFrame, and is entirely decoupled from the
simulation.

As far as I'm concerned nothing is cheating as long as you only interact only
with the runner.js exported interface. Currently, that's this:

```js
class Runner {
  command (command)
  read ()
  pause ()
}
```

## TODO

Almost everything.

* The actual game for one thing.
* Implement the programming language.
* Maybe put the simulation into a worker.
