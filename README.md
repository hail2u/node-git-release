git-release
===========

Bump semver in multiple files, commit, tag, and push optionally.


INSTALL
-------

    $ npm install -g git-release

Not published yet.


REQUIREMENT
-----------

Git.


USAGE
-----

    $ git release --help
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

All options are stored in Git's config file.


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
