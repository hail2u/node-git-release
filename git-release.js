#!/usr/bin/env node

'use strict';

var async = require('async');
var exec = require('child_process').exec;
var fs = require('fs');
var path = require('path');
var semver = require('semver');

var reSemver = /\d+\.\d+\.\d+([0-9A-Za-z-])?/;

var incTarget = '';
var gitroot = '';
var gitdir = '';
var config = {
  targets: [],
  push: false
};
var version = '';

async.series({
  inspectIncrementTarget: function (next) {
    process.stdout.write('Inspecting increment target: ');
    incTarget = process.argv[2];

    if (!incTarget || !incTarget.match(/^(major|minor|patch)$/)) {
      return next(new Error('Usage: git release [major|minor|patch]'));
    }

    console.log(incTarget);
    next();
  },

  findGitRoot: function (next) {
    process.stdout.write('Finding Git root: ');
    exec('git rev-parse --show-toplevel', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      gitroot = path.normalize(stdout.trim());

      console.log(gitroot);
      next();
    });
  },

  findGitDir: function (next) {
    process.stdout.write('Finding Git directory: ');
    exec('git rev-parse --git-dir', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      gitdir = path.normalize(stdout.trim());

      console.log(gitdir);
      next();
    });
  },

  getTargetFiles: function (next) {
    process.stdout.write('Getting target files: ');
    var gitconfig = fs.readFileSync(path.join(gitdir, 'config'), 'utf-8').split(/\r?\n/);
    var release = false;
    var targets = [];

    gitconfig.forEach(function (line) {
      if (release && line.indexOf('[') === 0) {
        release = false;
      }

      if (line.indexOf('[release]') === 0) {
        release = true;
      }

      if (!release) {
        return;
      }

      line = line.trim();

      if (line.indexOf('target') === 0) {
        targets.push(line.replace(/^target = /, ''));

        return;
      }

      if (line.indexOf('push') === 0 && !/\bfalse$/.test(line)) {
        config.push = true;

        return;
      }
    });

    if (targets.length === 0) {
      return next(new Error('Target file not found.'));
    }

    targets.forEach(function (target) {
      var colon = target.lastIndexOf(':');
      config.targets.push({
        'file': target.slice(0, colon),
        'line': target.slice(colon + 1)
      });
    });

    console.log('done.');
    next();
  },

  increment: function (next) {
    config.targets.forEach(function (target) {
      var file = path.join(gitroot, target.file);

      if (!fs.existsSync(file)) {
        return next(new Error('File "' + file + '" not found.'));
      }

      var line = target.line;

      if (!line.match(/^\d+$/)) {
        return next(new Error('"' + line + '" is not valid line number.'));
      }

      process.stdout.write('Incrementing version in "' + file + ':' + line +'": ');
      line = line - 1;
      var data = fs.readFileSync(file, 'utf8').split(/\n/);
      data[line] = data[line].replace(reSemver, function (match) {
        version = semver.inc(match, incTarget);

        return version;
      });
      fs.writeFileSync(file, data.join('\n'));
      console.log('done.');
    });
    next();
  },

  commit: function (next) {
    process.stdout.write('Commiting changes: ');
    exec('git commit -aevm "Version ' + version + '"', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      console.log('done.');
      next();
    });
  },

  tag: function (next) {
    process.stdout.write('Tagging commit: ');
    exec('git tag v' + version, function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      console.log('done.');
      next();
    });
  },

  push: function (next) {
    if (!config.push) {
      return next();
    }

    process.stdout.write('Pushing commit & tag: ');
    exec('git push --tags origin :', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      console.log('done.');
      next();
    });
  }
}, function (err, result) {
  if (err) {
    console.log('aborted.');
    throw err;
  }

  console.log('Bumped to ' + version + ', without errors.');
});
