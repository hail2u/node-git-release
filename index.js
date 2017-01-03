#!/usr/bin/env node

"use strict";

const fs = require("fs");
const minimist = require("minimist");
const path = require("path");
const semver = require("semver");
const spawn = require("child_process").spawnSync;
const which = require("which").sync;

const config = minimist(process.argv.slice(2), {
  alias: {
    "h": "help",
    "n": "dry-run",
    "v": "verbose"
  },
  boolean: [
    "dry-run",
    "help",
    "publish",
    "push",
    "test",
    "verbose",
    "version"
  ],
  default: {
    "dry-run": false,
    "help": false,
    "publish": true,
    "push": true,
    "test": true,
    "verbose": false,
    "version": false
  }
});
const pkg = require("./package.json");

function write(msg) {
  if (config.verbose) {
    process.stdout.write(msg);
  }
}

function writeln(msg) {
  if (config.verbose) {
    console.log(msg);
  }
}

function abort(err) {
  if (err) {
    writeln("aborted");

    throw err;
  }
}

function detectLineEnding(string) {
  const cl = string.split("\r\n").length;
  const cr = string.split("\r").length;
  const lf = string.split("\n").length;

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
}

function showHelp() {
  console.log(`Usage:
  ${pkg.name} [options] <type>

Description:
  ${pkg.description}

Options:
      --no-test     Don’t test.
      --no-push     Don’t push releases.
      --no-publish  Don’t publish.
  -n, --dry-run     Don’t process files.
  -v, --verbose     Log verbosely.
  -h, --help        Show this message.
      --version     Print version information.

Type:
  - major
  - premajor
  - minor
  - preminor
  - patch
  - prepatch
  - prerelease`);
}

// Inspect
function inspect() {
  write("Inspecting release type: ");

  if (!config.type.match(/^((pre)?(major|minor|patch)|prerelease)$/)) {
    abort(new Error(`${config.type} is not "major", "premajor", "minor", "preminor", "patch", "prepatch" or "prerelease".`));
  }

  writeln(config.type);
}

// Find npm root
function findNpmRoot() {
  write("Finding npm root: ");
  const child = spawn(config.npmcommand, ["prefix"], config.options);

  if (child.error) {
    abort(child.error);
  }

  config.npmroot = path.normalize(child.stdout.trim());
  writeln(config.npmroot);
}

// Read package.json
function readPackageJson() {
  write("Reading package.json: ");
  const p = path.join(config.npmroot, "package.json");

  if (!fs.existsSync(p)) {
    writeln("skipped (package.json not found)");

    return;
  }

  config.npmpkg = JSON.parse(fs.readFileSync(p, "utf8"));
  writeln("done");
}

// Test
function test() {
  write("Running npm test: ");

  if (!config.test) {
    writeln("skipped (--no-test option found)");

    return;
  }

  if (!config.npmpkg.scripts || !config.npmpkg.scripts.test) {
    writeln("skipped (test not found)");

    return;
  }

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  const child = spawn(config.npmcommand, ["test"], config.options);

  if (child.error) {
    abort(child.error);
  }

  writeln("done");
}

