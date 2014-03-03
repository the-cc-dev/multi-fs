var url = require('url')

var MultiFSClient = require('./lib/client-base.js')
var MultiFSClientFS = require('./lib/client-fs.js')
var MultiFSClientSSH = require('./lib/client-ssh.js')

module.exports = MultiFS

function MultiFS (clients) {
  this.clients = clients.map(setupClient)
}

function setupClient(client) {
  if (client instanceof MultiFSClient || client instanceof MultiFS)
    return client

  if (typeof client === 'string') {
    if (client.match(/^~~/))
      return new MultiFSClientManta(client)
    else if (client.match(/^ssh:/))
      return new MultiFSClientSSH(client)
    else
      return new MultiFSClientFS(client)
  }

  switch (client.type) {
    case 'ssh':
      return new MultiFSClientSSH(client)
    case 'fs':
      return new MultiFSClientFS(client.path)
    case 'manta':
      return new MultiFSClientManta(client)
    default:
      throw new Error('Undefined client type: ' + JSON.stringify(client))
  }
}

MultiFS.prototype.destroy = function() {
  this.clients.forEach(function (client) {
    client.destroy()
  })
}

MultiFS.prototype.readFile = function(path, enc, cb) {
  if (typeof enc === 'function') {
    cb = enc
    enc = null
  }
  this.exec("readFile", [ path, enc ], cb)
}

MultiFS.prototype.writeFile = function(path, data, enc, cb) {
  if (typeof enc === 'function') {
    cb = enc
    enc = null
  }
  this.exec("writeFile", [ path, data, enc ], cb)
}

MultiFS.prototype.md5 = function(path, cb) {
  this.exec("md5", [ path ], cb)
}

MultiFS.prototype.stat = function(path, cb) {
  this.exec("stat", [ path ], cb)
}

MultiFS.prototype.exec = function(cmd, args, cb) {
  this.clients.forEach(function (client, i) {
    client[cmd].apply(client, args.concat(then(i)))
  }, this)

  var quorum = this.clients.length
  var seen = 0
  var need = this.clients.length
  var results = []
  var errors = []
  var extra = []
  var matches = {}
  var conflict = null
  var firstError = null
  var ended = false
  function then(i) { return function(er, res, raw) {
    if (ended)
      return
    seen++
    firstError = firstError || er
    errors[i] = er
    results[i] = res
    extra[i] = raw
    if (!er && !conflict) {
      var k = JSON.stringify(res)
      matches[k] = (matches[k] || 0) + 1

      if (Object.keys(matches).length > 1) {
        conflict = new Error("Inconsistent Results")
      }
    }
    if (seen === need)
      return done()
  }}

  function done() {
    if (ended)
      return

    ended = true

    var data = {
      errors: errors,
      results: results,
      extra: extra
    }

    var er = firstError || conflict
    if (er)
      return cb(er, null, data)

    // all in agreement, no errors
    return cb(null, results[0], data)
  }
}