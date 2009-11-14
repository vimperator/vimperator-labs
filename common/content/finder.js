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
        let fastFind = config.browser.fastFind;

        this._processUserPattern(str);
        fastFind.caseSensitive = this._caseSensitive;
        this._found = fastFind.find(this._searchString, this._linksOnly) != Ci.nsITypeAheadFind.FIND_NOTFOUND;

        if (!this._found)
            this.setTimeout(function () liberator.echoerr("E486: Pattern not found: " + this._searchPattern, commandline.FORCE_SINGLELINE), 0);
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

        let up = reverse ? !this._lastSearchBackwards : this._lastSearchBackwards;
        let result = config.browser.fastFind.findAgain(up, this._linksOnly);

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
            this.setTimeout(function () { this.findAgain(false); }, 0);

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

const RangeFinder = Module("rangefinder", {
    requires: ["config"],

    init: function () {
        this.lastSearchPattern = "";
    },

    openPrompt: function (mode) {
        let backwards = mode == modes.FIND_BACKWARD;
        commandline.open(backwards ? "?" : "/", "", mode);

        this.find("", backwards);
    },

    bootstrap: function (str, backward) {
        if (this.rangeFind && this.rangeFind.stale)
            this.rangeFind = null;

        let highlighted = this.rangeFind && this.rangeFind.highlighted;
        let matchCase = !(options["ignorecase"] || options["smartcase"] && !/[A-Z]/.test(str));
        let linksOnly = options["linksearch"];

        // All this ado is ludicrous.
        str = str.replace(/\\(.|$)/g, function (m, n1) {
            if (n1 == "l")
                linksOnly = true;
            else if (n1 == "L")
                linksOnly = false;
            else if (n1 == "c")
                matchCase = false;
            else if (n1 == "C")
                matchCase = true;
            else
                return n1;
            return "";
        });

        // It's possible, with :tabdetach, for the rangeFind to actually move
        // from one window to another, which breaks things.
        if (!this.rangeFind || this.rangeFind.window.get() != window ||
            linksOnly ^ !!this.rangeFind.elementPath ||
            matchCase ^ this.rangeFind.matchCase || backward ^ this.rangeFind.reverse) {
            if (this.rangeFind)
                this.rangeFind.cancel();
            this.rangeFind = RangeFind(matchCase, backward, linksOnly && options["hinttags"]);
            this.rangeFind.highlighted = highlighted;
        }
        return str;
    },

    find: function (pattern, backwards) {
        let str = this.bootstrap(pattern);
        if (!this.rangeFind.search(str))
            setTimeout(function () { liberator.echoerr("E486: Pattern not found: " + pattern); }, 0);

        return this.rangeFind.found;
    },

    findAgain: function (reverse) {
        if (!this.rangeFind)
            this.find(this.lastSearchPattern);
        else if (!this.rangeFind.search(null, reverse))
            liberator.echoerr("E486: Pattern not found: " + this.lastSearchPattern);
        else if (this.rangeFind.wrapped) {
            // hack needed, because wrapping causes a "scroll" event which clears
            // our command line
            this.setTimeout(function () {
                let msg = this.rangeFind.backward ? "search hit TOP, continuing at BOTTOM"
                                                  : "search hit BOTTOM, continuing at TOP";
                commandline.echo(msg, commandline.HL_WARNINGMSG, commandline.APPEND_TO_MESSAGES);
            }, 0);
        }
        else
            commandline.echo((this.rangeFind.backward ? "?" : "/") + this.lastSearchPattern, null, commandline.FORCE_SINGLELINE);

        if (options["hlsearch"])
            this.highlight();
    },

    // Called when the user types a key in the search dialog. Triggers a find attempt if 'incsearch' is set
    onKeyPress: function (command) {
        if (options["incsearch"]) {
            command = this.bootstrap(command);
            this.rangeFind.search(command);
        }
    },

    onSubmit: function (command) {
        if (!options["incsearch"] || !this.rangeFind || !this.rangeFind.found) {
            this.clear();
            this.find(command || this.lastSearchPattern, modes.extended & modes.FIND_BACKWARD);
        }

        this.lastSearchPattern = command;

        if (options["hlsearch"])
            this.highlight();

        modes.reset();
    },

    // Called when the search is canceled - for example if someone presses
    // escape while typing a search
    onCancel: function () {
        // TODO: code to reposition the document to the place before search started
        if (this.rangeFind)
            this.rangeFind.cancel();
    },

    get rangeFind() buffer.localStore.rangeFind,
    set rangeFind(val) buffer.localStore.rangeFind = val,

    /**
     * Highlights all occurances of <b>str</b> in the buffer.
     *
     * @param {string} str The string to highlight.
     */
    highlight: function () {
        if (this.rangeFind)
            this.rangeFind.highlight();
    },

    /**
     * Clears all search highlighting.
     */
    clear: function () {
        if (this.rangeFind)
            this.rangeFind.highlight(true);
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
    }
});

