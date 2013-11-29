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
//
// TODO: Clean up this rat's nest. --Kris

/**
 * @instance finder
 */
const Finder = Module("finder", {
    requires: ["config"],

    init: function () {
        const self = this;

        this._found = false;               // true if the last search was successful
        this._backwards = false;           // currently searching backwards
        this._searchString = "";           // current search string (without modifiers)
        this._searchPattern = "";          // current search string (includes modifiers)
        this._lastSearchPattern = "";      // the last searched pattern (includes modifiers)
        this._lastSearchString = "";       // the last searched string (without modifiers)
        this._lastSearchBackwards = false; // like "backwards", but for the last search, so if you cancel a search with <esc> this is not set
        this._caseSensitive = false;       // search string is case sensitive
        this._linksOnly = false;           // search is limited to link text only
    },

    // set searchString, searchPattern, caseSensitive, linksOnly
    _processUserPattern: function (pattern) {
        //// strip off pattern terminator and offset
        //if (backwards)
        //    pattern = pattern.replace(/\?.*/, "");
        //else
        //    pattern = pattern.replace(/\/.*/, "");

        this._searchPattern = pattern;

        // links only search - \l wins if both modifiers specified
        if (/\\l/.test(pattern))
            this._linksOnly = true;
        else if (/\L/.test(pattern))
            this._linksOnly = false;
        else if (options["linksearch"])
            this._linksOnly = true;
        else
            this._linksOnly = false;

        // strip links-only modifiers
        pattern = pattern.replace(/(\\)?\\[lL]/g, function ($0, $1) { return $1 ? $0 : ""; });

        // case sensitivity - \c wins if both modifiers specified
        if (/\c/.test(pattern))
            this._caseSensitive = false;
        else if (/\C/.test(pattern))
            this._caseSensitive = true;
        else if (options["ignorecase"] && options["smartcase"] && /[A-Z]/.test(pattern))
            this._caseSensitive = true;
        else if (options["ignorecase"])
            this._caseSensitive = false;
        else
            this._caseSensitive = true;

        // strip case-sensitive modifiers
        pattern = pattern.replace(/(\\)?\\[cC]/g, function ($0, $1) { return $1 ? $0 : ""; });

        // remove any modifier escape \
        pattern = pattern.replace(/\\(\\[cClL])/g, "$1");

        this._searchString = pattern;
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
            onChange: function() { if (options["incsearch"]) finder.find(commandline.command) }
        
        });
        //modes.extended = mode;

        // TODO: focus the top of the currently visible screen
    },

    // TODO: backwards seems impossible i fear
    /**
     * Searches the current buffer for <b>str</b>.
     *
     * @param {string} str The string to find.
     * @see Bug537013 https://bugzilla.mozilla.org/show_bug.cgi?id=537013
     */
    find: Services.vc.compare(Services.appinfo.version, "25.0") >= 0 ?
    function (str) {
        let fastFind = config.browser.getFindBar();
        this._processUserPattern(str);
        fastFind._typeAheadCaseSensitive = this._caseSensitive;
        fastFind._typeAheadLinksOnly = this._linksOnly;
        let result = fastFind._find(str);
    } :
    // FIXME: remove when minVersion >= 25
    function (str) {
        let fastFind = config.browser.fastFind;

        this._processUserPattern(str);
        fastFind.caseSensitive = this._caseSensitive;
        let result = fastFind.find(this._searchString, this._linksOnly);
        this._displayFindResult(result, this._backwards);
    },

    /**
     * Searches the current buffer again for the most recently used search
     * string.
     *
     * @param {boolean} reverse Whether to search forwards or backwards.
     * @default false
     * @see Bug537013 https://bugzilla.mozilla.org/show_bug.cgi?id=537013
     */
    findAgain: Services.vc.compare(Services.appinfo.version, "25.0") >= 0 ?
    function (reverse) {
        let fastFind = config.browser.getFindBar();
        if (fastFind._findField.value != this._lastSearchString)
            this.find(this._lastSearchString);

        let backwards = reverse ? !this._lastSearchBackwards : this._lastSearchBackwards;
        fastFind._typeAheadLinksOnly = this._linksOnly;
        let result = fastFind._findAgain(backwards);
        this._displayFindResult(result, backwards);
    } :
    // FIXME: remove when minVersion >= 25
    function (reverse) {
        // This hack is needed to make n/N work with the correct string, if
        // we typed /foo<esc> after the original search.  Since searchString is
        // readonly we have to call find() again to update it.
        if (config.browser.fastFind.searchString != this._lastSearchString)
            this.find(this._lastSearchString);

        let backwards = reverse ? !this._lastSearchBackwards : this._lastSearchBackwards;
        let result = config.browser.fastFind.findAgain(backwards, this._linksOnly);
        this._displayFindResult(result, backwards);

    },

    _displayFindResult: function(result, backwards) {
        if (result == Ci.nsITypeAheadFind.FIND_NOTFOUND) {
            liberator.echoerr("Pattern not found: " + this._searchString, commandline.FORCE_SINGLELINE);
        }
        else if (result == Ci.nsITypeAheadFind.FIND_WRAPPED) {
            let msg = backwards ? "Search hit TOP, continuing at BOTTOM" : "Search hit BOTTOM, continuing at TOP";
            commandline.echo(msg, commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES | commandline.FORCE_SINGLELINE);
        }
        else {
            liberator.echomsg("Found pattern: " + this._searchString);
        }
    },


    /**
     * Called when the user types a key in the search dialog. Triggers a
     * search attempt if 'incsearch' is set.
     *
     * @param {string} str The search string.
     */
    /*onKeyPress: function (str) {
        if (options["incsearch"])
            this.find(str);
        },*/

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
        if (typeof forcedBackward === "boolean")
            this._backwards = forcedBackward;

        if (str)
            var pattern = str;
        else {
            liberator.assert(this._lastSearchPattern, "No previous search pattern");
            pattern = this._lastSearchPattern;
        }

        this.clear();

        // liberator.log('inc: ' + options["incsearch"] + ' sea:' + this._searchPattern + ' pat:' + pattern);
        if (!options["incsearch"] /*|| !str || !this._found */|| this._searchPattern != pattern) {
            // prevent any current match from matching again
            if (!window.content.getSelection().isCollapsed)
                window.content.getSelection().getRangeAt(0).collapse(this._backwards);

            this.find(pattern);
        }

        // focus links after searching, so the user can just hit <Enter> another time to follow the link
        // This has to be done async, because the mode reset after onSubmit would
        // clear the focus 
        let elem = Services.vc.compare(Services.appinfo.version, "25.0") >= 0 ?
                    config.browser.getFindBar()._foundLinkRef.get() :
                    config.browser.fastFind.foundLink; // FIXME: remove when minVersion >= 25
        this.setTimeout(function() {
            if (elem)
                elem.focus();
                // fm.moveFocus(elem.ownerDocument.defaultView, null, Ci.nsIFocusManager.MOVEFOCUS_CARET, Ci.nsIFocusManager.FLAG_NOSCROLL);*/
        }, 0);

        this._lastSearchBackwards = this._backwards;
        this._lastSearchPattern = pattern;
        this._lastSearchString = this._searchString;

        // TODO: move to find() when reverse incremental searching is kludged in
        // need to find again for reverse searching
        if (this._backwards)
            this.setTimeout(function () { this.findAgain(false); }, 0);

        if (options["hlsearch"])
            this.highlight(this._searchString);
    },

    /**
     * Highlights all occurances of <b>str</b> in the buffer.
     *
     * @param {string} str The string to highlight.
     */
    highlight: function (str) {
        // FIXME: Thunderbird incompatible
        if (config.name == "Muttator")
            return;

        if (window.gFindBar) {
            window.gFindBar._setCaseSensitivity(this._caseSensitive);
            window.gFindBar._highlightDoc(false);
            window.gFindBar._highlightDoc(true, str);
        }
    },

    /**
     * Clears all search highlighting.
     */
    clear: function () {
        // FIXME: Thunderbird incompatible
        if (config.name == "Muttator")
            return;

        if (window.gFindBar)
            window.gFindBar._highlightDoc(false);
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
                this._found = false;
                finder.onSubmit(buffer.getCurrentWord(), false);
            });

        mappings.add(myModes.concat([modes.CARET, modes.TEXTAREA]), ["#"],
            "Find word under cursor backwards",
            function () {
                this._found = false;
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
            "boolean", true);

        options.add(["incsearch", "is"],
            "Show where the search pattern matches as it is typed",
            "boolean", true);

        options.add(["linksearch", "lks"],
            "Limit the search to hyperlink text",
            "boolean", false);

        options.add(["smartcase", "scs"],
            "Override the 'ignorecase' option if the pattern contains uppercase characters",
            "boolean", true);
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
