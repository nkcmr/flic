# flic
easy Inter-process communication via TCP

# Usage
```javascript
var flic = require("flic");
var Master = flic.master;
var Slave = flic.slave;

// Default port is 8221

// Master can be in any process, and slaves can be in any process
var master = new Master();

var cache_slave = new Slave("cache", function(err){
	// Successfully connected to Master
	console.log("Cache slave online!");});
cache_slave.on("get", function(key, callback){
	// get something from a cache
	
	callback(null, val);});
```
Somewhere else, far far away!

```javascript
// Make anonymous slaves by not giving it a name
// Anonymous slaves:
// Cannot be told (Slave.tell) anything
// Can tell other slaves
// Can receive shouts

var anonymous_slave = new Slave(function(){
	console.log("someslave online!");});

var key = "cachekey";

anonymous_slave.tell("cache:get", key, function(err, val){
	// we have the value!!});

```

# Concept
