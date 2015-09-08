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

  return JSON.stringify(out)
}

module.exports = Message
