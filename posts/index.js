var posts = {};
module.exports = posts;

var path = require('path');
var postsDb = require(path.join(__dirname, 'db'));
var postsValidator = require('epoch-validator').core.posts;

posts.import = function(json) {
  return postsValidator.import(json)
  .then(postsDb.import);
};

posts.create = function(json) {
  return postsValidator.create(json)
  .then(postsDb.create);
};

posts.find = function(id) {
  return postsValidator.id(id)
  .then(postsDb.find);
};

posts.update = function(json) {
  return postsValidator.update(json)
  .then(postsDb.update);
};

posts.delete = function(id) {
  return postsValidator.id(id)
  .then(postsDb.delete);
};

posts.undelete = function(id) {
  return postsValidator.id(id)
  .then(postsDb.undelete);
};

posts.purge = function(id) {
  return postsValidator.id(id)
  .then(postsDb.purge);
};

posts.postByOldId = function(oldId) {
  return postsValidator.numId(oldId)
  .then(postsDb.postByOldId);
};

posts.byThread = function(threadId, opts) {
  return postsDb.byThread(threadId, opts);
};

posts.versions = function(id) {
  return postsValidator.id(id)
  .then(postsDb.versions);
};
