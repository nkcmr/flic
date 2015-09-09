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

'use strict'

var DEFAULT_PORT = 8221
var TELL = 'TELL'
var SHOUT = 'SHOUT'
var IDENT = 'IDENT'
var ACK = 'ACK'
var CLOSE = 'CLOSE'
var LEAVE = 'LEAVE'

var _ = require('lodash')
var uuid = require('uuid')
var util = require('util')
var debug = require('debug')('flic:node')
var Message = require('./flic-message.js')
var events = require('events')
var net = require('net')

function noop () {}

function Node () {
  var args = [].slice.call(arguments)
  var port, name, callback

  for (var i = 0; i < args.length; i++) {
    if (_.isString(args[i])) {
      name = args[i]
      continue
    }

    if (_.isNumber(args[i])) {
      port = args[i]
      continue
    }

    if (_.isFunction(args[i])) {
      callback = _.once(args[i])
    }
  }

  var self = this

  Object.defineProperty(this, 'is_anonymous', {
    enumerable: false,
    value: !name
  })

  // Set node name
  if (!name) {
    // No name? Anonymous node.
    // Anonymous nodes:
    // - Can receive shouts
    // - Can't be told remotely (Node.tell)
    // - Can tell other nodes and receive callbacks from tell
    self._name = uuid.v4()
  } else {
    self._name = name
  }

  // Make sure we have a valid port number
  if (!_.isNumber(port)) {
    port = DEFAULT_PORT
  }

  // Make sure there is a function to call, even if its empty
  if (!_.isFunction(callback)) {
    callback = noop
  }

  // Set up an array to store waiting callbacks
  self._waiters = {}

  var tries = 0
  var hasConnected = false

  function connect () {
    // Lets connect to the Bridge
    self._bridge = net.connect(port, function () {
      // Set hasConnected to true, so if the socket errors out we won't attempt
      // to reconnect.
      hasConnected = true

      var ident, message_id

      // Identify the node to the bridge
      debug('sending IDENT')

      // Create a new Message
      ident = new Message(IDENT)

      // Attach the node name
      ident.setNodeName(self._name)

      // Get the ID of the message so we can store the callback as a waiter
      message_id = ident.getId()

      // store the callback in the waiters list
      self._waiters[message_id] = callback

      // tell the bridge
      self._write_bridge(ident)
    })
    self._bridge.setTimeout(0)
    self._bridge.on('data', function (a) {
      debug('Node <-- Bridge: %s', a)

      try {
        var message = JSON.parse(a)
      } catch (e) {
        return
      }

      if (message.hasOwnProperty('method')) {
        switch (message.method) {
          case ACK:
            debug('Received ACK from Bridge for message: %s', message.data[0])
            // Save the message ack id - we'll be plucking it from the array later.
            var mid = message.data[0]
            if (self._waiters.hasOwnProperty(mid)) {
              var callback = self._waiters[mid]

              if (_.isFunction(callback)) {
                var args = message.data[1]

                callback.apply(self, args)

                debug('removing callback %s from waiters', mid)
                delete self._waiters[mid]
              }
            }
            break
          case TELL:
            var from = message.data[0]
            var callback_id = message.data[1]
            var event_name = message.data[2]
            var params = message.data[3]

            debug('Received TELL(%s) from %s', event_name, from)

            // Define a callback function that can be called by a receiving function
            var cb = function () {
              // Grab all the args
              var args = [].slice.call(arguments)

              // construct the message
              var msg = new Message(ACK, [from, callback_id, args])

              // send that mo-fucka
              self._write_bridge(msg)
            }

            // push the callback to the end of the params array
            params.push(cb)

            // push the event name to the beginning
            params.unshift(event_name)

            // emit that sunuva-bitch
            self.emit.apply(self, params)
            break
          case SHOUT:
            debug('Received SHOUT(%s)', message.data[0])

            self.emit.apply(self, message.data)
            break
          case CLOSE:
            debug('Received CLOSE')

            message.data.unshift(CLOSE.toLowerCase())

            self.emit.apply(self, message.data)
            break
        }
      }
    })

    self._bridge.on('error', function (e) {
      debug('%s', e)

      if (!hasConnected) {
        tries++
        if (tries < 5) {
          debug('Attempting to reconnect... (Try number: %d)', tries)
          setTimeout(function () {
            connect()
          }, tries * 250)
        } else {
          callback('Error: Node could not connect to Bridge!')
        }
      } else {
        self.emit('error', e)
      }
    })
  }

  connect()
}
util.inherits(Node, events.EventEmitter)

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
Node.prototype.tell = function () {
  var self = this
  var args = [].slice.call(arguments)
  // parse the arguments special array into a standard array

  // grab the who-what off the front
  var who_what = args.shift()

  // is there a function on the end here?
  if (_.isFunction(args[args.length - 1])) {
    // cool, pop it off so we can store it in the waiters
    var callback = args.pop()
  }

  var parts = who_what.split(':')

  if (parts.length !== 2 || !(/^(\w|-)+$/).test(parts[0])) {
    throw new Error('Invalid tell statement, should be (node_name:event_name)')
  }

  var nodeName = parts[0]
  var eventName = parts[1]

  var destination = [nodeName, eventName, args]

  var t_msg = new Message(TELL, destination)

  if (callback) {
    self._waiters[t_msg.getId()] = callback
  }

  self._write_bridge(t_msg)
  return self
}

Node.prototype.shout = function () {
  this._write_bridge(new Message(SHOUT, [].slice.call(arguments)))
  return this
}

Node.prototype._write_bridge = function (msg) {
  msg.setNodeName(this._name)
  try {
    this._bridge.write(msg.toString())
  } catch (e) {
    this.emit('error', e)
  }
}

Node.prototype.leave = function (force) {
  if (force === true) {
    debug('node force leaving')
    return this._force_leave()
  }
  debug('node safely leaving')
  var self = this
  var lv_msg = new Message(LEAVE)
  this._waiters[lv_msg.getId()] = function () {
    this._force_leave()
  }
  this._write_bridge(lv_msg)
  return self
}

Node.prototype._force_leave = function () {
  this._bridge.end()
  return this
}

module.exports = Node
