var threadsDb = {};
module.exports = threadsDb;

var path = require('path');
var Promise = require('bluebird');
var dbHelper = require(path.join(__dirname, '..', 'db', 'helper'));
var encodeIntHex = dbHelper.encodeIntHex;
var config = require(path.join(__dirname, '..', 'config'));
var db = require(path.join(__dirname, '..', 'db'));
var tree = db.tree;
var Thread = require(path.join(__dirname, 'keys'));
var helper = require(path.join(__dirname, '..', 'helper'));
var boardsDb = require(path.join(__dirname, '..', 'boards', 'db'));
var Padlock = require('padlock').Padlock;
var postCountLock = new Padlock();
var viewCountLock = new Padlock();
var threadOrderLock = new Padlock();
var vault = require(path.join(__dirname, '..', 'vault'));

threadsDb.import = function(thread) {
  thread.imported_at = Date.now();
  return threadsDb.create(thread)
  .then(function(dbThread) {
    if (dbThread.smf) {
      return db.legacy.putAsync(Thread.legacyKey(thread.smf.ID_TOPIC), dbThread.id)
      .then(function() { return dbThread; });
    }
  });
};

// thread must have a board_id
threadsDb.create = function(thread) {
  return new Promise(function(fulfill, reject) {
    var timestamp = Date.now();
    // If created at doesnt exist
    if (!thread.created_at) {
      thread.created_at = timestamp;
    }
    var newThread = {
      object: thread,
      parentKey: ['board', thread.board_id],
      type: 'thread',
      callback: function(err, storedThread) {
        if (err) {
          reject(err);
        }
        else {
          storedThread.value.id = storedThread.key[1];
          fulfill(storedThread.value);
        }
      }
    };
    tree.store(newThread);
  });
};

threadsDb.delete = function(id) {
  var threadKey = Thread.key(id);
  var deletedThread = null;

  // see if thread already exists
  return db.content.getAsync(threadKey)
  .then(function(threadData) {
    deletedThread = threadData;

    // add deleted: true flag to board
    deletedThread.deleted = true;
    deletedThread.updated_at = Date.now();

    // insert back into db
    return db.content.putAsync(threadKey, deletedThread);
  })
  .then(function() { return deletedThread; });
};

threadsDb.undelete = function(id) {
  var threadKey = Thread.key(id);
  var deletedThread = null;

  // see if thread already exists
  return db.content.getAsync(threadKey)
  .then(function(threadData) {
    deletedThread = threadData;

    // add deleted: true flag to board
    delete deletedThread.deleted;
    deletedThread.updated_at = Date.now();

    // insert back into db
    return db.content.putAsync(threadKey, deletedThread);
  })
  .then(function() { return deletedThread; });
};

threadsDb.purge = function(id) {
  var deletedThread;
  var threadKey = Thread.key(id);
  var postCountKey = Thread.postCountKey(id);
  var lastPostUsernameKey = Thread.lastPostUsernameKey(id);
  var lastPostCreatedAtKey = Thread.lastPostCreatedAtKey(id);
  var viewCountKey = Thread.viewCountKey(id);
  var firstPostIdKey = Thread.firstPostIdKey(id);
  var postTitleKey = Thread.titleKey(id);
  var usernameKey = Thread.usernameKey(id);
  return db.content.getAsync(threadKey) // get thread
  .then(function(thread) {
    deletedThread = thread;
  })
  .then(function() { // save view count to deletedThread
    return db.metadata.getAsync(viewCountKey)
    .then(function(viewCount) {
      deletedThread.view_count = viewCount;
    })
    .then(function() {
      return db.metadata.delAsync(viewCountKey);
    });
  })
  .then(function() { // move to deleted DB
    return db.deleted.putAsync(threadKey, deletedThread);
  })
  .then(function() { // remove from content
    return db.content.delAsync(threadKey);
  })
  .then(function() { // remove board - thread index
    return db.metadata.getAsync(lastPostCreatedAtKey)
    .then(function(timestamp) {
      var boardThreadKey = Thread.boardThreadKey(deletedThread.id, deletedThread.board_id, timestamp);
      return db.indexes.delAsync(boardThreadKey);
    });
  })
  .then(function() { // remove post count Key
    return db.metadata.delAsync(postCountKey);
  })
  .then(function() { // remove last post username Key
    return db.metadata.delAsync(lastPostUsernameKey);
  })
  .then(function() { // remove last post created at Key
    return db.metadata.delAsync(lastPostCreatedAtKey);
  })
  .then(function() { // remove first Post Id Key
    return db.metadata.delAsync(firstPostIdKey);
  })
  .then(function() { // remove post title Key
    return db.metadata.delAsync(postTitleKey);
  })
  .then(function() { // remove username Key
    return db.metadata.delAsync(usernameKey);
  })
  .then(function() {
    return syncThreadOrder(deletedThread);
  })
  .then(function() { // decrement board thread count
    var boardId = deletedThread.board_id;
    return boardsDb.decThreadCount(boardId);
  })
  .then(function() {
    if (deletedThread.smf) {
      var legacyKey = Thread.legacyKey(deletedThread.smf.ID_TOPIC);
      return db.legacy.delAsync(legacyKey);
    }
    else { return; }
  })
  .then(function() { return deletedThread; });
};

threadsDb.find = function(id) {
  return new Promise(function(fulfill, reject) {
    tree.get(['thread', id], function(err, storedThread) {
      if (err) { reject(err); }
      else { fulfill(storedThread); }
    });
  })
  .then(helper.decMetadata);
};

threadsDb.threadByOldId = function(oldId) {
  var legacyThreadKey = Thread.legacyKey(oldId);

  return db.legacy.getAsync(legacyThreadKey)
  .then(threadsDb.find);
};

threadsDb.byBoard = function(boardId, opts) {
  return new Promise(function(fulfill, reject) {
    var entries = [];
    var sorter = function(value) { entries.push(value.value); };
    var handler = function() { return fulfill(entries); };

    // query vars
    var limit = opts.limit ? Number(opts.limit) : 10;
    var page = opts.page ? Math.abs(Number(opts.page)) : 1;

    // query keys
    var threadOrderPrefix = config.threads.indexPrefix;
    var sep = config.sep;
    var startKey = threadOrderPrefix + sep + boardId + sep + 'order' + sep;
    var endKey = startKey;
    endKey += '\xff';

    // query counting
    var threadStart = limit * page - (limit - 1);
    threadStart = encodeIntHex(threadStart);
    startKey += threadStart;

    var queryOptions = {
      limit: limit,
      gte: startKey,
      lte: endKey
    };

    // query thread Index
    db.indexes.createReadStream(queryOptions)
    .on('data', sorter)
    .on('error', reject)
    .on('close', handler)
    .on('end', handler);
  })
  .then(function(allThreads) {
    return Promise.map(allThreads, function(entry) {
      return threadsDb.find(entry);
    });
  });
};
