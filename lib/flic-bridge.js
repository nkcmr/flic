const GONE_MSG = "Bridge - message send failure, node is gone (%s)";
const GONE = "GONE";
const TELL = "TELL";
const SHOUT = "SHOUT";
const IDENT = "IDENT";
const ACK = "ACK";
const CLOSE = "CLOSE";

var _ = require("lodash")
	, net = require("net")
	, util = require("util")
	, debug = require("debug")("flic:bridge")
	, Message = require("./flic-message.js");

function Bridge(port) {
  var self = this;

  if (port) {
    if (_.isNumber(port)) {
      if (!(port > 1023 && port <= 65535)) {
        debug("port number invalid");
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
    debug("new node");

    socket.setEncoding("utf8");
    socket.setTimeout(0);

    socket.on("data", function(message) {
      debug("Node --> Bridge: %s", message);

      // message is a stringified JSON, let's parse it
      message = JSON.parse(message);

      // make sure that the message has a type
      if (message.hasOwnProperty("method") && _.isString(message.method)) {
        debug("Received %s from %s", message.method, message.nodeName || "unknown");
        switch (message.method) {
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
            debug("Sending ACK (id: %s)", message.id);

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

            var msg = new Message(TELL, [message.nodeName, message.id, node_event, params]);

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
          case ACK:
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
            debug("Received unrecognized command: %s", message.method);
        }
      }
    });
  }).listen(self.port, function() {
    debug("listening on port %d", self.port);
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

module.exports = Bridge;