var uuid = require('node-uuid');
var path = require('path');
var sublevel = require('level-sublevel');
var db = require(path.join(__dirname, '..', 'db'));
var boardLevel = sublevel(db);
var smfSubLevel = boardLevel.sublevel('meta-smf');
var config = require(path.join(__dirname, '..', 'config'));
var sep = config.sep;
var modelPrefix = config.boards.prefix;
var validator = require(path.join(__dirname , 'validator'));

var Promise = require('bluebird');
db = Promise.promisifyAll(db);
smfSubLevel = Promise.promisifyAll(smfSubLevel);

/* IMPORT */
function importBoard (board) {
  // set created_at and imported_at datetime
  var ts = Date.now();
  if(!board.created_at) { board.created_at = ts; }
  else { board.created_at = Date.parse(board.created_at) || board.created_ad; }
  board.imported_at = ts;

  // genereate board id from created_at
  board.id = board.created_at + uuid.v1({ msecs: board.created_at });

  // generate board key 
  var key = modelPrefix + sep + board.id;

  // insert board into db
  return db.putAsync(key, board)
  .then(function(version) {
    board.version = version;

    if (board.smf) {
      // insert the board mapping of old id to new id
      var smfId = board.smf.board_id.toString();
      var key = modelPrefix + sep  + smfId;
      var value = { id: board.id };
      return smfSubLevel.putAsync(key, value)
      .then(function(val) {
        return board;
      });
    }
    else { return board; }
  });
}

/* CREATE */
function createBoard (board) {
  // set created_at datetime
  board.created_at = Date.now();
  var id = board.created_at + uuid.v1({ msecs: board.created_at });
  var key = modelPrefix + sep + id;
  board.id = id;

  // insert into db
  return db.putAsync(key, board)
  .then(function(version) {
    board.version = version;
    return board;
  });
}

/* RETRIEVE */
function findBoard(id) {
  var key = modelPrefix + sep + id;

  return db.getAsync(key)
  .then(function(values) {
    board = values[0];
    if (board.parent_id) { return board; }
    else {
      return allBoards()
      .then(function(boards){
        var result = null;
        boards.forEach(function(board) {
          if (board.id === id) {
            result = board;
          }
        });
        return result;
      });
    }
  });
}

/*  UPDATE */
function updateBoard(board) {
  // generate db key
  var key = modelPrefix + sep + board.id;
  // get old board from db
  return db.getAsync(key)
  .then(function(value) {
    // update board values
    var oldBoard = value[0];
    oldBoard.name = board.name;
    oldBoard.description = board.description;
    
    // insert back into db
    var opts = { version: value[1] };
    return db.putAsync(key, oldBoard, opts)
    .then(function(version) {
      oldBoard.version = version;
      return oldBoard;
    });
  });
}

/* DELETE */
function deleteBoard(boardId) {
  // generate db key
  var key = modelPrefix + sep + boardId;

  // see if board already exists
  var board = null;
  return db.getAsync(key)
  .then(function(value) {
    // board and version 
    board = value[0];
    var opts = { version: value[1] };
    return [key, opts];
  })
  .spread(function(key, opts) {
    return db.delAsync(key, opts);
  })
  .then(function(version) {
    board.version = version;
    // delete smf Id Mapping
    if (board.smf) {
      return deleteSMFKeyMapping(board.smf.board_id)
      .then(function() {
        return board;
      });
    }
    else { return board; }
  });
}

/*  QUERY: board using old id */
function boardByOldId(oldId) {
  var key = modelPrefix + sep + oldId;
  return smfSubLevel.getAsync(key)
  .then(function(value) {
    return value.id;
  });
}

/* QUERY: get all boards */
function allBoards() {
  return new Promise(function(fulfill, reject) {
    var boards = [];
    var childBoards = {};
    var sortBoards = function(board) {
      var parentId = board.value.parent_id;
      if (parentId) {
        if (!childBoards[parentId]) {
          childBoards[parentId] = [board.value];
        }
      }
      else {
        boards.push(board);
      }
    };
    var handler = function() {
      var boardValues = boards.map(function(board) {
        var boardChildren = childBoards[board.value.id];
        if (boardChildren) {
          board.value.child_boards = boardChildren;
        }
        return board.value;
      });
      fulfill(boardValues);
    };

    var searchKey = modelPrefix + sep;
    var query = {
      start: searchKey,
      end: searchKey + '\xff'
    };
    db.createReadStream(query)
    .on('data', sortBoards)
    .on('error', reject)
    .on('close', handler)
    .on('end', handler);
  });
}

function deleteSMFKeyMapping(oldId) {
  var oldKey = modelPrefix + sep + oldId;

  var board = null;
  return smfSubLevel.getAsync(oldKey)
  .then(function(value) {
    return smfSubLevel.delAsync(oldKey);
  })
  .then(function(value) {
    return oldKey;
  });
}

module.exports = {
  import: function(board) {
    return validator.importBoard(board, importBoard);
  },
  create: function(board) {
    return validator.createBoard(board, createBoard);
  },
  find: function(id) {
    return validator.id(id, findBoard);
  },
  update: function(board) {
    return validator.updateBoard(board, updateBoard);
  },
  delete: function(id) {
    return validator.id(id, deleteBoard);
  },
  boardByOldId: function(id) {
    return validator.id(id, boardByOldId);
  },
  all: allBoards
};

