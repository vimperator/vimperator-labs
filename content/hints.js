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

(c) 2006-2007: Martin Stubenschrott <stubenschrott@gmx.net>

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

vimperator.Hints = function() //{{{
{
    var hintString = ""; // the typed string part of the hint is in this string
    var hintNumber = 0;  // only the numerical part of the hint
    var submode    = ""; // used for extended mode, can be "o", "t", "y", etc.

    // hints[] = [elem, text, span, imgspan, elem.style.backgroundColor, elem.style.color]
    var hints = [];
    var valid_hints = []; // store the indices of the "hints" array with valid elements
    
    var canUpdate = false;
    var hintsGenerated = false;
    var docs = []; // keep track of the documents which we display the hints for

    // this function 'click' an element, which also works
    // for javascript links
    function openHint(new_tab, new_window)
    {
        if (valid_hints.length < 1)
            return false;

        var x = 0, y = 0;
        var elem = valid_hints[hintNumber - 1] || valid_hints[0];
        var elemTagName = elem.localName.toLowerCase();
        elem.focus();
        if (elemTagName == 'frame' || elemTagName == 'iframe')
            return 0;

        // for imagemap
        if (elemTagName == 'area')
        {
            var coords = elem.getAttribute("coords").split(",");
            x = Number(coords[0]);
            y = Number(coords[1]);
        }
        doc = window.content.document;
        view = window.document.defaultView;

        var evt = doc.createEvent('MouseEvents');
        evt.initMouseEvent('mousedown', true, true, view, 1, x+1, y+1, 0, 0, /*ctrl*/ new_tab, /*event.altKey*/0, /*event.shiftKey*/ new_window, /*event.metaKey*/ new_tab, 0, null);
        elem.dispatchEvent(evt);

        var evt = doc.createEvent('MouseEvents');
        evt.initMouseEvent('click', true, true, view, 1, x+1, y+1, 0, 0, /*ctrl*/ new_tab, /*event.altKey*/0, /*event.shiftKey*/ new_window, /*event.metaKey*/ new_tab, 0, null);
        elem.dispatchEvent(evt);

        return true;
    }

    function focusHint()
    {
        if (valid_hints.length < 1)
            return false;

        var elem = valid_hints[hintNumber - 1] || valid_hints[0];
        var doc = window.content.document;
        var elemTagName = elem.localName.toLowerCase();
        if (elemTagName == 'frame' || elemTagName == 'iframe')
        {
            elem.contentWindow.focus();
            return;
        }
        else
        {
            elem.focus();
        }

        var evt = doc.createEvent('MouseEvents');
        var x = 0;
        var y = 0;
        // for imagemap
        if (elemTagName == 'area')
        {
            var coords = elem.getAttribute("coords").split(",");
            x = Number(coords[0]);
            y = Number(coords[1]);
        }

        evt.initMouseEvent('mouseover', true, true, doc.defaultView, 1, x, y, 0, 0, 0, 0, 0, 0, 0, null);
        elem.dispatchEvent(evt);
    }

    function yankHint(text)
    {
        if (valid_hints.length < 1)
            return false;

        var elem = valid_hints[hintNumber - 1] || valid_hints[0];
        if (text)
            var loc = elem.href;
        else
            var loc = elem.textContent;

        vimperator.copyToClipboard(loc);
        vimperator.echo("Yanked " + loc, vimperator.commandline.FORCE_SINGLELINE);
    }

    function saveHint(skip_prompt)
    {
        if (valid_hints.length < 1)
            return false;

        var elem = valid_hints[hintNumber - 1] || valid_hints[0];
        var doc  = elem.ownerDocument;
        var url = makeURLAbsolute(elem.baseURI, elem.href);
        var text = elem.textContent;

        try
        {
            urlSecurityCheck(url, doc.nodePrincipal);
            saveURL(url, text, null, true, skip_prompt, makeURI(url, doc.characterSet));
        }
        catch (e)
        {
            vimperator.echoerr(e);
        }
    }
    
    function generate(win)
    {
        if (hintsGenerated)
            return;

        if (!win)
            win = window.content;

        var doc = win.document;
        docs.push(doc);

        var baseNodeAbsolute = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        baseNodeAbsolute.style.backgroundColor = "red";
        baseNodeAbsolute.style.color = "white";
        baseNodeAbsolute.style.position = "absolute";
        baseNodeAbsolute.style.fontSize = "10px";
        baseNodeAbsolute.style.fontWeight = "bold";
        baseNodeAbsolute.style.lineHeight = "10px";
        baseNodeAbsolute.style.padding = "0px 1px 0px 0px";
        baseNodeAbsolute.style.zIndex = "10000001";
        baseNodeAbsolute.className = "vimperator-hint";

        var res = vimperator.buffer.evaluateXPath(vimperator.options["hinttags"], doc, null, true);
        var elem, tagname, text, span, rect;
        vimperator.log("Hinting " + res.snapshotLength + " items on " + doc.title);

        var height = window.content.innerHeight;
        var width  = window.content.innerWidth;
        hints = [];

        for (var i = 0; i < res.snapshotLength; i++)
        {
            elem = res.snapshotItem(i);
            rect = elem.getBoundingClientRect();
            if (!rect || rect.bottom < 0 || rect.top > height || rect.right < 0 || rect.left > width)
                continue;

            rect = elem.getClientRects()[0];
            if (!rect)
                continue;

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
            span.innerHTML = "";
            span.style.display = "none";
            doc.body.appendChild(span);

            hints.push([elem, text, span, null, elem.style.backgroundColor, elem.style.color]);
        }

        hintsGenerated = true;
        return true;
    }

    // reset all important variables
    function reset()
    {
        vimperator.statusline.updateInputBuffer("");
        hintString = "";
        hintNumber = 0;
        hints = [];
        valid_hints = [];
        canUpdate = false;
        hintsGenerated = false;
    }

    // no safety checks are done, be careful with this function
    // TODO: make it aware of imgspans
    function showActiveHint(newID, oldID)
    {
        var oldElem = valid_hints[oldID - 1];
        var newElem = valid_hints[newID - 1];
        oldElem.style.backgroundColor = "yellow";
        newElem.style.backgroundColor = "#88FF00";
    }

    function showHints(win, start_idx)
    {
        if (!win)
            win = window.content;

        if (win.document.body.localName.toLowerCase() == "frameset")
        {
//        for (i = 0; i < win.frames.length; i++)
//            removeHints(win.frames[i]);
            vimperator.echo("hint support for frameset pages not fully implemented yet");
        }

        vimperator.log("Show hints matching: " + hintString, 7);

        var doc = win.document;
        var scrollX = doc.defaultView.scrollX;
        var scrollY = doc.defaultView.scrollY;

        var elem, tagname, text, rect, span, imgspan;
        var hintnum = start_idx > 0 ? start_idx : 1;

        var height = window.content.innerHeight;
        var width  = window.content.innerWidth;
        var find_tokens = hintString.split(/ +/);
        valid_hints = [];

outer:
        for (var i = 0; i < hints.length; i++)
        {
            elem = hints[i][0];
            text = hints[i][1];
            span = hints[i][2];
            imgspan = hints[i][3];

            for (var k = 0; k < find_tokens.length; k++)
            {
                if (text.indexOf(find_tokens[k]) < 0)
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
                rect = elem.firstChild.getBoundingClientRect();
                if (!rect)
                    continue;

                if (!imgspan)
                {
                    imgspan = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
                    imgspan.style.backgroundColor = "yellow";
                    imgspan.style.position = "absolute";
                    imgspan.style.opacity = 0.5;
                    imgspan.style.zIndex = "10000000";
                    imgspan.className = "vimperator-hint";
                    hints[i][3] = imgspan;
                    doc.body.appendChild(imgspan);
                }
                imgspan.style.left = (rect.left + scrollX) + "px";
                imgspan.style.top = (rect.top + scrollY) + "px";
                imgspan.style.width = (rect.right - rect.left) + "px";
                imgspan.style.height = (rect.bottom - rect.top) + "px";
                imgspan.style.display = "inline";
            }
            else
                rect = elem.getClientRects()[0];

            if (rect)
            {
                if (!imgspan)
                {
                    var activeNum = hintNumber || 1;
                    if (hintnum == activeNum)
                        elem.style.backgroundColor = "#88FF00";
                    else
                        elem.style.backgroundColor = "yellow";
                }

                elem.style.color = "black";
                span.style.left = (rect.left + scrollX) + "px";
                span.style.top = (rect.top + scrollY) + "px";
                span.innerHTML = "" + (hintnum++);
                span.style.display = "inline";
                valid_hints.push(elem);
                continue;
            }
        }

        vimperator.log("Hinted " + valid_hints.length + " items of " + hints.length + " matching " + hintString, 7);
        return true;
    }

    function removeHints(doc, timeout)
    {
        if (!doc)
        {
            vimperator.log("Argument doc is required for internal removeHints() method", 9);
            return;
        }

        var firstElem = valid_hints[0] || null;
        var firstElemBgColor = "";
        var firstElemColor = "";
        try
        {
            for (var i = 0; i < hints.length; i++)
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
//                setTimeout(function() {
//                        firstElem.style.backgroundColor = firstElemBgColor;
//                        firstElem.style.color = firstElemColor;
//                }, 200);
// OR USE THIS FOR BLINKING:
//                var counter = 0;
//                var id = setInterval(function() {
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
                setTimeout(function() {
                        firstElem.style.backgroundColor = firstElemBgColor;
                        firstElem.style.color = firstElemColor;
                }, timeout);
            }

        }
        catch (e) { vimperator.log("Error hiding hints, probably wrong window"); }

        reset();
    }

    function processHints(followFirst)
    {
        if (valid_hints.length == 0)
        {
            vimperator.beep();
            return false;
        }

        if (!followFirst)
        {
            var first_href = valid_hints[0].getAttribute("href") || null;
            if (first_href)
            {
                if (valid_hints.some( function(e) { return e.getAttribute("href") != first_href; } ))
                    return false;
            }
            else if (valid_hints.length > 1)
                return false;
        }
        // if we write a numeric part like 3, but we have 45 hints, only follow
        // the hint after a timeout, as the user might have wanted to follow link 34
        else if (hintNumber > 0 && hintNumber * 10 <= valid_hints.length)
        {
            var timeout = vimperator.options["hinttimeout"];
            return;
        }

        var activeNum = hintNumber || 1;
        var loc = valid_hints[activeNum - 1].href || "";
        switch (submode)
        {
            case ";": focusHint(); break;
            case "a": saveHint(false); break;
            case "s": saveHint(true); break;
            case "o": openHint(false, false); break;
            case "O": vimperator.commandline.open(":", "open " + loc, vimperator.modes.EX); break;
            case "t": openHint(true,  false); break;
            case "T": vimperator.commandline.open(":", "tabopen " + loc, vimperator.modes.EX); break;
            case "w": openHint(false, true);  break;
            case "W": vimperator.commandline.open(":", "winopen " + loc, vimperator.modes.EX); break;
            case "y": yankHint(false); break;
            case "Y": yankHint(true); break;
            default:
                vimperator.echoerr("INTERNAL ERROR: unknown submode: " + submode);
        }

        var timeout = followFirst ? 0 : 500;
        removeHints(docs.pop(), timeout);

        if (vimperator.modes.extended & vimperator.modes.ALWAYS_HINT)
        {
            setTimeout(function() {
                canUpdate = true;
                hintString = "";
                hintNumber = 0;
                vimperator.statusline.updateInputBuffer("");
            }, timeout);
        }
        else
        {
            setTimeout( function() {
                if (vimperator.mode == vimperator.modes.HINTS)
                    vimperator.modes.reset(false);
            }, timeout);
        }

        return true;
    }

    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////

    // TODO: implement framesets
    this.show = function(mode, minor, filter)
    {
        if (mode == vimperator.modes.EXTENDED_HINT && !/^[;asoOtTwWyY]$/.test(minor))
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
        var mt = Components.classes['@mozilla.org/thread-manager;1'].getService().mainThread;
        while (mt.hasPendingEvents())
            mt.processNextEvent(true);
            
        canUpdate = true;
        showHints(null);
        if (valid_hints.length == 0)
        {
            vimperator.beep();
            vimperator.modes.reset();
            return false;
        }
        else if (valid_hints.length == 1)
        {
            processHints(true);
            return false;
        }
        else // still hints visible
            return true;
    };

    this.hide = function()
    {
        if (!hintsGenerated)
            return;

        doc = docs.pop();
        if(doc);
            removeHints(doc, 0);
    };

    this.onEvent = function(event)
    {
        var key = vimperator.events.toString(event);
        var followFirst = false;
        switch (key)
        {
            case "<Return>":
                followFirst = true;
                break;

            case "<Space>":
                hintString += " ";
                break;

            case "<Tab>":
            case "<S-Tab>":
                if (hintNumber == 0)
                    hintNumber = 1;

                var oldID = hintNumber;
                if (key == "<Tab>")
                {
                    if (++hintNumber > valid_hints.length)
                        hintNumber = 1;
                }
                else
                {
                    if (--hintNumber < 1)
                        hintNumber = valid_hints.length;
                }
                showActiveHint(hintNumber, oldID);
                return;

            case "<BS>":
                if (hintNumber > 0)
                {
                    hintNumber = Math.floor(hintNumber/10);
                }
                else if (hintString != "")
                {
                    hintString = hintString.substr(0, hintString.length-1);
                }
                else
                {
                    vimperator.beep();
                    return;
                }
                break;

            case "<C-w>":
            case "<C-u>":
                hintString = "";
                hintNumber = 0;
                break;

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

                if (/^[0-9]$/.test(key))
                {
                    if (hintNumber == 0)
                        hintNumber = parseInt(key, 10);
                    else
                        hintNumber = (hintNumber * 10) + parseInt(key, 10);

                    vimperator.statusline.updateInputBuffer(hintString + (hintNumber > 0 ? hintNumber : ""));
                    if (hintNumber == 0 || hintNumber > valid_hints.length)
                    {
                        vimperator.beep();
                        return;
                    }
                    processHints(true);
                    return;
                }

                hintString += key;
        }

        vimperator.statusline.updateInputBuffer(hintString + (hintNumber > 0 ? hintNumber : ""));
        if (canUpdate)
        {
            if (!hintsGenerated && hintString.length > 0)
                generate();

            showHints(null);
            processHints(followFirst);
        }
        return false;
    }


    // FIXME: add resize support
    //window.addEventListener("resize", onResize, null);

   // getBrowser().addEventListener("DOMContentLoaded", function(event) {
   //         if (vimperator.options["autohints"])
   //             vimperator.hints.show(event.target);
   // }, false);

//    function onResize(event)
//    {
//        if (event)
//            doc = event.originalTarget;
//        else
//            doc = window.content.document;
//    }

} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
