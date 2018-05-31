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

## the environment

You can send commands to a machine. That machine will run them, and send back
answers. This all happens asynchronously as far as the game is concerned.

Each command is a program to run, and some args, in a very basic form:

`prog args are not parsed, this is all just passed on`

The programs available are those installed. You can run `list-programs` to see
them. Programs are either native, meaning they deal with the specifics of the
"hardware", or are written in the little language these machine understand.

Programs can be installed, replaced etc.

The player machine is in fact a composite machine. It has a special command
called "tell" which passes on a command to component. One component installed
at the start is called "eye", try:

`tell eye scan`

The will run a command called "scan" on the eye, in the same way as you can
directly run commands on the player. In fact, all machines in the game use the
same core, and so run in basically the same way.

## the language

The programming language of the machines is a little FORTH-like thing. You can
either compile programs and install them, or there is a script program
pre-installed for one offs. Try:

`script 1 2 +`

That should return 3, hopefully. Of course it may take a moment if there is
processing to do, but it will appear in the events view soon enough.

Most programs are actually just wrappers around special, hardware specific, ops.
The above "tell" program actually has just a couple of lines, ending with the
"tell" op, which is specific to composite machines. Sending commands to
components can thus be easily done within the language, e.g.:

`script "scan" "eye" tell`

That is actually the source of the "look" program that is pre-installed in the
player.

## TODO

Almost everything.

* The actual game for one thing.
* Implement the programming language.
* Persistence.
* Maybe put the simulation into a worker.
