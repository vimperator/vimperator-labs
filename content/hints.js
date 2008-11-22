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

function Hints() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const ELEM = 0, TEXT = 1, SPAN = 2, IMGSPAN = 3, BGCOLOR = 4, COLOR = 5;

    var myModes = config.browserModes;

    var hintMode;
    var submode    = ""; // used for extended mode, can be "o", "t", "y", etc.
    var hintString = ""; // the typed string part of the hint is in this string
    var hintNumber = 0;  // only the numerical part of the hint
    var usedTabKey = false; // when we used <Tab> to select an element
    var prevInput = "";    // record previous user input type, "text" || "number"

    // hints[] = [elem, text, span, imgspan, elem.style.backgroundColor, elem.style.color]
    var pageHints = [];
    var validHints = []; // store the indices of the "hints" array with valid elements

    var escapeNumbers = false; // escape mode for numbers. true -> treated as hint-text
    var activeTimeout = null;  // needed for hinttimeout > 0
    var canUpdate = false;

    // keep track of the documents which we generated the hints for
    // docs = { doc: document, start: start_index in hints[], end: end_index in hints[] }
    var docs = [];

    const Mode = new Struct("prompt", "action", "tags");
    Mode.defaultValue("tags", function () function () options.hinttags);
    function extended() options.extendedhinttags;
    const hintModes = {
        ";": Mode("Focus hint",		    		 function (elem) buffer.focusElement(elem),                             extended),
        a: Mode("Save hint with prompt",		 function (elem) buffer.saveLink(elem, false)),
        s: Mode("Save hint",					 function (elem) buffer.saveLink(elem, true)),
        o: Mode("Follow hint",					 function (elem) buffer.followLink(elem, liberator.CURRENT_TAB)),
        t: Mode("Follow hint in a new tab",		 function (elem) buffer.followLink(elem, liberator.NEW_TAB)),
        b: Mode("Follow hint in a background tab",	 function (elem) buffer.followLink(elem, liberator.NEW_BACKGROUND_TAB)),
        v: Mode("View hint source",				 function (elem, loc) buffer.viewSource(loc, false),                    extended),
        V: Mode("View hint source",				 function (elem, loc) buffer.viewSource(loc, true),                     extended),
        w: Mode("Follow hint in a new window",	 function (elem) buffer.followLink(elem, liberator.NEW_WINDOW),         extended),

        "?": Mode("Show information for hint",	 function (elem) buffer.showElementInfo(elem),                          extended),
        O: Mode("Open location based on hint",	 function (elem, loc) commandline.open(":", "open " + loc, modes.EX)),
        T: Mode("Open new tab based on hint",	 function (elem, loc) commandline.open(":", "tabopen " + loc, modes.EX)),
        W: Mode("Open new window based on hint", function (elem, loc) commandline.open(":", "winopen " + loc, modes.EX)),
        y: Mode("Yank hint location",			 function (elem, loc) util.copyToClipboard(loc, true)),
        Y: Mode("Yank hint description",		 function (elem) util.copyToClipboard(elem.textContent || "", true),    extended),
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
        escapeNumbers = false;

        if (activeTimeout)
            clearTimeout(activeTimeout);
        activeTimeout = null;
    }

    function updateStatusline()
    {
        statusline.updateInputBuffer((escapeNumbers ? mappings.getMapLeader() : "") + (hintNumber || ""));
    }

    function generate(win)
    {
        if (!win)
            win = window.content;

        var doc = win.document;
        var height = win.innerHeight;
        var width  = win.innerWidth;
        var scrollX = doc.defaultView.scrollX;
        var scrollY = doc.defaultView.scrollY;

        var baseNodeAbsolute = util.xmlToDom(
            <span class="liberator-hint"/>, doc);

        var elem, tagname, text, span, rect;
        var res = buffer.evaluateXPath(hintMode.tags(), doc, null, true);

        var fragment = doc.createDocumentFragment();
        var start = pageHints.length;
        for (let elem in res)
        {
            // TODO: for iframes, this calculation is wrong
            rect = elem.getBoundingClientRect();
            if (!rect || rect.top > height || rect.bottom < 0 || rect.left > width || rect.right < 0)
                continue;

            rect = elem.getClientRects()[0];
            if (!rect)
                continue;

            var computedStyle = doc.defaultView.getComputedStyle(elem, null);
            if (computedStyle.getPropertyValue("visibility") == "hidden" || computedStyle.getPropertyValue("display") == "none")
                continue;

            // TODO: mozilla docs recommend localName instead of tagName
            tagname = elem.tagName.toLowerCase();
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
            span.style.left = (rect.left + scrollX) + "px";
            span.style.top = (rect.top + scrollY) + "px";
            fragment.appendChild(span);

            pageHints.push([elem, text, span, null, elem.style.backgroundColor, elem.style.color]);
        }

        doc.body.appendChild(fragment);
        docs.push({ doc: doc, start: start, end: pageHints.length - 1 });

        // also generate hints for frames
        Array.forEach(win.frames, function (frame) { generate(frame); });

        return true;
    }

    // TODO: make it aware of imgspans
    function showActiveHint(newID, oldID)
    {
        var oldElem = validHints[oldID - 1];
        if (oldElem)
            oldElem.style.backgroundColor = options["linkbgcolor"];

        var newElem = validHints[newID - 1];
        if (newElem)
            newElem.style.backgroundColor = options["activelinkbgcolor"];
    }

    function showHints()
    {
        var linkfgcolor       = options["linkfgcolor"];
        var linkbgcolor       = options["linkbgcolor"];
        var activelinkfgcolor = options["activelinkfgcolor"];
        var activelinkbgcolor = options["activelinkbgcolor"];

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

                if (!validHint(text))
                {
                    span.style.display = "none";
                    if (imgspan)
                        imgspan.style.display = "none";

                    // reset background color
                    elem.style.backgroundColor = hint[BGCOLOR];
                    elem.style.color = hint[COLOR];
                    continue inner;
                }

                if (text == "" && elem.firstChild && elem.firstChild.tagName == "IMG")
                {
                    if (!imgspan)
                    {
                        rect = elem.firstChild.getBoundingClientRect();
                        if (!rect)
                            continue;

                        imgspan = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
                        imgspan.style.position = "absolute";
                        imgspan.style.opacity = 0.5;
                        imgspan.style.zIndex = "10000000";
                        imgspan.style.left = (rect.left + scrollX) + "px";
                        imgspan.style.top = (rect.top + scrollY) + "px";
                        imgspan.style.width = (rect.right - rect.left) + "px";
                        imgspan.style.height = (rect.bottom - rect.top) + "px";
                        imgspan.className = "liberator-hint";
                        hint[IMGSPAN] = imgspan;
                        doc.body.appendChild(imgspan);
                    }
                    imgspan.style.backgroundColor = (activeHint == hintnum) ? activelinkbgcolor : linkbgcolor;
                    imgspan.style.display = "inline";
                }

                if (!imgspan)
                    elem.style.backgroundColor = (activeHint == hintnum) ? activelinkbgcolor : linkbgcolor;
                elem.style.color = (activeHint == hintnum) ? activelinkfgcolor : linkfgcolor;
                span.textContent = String(hintnum++);
                span.style.display = "inline";
                validHints.push(elem);
            }
        }

        return true;
    }

    function removeHints(timeout)
    {
        var firstElem = validHints[0] || null;
        var firstElemBgColor = "";
        var firstElemColor = "";

        for (let [,{ doc: doc, start: start, end: end }] in Iterator(docs))
        {
            for (let i in util.range(start, end + 1))
            {
                let hint = pageHints[i];
                // remove the span for the numeric display part
                doc.body.removeChild(hint[SPAN]);
                if (hint[IMGSPAN]) // a transparent span for images
                    doc.body.removeChild(hint[IMGSPAN]);

                if (timeout && firstElem == hint[ELEM])
                {
                    firstElemBgColor = hint[BGCOLOR];
                    firstElemColor = hint[COLOR];
                }
                else
                {
                    // restore colors
                    var elem = hint[ELEM];
                    elem.style.backgroundColor = hint[BGCOLOR];
                    elem.style.color = hint[COLOR]; }
            }

            // animate the disappearance of the first hint
            if (timeout && firstElem)
            {
                // USE THIS FOR MAKING THE SELECTED ELEM RED
                //                firstElem.style.backgroundColor = "red";
                //                firstElem.style.color = "white";
                //                setTimeout(function () {
                //                        firstElem.style.backgroundColor = firstElemBgColor;
                //                        firstElem.style.color = firstElemColor;
                //                }, 200);
                // OR USE THIS FOR BLINKING:
                //                var counter = 0;
                //                var id = setInterval(function () {
                //                    firstElem.style.backgroundColor = "red";
                //                    if (counter % 2 == 0)
                //                        firstElem.style.backgroundColor = "yellow";
                //                    else
                //                        firstElem.style.backgroundColor = "#88FF00";
                //
                //                    if (counter++ >= 2)
                //                    {
                //                        firstElem.style.backgroundColor = firstElemBgColor;
                //                        firstElem.style.color = firstElemColor;
                //                        clearTimeout(id);
                //                    }
                //                }, 100);
                setTimeout(function () {
                    firstElem.style.backgroundColor = firstElemBgColor;
                    firstElem.style.color = firstElemColor;
                }, timeout);
            }
        }

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

            // OK. return hit. But there's more than one hint. And
            // there's no tab-selected current link. Do not follow in mode 2
            if ((options["followhints"] == 2) && validHints.length > 1 && !hintNumber)
                return liberator.beep();
        }
    
        if (!followFirst)
        {
            var firstHref = validHints[0].getAttribute("href") || null;
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

        var timeout = followFirst || events.feedingKeys ? 0 : 500;
        var activeIndex = (hintNumber ? hintNumber - 1 : 0);
        var elem = validHints[activeIndex];
        removeHints(timeout);

        if (timeout == 0)
            // force a possible mode change, based on wheter an input field has focus
            events.onFocusChange();
        setTimeout(function () {
            if (modes.extended & modes.HINTS)
                modes.reset();
            hintMode.action(elem, elem.href || "");
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
        hintString = commandline.getCommand();
        updateStatusline();
        showHints();
        if (validHints.length == 1)
            processHints(false);
    }

    function hintMatcher(hintString) //{{{
    {
        function containsMatcher(hintString) //{{{
        {
            var tokens = hintString.split(/ +/);
            return function (linkText) tokens.every(function (token) linkText.indexOf(token) >= 0);
        } //}}}

        function wordStartsWithMatcher(hintString, allowWordOverleaping) //{{{
        {
            var hintStrings    = hintString.split(/ +/);
            var wordSplitRegex = new RegExp(options["wordseparators"]);

            // What the **** does this do? --Kris
            function charsAtBeginningOfWords(chars, words, allowWordOverleaping)
            {
                var charIdx         = 0;
                var numMatchedWords = 0;
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
                    var prevCharIdx;
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
                var strIdx = 0;
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

            function wordStartsWith(linkText)
            {
                if (hintStrings.length == 1 && hintStrings[0].length == 0)
                    return true;

                let words = linkText.split(wordSplitRegex).map(String.toLowerCase);
                if (hintStrings.length == 1)
                    return charsAtBeginningOfWords(hintStrings[0], words, allowWordOverleaping);
                else
                    return stringsAtBeginningOfWords(hintStrings, words, allowWordOverleaping);
            }

            return wordStartsWith;
        } //}}}

        var hintMatching = options["hintmatching"];
        switch (hintMatching)
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

    const DEFAULT_HINTTAGS = "//*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @class='s'] | " +
                             "//input[not(@type='hidden')] | //a | //area | //iframe | //textarea | //button | //select | " +
                             "//xhtml:*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @class='s'] | " +
                             "//xhtml:input[not(@type='hidden')] | //xhtml:a | //xhtml:area | //xhtml:iframe | //xhtml:textarea | //xhtml:button | //xhtml:select";

    options.add(["extendedhinttags", "eht"],
        "XPath string of hintable elements activated by ';'",
        "string", DEFAULT_HINTTAGS);

    options.add(["hinttags", "ht"],
        "XPath string of hintable elements activated by 'f' and 'F'",
        "string", DEFAULT_HINTTAGS);

    options.add(["hinttimeout", "hto"],
        "Automatically follow non unique numerical hint",
        "number", 0,
        { validator: function (value) value >= 0 });

    options.add(["followhints", "fh"],
        "Change the way when to automatically follow hints",
        "number", 0,
        { validator: function (value) value >= 0 && value < 3 });

    options.add(["linkfgcolor", "lfc"],
        "Foreground color of a link during hint mode",
        "string", "black");

    options.add(["linkbgcolor", "lbc"],
        "Background color of a link during hint mode",
        "string", "yellow");

    options.add(["activelinkfgcolor", "alfc"],
        "Foreground color of the current active link during hint mode",
        "string", "black");

    options.add(["activelinkbgcolor", "albc"],
        "Background color of the current active link during hint mode",
        "string", "#88FF00");

    options.add(["hintmatching", "hm"],
        "How links are matched",
        "string", "contains",
        {
            completer: function (filter)
            {
                return [[m, ""] for each (m in ["contains", "wordstartswith", "firstletters", "custom"])];
            },
            validator: function (value) /^(contains|wordstartswith|firstletters|custom)$/.test(value)
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
        function (arg) { hints.show(arg); },
        { flags: Mappings.flags.ARGUMENT });

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
            commandline.input(hintMode.prompt + ":", null, { onChange: onInput });
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
            var key = events.toString(event);
            var followFirst = false;

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

                    var oldID = hintNumber;
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
                   escapeNumbers = !escapeNumbers;
                   if (escapeNumbers && usedTabKey) // hintNumber not used normally, but someone may wants to toggle
                       hintNumber = 0;            // <tab>s ? reset. Prevent to show numbers not entered.

                   updateStatusline();
                   return;

                default:
                    if (/^\d$/.test(key))
                    {
                        prevInput = "number";

                        var oldHintNumber = hintNumber;
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
                            var timeout = options["hinttimeout"];
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
