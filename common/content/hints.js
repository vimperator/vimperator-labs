// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


/** @scope modules */
/** @instance hints */
const ELEM = 0, TEXT = 1, SPAN = 2, IMG_SPAN = 3;
const Hints = Module("hints", {
    init: function () {

        this._hintMode;
        this._submode    = ""; // used for extended mode, can be "o", "t", "y", etc.
        this._hintString = ""; // the typed string part of the hint is in this string
        this._hintNumber = 0;  // only the numerical part of the hint
        this._usedTabKey = false; // when we used <Tab> to select an element
        this._prevInput = "";    // record previous user input type, "text" || "number"
        this._extendedhintCount;  // for the count argument of Mode#action (extended hint only)

        // hints[] = [elem, text, span, imgSpan, elem.style.backgroundColor, elem.style.color]
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
        function images() util.makeXPath(["img"]);

        this._hintModes = {
            ";": Mode("Focus hint",                         function (elem) buffer.focusElement(elem),                             extended),
            "?": Mode("Show information for hint",          function (elem) buffer.showElementInfo(elem),                          extended),
            s: Mode("Save hint",                            function (elem) buffer.saveLink(elem, true)),
            a: Mode("Save hint with prompt",                function (elem) buffer.saveLink(elem, false)),
            f: Mode("Focus frame",                          function (elem) elem.ownerDocument.defaultView.focus(), function () util.makeXPath(["body"])),
            o: Mode("Follow hint",                          function (elem) buffer.followLink(elem, liberator.CURRENT_TAB)),
            t: Mode("Follow hint in a new tab",             function (elem) buffer.followLink(elem, liberator.NEW_TAB)),
            b: Mode("Follow hint in a background tab",      function (elem) buffer.followLink(elem, liberator.NEW_BACKGROUND_TAB)),
            w: Mode("Follow hint in a new window",          function (elem) buffer.followLink(elem, liberator.NEW_WINDOW),         extended),
            F: Mode("Open multiple hints in tabs",          followAndReshow),
            O: Mode("Generate an ':open URL' using hint",   function (elem, loc) commandline.open(":", "open " + loc, modes.EX)),
            T: Mode("Generate a ':tabopen URL' using hint", function (elem, loc) commandline.open(":", "tabopen " + loc, modes.EX)),
            W: Mode("Generate a ':winopen URL' using hint", function (elem, loc) commandline.open(":", "winopen " + loc, modes.EX)),
            v: Mode("View hint source",                     function (elem, loc) buffer.viewSource(loc, false),                    extended),
            V: Mode("View hint source in external editor",  function (elem, loc) buffer.viewSource(loc, true),                     extended),
            y: Mode("Yank hint location",                   function (elem, loc) util.copyToClipboard(loc, true)),
            Y: Mode("Yank hint description",                function (elem) util.copyToClipboard(elem.textContent || "", true),    extended),
            c: Mode("Open context menu",                    function (elem) buffer.openContextMenu(elem),                          extended),
            i: Mode("Show image",                           function (elem) liberator.open(elem.src),                              images),
            I: Mode("Show image in a new tab",              function (elem) liberator.open(elem.src, liberator.NEW_TAB),           images)
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
        statusline.updateInputBuffer((hints.escNumbers ? mappings.getMapLeader() : "") + (this._hintNumber || ""));
    },

    /**
     * Get a hint for "input", "textarea" and "select".
     *
     * Tries to use <label>s if possible but does not try to guess that a
     * neighbouring element might look like a label. Only called by this._generate().
     *
     * If it finds a hint it returns it, if the hint is not the caption of the
     * element it will return showText=true.
     *
     * @param {Object} elem The element used to this._generate hint text.
     * @param {Document} doc The containing document.
     *
     * @returns [text, showText]
     */
    _getInputHint: function (elem, doc) {
        // <input type="submit|button|this._reset">   Always use the value
        // <input type="radio|checkbox">        Use the value if it is not numeric or label or name
        // <input type="password">              Never use the value, use label or name
        // <input type="text|file"> <textarea>  Use value if set or label or name
        // <input type="image">                 Use the alt text if present (showText) or label or name
        // <input type="hidden">                Never gets here
        // <select>                             Use the text of the selected item or label or name

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
                        let label = util.evaluateXPath("//label[@for='" + elem.id + "']", doc).snapshotItem(0);
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
     * Only called by this._generate().
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
     * Generate the hints in a window.
     *
     * Pushes the hints into the this._pageHints object, but does not display them.
     *
     * @param {Window} win The window,defaults to window.content.
     */
    _generate: function (win) {
        if (!win)
            win = window.content;

        let doc = win.document;
        let height = win.innerHeight;
        let width  = win.innerWidth;
        let [offsetX, offsetY] = this._getContainerOffsets(doc);

        let baseNodeAbsolute = util.xmlToDom(<span highlight="Hint"/>, doc);

        let elem, text, span, rect, showText;
        let res = util.evaluateXPath(this._hintMode.tags(), doc, null, true);

        let fragment = util.xmlToDom(<div highlight="hints"/>, doc);
        let start = this._pageHints.length;
        for (let elem in res) {
            showText = false;

            // TODO: for iframes, this calculation is wrong
            rect = elem.getBoundingClientRect();
            if (!rect || rect.top > height || rect.bottom < 0 || rect.left > width || rect.right < 0)
                continue;

            rect = elem.getClientRects()[0];
            if (!rect)
                continue;

            let computedStyle = doc.defaultView.getComputedStyle(elem, null);
            if (computedStyle.getPropertyValue("visibility") != "visible" || computedStyle.getPropertyValue("display") == "none")
                continue;

            if (elem instanceof HTMLInputElement || elem instanceof HTMLSelectElement || elem instanceof HTMLTextAreaElement)
                [text, showText] = this._getInputHint(elem, doc);
            else
                text = elem.textContent.toLowerCase();

            span = baseNodeAbsolute.cloneNode(true);

            let leftPos = Math.max((rect.left + offsetX), offsetX);
            let topPos =  Math.max((rect.top + offsetY), offsetY);

            if (elem instanceof HTMLAreaElement)
                [leftPos, topPos] = this._getAreaOffset(elem, leftPos, topPos);

            span.style.left = leftPos + "px";
            span.style.top =  topPos + "px";
            fragment.appendChild(span);

            this._pageHints.push([elem, text, span, null, elem.style.backgroundColor, elem.style.color, showText]);
        }

        let body = doc.body || util.evaluateXPath(["body"], doc).snapshotItem(0);
        if (body) {
            body.appendChild(fragment);
            this._docs.push({ doc: doc, start: start, end: this._pageHints.length - 1 });
        }

        // also _generate hints for frames
        Array.forEach(win.frames, this.closure._generate);

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
     * Display the hints in this._pageHints that are still valid.
     */
    _showHints: function () {

        let elem, text, rect, span, imgSpan, _a, _b, showText;
        let hintnum = 1;
        let validHint = this._hintMatcher(this._hintString.toLowerCase());
        let activeHint = this._hintNumber || 1;
        this._validHints = [];

        for (let [,{ doc: doc, start: start, end: end }] in Iterator(this._docs)) {
            let [offsetX, offsetY] = this._getContainerOffsets(doc);

        inner:
            for (let i in (util.interruptibleRange(start, end + 1, 500))) {
                let hint = this._pageHints[i];
                [elem, text, span, imgSpan, _a, _b, showText] = hint;

                let valid = validHint(text);
                span.style.display = (valid ? "" : "none");
                if (imgSpan)
                    imgSpan.style.display = (valid ? "" : "none");

                if (!valid) {
                    elem.removeAttributeNS(NS.uri, "highlight");
                    continue inner;
                }

                if (text == "" && elem.firstChild && elem.firstChild instanceof HTMLImageElement) {
                    if (!imgSpan) {
                        rect = elem.firstChild.getBoundingClientRect();
                        if (!rect)
                            continue;

                        imgSpan = util.xmlToDom(<span highlight="Hint" liberator:class="HintImage" xmlns:liberator={NS}/>, doc);
                        imgSpan.style.left = (rect.left + offsetX) + "px";
                        imgSpan.style.top = (rect.top + offsetY) + "px";
                        imgSpan.style.width = (rect.right - rect.left) + "px";
                        imgSpan.style.height = (rect.bottom - rect.top) + "px";
                        hint[IMG_SPAN] = imgSpan;
                        span.parentNode.appendChild(imgSpan);
                    }
                    this._setClass(imgSpan, activeHint == hintnum);
                }

                span.setAttribute("number", showText ? hintnum + ": " + text.substr(0, 50) : hintnum);
                if (imgSpan)
                    imgSpan.setAttribute("number", hintnum);
                else
                    this._setClass(elem, activeHint == hintnum);
                this._validHints.push(elem);
                hintnum++;
            }
        }

        if (getBrowser().markupDocumentViewer.authorStyleDisabled) {
            let css = [];
            // FIXME: Broken for imgspans.
            for (let [, { doc: doc }] in Iterator(this._docs)) {
                for (let elem in util.evaluateXPath(" {//*[@liberator:highlight and @number]", doc)) {
                    let group = elem.getAttributeNS(NS.uri, "highlight");
                    css.push(highlight.selector(group) + "[number='" + elem.getAttribute("number") + "'] { " + elem.style.cssText + " }");
                }
            }
            styles.addSheet(true, "hint-positions", "*", css.join("\n"));
        }

        return true;
    },

    /**
     * Remove all hints from the document, and this._reset the completions.
     *
     * Lingers on the active hint briefly to confirm the selection to the user.
     *
     * @param {number} timeout The number of milliseconds before the active
     *     hint disappears.
     */
    _removeHints: function (timeout) {
        let firstElem = this._validHints[0] || null;

        for (let [,{ doc: doc, start: start, end: end }] in Iterator(this._docs)) {
            for (let elem in util.evaluateXPath("//*[@liberator:highlight='hints']", doc))
                elem.parentNode.removeChild(elem);
            for (let i in util.range(start, end + 1)) {
                let hint = this._pageHints[i];
                if (!timeout || hint[ELEM] != firstElem)
                    hint[ELEM].removeAttributeNS(NS.uri, "highlight");
            }

            // animate the disappearance of the first hint
            if (timeout && firstElem)
                setTimeout(function () { firstElem.removeAttributeNS(NS.uri, "highlight"); }, timeout);
        }
        styles.removeSheet(true, "hint-positions");

        this._reset();
    },

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
    __processHints: function (followFirst) {
        if (this._validHints.length == 0) {
            liberator.beep();
            return false;
        }

        if (options["followhints"] > 0) {
            if (!followFirst)
                return false; // no return hit; don't examine uniqueness

            // OK. return hit. But there's more than one hint, and
            // there's no tab-selected current link. Do not follow in mode 2
            if (options["followhints"] == 2 && this._validHints.length > 1 && !this._hintNumber)
                return liberator.beep();
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
        setTimeout(function () {
            if (modes.extended & modes.HINTS)
                modes.reset();
            this._hintMode.action(elem, elem.href || "", this._extendedhintCount);
        }, timeout);
        return true;
    },

    _checkUnique: function () {
        if (this._hintNumber == 0)
            return;
        if (this._hintNumber > this._validHints.length)
            return void liberator.beep();

        // if we write a numeric part like 3, but we have 45 hints, only follow
        // the hint after a timeout, as the user might have wanted to follow link 34
        if (this._hintNumber > 0 && this._hintNumber * 10 <= this._validHints.length) {
            let timeout = options["hinttimeout"];
            if (timeout > 0)
                this._activeTimeout = setTimeout(function () { this._processHints(true); }, timeout);
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
    __onInput: function (event) {
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
     * Get the this._hintMatcher according to user preference.
     *
     * @param {string} this._hintString The currently typed hint.
     * @returns {this._hintMatcher}
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
         * The this._hintMatcher expects the user input to be space delimited and it
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
                return tokens.every(function (token) linkText.indexOf(token) >= 0);
            };
        } //}}}

        /**
         * Get a this._hintMatcher for hintmatching=firstletters|wordstartswith
         *
         * The this._hintMatcher will look for any division of the user input that
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
             * @returns boolean Whether all the strings matched.
             */
            function stringsAtBeginningOfWords(strings, words, allowWordOverleaping) {
                let strIdx = 0;
                for (let [, word] in Iterator(words)) {
                    if (word.length == 0)
                        continue;

                    let str = strings[strIdx];
                    if (str.length == 0 || word.indexOf(str) == 0)
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

        switch (options["hintmatching"]) {
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
        if (!this._hintMode)
            return void liberator.beep();
        commandline.input(this._hintMode.prompt + ": ", null, { onChange: this._onInput });
        modes.extended = modes.HINTS;

        this._submode = minor;
        this._hintString = filter || "";
        this._hintNumber = 0;
        usedTab = false;
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
                return void liberator.beep();
            }
            break;

       case mappings.getMapLeader():
           hints.escNumbers = !hints.escNumbers;
           if (hints.escNumbers && this._usedTabKey) // this._hintNumber not used normally, but someone may wants to toggle
               this._hintNumber = 0;            // <tab>s ? this._reset. Prevent to show numbers not entered.

           this._updateStatusline();
           return;

        default:
            if (/^\d$/.test(key)) {
                this._prevInput = "number";

                let oldHintNumber = this._hintNumber;
                if (this._hintNumber == 0 || this._usedTabKey) {
                    this._usedTabKey = false;
                    this._hintNumber = parseInt(key, 10);
                }
                else
                    this._hintNumber = (this._hintNumber * 10) + parseInt(key, 10);

                this._updateStatusline();

                if (!this._canUpdate)
                    return;

                if (this._docs.length == 0) {
                    this._generate();
                    this._showHints();
                }
                this._showActiveHint(this._hintNumber, oldHintNumber || 1);

                if (this._hintNumber == 0)
                    return void liberator.beep();

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
    Mode: new Struct("prompt", "action", "tags"),
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
        // and then make liberator.NEW_TAB always do what a Cntrl+Click
        // does. --tpp
        mappings.add(myModes, ["F"],
            "Start QuickHint mode, but open link in a new tab",
            function () { hints.show(options.getPref("browser.tabs.loadInBackground") ? "b" : "t"); });

        mappings.add(myModes, [";"],
            "Start an extended hint mode",
            function (count) {
                this._extendedhintCount = count;
                commandline.input(";", null,
                    {
                        promptHighlight: "Normal",
                        completer: function (context) {
                            context.compare = function () 0;
                            context.completions = [[k, v.prompt] for ([k, v] in Iterator(this._hintModes))];
                        },
                        onChange: function () { modes.pop(); },
                        onCancel: function (arg) { arg && setTimeout(function () hints.show(arg), 0); }
                    });
            }, { count: true });
    },
    options: function () {
        const DEFAULT_HINTTAGS =
            util.makeXPath(["input[not(@type='hidden')]", "a", "area", "iframe", "textarea", "button", "select"])
                + " | //*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @role='link']";

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
            { validator: checkXPath });

        options.add(["hinttags", "ht"],
            "XPath string of hintable elements activated by 'f' and 'F'",
            "string", DEFAULT_HINTTAGS,
            { validator: checkXPath });

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
                ],
                validator: Option.validateCompleter
            });

        options.add(["hintmatching", "hm"],
            "How links are matched",
            "string", "contains",
            {
                completer: function (context) [
                    ["contains",       "The typed characters are split on whitespace. The resulting groups must all appear in the hint."],
                    ["wordstartswith", "The typed characters are split on whitespace. The resulting groups must all match the beginings of words, in order."],
                    ["firstletters",   "Behaves like wordstartswith, but all groups much match a sequence of words."],
                    ["custom",         "Delegate to a custom function: liberator.plugins.customHintMatcher(this._hintString)"]
                ],
                validator: Option.validateCompleter
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
                ],
                validator: Option.validateCompleter
            });
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
