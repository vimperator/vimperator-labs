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

vimperator.Buffer = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // used for the "B" mapping to remember the last :buffer[!] command
    var lastBufferSwitchArgs = "";
    var lastBufferSwitchSpecial = true;
    var zoomLevels = [ 1, 10, 25, 50, 75, 90, 100,
                        120, 150, 200, 300, 500, 1000, 2000 ];

    function setZoom(value, fullZoom)
    {
        if (value < 1 || value > 2000)
        {
            vimperator.echoerr("Zoom value out of range (1-2000%)");
            return false;
        }

        if (fullZoom)
            getBrowser().mCurrentBrowser.markupDocumentViewer.fullZoom = value / 100.0;
        else
            getBrowser().mCurrentBrowser.markupDocumentViewer.textZoom = value / 100.0;

        vimperator.echo((fullZoom ? "Full zoom: " : "Text zoom: ") + value + "%");

        // TODO: shouldn't this just recalculate hint coords, rather than
        // unsuccessfully attempt to reshow hints?  i.e. isn't it just relying
        // on the recalculation side effect? -- djk
        // NOTE: we could really do with a zoom event...
        // vimperator.hints.reshowHints();
    }

    function bumpZoomLevel(steps, fullZoom)
    {
        if (fullZoom)
            var value = getBrowser().mCurrentBrowser.markupDocumentViewer.fullZoom * 100.0;
        else
            var value = getBrowser().mCurrentBrowser.markupDocumentViewer.textZoom * 100.0;

        var index = -1;
        if (steps <= 0)
        {
            for (var i = zoomLevels.length - 1; i >= 0; i--)
            {
                if ((zoomLevels[i] + 0.01) < value) // 0.01 for float comparison
                {
                    index = i + 1 + steps;
                    break;
                }
            }
        }
        else
        {
            for (var i = 0; i < zoomLevels.length; i++)
            {
                if ((zoomLevels[i] - 0.01) > value) // 0.01 for float comparison
                {
                    index = i - 1 + steps;
                    break;
                }
            }
        }
        if (index < 0 || index >= zoomLevels.length)
        {
            vimperator.beep();
            return;
        }
        setZoom(zoomLevels[index], fullZoom);
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

    return {

        lastInputField: null, // used to keep track of the right field for "gi"


        get URL()
        {
            // TODO: .URL is not defined for XUL documents
            //return window.content.document.URL;
            return window.content.document.location.href;
        },

        get pageHeight()
        {
            return window.content.innerHeight;
        },

        get textZoom()
        {
            return getBrowser().mCurrentBrowser.markupDocumentViewer.textZoom * 100;
        },
        set textZoom(value)
        {
            setZoom(value, false);
        },

        get fullZoom()
        {
            return getBrowser().mCurrentBrowser.markupDocumentViewer.fullZoom * 100;
        },
        set fullZoom(value)
        {
            setZoom(value, true);
        },

        get title()
        {
            return window.content.document.title;
        },

        // returns an XPathResult object
        evaluateXPath: function (expression, doc, elem, asIterator)
        {
            if (!doc)
                doc = window.content.document;
            if (!elem)
                elem = doc;

            var result = doc.evaluate(expression, elem,
                function lookupNamespaceURI(prefix)
                {
                  switch (prefix)
                  {
                    case "xhtml":
                      return "http://www.w3.org/1999/xhtml";
                    default:
                      return null;
                  }
                },
                asIterator ? XPathResult.UNORDERED_NODE_ITERATOR_TYPE : XPathResult.UNORDERED_NODE_SNAPSHOT_TYPE,
                null
            );

            return result;
        },

        // artificially "clicks" a link in order to open it
        followLink: function (elem, where, offsetX, offsetY)
        {
            var doc = window.content.document;
            var view = window.document.defaultView;
            //var view = doc.defaultView;
            offsetX = offsetX || 1;
            offsetY = offsetY || 1;

            var newTab = false, newWindow = false;
            switch (where)
            {
                case vimperator.NEW_TAB:
                case vimperator.NEW_BACKGROUND_TAB:
                    newTab = true;
                    break;
                case vimperator.NEW_WINDOW:
                    newWindow = true;
                    break;
                default:
                    vimperator.log("Invalid where argument for followLink()");
            }

            var evt = doc.createEvent("MouseEvents");
            evt.initMouseEvent("mousedown", true, true, view, 1, offsetX, offsetY, 0, 0, /*ctrl*/ newTab, /*event.altKey*/0, /*event.shiftKey*/ newWindow, /*event.metaKey*/ newTab, 0, null);
            elem.dispatchEvent(evt);

            //var evt = doc.createEvent("MouseEvents");
            evt.initMouseEvent("click", true, true, view, 1, offsetX, offsetY, 0, 0, /*ctrl*/ newTab, /*event.altKey*/0, /*event.shiftKey*/ newWindow, /*event.metaKey*/ newTab, 0, null);
            elem.dispatchEvent(evt);
        },

        // in contrast to vim, returns the selection if one is made,
        // otherwise tries to guess the current word unter the text cursor
        // NOTE: might change the selection
        getCurrentWord: function ()
        {
            var selection = window.content.getSelection().toString();

            if (!selection)
            {
                var selectionController = getBrowser().docShell
                    .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                    .getInterface(Components.interfaces.nsISelectionDisplay)
                    .QueryInterface(Components.interfaces.nsISelectionController);

                selectionController.setCaretEnabled(true);
                selectionController.wordMove(false, false);
                selectionController.wordMove(true, true);
                selection = window.content.getSelection().toString();
            }

            return selection;
        },

        list: function (fullmode)
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
                    var items = vimperator.completion.getBufferCompletions("");
                    vimperator.bufferwindow.show(items);
                    vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
                }
            }
            else
            {
                // TODO: move this to vimperator.buffers.get()
                var items = vimperator.completion.getBufferCompletions("");
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
        },

        scrollBottom: function ()
        {
            scrollToPercentiles(-1, 100);
        },

        scrollColumns: function (cols)
        {
            var win = window.document.commandDispatcher.focusedWindow;
            const COL_WIDTH = 20;

            if (cols > 0 && win.scrollX >= win.scrollMaxX || cols < 0 && win.scrollX == 0)
                vimperator.beep();

            win.scrollBy(COL_WIDTH * cols, 0);
        },

        scrollEnd: function ()
        {
            scrollToPercentiles(100, -1);
        },

        scrollLines: function (lines)
        {
            var win = window.document.commandDispatcher.focusedWindow;
            checkScrollYBounds(win, lines);
            win.scrollByLines(lines);
        },

        scrollPages: function (pages)
        {
            var win = window.document.commandDispatcher.focusedWindow;
            checkScrollYBounds(win, pages);
            win.scrollByPages(pages);
        },

        scrollToPercentile: function (percentage)
        {
            scrollToPercentiles(-1, percentage);
        },

        scrollStart: function ()
        {
            scrollToPercentiles(0, -1);
        },

        scrollTop: function ()
        {
            scrollToPercentiles(-1, 0);
        },

        // TODO: allow callback for filtering out unwanted frames? User defined?
        shiftFrameFocus: function (count, forward)
        {
            if (!window.content.document instanceof HTMLDocument)
                return;

            var frames = [];

            // find all frames - depth-first search
            (function (frame)
            {
                if (frame.document.body.localName.toLowerCase() == "body")
                    frames.push(frame);
                for (var i = 0; i < frame.frames.length; i++)
                    arguments.callee(frame.frames[i]);
            })(window.content);

            if (frames.length == 0) // currently top is always included
                return;

            // remove all unfocusable frames
            // TODO: find a better way to do this - walking the tree is too slow
            var start = document.commandDispatcher.focusedWindow;
            frames = frames.filter(function (frame) {
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
            // TODO: make this an XBL element rather than messing with the content
            // document
            var doc = frames[next].document;
            var indicator = doc.createElement("div");
            indicator.id = "vimperator-frame-indicator";
            // NOTE: need to set a high z-index - it's a crapshoot!
            var style = "background-color: red; opacity: 0.5; z-index: 999;" +
                        "position: fixed; top: 0; bottom: 0; left: 0; right: 0;";
            indicator.setAttribute("style", style);
            doc.body.appendChild(indicator);

            // remove the frame indicator
            setTimeout(function () { doc.body.removeChild(indicator); }, 500);
        },

        // updates the buffer preview in place only if list is visible
        updateBufferList: function ()
        {
            if (!vimperator.bufferwindow.visible())
                return false;

            var items = vimperator.completion.getBufferCompletions("");
            vimperator.bufferwindow.show(items);
            vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
        },

        // XXX: should this be in v.buffers. or v.tabs.?
        // "buffer" is a string which matches the URL or title of a buffer, if it
        // is null, the last used string is used again
        switchTo: function (buffer, allowNonUnique, count, reverse)
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
                return vimperator.tabs.select(parseInt(match[1], 10) - 1, false); // make it zero-based

            var matches = [];
            var lowerBuffer = buffer.toLowerCase();
            var first = vimperator.tabs.index() + (reverse ? 0 : 1);
            for (var i = 0; i < getBrowser().browsers.length; i++)
            {
                var index = (i + first) % getBrowser().browsers.length;
                var url = getBrowser().getBrowserAtIndex(index).contentDocument.location.href;
                var title = getBrowser().getBrowserAtIndex(index).contentDocument.title.toLowerCase();
                if (url == buffer)
                    return vimperator.tabs.select(index, false);

                if (url.indexOf(buffer) >= 0 || title.indexOf(lowerBuffer) >= 0)
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
                    index = (count - 1) % matches.length;

                vimperator.tabs.select(matches[index], false);
            }
        },

        zoomIn: function (steps, fullZoom)
        {
            bumpZoomLevel(steps, fullZoom);
        },

        zoomOut: function (steps, fullZoom)
        {
            bumpZoomLevel(-steps, fullZoom);
        },

        pageInfo: function (verbose)
        {
            const feedTypes = {
                "application/rss+xml": "RSS",
                "application/atom+xml": "Atom",
                "text/xml": "XML",
                "application/xml": "XML",
                "application/rdf+xml": "XML"
            };

            function isValidFeed(data, principal, isFeed)
            {
                if (!data || !principal)
                    return false;

                if (!isFeed)
                {
                    var type = data.type && data.type.toLowerCase();
                    type = type.replace(/^\s+|\s*(?:;.*)?$/g, "");

                    isFeed = (type == "application/rss+xml" || type == "application/atom+xml");
                    if (!isFeed)
                    {
                        // really slimy: general XML types with magic letters in the title
                        const titleRegex = /(^|\s)rss($|\s)/i;
                        isFeed = ((type == "text/xml" || type == "application/rdf+xml" ||
                                    type == "application/xml") && titleRegex.test(data.title));
                    }
                }

                if (isFeed)
                {
                    try
                    {
                        urlSecurityCheck(data.href, principal,
                                Components.interfaces.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL);
                    }
                    catch (ex)
                    {
                        isFeed = false;
                    }
                }

                if (type)
                    data.type = type;

                return isFeed;
            }

            // TODO: could this be useful for other commands?
            function createTable(data)
            {
                var ret = "<table><tr><th class='hl-Title' style='font-weight: bold;' align='left' colspan='2'>" +
                          data[data.length - 1][0] + "</th></tr>";

                if (data.length - 1)
                {
                    for (var i = 0; i < data.length - 1; i++)
                        ret += "<tr><td style='font-weight: bold; min-width: 150px'>  " + data[i][0] + ": </td><td>" + data[i][1] + "</td></tr>";
                }
                else
                {
                    ret += "<tr><td colspan='2'>  (" + data[data.length - 1][1] + ")</td></tr>";
                }

                return ret + "</table>";
            }

            var pageGeneral = [];
            var pageFeeds = [];
            var pageMeta = [];

            // get file size
            const nsICacheService = Components.interfaces.nsICacheService;
            const ACCESS_READ = Components.interfaces.nsICache.ACCESS_READ;
            const cacheService = Components.classes["@mozilla.org/network/cache-service;1"].getService(nsICacheService);
            var httpCacheSession = cacheService.createSession("HTTP", 0, true);
            var ftpCacheSession = cacheService.createSession("FTP", 0, true);
            httpCacheSession.doomEntriesIfExpired = false;
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

            var pageSize = []; // [0] bytes; [1] kbytes
            if (cacheEntryDescriptor)
            {
                pageSize[0] = vimperator.util.formatBytes(cacheEntryDescriptor.dataSize, 0, false);
                pageSize[1] = vimperator.util.formatBytes(cacheEntryDescriptor.dataSize, 2, true);
                if (pageSize[1] == pageSize[0])
                    pageSize[1] = null; // don't output "xx Bytes" twice
            }

            // put feeds rss into pageFeeds[]
            var linkNodes = window.content.document.getElementsByTagName("link");
            var length = linkNodes.length;
            for (var i = 0; i < length; i++)
            {
                var link = linkNodes[i];
                if (!link.href)
                    continue;

                var rel = link.rel && link.rel.toLowerCase();
                var rels = {};
                if (rel)
                {
                    for each (let relVal in rel.split(/\s+/))
                        rels[relVal] = true;
                }

                if (rels.feed || (link.type && rels.alternate && !rels.stylesheet))
                {
                    var feed = { title: link.title, href: link.href, type: link.type || "" };
                    if (isValidFeed(feed, window.content.document.nodePrincipal, rels.feed))
                    {
                        var type = feedTypes[feed.type] || feedTypes["application/rss+xml"];
                        pageFeeds.push([feed.title, vimperator.util.highlightURL(feed.href, true) + " <span style='color: gray;'>(" + type + ")</span>"]);
                    }
                }
            }

            var lastModVerbose = new Date(window.content.document.lastModified).toLocaleString();
            var lastMod = new Date(window.content.document.lastModified).toLocaleFormat("%x %X");
            // FIXME: probably unportable across differnet language versions
            if (lastModVerbose == "Invalid Date" || new Date(window.content.document.lastModified).getFullYear() == 1970)
                lastModVerbose = lastMod = null;

            // Ctrl-g single line output
            if (!verbose)
            {
                var info = []; // tmp array for joining later
                var file = window.content.document.location.pathname.split("/").pop() || "[No Name]";
                var title = window.content.document.title || "[No Title]";

                if (pageSize[0])
                    info.push(pageSize[1] || pageSize[0]);

                if (lastMod)
                    info.push(lastMod);

                var countFeeds = "";
                if (pageFeeds.length)
                    countFeeds = pageFeeds.length + (pageFeeds.length == 1 ? " feed" : " feeds");

                if (countFeeds)
                    info.push(countFeeds);

                var pageInfoText = '"' + file + '" [' + info.join(", ") + "] " + title;
                vimperator.echo(pageInfoText, vimperator.commandline.FORCE_SINGLELINE);
                return;
            }

            // get general infos
            pageGeneral.push(["Title", window.content.document.title]);
            pageGeneral.push(["URL", vimperator.util.highlightURL(window.content.document.location.toString(), true)]);

            var ref = "referrer" in window.content.document && window.content.document.referrer;
            if (ref)
                pageGeneral.push(["Referrer", vimperator.util.highlightURL(ref, true)]);

            if (pageSize[0])
            {
                if (pageSize[1])
                    pageGeneral.push(["File Size", pageSize[1] + " (" + pageSize[0] + ")"]);
                else
                    pageGeneral.push(["File Size", pageSize[0]]);
            }

            pageGeneral.push(["Mime-Type", content.document.contentType]);
            pageGeneral.push(["Encoding",  content.document.characterSet]);
            pageGeneral.push(["Compatibility", content.document.compatMode == "BackCompat" ?  "Quirks Mode" : "Full/Almost Standards Mode"]);
            if (lastModVerbose)
                pageGeneral.push(["Last Modified", lastModVerbose]);

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
                    var tmpTagNr = tmpTag + "-" + i; // allows multiple (identical) meta names
                    tmpDict[tmpTagNr] = [tmpTag, metaNodes[i].content];
                    tmpSort.push(tmpTagNr); // array for sorting
                }

                // sort: ignore-case
                tmpSort.sort(function (a, b) { return a.toLowerCase() > b.toLowerCase() ? 1 : -1; });
                for (var i = 0; i < tmpSort.length; i++)
                    pageMeta.push([tmpDict[tmpSort[i]][0], vimperator.util.highlightURL(tmpDict[tmpSort[i]][1], false)]);
            }

            pageMeta.push(["Meta Tags", ""]); // add extra text to the end
            pageGeneral.push(["General Info", ""]);
            pageFeeds.push(["Feeds", ""]);

            var pageInfoText = "";
            var option = vimperator.options["pageinfo"];
            var br = "";

            for (var z = 0; z < option.length; z++)
            {
                switch (option[z])
                {
                    case "g":
                        if (pageGeneral.length > 1)
                        {
                            pageInfoText += br + createTable(pageGeneral);
                            if (!br)
                                br = "<br/>";
                        }
                        break;
                    case "f":
                        if (pageFeeds.length > 1)
                        {
                            pageInfoText += br + createTable(pageFeeds);
                            if (!br)
                                br = "<br/>";
                        }
                        break;
                    case "m":
                        if (pageMeta.length > 1)
                        {
                            pageInfoText += br + createTable(pageMeta);
                            if (!br)
                                br = "<br/>";
                        }
                        break;
                }
            }
            vimperator.echo(pageInfoText, vimperator.commandline.FORCE_MULTILINE);
        },

        followDocumentRelationship: function (relationship)
        {
            var regexps;
            var relText;
            var patternText;
            switch (relationship)
            {
                case "next":
                    regexps = vimperator.options["nextpattern"].split(",");
                    break;
                case "previous":
                    //TODO: accept prev\%[ious]
                    regexps = vimperator.options["previouspattern"].split(",");
                    break;
                default:
                    vimperator.echoerr("Bad document relationship: " + relationship);
            }

            relText = new RegExp(relationship, "i");
            var elems = window.content.document.getElementsByTagName("link");
            // links have higher priority than normal <a> hrefs  
            for (var i = 0; i < elems.length; i++)
            {
                if (relText.test(elems[i].rel))
                {
                        vimperator.open(elems[i].href);
                        return;
                }
            }

            // no links? ok, look for hrefs
            elems = window.content.document.getElementsByTagName("a");
            for (var pattern = 0; pattern < regexps.length; pattern++)
            {
                patternText = new RegExp(regexps[pattern], "i");
                for (var i = 0; i < elems.length; i++)
                {
                    if (patternText.test(elems[i].text) || relText.test(elems[i].rel))
                    {
                        vimperator.buffer.followLink(elems[i], vimperator.CURRENT_TAB);
                        return;
                    }
                    else 
                    {
                        // images with alt text being href
                        var children = elems[i].childNodes;
                        for (var j = 0; j < children.length; j++)
                        {
                            if (patternText.test(children[j].alt))
                            {
                                vimperator.buffer.followLink(elems[i], vimperator.CURRENT_TAB);
                                return;
                            }
                        }

                    }
                }
            }
            vimperator.beep();
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
