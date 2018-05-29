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

## the simulation

Behind the curtain is a very literal implementation of what you see. There are
javascript objects for each of the things you can interact with, and they each
have their own command interpreters, if they are programmable. The idea is that
they behave like independent devices, and as such absolutely no attempt is made
to make them efficient, they just run and whatever happens happens.

There's a special object called the player, which is what receives the commands
sent through the runner, and creates the events that are returned through the
runner. There is no other way to interact with the world, and no way to get
a global state view, you must go through the player object.

The player is itself programmable, and is a composite thing. To interact with
the world, you will need to send commands to the player that send commands to
the component parts, such as arms and scanners. To get a view of the world you
will need to aggregate the results of scanning and interacting with the world.

There is a choice here, as you can program in javascript in your browser,
allowing you to render views etc and interactively control the player. Or you
can program the player to manage itself.

With other things in the simulation there is less choice, because as soon as
they are out of range of the player, you cannot interact with them anymore.
There are robots, for example, that you can grab and program, but then they are
on their own until they come back. Assuming you have programmed them to come
back.

## TODO

Almost everything.

* The actual game for one thing.
* Implement the programming language.
* Persistence.
* Maybe put the simulation into a worker.
