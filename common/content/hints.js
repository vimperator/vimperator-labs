// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */
/** @instance hints */

const Hints = Module("hints", {
    requires: ["config"],

    init: function () {

        this._hintMode = null;
        this._submode    = "";           // used for extended mode, can be "o", "t", "y", etc.
        this._hintString = "";           // the typed string part of the hint is in this string
        this._hintNumber = 0;            // only the numerical part of the hint
        this._usedTabKey = false;        // when we used <Tab> to select an element
        this._prevInput = "";            // record previous user input type, "text" || "number"
        this._extendedhintCount = null;  // for the count argument of Mode#action (extended hint only)

        this._pageHints = [];
        this._validHints = []; // store the indices of the "hints" array with valid elements

        this._activeTimeout = null;  // needed for hinttimeout > 0
        this._canUpdate = false;

        // keep track of the documents which we generated the hints for
        // this._docs = { doc: document, start: start_index in hints[], end: end_index in hints[] }
        this._docs = [];

        const Mode = Hints.Mode;
        Mode.defaultValue("tags", function () function () options.hinttags);
        function extended() options.extendedhinttags;
        function images() "//*[@src]";

        this._hintModes = {
            ";": Mode("Focus hint",                         function (elem) buffer.focusElement(elem),                             extended),
            "?": Mode("Show information for hint",          function (elem) buffer.showElementInfo(elem),                          extended),
            s: Mode("Save link",                            function (elem) buffer.saveLink(elem, true)),
            S: Mode("Save object",                          function (elem) buffer.saveLink(elem, true),                           images),
            a: Mode("Save link with prompt",                function (elem) buffer.saveLink(elem, false)),
            A: Mode("Save object with prompt",              function (elem) buffer.saveLink(elem, false),                          images),
            f: Mode("Focus frame",                          function (elem) Buffer.focusedWindow = elem.ownerDocument.defaultView, function () util.makeXPath(["body"])),
            o: Mode("Follow hint",                          function (elem) buffer.followLink(elem, liberator.CURRENT_TAB)),
            t: Mode("Follow hint in a new tab",             function (elem) buffer.followLink(elem, liberator.NEW_TAB)),
            b: Mode("Follow hint in a background tab",      function (elem) buffer.followLink(elem, liberator.NEW_BACKGROUND_TAB)),
            w: Mode("Follow hint in a new window",          function (elem) buffer.followLink(elem, liberator.NEW_WINDOW),         extended),
            F: Mode("Open multiple hints in tabs",          followAndReshow),
            O: Mode("Generate an ':open URL' using hint",   function (elem, loc) commandline.open("", "open " + loc, modes.EX)),
            T: Mode("Generate a ':tabopen URL' using hint", function (elem, loc) commandline.open("", "tabopen " + loc, modes.EX)),
            W: Mode("Generate a ':winopen URL' using hint", function (elem, loc) commandline.open("", "winopen " + loc, modes.EX)),
            v: Mode("View hint source",                     function (elem, loc) buffer.viewSource(loc, false),                    extended),
            V: Mode("View hint source in external editor",  function (elem, loc) buffer.viewSource(loc, true),                     extended),
            y: Mode("Yank hint location",                   function (elem, loc) util.copyToClipboard(loc, true)),
            Y: Mode("Yank hint description",                function (elem) util.copyToClipboard(elem.textContent || "", true),    extended),
            c: Mode("Open context menu",                    function (elem) buffer.openContextMenu(elem),                          extended),
            i: Mode("Show media object",                    function (elem) liberator.open(elem.src),                              images),
            I: Mode("Show media object in a new tab",       function (elem) liberator.open(elem.src, liberator.NEW_TAB),           images),
            x: Mode("Show hint's title or alt text",        function (elem) liberator.echo(elem.title ? "title: " + elem.title : "alt: " + elem.alt), function() "//*[@title or @alt]")
        };

        /**
         * Follows the specified hint and then reshows all hints. Used to open
         * multiple hints in succession.
         *
         * @param {Node} elem The selected hint.
         */
        function followAndReshow(elem) {
            buffer.followLink(elem, liberator.NEW_BACKGROUND_TAB);

            // TODO: Maybe we find a *simple* way to keep the hints displayed rather than
            // showing them again, or is this short flash actually needed as a "usability
            // feature"? --mst
            hints.show("F");
        }
    },

    /**
     * Reset hints, so that they can be cleanly used again.
     */
    _reset: function () {
        statusline.updateInputBuffer("");
        this._hintString = "";
        this._hintNumber = 0;
        this._usedTabKey = false;
        this._prevInput = "";
        this._pageHints = [];
        this._validHints = [];
        this._canUpdate = false;
        this._docs = [];
        hints.escNumbers = false;

        if (this._activeTimeout)
            clearTimeout(this._activeTimeout);
        this._activeTimeout = null;
    },

    /**
     * Display the current status to the user.
     */
    _updateStatusline: function () {
        statusline.updateInputBuffer((hints.escNumbers ? mappings.getMapLeader() : "") + (this._hintNumber ? this._num2chars(this._hintNumber) : ""));
    },

    /**
     * Get a hint for "input", "textarea" and "select".
     *
     * Tries to use <label>s if possible but does not try to guess that a
     * neighbouring element might look like a label. Only called by
     * {@link #_generate}.
     *
     * If it finds a hint it returns it, if the hint is not the caption of the
     * element it will return showText=true.
     *
     * @param {Object} elem The element used to generate hint text.
     * @param {Document} doc The containing document.
     *
     * @returns [text, showText]
     */
    _getInputHint: function (elem, doc) {
        // <input type="submit|button|reset"/>   Always use the value
        // <input type="radio|checkbox"/>        Use the value if it is not numeric or label or name
        // <input type="password"/>              Never use the value, use label or name
        // <input type="text|file"/> <textarea/> Use value if set or label or name
        // <input type="image"/>                 Use the alt text if present (showText) or label or name
        // <input type="hidden"/>                Never gets here
        // <select/>                             Use the text of the selected item or label or name

        let type = elem.type;

        if (elem instanceof HTMLInputElement && /(submit|button|this._reset)/.test(type))
            return [elem.value, false];
        else {
            for (let [, option] in Iterator(options["hintinputs"].split(","))) {
                if (option == "value") {
                    if (elem instanceof HTMLSelectElement) {
                        if (elem.selectedIndex >= 0)
                            return [elem.item(elem.selectedIndex).text.toLowerCase(), false];
                    }
                    else if (type == "image") {
                        if (elem.alt)
                            return [elem.alt.toLowerCase(), true];
                    }
                    else if (elem.value && type != "password") {
                        // radio's and checkboxes often use internal ids as values - maybe make this an option too...
                        if (! ((type == "radio" || type == "checkbox") && !isNaN(elem.value)))
                            return [elem.value.toLowerCase(), (type == "radio" || type == "checkbox")];
                    }
                }
                else if (option == "label") {
                    if (elem.id) {
                        // TODO: (possibly) do some guess work for label-like objects
                        let label = util.evaluateXPath(["label[@for=" + elem.id.quote() + "]"], doc).snapshotItem(0);
                        if (label)
                            return [label.textContent.toLowerCase(), true];
                    }
                }
                else if (option == "name")
                    return [elem.name.toLowerCase(), true];
            }
        }

        return ["", false];
    },

    /**
     * Gets the actual offset of an imagemap area.
     *
     * Only called by {@link #_generate}.
     *
     * @param {Object} elem  The <area> element.
     * @param {number} leftPos  The left offset of the image.
     * @param {number} topPos  The top offset of the image.
     * @returns [leftPos, topPos]  The updated offsets.
     */
    _getAreaOffset: function (elem, leftPos, topPos) {
        try {
            // Need to add the offset to the area element.
            // Always try to find the top-left point, as per liberator default.
            let shape = elem.getAttribute("shape").toLowerCase();
            let coordStr = elem.getAttribute("coords");
            // Technically it should be only commas, but hey
            coordStr = coordStr.replace(/\s+[;,]\s+/g, ",").replace(/\s+/g, ",");
            let coords = coordStr.split(",").map(Number);

            if ((shape == "rect" || shape == "rectangle") && coords.length == 4) {
                leftPos += coords[0];
                topPos += coords[1];
            }
            else if (shape == "circle" && coords.length == 3) {
                leftPos += coords[0] - coords[2] / Math.sqrt(2);
                topPos += coords[1] - coords[2] / Math.sqrt(2);
            }
            else if ((shape == "poly" || shape == "polygon") && coords.length % 2 == 0) {
                let leftBound = Infinity;
                let topBound = Infinity;

                // First find the top-left corner of the bounding rectangle (offset from image topleft can be noticably suboptimal)
                for (let i = 0; i < coords.length; i += 2) {
                    leftBound = Math.min(coords[i], leftBound);
                    topBound = Math.min(coords[i + 1], topBound);
                }

                let curTop = null;
                let curLeft = null;
                let curDist = Infinity;

                // Then find the closest vertex. (we could generalise to nearest point on an edge, but I doubt there is a need)
                for (let i = 0; i < coords.length; i += 2) {
                    let leftOffset = coords[i] - leftBound;
                    let topOffset = coords[i + 1] - topBound;
                    let dist = Math.sqrt(leftOffset * leftOffset + topOffset * topOffset);
                    if (dist < curDist) {
                        curDist = dist;
                        curLeft = coords[i];
                        curTop = coords[i + 1];
                    }
                }

                // If we found a satisfactory offset, let's use it.
                if (curDist < Infinity)
                    return [leftPos + curLeft, topPos + curTop];
            }
        }
        catch (e) {} // badly formed document, or shape == "default" in which case we don't move the hint
        return [leftPos, topPos];
    },

    // the containing block offsets with respect to the viewport
    _getContainerOffsets: function (doc) {
        let body = doc.body || doc.documentElement;
        // TODO: getComputedStyle returns null for Facebook channel_iframe doc - probable Gecko bug.
        let style = util.computedStyle(body);

        if (style && /^(absolute|fixed|relative)$/.test(style.position)) {
            let rect = body.getClientRects()[0];
            return [-rect.left, -rect.top];
        }
        else
            return [doc.defaultView.scrollX, doc.defaultView.scrollY];
    },

    /**
     * Returns true if element is visible.
     *
     * Only called by {@link #_generate}.
     */
    _isVisible: function (elem, screen) {
        let doc = elem.ownerDocument;
        let win = doc.defaultView;

        // TODO: for iframes, this calculation is wrong
        let rect = elem.getBoundingClientRect();

        if (!rect || rect.top > screen.bottom || rect.bottom < screen.top || rect.left > screen.right || rect.right < screen.left)
            return false;

        rect = elem.getClientRects()[0];
        if (!rect)
            return false;

        let computedStyle = doc.defaultView.getComputedStyle(elem, null);
        if (computedStyle.getPropertyValue("visibility") != "visible" || computedStyle.getPropertyValue("display") == "none")
            return false;

        return true;
    },

    /**
     * Generate the hints in a window.
     *
     * Pushes the hints into the pageHints object, but does not display them.
     *
     * @param {Window} win The window for which to generate hints.
     * @default config.browser.contentWindow
     */
    _generate: function (win, screen) {
        if (!win)
            win = config.browser.contentWindow;
        if (!screen)
            screen = {top: 0, left: 0, bottom: win.innerHeight, right: win.innerWidth};

        let doc = win.document;
        let [offsetX, offsetY] = this._getContainerOffsets(doc);

        let baseNodeAbsolute = util.xmlToDom(<span highlight="Hint"/>, doc);

        let res = util.evaluateXPath(this._hintMode.tags(), doc, null, true);

        let fragment = util.xmlToDom(<div highlight="hints"/>, doc);
        let start = this._pageHints.length;
        let elem;

        let that = this;

        function makeHint (elem) {
            let rect = elem.getClientRects()[0];
            let hint = { elem: elem, showText: false };

            if (elem instanceof HTMLInputElement || elem instanceof HTMLSelectElement || elem instanceof HTMLTextAreaElement)
                [hint.text, hint.showText] = that._getInputHint(elem, doc);
            else
                hint.text = elem.textContent.toLowerCase();

            hint.span = baseNodeAbsolute.cloneNode(true);

            let leftPos = Math.max((rect.left + offsetX), offsetX + screen.left);
            let topPos =  Math.max((rect.top + offsetY), offsetY + screen.top);

            if (elem instanceof HTMLAreaElement)
                [leftPos, topPos] = that._getAreaOffset(elem, leftPos, topPos);

            hint.span.style.left = leftPos + "px";
            hint.span.style.top =  topPos + "px";

            fragment.appendChild(hint.span);

            that._pageHints.push(hint);
        }

        while (elem = res.iterateNext()) {
            let rect = elem.getBoundingClientRect();

            // If the rect has a zero dimension, it may contain
            // floated children. In that case, the children's rects
            // are most probably where the hints should be at.
            if (rect.width == 0 || rect.height == 0) {
                let hasFloatChild = false;
                for (let i = 0; i < elem.childNodes.length; i++) {
                    if (elem.childNodes[i].nodeType != 1) // nodeType 1: elem_NODE
                      continue;

                    // getComputedStyle returns null, if the owner frame is not visible.
                    let computedStyle = doc.defaultView.getComputedStyle(elem.childNodes[i], null);
                    if (computedStyle && computedStyle.getPropertyValue('float') != 'none'
                        && this._isVisible(elem.childNodes[i], screen)) {
                      makeHint(elem.childNodes[i]);
                      hasFloatChild = true;
                      break;
                    }
                }
                if (hasFloatChild)
                    continue;
            }

            if (this._isVisible(elem, screen))
                makeHint(elem);
        }

        let body = doc.body || util.evaluateXPath(["body"], doc).snapshotItem(0);
        if (body) {
            body.appendChild(fragment);
            this._docs.push({ doc: doc, start: start, end: this._pageHints.length - 1 });
        }

        // also _generate hints for frames
        for (let frame in util.Array.itervalues(win.frames)) {
            elem = frame.frameElement;
            if (!this._isVisible(elem, screen)) continue;
            let rect = elem.getBoundingClientRect();
            this._generate(frame,{
              top    : Math.max(0, screen.top - rect.top),
              left   : Math.max(0, screen.left - rect.left),
              bottom : Math.min(frame.innerHeight, screen.bottom - rect.top),
              right  : Math.min(frame.innerWidth,  screen.right  - rect.left)
            });
        }

        return true;
    },

    /**
     * Update the activeHint.
     *
     * By default highlights it green instead of yellow.
     *
     * @param {number} newId The hint to make active.
     * @param {number} oldId The currently active hint.
     */
    _showActiveHint: function (newId, oldId) {
        let oldElem = this._validHints[oldId - 1];
        if (oldElem)
            this._setClass(oldElem, false);

        let newElem = this._validHints[newId - 1];
        if (newElem)
            this._setClass(newElem, true);
    },

    /**
     * Toggle the highlight of a hint.
     *
     * @param {Object} elem The element to toggle.
     * @param {boolean} active Whether it is the currently active hint or not.
     */
    _setClass: function (elem, active) {
        let prefix = (elem.getAttributeNS(NS.uri, "class") || "") + " ";
        if (active)
            elem.setAttributeNS(NS.uri, "highlight", prefix + "HintActive");
        else
            elem.setAttributeNS(NS.uri, "highlight", prefix + "HintElem");
    },

    /**
     * Display the hints in pageHints that are still valid.
     */
    _showHints: function () {
        let hintnum = 1;
        let validHint = this._hintMatcher(this._hintString.toLowerCase());
        let activeHint = this._hintNumber || 1;
        this._validHints = [];
        let activeHintChars = this._num2chars(activeHint);

        for (let [,{ doc: doc, start: start, end: end }] in Iterator(this._docs)) {
            let [offsetX, offsetY] = this._getContainerOffsets(doc);

        inner:
            for (let i in (util.interruptibleRange(start, end + 1, 500))) {
                let hint = this._pageHints[i];

                let valid = validHint(hint.text);
                let hintnumchars = this._num2chars(hintnum);
                let display = valid && (
                    this._hintNumber == 0 ||
                    hintnumchars.indexOf(String(activeHintChars)) == 0
                );

                hint.span.style.display = (display ? "" : "none");
                if (hint.imgSpan)
                    hint.imgSpan.style.display = (display ? "" : "none");

                if (!valid || !display) {
                    hint.elem.removeAttributeNS(NS.uri, "highlight");

                    if (valid) {
                        this._validHints.push(hint.elem);
                        hintnum++;
                    }

                    continue inner;
                }

                if (hint.text == "" && hint.elem.firstChild && hint.elem.firstChild instanceof HTMLImageElement) {
                    if (!hint.imgSpan) {
                        let rect = hint.elem.firstChild.getBoundingClientRect();
                        if (!rect)
                            continue;

                        hint.imgSpan = util.xmlToDom(<span highlight="Hint" liberator:class="HintImage" xmlns:liberator={NS}/>, doc);
                        hint.imgSpan.style.left = (rect.left + offsetX) + "px";
                        hint.imgSpan.style.top = (rect.top + offsetY) + "px";
                        hint.imgSpan.style.width = (rect.right - rect.left) + "px";
                        hint.imgSpan.style.height = (rect.bottom - rect.top) + "px";
                        hint.span.parentNode.appendChild(hint.imgSpan);
                    }
                    this._setClass(hint.imgSpan, activeHint == hintnum);
                }

                hint.span.setAttribute("number", hint.showText ? hintnumchars + ": " + hint.text.substr(0, 50) : hintnumchars);
                if (hint.imgSpan)
                    hint.imgSpan.setAttribute("number", hintnumchars);
                else
                    this._setClass(hint.elem, activeHint == hintnum);
                this._validHints.push(hint.elem);
                hintnum++;
            }
        }

        if (config.browser.markupDocumentViewer.authorStyleDisabled) {
            let css = [];
            // FIXME: Broken for imgspans.
            for (let [, { doc: doc }] in Iterator(this._docs)) {
                for (let elem in util.evaluateXPath(" {//*[@liberator:highlight and @number]", doc)) {
                    let group = elem.getAttributeNS(NS.uri, "highlight");
                    css.push(highlight.selector(group) + "[number=" + elem.getAttribute("number").quote() + "] { " + elem.style.cssText + " }");
                }
            }
            styles.addSheet(true, "hint-positions", "*", css.join("\n"));
        }

        return true;
    },

    /**
     * Remove all hints from the document, and reset the completions.
     *
     * Lingers on the active hint briefly to confirm the selection to the user.
     *
     * @param {number} timeout The number of milliseconds before the active
     *     hint disappears.
     */
    _removeHints: function (timeout) {
        let firstElem = this._validHints[0] || null;

        for (let [,{ doc: doc, start: start, end: end }] in Iterator(this._docs)) {
            let result = util.evaluateXPath("//*[@liberator:highlight='hints']", doc, null, true);
            let hints = new Array();
            let elem;
            // Lucas de Vries: Deleting elements while iterating creates
            // problems, therefore store the items in a temporary array first.
            while (elem = result.iterateNext())
                hints.push(elem);
            while (elem = hints.pop())
                elem.parentNode.removeChild(elem);
            for (let i in util.range(start, end + 1)) {
                let hint = this._pageHints[i];
                if (!timeout || hint.elem != firstElem)
                    hint.elem.removeAttributeNS(NS.uri, "highlight");
            }

            // animate the disappearance of the first hint
            if (timeout && firstElem)
                setTimeout(function () { firstElem.removeAttributeNS(NS.uri, "highlight"); }, timeout);
        }
        styles.removeSheet(true, "hint-positions");

        this._reset();
    },

    _num2chars: function (num) {
        let hintchars = options["hintchars"];
        let chars = "";
        let base = hintchars.length;
        do {
            chars = hintchars[((num % base))] + chars;
            num = Math.floor(num / base);
        } while (num > 0);

        return chars;
    },

    _chars2num: function (chars) {
        let num = 0;
        let hintchars = options["hintchars"];
        let base = hintchars.length;
        for (let i = 0, l = chars.length; i < l; ++i) {
            num = base * num + hintchars.indexOf(chars[i]);
        }
        return num;
    },

    _isHintNumber: function (key) options["hintchars"].indexOf(key) >= 0,

    /**
     * Finish hinting.
     *
     * Called when there are one or zero hints in order to possibly activate it
     * and, if activated, to clean up the rest of the hinting system.
     *
     * @param {boolean} followFirst Whether to force the following of the first
     *     link (when 'followhints' is 1 or 2)
     *
     */
    _processHints: function (followFirst) {
        if (this._validHints.length == 0) {
            liberator.beep();
            return false;
        }

        // This "followhints" option is *too* confusing. For me, and
        // presumably for users, too. --Kris
        if (options["followhints"] > 0) {
            if (!followFirst)
                return false; // no return hit; don't examine uniqueness

            // OK. return hit. But there's more than one hint, and
            // there's no tab-selected current link. Do not follow in mode 2
            liberator.assert(options["followhints"] != 2 || this._validHints.length == 1 || this._hintNumber)
        }

        if (!followFirst) {
            let firstHref = this._validHints[0].getAttribute("href") || null;
            if (firstHref) {
                if (this._validHints.some(function (e) e.getAttribute("href") != firstHref))
                    return false;
            }
            else if (this._validHints.length > 1)
                return false;
        }

        let timeout = followFirst || events.feedingKeys ? 0 : 500;
        let activeIndex = (this._hintNumber ? this._hintNumber - 1 : 0);
        let elem = this._validHints[activeIndex];
        this._removeHints(timeout);

        if (timeout == 0)
            // force a possible mode change, based on whether an input field has focus
            events.onFocusChange();

        this.setTimeout(function () {
            if (modes.extended & modes.HINTS)
                modes.reset();
            this._hintMode.action(elem, elem.href || "", this._extendedhintCount);
        }, timeout);
        return true;
    },

    _checkUnique: function () {
        if (this._hintNumber == 0)
            return;
        liberator.assert(this._hintNumber <= this._validHints.length);

        // if we write a numeric part like 3, but we have 45 hints, only follow
        // the hint after a timeout, as the user might have wanted to follow link 34
        if (this._hintNumber > 0 && this._hintNumber * options["hintchars"].length <= this._validHints.length) {
            let timeout = options["hinttimeout"];
            if (timeout > 0)
                this._activeTimeout = this.setTimeout(function () { this._processHints(true); }, timeout);
        }
        else // we have a unique hint
            this._processHints(true);
    },

    /**
     * Handle user input.
     *
     * Will update the filter on displayed hints and follow the final hint if
     * necessary.
     *
     * @param {Event} event The keypress event.
     */
    _onInput: function (event) {
        this._prevInput = "text";

        // clear any timeout which might be active after pressing a number
        if (this._activeTimeout) {
            clearTimeout(this._activeTimeout);
            this._activeTimeout = null;
        }

        this._hintNumber = 0;
        this._hintString = commandline.command;
        this._updateStatusline();
        this._showHints();
        if (this._validHints.length == 1)
            this._processHints(false);
    },

    /**
     * Get the hintMatcher according to user preference.
     *
     * @param {string} hintString The currently typed hint.
     * @returns {hintMatcher}
     */
    _hintMatcher: function (hintString) { //{{{
        /**
         * Divide a string by a regular expression.
         *
         * @param {RegExp|string} pat The pattern to split on.
         * @param {string} str The string to split.
         * @returns {Array(string)} The lowercased splits of the splitting.
         */
        function tokenize(pat, str) str.split(pat).map(String.toLowerCase);

        /**
         * Get a hint matcher for hintmatching=contains
         *
         * The hintMatcher expects the user input to be space delimited and it
         * returns true if each set of characters typed can be found, in any
         * order, in the link.
         *
         * @param {string} hintString  The string typed by the user.
         * @returns {function(String):boolean} A function that takes the text
         *     of a hint and returns true if all the (space-delimited) sets of
         *     characters typed by the user can be found in it.
         */
        function containsMatcher(hintString) { //{{{
            let tokens = tokenize(/\s+/, hintString);
            return function (linkText) {
                linkText = linkText.toLowerCase();
                return tokens.every(function (token) indexOf(linkText, token) >= 0);
            };
        } //}}}

        /**
         * Get a hintMatcher for hintmatching=firstletters|wordstartswith
         *
         * The hintMatcher will look for any division of the user input that
         * would match the first letters of words. It will always only match
         * words in order.
         *
         * @param {string} hintString The string typed by the user.
         * @param {boolean} allowWordOverleaping Whether to allow non-contiguous
         *     words to match.
         * @returns {function(String):boolean} A function that will filter only
         *     hints that match as above.
         */
        function wordStartsWithMatcher(hintString, allowWordOverleaping) { //{{{
            let hintStrings    = tokenize(/\s+/, hintString);
            let wordSplitRegex = RegExp(options["wordseparators"]);

            /**
             * Match a set of characters to the start of words.
             *
             * What the **** does this do? --Kris
             * This function matches hintStrings like 'hekho' to links
             * like 'Hey Kris, how are you?' -> [HE]y [K]ris [HO]w are you
             * --Daniel
             *
             * @param {string} chars The characters to match.
             * @param {Array(string)} words The words to match them against.
             * @param {boolean} allowWordOverleaping Whether words may be
             *     skipped during matching.
             * @returns {boolean} Whether a match can be found.
             */
            function charsAtBeginningOfWords(chars, words, allowWordOverleaping) {
                function charMatches(charIdx, chars, wordIdx, words, inWordIdx, allowWordOverleaping) {
                    let matches = (chars[charIdx] == words[wordIdx][inWordIdx]);
                    if ((matches == false && allowWordOverleaping) || words[wordIdx].length == 0) {
                        let nextWordIdx = wordIdx + 1;
                        if (nextWordIdx == words.length)
                            return false;

                        return charMatches(charIdx, chars, nextWordIdx, words, 0, allowWordOverleaping);
                    }

                    if (matches) {
                        let nextCharIdx = charIdx + 1;
                        if (nextCharIdx == chars.length)
                            return true;

                        let nextWordIdx = wordIdx + 1;
                        let beyondLastWord = (nextWordIdx == words.length);
                        let charMatched = false;
                        if (beyondLastWord == false)
                            charMatched = charMatches(nextCharIdx, chars, nextWordIdx, words, 0, allowWordOverleaping);

                        if (charMatched)
                            return true;

                        if (charMatched == false || beyondLastWord == true) {
                            let nextInWordIdx = inWordIdx + 1;
                            if (nextInWordIdx == words[wordIdx].length)
                                return false;

                            return charMatches(nextCharIdx, chars, wordIdx, words, nextInWordIdx, allowWordOverleaping);
                        }
                    }

                    return false;
                }

                return charMatches(0, chars, 0, words, 0, allowWordOverleaping);
            }

            /**
             * Check whether the array of strings all exist at the start of the
             * words.
             *
             * i.e. ['ro', 'e'] would match ['rollover', 'effect']
             *
             * The matches must be in order, and, if allowWordOverleaping is
             * false, contiguous.
             *
             * @param {Array(string)} strings The strings to search for.
             * @param {Array(string)} words The words to search in.
             * @param {boolean} allowWordOverleaping Whether matches may be
             *     non-contiguous.
             * @returns {boolean} Whether all the strings matched.
             */
            function stringsAtBeginningOfWords(strings, words, allowWordOverleaping) {
                let strIdx = 0;
                for (let [, word] in Iterator(words)) {
                    if (word.length == 0)
                        continue;

                    let str = strings[strIdx];
                    if (str.length == 0 || indexOf(word, str) == 0)
                        strIdx++;
                    else if (!allowWordOverleaping)
                        return false;

                    if (strIdx == strings.length)
                        return true;
                }

                for (; strIdx < strings.length; strIdx++) {
                    if (strings[strIdx].length != 0)
                        return false;
                }
                return true;
            }

            return function (linkText) {
                if (hintStrings.length == 1 && hintStrings[0].length == 0)
                    return true;

                let words = tokenize(wordSplitRegex, linkText);
                if (hintStrings.length == 1)
                    return charsAtBeginningOfWords(hintStrings[0], words, allowWordOverleaping);
                else
                    return stringsAtBeginningOfWords(hintStrings, words, allowWordOverleaping);
            };
        } //}}}

        let indexOf = String.indexOf;
        if (options.get("hintmatching").has("transliterated"))
            indexOf = Hints.indexOf;

        switch (options.get("hintmatching").values[0]) {
        case "contains"      : return containsMatcher(hintString);
        case "wordstartswith": return wordStartsWithMatcher(hintString, /*allowWordOverleaping=*/ true);
        case "firstletters"  : return wordStartsWithMatcher(hintString, /*allowWordOverleaping=*/ false);
        case "custom"        : return liberator.plugins.customHintMatcher(hintString);
        default              : liberator.echoerr("Invalid hintmatching type: " + hintMatching);
        }
        return null;
    }, //}}}

    /**
     * Creates a new hint mode.
     *
     * @param {string} mode The letter that identifies this mode.
     * @param {string} prompt The description to display to the user
     *     about this mode.
     * @param {function(Node)} action The function to be called with the
     *     element that matches.
     * @param {function():string} tags The function that returns an
     *     XPath expression to decide which elements can be hinted (the
     *     default returns options.hinttags).
     * @optional
     */
    addMode: function (mode, prompt, action, tags) {
        this._hintModes[mode] = Hints.Mode.apply(Hints.Mode, Array.slice(arguments, 1));
    },

    /**
     * Updates the display of hints.
     *
     * @param {string} minor Which hint mode to use.
     * @param {string} filter The filter to use.
     * @param {Object} win The window in which we are showing hints.
     */
    show: function (minor, filter, win) {
        this._hintMode = this._hintModes[minor];
        liberator.assert(this._hintMode);

        commandline.input(this._hintMode.prompt, null, { onChange: this.closure._onInput });
        modes.extended = modes.HINTS;

        this._submode = minor;
        this._hintString = filter || "";
        this._hintNumber = 0;
        this._usedTabKey = false;
        this._prevInput = "";
        this._canUpdate = false;

        this._generate(win);

        // get all keys from the input queue
        liberator.threadYield(true);

        this._canUpdate = true;
        this._showHints();

        if (this._validHints.length == 0) {
            liberator.beep();
            modes.reset();
        }
        else if (this._validHints.length == 1)
            this._processHints(false);
        else // Ticket #185
            this._checkUnique();
    },

    /**
     * Cancel all hinting.
     */
    hide: function () {
        this._removeHints(0);
    },

    /**
     * Handle a hint mode event.
     *
     * @param {Event} event The event to handle.
     */
    onEvent: function (event) {
        let key = events.toString(event);
        let followFirst = false;

        // clear any timeout which might be active after pressing a number
        if (this._activeTimeout) {
            clearTimeout(this._activeTimeout);
            this._activeTimeout = null;
        }

        switch (key) {
        case "<Return>":
            followFirst = true;
            break;

        case "<Tab>":
        case "<S-Tab>":
            this._usedTabKey = true;
            if (this._hintNumber == 0)
                this._hintNumber = 1;

            let oldId = this._hintNumber;
            if (key == "<Tab>") {
                if (++this._hintNumber > this._validHints.length)
                    this._hintNumber = 1;
            }
            else {
                if (--this._hintNumber < 1)
                    this._hintNumber = this._validHints.length;
            }
            this._showActiveHint(this._hintNumber, oldId);
            this._updateStatusline();
            return;

        case "<BS>":
            if (this._hintNumber > 0 && !this._usedTabKey) {
                this._hintNumber = Math.floor(this._hintNumber / 10);
                if (this._hintNumber == 0)
                    this._prevInput = "text";
            }
            else {
                this._usedTabKey = false;
                this._hintNumber = 0;
                liberator.beep();
                return;
            }
            break;

       case mappings.getMapLeader():
           hints.escNumbers = !hints.escNumbers;
           if (hints.escNumbers && this._usedTabKey) // this._hintNumber not used normally, but someone may wants to toggle
               this._hintNumber = 0;            // <tab>s ? this._reset. Prevent to show numbers not entered.

           this._updateStatusline();
           return;

        default:
            if (this._isHintNumber(key)) {
                this._prevInput = "number";

                let oldHintNumber = this._hintNumber;
                if (this._hintNumber == 0 || this._usedTabKey) {
                    this._usedTabKey = false;
                    this._hintNumber = this._chars2num(key);
                }
                else
                    this._hintNumber = this._chars2num(this._num2chars(this._hintNumber) + key);

                this._updateStatusline();

                if (!this._canUpdate)
                    return;

                if (this._docs.length == 0) {
                    this._generate();
                    this._showHints();
                }
                this._showActiveHint(this._hintNumber, oldHintNumber || 1);

                liberator.assert(this._hintNumber != 0);

                this._checkUnique();
            }
        }

        this._updateStatusline();

        if (this._canUpdate) {
            if (this._docs.length == 0 && this._hintString.length > 0)
                this._generate();

            this._showHints();
            this._processHints(followFirst);
        }
    }

    // FIXME: add resize support
    // window.addEventListener("resize", onResize, null);

    // function onResize(event)
    // {
    //     if (event)
    //         doc = event.originalTarget;
    //     else
    //         doc = window.content.document;
    // }

    //}}}
}, {
    indexOf: (function () {
        const table = [
            [0x00c0, 0x00c6, ["A"]],
            [0x00c7, 0x00c7, ["C"]],
            [0x00c8, 0x00cb, ["E"]],
            [0x00cc, 0x00cf, ["I"]],
            [0x00d1, 0x00d1, ["N"]],
            [0x00d2, 0x00d6, ["O"]],
            [0x00d8, 0x00d8, ["O"]],
            [0x00d9, 0x00dc, ["U"]],
            [0x00dd, 0x00dd, ["Y"]],
            [0x00e0, 0x00e6, ["a"]],
            [0x00e7, 0x00e7, ["c"]],
            [0x00e8, 0x00eb, ["e"]],
            [0x00ec, 0x00ef, ["i"]],
            [0x00f1, 0x00f1, ["n"]],
            [0x00f2, 0x00f6, ["o"]],
            [0x00f8, 0x00f8, ["o"]],
            [0x00f9, 0x00fc, ["u"]],
            [0x00fd, 0x00fd, ["y"]],
            [0x00ff, 0x00ff, ["y"]],
            [0x0100, 0x0105, ["A", "a"]],
            [0x0106, 0x010d, ["C", "c"]],
            [0x010e, 0x0111, ["D", "d"]],
            [0x0112, 0x011b, ["E", "e"]],
            [0x011c, 0x0123, ["G", "g"]],
            [0x0124, 0x0127, ["H", "h"]],
            [0x0128, 0x0130, ["I", "i"]],
            [0x0132, 0x0133, ["IJ", "ij"]],
            [0x0134, 0x0135, ["J", "j"]],
            [0x0136, 0x0136, ["K", "k"]],
            [0x0139, 0x0142, ["L", "l"]],
            [0x0143, 0x0148, ["N", "n"]],
            [0x0149, 0x0149, ["n"]],
            [0x014c, 0x0151, ["O", "o"]],
            [0x0152, 0x0153, ["OE", "oe"]],
            [0x0154, 0x0159, ["R", "r"]],
            [0x015a, 0x0161, ["S", "s"]],
            [0x0162, 0x0167, ["T", "t"]],
            [0x0168, 0x0173, ["U", "u"]],
            [0x0174, 0x0175, ["W", "w"]],
            [0x0176, 0x0178, ["Y", "y", "Y"]],
            [0x0179, 0x017e, ["Z", "z"]],
            [0x0180, 0x0183, ["b", "B", "B", "b"]],
            [0x0187, 0x0188, ["C", "c"]],
            [0x0189, 0x0189, ["D"]],
            [0x018a, 0x0192, ["D", "D", "d", "F", "f"]],
            [0x0193, 0x0194, ["G"]],
            [0x0197, 0x019b, ["I", "K", "k", "l", "l"]],
            [0x019d, 0x01a1, ["N", "n", "O", "O", "o"]],
            [0x01a4, 0x01a5, ["P", "p"]],
            [0x01ab, 0x01ab, ["t"]],
            [0x01ac, 0x01b0, ["T", "t", "T", "U", "u"]],
            [0x01b2, 0x01d2, ["V", "Y", "y", "Z", "z", "D", "L", "N", "A", "a", "I", "i", "O", "o"]],
            [0x01d3, 0x01dc, ["U", "u"]],
            [0x01de, 0x01e1, ["A", "a"]],
            [0x01e2, 0x01e3, ["AE", "ae"]],
            [0x01e4, 0x01ed, ["G", "g", "G", "g", "K", "k", "O", "o", "O", "o"]],
            [0x01f0, 0x01f5, ["j", "D", "G", "g"]],
            [0x01fa, 0x01fb, ["A", "a"]],
            [0x01fc, 0x01fd, ["AE", "ae"]],
            [0x01fe, 0x0217, ["O", "o", "A", "a", "A", "a", "E", "e", "E", "e", "I", "i", "I", "i", "O", "o", "O", "o", "R", "r", "R", "r", "U", "u", "U", "u"]],
            [0x0253, 0x0257, ["b", "c", "d", "d"]],
            [0x0260, 0x0269, ["g", "h", "h", "i", "i"]],
            [0x026b, 0x0273, ["l", "l", "l", "l", "m", "n", "n"]],
            [0x027c, 0x028b, ["r", "r", "r", "r", "s", "t", "u", "u", "v"]],
            [0x0290, 0x0291, ["z"]],
            [0x029d, 0x02a0, ["j", "q"]],
            [0x1e00, 0x1e09, ["A", "a", "B", "b", "B", "b", "B", "b", "C", "c"]],
            [0x1e0a, 0x1e13, ["D", "d"]],
            [0x1e14, 0x1e1d, ["E", "e"]],
            [0x1e1e, 0x1e21, ["F", "f", "G", "g"]],
            [0x1e22, 0x1e2b, ["H", "h"]],
            [0x1e2c, 0x1e8f, ["I", "i", "I", "i", "K", "k", "K", "k", "K", "k", "L", "l", "L", "l", "L", "l", "L", "l", "M", "m", "M", "m", "M", "m", "N", "n", "N", "n", "N", "n", "N", "n", "O", "o", "O", "o", "O", "o", "O", "o", "P", "p", "P", "p", "R", "r", "R", "r", "R", "r", "R", "r", "S", "s", "S", "s", "S", "s", "S", "s", "S", "s", "T", "t", "T", "t", "T", "t", "T", "t", "U", "u", "U", "u", "U", "u", "U", "u", "U", "u", "V", "v", "V", "v", "W", "w", "W", "w", "W", "w", "W", "w", "W", "w", "X", "x", "X", "x", "Y", "y"]],
            [0x1e90, 0x1e9a, ["Z", "z", "Z", "z", "Z", "z", "h", "t", "w", "y", "a"]],
            [0x1ea0, 0x1eb7, ["A", "a"]],
            [0x1eb8, 0x1ec7, ["E", "e"]],
            [0x1ec8, 0x1ecb, ["I", "i"]],
            [0x1ecc, 0x1ee3, ["O", "o"]],
            [0x1ee4, 0x1ef1, ["U", "u"]],
            [0x1ef2, 0x1ef9, ["Y", "y"]],
            [0x2071, 0x2071, ["i"]],
            [0x207f, 0x207f, ["n"]],
            [0x249c, 0x24b5, "a"],
            [0x24b6, 0x24cf, "A"],
            [0x24d0, 0x24e9, "a"],
            [0xfb00, 0xfb06, ["ff", "fi", "fl", "ffi", "ffl", "st", "st"]],
            [0xff21, 0xff3a, "A"],
            [0xff41, 0xff5a, "a"],
        ].map(function (a) {
            if (typeof a[2] == "string")
                a[3] = function (chr) String.fromCharCode(this[2].charCodeAt(0) + chr - this[0]);
            else
                a[3] = function (chr) this[2][(chr - this[0]) % this[2].length];
            return a;
        });

        function translate(chr) {
            var m, c = chr.charCodeAt(0);
            var n = table.length;
            var i = 0;
            while (n) {
                m = Math.floor(n / 2);
                var t = table[i + m];
                if (c >= t[0] && c <= t[1])
                    return t[3](c);
                if (c < t[0] || m == 0)
                    n = m;
                else {
                    i += m;
                    n = n - m;
                }
            }
            return chr;
        }

        return function indexOf(dest, src) {
            var end = dest.length - src.length;
            if (src.length == 0)
                return 0;
        outer:
            for (var i = 0; i < end; i++) {
                    var j = i;
                    for (var k = 0; k < src.length;) {
                        var s = translate(dest[j++]);
                        for (var l = 0; l < s.length; l++, k++) {
                            if (s[l] != src[k])
                                continue outer;
                            if (k == src.length - 1)
                                return i;
                        }
                    }
                }
            return -1;
        }
    })(),

    Mode: Struct("prompt", "action", "tags")
}, {
    mappings: function () {
        var myModes = config.browserModes;
        mappings.add(myModes, ["f"],
            "Start QuickHint mode",
            function () { hints.show("o"); });

        // At the moment, "F" calls
        //    buffer.followLink(clicked_element, DO_WHAT_FIREFOX_DOES_WITH_CNTRL_CLICK)
        // It is not clear that it shouldn't be:
        //    buffer.followLink(clicked_element, !DO_WHAT_FIREFOX_DOES_WITH_CNTRL_CLICK)
        // In fact, it might be nice if there was a "dual" to F (like H and
        // gH, except that gF is already taken). --tpp
        //
        // Likewise, it might be nice to have a liberator.NEW_FOREGROUND_TAB
        // and then make liberator.NEW_TAB always do what a Ctrl+Click
        // does. --tpp
        mappings.add(myModes, ["F"],
            "Start QuickHint mode, but open link in a new tab",
            function () { hints.show(options.getPref("browser.tabs.loadInBackground") ? "b" : "t"); });

        mappings.add(myModes, [";"],
            "Start an extended hint mode",
            function (count) {
                hints._extendedhintCount = count;
                commandline.input(";", null,
                    {
                        promptHighlight: "Normal",
                        completer: function (context) {
                            context.compare = function () 0;
                            context.completions = [[k, v.prompt] for ([k, v] in Iterator(hints._hintModes))];
                        },
                        onChange: function () { modes.reset(); },
                        onCancel: function (arg) { arg && setTimeout(function () hints.show(arg), 0); }
                    });
            }, { count: true });
    },
    options: function () {
        const DEFAULT_HINTTAGS =
            util.makeXPath(["input[not(@type='hidden')]", "a", "area", "iframe", "textarea", "button", "select"])
                + " | //*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @role='link']"
                + (config.name == "Muttator" ?
                    " | //xhtml:div[@class='wrappedsender']/xhtml:div[contains(@class,'link')]" :
                    "");

        function checkXPath(val) {
            try {
                util.evaluateXPath(val, document.implementation.createDocument("", "", null));
                return true;
            }
            catch (e) {
                return false;
            }
        }

        options.add(["extendedhinttags", "eht"],
            "XPath string of hintable elements activated by ';'",
            "string", DEFAULT_HINTTAGS,
            { validator: checkXPath, scope: Option.SCOPE_BOTH });

        options.add(["hinttags", "ht"],
            "XPath string of hintable elements activated by 'f' and 'F'",
            "string", DEFAULT_HINTTAGS,
            { validator: checkXPath, scope: Option.SCOPE_BOTH });

        options.add(["hinttimeout", "hto"],
            "Timeout before automatically following a non-unique numerical hint",
            "number", 0,
            { validator: function (value) value >= 0 });

        options.add(["followhints", "fh"],
            // FIXME: this description isn't very clear but I can't think of a
            // better one right now.
            "Change the behaviour of <Return> in hint mode",
            "number", 0,
            {
                completer: function () [
                    ["0", "Follow the first hint as soon as typed text uniquely identifies it. Follow the selected hint on <Return>."],
                    ["1", "Follow the selected hint on <Return>."],
                    ["2", "Follow the selected hint on <Return> only it's been <Tab>-selected."]
                ]
            });

        options.add(["hintmatching", "hm"],
            "How links are matched",
            "stringlist", "contains",
            {
                completer: function (context) [
                    ["contains",       "The typed characters are split on whitespace. The resulting groups must all appear in the hint."],
                    ["wordstartswith", "The typed characters are split on whitespace. The resulting groups must all match the beginings of words, in order."],
                    ["firstletters",   "Behaves like wordstartswith, but all groups much match a sequence of words."],
                    ["custom",         "Delegate to a custom function: liberator.plugins.customHintMatcher(hintString)"],
                    ["transliterated", "When true, special latin characters are translated to their ascii equivalent (e.g., \u00e9 -> e)"]
                ]
            });

        options.add(["hintchars", "hc"],
            "What characters to use for labeling hints",
            "string", "0123456789", // TODO: Change to charlist
            {
                setter: function (value) {
                    if (modes.extended & modes.HINTS)
                        hints._showHints();
                    return value;
                },
                completer: function (context) [
                    ["0123456789", "Numbers only"],
                    ["hjklasdf", "Home row"],
                    ["hjklasdfgyuiopqwertnmzxcvb", "Smart order"],
                    ["abcdefghijklmnopqrstuvwxyz", "Alphabetically ordered"],
                ],
                validator: function (arg) {
                    let prev;
                    let list = arg.split("");
                    list.sort();
                    let ret = list.some(function (n) prev == (prev=n));

                    return !ret && arg.length > 1;
                }
            });

        options.add(["wordseparators", "wsp"],
            "How words are split for hintmatching",
            "string", '[.,!?:;/"^$%&?()[\\]{}<>#*+|=~ _-]');

        options.add(["hintinputs", "hin"],
            "How text input fields are hinted",
            "stringlist", "label,value",
            {
                completer: function (context) [
                    ["value", "Match against the value contained by the input field"],
                    ["label", "Match against the value of a label for the input field, if one can be found"],
                    ["name",  "Match against the name of an input field, only if neither a name or value could be found."]
                ]
            });
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
