git-release
===========

Bump semver in multiple files, commit, tag, and push optionally.


INSTALL
-------

    $ npm install -g git-release


REQUIREMENT
-----------

Git.


OPTIONS
-------

All options stored in Git's config file.


### release.target

Specify target file path and line number with `<filepath>:<lineno>`:

    $ git config release.target package.json:4

You can have multiple target. This can be configure with `--add` option:

    $ git config --add release.target <target>:<line>


### release.push

Push after tagging a commit (default false):

    $ git config release.push true


USAGE
-----

    $ git release [major|minor|patch]

If something occured, command stops with stack trace.


LICENSE
-------

MIT: http://hail2u.mit-license.org/2014
