var test = require('tap').test
var path = require('path')
var rimraf = require('rimraf')
test('cleanup', function(t) {
  rimraf.sync(path.resolve(__dirname, 'fixtures'))
  t.pass('ok')
  t.end()
})