git-release
===========

Automatic release tool for Git


INSTALL
-------

    $ npm install -g @hail2u/git-release


USAGE
-----

    $ git release --help
    Usage:
      git release [options] <type>
    
    Description:
      Automatic release tool for Git
    
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
      - prerelease

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


LICENSE
-------

MIT: http://hail2u.mit-license.org/2014
