Vimperator-labs
===============

[![amo release][amo_version]][amo_release]
[![github release][github_version]][github_release]

**Make Firefox/Thunderbird look and behave like Vim**

> **To beginners**: Welcome to the Vimperator-labs!  
> This README isn't written usage and help for the add-on itself.
> Try `:help` command after installing add-on for details.

End of Life and Alternatives
----------------------------

Vimperator will stop working in up-to-date copies of Firefox with the release of Firefox 57 on November 14th due to a large breaking change in how extensions and add-ons are written ([#705](https://github.com/vimperator/vimperator-labs/issues/705)).

It's not all doom and gloom, though! Here are your options ([#729](https://github.com/vimperator/vimperator-labs/issues/729)):

 - Stay with vimperator, but use an older release of Firefox or a Firefox fork
    - The [Extended Service Release (ESR) of Firefox](https://www.mozilla.org/en-US/firefox/organizations/) is still on Firefox 52 and will be vimperator compatible [until May 2018](https://wiki.mozilla.org/RapidRelease/Calendar).
    - [Waterfox](https://www.waterfoxproject.org/) is a firefox fork that merges security patches and intends to maintain compatibility with XPCOM/XUL plugins like vimperator. Note that Firefox is due to undergo rapid internal change and that waterfox will be more and more on their own as time goes on.

 - Use an add-on compatible with the new webextension API
    - It is not currently possible to match the vimperator feature list in a WebExtension. Some work is being done to rectify this[[1]](https://github.com/cmcaine/keyboard-api)[[2]](https://github.com/Koushien/keyboard-shortcut-api)
    - [cVim](https://github.com/1995eaton/chromium-vim) (Chrome/Chromium only) - features regex search, commandline with completion, autocmds (via `site` in the config), custom commands through javascript eval
    - [Tridactyl](https://github.com/cmcaine/tridactyl) (Firefox only) - aims to eventually match the vimperator experience with working beta versions currently available on [AMO](https://addons.mozilla.org/en-US/firefox/addon/tridactyl-vim/)

 - Use a less fully-featured add-on compatible with the new WebExtension API
    - These add-ons provide great, configurable, vim-like shortcuts and hints mode
    - By design they do not offer insert or command mode, custom commands, autocmds, vim-style maps and so on
    - [Vimium](https://addons.mozilla.org/en-US/firefox/addon/vimium-ff/) - "The Hacker's Browser. Vimium provides keyboard shortcuts for navigation and control in the spirit of Vim."
    - [Saka-key](https://key.saka.io/) - "Put away your mouse. Saka Key lets you control your browser with keyboard shortcuts."
    - [Vim Vixen](https://addons.mozilla.org/en-US/firefox/addon/vim-vixen/) - "An add-on which allows you to navigate with vim-like bindings."

 - Surrender your other add-ons and use a browser with built-in vim bindings
    - Tabbed
        - [Qutebrowser](https://www.qutebrowser.org/) - "A keyboard-driven, vim-like browser based on PyQt5 and Qt."
        - [Luakit](https://luakit.github.io/) - "A fast, simple to use micro-browser framework extensible by Lua using the WebKit engine and the GTK+ toolkit."
    - Not tabbed (Use a tabbed window manager or something that supports XEmbed)
        - [vimb](https://fanglingsu.github.io/vimb/) - "A fast and lightweight vim-like web browser based on the webkit engine and the GTK toolkit."
        - [surf](https://surf.suckless.org/) - "A simple web browser based on WebKit2/GTK+."
        - [uzbl](https://www.uzbl.org/) - "A web browser that adheres to the unix philosophy."

Muttator is not affected by these changes.

Description
-----------

See also [Home page][homepage].

Writing efficient user interfaces is the main maxim, here at Vimperator labs.
We often follow the Vim way of doing things, but extend its principles when
necessary.  
Towards this end, we've created the liberator library for Mozilla based
applications, to encapsulate as many of these generic principles as possible,
and liberate developers from the tedium of reinventing the wheel.

Currently, these applications are using this library:

### Vimperator

Vimperator, the flagship project from Vimperator labs, creates a Vim-like
Firefox.

Vimperator is a Firefox browser extension with strong inspiration from the Vim
text editor, with a mind towards faster and more efficient browsing.  It has
similar key bindings and you could call it a modal web browser, as key bindings
differ according to which mode you are in. For example, it has a special Hint
mode, where you can follow links easily with the keyboard only.  Also most
functionality is available as commands, typing `:back` will go back within the
current page history, just like hitting the back button in the toolbar.

### Muttator

Muttator is to Thunderbird what Vimperator is to Firefox. Combines the best
aspects of Vim and Mutt.

Muttator is a free add-on for the Thunderbird mail client, which makes it look
and behave like the Vim text editor. It has similar key bindings and you could
call it a modal mail client, as key bindings differ according to which mode you
are in. For example, it the same keys can select the next message while the
message list has focus or can scroll down an existing message when the message
preview is selected. It also adds commands for accessing most Thunderbird
functionality. E.g., `:contact -lastname "Vimperator" vimperator@mozdev.org`
will add Vimperator's mailing list to your address book.

Features (Vimperator)
---------------------

- Vim-like keybindings (`h`, `j`, `k`, `l`, `gg`, `G`, `0`, `$`, `ZZ`, etc.)
- Ex commands (`:quit`, `:open www.foo.com`, ...)
- Tab completion available for all commands with support for 'longest' matching
  when set in 'wildmode'
- Extensions! Yes, you can extend Vimperator's functionality with scripts just
  like you can extend Firefox with extensions
- Explore JavaScript objects with `:echo window` and even context-sensitive tab
  completion
- Hit-a-hint like navigation of links (start with `f` to follow a link)
- Advanced completion of bookmark and history URLs (searching also in title,
  not only URL)
- Vim-like statusline with a wget-like progress bar
- Minimal GUI (easily hide useless menubar and toolbar with `:set gui=`)
- Ability to `:source` JavaScript files, and to use a `~/.vimperatorrc` file
- Easy quick searches (`:open foo` will search for "foo" in google, `:open ebay
  terminator` will search for "terminator" on ebay) with support for Firefox
  keyword bookmarks and search engines
- Count supported for many commands (`3<C-o>` will go back 3 pages)
- Beep on errors
- Marks support (`ma` to set mark 'a' on a webpage, `'a` to go there)
- QuickMarks support (quickly go to previously marked web pages with
  `go{a-zA-Z0-9}`)
- `:map` and `:command` support (and `feedkeys()` for script writers)
- `:time` support for profiling
- Move the text cursor and select text with vim keys and a visual mode
- External editor support
- Macros to replay key strokes
- AutoCommands to execute action on certain events
- A comprehensive `:help`, explaining all commands, mappings and options
- Much more...

Installation (Vimperator)
-------------------------

> Note that Vimperator doesn't support multi-process aka
> [Electrolysis][wiki_e10s] (e10s), it's necessary to disable e10s to use the
> add-on.

- Download **signed** add-on from addons.mozilla.org (AMO) <sup>1</sup>

  1. Enter [Add-ons page][amo_release].
  2. Click `Continue to Download` button.
  3. Click `Add to Firefox` button.

- Download **unsigned** <sup>2</sup> add-on from github.com (Github)

  1. Enter [Releases page][github_release].
  2. Click `vimperator-3.N.N.xpi` link under Downloads topic.

- Build own version (and signing)
  See [Build own version](#build-own-version) topic.

> <sup>1</sup> If the version on [AMO][amo_release] is older than the [latest
> release][github_release], you can build your own version and use it until AMO
> release is updated.

> <sup>2</sup> Since version 48, installing add-on to Firefox has required
> signing. Unsigned add-on is for Unbranded Builds. See [mozilla
> wiki][wiki_signing].

Build own version
-----------------

### Unsigned (for Unbranded Builds)

See http://www.vimperator.org/developer_info.

### Signed (for Firefox 48+)

Instructions for building this can be found in
vimperator/private.properties.in. See also [MDN document][mdn_signing]
(developer.mozilla.org) for details about signing and distribution.

There are necessary four steps to use own version.

1. Prepare "AMO API key" and "jpm" if first time
2. Build unsigned add-on
3. Submit unsigned add-on to AMO
4. Install signed add-on to Firefox
5. Addition: Use Command-line interface (CLI) to build and submit

#### Prepare AMO API key and jpm

- [AMO API key][amo_api_key] (require Firefox Account)
- [jpm][jpm_repo] (require node.js):

  ```bash
  npm install -g jpm
  ```

#### Build unsigned add-on

Clone repository and create private.properties:

```bash
git clone https://github.com/vimperator/vimperator-labs.git
cd vimperator-labs/vimperator
cp private.properties.in private.properties
```

Then edit private.properties so that it looks something like:

```makefile
VERSION       := $(VERSION).$(shell date '+%Y%m%d%H%M%S')
UUID           = vimperator@<uniqueid> # e.g. vimperator@<yourdomain>
AMO_API_KEY    = <your API key> # AKA "Issuer"
AMO_API_SECRET = <your API secret>
UPDATE_URL     =
UPDATE_URL_XPI =
```

Then run:

```bash
make xpi
```

The unsigned XPI should appear in
`../downloads/vimperator-3.N.N.yyyymmddhhmmss.xpi`.

#### Submit unsigned add-on to AMO

<table>
<tr>
  <th>Have you ever submitted own version to AMO?</th><th>How to submit</th>
</tr>
<tr>
  <td>No, I'd like to register own version.</td>
  <td>Enter <a
  href="https://addons.mozilla.org/en-US/developers/addon/submit/distribution">
  How to Distribute this Version</a>, upload the XPI selecting <code>On your
  own</code> button.
  </td>
</tr>
<tr>
  <td>Yes, I'd like to update own version.</td>
  <td>Enter <a href="https://addons.mozilla.org/en-US/developers/addons">
  Manage My Submissions</a>, upload the XPI from your Vimperator's <code>New
  Version</code> link.
  </td>
</tr>
</table>

Then the validation starts. Finally, automatically validation XPI finishes,
click `Sign add-on` button to sign.

#### Install signed add-on to Firefox

Install it via the link in your AMO developer account (find your Vimperator's
`Manage Status & Versions`). The new UUID makes it a new add-on, so don't
forget to disable the old version.

#### Use CLI to build and submit

After once you signed the add-on, you are able to update the add-on using CLI.

```bash
cd vimperator-labs/vimperator
make sign
```

Contributing
------------

**Vimperator is in need of collaborators! Help bring vimperator into the age
of e10s!**

Please check existing issues for similar issues before opening a new issue.
See [CONTIRIBUTING.md][contributing] for details.

License
-------

Vimperator-labs is released under the MIT license, see [License.txt][license].

Links                | URL
---------------------|---------------------------------------------------------
Home page            | http://www.vimperator.org/
Add-ons (Vimperator) | https://addons.mozilla.org/en-US/firefox/addon/vimperator/
Add-ons (Muttator)   | https://addons.mozilla.org/en-US/firefox/addon/muttator/
Github repository    | https://github.com/vimperator/vimperator-labs/

<!-- References -->
[amo_version]: https://img.shields.io/amo/v/vimperator.svg
[amo_release]: https://addons.mozilla.org/en-US/firefox/addon/vimperator/
[github_version]: https://img.shields.io/github/release/vimperator/vimperator-labs.svg
[github_release]: https://github.com/vimperator/vimperator-labs/releases/latest
[homepage]: http://www.vimperator.org/
[wiki_e10s]: https://wiki.mozilla.org/Electrolysis
[wiki_signing]: https://wiki.mozilla.org/Add-ons/Extension_Signing
[mdn_signing]: https://developer.mozilla.org/en-US/Add-ons/Distribution
[amo_api_key]: https://addons.mozilla.org/en-US/developers/addon/api/key/
[jpm_repo]: https://github.com/mozilla-jetpack/jpm
[contributing]: https://github.com/vimperator/vimperator-labs/blob/master/CONTRIBUTING.md
[license]: https://github.com/vimperator/vimperator-labs/blob/master/License.txt

<!-- vim: set ft=markdown sw=4 ts=4 sts=4 et ai: -->
