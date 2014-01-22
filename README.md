# flic
easy Inter-process communication via TCP

# Usage
```javascript
var flic = require("flic");

var port = 8221;

// Master can be in any process, and slaves can be in any process
var master = new flic.master(port);

var cache_slave = new flic.slave("cache", port, function(err){
	console.log("Cache slave online!");});
cache_slave.on("get", function(key, callback){
	// get something from a cache
	
	callback(null, val);});
```
Somewhere else, far far away!

```javascript
var some_slave = new flic.slave("someslave", port, function(){
	console.log("someslave online!");});

var key = "cachekey";

some_slave.tell("cache:get", key, function(err, val){
	// we have the value!!});

```