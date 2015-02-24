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

var flic = require('../lib/flic')
var Bridge = flic.bridge
/*eslint-disable no-undef */
var Node = flic.node
/*eslint-enable no-undef */

var util = require('util')

var test_bridge

exports['Bridge construct - nominal'] = function (test) {
  test.expect(2)
  test_bridge = new Bridge()
  test.ok(test_bridge instanceof Bridge)
  test.strictEqual(test_bridge._port, 8221)
  test.done()
}

/*eslint-disable no-unused-vars */

exports['Bridge construct - invalid port number (too low)'] = function (test) {
  test.expect(1)
  test.throws(function () {
    var a = new Bridge(1)
  })
  test.done()
}

exports['Bridge construct - invalid port number (too high)'] = function (test) {
  test.expect(1)
  test.throws(function () {
    var a = new Bridge(85668)
  })
  test.done()
}

exports['Node construct - nominal'] = function (test) {
  test.expect(1)
  var node = new Node('node', function (err) {
    test.equal(err, null, util.format('Callback returned an unexpected error.', err))
    test.done()
  })
}

exports['Node construct - name taken'] = function (test) {
  test.expect(1)
  var node = new Node('node', function (err) {
    test.equal(err, 'duplicate-node', 'Callback returned a different error than anticipated: \'%s\'', err)
    test.done()
  })
}

exports['Node construct - invalid name'] = function (test) {
  test.expect(1)
  test.throws(function () {
    var node = new Node('&*@dddd')
  })
  test.done()
}

exports['Node construct - no bridge present'] = function (test) {
  test.expect(1)
  var node = new Node('no_bridge', 9887, function (err) {
    test.equal(err, 'Error: Node could not connect to Bridge!', 'Callback returned a different error than anticipated: \'%s\'', err)
    test.done()
  })
}

/*eslint-enable no-unused-vars */

var node1, node2

exports['Node tell - nominal (receiving events)'] = function (test) {
  test.expect(1)
  node2 = new Node('node2', function () {})
  node1 = new Node('node1', function () {})
  node1.on('test_event', function (param1) {
    test.equal(param1, 'testParam', 'param1 is not right: %s', param1)
    test.done()
  })

  setTimeout(function () {
    node2.tell('node1:test_event', 'testParam')
  }, 25)
}

exports['Node tell - nominal (receiving events and sending callbacks)'] = function (test) {
  test.expect(3)
  node1.on('test_event2', function (param1, callback) {
    test.equal(param1, 'testParam', 'param1 is not right: %s', param1)
    callback(null, param1)
  })

  setTimeout(function () {
    node2.tell('node1:test_event2', 'testParam', function (err, param2) {
      test.ok(!err)
      test.equal(param2, 'testParam', 'param2 is not right: %s', param2)
      test.done()
    })
  }, 25)
}

exports['Node tell - invalid who and what parameter'] = function (test) {
  test.expect(1)
  test.throws(function () {
    node1.tell('iaminvalid', 'blabla', function () {})
  })
  test.done()
}

exports['Node tell - non-existent node'] = function (test) {
  test.expect(1)
  node2.tell('i_dont_exist:who_cares', function (err) {
    test.equal(err, 'unknown-node', 'Callback returned a different error than anticipated: \'%s\'', err)
    test.done()
  })
}

exports['Node shout - nominal'] = function (test) {
  test.expect(1)
  node1.on('shout1', function (param1) {
    test.equal(param1, 'ilovenodejs', 'Shout recipients received an unexpected value from the shouter: %s', param1)
    test.done()
  })
  node2.shout('shout1', 'ilovenodejs')
}

exports['Bridge close'] = function (test) {
  test.expect(1)
  node1.on('close', function (param1) {
    test.equal(param1, 'ilovenodejs', 'Bridge close event recipients received an unexpected value from the shouter: %s', param1)
    test.done()
  })
  test_bridge.close(['ilovenodejs'])
}

setTimeout(function () {
  process.exit(0)
}, 5000)
