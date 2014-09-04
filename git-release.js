#!/usr/bin/env node

'use strict';

var async = require('async');
var exec = require('child_process').exec;
var fs = require('fs');
var minimist = require('minimist');
var path = require('path');
var semver = require('semver');

var pkg = require('./package.json');

var reSemver = /\d+\.\d+\.\d+(-[-.0-9a-zA-Z]?[.0-9a-zA-Z])?(\+[-.0-9a-zA-Z]?[-0-9a-zA-Z])?/;

var options = minimist(process.argv.slice(2), {
  boolean: [
    'dry-run',
    'help',
    'verbose',
    'version'
  ],
  alias: {
    'h': 'help',
    'n': 'dry-run',
    'v': 'verbose',
    'V': 'version'
  },
  default: {
    'dry-run': false,
    'help': false,
    'verbose': false,
    'version': false
  }
});

if (options.version) {
  console.log(pkg.name + ' v' + pkg.version);

  process.exit(0);
}

if (options.help || options._.length !== 1) {
  console.log('Usage:');
  console.log('  git release [options] [major|minor|patch]');
  console.log('');
  console.log('Description:');
  console.log('  ' + pkg.description);
  console.log('');
  console.log('Options:');
  console.log('  -n, --dry-run  Don\'t process files.');
  console.log('  -v, --verbose  Log verbosely.');
  console.log('  -h, --help     Show this message.');
  console.log('  -V, --version  Print version information.');

  process.exit(options._.length);
}

var config = {
  dryRun: options['dry-run'],
  verbose: options.verbose,
  part: options._[0],
  targets: [],
  push: false
};

var write = function (msg) {
  if (config.verbose) {
    process.stdout.write(msg);
  }
};

var writeln = function (msg) {
  if (config.verbose) {
    console.log(msg);
  }
};

var detectLineEnding = function (string) {
  var cr = string.split('\r').length;
  var lf = string.split('\n').length;
  var cl = string.split('\r\n').length;

  if (cr + lf === 0) {
    return '';
  }

  if (cl === cr && cl === lf) {
    return '\r\f';
  }

  if (cr > lf) {
    return '\r';
  }

  return '\n';
};

async.series([
  function (next) {
    write('Inspecting increment part: ');

    if (!config.part.match(/^(major|minor|patch)$/)) {
      return next(new Error(config.part + ' is not "major", "minor", or "patch".'));
    }

    writeln(config.part);
    next();
  },

  function (next) {
    write('Finding Git root: ');
    exec('git rev-parse --show-toplevel', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      config.gitroot = path.normalize(stdout.trim());

      writeln(config.gitroot);
      next();
    });
  },

  function (next) {
    write('Getting target configuration: ');
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

      writeln('done');
      next();
    });
  },

  function (next) {
    write('Getting push configuration: ');
    exec('git config --get release.push', function (err, stdout, stderr) {
      if (!err && stdout.trim() === 'true') {
        config.push = true;
      }

      writeln(config.push);
      next();
    });
  },

  function (next) {
    config.targets.forEach(function (target) {
      var file = path.relative(process.cwd(), path.join(config.gitroot, target.file));

      if (!fs.existsSync(file)) {
        return next(new Error('File "' + file + '" not found.'));
      }

      var line = target.line;

      if (!line.match(/^\d+$/)) {
        return next(new Error('"' + line + '" is not valid line number.'));
      }

      write('Incrementing version in "' + file + ':' + line +'": ');
      line = line - 1;
      var source = fs.readFileSync(file, 'utf8');
      var le = detectLineEnding(source);
      var lines = source.split(le);
      lines[line] = lines[line].replace(reSemver, function (old) {
        config.version = semver.inc(old, config.part);
        write('bumped, ');

        return config.version;
      });

      if (config.dryRun) {
        writeln('done (dry-run)');

        return;
      }

      fs.writeFileSync(file, lines.join(le));
      writeln('done');
    });
    next();
  },

  function (next) {
    write('Commiting changes: ');

    if (config.dryRun) {
      writeln('done (dry-run)');

      return next();
    }

    exec('git commit -aevm "Version ' + config.version + '"', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      writeln('done');
      next();
    });
  },

  function (next) {
    write('Tagging commit: ');

    if (config.dryRun) {
      writeln('done (dry-run)');

      return next();
    }

    exec('git tag v' + config.version, function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      writeln('done');
      next();
    });
  },

  function (next) {
    write('Pushing commit & tag: ');

    if (!config.push) {
      writeln('skip');

      return next();
    }

    if (config.dryRun) {
      writeln('done (dry-run)');

      return next();
    }

    exec('git push --tags origin :', function (err, stdout, stderr) {
      if (err) {
        return next(err);
      }

      writeln('done');
      next();
    });
  }
], function (err, result) {
  if (err) {
    writeln('aborted');

    throw err;
  }

  writeln('');
  process.stdout.write('Bumped to ' + config.version + ', without errors');

  if (config.dryRun) {
    process.stdout.write(' (dry-run)');
  }

  console.log('.');
});
