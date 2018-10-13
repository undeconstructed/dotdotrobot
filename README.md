# dotdotrobot

A little idle programming game in a browser

While playing [trimps](https://trimps.github.io), I found myself thinking about
how it could all be automated. But then would I actually be playing the game
anymore?

So, how about an idle game where automation is the point, and all the elements
are programmed. But what if you want to automate the automation by scripting
your browser?

Also, I wanted to play with some new ES6 features, such as modules. Modules
provide a clean interface between code pieces, including providing a boundary
between simulation and control. Anything that does not breach this boundary
is not cheating.

## the UI

The UI for the game is a windowed environment intended to be as flexible as
possible. In the game world it is the UI of the control centre, which exists
in the simulation as a real thing. It is implemented on a mock operation
system.

## the OS

As time has gone on the frontend has become an increasingly complete Unix style
operating system. It has simulated processes, communicating through streams,
there are system calls that are monitored and logged. It's a bit over the top.

Basically this has all happened because I haven't been able to make any
decisions on what exactly is the purpose of any of this, so I've made
everything as open as possible.

It should hopefully be fairly fun to use the "OS" provided, although it is
also possible to interact with the simulation through the Runner interface.
This is also what the OS does, so it's not really cheating. It's pretty much
writing a new OS for the command console thing.

## the simulation

Behind the curtain is a very literal implementation of what you see. There are
javascript objects for each of the things you can interact with, and they each
have their own command interpreters, if they are programmable. The idea is that
they behave like independent devices, and as such absolutely no attempt is made
to make them efficient, they just run and whatever happens happens.

There's a special object called the control centre, which is what receives the
commands inputted, and creates the events that are returned. There is no other
way to interact with the world, and no way to get a global state view, you must
go through the control centre.

The control centre is itself a programmable machine, and is a composite thing.
To interact with the world, you will need to send commands to the control centre
that cause it to interact with the world, using components such as arms and
scanners. To get a view of the world you will need to aggregate the results of
scanning and interacting with the world.

There is a choice here, as you can program in the OS, reading events and writing
commands, or you can automate the control centre's internal computer.

With other machines in the simulation there is less choice, because as soon as
they are out of range of the control centre, the OS has no way to interact with.
There are robots, for example, that you can grab and program, but then they are
on their own until they come back. Assuming you have programmed them to come
back.

## the link

The frontend is connected to the simulation via a suitably restrictive
interface. The OS has system calls to send commands through to the simulated
control centre, and hooks to pick up whatever data comes back.

The interface is:

```
class Runner {
  command (command)
  read ()
  pause ()
}
```

Commands are ...
Read returns events, which are ...
Pause is pause.

## the machine language

The programming language of the machines is a little FORTH-like thing. You can
either compile programs and install them, or just run them directly. Try:

`1 2 +`

That should return 3, hopefully. Of course it may take a moment if there is
processing to do, but it will appear in the events view soon enough.

Disclaimer:  I don't know FORTH. I chose it because it seemed to be simple to
implement, and not need a grammar. I used [https://github.com/eatonphil/jsforth]
as a spec, but didn't look at the code, as I wanted to do it all myself.

## the machines

The machines have some memory, some storage, etc. Storage can contain new
FORTH words, that can then be called.

More explanation goes here.

## TODO

Almost everything.

* The actual game for one thing.
* Persistence.
* Maybe put the simulation into a worker.
