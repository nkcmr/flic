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
    host: '127.0.0.1',
    port: DEFAULT_PORT
  })
  // store all of the sockets here
  this._sockets = {}
  this._server = net.createServer(_.bind(this._handle_connection, this))
  this._server.once('error', _.once(cb || noop))
  var isOhTen = semver.major(process.version) === 0 && semver.minor(process.version) === 10
  var args = []
  if (isOhTen) {
    args.push(this._config.port, this._config.host)
  } else {
    args.push(this._config)
  }
  this._server.once('listening', cb || noop)
  this._server.listen.apply(this._server, args)
}

Bridge.prototype._handle_connection = function (socket) {
  debug('new node (%s:%s)', socket.remoteAddress, socket.remotePort)
  socket.setEncoding('utf8')
  socket.setTimeout(0)
  socket.on('data', _.bind(this._handle_data, this, socket))
  socket.on('error', _.bind(this._cleanup_dead_socket, this, socket))
}

Bridge.prototype._handle_data = function (socket, rawData) {
  var self = this

  try {
    var events = rawData.split('\0')

    events.forEach(function (event) {
      if (!event) {
        return
      }

      debug('node --> bridge: %s', event)
      var message = JSON.parse(event)

      switch (_.get(message, 'method')) {
        case IDENT:
          self._handle_ident_message(socket, message)
          break
        case TELL:
          self._handle_tell_message(socket, message)
          break
        case SHOUT:
          self._handle_shout_message(socket, message)
          break
        case ACK:
          self._handle_ack_message(socket, message)
          break
        case LEAVE:
          self._handle_leave_message(socket, message)
          break
        default:
          debug('received unrecognized command: %s', _.get(message, 'method'))
      }
    })
  } catch (e) {
    debug('bridge received invalid data, ignoring...')
    return
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
  for (var nodeName in this._sockets) {
    if (nodeName === message.nodeName) {
      continue
    }
    this._send_to_node(nodeName, msg)
  }
}

Bridge.prototype._handle_ack_message = function (socket, message) {
  var to = message.data[0]
  var cbid = message.data[1]
  var params = message.data[2]
  this._send_to_node(to, new Message(ACK, [cbid, params]))
}

Bridge.prototype._handle_tell_message = function (socket, message) {
  var nodeName = message.data[0]
  var nodeEvent = message.data[1]
  var params = message.data[2]
  if (!_.has(this._sockets, nodeName)) {
    debug('attempting to tell a non-existent node: %s', nodeName)
    this._send_to_node(message.nodeName, new Message(ACK, [message.id, ['unknown-node']]))
  } else {
    this._send_to_node(nodeName, new Message(TELL, [message.nodeName, message.id, nodeEvent, params]))
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

function getSocketName (socket) {
  for (var _name in this._sockets) {
    if (socket === this._sockets[_name]) {
      return _name
    }
  }
  return null
}

Bridge.prototype._cleanup_dead_socket = function cleanupSocket (socket) {
  var name = getSocketName.call(this, socket)
  if (name) {
    delete this._sockets[name]
    debug("Node '%s' has left. cleaning up...", name)
  }
  socket.removeAllListeners()
}

Bridge.prototype.close = function (closeData) {
  var msg = new Message(CLOSE, _.isArray(closeData) ? closeData : [])
  for (var nodeName in this._sockets) {
    this._send_to_node(nodeName, msg)
  }
  this._server.close()
}

module.exports = Bridge
