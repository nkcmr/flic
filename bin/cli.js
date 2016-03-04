#!/usr/bin/env node
'use strict'

var program = require('commander')
var pkg = require('../package')
var flic = require('../')
var log = require('modlog')('cli')

program
  .version(pkg.version)
  .option('-b, --bridge [bindaddr]', 'run a bridge')
  .parse(process.argv)

if (program.bridge) {
  log.info('initializing bridge')
  var bindaddr = program.bridge
  if (bindaddr === true) {
    bindaddr = '127.0.0.1:8221'
  }
  var _tmp = bindaddr.split(':')
  var cfg = {
    host: _tmp[0],
    port: _tmp[1]
  }
  var b = flic.createBridge(cfg, function (err) {
    if (err) {
      log.error(err.message || err)
      process.exit(1)
      return
    }
    log.info('bridge is now listening on %s', bindaddr)
  })
  process.once('SIGINT', function () {
    log.info('received SIGINT signal, closing bridge...')
    b.close()
    process.exit(0)
  })
} else {
  program.help()
}
