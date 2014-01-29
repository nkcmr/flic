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

var slave1, slave2;

exports["Slave tell - nominal (receiving events)"] = function(test){
  test.expect(1);
  slave2 = new Slave("slave2", function(){});
  slave1 = new Slave("slave1", function(){});
  slave1.on("test_event", function(param1){
    test.equal(param1, "testParam", "param1 is not right: %s", param1);
    test.done();
  });

  setTimeout(function() {
    slave2.tell("slave1:test_event", "testParam");
  }, 500);
}

exports["Slave tell - nominal (receiving events and sending callbacks)"] = function(test){
  test.expect(2);
  slave1.on("test_event2", function(param1, callback){
    test.equal(param1, "testParam", "param1 is not right: %s", param1);
    callback(null, param1);
  });

  setTimeout(function() {
    slave2.tell("slave1:test_event2", "testParam", function(err, param2){
      test.equal(param2, "testParam", "param2 is not right: %s", param2);
      test.done();
    });
  }, 500);
}

