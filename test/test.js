var root = __dirname.split("/");
var root_dir = "";
root.shift();
root.pop();
for (var i = 0; i < root.length; i++) {
	root_dir += "/" + root[i];
}

var flic = require(root_dir);

var master = new flic.Master(1450);

var slave = new flic.Slave("cache", 1450, function(err){
	if(err) throw err;

	console.log("Cache online...");
});

var slave2 = new flic.Slave("slave2", 1450, function(err){
	if(err) throw err;

	console.log("Slave2 online...")
});

slave2.on("eventt", function(param1, callback){

	console.log("slave2 received eventt: %s", param1);

	callback(null, "nkcmr");

});

setTimeout(function() {
	console.log("running tell to slave2");

	slave.tell("slave2:eventt", "haha", function(err, result){
		if(err) throw err;

		console.log("tell callback: %s", result);
	});
}, 1000);