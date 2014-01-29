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

// slave1 --[SLAVE_TELL(slave_name, slave_event, params...)]-> master --[SLAVE_EVENT(from, callback_id, event_name, params)]-> slave2
//  ||                                                          ||    <-[EVENT_CALLBACK(to, callback_id, params)]-------------   ||
//  ||   <-[MSG_ACK(callback_id, params...)]-----------------   ||                  

const GONE_MSG = "Master - message send failure, slave is gone (%s)";
const SLAVE_GONE = "slv-gone";
// This means that in attempt to reach a slave, the master could not because the
// slave is gone.
// to be sent as a string indicating an error to a callback

const SLAVE_TELL = "slv-tell";
// Send a message to the master to tell a slave about an event.
// [0] slave name
// [1] slave event
// [2] array of params

const SLAVE_SHOUT = "slv-shout";
// Broadcast an event to all slaves, even anonymous ones.
// [0] event name
// [1] params to be sent (array);

const SLAVE_EVENT = "slv-evnt";
// Master sends a message to a slave about an event sent from another slave
// [0] sent from which slave
// [1] callback id
// [2] event name
// [3] array of params

const EVENT_CALLBACK = "evnt-cb";
// Slave sends a callback from an event back to the master, master then sends
// MSG_ACK
// [0] to
// [1] callback_id
// [2] params

const SLAVE_IDENT = "slv-ident";
// NOTE: slaveName can be attached to the message instead of having to be placed
// in the data array.

const MSG_ACK = "msg-ack";
// [0] the id of the message that is being acknowledged
// [1] array of args
// 
// NOTE: MSG_ACK should never EVER be sent to Master, this might results in a
// callback loop.

const MASTER_CLOSE = "master-close";
// [0] array of data to be sent to all slaves (optional)