// Find Git root
function findGitRoot() {
  write("Finding Git root: ");
  const child = spawn(config.gitcommand, [
    "rev-parse",
    "--show-toplevel"
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  config.gitroot = path.normalize(child.stdout.trim());
  writeln(config.gitroot);
}

// Get target configuration
function getConfigTarget() {
  write("Getting target configuration: ");
  const child = spawn(config.gitcommand, [
    "config",
    "--get-all",
    "release.target"
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  if (child.status !== 0) {
    abort(new Error("Config not found."));
  }

  child.stdout
    .trim()
    .split(/\r?\n/)
    .forEach(function (target) {
      const colon = target.lastIndexOf(":");
      const line = target.slice(colon + 1);
      let file = target.slice(0, colon);

      file = path.relative(process.cwd(), path.join(config.gitroot, file));

      if (!fs.existsSync(file)) {
        abort(new Error(`File "${file}" not found.`));
      }

      if (!line.match(/^\d+$/)) {
        abort(new Error(`"${line}" is not valid line number.`));
      }

      config.targets.push({
        "file": file,
        "line": line
      });
    });
  writeln("done");
}

// Increment
function increment() {
  config.targets.forEach(function (target) {
    write(`Incrementing version in line ${target.line} of "${target.file}": `);
    target.line = target.line - 1;
    const source = fs.readFileSync(target.file, "utf8");
    const le = detectLineEnding(source);
    const lines = source.split(le);

    lines[target.line] = lines[target.line].replace(config.re, function (old) {
      if (!config.version) {
        config.version = semver.inc(old, config.type);
      }

      return config.version;
    });

    if (config.dryRun) {
      writeln("done (dry-run)");

      return;
    }

    fs.writeFileSync(target.file, lines.join(le));
    writeln("done");
    write(`Staging ${target.file}: `);
    const child = spawn(config.gitcommand, [
      "add",
      "--",
      target.file
    ], config.options);

    if (child.error) {
      abort(child.error);
    }

    writeln("done");
  });
}

// Commit
function commit() {
  write("Commiting changes: ");

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  const child = spawn(config.gitcommand, [
    "commit",
    "--edit",
    `--message=Version ${config.version}`,
    "--verbose"
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  if (child.status && child.stderr) {
    abort(new Error(child.stderr));
  }

  writeln("done");
}

// Tag
function tag() {
  write("Tagging commit: ");

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  const child = spawn(config.gitcommand, [
    "tag",
    `v${config.version}`
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  if (child.status && child.stderr) {
    abort(new Error(child.stderr));
  }

  writeln("done");
}

// Get remote URL
function getRemoteURL() {
  write("Getting remote URL: ");
  const child = spawn(config.gitcommand, [
    "config",
    "--get",
    "remote.origin.url"
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  config.remoteURL = child.stdout.trim();

  if (!config.remoteURL) {
    config.remoteURL = "N/A";
  }

  writeln(config.remoteURL);
}

// Push
function push() {
  write("Pushing commit & tag: ");

  if (!config.push) {
    writeln("skipped (--no-push option found)");

    return;
  }

  if (config.remoteURL === "N/A") {
    writeln("skipped (remote URL not found)");

    return;
  }

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  const child = spawn(config.gitcommand, [
    "push",
    "origin",
    "HEAD",
    `v${config.version}`
  ], config.options);

  if (child.error) {
    abort(child.error);
  }

  if (child.status && child.stderr) {
    abort(new Error(child.stderr));
  }

  writeln("done");
}

// Publish
function publish() {
  write("Publishing package: ");

  if (!config.publish) {
    writeln("skipped (--no-publish option found)");

    return;
  }

  if (!config.npmpkg.version) {
    writeln("skipped (not a npm package)");

    return;
  }

  if (config.npmpkg.private === true) {
    writeln("skipped (private npm package)");

    return;
  }

  if (config.npmpkg.publishConfig) {
    writeln("skipped (publishing private repository not supported)");

    return;
  }

  if (config.dryRun) {
    writeln("done (dry-run)");

    return;
  }

  const child = spawn(config.npmcommand, ["publish"], config.options);

  if (child.error) {
    abort(child.error);
  }

  writeln("done");
}

pkg.name = pkg.name.replace(/@.*?\//, "").replace(/-/g, " ");

if (!config.help && !config.version && config._.length !== 1) {
  config.help = true;
  config.badArgs = true;
}

switch (true) {
case config.version:
  console.log(`${pkg.name} v${pkg.version}`);

  break;

case config.help:
  showHelp();

  break;

default:
  config.dryRun = config["dry-run"];
  config.gitcommand = which("git");
  config.gitroot = "";
  config.npmcommand = which("npm");
  config.npmpkg = {};
  config.npmroot = "";
  config.options = {
    encoding: "utf8"
  };
  config.re = semver.re[3];
  config.remoteURL = "";
  config.targets = [];
  config.type = config._[0];
  config.version = "";
  inspect();
  findNpmRoot();
  readPackageJson();
  test();
  findGitRoot();
  getConfigTarget();
  increment();
  commit();
  tag();
  getRemoteURL();
  push();
  publish();
  writeln("");
  process.stdout.write(`Released version ${config.version}, without errors`);

  if (config.dryRun) {
    process.stdout.write(" (dry-run)");
  }

  console.log("");
}

if (config.badArgs) {
  process.exit(1);
}
