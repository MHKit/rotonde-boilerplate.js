## Introduction

rotonde-client.js is the javascript abstraction above [rotonde](https://github.com/HackerLoop/rotonde).
Using abstractions above rotonde is totally optionnal, this project is
just here to add a layer of comfort.

Please first read the [rotonde](https://github.com/HackerLoop/rotonde) documentation.

# Tutorial #1

This tutorial is for node, but rotonde-client.js is also available for
browser, build it with `gulp build` in the rotonde-client directory, the
compiled javascript will be present in the dist/ directory.

Lets write a simple program using rotonde-client.js:

```js

'use strict';

let newClient = require('rotonde-client/node/rotonde-client');

let client = newClient('ws://localhost:4224/');

client.onReady(() => {
  console.log('connected to rotonde !!!');
});

client.connect();

```

This is the simplest and most useless module.
Lets review is line by line.

```js
let newClient = require('rotonde-client/node/rotonde-client');
```

the node version is in node/rotonde-client, when you require it, you end up with
a function that creates clients.

```js
let client = newClient('ws://localhost:4224/');
```

calling the newClient function creates a client, and provides the url of
the rotonde server, this call doesn't start the connection.

```js
client.onReady(() => {
  console.log('connected to rotonde !!!');
});
```

this line lets you specify a function to call when the connection is
established, this is the function where everything starts.

We are now ready to start the connection to rotonde with the `connect`
method.

```js
client.connect();
```

If the connection is successful, running this small program should just
print `connected to rotonde !!!`, and then hang.

That's not really useful for now, the next tutorial is going to focus on
the function that we passed to `onReady`.

# Tutorial #2

Now that we know how to connect to rotonde, we can start using it, or
more precisely, start using the other modules connected to it.

In rotonde, everything you do is send actions and listen for events,
which means that usually the program that you create relies on other
modules.
Now, because you have read the rotonde documentation, you know that the
first thing you receive upon connection with rotonde, is a list of
available actions and events.
These events and actions describe what is available on the system.

Which means that, in order to work well, your module first has to make
sure the events and actions it needs are available.

rotonde-client does this through the `bootstrap` method. The role of the
bootstrap method is to ease the usual startup procedure of modules,
which usually implies listening incoming definitions, checking if we
find the one we need, sending initializing actions, and wait for events
telling that everything is initialized properly.

The `bootstrap` method takes four arguments:
- `actions`: the list of actions that should be available, and sent when
  immediately after.
  The list is given in the form of a map, where the key of each entry is
  an action identifier, and the value of the entry is the data for the
  action.
- `events`: a list of event identifiers that should be available, and received in
  response to the actions sent; `events` can also be spontaneous.
- `defs`: a list of additional actions or events identifiers that should
  be received before starting.
- `timeout`: ignored is 0, it specifies how long you can wait to receive
  these events.

For this tutorial, we will have a look at the serial module [serial-port-json-server](https://github.com/HackerLoop/serial-port-json-server).

This module lets control the serial ports of your device, it has many
events and actions, but the ones that interest us are
- `SERIAL_OPEN`: the action that opens a serial port
- `SERIAL_OUTPUT`: the event that reports the result of opening the port
- `SERIAL_PORTMESSAGE`: the event that is sent when something is
  received on an openned port.

So if we want to create a module that uses the serial port, we will
proceed as follows:
- wait for the events and actions above to be received.
- send a `SERIAL_OPEN`.
- wait for the `SERIAL_OUTPUT' that tells if the open worked or not.

This steps can be done in one line thanks to the `bootstrap` method:

```js
client.bootstrap({'SERIAL_OPEN': openaction}, ['SERIAL_OUTPUT'], ['SERIAL_PORTMESSAGE'])
```

:)

This method returns a Promise, if you don't know what it is, read
[this](https://spring.io/understanding/javascript-promises).


Now that you know what a promise is, you know that the next thing to do
it put the resolve and reject callbacks for this promise:

```js
// this is the body of the SERIAL_OPEN action
let openaction = {
  port: '/dev/ttyAMA0',
  baudrate: 9600,
};

client.bootstrap({'SERIAL_OPEN': openaction}, ['SERIAL_OUTPUT'], ['SERIAL_PORTMESSAGE']).then((events) => {
  // this is the success callback
  console.log('ok, received events:', events);
}, (error) => {
  // this is the error callback
  console.log('error', error);
});
```

If everything went well, you should see the `ok, received events:`
message.

The `events` argument received in the success callback is the list of
events received, in this case, we only specified `SERIAL_OUTPUT` as
second argument to bootstrap, so `events` will only contain one entry,
which is the `SERIAL_OUTPUT` event returned by the serial module upon
connection (the `SERIAL_OPEN` action that was first sent).

It is an event so its structure is as follows:

```js
{
  identifier: "SERIAL_OUTPUT",
  data: {
    ... the data for this event ...
  }
}
```
(but you only knew this, because you carefully read the rotonde
documentation, which is [here](https://github.com/HackerLoop/rotonde/blob/master/README.md))

This event's `data` has a `Cmd` field, when the `SERIAL_OPEN` succeeded,
its value will be `Open`.
We can now add the check to the code we wrote:

```js
let openaction = {
  port: '/dev/ttyAMA0',
  baudrate: 9600,
};

client.bootstrap({'SERIAL_OPEN': openaction}, ['SERIAL_OUTPUT'], ['SERIAL_PORTMESSAGE']).then((events) => {
  // this is the success callback
  // lets check if the SERIAL_OPEN action succeeded
  let serialOutputEvent = events[0].data;
  if (serialOutputEvent.Cmd == 'Open') {
    console.log('port open, start listening for messages');
  }
}, (error) => {
  // this is the error callback
  console.log('error', error);
});

```

There is one thing missing, we will never know what goes through the
serial port, because we didn't subscribe to the `SERIAL_PORTMESSAGE`
event.
We passed it to bootstrap as third argument, but that only ensures that
it is present on the system before calling the callback.

subscribing to events is quite easy, you just have to add an handler to
rotonde-client:

```js
client.eventHandlers.attach('SERIAL_PORTMESSAGE', (event) => {
  console.log(event);
});
```

(explanation on what is this `eventHandlers` can be found later in this document).

Adding event handlers can be made before anything, you don't have to be in
the `onReady` callback, makes things clearer to me.

Now everything is setup, you can now access your serial ports from
rotonde.
And more important you can code directly from your dev machine, no need
to be on the raspberryPI (or any other), you can even code in your
browser to have the Chrome/Firefox debugger available.

The final code looks like:

```js
'use strict';

let newClient = require('rotonde-client/node/rotonde-client');

let client = newClient('ws://192.168.2.9:4224/');

let openaction = {
  port: '/dev/ttyAMA0',
  baudrate: 9600,
};

client.eventHandlers.attach('SERIAL_PORTMESSAGE', (event) => {
  console.log(event);
});

client.onReady(() => {
  client.bootstrap({'SERIAL_OPEN': openaction}, ['SERIAL_OUTPUT'], ['SERIAL_PORTMESSAGE']).then((events) => {
    let serialOutputEvent = events[0].data;
    if (serialOutputEvent.Cmd == 'Open') {
      console.log('port open, start listening for messages');
    }
  }, (error) => {
    console.log('error', error);
  });
});

client.connect();
```

# Contributing 

Yes please.

![](https://d2v4zi8pl64nxt.cloudfront.net/1362775331_b8c6b6e89781c85fee638dffe341ff64.jpg)
