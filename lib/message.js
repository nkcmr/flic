'use strict'

var _ = require('lodash')
var uuid = require('uuid')

var DELIMITER = '\0'

function Message (method, data) {
  this.id = uuid.v4()
  this.method = method
  this.data = _.isArray(data) ? data : []

  return this
}

Message.prototype.getId = function () {
  return this.id
}

Message.prototype.setNodeName = function (nodeName) {
  this.nodeName = nodeName
}

Message.prototype.toString = function () {
  var out = {
    id: this.id,
    method: this.method,
    data: this.data
  }

  if (this.nodeName) {
    out.nodeName = this.nodeName
  }

  return JSON.stringify(out) + DELIMITER
}

Message.split = function (rawData) {
  var events = rawData.split(DELIMITER)

  events.pop()

  return events
}

module.exports = Message
