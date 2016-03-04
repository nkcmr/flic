# flic [![Build Status](https://travis-ci.org/nkcmr/flic.png?branch=master)](https://travis-ci.org/nkcmr/flic) [![npm version](https://img.shields.io/npm/v/flic.svg?style=flat-square)](https://www.npmjs.com/package/flic)
easy inter-process communication via tcp.



# install


```bash
npm install --save flic
```

# usage
flic's main purpose is to faciliate shuffling and passing of arbitrary data across various processes or networks.

being able to split up your application into different processes and even machines can vastly improve reliability and scalability, especially in an environment like node.js, where if your only process fails, your whole app is down.

```javascript
var flic = require('flic')

// bridges can be in any process, and nodes can be in any process
var bridge = flic.createBridge()

var node1 = flic.createNode('node1', function (err) {
  if (err) {
    return handle_error(err)
  }

  // successfully connected to bridge
  console.log('node1 online!');
});

node1.on('event', function (param1, callback) {
  // do awesomeness
  console.log(param1) // -> 'flic_is_easy'

  // send a callback fig.1
  callback(null, 'ilovenodejs')
})
```
somewhere else, in another process far far away!

```javascript
// make anonymous nodes by not giving it a name
// anonymous nodes:
// cannot be told (node.tell) anything
// can tell other nodes
// can receive shouts
// helps avoid duplicate node names

var anonymous_node = flic.createNode(function (err) {
  if (err) {
    return handle_error(err)
  }
  console.log('somenode online!')
})

anonymous_node.tell('node1:event', 'flic_is_easy', function (err, param2) {
  if (err) {
    return handle_error(err)
  }
  console.log(param2) // -> 'ilovenodejs'
})

```

# api

- **[flic](#flic)**
	- **[flic.createNode([config])](#fliccreatenodeconfig)**
	- **[flic.createBridge([config])](#fliccreatebridgeconfig)**
	- **[Class: flic.Bridge](#class-flicbridge)**
		- **[bridge.close([data][,...])](#bridgeclosedata)**
	- **[Class: flic.Node](#class-flicnode)**
		- **[node.tell(whowhat, [args][,...], [callback])](#nodetellwhowhat-args-callback)**
		- **[node.shout(event, [args][,...])](#nodeshoutevent-args)**
		- **[node.leave([force])](#nodeleaveforce)**

### flic
the `flic` module can be accessed by using `require('flic')`

### flic.createNode([config])
creates a new node. `config` is an object with the following available properties:

- `id` string - optional.
- `port` number - optional.
- `connect_callback` function - optional.
- `max_connection_attempts` number - optional.
- `timeout` number - optional.

### flic.createBridge([config])
creates a new bridge. `config` is an object with the following available properties:

- `port` number - optional.

### Class: flic.Bridge
the bridge is the middle-man between nodes that helps pass messages along.

### bridge.close([data][,...])
close the underlying server and optionally send any parting data.

```javascript
var bridge = flic.createBridge()
// ... later ...

// send an object to all nodes before leaving
bridge.close({ reason: 'im tired' })
```

### Class: flic.Node
nodes are objects which are capable of sending and receiving events and data from other nodes.

### node.tell(whowhat, [args][,...], [callback])

communicates data with other nodes through events. `whowhat` is a string that is formatted as such: `node_name:event`. `node_name` is the node that is trying to be reached. `event` is the event that should be emitted on the remote node. all following arguments are packed up and sent to the remote node.

`callback` is a function which will be called if the remote decides to acknowledge the event.

*note:* callbacks should follow the "error-first" style of callbacks so that errors can be communicated.

### node.shout(event, [args][,...])

communicates data with all nodes through an event. this does not have the ability to receive acknowledgment callbacks.

### node.leave([force])

disconnects from the bridge and properly cleans up links in the bridge. there is the ability to immediately disconnect without telling the bridge with the `force` option.

## command-line usage

a bridge can be started without putting it into a random process. to do so, install flic globally, like this:

```
npm install -g flic
```

and then you can start a bridge by simply executing: `flic --bridge`. tweaking the listening address is possible by simply stating it as an argument to `--bridge`, `flic --bridge 0.0.0.0:8222`


# The MIT License (MIT)

Copyright (c) 2016 Nick Comer

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
