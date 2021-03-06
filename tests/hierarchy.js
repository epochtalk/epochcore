var path = require('path');
var rimraf = require('rimraf');
var should = require('chai').should();
var dbName = '.testDB';
var core = require(path.join(__dirname, '..'))(dbName);
var probe = require(path.join(__dirname, '..', 'probe'));

var newBoard = {
  name: 'new board',
  description: 'new board desc'
};

describe('hierarchy', function() {
  describe('#check', function() {
    var user = {
      username: 'test_user',
      email: 'test_user@example.com',
      password: 'epochtalk',
      confirmation: 'epochtalk'
    };
    
    before(function() {
      return core.users.create(user)
      .then(function(dbUser) { user = dbUser; });
    });

    it('should check board/thread/post relationship', function() {
      var createdThread;
      var createdBoard;
      var createdPost;

      return core.boards.create(newBoard)
      .then(function(board) {
        createdBoard = board;
        return { board_id: createdBoard.id };
      })
      .then(core.threads.create)
      .then(function(thread) {
        createdThread = thread;
        createdThread.board_id.should.equal(createdBoard.id);
        return {
          body: 'Test post',
          title: 'Post title',
          user_id: user.id,
          thread_id: createdThread.id
        };
      })
      .then(core.posts.create)
      .then(function(post) {
        createdPost = post;
        createdPost.thread_id.should.equal(createdThread.id);
        createdPost.user_id.should.equal(user.id);
      });
    });
  });
  
  describe('#CLEANING', function() {
    it('cleaning all db', function() {
      return probe.clean();
    });
  });

  after(function(done) {
    rimraf(path.join(__dirname, '..', dbName), done);
  });
});

