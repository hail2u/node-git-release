#!/usr/bin/env node

"use strict";

const execFile = require("child_process").execFileSync;
const fs = require("fs");
const minimist = require("minimist");
const path = require("path");
const semver = require("semver");
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

function write(msg, ln) {
  if (!config.verbose) {
    return;
  }

  if (ln) {
    console.log(msg);

    return;
  }

  process.stdout.write(msg);
}

function abort(err) {
  if (err) {
    write("aborted", true);

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

function inspect() {
  write("Inspecting release type: ");
  write("Inspecting release type: ");

  if (!config.type.match(/^((pre)?(major|minor|patch)|prerelease)$/)) {
    abort(new Error(`${config.type} is not "major", "premajor", "minor", "preminor", "patch", "prepatch" or "prerelease".`));
  }

  write(config.type, true);
}

function findNpmRoot() {
  write("Finding npm root: ");
  const o = execFile(config.npmcommand, ["prefix"], config.options);

  config.npmroot = path.normalize(o.trim());
  write(config.npmroot, true);
}

function readPackageJson() {
  write("Reading package.json: ");
  const p = path.join(config.npmroot, "package.json");

  if (!fs.existsSync(p)) {
    write("skipped (package.json not found)", true);

    return;
  }

  config.npmpkg = JSON.parse(fs.readFileSync(p, "utf8"));
  write("done", true);
}

function test() {
  write("Running npm test: ");

  if (!config.test) {
    write("skipped (--no-test option found)", true);

    return;
  }

  if (!config.npmpkg.scripts || !config.npmpkg.scripts.test) {
    write("skipped (test not found)", true);

    return;
  }

  if (config.dryRun) {
    write("done (dry-run)", true);

    return;
  }

  execFile(config.npmcommand, ["test"], config.options);
  write("done", true);
}

function findGitRoot() {
  write("Finding Git root: ");
  const o = execFile(config.gitcommand, [
    "rev-parse",
    "--show-toplevel"
  ], config.options);

  config.gitroot = path.normalize(o.trim());
  write(config.gitroot, true);
}

function getConfigTarget() {
  write("Getting target configuration: ");
  const o = execFile(config.gitcommand, [
    "config",
    "--get-all",
    "release.target"
  ], config.options);

  o.trim()
    .split(/\r?\n/)
    .forEach((target) => {
      const s = target.lastIndexOf(":");
      const l = target.slice(s + 1);
      const f = path.relative(
        process.cwd(),
        path.join(config.gitroot, target.slice(0, s))
      );

      if (!fs.existsSync(f)) {
        abort(new Error(`File "${f}" not found.`));
      }

      if (!l.match(/^\d+$/)) {
        abort(new Error(`"${l}" is not valid line number.`));
      }

      config.targets.push({
        "file": f,
        "line": l
      });
    });
  write("done", true);
}

function increment() {
  config.targets.forEach((target) => {
    write(`Incrementing version in line ${target.line} of "${target.file}": `);
    target.line = target.line - 1;
    let s = fs.readFileSync(target.file, "utf8");
    const n = detectLineEnding(s);

    s = s.split(n);
    s[target.line] = s[target.line].replace(config.re, (old) => {
      if (!config.version) {
        config.version = semver.inc(old, config.type);
      }

      return config.version;
    });

    if (config.dryRun) {
      write("done (dry-run)", true);

      return;
    }

    fs.writeFileSync(target.file, s.join(n));
    write("done", true);
    write(`Staging ${target.file}: `);
    execFile(config.gitcommand, [
      "add",
      "--",
      target.file
    ], config.options);
    write("done", true);
  });
}

function commit() {
  write("Commiting changes: ");

  if (config.dryRun) {
    write("done (dry-run)", true);

    return;
  }

  execFile(config.gitcommand, [
    "commit",
    "--edit",
    `--message=Version ${config.version}`,
    "--verbose"
  ], config.options);
  write("done", true);
}

function tag() {
  write("Tagging commit: ");

  if (config.dryRun) {
    write("done (dry-run)", true);

    return;
  }

  execFile(config.gitcommand, [
    "tag",
    `v${config.version}`
  ], config.options);
  write("done", true);
}

function getRemoteURL() {
  write("Getting remote URL: ");
  const o = execFile(config.gitcommand, [
    "config",
    "--get",
    "remote.origin.url"
  ], config.options);

  config.remoteURL = o.trim();

  if (!config.remoteURL) {
    config.remoteURL = "N/A";
  }

  write(config.remoteURL, true);
}

function push() {
  write("Pushing commit & tag: ");

  if (!config.push) {
    write("skipped (--no-push option found)", true);

    return;
  }

  if (config.remoteURL === "N/A") {
    write("skipped (remote URL not found)", true);

    return;
  }

  if (config.dryRun) {
    write("done (dry-run)", true);

    return;
  }

  execFile(config.gitcommand, [
    "push",
    "origin",
    "HEAD",
    `v${config.version}`
  ], config.options);
  write("done", true);
}

function publish() {
  write("Publishing package: ");

  if (!config.publish) {
    write("skipped (--no-publish option found)", true);

    return;
  }

  if (!config.npmpkg.version) {
    write("skipped (not a npm package)", true);

    return;
  }

  if (config.npmpkg.private === true) {
    write("skipped (private npm package)", true);

    return;
  }

  if (config.npmpkg.publishConfig) {
    write("skipped (publishing private repository not supported)", true);

    return;
  }

  if (config.dryRun) {
    write("done (dry-run)", true);

    return;
  }

  execFile(config.npmcommand, ["publish"], config.options);
  write("done", true);
}

pkg.name = pkg.name.replace(/@.*?\//, "").replace(/-/g, " ");

if (!config.help && !config.version && config._.length !== 1) {
  config.help = true;
  config.badArgs = true;
}

switch (true) {
case config.help:
  showHelp();

  break;

case config.version:
  console.log(`${pkg.name} v${pkg.version}`);

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
  write("", true);
  process.stdout.write(`Released version ${config.version}, without errors`);

  if (config.dryRun) {
    process.stdout.write(" (dry-run)");
  }

  console.log("");
}

if (config.badArgs) {
  process.exit(1);
}