function Master(port) {
  var self = this;

  if (port) {
    if (_.isNumber(port)) {
      if (!(port > 1023 && port <= 65535)) {
        debug("Master - port number invalid");
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
    debug("Master - new slave");

    socket.setEncoding("utf8");

    socket.on("data", function(message) {
      debug("Slave --> Master: %s", message);

      // message is a stringified JSON, let's parse it
      message = JSON.parse(message);

      // make sure that the message has a type
      if (message.hasOwnProperty("type") && _.isString(message.type)) {
        debug("Master - Received %s from %s", message.type, message.slaveName || "unknown");
        switch (message.type) {
          case SLAVE_IDENT:
            // Check if slave name is already taken
            if ( !! self.sockets[message.slaveName]) {
              debug("Duplicate slave name: %s", message.slaveName);

              // Unfortunately Error containers don't translate across TCP, so 
              // we have to fall back to just putting error messages in strings.
              // 
              // Documentation should strongly advise using the "error-first"
              // style callbacks, as flic will send any non-fatal error messages
              // using this paradigm.
              var err = new Error("Duplicate slave name!");
              err = err.toString();

              var ack_w_err = new Message(MSG_ACK, [message.id, [err]]);

              try {
                socket.write(ack_w_err.toString());
              } catch (e) {
                debug(GONE_MSG, "");
              }

              break;
            }

            // Save slaveName to the socket itself, this is important for when
            // the socket closes.
            socket.slaveName = message.slaveName;

            // Save socket to list of sockets!
            self.sockets[message.slaveName] = socket;

            self.sockets[message.slaveName].on("close", function(had_error) {
              debug("Slave '%s' has disconnected. Deleting...", this.slaveName);
              delete self.sockets[this.slaveName];
            });

            // Create MSG_ACK message
            var ack = new Message(MSG_ACK, [message.id, [null]]);

            // Send that bitch
            debug("Master - Sending MSG_ACK (id: %s)", message.id);

            try {
              self.sockets[message.slaveName].write(ack.toString());
            } catch (e) {
              debug(GONE_MSG, message.slaveName);
            }

            break;
          case SLAVE_TELL:
            var slave_name = message.data[0],
              slave_event = message.data[1],
              params = message.data[2];

            if (!self.sockets[slave_name]) {
              debug("Attempting to tell a non-existent slave: %s", slave_name);

              var err = new Error("Attempting to tell non-existent slave");
              err = err.toString();

              var ack_w_err = new Message(MSG_ACK, [message.id, [err]]);

              try {
                self.sockets[message.slaveName].write(ack_w_err.toString());
              } catch (e) {
                debug(GONE_MSG, message.slaveName);
              }
              break;
            }

            // Okay so the slave exists, lets prepare a message

            var msg = new Message(SLAVE_EVENT, [message.slaveName, message.id, slave_event, params]);

            try {
              self.sockets[slave_name].write(msg.toString());
            } catch (e) {
              debug(GONE_MSG, slave_name);

              var gone_msg = new Message(MSG_ACK, [message.id, [SLAVE_GONE]]);
              self.sockets[message.slaveName].write(gone_msg.toString());
            }
            break;
          case SLAVE_SHOUT:
            var msg = new Message(SLAVE_SHOUT, message.data);

            for (var slaveName in self.sockets) {
              try {
                self.sockets[slaveName].write(msg.toString());
              } catch (e) {
                debug(GONE_MSG, slaveName);
              }
            }
            break;
          case EVENT_CALLBACK:
            var to = message.data[0],
              callback_id = message.data[1],
              params = message.data[2],
              msg;

            var msg = new Message(MSG_ACK, [callback_id, params]);

            try {
              self.sockets[to].write(msg.toString());
            } catch (e) {
              debug(GONE_MSG, to);
            }
            break;
          default:
            debug("Master received unrecognized command");
        }
      }
    });
  }).listen(self.port, function() {
    debug("Master - listening on port %d", self.port);
  });

  return self;
}

Master.prototype.close = function(close_data) {
  var self = this;
  var msg = new Message(MASTER_CLOSE, _.isArray(close_data) ? close_data : []);

  for (var slaveName in self.sockets) {
    try {
      self.sockets[slaveName].end(msg.toString());
    } catch (e) {
      debug(GONE_MSG, slaveName);
    }
  }

  self.tcpServer.close();
};

function Slave() {
  var name, port, callback, self, args;
  /*
  TODO:
  - if disconnected from Master attempt to reconnect
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

  // Set slave name
  if (!name) {
    // No name? Anonymous slave.
    // Anonymous slaves:
    // - Can receive shouts
    // - Can't be told remotely (Slave.tell)
    // - Can tell other slaves and receive callbacks from tell
    self.slaveName = randString();
  } else {
    if (!name.match(/^[a-zA-Z|_|$][a-zA-Z0-9|_|$]*$/))
      throw new Error("Slave must have a valid name");
    else
      self.slaveName = name;
  }

  // Make sure we have a valid port number
  if (!port || port <= 1023 || port > 65535) port = 8221;

  // Make sure there is a function to call, even if its empty
  if (!callback) callback = function() {};

  // Set up an array to store waiting callbacks
  self.waiters = {};

  // Lets connect to the Master
  self.master = net.connect(port, function() {
    var ident, message_id;

    // Identify the slave to the master
    debug("Slave  - sending SLAVE_IDENT");

    // Create a new Message
    ident = new Message(SLAVE_IDENT);

    // Attach the slave name
    ident.setSlaveName(self.slaveName);

    // Get the ID of the message so we can store the callback as a waiter
    message_id = ident.getId();

    // store the callback in the waiters list
    self.waiters[message_id] = callback;

    // tell the master
    self.master.write(ident.toString());
  });

  self.master.on("data", function(message) {
    debug("Slave <-- Master: %s", message);

    message = JSON.parse(message);

    if (message.hasOwnProperty("type")) {
      switch (message.type) {
        case MSG_ACK:
          debug("Slave  - Received MSG_ACK from Master for message: %s", message.data[0]);
          // Save the message ack id - we'll be plucking it from the array later.
          var mid = message.data[0];
          if (self.waiters.hasOwnProperty(mid)) {
            var callback = self.waiters[mid];

            if (_.isFunction(callback)) {
              var args = message.data[1];

              callback.apply(self, args);

              debug("Slave  - removing callback %s from waiters", mid);
              delete self.waiters[mid];
            }
          }
          break;
        case SLAVE_EVENT:
          var from = message.data[0],
            callback_id = message.data[1],
            event_name = message.data[2],
            params = message.data[3];

          debug("Slave  - Received SLAVE_EVENT(%s) from %s", event_name, from);

          // Define a callback function that can be called by a receiving function
          var cb = function() {
            var args, msg;
            // Grab all the args
            args = Array.prototype.slice.call(arguments);

            // construct the message
            msg = new Message(EVENT_CALLBACK, [from, callback_id, args]);

            // set a slave name just for kicks i guess
            msg.setSlaveName(self.slaveName);

            // send that mo-fucka
            self.master.write(msg.toString());
          };

          // push the callback to the end of the params array
          params.push(cb);

          // push the event name to the beginning
          params.unshift(event_name);

          // emit that sunuva-bitch
          self.emit.apply(self, params);
          break;
        case SLAVE_SHOUT:
          debug("Slave  - Received SLAVE_SHOUT(%s)", message.data[0]);

          self.emit.apply(self, message.data);
          break;
      }
    }

  });

  self.master.on("error", function(e) {
    debug("Slave  - %s", e);

    callback("Error: Slave could not connect to Master!");
  });

  return self;
}
util.inherits(Slave, events.EventEmitter);

Slave.prototype.connect = function() {
  // body...
};

/**
 * Slave.tell - Send an event to a remote slave w/ data
 * @param {string} who_what "slave_name:event_name" a string
 * @param (who_what) - {string}
 * @param {args} args - any amount of arguments that need to be sent to the event
 * @param {function} callback - a callback function if the slave decideds to reply
 * @return {null}
 */
Slave.prototype.tell = function() {
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
  var slaveName = who_what.substring(0, i);
  var eventName = who_what.substring(i + 1);

  var destination = [slaveName, eventName, args];

  tell_message = new Message(SLAVE_TELL, destination);
  tell_message.setSlaveName(self.slaveName);

  if ( !! callback) {
    mid = tell_message.getId();
    self.waiters[mid] = callback;
  }

  self.master.write(tell_message.toString());

  return self;
}

Slave.prototype.shout = function() {
  var self, args, event_name;
  self = this;
  args = Array.prototype.slice.call(arguments);

  var shout_msg = new Message(SLAVE_SHOUT, args);
  shout_msg.setSlaveName(self.slaveName);

  self.master.write(shout_msg.toString());

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
  master: Master,
  slave: Slave
};