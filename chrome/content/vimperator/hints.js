/***** BEGIN LICENSE BLOCK ***** {{{
 *
 * Mozilla Public License Notice
 *
 * The contents of this file are subject to the Mozilla Public License
 * Version 1.1  (the "License"); you may  not use this  file except in
 * compliance with the  License. You may obtain a  copy of the License
 * at http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS"
 * basis, WITHOUT WARRANTY OF ANY KIND, either express or implied. See
 * the  License  for  the   specific  language  governing  rights  and
 * limitations under the License.
 *
 * The  Original Code and  Idea is  the Hit-a-Hint  Mozilla extension.
 * The Initial  Developer of the Original  Code and the  Idea is Pekka
 * P. Sillanpaa.  Portions created  by Initial Developer are Copyright
 * (C) 2004.  All Rights Reserved.
 *
 * Contributor(s): Pekka Sillanpaa, Paul Stone
 * adapted for Vimperator use by: Martin Stubenschrott
 *
}}} ***** END LICENSE BLOCK *****/

function Hints() //{{{
{
    const HINT_PREFIX = 'hah_hint_'; // prefix for the hint id

    this.hintedElements = function() { return hintedElems; };
    this.currentState = function() { return state;};
    this.setCurrentState = function(s) { state = s;};

    var isHahModeEnabled = false; // is typing mode on
    var hintedElems = [];
    var linkNumString = ""; // the typed link number is in this string
    var linkCount = 0;
    var state = 0; // 0: empty or processing, 1: a full hint was parsed

    var wins; // frame array

    // each hint element is a clone of this element
    var hintElemSpan;

    ////////////////////////////////////////////////////////////////////////////////
    // hint activating and loading related functions
    ////////////////////////////////////////////////////////////////////////////////

    function startCoordLoader(doc)
    {
        win = doc.defaultView;
        if (!win)
            return;

        if (win.winId != null)
        {
            window.clearTimeout(win.coordLoaderId);
        }
        else
        {
            if (!wins)
                wins = [];

            win.winId = wins.length;
            wins.push(win);
        }
        //    logMessage("winId:"+win.winId);
        win.res = vimperator.buffer.evaluateXPath(vimperator.options["hinttags"], doc);
        win.coordLoaderId = window.setTimeout("vimperator.hints.loadCoord(" + win.winId + ", 0);", 1);
    }

    this.loadCoord = function(winId, i)
    {
        win = wins[winId];

        // win.res is not ready when loading has not finished yet
        if (!win.res)
            return;

        var elem = win.res.snapshotItem(i);

        if (elem)
            genElemCoords(elem);

        i++;

        if (i < win.res.snapshotLength && !isHahModeEnabled)
            window.setTimeout("vimperator.hints.loadCoord(" + winId + ", "+ i +");", 1);
        else
            win.coordLoaderId = null;
    };

    function genElemCoords(elem)
    {
        // NOTE: experiment for making the function faster, report problems
        var rect = elem.getClientRects()[0];
        if (rect)
        {
            if (!rect.left || !rect.top)
                vimperator.log("HUI: no rect.left or top");
            elem.absoLeft = rect.left + window.content.scrollX;
            elem.absoTop = rect.top + window.content.scrollY;
        }
        return;
    }

    function createHints(win)
    {
        if (!win)
        {
            win = window.content;
            linkCount = 0;
        }

        var area = new Array(4);
        area[0] = win.pageXOffset - 5;
        area[1] = win.pageYOffset - 5;
        area[2] = area[0] + win.innerWidth;
        area[3] = area[1] + win.innerHeight;

        var doc = win.document;
        var res = vimperator.buffer.evaluateXPath(vimperator.options["hinttags"], doc);

        var elem, i;

        hintElemSpan = doc.createElement('SPAN');
        hintElemSpan.style.cssText = vimperator.options["hintstyle"];
        hintElemSpan.setAttribute('name', 'hah_hint');

        var hintContainer = doc.getElementById('hah_hints');
        if (hintContainer == null)
        {
            genHintContainer(doc);
            hintContainer = doc.getElementById('hah_hints');
            if (!hintContainer)
                return false;
        }
        hintContainer.valid_hint_count = 0; // none of these hints should be visible initially

        var hints = hintContainer.childNodes;
        var maxhints = vimperator.options["maxhints"];
        //vimperator.log("snapshot length: " + res.snapshotLength);
        for (i = 0; i < res.snapshotLength; i++)
        {
            // this saves from script timeouts on pages with some thousand links
            if (linkCount >= maxhints)
                break;

            elem = res.snapshotItem(i);
            genElemCoords(elem);

            // for extended hint mode, show all - even currently hidden - hints
            //if (vimperator.hasMode(vimperator.modes.QUICK_HINT) && (elem.absoTop < area[1] || elem.absoTop > area[3] ||
//            if ((elem.absoTop < area[1] || elem.absoTop > area[3] ||
//                    elem.absoLeft > area[2] || elem.absoLeft < area[0]))
//                continue;

            // if (elem.offsetWidth == 0 && elem.offsetHeight == 0)
            //     continue;

            var cs = doc.defaultView.getComputedStyle(elem, null);

            if (cs.getPropertyValue("visibility") == "hidden")
                continue;

            if (linkCount < hints.length)
                hintElem = hints[linkCount];
            else // need to attach this new hintElem to the hint container
            {
                hintElem = hintElemSpan.cloneNode(false);
                hintContainer.appendChild(hintElem);
            }

            hintElem.style.display = 'none';
            hintElem.style.top = elem.absoTop + "px";
            hintElem.style.left = elem.absoLeft + "px";
            hintElem.refElem = elem;

            hintContainer.valid_hint_count++; // one more visible hint in this frame
            linkCount++;                      // and one more total hint

            // process firefox event to keep the UI snappy
            // if (linkCount % 50 == 0)
            // {
            //     Components.classes['@mozilla.org/thread-manager;1'].
            //         getService().mainThread.processNextEvent(false);
            //     //showHints(null, 0);
            // }
        }

        doc.coordsInvalidated = false;

        // recursively create hints
        for (i = 0; i < win.frames.length; i++)
            createHints(win.frames[i]);
    }

    function showHints(win, off)
    {
        offset = off; // must be global without 'var' for recursion

        if (!win)
            win = window.content;

        if (linkCount == 0 && !(vimperator.modes.extended & vimperator.modes.ALWAYS_HINT))
        {
            vimperator.beep();
            vimperator.modes.reset();

            // XXX: move to mode handling
            isHahModeEnabled = false;
            linkNumString = '';
            hintedElems = [];

            return;
        }

        var doc = win.document;
        var hintElem = null;
        var hintContainer = doc.getElementById('hah_hints');
        var hints = hintContainer.childNodes;
        var i, j;

        for (i = 0; i < hintContainer.valid_hint_count; i++)
        {
            hintText = formatHint(offset+i);
            hintElem = hints[i];
            hintElem.style.display = 'inline';
            //hintElem.style.position = 'absolute';
            hintElem.innerHTML = hintText;
            hintElem.id = HINT_PREFIX + hintText;
        }
        offset += hintContainer.valid_hint_count;

        // recursively show hints
        for (j = 0; j < win.frames.length; j++)
            showHints(win.frames[j], offset);
    }

    /* removes all visible hints from doc
     * or from current document, if win == null
     */
    function removeHints(win)
    {
        if (!win)
            win = window.content;

        var doc = win.document;
        var res = vimperator.buffer.evaluateXPath("//HINTS/SPAN", doc)
        var elem, i;

        for (i = 0; i < res.snapshotLength; i++)
        {
            elem = res.snapshotItem(i);
            setHintStyle(elem, vimperator.options["hintstyle"]);
            elem.style.display = 'none';
        }

        for (i = 0; i < win.frames.length; i++)
            removeHints(win.frames[i]);
    }

    function onResize(event)
    {
        if (event)
            doc = event.originalTarget;
        else
            doc = window.content.document;

        invalidateCoords(doc);
        startCoordLoader(doc);
    }

    function invalidateCoords(doc)
    {
        if (!doc.coordsInvalidated)
        {
            // every element has .validCoord
            // if it is the same as doc:s .validCoords,
            // the coordinates have not been regenerated, otherwise they
            // have. This way we can also use recursive generation
            // so that the coordinates are generated for every
            // element just once
            doc.validCoords = !doc.validCoords;
            // this is because window can be resized many times
            // and the coords should be invalidated just once.
            doc.coordsInvalidated = true;
            //      logMessage(doc.validCoords);
        }
    }

    function getHintById(id, win)
    {
        if (!win)
            win = window.content;

        var doc = win.document;
        var elem, i;

        //var hintId = parseInt(id, nums.length);
        //elem = doc.getElementById(prefix + hintId);
        elem = doc.getElementById(HINT_PREFIX + id);

        if (elem)
        {
            return elem;
        }
        else
        {
            for (i = 0; i < win.frames.length; i++)
            {
                elem = getHintById(id, win.frames[i]);
                if (elem)
                    return elem;
            }
        }
        return null;
    }

    function formatHint(hintNum)
    {
        var hintCharacters = vimperator.options["hintchars"];
        var str = hintNum.toString(hintCharacters.length); // turn hintNum into a base(length) number

        // map the number onto the chars in the numbers string
        var result = '';
        // make all links the same length
        var hintLength = 1;
        var tmp = linkCount;
        while ((tmp /= hintCharacters.length) > 1.0)
            hintLength++;
        while (str.length < hintLength)
        {
            result += hintCharacters.charAt(0).toUpperCase();
            hintLength--;
        }

        for (var i = 0; i < str.length; i++)
            result += (hintCharacters.charAt(parseInt(str[i], hintCharacters.length))).toUpperCase();

        return result;
    }

    function setHintStyle(hintElem, styleString)
    {
        if (hintElem && hintElem.style)
        {
            xTemp = hintElem.style.left;
            yTemp = hintElem.style.top;
            hintElem.style.cssText = styleString;
            hintElem.style.left = xTemp;
            hintElem.style.top = yTemp;
        }
    }

    function changeHintFocus(linkNumString, oldLinkNumString)
    {
        var styleString = vimperator.options["hintstyle"];
        var styleStringFocus = vimperator.options["focusedhintstyle"];
        var hintElem;

        if (oldLinkNumString.length > 0)
        {
            hintElem = getHintById(oldLinkNumString);
            setHintStyle(hintElem, styleString);
        }
        if (linkNumString.length > 0)
        {
            hintElem = getHintById(linkNumString);
            setHintStyle(hintElem, styleStringFocus);
            if (hintElem)
                setMouseOverElement(hintElem.refElem);
        }
    }

    ////////////////////////////////////////////////////////////////////////////////
    // basic functionality
    ////////////////////////////////////////////////////////////////////////////////

    /**
     * Enables the HaH-mode by showing the hints and prepare to input the
     * hint numbers
     *
     * @author Pekka Sillanpaa
     * @param event that caused the mode to change
     * @return -1 if already enabled
     */
    // XXX: move to mode handling
    this.enableHahMode = function(mode)
    {
        vimperator.modes.set(vimperator.modes.HINTS, mode);
        state = 0;
        linkCount = 0;
        linkNumString = '';
        isHahModeEnabled = true;

        createHints();
        showHints(null, 0);

        return true;
    };

    /**
     * Disables the HaH-mode by hiding the hints and disabling the input mode
     *
     * @author Pekka Sillanpaa
     * @param event that caused the mode to change
     * @param action = true if something is to be clicked
     *                 false if cancel
     * @return -1 if already disabled
     */
    // XXX: move to mode handling
    this.disableHahMode = function(win)
    {
        if (!isHahModeEnabled)
            return;

        vimperator.modes.reset();

        isHahModeEnabled = false;
        linkNumString = '';
        hintedElems = [];

        removeHints(win);
        return 0;
    };

    this.resetHintedElements = function()
    {
        linkNumString = '';
        state = 0;

        while (hintedElems.length > 0)
        {
            var elem = hintedElems.pop();
            if (!elem)
                return 0;
            // reset style attribute
            setHintStyle(elem, vimperator.options["hintstyle"]);
        }
    };

    this.reshowHints = function()
    {
        onResize(null);

        if (isHahModeEnabled)
        {
            removeHints();
            createHints();
            showHints(null, 0);
        }
    };


    // this function 'click' an element, which also works
    // for javascript links
    this.openHints = function(new_tab, new_window)
    {
        var x = 0, y = 0;

        while (hintedElems.length > 0)
        {
            var elem = hintedElems.pop();
            if (!elem)
                return 0;

            setHintStyle(elem, vimperator.options["hintstyle"]);
            elem = elem.refElem;
            var elemTagName = elem.tagName;
            elem.focus();

            if (elemTagName == 'FRAME' || elemTagName == 'IFRAME')
                return 0;

            // for imagemap
            if (elemTagName == 'AREA')
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

            // for 'pure' open calls without a new tab or window it doesn't
            // make sense to open more hints in the current tab, open new tabs
            // for it
            if (!new_tab && !new_window)
                new_tab = true;
        }

        return 0;
    };

    this.yankUrlHints = function()
    {
        var loc = "";
        var elems = this.hintedElements();
        var tmp = "";
        for (var i = 0; i < elems.length; i++)
        {
            tmp = elems[i].refElem.href;
            if (typeof(tmp) != 'undefined' && tmp.length > 0)
            {
                if (i > 0)
                    loc += "\n";
                loc += tmp;
            }
        }

        // disable the hints before we can echo() an information
        this.disableHahMode(null, true);

        vimperator.copyToClipboard(loc);
        vimperator.echo("Yanked " + loc);
    };

    this.yankTextHints = function()
    {
        var loc = "";
        var elems = this.hintedElements();
        var tmp = "";
        for (var i = 0; i < elems.length; i++)
        {
            tmp = elems[i].refElem.textContent;
            if (typeof(tmp) != 'undefined' && tmp.length > 0)
            {
                if (i > 0)
                    loc += "\n";
                loc += tmp;
            }
        }

        // disable the hints before we can echo() an information
        this.disableHahMode(null, true);

        vimperator.copyToClipboard(loc);
        vimperator.echo("Yanked " + loc);
    };

    function setMouseOverElement(elem)
    {
        var doc = window.document;

        if (elem.tagName == 'FRAME' || elem.tagName == 'IFRAME')
        {
            elem.contentWindow.focus();
            return;
        }
        //else
        //{
        //    elem.focus();
        //}

        var evt = doc.createEvent('MouseEvents');
        var x = 0;
        var y = 0;
        // for imagemap
        if (elem.tagName == 'AREA')
        {
            var coords = elem.getAttribute("coords").split(",");
            x = Number(coords[0]);
            y = Number(coords[1]);
        }

        evt.initMouseEvent('mouseover', true, true, doc.defaultView, 1, x, y, 0, 0, 0, 0, 0, 0, 0, null);
        elem.dispatchEvent(evt);
    }

    ////////////////////////////////////////////////////////////////////////////////
    // event handlers
    ////////////////////////////////////////////////////////////////////////////////

    // returns nr. of fully parsed links when a new hint has been found,
    // otherwise 0 if current state is part of a hint, or -1 if an error occured
    // (like we have typed keys which never can become a hint
    this.processEvent = function(event)
    {
        if (!isHahModeEnabled)
            return -1;

        // reset state to show that we are in processing mode
        state = 0;

        var num = String.fromCharCode(event.charCode).toUpperCase();
        var hintCharacters = vimperator.options["hintchars"];
        if (num != null && hintCharacters.toUpperCase().indexOf(num) > -1)
        {
            var oldLinkNumString = linkNumString;
            linkNumString += '' + num;
            // update reference to currently selected node;
            var elem = getHintById(linkNumString);
            changeHintFocus(linkNumString, oldLinkNumString);

            // if we found the hint, fine just return it
            if (elem)
            {
                hintedElems.push(elem);
                linkNumString = '';
                state = 1;
                return hintedElems.length;
            }

            //calculate how many characters a hint must have
            var hintLength = 1;
            var tmp = linkCount;
            while ((tmp /= hintCharacters.length) > 1.0)
                hintLength++;

            if (linkNumString.length >= hintLength)
                return -1;
            else
                return 0;
        }
        // an unparseable or wrong key
        return -1;
    }

    function genHintContainer(doc)
    {
        if (doc.getElementsByTagName('HINTS').length > 0)
            return;

        hints = doc.createElement('HINTS');
        hints.id = "hah_hints";
        hints.valid_hint_count = 0; // initially 0 elements are usable as hints

        if (doc.body)
            doc.body.appendChild(hints);
    }

    function initDoc(event)
    {
        // vimperator.echoerr("Content loaded");

        doc = event.originalTarget;
        genHintContainer(doc);
        isHahModeEnabled = false;
        hintedElems = [];

        if (!doc.validCoords)
            doc.validCoords = true;
        else
            doc.validCoords = false;

        // XXX: prepend a ! ?
        if (doc.coordsInvalidated)
            doc.coordsInvalidated = true;
        else
            doc.coordsInvalidated = false;

        startCoordLoader(doc);

        if (vimperator.modes.extended & vimperator.modes.ALWAYS_HINT)
        {
            state = 0;
            linkCount = 0;
            linkNumString = '';
            isHahModeEnabled = true;

            setTimeout( function() {
                createHints();
                showHints(null, 0);
            }, 100);
        }
    }

//    window.document.addEventListener("pageshow", function() { vimperator.log("pageshow"); }, null);
    // FIXME: add resize support
    //window.addEventListener("resize", onResize, null);

    getBrowser().addEventListener("DOMContentLoaded", function(event) {
            if (vimperator.options["autohints"])
                vimperator.hints.show(event.target);
    }, false);
    
    this.show = function(doc, takenHints)
    {
        function getNextHintText(href)
        {
            var hintCharacters = "abcdefghijklmnopqrstuvwxyz123456789"; // no 0, as it looks too much like O
            var len = hintCharacters.length;
            var text = "aa";
            for (; nextHintFirstChar < len; nextHintFirstChar++)
            {
                for (; nextHintSecondChar < len; nextHintSecondChar++)
                {
                    text = hintCharacters[nextHintFirstChar] + hintCharacters[nextHintSecondChar];
                    if (typeof takenHints[text] === "undefined")
                    {
                        takenHints[text] = href;
                        return text.toUpperCase();
                    }
                }
                nextHintSecondChar = 0;
            }
            vimperator.log("Too many hints on page");
            return null;
        }

        if (!doc)
            doc = window.content.document;
        if (!takenHints)
            takenHints = {};

        var rel = 0, abs = 0, inl = 0;
        var nextHintFirstChar = 0, nextHintSecondChar = 0;

        var finder = Components.classes["@mozilla.org/embedcomp/rangefind;1"]
                               .createInstance()
                               .QueryInterface(Components.interfaces.nsIFind);
        finder.caseSensitive = false;

        var baseNodeInline = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        baseNodeInline.style.backgroundColor = "#BCEE68";
        baseNodeInline.style.color = "black";
        baseNodeInline.style.display = "inline";
        baseNodeInline.style.fontSize = "inherit";
        baseNodeInline.style.padding = "0";
        baseNodeInline.className = "vimperator-hint-inline";
        var baseNodeAbsolute = doc.createElementNS("http://www.w3.org/1999/xhtml", "span");
        //baseNodeAbsolute.style.backgroundColor = "#BCEE68";
        baseNodeAbsolute.style.backgroundColor = "cyan";
        baseNodeAbsolute.style.color = "black";
        baseNodeAbsolute.style.position = "absolute";
        baseNodeAbsolute.style.fontSize = "9px";
        baseNodeAbsolute.style.fontWeight = "bold";
        //baseNodeAbsolute.style.fontFamily = "monospace";
        baseNodeAbsolute.style.lineHeight = "9px";
        baseNodeAbsolute.style.padding = "0px 1px 0px 1px";
        baseNodeAbsolute.style.zIndex = "5000";
        baseNodeAbsolute.className = "vimperator-hint-absolute";

        var scrollX = doc.defaultView.scrollX;
        var scrollY = doc.defaultView.scrollY;
        //var view = doc.defaultView;

        var retRange = null;
        var searchRange = doc.createRange();
        var res = vimperator.buffer.evaluateXPath(vimperator.options["hinttags"], doc);
        var word, elem, count, href, text, lowertext;
        vimperator.log("Hinting " + res.snapshotLength + " items on " + doc.title);
outer:
        for (var i = 0; i < res.snapshotLength; i++)
        {
            // the more often we check for firefox events, the slower it is
            // best is checking between every 50-500 elements
            if (i % 200 == 0)
            {
                Components.classes['@mozilla.org/thread-manager;1'].
                    getService().mainThread.processNextEvent(true);

                // update saved positions, as the user could have scrolled
                scrollX = doc.defaultView.scrollX;
                scrollY = doc.defaultView.scrollY;
                vimperator.log(scrollY);
            }

            elem = res.snapshotItem(i);
            count = elem.childNodes.length;
            searchRange.setStart(elem, 0);
            searchRange.setEnd(elem, count);
            
            // try to get a unique substring of the element
            text = elem.textContent; // faster than searchRange.toString()
            href = elem.getAttribute("href");
            for (var j = 0; j < text.length - 1; j++)
            {
                if (text.length < 2)
                    continue;

                word = text.substr(j, 2);
                lowertext = word.toLowerCase();
                if (/[^a-z0-9]/.test(lowertext)) // 2x as fast as lowertext[0] > "a" etc. testing
                    continue;

                if (typeof(takenHints[lowertext]) === "undefined" ||
                        (href && takenHints[lowertext] == href))
                { // hint not yet taken or taken and href the same
                    takenHints[lowertext] = href;
                    inl++;

                    retRange = finder.Find(word, searchRange, searchRange, searchRange);
                    if (!retRange)
                        continue;

                    var nodeSurround = baseNodeInline.cloneNode(true);
                    var startContainer = retRange.startContainer;
                    var startOffset = retRange.startOffset;
                    var docfrag = retRange.extractContents();
                    var before = startContainer.splitText(startOffset);
                    var parent = before.parentNode;
                    nodeSurround.appendChild(docfrag);
                    parent.insertBefore(nodeSurround, before);
                    continue outer;
                }
            }

            // if we came here, there was no suitable inline hint, need 
            // to create an absolutely positioned div
            var lower = elem.tagName.toLowerCase();
            if (lower != "input" && lower != "textarea" && lower != "select")
            {
                elem.style.position = "relative";
                rel++;
                var span = doc.createElement("span");
                span.setAttribute("style", "z-index: 5000; color:black; font-weight: bold; font-size: 9px; background-color:yellow; line-height: 9px; border: 0px; padding: 0px 1px 0px 1px; position: absolute; left: 0px; top: 0px");
                var hint = getNextHintText(href);
                if (!hint)
                    return false;
                span.innerHTML = hint;
                //setTimeout(function() { elem.appendChild(span); }, 10); // 10ms delay to let firefox handle position=relative
                elem.appendChild(span);
                continue;
            }
            else
            {
                var rect = elem.getClientRects()[0];
                if (rect)
                {
                    var span = baseNodeAbsolute.cloneNode(true);
                    var hint = getNextHintText(href);
                    if (!hint)
                        return false;
                    span.innerHTML = hint;
                    span.style.left = rect.left + scrollX + "px";
                    span.style.top = rect.top + scrollY + "px";
                    doc.body.appendChild(span);
                    abs++;
                }
            }
        }
        vimperator.log("Done hinting " + res.snapshotLength + " items on " + doc.title);
        vimperator.log("REL: " + rel + " - ABS: " + abs + " - INL: " + inl);
        return true;
    }
    
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
