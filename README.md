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

## the language

The programming language of the machines is a little FORTH-like thing. You can
either compile programs and install them, or just run them directly. Try:

`1 2 +`

That should return 3, hopefully. Of course it may take a moment if there is
processing to do, but it will appear in the events view soon enough.

Disclaimer:  I don't know FORTH. I chose it because it seemed to be simple to
implement, and not need a grammar. I used [https://github.com/eatonphil/jsforth]
as a spec, but didn't look at the code, as I wanted to do it all myself.

## the machines

Explain the machines.

## the environment

You can send commands to a machine. That machine will run them, and send back
answers. This all happens asynchronously as far as the game is concerned.
Everything is in the same language, the command shell actually compiles your
input into a program and runs it once.

Apps can call any word that is installed.

Everything is a FORTH word, either a compiled app, or a native piece of hardware
functionality.

## the player machine

The player machine is in fact a composite machine. It has a special word
called "tell" which passes on a script to a component. One component installed
at the start is called "eye", try:

`"scan" "eye" tell`

The will run a word called "scan" on the eye, in the same way as you can
directly run words on the player machine. In fact, all machines in the game use the
same core, and so run in basically the same way.

## try me

### with simple composites

```
# look around
look
# tell look to run all the time
"look" set-idle
# the program the robot will run
`:r 0 4 rand 2 - ; r r power ;` "robrun" compile
# catch a robot
grab
# copy the run program to the robot
"robrun" load "idle" arm-1-copy
# release the robot
release
# is it moving?
```

```
# using all the pre-programmed things
160 degrees grab
program
160 degrees grab
read
```

```
# a complicated robot program
`dup "count" store "n" store 1 "d" store ;` "robsetup" compile
`
:go "d" load 3 * dup log 0 power ;
:stop 0 0 power ;
:flip "d" load 1 = dup if 0 1 - "d" store "count" load "n" store ; invert if 0 "d" store ; ;
"n" load 1 - dup "n" store 0 = dup if "d" load 1 = if scan "seen" store ; flip ; invert if go ; ;`
"robrun" compile
# catch a robot
grab
# copy setup program
"robsetup" load "setup" arm-1-copy
# run setup program
`5 setup` arm-1-tell
# copy run program as idle and release
"robrun" load "idle" arm-1-copy release
```

### with socket composites

```
# compile a little test program
`"testing" dup log` "test" compile
# try running it
test
# load it onto the stack and copy it to the arm component
"test" load "arm-1" "armtest" copy
# tell the arm to run it
`armtest` "arm-1" tell
```

```
# look around
look
# tell look to run all the time
"look" "idle" compile
# the program the robot will run
`:r 0 4 rand 2 - ; r r power ;` "robrun" compile
# program to copy from arm to robot
`"robrun" load "idle" copy` "copy-robrun" compile
# copy them to the arm
"robrun" load "arm-1" "robrun" copy
"copy-robrun" load "arm-1" "copy-robrun" copy
# catch a robot
"grab" "arm-1" tell
# copy the run program to the robot
`copy-robrun` "arm-1" tell
# release the robot
"release" "arm-1" tell
# is it moving?
```

## TODO

Almost everything.

* The actual game for one thing.
* Persistence.
* Maybe put the simulation into a worker.