const RangeFind = Class("RangeFind", {
    init: function (matchCase, backward, elementPath) {
        this.window = Cu.getWeakReference(window);
        this.elementPath = elementPath || null;
        this.matchCase = Boolean(matchCase);
        this.reverse = Boolean(backward);
        this.finder = services.create("find");
        this.finder.caseSensitive = this.matchCase;

        this.ranges = this.makeFrameList(content);
        this.range = RangeFind.Range(tabs.localStore.focusedFrame || content);

        this.startRange = (this.range.selection.rangeCount ? this.range.selection.getRangeAt(0) : this.ranges[0].range).cloneRange();
        this.startRange.collapse(!backward);
        this.range = this.findRange(this.startRange);
        this.ranges.first = this.range;

        this.highlighted = null;
        this.lastString = "";
        this.lastRange = null;
        this.forward = null;
        this.found = false;
    },

    sameDocument: function (r1, r2) r1 && r2 && r1.endContainer.ownerDocument == r2.endContainer.ownerDocument,

    compareRanges: function (r1, r2)
            this.backward ?  r1.compareBoundaryPoints(Range.END_TO_START, r2)
                          : -r1.compareBoundaryPoints(Range.START_TO_END, r2),

    findRange: function (range) {
        let doc = range.startContainer.ownerDocument;
        let win = doc.defaultView;
        let ranges = this.ranges.filter(function (r)
            r.window == win &&
            r.range.compareBoundaryPoints(Range.START_TO_END, range) >= 0 &&
            r.range.compareBoundaryPoints(Range.END_TO_START, range) <= 0);

        if (this.backward)
            return ranges[ranges.length - 1];
        return ranges[0];
    },

    findSubRanges: function (range) {
        let doc = range.startContainer.ownerDocument;
        for (let elem in util.evaluateXPath(this.elementPath, doc)) {
            let r = doc.createRange();
            r.selectNode(elem);
            if (range.compareBoundaryPoints(Range.START_TO_END, r) >= 0 &&
                range.compareBoundaryPoints(Range.END_TO_START, r) <= 0)
                yield r;
        }
    },

    makeFrameList: function (win) {
        const self = this;
        win = win.top;
        let frames = [];
        let backup = null;

        function pushRange(start, end) {
            let range = start.startContainer.ownerDocument.createRange();
            range.setStart(start.startContainer, start.startOffset);
            range.setEnd(end.startContainer, end.startOffset);

            if (!self.elementPath)
                frames.push(RangeFind.Range(range, frames.length));
            else
                for (let r in self.findSubRanges(range))
                    frames.push(RangeFind.Range(r, frames.length));
        }
        function rec(win) {
            let doc = win.document;
            let pageRange = doc.createRange();
            pageRange.selectNode(doc.body || doc.documentElement.lastChild);
            backup = backup || pageRange;
            let pageStart = RangeFind.endpoint(pageRange, true);
            let pageEnd = RangeFind.endpoint(pageRange, false);

            for (let frame in util.Array.itervalues(win.frames)) {
                let range = doc.createRange();
                range.selectNode(frame.frameElement);
                pushRange(pageStart, RangeFind.endpoint(range, true));
                pageStart = RangeFind.endpoint(range, false);
                rec(frame);
            }
            pushRange(pageStart, pageEnd);
        }
        rec(win);
        if (frames.length == 0)
            frames[0] = RangeFind.Range(RangeFind.endpoint(backup, true), 0);
        return frames;
    },

    // This doesn't work yet.
    resetCaret: function () {
        let equal = function (r1, r2) !r1.compareBoundaryPoints(Range.START_TO_START, r2) && !r1.compareBoundaryPoints(Range.END_TO_END, r2);
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

    iter: function (word) {
        let saved = ["range", "lastRange", "lastString"].map(this.closure(function (s) [s, this[s]]))
        try {
            this.range = this.ranges[0];
            this.lastRange = null;
            this.lastString = word
            var res;
            while (res = this.search(null, this.reverse, true))
                yield res;
        }
        finally {
            saved.forEach(function ([k, v]) this[k] = v, this)
        }
    },

    search: function (word, reverse, private) {
        this.wrapped = false;
        this.finder.findBackwards = reverse ? !this.reverse : this.reverse;
        let again = word == null;
        if (again)
            word = this.lastString;
        if (!this.matchCase)
            word = word.toLowerCase();

        if (!again && (word == "" || word.indexOf(this.lastString) != 0 || this.backward)) {
            if (!private)
                this.range.deselect();
            if (word == "")
                this.range.descroll()
            this.lastRange = this.startRange;
            this.range = this.ranges.first;
        }

        if (word == "")
            var range = this.startRange;
        else {
            function indices() {
                let idx = this.range.index;
                for (let i in this.backward ? util.range(idx + 1, 0, -1) : util.range(idx, this.ranges.length))
                    yield i;
                if (private)
                    return;
                this.wrapped = true;
                this.lastRange = null;
                for (let i in this.backward ? util.range(this.ranges.length, idx, -1) : util.range(0, idx + 1))
                    yield i;
            }
            for (let i in indices.call(this)) {
                this.range = this.ranges[i];

                let start = this.sameDocument(this.lastRange, this.range.range) && this.range.intersects(this.lastRange) ?
                            RangeFind.endpoint(this.lastRange, !(again ^ this.backward)) :
                            RangeFind.endpoint(this.range.range, !this.backward);;
                if (this.backward && !again)
                    start = RangeFind.endpoint(this.startRange, false);

                var range = this.finder.Find(word, this.range.range, start, this.range.range);
                if (range)
                    break;
                if (!private) {
                    this.range.descroll();
                    this.range.deselect();
                }
            }
        }

        if (range)
            this.lastRange = range.cloneRange();
        if (private)
            return range;

        this.lastString = word;
        if (range == null) {
            this.cancel();
            this.found = false;
            return null;
        }
        this.range.selection.removeAllRanges();
        this.range.selection.addRange(range);
        this.range.selectionController.scrollSelectionIntoView(
            this.range.selectionController.SELECTION_NORMAL, 0, false);
        this.found = true;
        return range;
    },

    highlight: function (clear) {

        if (!clear && (!this.lastString || this.lastString == this.highlighted))
            return;

        if (!clear && this.highlighted)
            this.highlight(true);

        if (clear && !this.highlighted)
            return;

        let span = util.xmlToDom(<span highlight="Search"/>, this.range.document);

        function highlight(range) {
            let startContainer = range.startContainer;
            let startOffset = range.startOffset;
            let node = startContainer.ownerDocument.importNode(span, true);

            let docfrag = range.extractContents();
            let before = startContainer.splitText(startOffset);
            let parent = before.parentNode;
            node.appendChild(docfrag);
            parent.insertBefore(node, before);
            range.selectNode(node);
        }
        function unhighlight(range) {
            let elem = range.startContainer;
            while (!(elem instanceof Element) && elem.parentNode)
                elem = elem.parentNode;
            if (elem.getAttributeNS(NS.uri, "highlight") != "Search")
                return;

            let docfrag = range.extractContents();

            let parent = elem.parentNode;
            parent.replaceChild(docfrag, elem);
            parent.normalize();
        }

        let action = clear ? unhighlight : highlight;
        let string = this[clear ? "highlighted" : "lastString"];
        for (let r in this.iter(string)) {
            action(r);
            this.lastRange = r;
        }
        if (clear) {
            this.highlighted = null;
            this.purgeListeners();
        }
        else {
            this.highlighted = this.lastString;
            this.addListeners();
            this.search(null, false);
        }
    },

    addListeners: function () {
        for (let range in values(this.ranges))
            range.window.addEventListener("unload", this.closure.onUnload, true);
    },
    purgeListeners: function () {
        for (let range in values(this.ranges))
            range.window.removeEventListener("unload", this.closure.onUnload, true);
    },

    onUnload: function (event) {
        this.purgeListeners();
        if (this.highlighted)
            this.highlight(false);
        this.stale = true;
    },

    cancel: function () {
        this.purgeListeners();
        this.range.deselect();
        this.range.descroll()
    }
}, {
    Range: Class("RangeFind.Range", {
        init: function (range, index) {
            if (range instanceof Ci.nsIDOMWindow) { // Kludge
                this.document = range.document;
                return;
            }

            this.index = index;

            this.document = range.startContainer.ownerDocument;
            this.window = this.document.defaultView;
            this.range = range;

            this.save();
        },

        intersects: function (range)
            this.range.compareBoundaryPoints(Range.START_TO_END, range) >= 0 &&
            this.range.compareBoundaryPoints(Range.END_TO_START, range) <= 0,

        save: function () {
            this.scroll = Point(this.window.pageXOffset, this.window.pageYOffset);

            this.initialSelection = null;
            if (this.selection.rangeCount)
                this.initialSelection = this.selection.getRangeAt(0);
        },

        descroll: function (range) {
            this.window.scrollTo(this.scroll.x, this.scroll.y);
        },

        deselect: function () {
            this.selection.removeAllRanges();
            if (this.initialSelection)
                this.selection.addRange(this.initialSelection);
        },

        get docShell() {
            if (this._docShell)
                return this._docShell;
            for (let shell in iter(config.browser.docShell.getDocShellEnumerator(Ci.nsIDocShellTreeItem.typeAll, Ci.nsIDocShell.ENUMERATE_FORWARDS)))
                if (shell.QueryInterface(nsIWebNavigation).document == this.document)
                    return this._docShell = shell;
        },
        get selectionController() this.docShell
                    .QueryInterface(Ci.nsIInterfaceRequestor)
                    .getInterface(Ci.nsISelectionDisplay)
                    .QueryInterface(Ci.nsISelectionController),
        get selection() this.selectionController.getSelection(Ci.nsISelectionController.SELECTION_NORMAL),
    }),
    endpoint: function (range, before) {
        range = range.cloneRange();
        range.collapse(before);
        return range;
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
