# flic
Easy Inter-process communication via TCP

[![Dependency Status](https://david-dm.org/nkcmr/flic.png?theme=shields.io)](https://david-dm.org/nkcmr/flic)
[![Build Status](https://travis-ci.org/nkcmr/flic.png?branch=master)](https://travis-ci.org/nkcmr/flic)

# Install
via git:
```bash
 [root@localhost ~] npm install git://github.com/nkcmr/flic
```

or npm
```bash
 [root@localhost ~] npm install flic
```

# Usage
```javascript
var flic = require('flic');
var Bridge = flic.bridge;
var Node = flic.node;

// Default port is 8221

// Bridge can be in any process, and nodes can be in any process
var bridge = new Bridge();

var node1 = new Node('node1', function(err){
  if(err) return handleError(err);

	// Successfully connected to Bridge
	console.log('node1 online!');
});

node1.on('event', function(param1, callback){
	// do awesomeness	
	console.log(param1); // -> 'flic_is_easy'

	//send a callback fig.1
	callback(null, 'ilovenodejs');
});
```
Somewhere else, far far away!

```javascript
// Make anonymous nodes by not giving it a name
// Anonymous nodes:
// Cannot be told (Node.tell) anything
// Can tell other nodes
// Can receive shouts
// Helps avoid duplicate node names

var anonymous_node = new Node(function(err){
  if(err) return handleError(err);

	console.log('somenode online!');
});

anonymous_node.tell('node1:event', 'flic_is_easy', function(err, param2){
  if(err) return handleError(err);

	console.log(param2); // -> 'ilovenodejs'
});

```

# Concept
flics intended solution is to be able to send arbitrary data in between seperated proccesses without a whole lot of fuss. There are existing inter-process messaging APIs already built into node (between parent and child processes) but this can hook up any locally running node processes fairly easily.

# API
### Node
A node is an endpoint that can be reached by other nodes. Exposed by `require('flic').node`
#### new Node( [name], [port], [callback] )
Creates a new instance of `Node`

- `name [string]` (optional) A name for the node, so that it can be contacted by other nodes, if none is specified, the node will be assigned a random name and be **anonymous**. Anonymous nodes cannot be reached by other nodes, but can receive shouts.
- `port [number]` (optional, defaults to 8221) The port number of the Bridge.
- `callback [function]` (optional) A callback that will be called when the node is done trying to connect with the Bridge. Callback will be called with only one error parameter, if `null`, the node is successfully connected.

#### node#tell( who_what, [args...], [callback] )
Tell another node about an event

- `who_what [string]` (required) the inteded target of the tell. For example if you wanted to reach the `cache` node and tell it to `get` something, this parameter would be `cache:get`. To tell `webworker` to `suspend`, it would be `webworker:suspend`.
- `args [mixed]` (optional) Put any arguments that need to be sent to the remote node. Example: When calling `node.tell("webworker:suspend", "now", 0, function(){});` the web worker's suspend event will receive `"now"` and `0` as parameters.
- `callback [function]` (optional) If the remote node decideds to reply via callback, this is the function that will be called. (expect the first parameter to be an error, if one occured)

#### node#shout( event_name, [args...] )
Tell all connected nodes about an event

- `event_name [string]` (required) The event to broadcast.
- `args [mixed]` (optional) any arguments that the receivers of the shout should receive.

Node instances also inherit the node.js EventEmitter, so when other nodes tell a node about an event, you can attach a listener of that event like you would with the EventEmitter. Example:

```javascript
var node1 = new Node('node1', function(){ 
    console.log('online'); 
});
node1.on('my_event', function(param1, callback){
    console.log(param1); // -> 'ilovenodejs'
    callback(null, 'me too!');
});

var anon_node = new Node(function(){
    console.log('Anonymous node is online.');
    this.tell('node1:my_event', 'ilovenodejs', function(err, param1){
       console.log(param1); // -> 'me too!' 
    });
});
```

**Note about callbacks: ** All callbacks should use the 'error-first' style, because if an error occurs with flic, it will notify not only through the callbacks, but using the first parameter to tell which error has occurred.

### Bridge

The bridge is what it sounds like, it is merely a bridge between the nodes, not very much logic or work goes into the bridge. Exposed by `require('flic').bridge`

#### new Bridge( [port] )
Creates a new instance of `Bridge`

- `port [number]` (optional, defaults to 8221) A port number for the bridge to listen on.

#### Bridge#close( [args...] )
Closes the bridge and sends any data to connected nodes.

- `args [mixed]` (optional) any data to be sent to connected nodes upon close.

# The MIT License (MIT)

Copyright (c) 2013 Nick Comer

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