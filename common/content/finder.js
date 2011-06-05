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

        /* Stolen from toolkit.jar in Firefox, for the time being. The private
         * methods were unstable, and changed. The new version is not remotely
         * compatible with what we do.
         *   The following only applies to this object, and may not be
         * necessary, or accurate, but, just in case:
         *   The Original Code is mozilla.org viewsource frontend.
         *
         *   The Initial Developer of the Original Code is
         *   Netscape Communications Corporation.
         *   Portions created by the Initial Developer are Copyright (c) 2003
         *   by the Initial Developer. All Rights Reserved.
         *
         *   Contributor(s):
         *       Blake Ross <blake@cs.stanford.edu> (Original Author)
         *       Masayuki Nakano <masayuki@d-toybox.com>
         *       Ben Basson <contact@cusser.net>
         *       Jason Barnabe <jason_barnabe@fastmail.fm>
         *       Asaf Romano <mano@mozilla.com>
         *       Ehsan Akhgari <ehsan.akhgari@gmail.com>
         *       Graeme McCutcheon <graememcc_firefox@graeme-online.co.uk>
         */
        this._highlighter = {

            doc: null,

            spans: [],

            search: function (aWord, matchCase) {
                var finder = services.create("find");
                if (matchCase !== undefined)
                    self._caseSensitive = matchCase;

                var range;
                while ((range = finder.Find(aWord, this.searchRange, this.startPt, this.endPt)))
                    yield range;
            },

            highlightDoc: function highlightDoc(win, aWord) {
                this.doc = content.document; // XXX
                Array.forEach(win.frames, function (frame) this.highlightDoc(frame, aWord), this);

                var doc = win.document;
                if (!doc || !(doc instanceof HTMLDocument))
                    return;

                if (!aWord) {
                    let elems = this._highlighter.spans;
                    for (let i = elems.length; --i >= 0;) {
                        let elem = elems[i];
                        let docfrag = doc.createDocumentFragment();
                        let next = elem.nextSibling;
                        let parent = elem.parentNode;

                        let child;
                        while ((child = elem.firstChild))
                            docfrag.appendChild(child);

                        parent.removeChild(elem);
                        parent.insertBefore(docfrag, next);
                        parent.normalize();
                    }
                    return;
                }

                var baseNode = <span highlight="Search"/>;
                baseNode = util.xmlToDom(baseNode, window.content.document);

                var body = doc.body;
                var count = body.childNodes.length;
                this.searchRange = doc.createRange();
                this.startPt = doc.createRange();
                this.endPt = doc.createRange();

                this.searchRange.setStart(body, 0);
                this.searchRange.setEnd(body, count);

                this.startPt.setStart(body, 0);
                this.startPt.setEnd(body, 0);
                this.endPt.setStart(body, count);
                this.endPt.setEnd(body, count);

                liberator.interrupted = false;
                let n = 0;
                for (let retRange in this.search(aWord, this._caseSensitive)) {
                    // Highlight
                    var nodeSurround = baseNode.cloneNode(true);
                    var node = this.highlight(retRange, nodeSurround);
                    this.startPt = node.ownerDocument.createRange();
                    this.startPt.setStart(node, node.childNodes.length);
                    this.startPt.setEnd(node, node.childNodes.length);
                    if (n++ % 20 == 0)
                        liberator.threadYield(true);
                    if (liberator.interrupted)
                        break;
                }
            },

            highlight: function highlight(aRange, aNode) {
                var startContainer = aRange.startContainer;
                var startOffset = aRange.startOffset;
                var endOffset = aRange.endOffset;
                var docfrag = aRange.extractContents();
                var before = startContainer.splitText(startOffset);
                var parent = before.parentNode;
                aNode.appendChild(docfrag);
                parent.insertBefore(aNode, before);
                this.spans.push(aNode);
                return aNode;
            },

            /**
             * Clears all search highlighting.
             */
            clear: function () {
                this.spans.forEach(function (span) {
                    if (span.parentNode) {
                        let el = span.firstChild;
                        while (el) {
                            span.removeChild(el);
                            span.parentNode.insertBefore(el, span);
                            el = span.firstChild;
                        }
                        span.parentNode.removeChild(span);
                    }
                });
                this.spans = [];
            },

            isHighlighted: function (doc) this.doc == doc && this.spans.length > 0
        };
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
     */
    find: function (str) {
        let fastFind = config.browser.fastFind;

        this._processUserPattern(str);
        fastFind.caseSensitive = this._caseSensitive;
        let result = fastFind.find(this._searchString, this._linksOnly);
        this._displayFindResult(result);
    },

    /**
     * Searches the current buffer again for the most recently used search
     * string.
     *
     * @param {boolean} reverse Whether to search forwards or backwards.
     * @default false
     */
    findAgain: function (reverse) {
        // This hack is needed to make n/N work with the correct string, if
        // we typed /foo<esc> after the original search.  Since searchString is
        // readonly we have to call find() again to update it.
        if (config.browser.fastFind.searchString != this._lastSearchString)
            this.find(this._lastSearchString);

        let backwards = reverse ? !this._lastSearchBackwards : this._lastSearchBackwards;
        let result = config.browser.fastFind.findAgain(backwards, this._linksOnly);
        this._displayFindResult(result);

    },

    _displayFindResult: function(result, backwards) {
        if (result == Ci.nsITypeAheadFind.FIND_NOTFOUND) {
            liberator.echoerr("Pattern not found: " + this._searchString, commandline.FORCE_SINGLELINE);
        }
        else if (result == Ci.nsITypeAheadFind.FIND_WRAPPED) {
            // FIXME: Always prints BOTTOM -> TOP
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
        let elem = config.browser.fastFind.foundLink;
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

        if (this._highlighter.isHighlighted(content.document))
            return;

        if (!str)
            str = this._lastSearchString;

        this._highlighter.highlightDoc(window.content, str);

        // recreate selection since highlightDoc collapses the selection
        if (window.content.getSelection().isCollapsed)
            config.browser.fastFind.findAgain(this._backwards, this._linksOnly);

        // TODO: remove highlighting from non-link matches (HTML - A/AREA with href attribute; XML - Xlink [type="simple"])
    },

    /**
     * Clears all search highlighting.
     */
    clear: function () {
        this._highlighter.clear();
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
            "boolean", false, {
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
