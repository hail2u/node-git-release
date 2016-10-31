#!/usr/bin/env node

"use strict";

var fs = require("fs");
var minimist = require("minimist");
var path = require("path");
var pkg = require("./package.json");
var semver = require("semver");
var spawn = require("child_process").spawnSync;

var config = minimist(process.argv.slice(2), {
  alias: {
    "V": "version",
    "h": "help",
    "n": "dry-run",
    "v": "verbose"
  },
  boolean: [
    "dry-run",
    "help",
    "verbose",
    "version"
  ],
  default: {
    "dry-run": false,
    "help": false,
    "verbose": false,
    "version": false
  }
});

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

var abort = function (err) {
  if (err) {
    writeln("aborted");

    throw err;
  }
};

var detectLineEnding = function (string) {
  var cl = string.split("\r\n").length;
  var cr = string.split("\r").length;
  var lf = string.split("\n").length;

  if (cr + lf === 0) {
    return "";
  }

  if (cl === cr && cl === lf) {
    return "\r\f";
  }

  if (cr > lf) {
    return "\r";
  }

  return "\n";
};

var showHelp = function () {
  pkg.name = pkg.name.replace(/@.*?\//, "").replace(/-/g, " ");
  console.log("Usage:");
  console.log("  " + pkg.name + " [options] [major|minor|patch|premajor|preminor|prepatch|prerelease]");
  console.log("");
  console.log("Description:");
  console.log("  " + pkg.description);
  console.log("");
  console.log("Options:");
  console.log("  -n, --dry-run  Don’t process files.");
  console.log("  -v, --verbose  Log verbosely.");
  console.log("  -h, --help     Show this message.");
  console.log("  -V, --version  Print version information.");
};

// Inspect
var inspect = function () {
  write("Inspecting increment part: ");

  if (!config.part.match(/^((pre)?(major|minor|patch)|prerelease)$/)) {
    abort(new Error(config.part + ' is not "(pre)major", "(pre)minor", "(pre)patch", or "prerelease".'));
  }

  writeln(config.part);
};

// Find Git root
var findGitRoot = function () {
  var child;
  write("Finding Git root: ");
  child = spawn(config.command, [
    "rev-parse",
    "--show-toplevel"
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  config.gitroot = path.normalize(child.stdout.trim());
  writeln(config.gitroot);
};

// Get target configuration
var getConfigTarget = function () {
  var child;
  write("Getting target configuration: ");
  child = spawn(config.command, [
    "config",
    "--get-all",
    "release.target"
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  child.stdout.trim().split(/\r?\n/).forEach(function (target) {
    var colon = target.lastIndexOf(":");
    var file = target.slice(0, colon);
    var line = target.slice(colon + 1);
    file = path.relative(process.cwd(), path.join(config.gitroot, file));

    if (!fs.existsSync(file)) {
      abort(new Error('File "' + file + '" not found.'));
    }

    if (!line.match(/^\d+$/)) {
      abort(new Error('"' + line + '" is not valid line number.'));
    }

    config.targets.push({
      "file": file,
      "line": line
    });
  });
  writeln("done");
};

// Get push cnfiguration
var getConfigPush = function () {
  var child;
  write("Getting push configuration: ");
  child = spawn(config.command, [
    "config",
    "--get",
    "release.push"
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  if (child.stdout.trim() === "true") {
    config.push = true;
  }

  writeln(config.push);
};

// Increment
var increment = function (f, l) {
  var le;
  var lines;
  var source;
  write("Incrementing version in line " + l + ' of "' + f + '": ');
  l = l - 1;
  source = fs.readFileSync(f, "utf8");
  le = detectLineEnding(source);
  lines = source.split(le);
  lines[l] = lines[l].replace(config.re, function (old) {
    if (!config.version) {
      config.version = semver.inc(old, config.part);
    }

    return config.version;
  });

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  fs.writeFileSync(f, lines.join(le));
  writeln("done");
};

// Stage
var stage = function (f) {
  var child;
  write("Staging " + f + ": ");
  child = spawn(config.command, [
    "add",
    "--",
    f
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  writeln("done");
};

// Commit
var commit = function () {
  var child;
  write("Commiting changes: ");

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  child = spawn(config.command, [
    "commit",
    "-evm",
    "Version " + config.version
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  if (child.status && child.stderr) {
    abort(new Error(child.stderr));
  }

  writeln("done");
};

// Tag
var tag = function () {
  var child;
  write("Tagging commit: ");

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  child = spawn(config.command, [
    "tag",
    "v" + config.version
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  if (child.status && child.stderr) {
    abort(new Error(child.stderr));
  }

  writeln("done");
};

// Push
var push = function () {
  var child;
  write("Pushing commit & tag: ");

  if (!config.push) {
    writeln("skip");

    return;
  }

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  child = spawn(config.command, [
    "push",
    "origin",
    "HEAD",
    "v" + config.version
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  if (child.status && child.stderr) {
    abort(new Error(child.stderr));
  }

  writeln("done");
};

if (!config.help && !config.version && config._.length !== 1) {
  showHelp();
  process.exit(1);
}

switch (true) {
case config.version:
  console.log(pkg.name + " v" + pkg.version);

  break;

case config.help:
  showHelp();

  break;

default:
  config.command = "git";
  config.dryRun = config["dry-run"];
  config.gitroot = ".git";
  config.options = {
    encoding: "utf8"
  };
  config.part = config._[0];
  config.push = false;
  config.re = semver.re[3];
  config.targets = [];
  inspect();
  findGitRoot();
  getConfigTarget();
  getConfigPush();
  config.targets.forEach(function (target) {
    var file = target.file;
    var line = target.line;
    increment(file, line);
    stage(file);
  });
  commit();
  tag();
  push();
  writeln("");
  process.stdout.write("Bumped to " + config.version + ", without errors");

  if (config.dryRun) {
    process.stdout.write(" (dry-run)");
  }

  console.log(".");
}
