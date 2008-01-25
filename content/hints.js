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

vimperator.Hints = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var submode    = ""; // used for extended mode, can be "o", "t", "y", etc.
    var hintString = ""; // the typed string part of the hint is in this string
    var hintNumber = 0;  // only the numerical part of the hint
    var usedTabKey = false; // when we used <Tab> to select an element

    // hints[] = [elem, text, span, imgspan, elem.style.backgroundColor, elem.style.color]
    var hints = [];
    var validHints = []; // store the indices of the "hints" array with valid elements

    var escapeNumbers = false; // escape mode for numbers. true -> treated as hint-text
    var activeTimeout = null;  // needed for hinttimeout > 0
    var canUpdate = false;

    // keep track of the documents which we generated the hints for
    // docs = { doc: document, start: start_index in hints[], end: end_index in hints[] }
    var docs = [];

    // reset all important variables
    function reset()
    {
        vimperator.statusline.updateInputBuffer("");
        hintString = "";
        hintNumber = 0;
        usedTabKey = false;
        hints = [];
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
        vimperator.statusline.updateInputBuffer((escapeNumbers ? vimperator.events.getMapLeader() + " ": "") + // sign for escapeNumbers
                (hintString ? "\"" + hintString + "\"" : "") +
                (hintNumber > 0 ? " <" + hintNumber + ">" : ""));
    }

    function generate(win)
    {
        var startDate = Date.now();

        if (!win)
            win = window.content;

        var doc = win.document;
        var height = win.innerHeight;
        var width  = win.innerWidth;
        var scrollX = doc.defaultView.scrollX;
        var scrollY = doc.defaultView.scrollY;

        var baseNodeAbsolute = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        baseNodeAbsolute.style.backgroundColor = "red";
        baseNodeAbsolute.style.color = "white";
        baseNodeAbsolute.style.position = "absolute";
        baseNodeAbsolute.style.fontSize = "10px";
        baseNodeAbsolute.style.fontWeight = "bold";
        baseNodeAbsolute.style.lineHeight = "10px";
        baseNodeAbsolute.style.padding = "0px 1px 0px 0px";
        baseNodeAbsolute.style.zIndex = "10000001";
        baseNodeAbsolute.style.display = "none";
        baseNodeAbsolute.className = "vimperator-hint";

        var elem, tagname, text, span, rect;
        var res = vimperator.buffer.evaluateXPath(vimperator.options["hinttags"], doc, null, true);
        vimperator.log("evaluated XPath after: " + (Date.now() - startDate) + "ms");

        var fragment = doc.createDocumentFragment();
        var start = hints.length;
        while ((elem = res.iterateNext()) != null)
        {
            // TODO: for frames, this calculation is wrong
            rect = elem.getBoundingClientRect();
            if (!rect || rect.top > height || rect.bottom < 0 || rect.left > width || rect.right < 0)
                continue;

            rect = elem.getClientRects()[0];
            if (!rect)
                continue;

            // TODO: mozilla docs recommend localName instead of tagName
            tagname = elem.tagName.toLowerCase();
            if (tagname == "input" || tagname == "textarea")
                text = elem.value.toLowerCase();
            else if (tagname == "select")
            {
                if (elem.selectedIndex >= 0)
                    text = elem.item(elem.selectedIndex).text.toLowerCase();
                else
                    text = "";
            }
            else
                text = elem.textContent.toLowerCase();

            span = baseNodeAbsolute.cloneNode(true);
            span.style.left = (rect.left + scrollX) + "px";
            span.style.top = (rect.top + scrollY) + "px";
            fragment.appendChild(span);

            hints.push([elem, text, span, null, elem.style.backgroundColor, elem.style.color]);
        }

        doc.body.appendChild(fragment);
        docs.push({ doc: doc, start: start, end: hints.length - 1});

        // also generate hints for frames
        for (var i = 0; i < win.frames.length; i++)
            generate(win.frames[i]);

        vimperator.log("hints.generate() completed after: " + (Date.now() - startDate) + "ms for " + hints.length + " hints.");
        return true;
    }

    // TODO: make it aware of imgspans
    function showActiveHint(newID, oldID)
    {
        var oldElem = validHints[oldID - 1];
        if (oldElem)
            oldElem.style.backgroundColor = "yellow";

        var newElem = validHints[newID - 1];
        if (newElem)
            newElem.style.backgroundColor = "#88FF00";
    }

    function showHints()
    {
        var startDate = Date.now();
        var win = window.content;
        var height = win.innerHeight;
        var width  = win.innerWidth;

        vimperator.log("Show hints matching: " + hintString, 7);

        var elem, tagname, text, rect, span, imgspan;
        var hintnum = 1;
        var findTokens = hintString.split(/ +/);
        var activeHint = hintNumber || 1;
        validHints = [];

        for (var j = 0; j < docs.length; j++)
        {
            var doc = docs[j].doc;
            var start = docs[j].start;
            var end = docs[j].end;
            var scrollX = doc.defaultView.scrollX;
            var scrollY = doc.defaultView.scrollY;

        outer:
            for (var i = start; i <= end; i++)
            {
                elem = hints[i][0];
                text = hints[i][1];
                span = hints[i][2];
                imgspan = hints[i][3];

                for (var k = 0; k < findTokens.length; k++)
                {
                    if (text.indexOf(findTokens[k]) < 0)
                    {
                        span.style.display = "none";
                        if (imgspan)
                            imgspan.style.display = "none";

                        // reset background color
                        elem.style.backgroundColor = hints[i][4];
                        elem.style.color = hints[i][5];
                        continue outer;
                    }
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
                        imgspan.className = "vimperator-hint";
                        hints[i][3] = imgspan;
                        doc.body.appendChild(imgspan);
                    }
                    imgspan.style.backgroundColor = (activeHint == hintnum) ? "#88FF00" : "yellow";
                    imgspan.style.display = "inline";
                }

                if (!imgspan)
                    elem.style.backgroundColor = (activeHint == hintnum) ? "#88FF00" : "yellow";
                elem.style.color = "black";
                span.textContent = "" + (hintnum++);
                span.style.display = "inline";
                validHints.push(elem);
            }
        }

        vimperator.log("showHints() completed after: " + (Date.now() - startDate) + "ms");
        return true;
    }

    function removeHints(timeout)
    {
        var firstElem = validHints[0] || null;
        var firstElemBgColor = "";
        var firstElemColor = "";

        for (var j = 0; j < docs.length; j++)
        {
            var doc = docs[j].doc;
            var start = docs[j].start;
            var end = docs[j].end;

            for (var i = start; i <= end; i++)
            {
                // remove the span for the numeric display part
                doc.body.removeChild(hints[i][2]);
                if (hints[i][3]) // a transparent span for images
                    doc.body.removeChild(hints[i][3]);

                if (timeout && firstElem == hints[i][0])
                {
                    firstElemBgColor = hints[i][4];
                    firstElemColor = hints[i][5];
                }
                else
                {
                    // restore colors
                    var elem = hints[i][0];
                    elem.style.backgroundColor = hints[i][4];
                    elem.style.color = hints[i][5];
                }
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

        vimperator.log("removeHints() done");
        reset();
    }

    function processHints(followFirst)
    {
        if (validHints.length == 0)
        {
            vimperator.beep();
            return false;
        }

        if (!followFirst)
        {
            var firstHref = validHints[0].getAttribute("href") || null;
            if (firstHref)
            {
                if (validHints.some(function (e) { return e.getAttribute("href") != firstHref; }))
                    return false;
            }
            else if (validHints.length > 1)
                return false;
        }

        var timeout = followFirst ? 0 : 500;
        var activeIndex = (hintNumber ? hintNumber - 1 : 0);
        var elem = validHints[activeIndex];
        var loc = elem.href || "";
        switch (submode)
        {
            // TODO: move/rename those helper functions to a better place
            case ";": vimperator.buffer.focusElement(elem); break;
            case "?": vimperator.buffer.showElementInfo(elem); break;
            case "a": vimperator.buffer.saveLink(elem, false); break;
            case "s": vimperator.buffer.saveLink(elem, true); break;
            case "o": vimperator.buffer.followLink(elem, vimperator.CURRENT_TAB); break;
            case "O": vimperator.commandline.open(":", "open " + loc, vimperator.modes.EX); break;
            case "t": vimperator.buffer.followLink(elem, vimperator.NEW_TAB); break;
            case "T": vimperator.commandline.open(":", "tabopen " + loc, vimperator.modes.EX); break;
            case "v": vimperator.commands.viewsource(loc); break;
            case "V": vimperator.commands.viewsource(loc, true); break;
            case "w": vimperator.buffer.followLink(elem, vimperator.NEW_WINDOW);  break;
            case "W": vimperator.commandline.open(":", "winopen " + loc, vimperator.modes.EX); break;
            case "y": setTimeout(function(){vimperator.copyToClipboard(loc, true)}, timeout + 50); break;
            case "Y": setTimeout(function(){vimperator.copyToClipboard(elem.textContent || "", true)}, timeout + 50); break;
            default:
                vimperator.echoerr("INTERNAL ERROR: unknown submode: " + submode);
        }
        removeHints(timeout);

        if (vimperator.modes.extended & vimperator.modes.ALWAYS_HINT)
        {
            setTimeout(function () {
                canUpdate = true;
                hintString = "";
                hintNumber = 0;
                vimperator.statusline.updateInputBuffer("");
            }, timeout);
        }
        else
        {
            if (timeout == 0 || vimperator.modes.isReplaying)
            {
                // force a possible mode change, based on wheter an input field has focus
                vimperator.events.onFocusChange();
                if (vimperator.mode == vimperator.modes.HINTS)
                    vimperator.modes.reset(false);
            }
            else
            {
                vimperator.modes.add(vimperator.modes.INACTIVE_HINT);
                setTimeout(function () {
                    if (vimperator.mode == vimperator.modes.HINTS)
                        vimperator.modes.reset(false);
                }, timeout);
            }
        }

        return true;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // TODO: implement framesets
        show: function (mode, minor, filter)
        {
            if (mode == vimperator.modes.EXTENDED_HINT && !/^[;?asoOtTvVwWyY]$/.test(minor))
            {
                vimperator.beep();
                return;
            }

            vimperator.modes.set(vimperator.modes.HINTS, mode);
            submode = minor || "o"; // open is the default mode
            hintString = filter || "";
            hintNumber = 0;
            canUpdate = false;

            generate();

            // get all keys from the input queue
            var mt = Components.classes["@mozilla.org/thread-manager;1"].getService().mainThread;
            while (mt.hasPendingEvents())
                mt.processNextEvent(true);

            canUpdate = true;
            showHints();

            if (validHints.length == 0)
            {
                vimperator.beep();
                vimperator.modes.reset();
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
            var key = vimperator.events.toString(event);
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

                case "<Space>":
                    hintString += " ";
                    escapeNumbers = false;
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
                    return;

                case "<BS>":
                    if (hintNumber > 0 && !usedTabKey)
                    {
                        hintNumber = Math.floor(hintNumber / 10);
                    }
                    else if (hintString != "")
                    {
                        usedTabKey = false;
                        hintNumber = 0;
                        hintString = hintString.substr(0, hintString.length - 1);
                    }
                    else
                    {
                        usedTabKey = false;
                        hintNumber = 0;
                        vimperator.beep();
                        return;
                    }
                    break;

                case "<C-w>":
                case "<C-u>":
                    hintString = "";
                    hintNumber = 0;
                    break;

               case vimperator.events.getMapLeader():
                   escapeNumbers = !escapeNumbers;
                   if (escapeNumbers && usedTabKey) // hintNumber not used normally, but someone may wants to toggle
                       hintNumber = 0;            // <tab>s ? reset. Prevent to show numbers not entered.

                   updateStatusline();
                   return;

                default:
                    // pass any special or ctrl- etc. prefixed key back to the main vimperator loop
                    if (/^<./.test(key) || key == ":")
                    {
                        var map = null;
                        if ((map = vimperator.mappings.get(vimperator.modes.NORMAL, key)) ||
                            (map = vimperator.mappings.get(vimperator.modes.HINTS, key)))
                        {
                            map.execute(null, -1);
                            return;
                        }

                        vimperator.beep();
                        return;
                    }

                    if (/^[0-9]$/.test(key) && !escapeNumbers)
                    {
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
                            vimperator.beep();
                            return;
                        }

                        // if we write a numeric part like 3, but we have 45 hints, only follow
                        // the hint after a timeout, as the user might have wanted to follow link 34
                        if (hintNumber > 0 && hintNumber * 10 <= validHints.length)
                        {
                            var timeout = vimperator.options["hinttimeout"];
                            if (timeout > 0)
                                activeTimeout = setTimeout(function () { processHints(true); }, timeout);

                            return false;
                        }
                        // we have a unique hint
                        processHints(true);
                        return;
                    }

                    hintString += key;
                    hintNumber = 0; // after some text input
                    if (usedTabKey)
                    {
                        usedTabKey = false;
                        showActiveHint(1, hintNumber);
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
