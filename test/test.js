var flic = require("../");
var Master = flic.master;
var Slave = flic.slave;

var test_master;

exports["Master construct - nominal"] = function(test){
  test.expect(2);
  test_master = new Master();
  test.ok(test_master instanceof Master);
  test.strictEqual(test_master.port, 8221);
  test.done();
}

exports["Master construct - invalid port number (too low)"] = function(test){
  test.expect(1);
  test.throws(function(){
    var a = new Master(1);
  });
  test.done();
}

exports["Master construct - invalid port number (too high)"] = function(test){
  test.expect(1);
  test.throws(function(){
    var a = new Master(85668);
  });
  test.done();
}

exports["Slave construct - nominal"] = function(test){
  test.expect(1);
  var slave = new Slave("slave", function(err){
    test.equal(err, null, "Callback returned an unexpected error.");
    test.done();
  });
}

exports["Slave construct - name taken"] = function(test){
  test.expect(1);
  var slave = new Slave("slave", function(err){
    test.equal(err, "Error: Duplicate slave name!", "Callback returned a different error than anticipated: '%s'", err);
    test.done();
  });
}

exports["Slave construct - invalid name"] = function(test){
  test.expect(1);
  test.throws(function(){
    var slave = new Slave("&*@dddd", function(){});
  });
  test.done();
}

exports["Slave construct - no master present"] = function(test){
  test.expect(1);
  var slave = new Slave("no_master", 9887, function(err){
    test.equal(err, "Error: Slave could not connect to Master!", "Callback returned a different error than anticipated: '%s'", err);
    test.done();
  });
}