// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.

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
                Array.forEach(win.frames, function (frame) this._highlighter.highlightDoc(frame, aWord));

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
                        while (child = elem.firstChild)
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
        commandline.open(this._backwards ? "?" : "/", "", mode);
        // TODO: focus the top of the currently visible screen
    },

    // TODO: backwards seems impossible i fear
    /**
     * Searches the current buffer for <b>str</b>.
     *
     * @param {string} str The string to find.
     */
    find: function (str) {
        let fastFind = getBrowser().fastFind;

        this._processUserPattern(str);
        fastFind.caseSensitive = this._caseSensitive;
        this._found = fastFind.find(this._searchString, this._linksOnly) != Ci.nsITypeAheadFind.FIND_NOTFOUND;

        if (!this._found)
            setTimeout(function () liberator.echoerr("E486: Pattern not found: " + this._searchPattern, commandline.FORCE_SINGLELINE), 0);
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
        if (getBrowser().fastFind.searchString != this._lastSearchString)
            this.find(this._lastSearchString);

        let up = reverse ? !this._lastSearchBackwards : this._lastSearchBackwards;
        let result = getBrowser().fastFind.findAgain(up, this._linksOnly);

        if (result == Ci.nsITypeAheadFind.FIND_NOTFOUND)
            liberator.echoerr("E486: Pattern not found: " + this._lastSearchPattern, commandline.FORCE_SINGLELINE);
        else if (result == Ci.nsITypeAheadFind.FIND_WRAPPED) {
            // hack needed, because wrapping causes a "scroll" event which clears
            // our command line
            setTimeout(function () {
                let msg = up ? "search hit TOP, continuing at BOTTOM" : "search hit BOTTOM, continuing at TOP";
                commandline.echo(msg, commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES | commandline.FORCE_SINGLELINE);
            }, 0);
        }
        else {
            commandline.echo((up ? "?" : "/") + this._lastSearchPattern, null, commandline.FORCE_SINGLELINE);

            if (options["hlsearch"])
                this.highlight(this._lastSearchString);
        }
    },

    /**
     * Called when the user types a key in the search dialog. Triggers a
     * search attempt if 'incsearch' is set.
     *
     * @param {string} str The search string.
     */
    onKeyPress: function (str) {
        if (options["incsearch"])
            this.find(str);
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
        if (typeof forcedBackward === "boolean")
            this._backwards = forcedBackward;

        if (str)
            var pattern = str;
        else {
            liberator.assert(this._lastSearchPattern, "E35: No previous search pattern");
            pattern = this._lastSearchPattern;
        }

        this.clear();

        if (!options["incsearch"] || !str || !this._found) {
            // prevent any current match from matching again
            if (!window.content.getSelection().isCollapsed)
                window.content.getSelection().getRangeAt(0).collapse(this._backwards);

            this.find(pattern);
        }

        this._lastSearchBackwards = this._backwards;
        //lastSearchPattern = pattern.replace(backwards ? /\?.*/ : /\/.*/, ""); // XXX
        this._lastSearchPattern = pattern;
        this._lastSearchString = this._searchString;

        // TODO: move to find() when reverse incremental searching is kludged in
        // need to find again for reverse searching
        if (this._backwards)
            setTimeout(function () { finder.findAgain(false); }, 0);

        if (options["hlsearch"])
            this.highlight(this._searchString);

        modes.reset();
    },

    /**
     * Called when the search is canceled. For example, if someone presses
     * <Esc> while typing a search.
     */
    onCancel: function () {
        // TODO: code to reposition the document to the place before search started
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
            getBrowser().fastFind.findAgain(this._backwards, this._linksOnly);

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
    commandline: function () {
        // Event handlers for search - closure is needed
        commandline.registerCallback("change", modes.SEARCH_FORWARD, this.closure.onKeyPress);
        commandline.registerCallback("submit", modes.SEARCH_FORWARD, this.closure.onSubmit);
        commandline.registerCallback("cancel", modes.SEARCH_FORWARD, this.closure.onCancel);
        // TODO: allow advanced myModes in register/triggerCallback
        commandline.registerCallback("change", modes.SEARCH_BACKWARD, this.closure.onKeyPress);
        commandline.registerCallback("submit", modes.SEARCH_BACKWARD, this.closure.onSubmit);
        commandline.registerCallback("cancel", modes.SEARCH_BACKWARD, this.closure.onCancel);

    },
    commands: function () {
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
            "boolean", "false", {
                setter: function (value) {
                    if (value)
                        finder.highlight();
                    else
                        finder.clear();

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
    },
});

const RangeFinder = Module("rangefinder", {
    requires: ["config"],

    init: function () {
    },

    openPrompt: function (mode) {
        let backwards;
        if (mode == modes.FIND_BACKWARD) {
            commandline.open("?", "", modes.FIND_BACKWARD);
            backwards = true;
        }
        else {
            commandline.open("/", "", modes.FIND_FORWARD);
            backwards = false;
        }

        this.find("", backwards);
        // TODO: focus the top of the currently visible screen
    },

    find: function (str, backwards) {
        let caseSensitive = false;
        this.rangeFind = RangeFind(caseSensitive, backwards);

        if (!this.rangeFind.search(searchString))
            setTimeout(function () { liberator.echoerr("E486: Pattern not found: " + searchPattern); }, 0);

        return this.rangeFind.found;
    },

    findAgain: function (reverse) {
        if (!this.rangeFind || !this.rangeFind.search(null, reverse))
            liberator.echoerr("E486: Pattern not found: " + lastSearchPattern);
        else if (this.rangeFind.wrapped) {
            // hack needed, because wrapping causes a "scroll" event which clears
            // our command line
            setTimeout(function () {
                if (rangfinder.rangeFind.backward)
                    commandline.echo("search hit TOP, continuing at BOTTOM",
                        commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES);
                else
                    commandline.echo("search hit BOTTOM, continuing at TOP",
                        commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES);
            }, 0);
        }
        else {
            liberator.echo((this.rangeFind.backward ? "?" : "/") + lastSearchPattern, null, commandline.FORCE_SINGLELINE);

            if (options["hlsearch"])
                this.highlight(this.rangeFind.lastString);
        }
    },

    // Called when the user types a key in the search dialog. Triggers a find attempt if 'incsearch' is set
    onKeyPress: function (command) {
        if (options["incsearch"] && this.rangeFind)
            this.rangeFind.search(command);
    },

    onSubmit: function (command) {
        // use the last pattern if none specified
        if (!command)
            command = lastSearchPattern;

        if (!options["incsearch"] || !this.rangeFind.found) {
            this.clear();
            this.find(command, this.rangeFind.backwards);
        }

        this._lastSearchBackwards = this.rangeFind.backwards;
        this._lastSearchPattern = command;
        this._lastSearchString = command;

        if (options["hlsearch"])
            this.highlight(this.rangeFind.searchString);

        modes.reset();
    },

    // Called when the search is canceled - for example if someone presses
    // escape while typing a search
    onCancel: function () {
        // TODO: code to reposition the document to the place before search started
        if (this.rangeFind)
            this.rangeFind.cancel();
        this.rangeFind = null;
    },

    get rangeFind() tabs.localStore.rangeFind,
    set rangeFind(val) tabs.localStore.rangeFind = val,

    /**
     * Highlights all occurances of <b>str</b> in the buffer.
     *
     * @param {string} str The string to highlight.
     */
    highlight: function (str) {
        return;
    },

    /**
     * Clears all search highlighting.
     */
    clear: function () {
        return;
    }
}, {
}, {
    commandline: function () {
        // Event handlers for search - closure is needed
        commandline.registerCallback("change", modes.FIND_FORWARD, this.closure.onKeyPress);
        commandline.registerCallback("submit", modes.FIND_FORWARD, this.closure.onSubmit);
        commandline.registerCallback("cancel", modes.FIND_FORWARD, this.closure.onCancel);
        // TODO: allow advanced myModes in register/triggerCallback
        commandline.registerCallback("change", modes.FIND_BACKWARD, this.closure.onKeyPress);
        commandline.registerCallback("submit", modes.FIND_BACKWARD, this.closure.onSubmit);
        commandline.registerCallback("cancel", modes.FIND_BACKWARD, this.closure.onCancel);

    },
    commands: function () {
    },
    mappings: function () {
        var myModes = config.browserModes.concat([modes.CARET]);

        mappings.add(myModes,
            ["g/"], "Search forward for a pattern",
            function () { rangefinder.openPrompt(modes.FIND_FORWARD); });

        mappings.add(myModes,
            ["g?"], "Search backwards for a pattern",
            function () { rangefinder.openPrompt(modes.FIND_BACKWARD); });

        mappings.add(myModes,
            ["g."], "Find next",
            function () { rangefinder.findAgain(false); });

        mappings.add(myModes,
            ["g,"], "Find previous",
            function () { rangefinder.findAgain(true); });

        mappings.add(myModes.concat([modes.CARET, modes.TEXTAREA]), ["g*"],
            "Find word under cursor",
            function () {
                rangefinder._found = false;
                rangefinder.onSubmit(buffer.getCurrentWord(), false);
            });

        mappings.add(myModes.concat([modes.CARET, modes.TEXTAREA]), ["g#"],
            "Find word under cursor backwards",
            function () {
                rangefinder._found = false;
                rangefinder.onSubmit(buffer.getCurrentWord(), true);
            });
    },
    modes: function () {
        modes.addMode("FIND_FORWARD", true);
        modes.addMode("FIND_BACKWARD", true);
    },
    options: function () {
    },
});

const RangeFind = Class("RangeFind", {
    init: function (matchCase, backward) {
        this.finder = Components.classes["@mozilla.org/embedcomp/rangefind;1"]
                               .createInstance()
                               .QueryInterface(Components.interfaces.nsIFind);
        this.finder.caseSensitive = matchCase;
        this.matchCase = matchCase;
        this._backward = backward;
        this.sel = buffer.selectionController;
        this.win = content;
        this.doc = content.document;

        this.pageRange = this.doc.createRange();
        this.pageRange.setStartBefore(this.doc.body);
        this.pageRange.setEndAfter(this.doc.body);
        this.pageStart = this.pageRange.cloneRange();
        this.pageEnd = this.pageRange.cloneRange();
        this.pageStart.collapse(true);
        this.pageEnd.collapse(false);

        this.start = Point(this.win.pageXOffset, this.win.pageYOffset);
        this.selection = this.sel.getSelection(this.sel.SELECTION_NORMAL);
        this.startRange = this.selection.rangeCount ? this.selection.getRangeAt(0) : this.pageStart;
        this.startRange.collapse(true);

        this.lastString = "";
        this.lastRange = null;
        this.forward = null;
        this.found = false;
    },

    // This doesn't work yet.
    resetCaret: function () {
        let equal = function (r1, r2) !r1.compareToRange(Range.START_TO_START, r2) && !r1.compareToRange(Range.END_TO_END, r2);
        letselection = this.win.getSelection();
        if (selection.rangeCount == 0)
            selection.addRange(this.pageStart);
        function getLines() {
            let orig = selection.getRangeAt(0);
            function getRanges(forward) {
                selection.removeAllRanges();
                selection.addRange(orig);
                let cur = orig;
                while (true) {
                    var last = cur;
                    this.sel.lineMove(forward, false);
                    cur = selection.getRangeAt(0);
                    if (equal(cur, last))
                        break;
                    yield cur;
                }
            }
            yield orig;
            for (let range in getRanges(true))
                yield range;
            for (let range in getRanges(false))
                yield range;
        }
        for (let range in getLines()) {
            if (this.sel.checkVisibility(range.startContainer, range.startOffset, range.startOffset))
                return range;
        }
        return null;
    },

    get searchString() this.lastString,
    get backward() this.finder.findBackwards,

    search: function (word, reverse) {
        this.finder.findBackwards = reverse ? !this._backward : this._backward;
        let again = word == null;
        if (again)
            word = this.lastString;
        if (!this.matchCase)
            word = word.toLowerCase();

        if (word == "")
            var range = this.startRange;
        else {
            if (this.lastRange) {
                if (again)
                    this.lastRange.collapse(this.backward);
                else if (word.indexOf(this.lastString) != 0 || this.backward)
                    this.lastRange = null;
                else
                    this.lastRange.collapse(true);
            }

            var range = this.finder.Find(word, this.pageRange,
                                          this.lastRange || this.startRange,
                                          this.pageEnd);
        }

        this.lastString = word;
        if (range == null) {
            if (this.wrapped) {
                this.cancel();
                this.found = false;
                return null;
            }
            this.wrapped = true;
            this.lastRange = this.backward ? this.pageEnd : this.pageStart;
            return this.search(again ? null : word, reverse);
        }
        this.wrapped = false;
        this.selection.removeAllRanges();
        this.selection.addRange(range);
        this.sel.scrollSelectionIntoView(this.sel.SELECTION_NORMAL, 0, false);
        this.lastRange = range.cloneRange();
        this.found = true;
        return range;
    },

    cancel: function () {
        this.selection.removeAllRanges();
        this.selection.addRange(this.startRange);
        this.win.scrollTo(this.start.x, this.start.y);
    },
});

// vim: set fdm=marker sw=4 ts=4 et:
