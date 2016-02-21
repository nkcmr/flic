'use strict'

var DEFAULT_PORT = 8221
var TELL = 'TELL'
var SHOUT = 'SHOUT'
var IDENT = 'IDENT'
var ACK = 'ACK'
var CLOSE = 'CLOSE'
var LEAVE = 'LEAVE'

var _ = require('lodash')
var semver = require('semver')
var net = require('net')
var debug = require('debug')('flic:bridge')
var Message = require('./message.js')
var noop = require('./noop')

function Bridge (config, cb) {
  if (_.isNumber(config)) {
    config = { port: config }
  }
  if (_.isFunction(config)) {
    cb = config
    config = {}
  }
  this._config = _.defaults(config, {
    port: DEFAULT_PORT
  })
  // store all of the sockets here
  this._sockets = {}
  this._server = net.createServer(_.bind(this._handle_connection, this))
  this._server.once('error', _.once(cb || noop))
  var is_oh_ten = semver.major(process.version) === 0 && semver.minor(process.version) === 10
  var args = []
  args.push(is_oh_ten ? this._config.port : this._config)
  args.push(cb || noop)
  this._server.listen.apply(this._server, args)
}

Bridge.prototype._handle_connection = function (socket) {
  debug('new node (%s:%s)', socket.remoteAddress, socket.remotePort)
  socket.setEncoding('utf8')
  socket.setTimeout(0)
  socket.on('data', _.bind(this._handle_data, this, socket))
}

Bridge.prototype._handle_data = function (socket, raw_data) {
  debug('node --> bridge: %s', raw_data)
  try {
    var message = JSON.parse(raw_data)
  } catch (e) {
    debug('bridge received invalid data, ignoring...')
    return
  }
  switch (_.get(message, 'method')) {
    case IDENT:
      this._handle_ident_message(socket, message)
      break
    case TELL:
      this._handle_tell_message(socket, message)
      break
    case SHOUT:
      this._handle_shout_message(socket, message)
      break
    case ACK:
      this._handle_ack_message(socket, message)
      break
    case LEAVE:
      this._handle_leave_message(socket, message)
      break
    default:
      debug('received unrecognized command: %s', _.get(message, 'method'))
  }
}

Bridge.prototype._handle_ident_message = function (socket, message) {
  if (_.has(this._sockets, message.nodeName)) {
    debug('duplicate node name: %s', message.nodeName)
    this._write_to_socket(socket, new Message(ACK, [message.id, ['duplicate-node']]))
  } else {
    socket.nodeName = message.nodeName
    this._sockets[message.nodeName] = socket
    socket.on('close', _.bind(this._cleanup_dead_socket, this, socket))
    debug('sending ACK (id: %s)', message.id)
    this._send_to_node(message.nodeName, new Message(ACK, [message.id, [null]]))
  }
}

Bridge.prototype._handle_shout_message = function (socket, message) {
  var msg = new Message(SHOUT, message.data)
  for (var node_name in this._sockets) {
    if (node_name === message.nodeName) {
      continue
    }
    this._send_to_node(node_name, msg)
  }
}

Bridge.prototype._handle_ack_message = function (socket, message) {
  var to = message.data[0]
  var callback_id = message.data[1]
  var params = message.data[2]
  this._send_to_node(to, new Message(ACK, [callback_id, params]))
}

Bridge.prototype._handle_tell_message = function (socket, message) {
  var node_name = message.data[0]
  var node_event = message.data[1]
  var params = message.data[2]
  if (!_.has(this._sockets, node_name)) {
    debug('attempting to tell a non-existent node: %s', node_name)
    this._send_to_node(message.nodeName, new Message(ACK, [message.id, ['unknown-node']]))
  } else {
    this._send_to_node(node_name, new Message(TELL, [message.nodeName, message.id, node_event, params]))
  }
}

Bridge.prototype._handle_leave_message = function (socket, message) {
  this._write_to_socket(socket, new Message(ACK, [message.id, []]))
  this._cleanup_dead_socket(socket)
}

Bridge.prototype._send_to_node = function (name, what) {
  if (_.has(this._sockets, name)) {
    this._write_to_socket(this._sockets[name], what)
  }
}

Bridge.prototype._write_to_socket = function (socket, what) {
  try {
    socket.write(what.toString())
  } catch (e) {
    debug('tried to write to dead socket')
    this._cleanup_dead_socket(socket)
  }
}

function get_socket_name (socket) {
  for (var _name in this._sockets) {
    if (socket === this._sockets[_name]) {
      return _name
    }
  }
  return null
}

Bridge.prototype._cleanup_dead_socket = function cleanup_socket (socket) {
  var name = get_socket_name.call(this, socket)
  if (name) {
    delete this._sockets[name]
    debug("Node '%s' has left. cleaning up...", name)
  }
  socket.removeAllListeners()
}

Bridge.prototype.close = function (close_data) {
  var msg = new Message(CLOSE, _.isArray(close_data) ? close_data : [])
  for (var node_name in this._sockets) {
    this._send_to_node(node_name, msg)
  }
  this._server.close()
}

module.exports = Bridge
