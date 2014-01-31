# flic
Easy Inter-process communication via TCP

[![Dependency Status](https://david-dm.org/nkcmr/flic.png?theme=shields.io)](https://david-dm.org/nkcmr/flic)
[![Build Status](https://travis-ci.org/nkcmr/flic.png?branch=master)](https://travis-ci.org/nkcmr/flic)

# Usage
```javascript
var flic = require("flic");
var Bridge = flic.bridge;
var Node = flic.node;

// Default port is 8221

// Bridge can be in any process, and nodes can be in any process
var bridge = new Bridge();

var node1 = new Node("node1", function(err){
	// Successfully connected to Bridge
	console.log("Cache node online!");
});
node1.on("event", function(param1, callback){
	// do awesomeness	
	console.log(param1); // -> "flic_is_easy"

	//send a callback fig.1
	callback(null, "ilovenodejs");
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

var anonymous_node = new Node(function(){
	console.log("somenode online!");
});

anonymous_node.tell("node1:event", "flic_is_easy", function(err, param2){
	console.log(param2); // -> "ilovenodejs"
});

```

# Concept
flic is modeled around the node.js EventEmitter, but is built around a TCP server to be able to send events between processes. The basic idea is that you can emit events in completely different processes over the `Bridge`.