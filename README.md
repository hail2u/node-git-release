git-release
===========

Automatic release tool for Git


INSTALL
-------

    $ npm install -g @hail2u/git-release


USAGE
-----

    $ git release -h
    Usage:
      git release [options] [major|minor|patch|premajor|preminor|prepatch|prerelease]

    Description:
      Automatic release tool for Git

    Options:
      -n, --dry-run  Don’t process files.
      -v, --verbose  Log verbosely.
      -h, --help     Show this message.
          --version  Print version information.

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
