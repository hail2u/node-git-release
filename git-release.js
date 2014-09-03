#!/usr/bin/env node

'use strict';

var async = require('async');
var exec = require('child_process').exec;
var fs = require('fs');
var minimist = require('minimist');
var path = require('path');
var semver = require('semver');

var pkg = require('./package.json');

var reSemver = /\d+\.\d+\.\d+([0-9A-Za-z-])?/;

var options = minimist(process.argv.slice(2), {
  boolean: [
    'dry-run',
    'help',
    'version'
  ],
  alias: {
    'h': 'help',
    'n': 'dry-run',
    'v': 'version'
  },
  default: {
    'dry-run': false,
    'help': false,
    'version': false
  }
});

if (options.version) {
  console.log(pkg.name + ' v' + pkg.version);

  process.exit(0);
}

var incTarget = options._[0];

if (options.help || !incTarget) {
  console.log('Usage:');
  console.log('  git release [options] [major|minor|patch]');
  console.log('');
  console.log('Description:');
  console.log('  ' + pkg.description);
  console.log('');
  console.log('Options:');
  console.log('  -n, --dry-run  Don\'t process files.');
  console.log('  -h, --help     Show this message.');
  console.log('  -v, --version  Print version information.');

  process.exit(0);
}

var dryRun = options['dry-run'];
var gitroot = '';
var config = {
  targets: [],
  push: false
};
var version = '';

async.series({
  inspectIncrementTarget: function (next) {
    process.stdout.write('Inspecting increment target: ');

    if (!incTarget.match(/^(major|minor|patch)$/)) {
      return next(new Error(incTarget + ' is not "major", "minor", or "patch".'));
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

  getConfigTarget: function (next) {
    process.stdout.write('Getting target configuration: ');
    exec('git config --get-all release.target', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      stdout.trim().split(/\r?\n/).forEach(function (target) {
        var colon = target.lastIndexOf(':');
        config.targets.push({
          'file': target.slice(0, colon),
          'line': target.slice(colon + 1)
        });
      });

      console.log('done');
      next();
    });
  },

  getConfigPush: function (next) {
    process.stdout.write('Getting push configuration: ');
    exec('git config --get release.push', function (err, stdout, stderr) {
      if (!err && stdout.trim() === 'true') {
        config.push = true;
      }

      console.log(config.push);
      next();
    });
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
      data[line] = data[line].replace(reSemver, function (old) {
        version = semver.inc(old, incTarget);

        return version;
      });

      if (dryRun) {
        console.log('done (dry-run)');

        return;
      }

      fs.writeFileSync(file, data.join('\n'));
      console.log('done');
    });
    next();
  },

  commit: function (next) {
    process.stdout.write('Commiting changes: ');

    if (dryRun) {
      console.log('done (dry-run)');

      return next();
    }

    exec('git commit -aevm "Version ' + version + '"', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      console.log('done');
      next();
    });
  },

  tag: function (next) {
    process.stdout.write('Tagging commit: ');

    if (dryRun) {
      console.log('done (dry-run)');

      return next();
    }

    exec('git tag v' + version, function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      console.log('done');
      next();
    });
  },

  push: function (next) {
    if (!config.push) {
      return next();
    }

    process.stdout.write('Pushing commit & tag: ');

    if (dryRun) {
      console.log('done (dry-run)');

      return next();
    }

    exec('git push --tags origin :', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      console.log('done');
      next();
    });
  }
}, function (err, result) {
  if (err) {
    console.log('aborted');

    throw err;
  }

  console.log('');
  process.stdout.write('Bumped to ' + version + ', without errors');

  if (dryRun) {
    console.log(', but not processed any files.');
  } else {
    console.log('.');
  }
});
