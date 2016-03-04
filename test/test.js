/* global describe, it, before, after, afterEach */
'use strict'

var _ = require('lodash')
var flic = require('../lib/flic')
var Node = flic.Node
var Bridge = flic.Bridge

var assert = require('assert')

var async = require('async')

describe('Bridge', function () {
  describe('construction', function () {
    var test_bridge

    it('can still be accessed through flic.bridge', function () {
      assert(Bridge === flic.bridge)
    })

    it('should construct normally', function (done) {
      test_bridge = flic.createBridge(function () {
        assert(test_bridge instanceof Bridge)
        assert.equal(test_bridge._config.port, 8221)
        test_bridge._server.close(done)
      })
      test_bridge._server.unref()
    })

    it('should allow setting of the listening port', function (done) {
      test_bridge = flic.createBridge({
        port: 9003
      }, function (err) {
        assert.ifError(err)
        assert.equal(test_bridge._config.port, 9003)
        test_bridge._server.close(done)
      })
      test_bridge._server.unref()
    })

    it('should pass any errors to a listener callback', function (done) {
      test_bridge = flic.createBridge(function () {
        var dupe_bridge = flic.createBridge(function (err) {
          assert(err)
          test_bridge._server.close(done)
        })
        dupe_bridge._server.unref()
      })
      test_bridge._server.unref()
    })
  })

  describe('close', function () {
    var b, good_nodes

    good_nodes = []

    before(function (done) {
      done = _.after(2, done)
      b = flic.createBridge()
      b._server.unref()
      good_nodes.push(flic.createNode({
        id: 'node_1',
        connect_callback: function (err) {
          assert.ifError(err)
          done()
        }
      }))
      good_nodes.push(flic.createNode({
        id: 'node_2',
        connect_callback: function (err) {
          assert.ifError(err)
          done()
        }
      }))
    })

    after(function () {
      b._server && b._server._handle && b._server.close()
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
    })
  })
})

describe('Node', function () {
  describe('construction', function () {
    var b, b2

    before(function () {
      b2 = flic.createBridge({
        port: 9823
      })
      b = flic.createBridge()
      b._server.unref()
      b2._server.unref()
    })

    after(function () {
      b._server && b._server._handle && b._server.close()
      b2._server && b2._server._handle && b2._server.close()
    })

    it('can still be accessed through flic.node', function () {
      assert(Node === flic.node)
    })

    it('should be backwards compatible with v1.x', function (done) {
      done = _.after(2, done)
      var node = new Node('node_22', function (err) {
        assert.ifError(err)
        done()
      })
      assert(node instanceof Node)

      var node2 = flic.createNode('node_34', function (err) {
        assert.ifError(err)
        done()
      })
      assert(node2 instanceof Node)
    })

    it('should construct normally and callback when connected to the bridge', function (done) {
      flic.createNode({
        id: 'node_1',
        connect_callback: function (err) {
          assert.ifError(err)
          done()
        }
      })
    })

    it('should fail because the name is taken', function (done) {
      flic.createNode({
        id: 'node_1',
        connect_callback: function (err) {
          assert(err)
          done()
        }
      })
    })

    it('should fail because there is no bridge listening on specified port', function (done) {
      this.timeout(3000)

      flic.createNode({
        id: 'muh_dumb_node',
        port: 9999,
        connect_callback: function (err) {
          assert(err)
          done()
        }
      })
    })

    it('should be able to connect normally to a server on a different port', function (done) {
      flic.createNode({
        id: 'node_3',
        port: 9823,
        connect_callback: function (err) {
          assert.ifError(err)
          done()
        }
      })
    })
  })

  describe('tell', function () {
    var b, good_nodes

    good_nodes = []

    before(function (done) {
      done = _.after(2, done)
      b = new Bridge()
      b._server.unref()
      good_nodes.push(flic.createNode({
        id: 'node_1',
        connect_callback: function (err) {
          assert.ifError(err)
          done()
        }
      }))
      good_nodes.push(flic.createNode({
        id: 'node_2',
        connect_callback: function (err) {
          assert.ifError(err)
          done()
        }
      }))
    })

    after(function () {
      b._server && b._server._handle && b._server.close()
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
      b = flic.createBridge()
      async.parallel([
        function (cb) {
          good_nodes.push(flic.createNode({id: 'node_1', connect_callback: cb}))
        },
        function (cb) {
          good_nodes.push(flic.createNode({id: 'node_2', connect_callback: cb}))
        },
        function (cb) {
          good_nodes.push(flic.createNode({id: 'node_3', connect_callback: cb}))
        }
      ], function (err) {
        assert.ifError(err)
        done()
      })
    })

    after(function () {
      b._server && b._server._handle && b._server.close()
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

  describe('leave', function () {
    var b

    before(function () {
      b = flic.createBridge()
      b._server.unref()
    })

    after(function () {
      b._server && b._server._handle && b._server.close()
    })

    it('should tell the bridge that it is leaving', function (done) {
      var x = flic.createNode({
        id: 'leaving_node',
        connect_callback: function (err) {
          assert.ifError(err)
          x.leave()
          setTimeout(function () {
            assert.ok(!b._sockets.hasOwnProperty('leaving_node'), b._sockets)
            done()
          }, 20)
        }
      })
    })
  })
})
