var users = {};
module.exports = users;
var path = require('path');
var uuid = require('node-uuid');
var bcrypt = require('bcrypt');
var db = require(path.join(__dirname, '..', 'db'));
var config = require(path.join(__dirname, '..', 'config'));
var User = require(path.join(__dirname, 'model'));

users.import = function(user) {
  user.imported_at = Date.now();
  return users.insert(user)
  .then(function(dbUser) {
    if (dbUser.smf) {
      return db.legacy.putAsync(dbUser.legacyKey(), dbUser.id)
      .then(function() {
        return dbUser;
      });
    }
  });
};

users.insert = function(user) {
  var timestamp = Date.now();
  user.created_at = timestamp;
  user.updated_at = timestamp;
  user.id = timestamp + uuid.v1({ msecs: timestamp });
  // prepare for storage or match
  if (user.password) {
    user.passhash = bcrypt.hashSync(user.password, 12);
  }

  delete user.password;
  delete user.confirmation;

  return db.content.putAsync(user.key(), user)
  .then(function() {
    return user;
  });
};

users.remove = function(user) {
  return db.content.delAsync(user.key())
  .then(function() {
    db.deleted.putAsync(user.key, user);
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

users.findByLegacyId = function(legacyId) {
  var legacyUserKey = User.legacyKeyFromId(legacyId);
  return db.legacy.getAsync(legacyUserKey)
  .then(users.find);
};

