# flic
Easy Inter-process communication via TCP

# Usage
```javascript
var flic = require("flic");
var Master = flic.master;
var Slave = flic.slave;

// Default port is 8221

// Master can be in any process, and slaves can be in any process
var master = new Master();

var slave1 = new Slave("slave1", function(err){
	// Successfully connected to Master
	console.log("Cache slave online!");});
slave1.on("event", function(param1, callback){
	// do awesomeness	
	console.log(param1); // -> "flic_is_easy"

	//send a callback fig.1
	callback(null, "ilovenodejs");});
```
Somewhere else, far far away!

```javascript
// Make anonymous slaves by not giving it a name
// Anonymous slaves:
// Cannot be told (Slave.tell) anything
// Can tell other slaves
// Can receive shouts
// Helps avoid duplicate slave names

var anonymous_slave = new Slave(function(){
	console.log("someslave online!");});

anonymous_slave.tell("slave1:event", "flic_is_easy", function(err, param2){
	console.log(param2); // -> "ilovenodejs"});

```

# Concept
