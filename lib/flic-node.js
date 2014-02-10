const GONE = "GONE";
const TELL = "TELL";
const SHOUT = "SHOUT";
const IDENT = "IDENT";
const ACK = "ACK";
const CLOSE = "CLOSE";

var _ = require("lodash")
  , util = require("util")
  , debug = require("debug")("flic:node")
  , Message = require("./flic-message.js")
  , events = require("events")
  , net = require("net");


function Node(){
  var name, port, callback, self, args;
  /*
  TODO:
  - if disconnected from Bridge attempt to reconnect
   */

  args = Array.prototype.slice.call(arguments);

  for (var i = 0; i < args.length; i++) {
    if (_.isString(args[i]))
      name = args[i];

    if (_.isNumber(args[i]))
      port = args[i];

    if (_.isFunction(args[i]))
      callback = _.once(args[i]);
  }

  self = this;

  // Set node name
  if (!name) {
    // No name? Anonymous node.
    // Anonymous nodes:
    // - Can receive shouts
    // - Can't be told remotely (Node.tell)
    // - Can tell other nodes and receive callbacks from tell
    self.nodeName = randString();
  } else {
    if (!name.match(/^[a-zA-Z|_|$][a-zA-Z0-9|_|$]*$/))
      throw new Error("Node must have a valid name");
    else
      self.nodeName = name;
  }

  // Make sure we have a valid port number
  if (!port || port <= 1023 || port > 65535) port = 8221;

  // Make sure there is a function to call, even if its empty
  if (!callback) callback = function() {};

  // Set up an array to store waiting callbacks
  self.waiters = {};

  var tries = 0;
  var hasConnected = false;

  function connect(){
  // Lets connect to the Bridge
    self.bridge = net.connect(port, function() {
      // Set hasConnected to true, so if the socket errors out we won't attempt
      // to reconnect.
      hasConnected = true;

      var ident, message_id;

      // Identify the node to the bridge
      debug("sending IDENT");

      // Create a new Message
      ident = new Message(IDENT);

      // Attach the node name
      ident.setNodeName(self.nodeName);

      // Get the ID of the message so we can store the callback as a waiter
      message_id = ident.getId();

      // store the callback in the waiters list
      self.waiters[message_id] = callback;

      // tell the bridge
      self.bridge.write(ident.toString());
    });
    self.bridge.setTimeout(0);
    self.bridge.on("data", function(message) {
      debug("Node <-- Bridge: %s", message);

      message = JSON.parse(message);

      if (message.hasOwnProperty("method")) {
        switch (message.method) {
          case ACK:
            debug("Received ACK from Bridge for message: %s", message.data[0]);
            // Save the message ack id - we'll be plucking it from the array later.
            var mid = message.data[0];
            if (self.waiters.hasOwnProperty(mid)) {
              var callback = self.waiters[mid];

              if (_.isFunction(callback)) {
                var args = message.data[1];

                callback.apply(self, args);

                debug("removing callback %s from waiters", mid);
                delete self.waiters[mid];
              }
            }
            break;
          case TELL:
            var from = message.data[0],
              callback_id = message.data[1],
              event_name = message.data[2],
              params = message.data[3];

            debug("Received TELL(%s) from %s", event_name, from);

            // Define a callback function that can be called by a receiving function
            var cb = function() {
              var args, msg;
              // Grab all the args
              args = Array.prototype.slice.call(arguments);

              // construct the message
              msg = new Message(ACK, [from, callback_id, args]);

              // set a node name just for kicks i guess
              msg.setNodeName(self.nodeName);

              // send that mo-fucka
              self.bridge.write(msg.toString());
            };

            // push the callback to the end of the params array
            params.push(cb);

            // push the event name to the beginning
            params.unshift(event_name);

            // emit that sunuva-bitch
            self.emit.apply(self, params);
            break;
          case SHOUT:
            debug("Received SHOUT(%s)", message.data[0]);

            self.emit.apply(self, message.data);
            break;
          case CLOSE:
            debug("Received CLOSE");

            message.data.unshift(CLOSE.toLowerCase());

            self.emit.apply(self, message.data);
            break;
        }
      }
    });

    self.bridge.on("error", function(e) {
      debug("%s", e);

      if(!hasConnected){
        tries++;
        if(tries < 5){
          debug("Attempting to reconnect... (Try number: %d)", tries);
          setTimeout(function(){
            connect();
          }, tries * 250);
        }else{
          callback("Error: Node could not connect to Bridge!");
        }
      }else{
        self.emit("error", e);
      }
    });
  }

  connect();
  
  return self;
}
util.inherits(Node, events.EventEmitter);

Node.prototype.connect = function() {
  // body...
};

/**
 * Node#tell()
 * @param {string} who_what - the node name and event in the following format: 
 * "node_name:event_name"
 * @param {csv} args - any amount of arguments to be sent along with the remote 
 * event
 * @param {function} callback - a callback to be run when the remote event calls
 * its callback
 * @return {Node} - returns self for chainability
 */
Node.prototype.tell = function() {
  var self, args, who_what, callback, tell_message, mid;

  self = this;
  args = Array.prototype.slice.call(arguments);
  who_what = args.shift();
  if (_.isFunction(args[args.length - 1])) {
    callback = args.pop();
  }

  if (!(_.isString(who_what) && who_what.match(/^[a-zA-Z0-9|_|$]*:[a-zA-Z0-9|_|$]*$/)))
    throw new Error("Invalid tell statment");

  var i = who_what.indexOf(":");
  var nodeName = who_what.substring(0, i);
  var eventName = who_what.substring(i + 1);

  var destination = [nodeName, eventName, args];

  tell_message = new Message(TELL, destination);
  tell_message.setNodeName(self.nodeName);

  if ( !! callback) {
    mid = tell_message.getId();
    self.waiters[mid] = callback;
  }

  self.bridge.write(tell_message.toString());

  return self;
}

Node.prototype.shout = function() {
  var self, args, event_name;
  self = this;
  args = Array.prototype.slice.call(arguments);

  var shout_msg = new Message(SHOUT, args);
  shout_msg.setNodeName(self.nodeName);

  self.bridge.write(shout_msg.toString());

  return self;
};

function randString() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < 5; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
}

module.exports = Node;