// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/** @scope modules */

// TODO: proper backwards search - implement our own component?
//     : implement our own highlighter?
//     : <ESC> should cancel search highlighting in 'incsearch' mode and jump
//       back to the presearch page location - can probably use the same
//       solution as marks
//     : 'linksearch' searches should highlight link matches only
//     : changing any search settings should also update the search state including highlighting
//     : incremental searches shouldn't permanently update search modifiers

// NOTE: (by Quicksaver) please don't do any of the above TODOs. Right now the findbar is
// not only per-tab, but it is also completely asynchronous to allow for proper behavior in e10s.
// Because of that, it's better to have Vimperator be more of a mediator between the user
// and the findbar (using its methods, keeping in sync with it, etc), than implementing any
// components itself.

/**
 * @instance finder
 */
var Finder = Module("finder", {
    requires: ["config"],

    init: function () {
        this._backwards = false;           // currently searching backwards
        this._searchPattern = "";          // current search string (includes modifiers)
        this._lastSearchPattern = "";      // the last searched pattern (includes modifiers)
    },

    get findbar () {
        return (config.name == "Muttator") ? document.getElementById('FindToolbar') : window.gFindBar;
    },

    get findbarInitialized () {
        return (config.name == "Muttator") || window.gFindBarInitialized;
    },

    // set searchString, searchPattern, caseSensitive, linksOnly
    _processUserPattern: function (pattern) {
        //// strip off pattern terminator and offset
        //if (backwards)
        //    pattern = pattern.replace(/\?.*/, "");
        //else
        //    pattern = pattern.replace(/\/.*/, "");

        this._searchPattern = pattern;
        let findbar = this.findbar;

        // links only search - \l wins if both modifiers specified
        let fm = findbar._findMode;
        if (/\\l/.test(pattern))
            fm = findbar.FIND_LINKS;
        else if (/\\L/.test(pattern))
            fm = findbar.FIND_NORMAL;
        else if (options["linksearch"])
            fm = findbar.FIND_LINKS;
        else
            fm = findbar.FIND_NORMAL;
        this.updateFindMode(fm);

        // strip links-only modifiers
        pattern = pattern.replace(/(\\)?\\[lL]/g, function ($0, $1) { return $1 ? $0 : ""; });

        // case sensitivity - \c wins if both modifiers specified
        let cs = findbar._typeAheadCaseSensitive;
        if (/\\c/.test(pattern))
            cs = false;
        else if (/\\C/.test(pattern))
            cs = true;
        else if (options["ignorecase"] && options["smartcase"] && /[A-Z]/.test(pattern))
            cs = true;
        else if (options["ignorecase"])
            cs = false;
        else
            cs = true;
        this.updateCaseSensitive(cs);

        // strip case-sensitive modifiers
        pattern = pattern.replace(/(\\)?\\[cC]/g, function ($0, $1) { return $1 ? $0 : ""; });

        // remove any modifier escape \
        pattern = pattern.replace(/\\(\\[cClL])/g, "$1");

        findbar._findField.value = pattern;
    },

    /**
     * Called when the search dialog is requested.
     *
     * @param {number} mode The search mode, either modes.SEARCH_FORWARD or
     *     modes.SEARCH_BACKWARD.
     * @default modes.SEARCH_FORWARD
     */
    openPrompt: function (mode) {
        this._backwards = mode == modes.SEARCH_BACKWARD;
        //commandline.open(this._backwards ? "Find backwards" : "Find", "", mode);
        commandline.input(this._backwards ? "Find backwards" : "Find", this.closure.onSubmit, {
            onChange: function() {
                if (options["incsearch"] && !commandline._isIMEComposing) {
                    finder.find(commandline.command);
                }
            }
        });
        //modes.extended = mode;

        // TODO: focus the top of the currently visible screen
    },

    /**
     * Searches the current buffer for <b>str</b>.
     *
     * @param {string} str The string to find.
     */
    find: function (str) {
        this._processUserPattern(str);

        let findbar = this.findbar;
        if (!findbar.vimperated) {
            findbar.vimperated = true;

            // Make sure we're listening for the result, so that we show it on the prompt later.
            findbar.browser.finder.addResultListener(this);

            // PDF.JS files are different, they use their own messages to communicate the results.
            // So we piggyback the end changes to the findbar when there are any.
            findbar._vimpbackup_updateControlState = findbar.updateControlState;
            findbar.updateControlState = function(aResult, aFindPrevious) {
                this._vimpbackup_updateControlState(aResult, aFindPrevious);
                finder.onFindResult({
                    searchString: this._findField.value,
                    result: aResult,
                    findBackwards: aFindPrevious
                });
            };

            // Normally the findbar appears to notify on failed results.
            // However, this shouldn't happen when we're finding through the command line,
            // even though that way we lose any kind of no matches notification until we
            // stop typing altogether; something to work on at a later time:
            // - show the quick findbar which will hide after a few seconds?
            // - or notify the user somehow in the command line itself?
            findbar._vimpbackup_open = findbar.open;
            findbar.open = function (aMode) {
                if (commandline._keepOpenForInput) { return false; }
                return this._vimpbackup_open(aMode);
            };
        }

        findbar._find();
    },

    /**
     * Searches the current buffer again for the most recently used search
     * string.
     *
     * @param {boolean} reverse Whether to search forwards or backwards.
     * @default false
     * @see Bug537013 https://bugzilla.mozilla.org/show_bug.cgi?id=537013
     */
    findAgain: function (reverse) {
        // Nothing to find?
        if (!this.findbarInitialized || !this.findbar._findField.value)
            return;

        this.findbar.onFindAgainCommand(reverse);
    },

    /**
     * Updates the status line with the result from the find operation;
     * this is done aSync from the main (input) process.
     */
    onFindResult: function(aData) {
        if (aData.result == Ci.nsITypeAheadFind.FIND_NOTFOUND) {
            liberator.echoerr("Pattern not found: " + aData.searchString, commandline.FORCE_SINGLELINE);
        }
        else if (aData.result == Ci.nsITypeAheadFind.FIND_WRAPPED) {
            let msg = aData.findBackwards ? "Search hit TOP, continuing at BOTTOM" : "Search hit BOTTOM, continuing at TOP";
            commandline.echo(msg, commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES | commandline.FORCE_SINGLELINE);
        }
        else {
            liberator.echomsg("Found pattern: " + aData.searchString);
        }
    },

    /**
     * Called when the <Enter> key is pressed to trigger a search.
     *
     * @param {string} str The search string.
     * @param {boolean} forcedBackward Whether to search forwards or
     *     backwards. This overrides the direction set in
     *     (@link #openPrompt).
     * @default false
     */
    onSubmit: function (str, forcedBackward) {
        let findbar = this.findbar;

        if (typeof forcedBackward === "boolean")
            this._backwards = forcedBackward;

        let pattern;
        if (str)
            pattern = str;
        else {
            liberator.assert(this._lastSearchPattern, "No previous search pattern");
            pattern = this._lastSearchPattern;
        }

        // liberator.log('inc: ' + options["incsearch"] + ' sea:' + this._searchPattern + ' pat:' + pattern);
        if (!options["incsearch"] || this._searchPattern != pattern) {
            this.find(pattern);
        }

        this._lastSearchPattern = pattern;

        // TODO: move to find() when reverse incremental searching is kludged in
        // need to find again for reverse searching
        if (this._backwards)
            this.findAgain(true);

        if (options["hlsearch"])
            this.highlight(findbar._findField.value);
    },

    /**
     * Highlights all occurances of <b>str</b> in the buffer.
     *
     * @param {string} str The string to highlight.
     */
    highlight: function (str) {
        let findbar = this.findbar;

        let btn = findbar.getElement("highlight");
        btn.checked = true;

        findbar._setHighlightTimeout();
    },

    /**
     * Clears all search highlighting.
     */
    clear: function () {
        if (!this.findbarInitialized)
            return;

        let findbar = this.findbar;

        let btn = findbar.getElement("highlight");
        btn.checked = false;

        findbar.toggleHighlight(false);
    },

    /**
     * Updates the case sensitivity parameter.
     */
    updateCaseSensitive: function (cs) {
        let findbar = this.findbar;
        if (cs != findbar._typeAheadCaseSensitive) {
            findbar._setCaseSensitivity(cs);
        }
    },

    /**
     * Updates the find mode to show only matches in links or all matches.
     */
    updateFindMode: function (fm) {
        let findbar = this.findbar;

        // We need to pretend like we're opening the findbar with a different mode,
        // but not actually do it.
        if (fm != findbar._findMode) {
            findbar._findMode = fm;
            findbar._findFailedString = null;
            if(!findbar.hidden) {
                findbar._updateFindUI();
            }
        }
    }
}, {
}, {
    commands: function () {
        // TODO: Remove in favor of :set nohlsearch?
        commands.add(["noh[lsearch]"],
            "Remove the search highlighting",
            function () { finder.clear(); },
            { argCount: "0" });
    },
    mappings: function () {
        var myModes = config.browserModes;
        myModes = myModes.concat([modes.CARET]);

        mappings.add(myModes,
            ["/"], "Search forward for a pattern",
            function () { finder.openPrompt(modes.SEARCH_FORWARD); });

        mappings.add(myModes,
            ["?"], "Search backwards for a pattern",
            function () { finder.openPrompt(modes.SEARCH_BACKWARD); });

        mappings.add(myModes,
            ["n"], "Find next",
            function () { finder.findAgain(false); });

        mappings.add(myModes,
            ["N"], "Find previous",
            function () { finder.findAgain(true); });

        mappings.add(myModes.concat([modes.CARET, modes.TEXTAREA]), ["*"],
            "Find word under cursor",
            function () {
                finder.onSubmit(buffer.getCurrentWord(), false);
            });

        mappings.add(myModes.concat([modes.CARET, modes.TEXTAREA]), ["#"],
            "Find word under cursor backwards",
            function () {
                finder.onSubmit(buffer.getCurrentWord(), true);
            });
    },
    options: function () {
        options.add(["hlsearch", "hls"],
            "Highlight previous search pattern matches",
            "boolean", true, {
                setter: function (value) {
                    try {
                        if (value)
                            finder.highlight();
                        else
                            finder.clear();
                    }
                    catch (e) {}

                    return value;
                }
            });

        options.add(["ignorecase", "ic"],
            "Ignore case in search patterns",
            "boolean", true, {
                setter: function (value) {
                    try {
                        finder.updateCaseSensitive(!value);
                    }
                    catch (e) {}

                    return value;
                }
            });

        options.add(["incsearch", "is"],
            "Show where the search pattern matches as it is typed",
            "boolean", true);

        options.add(["linksearch", "lks"],
            "Limit the search to hyperlink text",
            "boolean", false, {
                setter: function (value) {
                    try {
                        let findbar = finder.findbar;
                        let fm = (value) ? findbar.FIND_LINKS : findbar.FIND_NORMAL;
                        finder.updateFindMode(fm);
                    }
                    catch (e) {}

                    return value;
                }
            });

        options.add(["smartcase", "scs"],
            "Override the 'ignorecase' option if the pattern contains uppercase characters",
            "boolean", true);
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
