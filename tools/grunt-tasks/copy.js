 /*
 * grunt-contrib-copy
 * http://gruntjs.com/
 *
 * Copyright (c) 2016 Chris Talkington, contributors
 * Licensed under the MIT license.
 * https://github.com/gruntjs/grunt-contrib-copy/blob/master/LICENSE-MIT
 */

'use strict';

module.exports = function(grunt) {
  var path = require('path');
  var fs = require('fs');
  var chalk = require('chalk');
  var isWindows = process.platform === 'win32';

  grunt.registerMultiTask('copy', 'Copy files.', function() {

    var options = this.options({
      encoding: grunt.file.defaultEncoding,
      // processContent/processContentExclude deprecated renamed to process/noProcess
      processContent: false,
      processContentExclude: [],
      timestamp: false,
      mode: false
    });

    var copyOptions = {
      encoding: options.encoding,
      process: options.process || options.processContent,
      noProcess: options.noProcess || options.processContentExclude
    };

    var detectDestType = function(dest) {
      if (grunt.util._.endsWith(dest, '/')) {
        return 'directory';
      } else {
        return 'file';
      }
    };

    var unixifyPath = function(filepath) {
      if (isWindows) {
        return filepath.replace(/\\/g, '/');
      } else {
        return filepath;
      }
    };

    var syncTimestamp = function (src, dest) {
      var stat = fs.lstatSync(src);
      if (path.basename(src) !== path.basename(dest)) {
        return;
      }

      var fd = fs.openSync(dest, isWindows ? 'r+' : 'r');
      fs.futimesSync(fd, stat.atime, stat.mtime);
      fs.closeSync(fd);
    };

    var isExpandedPair;
    var dirs = {};
    var tally = {
      dirs: 0,
      files: 0
    };

    this.files.forEach(function(filePair) {
      isExpandedPair = filePair.orig.expand || false;

      filePair.src.forEach(function(src) {
        // eslint-disable-next-line no-param-reassign
        src = unixifyPath(src);
        var dest = unixifyPath(filePair.dest);

        if (detectDestType(dest) === 'directory') {
          dest = isExpandedPair ? dest : path.join(dest, src);
        }

        if (grunt.file.isDir(src)) {
          grunt.verbose.writeln('Creating ' + chalk.cyan(dest));
          grunt.file.mkdir(dest);
          if (options.mode !== false) {
            fs.chmodSync(dest, (options.mode === true) ? fs.lstatSync(src).mode : options.mode);
          }

          if (options.timestamp) {
            dirs[dest] = src;
          }

          tally.dirs++;
        } else {
          grunt.verbose.writeln('Copying ' + chalk.cyan(src) + ' -> ' + chalk.cyan(dest));
          grunt.file.copy(src, dest, copyOptions);
          if (options.timestamp !== false) {
            syncTimestamp(src, dest);
          }
          if (options.mode !== false) {
            fs.chmodSync(dest, (options.mode === true) ? fs.lstatSync(src).mode : options.mode);
          }
          tally.files++;
        }
      });
    });

    if (options.timestamp) {
      Object.keys(dirs).sort(function (a, b) {
        return b.length - a.length;
      }).forEach(function (dest) {
        syncTimestamp(dirs[dest], dest);
      });
    }

    if (tally.dirs) {
      grunt.log.write('Created ' + chalk.cyan(tally.dirs.toString()) + (tally.dirs === 1 ? ' directory' : ' directories'));
    }

    if (tally.files) {
      grunt.log.write((tally.dirs ? ', copied ' : 'Copied ') + chalk.cyan(tally.files.toString()) + (tally.files === 1 ? ' file' : ' files'));
    }

    grunt.log.writeln();
  });

};