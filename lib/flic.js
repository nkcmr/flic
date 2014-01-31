/**
 *  flic
 *  Written by: Nick Comer <nick@comer.io> (http://nick.comer.io)
 *  Licensed under MIT
 */

var Node = require("./flic-node.js");
var Bridge = require("./flic-bridge.js");

module.exports = {
  bridge: Bridge,
  node: Node
};