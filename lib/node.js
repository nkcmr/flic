'use strict'

var DEFAULT_PORT = 8221
var CONNECT_BACKOFF_MULT = 50
var TELL = 'TELL'
var SHOUT = 'SHOUT'
var IDENT = 'IDENT'
var ACK = 'ACK'
var CLOSE = 'CLOSE'
var LEAVE = 'LEAVE'

var _ = require('lodash')
var uuid = require('uuid')
var debug = require('debug')('flic:node')
var Message = require('./message')
var noop = require('./noop')
var events = require('events')
var net = require('net')

function Node (config) {
  if (!_.isPlainObject(config)) {
    config = {}
    var args = [].slice.call(arguments)
    _.each(args, function (arg) {
      if (_.isString(arg)) {
        config.id = arg
        return
      }
      if (_.isNumber(arg)) {
        config.port = arg
        return
      }
      if (_.isFunction(arg)) {
        config.connect_callback = arg
      }
    })
  }
  events.EventEmitter.apply(this, arguments)
  this._config = _.defaults(config, {
    id: uuid.v4(),
    port: DEFAULT_PORT,
    connect_callback: noop,
    max_connect_attempts: 5,
    timeout: 0
  })

  // Set up an array to store waiting callbacks
  this._waiters = {}
  this._has_connected = false
  this._connect_attempts = 0
  this._connect_bridge()
}
Node.prototype = _.create(events.EventEmitter.prototype, {
  constructor: Node
})

Node.prototype._connect_bridge = function () {
  if (this._bridge) {
    this._bridge.removeAllListeners()
  }
  this._bridge = null

  // Lets connect to the Bridge
  this._bridge = net.connect(this._config)
  this._bridge.setTimeout(this._config.timeout)
  this._bridge.on('data', this._handle_data.bind(this))
  this._bridge.on('connect', this._handle_connect.bind(this))
  this._bridge.on('error', this._handle_socket_error.bind(this))
}

Node.prototype._handle_connect = function () {
  // Set hasConnected to true, so if the socket errors out we won't attempt
  // to reconnect.
  this._has_connected = true

  var ident, messageId

  // Identify the node to the bridge
  debug('sending IDENT')

  // Create a new Message
  ident = new Message(IDENT)

  // Get the ID of the message so we can store the callback as a waiter
  messageId = ident.getId()

  // store the callback in the waiters list
  this._waiters[messageId] = _.get(this, '_config.connect_callback', noop)

  // tell the bridge
  this._write_bridge(ident)
}

Node.prototype._handle_socket_error = function (e) {
  var self = this
  debug('%s', e)

  if (!this._has_connected) {
    this._connect_attempts++
    if (this._connect_attempts < this._config.max_connect_attempts) {
      debug('attempting to reconnect... (try number: %d)', this._connect_attempts)
      setTimeout(function () {
        self._connect_bridge()
      }, this._connect_attempts * CONNECT_BACKOFF_MULT)
    } else {
      this._config.connect_callback('error: node could not connect to bridge!')
    }
  } else {
    this.emit('error', e)
  }
}

Node.prototype._handle_data = function (rawData) {
  var self = this

  try {
    var events = rawData.toString().split('\0')

    events.forEach(function (event) {
      if (!event) {
        return
      }

      debug('node <-- bridge: %s', event)
      var message = JSON.parse(event)

      switch (_.get(message, 'method')) {
        case ACK:
          self._handle_ack_message(message)
          break
        case TELL:
          self._handle_tell_message(message)
          break
        case SHOUT:
          self._handle_shout_message(message)
          break
        case CLOSE:
          self._handle_close_message(message)
          break
      }
    })
  } catch (e) {
    debug('node received invalid data, ignoring...')
    return
  }
}

Node.prototype._handle_ack_message = function (message) {
  debug('received ACK from Bridge for message: %s', message.data[0])
  // Save the message ack id - we'll be plucking it from the array later.
  var mid = message.data[0]
  _.get(this._waiters, mid, noop).apply(this, _.get(message, 'data[1]', []))
  delete this._waiters[mid]
}

Node.prototype._handle_tell_message = function (message) {
  var self = this
  var from = message.data[0]
  var cbid = message.data[1]
  var eventName = message.data[2]
  var params = message.data[3]

  debug('received TELL(%s) from %s', eventName, from)

  // Define a callback function that can be called by a receiving function
  var cb = function () {
    // grab all the args
    var args = [].slice.call(arguments)

    // construct the message
    var msg = new Message(ACK, [from, cbid, args])

    // send the message
    self._write_bridge(msg)
  }

  // push the callback to the end of the params array
  params.push(cb)

  // push the event name to the beginning
  params.unshift(eventName)

  // emit that!
  this.emit.apply(this, params)
}

Node.prototype._handle_shout_message = function (message) {
  debug('received SHOUT(%s)', message.data[0])
  this.emit.apply(this, message.data)
}

Node.prototype._handle_close_message = function (message) {
  debug('received CLOSE')
  message.data.unshift(CLOSE.toLowerCase())
  this.emit.apply(this, message.data)
}

/**
 * Node#tell()
 * @param {string} whoWhat - the node name and event in the following format:
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
  var whoWhat = args.shift()

  // is there a function on the end here?
  if (_.isFunction(_.last(args))) {
    // cool, pop it off so we can store it in the waiters
    var callback = args.pop()
  }

  var parts = whoWhat.split(':')

  if (parts.length !== 2) {
    throw new Error('Invalid tell statement, should be (node_name:event_name)')
  }

  var nodeName = parts[0]
  var eventName = parts[1]

  var destination = [nodeName, eventName, args]

  var tMsg = new Message(TELL, destination)

  if (callback) {
    self._waiters[tMsg.getId()] = callback
  }

  self._write_bridge(tMsg)
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
  if (force) {
    debug('node force leaving')
    return this._force_leave()
  }
  debug('node safely leaving')
  var self = this
  var lvMsg = new Message(LEAVE)
  this._waiters[lvMsg.getId()] = function () {
    this._force_leave()
  }
  this._write_bridge(lvMsg)
  return self
}

Node.prototype._force_leave = function () {
  this._bridge.end()
  return this
}

module.exports = Node
