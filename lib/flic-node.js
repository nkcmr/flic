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
  events.EventEmitter.apply(this, arguments)
  var args = [].slice.call(arguments)

  this._config = {
    id: uuid.v4(),
    port: DEFAULT_PORT,
    connect_callback: noop
  }

  for (var i = 0; i < args.length; i++) {
    if (_.isString(args[i])) {
      this._config.id = args[i]
      continue
    }

    if (_.isNumber(args[i])) {
      this._config.port = args[i]
      continue
    }

    if (_.isFunction(args[i])) {
      this._config.connect_callback = _.once(args[i])
    }
  }

  // Set up an array to store waiting callbacks
  this._waiters = {}

  this._connect_attempts = 0
  this._has_connected = false
  this._connect_bridge()
}
Node.prototype = _.create(events.EventEmitter.prototype, {
  constructor: Node
})

Node.prototype._connect_bridge = function() {
  var self = this

  _.get(self, '_bridge.removeAllListeners', noop).call(_.get(self, '_bridge'))
  self._bridge = null

  // Lets connect to the Bridge
  self._bridge = net.connect(self._config)
  self._bridge.setTimeout(_.get(self, '_config.timeout', 0))
  self._bridge.on('data', self._handle_data.bind(this))
  self._bridge.on('connect', self._handle_connect.bind(this))
  self._bridge.on('error', self._handle_socket_error.bind(this))
}

Node.prototype._handle_connect = function() {
  // Set hasConnected to true, so if the socket errors out we won't attempt
  // to reconnect.
  this._has_connected = true

  var ident, message_id

  // Identify the node to the bridge
  debug('sending IDENT')

  // Create a new Message
  ident = new Message(IDENT)

  // Get the ID of the message so we can store the callback as a waiter
  message_id = ident.getId()

  // store the callback in the waiters list
  this._waiters[message_id] = _.get(this, '_config.connect_callback', noop)

  // tell the bridge
  this._write_bridge(ident)
}

Node.prototype._handle_socket_error = function(e) {
  var self = this
  debug('%s', e)

  if (!this._has_connected) {
    this._connect_attempts++
    if (this._connect_attempts < 5) {
      debug('Attempting to reconnect... (Try number: %d)', this._connect_attempts)
      setTimeout(function () {
        self._connect_bridge()
      }, this._connect_attempts * 250)
    } else {
      this._config.connect_callback('Error: Node could not connect to Bridge!')
    }
  } else {
    this.emit('error', e)
  }
};

Node.prototype._handle_data = function (_raw_data) {
  debug('Node <-- Bridge: %s', _raw_data)

  try {
    var message = JSON.parse(_raw_data)
  } catch (e) {
    debug('node received invalid data, ignoring...')
    return
  }

  switch (_.get(message, 'method')) {
    case ACK:
      this._handle_ack_message(message)
      break
    case TELL:
      this._handle_tell_message(message)
      break
    case SHOUT:
      this._handle_shout_message(message)
      break
    case CLOSE:
      this._handle_close_message(message)
      break
  }
}

Node.prototype._handle_ack_message = function(message) {
  debug('Received ACK from Bridge for message: %s', message.data[0])
  // Save the message ack id - we'll be plucking it from the array later.
  var mid = message.data[0]
  _.get(this._waiters, mid, noop).apply(this, _.get(message, 'data[1]', []))
  delete this._waiters[mid]
}

Node.prototype._handle_tell_message = function(message) {
  var self = this
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
  this.emit.apply(this, params)
}

Node.prototype._handle_shout_message = function(message) {
  debug('Received SHOUT(%s)', message.data[0])
  this.emit.apply(this, message.data)
}

Node.prototype._handle_close_message = function(message) {
  debug('Received CLOSE')
  message.data.unshift(CLOSE.toLowerCase())
  this.emit.apply(this, message.data)
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
  msg.setNodeName(this._config.id)
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
