/* global describe, it, before, after, afterEach */
'use strict'

var flic = require('../lib/flic')
var Bridge = flic.bridge
var Node = flic.node

var assert = require('assert')

var async = require('async')

describe('Bridge', function () {
  describe('construction', function () {
    var test_bridge

    after(function () {
      test_bridge.close()
    })

    it('should construct normally', function () {
      test_bridge = new Bridge()
      test_bridge._tcpServer.unref()
      assert(test_bridge instanceof Bridge)
      assert.equal(test_bridge._port, 8221)
    })
  })

  describe('close', function () {
    var b, good_nodes

    good_nodes = []

    before(function (done) {
      b = new Bridge()
      good_nodes.push(new Node('node_1', function (err) {
        assert.ifError(err)
        good_nodes.push(new Node('node_2', function (err) {
          assert.ifError(err)
          done()
        }))
      }))
    })

    it('should send a close message to all connected nodes', function (done) {
      async.parallel([
        function (cb) {
          good_nodes[0].on('close', function (parting_data) {
            assert.equal(parting_data, 'live long and prosper')
            cb()
          })
        },
        function (cb) {
          good_nodes[1].on('close', function (parting_data) {
            assert.equal(parting_data, 'live long and prosper')
            cb()
          })
        }
      ], done)

      b.close(['live long and prosper'])
      b = undefined
    })
  })
})

describe('Node', function () {
  describe('construction', function () {
    var b

    before(function () {
      b = new Bridge()
    })

    after(function () {
      b.close()
      b = undefined
    })

    /* eslint-disable no-new */
    it('should construct normally and callback when connected to the bridge', function (done) {
      new Node('node_1', function (err) {
        assert.ifError(err)
        done()
      })
    })

    it('should fail because the name is taken', function (done) {
      new Node('node_1', function (err) {
        assert(err)
        done()
      })
    })

    it('should fail because there is no bridge listening on specified port', function (done) {
      this.timeout(3000)

      new Node('muh_dumb_node', 9999, function (err) {
        assert(err)
        done()
      })
    })
    /* eslint-enable no-new */
  })

  describe('tell', function () {
    var b, good_nodes

    good_nodes = []

    before(function (done) {
      b = new Bridge()
      good_nodes.push(new Node('node_1', function (err) {
        assert.ifError(err)
        good_nodes.push(new Node('node_2', function (err) {
          assert.ifError(err)
          done()
        }))
      }))
    })

    after(function () {
      b.close()
      b = undefined
    })

    afterEach(function () {
      good_nodes.forEach(function (n) {
        n.removeAllListeners()
      })
    })

    it('should be able to contact another node', function (done) {
      good_nodes[0].on('test_event', function (param1) {
        assert.equal(param1, 'test_param')
        done()
      })
      good_nodes[1].tell('node_1:test_event', 'test_param')
    })

    it('should be able to contact another node and send callbacks', function (done) {
      good_nodes[0].on('test_event', function (param1, ack) {
        assert.equal(param1, 'test_param')
        ack('my-reply')
      })
      good_nodes[1].tell('node_1:test_event', 'test_param', function (a) {
        assert.equal(a, 'my-reply')
        done()
      })
    })

    it("should fail if the who and what format is not valid ('node_name:remote_event')", function () {
      assert.throws(function () {
        good_nodes[1].tell('node_1-what-the-hell')
      })
      assert.throws(function () {
        good_nodes[1].tell('node_1:too:many:colons')
      })
    })

    it('should fail if the node being told does not exist', function (done) {
      good_nodes[0].tell('me-no-exist:remote_event', function (err) {
        assert.equal(err, 'unknown-node')
        done()
      })
    })
  })

  describe('shout', function () {
    var b, good_nodes

    good_nodes = []

    before(function (done) {
      b = new Bridge()
      async.parallel([
        function (cb) {
          good_nodes.push(new Node('node_1', cb))
        },
        function (cb) {
          good_nodes.push(new Node('node_2', cb))
        },
        function (cb) {
          good_nodes.push(new Node('node_3', cb))
        }
      ], function (err) {
        assert.ifError(err)
        done()
      })
    })

    after(function () {
      b.close()
      b = undefined
    })

    afterEach(function () {
      good_nodes.forEach(function (n) {
        n.removeAllListeners()
      })
    })

    it('should send events to all connected nodes', function (done) {
      async.parallel([
        function (done) {
          good_nodes[0].on('shout_eve', function (param1) {
            assert.equal(param1, 'test-param')
            done()
          })
        },
        function (done) {
          good_nodes[1].on('shout_eve', function (param1) {
            assert.equal(param1, 'test-param')
            done()
          })
        }
      ], done)

      good_nodes[2].shout('shout_eve', 'test-param')
    })
  })
})
