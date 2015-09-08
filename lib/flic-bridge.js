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

var GONE_MSG = 'Bridge - message send failure, node is gone (%s)'
var TELL = 'TELL'
var SHOUT = 'SHOUT'
var IDENT = 'IDENT'
var ACK = 'ACK'
var CLOSE = 'CLOSE'

var _ = require('lodash')
var net = require('net')
var debug = require('debug')('flic:bridge')
var Message = require('./flic-message.js')

function Bridge (port) {
  var self = this

  if (port) {
    if (_.isNumber(port)) {
      if (!(port > 1023 && port <= 65535)) {
        debug('port number invalid')
        throw new Error('invalid-port-number')
      }
    } else {
      throw new Error('invalid-port-number')
    }
  } else {
    self._port = 8221
  }

  // We store all of the sockets here
  self._sockets = {}

  self._tcpServer = net.createServer(function (socket) {
    debug('new node (%s:%s)', socket.remoteAddress, socket.remotePort)

    socket.setEncoding('utf8')
    socket.setTimeout(0)

    socket.on('data', function (a) {
      debug('Node --> Bridge: %s', a)

      // message should be stringified JSON, let's parse it
      try {
        var message = JSON.parse(a)
      } catch (e) {
        return
      }

      // make sure that the message has a type
      if (message.hasOwnProperty('method') && _.isString(message.method)) {
        debug('Received %s from %s', message.method, message.nodeName || 'unknown-sender')
        switch (message.method) {
          case IDENT:
            // Check if node name is already taken
            if (_.has(self._sockets, message.nodeName)) {
              debug('Duplicate node name: %s', message.nodeName)

              // Unfortunately, Error containers don't translate across TCP, so
              // we have to fall back to just putting error messages in strings.
              //
              // Documentation should strongly advise using the 'error-first'
              // style callbacks, as flic will send any non-fatal error messages
              // using this paradigm.

              var ack_w_err = new Message(ACK, [message.id, ['duplicate-node']])
              self._write_to_socket(socket, ack_w_err)
              break
            }

            // Save nodeName to the socket itself, this is important for when
            // the socket closes.
            socket.nodeName = message.nodeName

            // Save socket to list of sockets!
            self._sockets[message.nodeName] = socket

            self._sockets[message.nodeName].on('close', function (had_error) {
              debug("Node '%s' has disconnected. Deleting...", this.nodeName)
              delete self._sockets[this.nodeName]

              // for proper garbage collection don't need any memory leaks.
              socket.removeAllListeners()
              socket = null
            })

            // Create ACK message
            var ack = new Message(ACK, [message.id, [null]])

            // Send that shit
            debug('Sending ACK (id: %s)', message.id)

            self._send_to_node(message.nodeName, ack)
            break
          case TELL:
            var node_name = message.data[0]
            var node_event = message.data[1]
            var params = message.data[2]

            if (!_.has(self._sockets, node_name)) {
              debug('Attempting to tell a non-existent node: %s', node_name)

              ack_w_err = new Message(ACK, [message.id, ['unknown-node']])
              self._send_to_node(message.nodeName, ack_w_err)
              break
            }

            // Okay so the node exists, lets prepare a message

            var msg = new Message(TELL, [message.nodeName, message.id,
              node_event, params])
            self._send_to_node(node_name, msg)
            break
          case SHOUT:
            msg = new Message(SHOUT, message.data)

            _.forIn(self._sockets, function (socket, to) {
              self._send_to_node(to, msg)
            })
            break
          case ACK:
            var to = message.data[0]
            var callback_id = message.data[1]
            params = message.data[2]
            msg = new Message(ACK, [callback_id, params])

            self._send_to_node(to, msg)
            break
          default:
            debug('Received unrecognized command: %s', message.method)
        }
      }
    })
  }).listen(self._port, function () {
    debug('listening on port %d', self._port)
  })

  return self
}

Bridge.prototype._send_to_node = function (nodeName, what) {
  if (_.has(this._sockets, nodeName)) {
    this._write_to_socket(this._sockets[nodeName], what)
  }
}

Bridge.prototype._write_to_socket = function (socket, what) {
  try {
    socket.write(what.toString())
  } catch (e) {
    debug('tried to write to dead socket')
    this._handle_dead_socket(socket)
  }
}

Bridge.prototype._handle_dead_socket = function handle_dead_socket (socket) {
  for (var _name in this._sockets) {
    if (socket === this._sockets[_name]) {
      delete this._sockets[_name]
      debug(GONE_MSG, _name)
      break
    }
  }
}

Bridge.prototype.close = function (close_data) {
  var self = this
  var msg = new Message(CLOSE, _.isArray(close_data) ? close_data : [])

  for (var nodeName in self._sockets) {
    try {
      self._sockets[nodeName].end(msg.toString())
    } catch (e) {
      debug(GONE_MSG, nodeName)
    }
  }

  self._tcpServer.close()
}

module.exports = Bridge
