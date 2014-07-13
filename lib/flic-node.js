// flic
// written by: nick comer (http://nick.comer.io)

// Copyright (c) 2014 Nick Comer

// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:

// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.

// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

'use strict';

var GONE = 'GONE';
var TELL = 'TELL';
var SHOUT = 'SHOUT';
var IDENT = 'IDENT';
var ACK = 'ACK';
var CLOSE = 'CLOSE';

var _ = require('lodash'),
  util = require('util'),
  debug = require('debug')('flic:node'),
  Message = require('./flic-message.js'),
  events = require('events'),
  net = require('net');


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
    self._name = random_string(25);
  } else {
    if (!(/^(\w|-)+$/).test(name))
      throw new Error('Node must have a valid name');
    else
      self._name = name;
  }

  // Make sure we have a valid port number
  if (!port || port <= 1023 || port > 65535) port = 8221;

  // Make sure there is a function to call, even if its empty
  if (!callback) callback = function() {};

  // Set up an array to store waiting callbacks
  self._waiters = {};

  var tries = 0;
  var hasConnected = false;

  function connect() {
    // Lets connect to the Bridge
    self._bridge = net.connect(port, function() {
      // Set hasConnected to true, so if the socket errors out we won't attempt
      // to reconnect.
      hasConnected = true;

      var ident, message_id;

      // Identify the node to the bridge
      debug('sending IDENT');

      // Create a new Message
      ident = new Message(IDENT);

      // Attach the node name
      ident.setNodeName(self._name);

      // Get the ID of the message so we can store the callback as a waiter
      message_id = ident.getId();

      // store the callback in the waiters list
      self._waiters[message_id] = callback;

      // tell the bridge
      self._bridge.write(ident.toString());
    });
    self._bridge.setTimeout(0);
    self._bridge.on('data', function(a) {
      debug('Node <-- Bridge: %s', a);

      try {
        var message = JSON.parse(a);
      } catch (e) {
        return;
      }

      if (message.hasOwnProperty('method')) {
        switch (message.method) {
          case ACK:
            debug('Received ACK from Bridge for message: %s', message.data[0]);
            // Save the message ack id - we'll be plucking it from the array later.
            var mid = message.data[0];
            if (self._waiters.hasOwnProperty(mid)) {
              var callback = self._waiters[mid];

              if (_.isFunction(callback)) {
                var args = message.data[1];

                callback.apply(self, args);

                debug('removing callback %s from waiters', mid);
                delete self._waiters[mid];
              }
            }
            break;
          case TELL:
            var from = message.data[0],
              callback_id = message.data[1],
              event_name = message.data[2],
              params = message.data[3];

            debug('Received TELL(%s) from %s', event_name, from);

            // Define a callback function that can be called by a receiving function
            var cb = function() {
              var args, msg;
              // Grab all the args
              args = Array.prototype.slice.call(arguments);

              // construct the message
              msg = new Message(ACK, [from, callback_id, args]);

              // set a node name just for kicks i guess
              msg.setNodeName(self._name);

              // send that mo-fucka
              self._bridge.write(msg.toString());
            };

            // push the callback to the end of the params array
            params.push(cb);

            // push the event name to the beginning
            params.unshift(event_name);

            // emit that sunuva-bitch
            self.emit.apply(self, params);
            break;
          case SHOUT:
            debug('Received SHOUT(%s)', message.data[0]);

            self.emit.apply(self, message.data);
            break;
          case CLOSE:
            debug('Received CLOSE');

            message.data.unshift(CLOSE.toLowerCase());

            self.emit.apply(self, message.data);
            break;
        }
      }
    });

    self._bridge.on('error', function(e) {
      debug('%s', e);

      if (!hasConnected) {
        tries++;
        if (tries < 5) {
          debug('Attempting to reconnect... (Try number: %d)', tries);
          setTimeout(function() {
            connect();
          }, tries * 250);
        } else {
          callback('Error: Node could not connect to Bridge!');
        }
      } else {
        self.emit('error', e);
      }
    });
  }

  connect();

  return self;
}
util.inherits(Node, events.EventEmitter);

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
  var self, args, who_what, callback, tell_message, mid, parts, nodeName, eventName, destination;

  self = this;

  // parse the arguments special array into a standard array
  args = Array.prototype.slice.call(arguments);

  // grab the who-what off the front
  who_what = args.shift();

  // is there a function on the end here?
  if (_.isFunction(args[args.length - 1])) {
    // cool, pop it off so we can store it in the waiters
    callback = args.pop();
  }

  parts = who_what.split(':');

  if (parts.length !== 2 || !(/^(\w|-)+$/).test(parts[0]))
    throw new Error('Invalid tell statement, should be (node_name:event_name)');

  nodeName = parts[0];
  eventName = parts[1];

  destination = [nodeName, eventName, args];

  tell_message = new Message(TELL, destination);
  tell_message.setNodeName(self._name);

  if (callback) {
    mid = tell_message.getId();
    self._waiters[mid] = callback;
  }

  try {
    self._bridge.write(tell_message.toString());
  } catch (e) {
    self.emit('error', e);
  }

  return self;
}

Node.prototype.shout = function() {
  var self, args, event_name;
  self = this;
  args = Array.prototype.slice.call(arguments);

  var shout_msg = new Message(SHOUT, args);
  shout_msg.setNodeName(self._name);

  try {
    self._bridge.write(shout_msg.toString());
  } catch (e) {
    self.emit('error', e);
  }

  return self;
};

function random_string(len) {
  len = len || 10;
  var out = [];
  var possible = 'abcdefghijklmnopqrstuvwxyz-0123456789';

  for (var i = 0; i < len; i++)
    out.push(possible.charAt(Math.round(Math.random() * possible.length)));

  return out.join('');
}

module.exports = Node;