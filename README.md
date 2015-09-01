git-release
===========

Bump semver in multiple files, stage, commit, tag, and optionally push.


INSTALL
-------

    $ npm install -g @hail2u/git-release


REQUIREMENT
-----------

Git.


USAGE
-----

    $ git release -h
    Usage:
      git release [options] [major|minor|patch]

    Description:
      Bump semver in multiple files, commit, tag, and push optionally.

    Options:
      -n, --dry-run  Don't process files.
      -h, --help     Show this message.
      -v, --version  Print version information.

If something occured, command stops with stack trace.


OPTIONS
-------

All options are retrieved from Git’s config file. You should configure with `git
config` command.


### release.target

Specify target file path and line number with `<filepath>:<lineno>`:

    $ git config release.target package.json:4

You can have multiple target. This can be configured with `--add` option:

    $ git config --add release.target lib/foo.js:7


### release.push

Push after tagging a commit (default false):

    $ git config release.push true


LICENSE
-------

MIT: http://hail2u.mit-license.org/2014
