var users = {};
module.exports = users;
var path = require('path');
var Promise = require('bluebird');
var uuid = require('node-uuid');
var bcrypt = require('bcrypt');
var speakeasy = require('speakeasy');
var db = require(path.join(__dirname, '..', 'db'));
var config = require(path.join(__dirname, '..', 'config'));

users.insert = function(post) {
  return new Promise(function(fulfill, reject) {
    if (!user.thread_id) {
      reject('The thread_id isn\'t present for given User.');
    }
    var timestamp = Date.now();
    user.created_at = timestamp;
    user.updated_at = timestamp;
    user.id = timestamp + uuid.v1({ msecs: timestamp });
    // prepare for storage or match
    user.passhash = bcrypt.hashSync(user.password, 12);

    delete user.password;
    delete user.confirm_password;

    db.content.putAsync(user.getKey(), post)
    .then(function() {
      fulfill(user);
    });
  });
};

users.remove = function(post) {
  return db.content.delAsync(user.getKey())
  .then(function() {
    db.deleted.putAsync(user.getKey, post);
  })
  .then(function() {
    return user;
  });
};

users.find = function(id) {
  return db.content.getAsync(config.users.prefix + config.sep + id)
  .then(function(user) {
    return user;
  });
};