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

vimperator.Buffer = function() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    // used for the "B" mapping to remember the last :buffer[!] command
    var lastBufferSwitchArgs = ""; 
    var lastBufferSwitchSpecial = true;

    var zoom_manager = ZoomManager.prototype.getInstance();
    const ZOOM_INTERVAL = 25;

    // initialize the zoom levels
    zoom_manager.zoomFactors = [zoom_manager.MIN];
    for (var i = ZOOM_INTERVAL; i <= zoom_manager.MAX; i += ZOOM_INTERVAL)
        zoom_manager.zoomFactors.push(i);

    function setZoom(value)
    {
        try
        {
            zoom_manager.textZoom = value;
            vimperator.echo("Text zoom: " + zoom_manager.textZoom + "%");
            // TODO: shouldn't this just recalculate hint coords, rather than
            // unsuccessfully attempt to reshow hints?  i.e. isn't it just relying
            // on the recalculation side effect? -- djk
            // NOTE: we could really do with a zoom event...
            vimperator.hints.reshowHints();
        }
        catch (e) // Components.results.NS_ERROR_INVALID_ARG
        {
            vimperator.echoerr("Zoom value out of range (" + zoom_manager.MIN + "-" + zoom_manager.MAX + ")");
        }
    }

    // NOTE: this is only needed as there's currently no way to specify a
    // multiplier when calling ZM.reduce()/ZM.enlarge().  TODO: see if we can
    // get this added to ZoomManager
    function bumpZoomLevel(steps)
    {
        var adjusted_zoom = zoom_manager.snap(zoom_manager.textZoom);
        var current = zoom_manager.indexOf(adjusted_zoom);
        var next = current + steps;

        var start = 0, end = zoom_manager.zoomFactors.length - 1;

        if ((current == start && steps < 0) || (current == end && steps > 0))
        {
            vimperator.beep();
            return;
        }

        if (next < start)
            next = start;
        else if (next > end)
            next = end;

        setZoom(zoom_manager.zoomFactors[next]);
    }

    function checkScrollYBounds(win, direction)
    {
        // NOTE: it's possible to have scrollY > scrollMaxY - FF bug?
        if (direction > 0 && win.scrollY >= win.scrollMaxY || direction < 0 && win.scrollY == 0)
            vimperator.beep();
    }

    // both values are given in percent, -1 means no change
    function scrollToPercentiles(horizontal, vertical)
    {
        var win = document.commandDispatcher.focusedWindow;
        var h, v;

        if (horizontal < 0)
            h = win.scrollX;
        else
            h = win.scrollMaxX / 100 * horizontal;

        if (vertical < 0)
            v = win.scrollY;
        else
            v = win.scrollMaxY / 100 * vertical;

        win.scrollTo(h, v);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.__defineGetter__("URL", function()
    {
        // TODO: .URL is not defined for XUL documents
        //return window.content.document.URL;
        return window.content.document.location.href;
    });

    this.__defineGetter__("pageHeight", function()
    {
        return getBrowser().mPanelContainer.boxObject.height; // FIXME: best way to do this?
    });

    this.__defineGetter__("textZoom", function()
    {
        return zoom_manager.textZoom;
    });

    this.__defineSetter__("textZoom", function(value)
    {
        setZoom(value);
    });

    this.__defineGetter__("title", function()
    {
        return window.content.document.title;
    });

    // returns an XPathResult object
    this.evaluateXPath = function(expression, doc, elem, ordered)
    {
        if (!doc)
            doc = window.content.document;
        if (!elem)
            elem = doc;

        var result = doc.evaluate(expression, elem,
            function lookupNamespaceURI(prefix) {
              switch (prefix) {
                case 'xhtml':
                  return 'http://www.w3.org/1999/xhtml';
                default:
                  return null;
              }
            },
            ordered ? XPathResult.ORDERED_NODE_SNAPSHOT_TYPE : XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
            null
        );

        return result;
    }

    this.list = function(fullmode)
    {
        if (fullmode)
        {
            // toggle the special buffer previw window
            if (vimperator.bufferwindow.visible())
            {
                vimperator.bufferwindow.hide();
            }
            else
            {
                var items = vimperator.completion.get_buffer_completions("");
                vimperator.bufferwindow.show(items);
                vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
            }
        }
        else
        {
            // TODO: move this to vimperator.buffers.get()
            var items = vimperator.completion.get_buffer_completions("");
            var number, indicator, title, url;

            var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" + "<table>";
            for (var i = 0; i < items.length; i++)
            {
                if (i == vimperator.tabs.index())
                   indicator = " <span style=\"color: blue\">%</span> ";
                else if (i == vimperator.tabs.index(vimperator.tabs.alternate))
                   indicator = " <span style=\"color: blue\">#</span> ";
                else
                   indicator = "   ";

                [number, title] = items[i][0].split(/:\s+/, 2);
                url = items[i][1];
                url = vimperator.util.escapeHTML(url);
                title = vimperator.util.escapeHTML(title);

                list += "<tr><td align=\"right\">  " + number + "</td><td>" + indicator +
                        "</td><td style=\"width: 250px; max-width: 500px; overflow: hidden;\">" + title +
                        "</td><td><a href=\"#\" class=\"hl-URL buffer-list\">" + url + "</a></td></tr>";
            }
            list += "</table>";

            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        }
    }

    this.scrollBottom = function()
    {
        scrollToPercentiles(-1, 100);
    }

    this.scrollColumns = function(cols)
    {
        var win = window.document.commandDispatcher.focusedWindow;
        const COL_WIDTH = 20;

        if (cols > 0 && win.scrollX >= win.scrollMaxX || cols < 0 && win.scrollX == 0)
            vimperator.beep();

        win.scrollBy(COL_WIDTH * cols, 0);
    }

    this.scrollEnd = function()
    {
        scrollToPercentiles(100, -1);
    }

    this.scrollLines = function(lines)
    {
        var win = window.document.commandDispatcher.focusedWindow;
        checkScrollYBounds(win, lines);
        win.scrollByLines(lines);
    }

    this.scrollPages = function(pages)
    {
        var win = window.document.commandDispatcher.focusedWindow;
        checkScrollYBounds(win, pages);
        win.scrollByPages(pages);
    }

    this.scrollToPercentile = function(percentage)
    {
        scrollToPercentiles(-1, percentage);
    }

    this.scrollStart = function()
    {
        scrollToPercentiles(0, -1);
    }

    this.scrollTop = function()
    {
        scrollToPercentiles(-1, 0);
    }

    // TODO: allow callback for filtering out unwanted frames? User defined?
    this.shiftFrameFocus = function(count, forward)
    {
        try
        {
            var frames = [];

            // find all frames - depth-first search
            (function(frame)
            {
                if (frame.document.body.localName.toLowerCase() == "body")
                    frames.push(frame);
                for (var i = 0; i < frame.frames.length; i++)
                    arguments.callee(frame.frames[i])
            })(window.content);

            if (frames.length == 0) // currently top is always included
                return;

            // remove all unfocusable frames
            // TODO: find a better way to do this
            var start = document.commandDispatcher.focusedWindow;
            frames = frames.filter(function(frame) {
                    frame.focus();
                    if (document.commandDispatcher.focusedWindow == frame)
                        return frame;
            });
            start.focus();

            // find the currently focused frame index
            // TODO: If the window is a frameset then the first _frame_ should be
            //       focused.  Since this is not the current FF behaviour,
            //       we initalize current to -1 so the first call takes us to the
            //       first frame.
            var current = -1;
            for (var i = 0; i < frames.length; i++)
            {
                if (frames[i] == document.commandDispatcher.focusedWindow)
                {
                    var current = i;
                    break;
                }
            }

            // calculate the next frame to focus
            var next = current;
            if (forward)
            {
                if (count > 1)
                    next = current + count;
                else
                    next++;

                if (next > frames.length - 1)
                {
                    if (current == frames.length - 1)
                        vimperator.beep(); // still allow the frame indicator to be activated

                    next = frames.length - 1;
                }
            }
            else
            {
                if (count > 1)
                    next = current - count;
                else
                    next--;

                if (next < 0)
                {
                    if (current == 0)
                        vimperator.beep(); // still allow the frame indicator to be activated

                    next = 0;
                }
            }

            // focus next frame and scroll into view
            frames[next].focus();
            if (frames[next] != window.content)
                frames[next].frameElement.scrollIntoView(false);

            // add the frame indicator
            var doc = frames[next].document;
            var indicator = doc.createElement("div");
            indicator.id = "vimperator-frame-indicator";
            // NOTE: need to set a high z-index - it's a crapshoot!
            var style = "background-color: red; opacity: 0.5; z-index: 999;" +
                        "position: fixed; top: 0; bottom: 0; left: 0; right: 0;";
            indicator.setAttribute("style", style);
            doc.body.appendChild(indicator);

            // remove the frame indicator
            setTimeout(function() { doc.body.removeChild(indicator); }, 500);
        }
        catch (e)
        {
            // FIXME: fail silently here for now
            //vimperator.log(e);
        }
    }

    // updates the buffer preview in place only if list is visible
    this.updateBufferList = function()
    {
        if (!vimperator.bufferwindow.visible())
            return false;

        var items = vimperator.completion.get_buffer_completions("");
        vimperator.bufferwindow.show(items);
        vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
    }

    // XXX: should this be in v.buffers. or v.tabs.?
    // "buffer" is a string which matches the URL or title of a buffer, if it
    // is null, the last used string is used again
    this.switchTo = function(buffer, allowNonUnique, count, reverse)
    {
        if (buffer != null)
        {
            // store this command, so it can be repeated with "B"
            lastBufferSwitchArgs = buffer;
            lastBufferSwitchSpecial = allowNonUnique;
        }
        else
        {
            buffer = lastBufferSwitchArgs;
            if (typeof allowNonUnique == "undefined" || allowNonUnique == null)
                allowNonUnique = lastBufferSwitchSpecial;
        }

        if (!count || count < 1)
            count = 1;
        if (typeof reverse != "boolean")
            reverse = false;

        var match;
        if (match = buffer.match(/^(\d+):?/))
            return vimperator.tabs.select(parseInt(match[1]) - 1, false); // make it zero-based

        var matches = [];
        var lower_buffer = buffer.toLowerCase();
        var first = vimperator.tabs.index() + (reverse ? 0 : 1);
        for (var i = 0; i < getBrowser().browsers.length; i++)
        {
            var index = (i + first) % getBrowser().browsers.length;
            var url = getBrowser().getBrowserAtIndex(index).contentDocument.location.href;
            var title = getBrowser().getBrowserAtIndex(index).contentDocument.title.toLowerCase();
            if (url == buffer)
                return vimperator.tabs.select(index, false);

            if (url.indexOf(buffer) >= 0 || title.indexOf(lower_buffer) >= 0)
                matches.push(index);
        }
        if (matches.length == 0)
            vimperator.echoerr("E94: No matching buffer for " + buffer);
        else if (matches.length > 1 && !allowNonUnique)
            vimperator.echoerr("E93: More than one match for " + buffer);
        else
        {
            if (reverse)
            {
                index = matches.length - count;
                while (index < 0)
                    index += matches.length;
            }
            else
                index = (count-1) % matches.length;

            vimperator.tabs.select(matches[index], false);
        }
    };

    this.zoomIn = function(steps)
    {
        bumpZoomLevel(steps);
    }

    this.zoomOut = function(steps)
    {
        bumpZoomLevel(-steps);
    }

    this.pageInfo = function(verbose)
    {
        // to get the file size later (from pageInfo.js) (setup cacheEntryDescriptor)
        const nsICacheService = Components.interfaces.nsICacheService;
        const ACCESS_READ = Components.interfaces.nsICache.ACCESS_READ;
        const cacheService = Components.classes["@mozilla.org/network/cache-service;1"].getService(nsICacheService);
        var httpCacheSession = cacheService.createSession("HTTP", 0, true);
        httpCacheSession.doomEntriesIfExpired = false;
        var ftpCacheSession = cacheService.createSession("FTP", 0, true);
        ftpCacheSession.doomEntriesIfExpired = false;
        var cacheKey = window.content.document.location.toString().replace(/#.*$/, "");
        try
        {
            var cacheEntryDescriptor = httpCacheSession.openCacheEntry(cacheKey, ACCESS_READ, false);
        }
        catch (ex)
        {
            try
            {
                cacheEntryDescriptor = ftpCacheSession.openCacheEntry(cacheKey, ACCESS_READ, false);
            }
            catch (ex2) { }
        }

        if (!verbose)
        {
            // TODO: strip off any component after &
            var file = window.content.document.location.pathname.split('/').pop();
            if (!file)
                file = "[No Name]";

            var title = window.content.document.title || "[No Title]";

            if (cacheEntryDescriptor)
                var pageSize = Math.round(cacheEntryDescriptor.dataSize / 1024 * 100) / 100 + "KB";

            var lastmod = window.content.document.lastModified.slice(0, -3);

            var pageInfoText = '"' + file + '" [' + pageSize + ", " + lastmod + "] " + title;

            vimperator.echo(pageInfoText, vimperator.commandline.FORCE_SINGLELINE);
            return;
        }

        var pageGeneral = [];       // keeps general infos
        var pageMeta = [];          // keeps meta infos

        // get general infos
        pageGeneral.push(["Title", window.content.document.title]);
        pageGeneral.push(["URL", '<a class="hl-URL" href="' + window.content.document.location.toString() + '">' +
                window.content.document.location.toString() + '</a>']);
        pageGeneral.push(["Referrer",  ("referrer" in window.content.document && window.content.document.referrer)]);
        pageGeneral.push(["Mime-Type", window.content.document.contentType]);
        pageGeneral.push(["Encoding",  window.content.document.characterSet]);

        if (cacheEntryDescriptor)
        {
            var pageSize = cacheEntryDescriptor.dataSize;
            var bytes = pageSize + '';
            for (var u = bytes.length - 3; u > 0; u -= 3)        // make a 1400 -> 1'400
                bytes = bytes.slice(0, u) + "," + bytes.slice(u, bytes.length);
            pageGeneral.push(["File Size", (Math.round(pageSize / 1024 * 100) / 100) + "KB (" + bytes + " bytes)"]);
        }

        pageGeneral.push(["Compatibility", content.document.compatMode == "BackCompat" ?
                "Quirks Mode" : "Full/Almost Standards Mode"]);
        pageGeneral.push(["Last Modified", window.content.document.lastModified]);

        // get meta tag data, sort and put into pageMeta[]
        var metaNodes = window.content.document.getElementsByTagName("meta");
        var length = metaNodes.length;
        if (length)
        {
            var tmpSort = [];
            var tmpDict = [];

            for (var i = 0; i < length; i++)
            {
                var tmpTag = metaNodes[i].name || metaNodes[i].httpEquiv;// +
                    //'<span style="font-weight: normal; font-size: 90%;">-eq</span>'; // XXX: really important?
                var tmpTagNr = tmpTag + "-" + i;     // allows multiple (identical) meta names
                tmpDict[tmpTagNr] = [tmpTag, metaNodes[i].content];
                tmpSort.push(tmpTagNr);      // array for sorting
            }

            // sort: ignore-case
            tmpSort.sort(function (a,b){return a.toLowerCase() > b.toLowerCase() ? 1 : -1;});

            for (var i=0; i < tmpSort.length; i++)
            {
                pageMeta.push([tmpDict[tmpSort[i]][0], tmpDict[tmpSort[i]][1]]);
            }
        }

        var pageInfoText = "";
        var option = vimperator.options["pageinfo"];

        for (var z = 0; z < option.length; z++)
        {
            var newLine = z > 0 ? "<br/>" : "";
            switch (option[z])
            {
                case "g": pageInfoText += newLine + "<table><tr><td class='hl-Title' style='font-weight: bold;' colspan='2'>General</td></tr>";
                    for (var i = 0; i < pageGeneral.length; i++)
                    {
                        if (pageGeneral[i][1])
                            pageInfoText += "<tr><td style='font-weight: bold;'>  " + pageGeneral[i][0] + ": </td><td>" + pageGeneral[i][1] + "</td></tr>";
                    }
                    pageInfoText += "</table>";
                    break;

                case "m": pageInfoText += newLine + "<table><tr><td class='hl-Title' style='font-weight: bold;' colspan='2'>Meta Tags</td></tr>";
                    if (pageMeta.length)
                    {
                        for (var i = 0; i < pageMeta.length; i++)
                        {
                            pageInfoText += "<tr><td style='font-weight: bold;'>  " + pageMeta[i][0] + ": </td><td>" + pageMeta[i][1] + "</td></tr>";
                        }
                    }
                    else
                    {
                        pageInfoText += "<tr><td colspan='2'>(no Meta-Tags on this page)</td></tr>";
                    }
                    pageInfoText += "</table>";
                    break;
            }
        }

        vimperator.echo(pageInfoText, vimperator.commandline.FORCE_MULTILINE);
    }
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
