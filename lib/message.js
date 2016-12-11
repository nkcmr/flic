'use strict'

var _ = require('lodash')
var uuid = require('uuid')

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

  return JSON.stringify(out) + '\0'
}

module.exports = Message
