var boards = {};
module.exports = boards;

var uuid = require('node-uuid');
var path = require('path');
var Promise = require('bluebird');
var db = require(path.join(__dirname, '..', 'db'));
var config = require(path.join(__dirname, '..', 'config'));
var sep = config.sep;
var modelPrefix = config.boards.prefix;
var validator = require(path.join(__dirname , 'validator'));

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
  return db.content.putAsync(key, board)
  .then(function(version) {
    board.version = version;

    if (board.smf) {
      // insert the board mapping of old id to new id
      var smfId = board.smf.board_id.toString();
      var key = modelPrefix + sep  + smfId;
      return db.indexes.putAsync(key, board.id)
      .then(function() {
        return board;
      });
    }
    else { return board; }
  });
}

/* CREATE */
function createBoard(board) {
  // set created_at datetime
  board.created_at = Date.now();
  var id = board.created_at + uuid.v1({ msecs: board.created_at });
  var key = modelPrefix + sep + id;
  board.id = id;

  // insert into db
  return db.content.putAsync(key, board)
  .then(function() {
    return board;
  });
}

/* RETRIEVE */
function findBoard(id) {
  var key = modelPrefix + sep + id;
  var board = null;
  return db.content.getAsync(key)
  .then(function(board) {
    if (board.deleted) {
      throw new Error('Key has been deleted: ' + key);
    }
    else if (board.parent_id) { return board; }
    else {
      return allBoards()
      .then(function(allBoards){
        var result = null;
        allBoards.forEach(function(board) {
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
  return db.content.getAsync(key)
  .then(function(oldBoard) {
    // update board values
    if (oldBoard.deleted) {
      throw new Error('Key has been deleted: ' + key);
    }
    oldBoard.name = board.name;
    oldBoard.description = board.description;
    
    // insert back into db
    return db.content.putAsync(key, oldBoard)
    .then(function() {
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
  return db.content.getAsync(key)
  .then(function(board) {
    if (board.deleted) {
      throw new Error('Key has been deleted: ' + key);
    }
    board.deleted = true;
    return [key, board];
  })
  .spread(function(key, boardObj) {
    return db.putAsync(key, boardObj);
  })
  .then(function() {
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
  return db.indexes.getAsync(key)
  .then(function(boardId) {
    // doesn't work correctly at the moment
    // deleted board ids should be indexed.
    return boardId;
  });
}

/* QUERY: get all boards */
function allBoards() {
  return new Promise(function(fulfill, reject) {
    var allBoards = [];
    var childBoards = {};
    var sortBoards = function(board) {
      var parentId = board.parent_id;
      if (parentId) {
        if (!childBoards[parentId]) {
          childBoards[parentId] = board;
        }
        else {
          childBoards[parentId].push(board);
        }
      }
      else {
        allBoards.push(board);
      }
    };
    var handler = function() {
      var boardValues = allBoards.map(function(board) {
        var boardChildren = childBoards[board.id];
        if (boardChildren) {
          board.child_boards = boardChildren;
        }
        return board;
      });
      fulfill(boardValues);
    };

    var searchKey = modelPrefix + sep;
    var query = {
      start: searchKey,
      end: searchKey + '\xff',
      versionLimit: 1
    };
    db.content.createReadStream(query)
    .on('data', sortBoards)
    .on('error', reject)
    .on('close', handler)
    .on('end', handler);
  });
}

// smf keys need to be stored in a separate legacy support db
//
// function deleteSMFKeyMapping(oldId) {
//   var oldKey = modelPrefix + sep + oldId;
//
//   var board = null;
//   return db.indexes.getAsync(oldKey)
//   .then(function(boardId) {
//     return smfSubLevel.putAsync(oldKey, value);
//   })
//   .then(function() {
//     return oldKey;
//   });
// }

boards.import = function(board) {
  return validator.importBoard(board, importBoard);
};

boards.create = function(board) {
  return validator.createBoard(board, createBoard);
};

boards.find = function(id) {
  return validator.id(id, findBoard);
};

boards.update = function(board) {
  return validator.updateBoard(board, updateBoard);
};

boards.delete = function(id) {
  return validator.id(id, deleteBoard);
};

boards.boardByOldId = function(id) {
  return validator.id(id, boardByOldId);
};

boards.all = allBoards;

