'use strict'

var util = require('util')
var Node = exports.Node = require('./node')
exports.createNode = function (a, b, c) {
  return new Node(a, b, c)
}
var Bridge = exports.Bridge = require('./bridge')
exports.createBridge = function (a, b) {
  return new Bridge(a, b)
}

Object.defineProperty(exports, 'node', {
  get: util.deprecate(function () {
    return Node
  }, "property 'flic.node' is deprecated. use flic.Node or flic.createNode instead")
})
Object.defineProperty(exports, 'bridge', {
  get: util.deprecate(function () {
    return Bridge
  }, "property 'flic.bridge' is deprecated. use flic.Bridge or flic.createBridge instead")
})
