var rimraf = require('rimraf');
var Promise = require('bluebird');
var path = require('path');
var dbName = 'test-epoch.db';
var core = require(path.join(__dirname, '..'))(dbName);
var threads = core.threads;
var posts = core.posts;
var boards = core.boards;

describe('metadata', function() {

    describe('#boards', function() {
      var plainPost = {
        title: 'post title',
        body: 'post body'
      };
      var boardId;
      before(function() {
        var newBoard = { name: 'Board', description: 'Board Desc' };
        return boards.create(newBoard)
        .then(function(board) {
          boardId = board.id;
          var threadData = { board_id: board.id };
          // BREAKS IF CHANGED TO Promise.map DUE TO SYNCHRONICITY ISSUE WITH METADATA INCREMENTS
          return [ threadData, threadData, threadData ];
        })
        .then(function(threadArray) {
          return Promise.each(threadArray, function(threadToCreate) {
            return threads.create(threadToCreate)
            .then(function(thread) {
              var tempPost = plainPost;
              tempPost.thread_id = thread.id;
              return [tempPost, tempPost, tempPost];
            })
            .then(function(postArray) {
              return Promise.each(postArray, function(post) {
                return posts.create(post);
              });
            });
          });
        });
      });

      describe('#post_count', function() {
        it('should have correct post count', function() {
          return boards.find(boardId)
          .then(function(board) {
            board.post_count.should.equal(9);
          });
        });
      });

      describe('#thread_count', function() {
        it('should have correct thread count', function() {
          return boards.find(boardId)
          .then(function(board) {
            board.thread_count.should.equal(3);
          });
        });
      });
    });

    describe('#posts', function() {
      var plainPost = {
        title: 'post title',
        body: 'post body'
      };
      var threadId, firstPostId;
      var first = true;
      var firstPostTitle = 'First Post Title!';
      before(function() {
        var newBoard = { name: 'Board', description: 'Board Desc' };
        return boards.create(newBoard)
        .then(function(board) {
          var threadData = { board_id: board.id };
          // BREAKS IF CHANGED TO Promise.map DUE TO SYNCHRONICITY ISSUE WITH METADATA INCREMENTS
          return threadData;
        })
        .then(function(threadToCreate) {
          return threads.create(threadToCreate)
          .then(function(thread) {
            threadId = thread.id;
            plainPost.thread_id = thread.id;
            var firstPost = {
              thread_id: thread.id,
              title: firstPostTitle,
              body: 'this is the first post'
            };
            return [firstPost, plainPost, plainPost, plainPost, plainPost];
          })
          .then(function(postArray) {
            return Promise.each(postArray, function(post) {
              return posts.create(post)
              .then(function(post) {
                if (first) {
                  firstPostId = post.id;
                  firstPostTitle = post.title;
                  first = false;
                }
              });
            });
          });
        });
      });

      describe('#post_count', function() {
        it('should have correct post count', function() {
          return threads.find(threadId)
          .then(function(thread) {
            thread.post_count.should.equal(5);
          });
        });
      });

      describe('#first_post_id', function() {
        it('should store the id of the first post', function() {
          return threads.find(threadId)
          .then(function(thread) {
            thread.first_post_id.should.equal(firstPostId);
          });
        });
      });

      describe('#title', function() {
        it('should store the title of the first post', function() {
          return threads.find(threadId)
          .then(function(thread) {
            thread.first_post_id.should.equal(firstPostId);
          });
        });
      });
    });

  after(function(done) {
    rimraf(path.join(__dirname, '..', dbName), done);
  });
});

