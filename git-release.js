#!/usr/bin/env node

'use strict';

var fs = require('fs');
var minimist = require('minimist');
var path = require('path');
var semver = require('semver');
var spawn = require('child_process').spawnSync;

var pkg = require('./package.json');

var config = minimist(process.argv.slice(2), {
  alias: {
    'h': 'help',
    'n': 'dry-run',
    'v': 'verbose',
    'V': 'version'
  },
  boolean: [
    'dry-run',
    'help',
    'verbose',
    'version'
  ],
  default: {
    'dry-run': false,
    'help': false,
    'verbose': false,
    'version': false
  }
});

if (config.version) {
  console.log(pkg.name + ' v' + pkg.version);

  process.exit(0);
}

if (config.help || config._.length !== 1) {
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

  process.exit(config._.length);
}

config.command = 'git';
config.dryRun = config['dry-run'];
config.gitroot = '.git';
config.options = {
  encoding: 'utf8'
};
config.part = config._[0];
config.push = false;
config.re = semver.re[3];
config.targets = [];

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

var next = function (err) {
  writeln('aborted');

  throw err;
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

// Inspect
(function () {
  write('Inspecting increment part: ');

  if (!config.part.match(/^(major|minor|patch)$/)) {
    return next(new Error(config.part + ' is not "major", "minor", or "patch".'));
  }

  writeln(config.part);
})();

// Find Git root
(function () {
  write('Finding Git root: ');
  var child = spawn(config.command, [
    'rev-parse',
    '--show-toplevel'
  ], config.options);

  if (child.error) {
    return next(child.error);
  }

  config.gitroot = path.normalize(child.stdout.trim());
  writeln(config.gitroot);
})();

// Get target configuration
(function () {
  write('Getting target configuration: ');
  var child = spawn(config.command, [
    'config',
    '--get-all',
    'release.target'
  ], config.options);

  if (child.error) {
    return next(child.error);
  }

  child.stdout.trim().split(/\r?\n/).forEach(function (target) {
    var colon = target.lastIndexOf(':');
    var file = target.slice(0, colon);
    var line = target.slice(colon + 1);
    file = path.relative(process.cwd(), path.join(config.gitroot, file));

    if (!fs.existsSync(file)) {
      return next(new Error('File "' + file + '" not found.'));
    }

    if (!line.match(/^\d+$/)) {
      return next(new Error('"' + line + '" is not valid line number.'));
    }

    config.targets.push({
      'file': file,
      'line': line
    });
  });
  writeln('done');
})();

// Get push cnfiguration
(function () {
  write('Getting push configuration: ');
  var child = spawn(config.command, [
    'config',
    '--get',
    'release.push'
  ], config.options);

  if (child.error) {
    return next(child.error);
  }

  if (child.stdout.trim() === 'true') {
    config.push = true;
  }

  writeln(config.push);
})();

// Increment, save, and stage
config.targets.forEach(function (target) {
  var file = target.file;
  var line = target.line;
  write('Incrementing version in line ' + line + ' of "' + file + '": ');
  line = line - 1;
  var source = fs.readFileSync(file, 'utf8');
  var le = detectLineEnding(source);
  var lines = source.split(le);
  lines[line] = lines[line].replace(config.re, function (old) {
    if (!config.version) {
      config.version = semver.inc(old, config.part);
    }

    if (config.dryRun) {
      writeln('done (dry-run)');
    } else {
      writeln('done');
    }

    return config.version;
  });
  write('Saving "' + file + '": ');

  if (config.dryRun) {
    writeln('done (dry-run)');

    return;
  }

  fs.writeFileSync(file, lines.join(le));
  writeln('done');
  write('Staging ' + file + ': ');
  var child = spawn(config.command, [
    'add',
    '--',
    file
  ], config.options);

  if (child.error) {
    return next(child.error);
  }

  writeln('done');
});

// Commit
(function () {
  write('Commiting changes: ');

  if (config.dryRun) {
    writeln('done (dry-run)');

    return;
  }

  var child = spawn(config.command, [
    'commit',
    '-evm',
    'Version ' + config.version
  ], config.options);

  if (child.error) {
    return next(child.error);
  }

  if (child.status && child.stderr) {
    return next(new Error(child.stderr));
  }

  writeln('done');
})();

// Tag
(function () {
  write('Tagging commit: ');

  if (config.dryRun) {
    writeln('done (dry-run)');

    return;
  }

  var child = spawn(config.command, [
    'tag',
    'v' + config.version
  ], config.options);

  if (child.error) {
    return next(child.error);
  }

  if (child.status && child.stderr) {
    return next(new Error(child.stderr));
  }

  writeln('done');
})();

// Push
(function () {
  write('Pushing commit & tag: ');

  if (!config.push) {
    writeln('skip');

    return;
  }

  if (config.dryRun) {
    writeln('done (dry-run)');

    return;
  }

  var child = spawn(config.command, [
    'push',
    'origin',
    'HEAD v' + config.version
  ], config.options);

  if (child.error) {
    return next(child.error);
  }

  if (child.status && child.stderr) {
    return next(new Error(child.stderr));
  }

  writeln('done');
})();

writeln('');
process.stdout.write('Bumped to ' + config.version + ', without errors');

if (config.dryRun) {
  process.stdout.write(' (dry-run)');
}

console.log('.');
