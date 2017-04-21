Contributing
============

Thank you for contributing to vimperator-labs!

Following are some guidelines designed to make the progress as smooth as
possible. If you have any questions, feel free to drop by
`#vimperator@freenode` or create an issue.

Issues
------

A few things to keep in mind when creating a new issue:

- Follow the issue template
- Attach relevant configuration or RC file if applicable (e.g. your
  `.vimperatorrc` or part of it).
- Check if a fresh profile solves the issue
    - `$ firefox -no-remote -P`
- Confirm if it works without your configuration
    - `$ firefox -no-remote -P <fresh profile> -vimperator "+u NONE"`

Pull requests
-------------

- Title and commit message(s) should include relevant issue ID(s)
- For any new or changed feature, AsciiDoc documentation and an entry in the
  NEWS file is required for the patch to be accepted.

Firefox Aurora/Development
--------------------------

### Electrolysis

If you use Firefox Aurora/Development together with Vimperator,
you have to disable Electrolysis (e10s).
e10s is multi-processing for Firefox and Vimperator is not compatible with
e10s.

To do so, open `about:config` and set all these to `false`:

- `browser.tabs.remote.autostart`
- `browser.tabs.remote.autostart.1`
- `browser.tabs.remote.autostart.2`

### Unsigned XPI

In Firefox Auora/Development, you can still install unsigned XPIs.
To enable this option, open `about:config` and set:

- `xpinstall.signatures.required` to `false`

Afterwards, you can install the XPI that you created with `make xpi`.
It is located in the `downloads` directory of the `vimperator-labs` repository
root.

Hacking
-------

If you've taken to hacking Vimperator source code, we hope that you'll share
your changes. In case you do, please keep the following in mind, and we'll be
happy to accept your patches.

### Documentation

First of all, all new features and all user-visible changes to existing
features need to be documented. That means editing the appropriate help files
and adding a NEWS entry where appropriate. When editing the NEWS file, you
should add your change to the top of the list of changes. If your change alters
an interface (key binding, command) and is likely to cause trouble, prefix it
with `IMPORTANT:`, otherwise, place it below the other `IMPORTANT` entries. If
you're not sure if your change merits a news entry, or if it's important,
please ask.

### Coding Style

In general: Just look at the existing source code!

We try to target experienced JavaScript developers who do not necessarily need
to have a good understanding of Vimperator's source code, nor necessarily
understand in-depth concepts of other languages like Lisp or Python. Therefore,
the coding style should feel natural to any JavaScript developer. Of course,
this does not mean, you have to avoid all new JavaScript features like list
comprehension or generators. Use them, when they make sense, but don't use them
when the resulting code is hard to read.

**Please stick to using only standards compliant JavaScript.**

#### The most important style issues are:

- Use 4 spaces to indent things, no tabs, not 2, nor 8 spaces. If you use Vim,
  this should be taken care of automatically by the modeline (like the one
  below).

- No trailing whitespace.

- Use `"` for enclosing strings instead of `'`, unless using `'` avoids
  escaping of lots of `"`:

  ```javascript
  alert("foo")

  alert('foo')
  ```

- Use `//` regexp literals rather than RegExp constructors, unless you're
  constructing an expression on the fly, or RegExp constructors allow you to
  escape less `/s` than the additional escaping of special characters required
  by string quoting:

  ```javascript
  // Good
  /application\/xhtml\+xml/
  RegExp("http://(www\\.)vimperator.org/(.*)/(.*)")

  // Bad
  RegExp("application/xhtml\\+xml")
  /http:\/\/(www\.)vimperator.org\/(.*)\/(.*)/
  ```

- Exactly one space after `if/for/while/catch` etc. and after a comma, but none
  after a parenthesis or after a function call:

  ```javascript
  for (pre; condition; post)
  alert("foo");
  ```

- Bracing is formatted as follows:

  ```javascript
  function myFunction () {
      if (foo)
          return bar;
      else {
          baz = false;
          return baz;
      }
  }
  var quux = frob("you",
      {
          a: 1,
          b: 42,
          c: {
              hoopy: "frood"
          }
      });
  ```

  When in doubt, look for similar code.

- No braces for one-line conditional statements:

  ```javascript
  if (foo)
      frob();
  else
      unfrob();
  ```

- Prefer the use of `let` over `var` i.e. only use `var` when required.

  For more details, see:
  https://developer.mozilla.org/en/New_in_JavaScript_1.7#Block_scope_with_let

- Reuse common local variable names. E.g. `elem` is generally used for element,
  `win` for windows, `func` for functions, `ret` for return values etc.

- Prefer `//` over `/* */` comments (exceptions for big comments are usually
  OK):

  ```javascript
  // Good
  if (HACK) // TODO: remove hack

  // Bad
  if (HACK) /* TODO: remove hack */
  ```

- Documentation comment blocks use `/** ... */` Wrap these lines at 80
  characters.

- Only wrap lines if it makes the code obviously clearer. Lines longer than 132
  characters should probably be broken up rather than wrapped anyway.

- Use UNIX new lines (`\n`), not windows (`\r\n`) or old Mac ones (`\r`).

- Prefer Array iterator functions `Array#forEach` and `Array#map` over loops
  and array comprehensions.

- Avoid using `new` with constructors where possible, and use `[]` and
  `{}` rather than `new Array` or `new Object`:

  ```javascript
  // Good
  RegExp("^" + foo + "$")
  Function(code)
  new Date

  // Bad
  new RegExp("^" + foo + "$")
  new Function(code)
  Date() // Right if you want a string-representation of the date
  ```

- Don't use abbreviations for public methods:

  ```javascript
  // Good
  function splitString()...
  let commands = ...;
  let cmds = ...; // Since it's only used locally, abbreviations are ok, but so are the full names

  // Bad
  function splitStr()
  ```

Testing/Optimization
--------------------

**TODO:**

- Add some information here about testing/validation/etc.
- Additionally, maybe there should be some benchmark information here,
  something to let a developer know what's "too" slow...? Or general guidelines
  about optimization?

<!-- vim: set ft=markdown sw=4 ts=4 sts=4 et ai: -->
