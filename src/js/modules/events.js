'use strict';

var $       = window.jQuery || require('domtastic')
,   nav     = require('./nav')
,   diff    = require('./diff')
,   content = require('./content');

var events = function() {

  $(document).on('click', '#nice-nav', function() {
    $(this).toggleClass('is-min');
  });

  $('#nice-off').on('click', function(e) {
    e.preventDefault();
    content.removeNice();
  });

  $('#nice-diff').on('click', function(e) {
    e.preventDefault();
    diff.init();
  });

  $('#nice-toggle').on('click', function(e) {
    e.preventDefault();
    content.toggleHTML();
    // window.console.log(content.originalHTML);
  });

};

module.exports = events;
