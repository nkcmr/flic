/**
 *  flic
 *  Written by: Nick Comer <nick@comer.io> (http://nick.comer.io)
 *  Licensed under MIT
 */

var net = require("net"),
  util = require("util"),
  events = require("events"),
  debug = require("debug")("flic"),
  _ = require("lodash"),
  Message = require("./flic-message.js");

// node1 --[TELL(node_name, node_event, params...)]-> bridge --[EVENT(from, callback_id, event_name, params)]-> node2
//  ||                                                  ||   <-[EVENTCB(to, callback_id, params)]--------------  ||
//  ||   <-[ACK(callback_id, params...)]-------------   ||                  

const GONE_MSG = "Bridge - message send failure, node is gone (%s)";
const GONE = "GONE";
// This means that in attempt to reach a node, the bridge could not because the
// node is gone.
// to be sent as a string indicating an error to a callback

const TELL = "TELL";
// Send a message to the bridge to tell a node about an event.
// [0] node name
// [1] node event
// [2] array of params

const SHOUT = "SHOUT";
// Broadcast an event to all nodes, even anonymous ones.
// [0] event name
// [1] params to be sent (array);

const EVENT = "EVENT";
// Bridge sends a message to a node about an event sent from another node
// [0] sent from which node
// [1] callback id
// [2] event name
// [3] array of params

const EVENTCB = "EVENTCB";
// Node sends a callback from an event back to the bridge, bridge then sends
// ACK
// [0] to
// [1] callback_id
// [2] params

const IDENT = "IDENT";
// NOTE: nodeName can be attached to the message instead of having to be placed
// in the data array.

const ACK = "ACK";
// [0] the id of the message that is being acknowledged
// [1] array of args

const CLOSE = "CLOSE";
// [0] array of data to be sent to all nodes (optional)

function Bridge(port) {
  var self = this;

  if (port) {
    if (_.isNumber(port)) {
      if (!(port > 1023 && port <= 65535)) {
        debug("Bridge - port number invalid");
        throw new Error("Invalid port number supplied");
      }
    } else {
      throw new Error("Invalid port number supplied");
    }
  } else {
    self.port = 8221;
  }

  // We store all of the sockets here
  self.sockets = {};

  //
  self.tcpServer = net.createServer(function(socket) {
    debug("Bridge - new node");

    socket.setEncoding("utf8");

    socket.on("data", function(message) {
      debug("Node --> Bridge: %s", message);

      // message is a stringified JSON, let's parse it
      message = JSON.parse(message);

      // make sure that the message has a type
      if (message.hasOwnProperty("type") && _.isString(message.type)) {
        debug("Bridge - Received %s from %s", message.type, message.nodeName || "unknown");
        switch (message.type) {
          case IDENT:
            // Check if node name is already taken
            if (self.sockets.hasOwnProperty(message.nodeName)) {
              debug("Duplicate node name: %s", message.nodeName);

              // Unfortunately Error containers don't translate across TCP, so 
              // we have to fall back to just putting error messages in strings.
              // 
              // Documentation should strongly advise using the "error-first"
              // style callbacks, as flic will send any non-fatal error messages
              // using this paradigm.
              var err = new Error("Duplicate node name!");
              err = err.toString();

              var ack_w_err = new Message(ACK, [message.id, [err]]);

              try {
                socket.write(ack_w_err.toString());
              } catch (e) {
                debug(GONE_MSG, "");
              }

              break;
            }

            // Save nodeName to the socket itself, this is important for when
            // the socket closes.
            socket.nodeName = message.nodeName;

            // Save socket to list of sockets!
            self.sockets[message.nodeName] = socket;

            self.sockets[message.nodeName].on("close", function(had_error) {
              debug("Node '%s' has disconnected. Deleting...", this.nodeName);
              delete self.sockets[this.nodeName];
            });

            // Create ACK message
            var ack = new Message(ACK, [message.id, [null]]);

            // Send that bitch
            debug("Bridge - Sending ACK (id: %s)", message.id);

            try {
              self.sockets[message.nodeName].write(ack.toString());
            } catch (e) {
              debug(GONE_MSG, message.nodeName);
            }

            break;
          case TELL:
            var node_name = message.data[0],
              node_event = message.data[1],
              params = message.data[2];

            if (!self.sockets.hasOwnProperty(node_name)) {
              debug("Attempting to tell a non-existent node: %s", node_name);

              var err = new Error("Attempting to tell non-existent node!");
              err = err.toString();

              var ack_w_err = new Message(ACK, [message.id, [err]]);

              try {
                self.sockets[message.nodeName].write(ack_w_err.toString());
              } catch (e) {
                debug(GONE_MSG, message.nodeName);
              }
              break;
            }

            // Okay so the node exists, lets prepare a message

            var msg = new Message(EVENT, [message.nodeName, message.id, node_event, params]);

            try {
              self.sockets[node_name].write(msg.toString());
            } catch (e) {
              debug(GONE_MSG, node_name);

              var gone_msg = new Message(ACK, [message.id, [GONE]]);
              self.sockets[message.nodeName].write(gone_msg.toString());
            }
            break;
          case SHOUT:
            var msg = new Message(SHOUT, message.data);

            for (var nodeName in self.sockets) {
              try {
                self.sockets[nodeName].write(msg.toString());
              } catch (e) {
                debug(GONE_MSG, nodeName);
              }
            }
            break;
          case EVENTCB:
            var to = message.data[0],
              callback_id = message.data[1],
              params = message.data[2],
              msg;

            var msg = new Message(ACK, [callback_id, params]);

            try {
              self.sockets[to].write(msg.toString());
            } catch (e) {
              debug(GONE_MSG, to);
            }
            break;
          default:
            debug("Bridge received unrecognized command: %s", message.type);
        }
      }
    });
  }).listen(self.port, function() {
    debug("Bridge - listening on port %d", self.port);
  });

  return self;
}

