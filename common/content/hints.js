/***** BEGIN LICENSE BLOCK ***** {{{
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

(c) 2006-2008: Martin Stubenschrott <stubenschrott@gmx.net>

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.
}}} ***** END LICENSE BLOCK *****/

/** @scope modules */

/**
 * @instance hints
 */
function Hints() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const ELEM = 0, TEXT = 1, SPAN = 2, IMGSPAN = 3;

    var myModes = config.browserModes;

    var hintMode;
    var submode    = ""; // used for extended mode, can be "o", "t", "y", etc.
    var hintString = ""; // the typed string part of the hint is in this string
    var hintNumber = 0;  // only the numerical part of the hint
    var usedTabKey = false; // when we used <Tab> to select an element
    var prevInput = "";    // record previous user input type, "text" || "number"
    var extendedhintCount;  // for the count arugument of Mode#action (extended hint only)

    // hints[] = [elem, text, span, imgspan, elem.style.backgroundColor, elem.style.color]
    var pageHints = [];
    var validHints = []; // store the indices of the "hints" array with valid elements

    var activeTimeout = null;  // needed for hinttimeout > 0
    var canUpdate = false;

    // keep track of the documents which we generated the hints for
    // docs = { doc: document, start: start_index in hints[], end: end_index in hints[] }
    var docs = [];

    const Mode = new Struct("prompt", "action", "tags");
    Mode.defaultValue("tags", function () function () options.hinttags);
    function extended() options.extendedhinttags;
    const hintModes = {
        ";": Mode("Focus hint",                    function (elem) buffer.focusElement(elem),                             extended),
        a: Mode("Save hint with prompt",           function (elem) buffer.saveLink(elem, false)),
        f: Mode("Focus frame",                     function (elem) elem.ownerDocument.defaultView.focus(), function () "//body | //xhtml:body"),
        s: Mode("Save hint",                       function (elem) buffer.saveLink(elem, true)),
        o: Mode("Follow hint",                     function (elem) buffer.followLink(elem, liberator.CURRENT_TAB)),
        t: Mode("Follow hint in a new tab",        function (elem) buffer.followLink(elem, liberator.NEW_TAB)),
        b: Mode("Follow hint in a background tab", function (elem) buffer.followLink(elem, liberator.NEW_BACKGROUND_TAB)),
        v: Mode("View hint source",                function (elem, loc) buffer.viewSource(loc, false),                    extended),
        V: Mode("View hint source",                function (elem, loc) buffer.viewSource(loc, true),                     extended),
        w: Mode("Follow hint in a new window",     function (elem) buffer.followLink(elem, liberator.NEW_WINDOW),         extended),

        "?": Mode("Show information for hint",     function (elem) buffer.showElementInfo(elem),                          extended),
        O: Mode("Open location based on hint",     function (elem, loc) commandline.open(":", "open " + loc, modes.EX)),
        T: Mode("Open new tab based on hint",      function (elem, loc) commandline.open(":", "tabopen " + loc, modes.EX)),
        W: Mode("Open new window based on hint",   function (elem, loc) commandline.open(":", "winopen " + loc, modes.EX)),
        y: Mode("Yank hint location",              function (elem, loc) util.copyToClipboard(loc, true)),
        Y: Mode("Yank hint description",           function (elem) util.copyToClipboard(elem.textContent || "", true),    extended)
    };

    // reset all important variables
    function reset()
    {
        statusline.updateInputBuffer("");
        hintString = "";
        hintNumber = 0;
        usedTabKey = false;
        prevInput = "";
        pageHints = [];
        validHints = [];
        canUpdate = false;
        docs = [];
        hints.escNumbers = false;

        if (activeTimeout)
            clearTimeout(activeTimeout);
        activeTimeout = null;
    }

    function updateStatusline()
    {
        statusline.updateInputBuffer((hints.escNumbers ? mappings.getMapLeader() : "") + (hintNumber || ""));
    }

    function generate(win)
    {
        if (!win)
            win = window.content;

        let doc = win.document;
        let height = win.innerHeight;
        let width  = win.innerWidth;
        let scrollX = doc.defaultView.scrollX;
        let scrollY = doc.defaultView.scrollY;

        let baseNodeAbsolute = util.xmlToDom(<span highlight="Hint"/>, doc);

        let elem, tagname, text, span, rect;
        let res = buffer.evaluateXPath(hintMode.tags(), doc, null, true);

        let fragment = util.xmlToDom(<div highlight="hints"/>, doc);
        let start = pageHints.length;
        for (let elem in res)
        {
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

            tagname = elem.localName.toLowerCase();
            if (tagname == "input" || tagname == "textarea")
                text = elem.value;
            else if (tagname == "select")
            {
                if (elem.selectedIndex >= 0)
                    text = elem.item(elem.selectedIndex).text;
                else
                    text = "";
            }
            else
                text = elem.textContent.toLowerCase();

            span = baseNodeAbsolute.cloneNode(true);
            span.style.left = Math.max((rect.left + scrollX), scrollX) + "px";
            span.style.top =  Math.max((rect.top  + scrollY), scrollY) + "px";
            fragment.appendChild(span);

            pageHints.push([elem, text, span, null, elem.style.backgroundColor, elem.style.color]);
        }

        if (doc.body)
        {
            doc.body.appendChild(fragment);
            docs.push({ doc: doc, start: start, end: pageHints.length - 1 });
        }

        // also generate hints for frames
        Array.forEach(win.frames, generate);

        return true;
    }

    // TODO: make it aware of imgspans
    function showActiveHint(newID, oldID)
    {
        let oldElem = validHints[oldID - 1];
        if (oldElem)
            setClass(oldElem, false);

        let newElem = validHints[newID - 1];
        if (newElem)
            setClass(newElem, true);
    }

    function setClass(elem, active)
    {
        let prefix = (elem.getAttributeNS(NS.uri, "class") || "") + " ";
        if (active)
            elem.setAttributeNS(NS.uri, "highlight", prefix + "HintActive");
        else
            elem.setAttributeNS(NS.uri, "highlight", prefix + "HintElem");
    }

    function showHints()
    {

        let elem, tagname, text, rect, span, imgspan;
        let hintnum = 1;
        let validHint = hintMatcher(hintString.toLowerCase());
        let activeHint = hintNumber || 1;
        validHints = [];

        for (let [,{ doc: doc, start: start, end: end }] in Iterator(docs))
        {
            let scrollX = doc.defaultView.scrollX;
            let scrollY = doc.defaultView.scrollY;

        inner:
            for (let i in (util.interruptableRange(start, end + 1, 500)))
            {
                let hint = pageHints[i];
                [elem, text, span, imgspan] = hint;

                let valid = validHint(text);
                span.style.display = (valid ? "" : "none");
                if (imgspan)
                    imgspan.style.display = (valid ? "" : "none");

                if (!valid)
                {
                    elem.removeAttributeNS(NS.uri, "highlight");
                    continue inner;
                }

                if (text == "" && elem.firstChild && elem.firstChild.tagName == "IMG")
                {
                    if (!imgspan)
                    {
                        rect = elem.firstChild.getBoundingClientRect();
                        if (!rect)
                            continue;

                        imgspan = util.xmlToDom(<span highlight="Hint"/>, doc);
                        imgspan.setAttributeNS(NS.uri, "class", "HintImage");
                        imgspan.style.left = (rect.left + scrollX) + "px";
                        imgspan.style.top = (rect.top + scrollY) + "px";
                        imgspan.style.width = (rect.right - rect.left) + "px";
                        imgspan.style.height = (rect.bottom - rect.top) + "px";
                        hint[IMGSPAN] = imgspan;
                        span.parentNode.appendChild(imgspan);
                    }
                    setClass(imgspan, activeHint == hintnum);
                }

                span.setAttribute("number", hintnum);
                if (imgspan)
                    imgspan.setAttribute("number", hintnum);
                else
                    setClass(elem, activeHint == hintnum);
                validHints.push(elem);
                hintnum++;
            }
        }

        // TODO: is it better to set up an observer for this property and set
        // 'usermode' appropriately? We're generally not very well integrated
        // into FF so having menu items toggle Vimperator options may be
        // confusing. --djk
        if (getBrowser().markupDocumentViewer.authorStyleDisabled)
        {
            let css = [];
            // FIXME: Broken for imgspans.
            for (let [,{ doc: doc }] in Iterator(docs))
            {
                for (let elem in buffer.evaluateXPath("//*[@liberator:highlight and @number]", doc))
                {
                    let group = elem.getAttributeNS(NS.uri, "highlight");
                    css.push(highlight.selector(group) + "[number='" + elem.getAttribute("number") + "'] { " + elem.style.cssText + " }");
                }
            }
            styles.addSheet(true, "hint-positions", "*", css.join("\n"));
        }

        return true;
    }

    function removeHints(timeout)
    {
        let firstElem = validHints[0] || null;

        for (let [,{ doc: doc, start: start, end: end }] in Iterator(docs))
        {
            for (let elem in buffer.evaluateXPath("//*[@liberator:highlight='hints']", doc))
                elem.parentNode.removeChild(elem);
            for (let i in util.range(start, end + 1))
            {
                let hint = pageHints[i];
                if (!timeout || hint[ELEM] != firstElem)
                    hint[ELEM].removeAttributeNS(NS.uri, "highlight");
            }

            // animate the disappearance of the first hint
            if (timeout && firstElem)
                setTimeout(function () { firstElem.removeAttributeNS(NS.uri, "highlight"); }, timeout);
        }
        styles.removeSheet(true, "hint-positions");

        reset();
    }

    function processHints(followFirst)
    {
        if (validHints.length == 0)
        {
            liberator.beep();
            return false;
        }

        if (options["followhints"] > 0)
        {
            if (!followFirst)
                return false; // no return hit; don't examine uniqueness

            // OK. return hit. But there's more than one hint, and
            // there's no tab-selected current link. Do not follow in mode 2
            if (options["followhints"] == 2 && validHints.length > 1 && !hintNumber)
                return liberator.beep();
        }

        if (!followFirst)
        {
            let firstHref = validHints[0].getAttribute("href") || null;
            if (firstHref)
            {
                if (validHints.some(function (e) e.getAttribute("href") != firstHref))
                    return false;
            }
            else if (validHints.length > 1)
            {
                return false;
            }
        }

        let timeout = followFirst || events.feedingKeys ? 0 : 500;
        let activeIndex = (hintNumber ? hintNumber - 1 : 0);
        let elem = validHints[activeIndex];
        removeHints(timeout);

        if (timeout == 0)
            // force a possible mode change, based on wheter an input field has focus
            events.onFocusChange();
        setTimeout(function () {
            if (modes.extended & modes.HINTS)
                modes.reset();
            hintMode.action(elem, elem.href || "", extendedhintCount);
        }, timeout);
        return true;
    }

    function onInput (event)
    {
        prevInput = "text";

        // clear any timeout which might be active after pressing a number
        if (activeTimeout)
        {
            clearTimeout(activeTimeout);
            activeTimeout = null;
        }

        hintNumber = 0;
        hintString = commandline.command;
        updateStatusline();
        showHints();
        if (validHints.length == 1)
            processHints(false);
    }

    function hintMatcher(hintString) //{{{
    {
        function tokenize(pat, string) string.split(pat).map(String.toLowerCase);
        function containsMatcher(hintString) //{{{
        {
            let tokens = tokenize(/\s+/, hintString);
            return function (linkText)
            {
                linkText = linkText.toLowerCase();
                return tokens.every(function (token) linkText.indexOf(token) >= 0);
            };
        } //}}}

        function wordStartsWithMatcher(hintString, allowWordOverleaping) //{{{
        {
            let hintStrings    = tokenize(/\s+/, hintString);
            let wordSplitRegex = RegExp(options["wordseparators"]);

            // What the **** does this do? --Kris
            function charsAtBeginningOfWords(chars, words, allowWordOverleaping)
            {
                let charIdx         = 0;
                let numMatchedWords = 0;
                for (let [,word] in Iterator(words))
                {
                    if (word.length == 0)
                        continue;

                    let wcIdx = 0;
                    // Check if the current word matches same characters as the previous word.
                    // Each already matched word has matched at least one character.
                    if (charIdx > numMatchedWords)
                    {
                        let matchingStarted = false;
                        for (let i in util.range(numMatchedWords, charIdx))
                        {
                            if (chars[i] == word[wcIdx])
                            {
                                matchingStarted = true;
                                wcIdx++;
                            }
                            else if (matchingStarted)
                            {
                                wcIdx = 0;
                                break;
                            }
                        }
                    }

                    // the current word matches same characters as the previous word
                    let prevCharIdx;
                    if (wcIdx > 0)
                    {
                        prevCharIdx = charIdx;
                        // now check if it matches additional characters
                        for (; wcIdx < word.length && charIdx < chars.length; wcIdx++, charIdx++)
                        {
                            if (word[wcIdx] != chars[charIdx])
                                break;
                        }

                        // the word doesn't match additional characters, now check if the
                        // already matched characters are equal to the next characters for matching,
                        // if yes, then consume them
                        if (prevCharIdx == charIdx)
                        {
                            for (let i = 0; i < wcIdx && charIdx < chars.length; i++, charIdx++)
                            {
                                if (word[i] != chars[charIdx])
                                    break;
                            }
                        }

                        numMatchedWords++;
                    }
                    // the current word doesn't match same characters as the previous word, just
                    // try to match the next characters
                    else
                    {
                        prevCharIdx = charIdx;
                        for (let i = 0; i < word.length && charIdx < chars.length; i++, charIdx++)
                        {
                            if (word[i] != chars[charIdx])
                                break;
                        }

                        if (prevCharIdx == charIdx)
                        {
                            if (!allowWordOverleaping)
                                return false;
                        }
                        else
                            numMatchedWords++;
                    }

                    if (charIdx == chars.length)
                        return true;
                }

                return (charIdx == chars.length);
            }

            function stringsAtBeginningOfWords(strings, words, allowWordOverleaping)
            {
                let strIdx = 0;
                for (let [,word] in Iterator(words))
                {
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

                for (; strIdx < strings.length; strIdx++)
                {
                    if (strings[strIdx].length != 0)
                        return false;
                }
                return true;
            }

            return function (linkText)
            {
                liberator.dump(hintStrings);

                if (hintStrings.length == 1 && hintStrings[0].length == 0)
                    return true;

                let words = tokenize(wordSplitRegex, linkText);
                if (hintStrings.length == 1)
                    return charsAtBeginningOfWords(hintStrings[0], words, allowWordOverleaping);
                else
                    return stringsAtBeginningOfWords(hintStrings, words, allowWordOverleaping);
            };
        } //}}}

        switch (options["hintmatching"])
        {
            case "contains"      : return containsMatcher(hintString);
            case "wordstartswith": return wordStartsWithMatcher(hintString, /*allowWordOverleaping=*/ true);
            case "firstletters"  : return wordStartsWithMatcher(hintString, /*allowWordOverleaping=*/ false);
            case "custom"        : return liberator.plugins.customHintMatcher(hintString);
            default              : liberator.echoerr("Invalid hintmatching type: " + hintMatching);
        }
        return null;
    } //}}}

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const DEFAULT_HINTTAGS = "//*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @role='link'] | " +
                             "//input[not(@type='hidden')] | //a | //area | //iframe | //textarea | //button | //select | " +
                             "//xhtml:input[not(@type='hidden')] | //xhtml:a | //xhtml:area | //xhtml:iframe | //xhtml:textarea | //xhtml:button | //xhtml:select";

    options.add(["extendedhinttags", "eht"],
        "XPath string of hintable elements activated by ';'",
        "string", DEFAULT_HINTTAGS);

    options.add(["hinttags", "ht"],
        "XPath string of hintable elements activated by 'f' and 'F'",
        "string", DEFAULT_HINTTAGS);

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
                ["0", "Follow the first hint as soon as typed text uniquely identifies it. Follow the selected hint on [m]<Return>[m]."],
                ["1", "Follow the selected hint on [m]<Return>[m]."],
                ["2", "Follow the selected hint on [m]<Return>[m] only it's been [m]<Tab>[m]-selected."]
            ],
            validator: function (value) Option.validateCompleter
        });

    options.add(["hintmatching", "hm"],
        "How links are matched",
        "string", "contains",
        {
            completer: function (filter)
            {
                return [[m, ""] for each (m in ["contains", "wordstartswith", "firstletters", "custom"])];
            },
            validator: Option.validateCompleter
        });

    options.add(["wordseparators", "wsp"],
        "How words are split for hintmatching",
        "string", '[.,!?:;/"^$%&?()[\\]{}<>#*+|=~ _-]');

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    mappings.add(myModes, ["f"],
        "Start QuickHint mode",
        function () { hints.show("o"); });

    mappings.add(myModes, ["F"],
        "Start QuickHint mode, but open link in a new tab",
        function () { hints.show("t"); });

    mappings.add(myModes, [";"],
        "Start an extended hint mode",
        function (count)
        {
            extendedhintCount = count;
            commandline.input(";", function (arg) { setTimeout(function () hints.show(arg), 0); },
                {
                    promptHighlight: "Normal",
                    completer: function (context)
                    {
                        context.compare = function () 0;
                        context.completions = [[k, v.prompt] for ([k, v] in Iterator(hintModes))];
                    },
                    onChange: function () { modes.pop() }
                });
        }, { flags: Mappings.flags.COUNT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        addMode: function (mode)
        {
            hintModes[mode] = Mode.apply(Mode, Array.slice(arguments, 1));
        },

        show: function (minor, filter, win)
        {
            hintMode = hintModes[minor];
            if (!hintMode)
            {
                liberator.beep();
                return;
            }
            commandline.input(hintMode.prompt + ": ", null, { onChange: onInput });
            modes.extended = modes.HINTS;

            submode = minor;
            hintString = filter || "";
            hintNumber = 0;
            usedTab = false;
            prevInput = "";
            canUpdate = false;

            generate(win);

            // get all keys from the input queue
            liberator.threadYield(true);

            canUpdate = true;
            showHints();

            if (validHints.length == 0)
            {
                liberator.beep();
                modes.reset();
                return false;
            }
            else if (validHints.length == 1)
            {
                processHints(true);
                return false;
            }
            else // still hints visible
                return true;
        },

        hide: function ()
        {
            removeHints(0);
        },

        onEvent: function (event)
        {
            let key = events.toString(event);
            let followFirst = false;

            // clear any timeout which might be active after pressing a number
            if (activeTimeout)
            {
                clearTimeout(activeTimeout);
                activeTimeout = null;
            }

            switch (key)
            {
                case "<Return>":
                    followFirst = true;
                    break;

                case "<Tab>":
                case "<S-Tab>":
                    usedTabKey = true;
                    if (hintNumber == 0)
                        hintNumber = 1;

                    let oldID = hintNumber;
                    if (key == "<Tab>")
                    {
                        if (++hintNumber > validHints.length)
                            hintNumber = 1;
                    }
                    else
                    {
                        if (--hintNumber < 1)
                            hintNumber = validHints.length;
                    }
                    showActiveHint(hintNumber, oldID);
                    updateStatusline();
                    return;

                case "<BS>":
                    if (hintNumber > 0 && !usedTabKey)
                    {
                        hintNumber = Math.floor(hintNumber / 10);
                        if (hintNumber == 0)
                            prevInput = "text";
                    }
                    else
                    {
                        usedTabKey = false;
                        hintNumber = 0;
                        liberator.beep();
                        return;
                    }
                    break;

               case mappings.getMapLeader():
                   hints.escNumbers = !hints.escNumbers;
                   if (hints.escNumbers && usedTabKey) // hintNumber not used normally, but someone may wants to toggle
                       hintNumber = 0;            // <tab>s ? reset. Prevent to show numbers not entered.

                   updateStatusline();
                   return;

                default:
                    if (/^\d$/.test(key))
                    {
                        prevInput = "number";

                        let oldHintNumber = hintNumber;
                        if (hintNumber == 0 || usedTabKey)
                        {
                            usedTabKey = false;
                            hintNumber = parseInt(key, 10);
                        }
                        else
                            hintNumber = (hintNumber * 10) + parseInt(key, 10);

                        updateStatusline();

                        if (!canUpdate)
                            return;

                        if (docs.length == 0)
                        {
                            generate();
                            showHints();
                        }
                        showActiveHint(hintNumber, oldHintNumber || 1);

                        if (hintNumber == 0 || hintNumber > validHints.length)
                        {
                            liberator.beep();
                            return;
                        }

                        // if we write a numeric part like 3, but we have 45 hints, only follow
                        // the hint after a timeout, as the user might have wanted to follow link 34
                        if (hintNumber > 0 && hintNumber * 10 <= validHints.length)
                        {
                            let timeout = options["hinttimeout"];
                            if (timeout > 0)
                                activeTimeout = setTimeout(function () { processHints(true); }, timeout);

                            return false;
                        }
                        // we have a unique hint
                        processHints(true);
                        return;
                    }
            }

            updateStatusline();

            if (canUpdate)
            {
                if (docs.length == 0 && hintString.length > 0)
                    generate();

                showHints();
                processHints(followFirst);
            }
        }
    };

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
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