Bridge.prototype.close = function(close_data) {
  var self = this;
  var msg = new Message(CLOSE, _.isArray(close_data) ? close_data : []);

  for (var nodeName in self.sockets) {
    try {
      self.sockets[nodeName].end(msg.toString());
    } catch (e) {
      debug(GONE_MSG, nodeName);
    }
  }

  self.tcpServer.close();
};

function Node() {
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

  // Lets connect to the Bridge
  self.bridge = net.connect(port, function() {
    var ident, message_id;

    // Identify the node to the bridge
    debug("Node  - sending IDENT");

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

  self.bridge.on("data", function(message) {
    debug("Node <-- Bridge: %s", message);

    message = JSON.parse(message);

    if (message.hasOwnProperty("type")) {
      switch (message.type) {
        case ACK:
          debug("Node  - Received ACK from Bridge for message: %s", message.data[0]);
          // Save the message ack id - we'll be plucking it from the array later.
          var mid = message.data[0];
          if (self.waiters.hasOwnProperty(mid)) {
            var callback = self.waiters[mid];

            if (_.isFunction(callback)) {
              var args = message.data[1];

              callback.apply(self, args);

              debug("Node  - removing callback %s from waiters", mid);
              delete self.waiters[mid];
            }
          }
          break;
        case EVENT:
          var from = message.data[0],
            callback_id = message.data[1],
            event_name = message.data[2],
            params = message.data[3];

          debug("Node  - Received EVENT(%s) from %s", event_name, from);

          // Define a callback function that can be called by a receiving function
          var cb = function() {
            var args, msg;
            // Grab all the args
            args = Array.prototype.slice.call(arguments);

            // construct the message
            msg = new Message(EVENTCB, [from, callback_id, args]);

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
          debug("Node  - Received SHOUT(%s)", message.data[0]);

          self.emit.apply(self, message.data);
          break;
        case CLOSE:
          debug("Node  - Received CLOSE");

          message.data.unshift(util.format("$%s", CLOSE));

          self.emit.apply(self, message.data);
          break;
      }
    }

  });

  self.bridge.on("error", function(e) {
    debug("Node  - %s", e);

    callback("Error: Node could not connect to Bridge!");
  });

  return self;
}
util.inherits(Node, events.EventEmitter);

Node.prototype.connect = function() {
  // body...
};

/**
 * Node.tell - Send an event to a remote node w/ data
 * @param {string} who_what "node_name:event_name" a string
 * @param (who_what) - {string}
 * @param {args} args - any amount of arguments that need to be sent to the event
 * @param {function} callback - a callback function if the node decideds to reply
 * @return self
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
  shout_msg.setNodeName(self.slaveName);

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

module.exports = {
  bridge: Bridge,
  node: Node
};