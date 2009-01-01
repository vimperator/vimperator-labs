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

const Point = new Struct("x", "y");

/**
 * A class to manage the primary web content buffer. The name comes
 * from Vim's term, 'buffer', which signifies instances of open
 * files.
 * @instance buffer
 */
function Buffer() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // FIXME: This doesn't belong here.
    let mainWindowID = config.mainWindowID || "main-window";
    let fontSize = util.computedStyle(document.getElementById(mainWindowID)).fontSize;

    styles.registerSheet("chrome://liberator/skin/liberator.css");
    let error = styles.addSheet(true, "font-size", "chrome://liberator/content/buffer.xhtml",
        "body { font-size: " + fontSize + "; }");

    if ("ZoomManager" in window)
    {
        const ZOOM_MIN = Math.round(ZoomManager.MIN * 100);
        const ZOOM_MAX = Math.round(ZoomManager.MAX * 100);
    }

    function setZoom(value, fullZoom)
    {
        if (value < ZOOM_MIN || value > ZOOM_MAX)
        {
            liberator.echoerr("Zoom value out of range (" + ZOOM_MIN + " - " + ZOOM_MAX + "%)");
            return;
        }

        ZoomManager.useFullZoom = fullZoom;
        ZoomManager.zoom = value / 100;
        if ("FullZoom" in window)
            FullZoom._applySettingToPref();
        liberator.echo((fullZoom ? "Full" : "Text") + " zoom: " + value + "%");
    }

    function bumpZoomLevel(steps, fullZoom)
    {
        let values = ZoomManager.zoomValues;
        let i = values.indexOf(ZoomManager.snap(ZoomManager.zoom)) + steps;

        if (i >= 0 && i < values.length)
            setZoom(Math.round(values[i] * 100), fullZoom);
        // TODO: I'll leave the behaviour as is for now, but I think this
        // should probably just take you to the respective bounds -- djk
        else
            liberator.beep();
    }

    function checkScrollYBounds(win, direction)
    {
        // NOTE: it's possible to have scrollY > scrollMaxY - FF bug?
        if (direction > 0 && win.scrollY >= win.scrollMaxY || direction < 0 && win.scrollY == 0)
            liberator.beep();
    }

    function findScrollableWindow()
    {
        let win = window.document.commandDispatcher.focusedWindow;
        if (win && (win.scrollMaxX > 0 || win.scrollMaxY > 0))
            return win;

        win = window.content;
        if (win.scrollMaxX > 0 || win.scrollMaxY > 0)
            return win;

        for (let frame in util.Array.iterator(win.frames))
            if (frame.scrollMaxX > 0 || frame.scrollMaxY > 0)
                return frame;

        return win;
    }

    // both values are given in percent, -1 means no change
    function scrollToPercentiles(horizontal, vertical)
    {
        let win = findScrollableWindow();
        let h, v;

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

    // Holds option: [function, title] to generate :pageinfo sections
    var pageInfo = {};
    function addPageInfoSection(option, title, fn)
    {
        pageInfo[option] = [fn, title];
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["fullscreen", "fs"],
        "Show the current window fullscreen",
        "boolean", false,
        {
            setter: function (value) window.fullScreen = value,
            getter: function () window.fullScreen
        });

    options.add(["nextpattern"],
        "Patterns to use when guessing the 'next' page in a document sequence",
        "stringlist", "\\bnext\\b,^>$,^(>>|»)$,^(>|»),(>|»)$,\\bmore\\b");

    options.add(["previouspattern"],
        "Patterns to use when guessing the 'previous' page in a document sequence",
        "stringlist", "\\bprev|previous\\b,^<$,^(<<|«)$,^(<|«),(<|«)$");

    options.add(["pageinfo", "pa"], "Desired info on :pa[geinfo]", "charlist", "gfm",
        {
            completer: function (filter) [[k, v[1]] for ([k, v] in Iterator(pageInfo))],
            validator: Option.validateCompleter
        });

    options.add(["scroll", "scr"],
        "Number of lines to scroll with <C-u> and <C-d> commands",
        "number", 0,
        { validator: function (value) value >= 0 });

    options.add(["showstatuslinks", "ssli"],
        "Show the destination of the link under the cursor in the status bar",
        "number", 1,
        {
            completer: function (filter) [
                ["0", "Don't show link destination"],
                ["1", "Show the link in the status line"],
                ["2", "Show the link in the command line"]
            ],
            validator: Option.validateCompleter
        });

    options.add(["usermode", "um"],
        "Show current website with a minimal style sheet to make it easily accessible",
        "boolean", false,
        {
            setter: function (value) getBrowser().markupDocumentViewer.authorStyleDisabled = value,
            getter: function () getBrowser().markupDocumentViewer.authorStyleDisabled
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;

    mappings.add(myModes, ["."],
        "Repeat the last key event",
        function (count)
        {
            if (mappings.repeat)
            {
                for (let i in util.interruptibleRange(0, Math.max(count, 1), 100))
                    mappings.repeat();
            }
        },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["i", "<Insert>"],
        "Start caret mode",
        function ()
        {
            // setting this option triggers an observer which takes care of the mode setting
            options.setPref("accessibility.browsewithcaret", true);
        });

    mappings.add(myModes, ["<C-c>"],
        "Stop loading",
        function () { window.BrowserStop(); });

    // scrolling
    mappings.add(myModes, ["j", "<Down>", "<C-e>"],
        "Scroll document down",
        function (count) { buffer.scrollLines(count > 1 ? count : 1); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["k", "<Up>", "<C-y>"],
        "Scroll document up",
        function (count) { buffer.scrollLines(-(count > 1 ? count : 1)); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, liberator.has("mail") ? ["h"] : ["h", "<Left>"],
        "Scroll document to the left",
        function (count) { buffer.scrollColumns(-(count > 1 ? count : 1)); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, liberator.has("mail") ? ["l"] : ["l", "<Right>"],
        "Scroll document to the right",
        function (count) { buffer.scrollColumns(count > 1 ? count : 1); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["0", "^"],
        "Scroll to the absolute left of the document",
        function () { buffer.scrollStart(); });

    mappings.add(myModes, ["$"],
        "Scroll to the absolute right of the document",
        function () { buffer.scrollEnd(); });

    mappings.add(myModes, ["gg", "<Home>"],
        "Go to the top of the document",
        function (count) { buffer.scrollToPercentile(count > 0 ? count : 0); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["G", "<End>"],
        "Go to the end of the document",
        function (count) { buffer.scrollToPercentile(count >= 0 ? count : 100); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["%"],
        "Scroll to {count} percent of the document",
        function (count)
        {
            if (count > 0 && count <= 100)
                buffer.scrollToPercentile(count);
            else
                liberator.beep();
        },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-d>"],
        "Scroll window downwards in the buffer",
        function (count) { buffer.scrollByScrollSize(count, 1); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-u>"],
        "Scroll window upwards in the buffer",
        function (count) { buffer.scrollByScrollSize(count, -1); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-b>", "<PageUp>", "<S-Space>"],
        "Scroll up a full page",
        function (count) { buffer.scrollPages(-(count > 1 ? count : 1)); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["<C-f>", "<PageDown>", "<Space>"],
        "Scroll down a full page",
        function (count) { buffer.scrollPages(count > 1 ? count : 1); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["]f"],
        "Focus next frame",
        function (count) { buffer.shiftFrameFocus(count > 1 ? count : 1, true); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["[f"],
        "Focus previous frame",
        function (count) { buffer.shiftFrameFocus(count > 1 ? count : 1, false); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["]]"],
        "Follow the link labeled 'next' or '>' if it exists",
        function (count) { buffer.followDocumentRelationship("next"); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["[["],
        "Follow the link labeled 'prev', 'previous' or '<' if it exists",
        function (count) { buffer.followDocumentRelationship("previous"); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["gf"],
        "View source",
        function () { buffer.viewSource(null, false); });

    mappings.add(myModes, ["gF"],
        "View source with an external editor",
        function () { buffer.viewSource(null, true); });

    mappings.add(myModes, ["gi"],
        "Focus last used input field",
        function (count)
        {
            if (count < 1 && buffer.lastInputField)
            {
                buffer.lastInputField.focus();
            }
            else
            {
                let elements = [];
                let matches = buffer.evaluateXPath(
                    // TODO: type="file"
                    "//input[not(@type) or @type='text' or @type='password'] | //textarea[not(@disabled) and not(@readonly)] |" +
                    "//xhtml:input[not(@type) or @type='text' or @type='password'] | //xhtml:textarea[not(@disabled) and not(@readonly)]"
                );

                for (match in matches)
                {
                    let computedStyle = util.computedStyle(match);
                    if (computedStyle.visibility != "hidden" && computedStyle.display != "none")
                        elements.push(match);
                }

                if (elements.length > 0)
                {
                    if (count > elements.length)
                        count = elements.length;
                    else if (count < 1)
                        count = 1;

                    elements[count - 1].focus();
                }
                else
                {
                    liberator.beep();
                }
            }
        },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["gP"],
        "Open (put) a URL based on the current clipboard contents in a new buffer",
        function ()
        {
            liberator.open(util.readFromClipboard(),
                /\bpaste\b/.test(options["activate"]) ?
                liberator.NEW_BACKGROUND_TAB : liberator.NEW_TAB);
        });

    mappings.add(myModes, ["p", "<MiddleMouse>"],
        "Open (put) a URL based on the current clipboard contents in the current buffer",
        function ()
        {
            let url = util.readFromClipboard();
            if (url)
                liberator.open(url);
            else
                liberator.beep();
        });

    mappings.add(myModes, ["P"],
        "Open (put) a URL based on the current clipboard contents in a new buffer",
        function ()
        {
            let url = util.readFromClipboard();
            if (url)
                liberator.open(url, options.get("activate").has("paste") ? liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB);
            else
                liberator.beep();
        });

    // reloading
    mappings.add(myModes, ["r"],
        "Reload current page",
        function () { tabs.reload(getBrowser().mCurrentTab, false); });

    mappings.add(myModes, ["R"],
        "Reload while skipping the cache",
        function () { tabs.reload(getBrowser().mCurrentTab, true); });

    // yanking
    mappings.add(myModes, ["Y"],
        "Copy selected text or current word",
        function ()
        {
            let sel = buffer.getCurrentWord();

            if (sel)
                util.copyToClipboard(sel, true);
            else
                liberator.beep();
        });

    // zooming
    mappings.add(myModes, ["zi", "+"],
        "Enlarge text zoom of current web page",
        function (count) { buffer.zoomIn(count > 1 ? count : 1, false); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zm"],
        "Enlarge text zoom of current web page by a larger amount",
        function (count) { buffer.zoomIn((count > 1 ? count : 1) * 3, false); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zo", "-"],
        "Reduce text zoom of current web page",
        function (count) { buffer.zoomOut(count > 1 ? count : 1, false); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zr"],
        "Reduce text zoom of current web page by a larger amount",
        function (count) { buffer.zoomOut((count > 1 ? count : 1) * 3, false); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zz"],
        "Set text zoom value of current web page",
        function (count) { buffer.textZoom = count > 1 ? count : 100; },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zI"],
        "Enlarge full zoom of current web page",
        function (count) { buffer.zoomIn(count > 1 ? count : 1, true); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zM"],
        "Enlarge full zoom of current web page by a larger amount",
        function (count) { buffer.zoomIn((count > 1 ? count : 1) * 3, true); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zO"],
        "Reduce full zoom of current web page",
        function (count) { buffer.zoomOut(count > 1 ? count : 1, true); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zR"],
        "Reduce full zoom of current web page by a larger amount",
        function (count) { buffer.zoomOut((count > 1 ? count : 1) * 3, true); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["zZ"],
        "Set full zoom value of current web page",
        function (count) { buffer.fullZoom = count > 1 ? count : 100; },
        { flags: Mappings.flags.COUNT });

    // page info
    mappings.add(myModes, ["<C-g>"],
        "Print the current file name",
        function (count) { buffer.showPageInfo(false); },
        { flags: Mappings.flags.COUNT });

    mappings.add(myModes, ["g<C-g>"],
        "Print file information",
        function () { buffer.showPageInfo(true); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["ha[rdcopy]"],
        "Print current document",
        function (args)
        {
            let arg = args[0];

            // FIXME: arg handling is a bit of a mess, check for filename
            if (arg && (liberator.has("Win32") || arg[0] != ">"))
                return liberator.echoerr("E488: Trailing characters");

            options.temporaryContext(function () {
                if (arg)
                {
                    options.setPref("print.print_to_file", "true");
                    options.setPref("print.print_to_filename", io.getFile(arg.substr(1)).path);
                    liberator.echomsg("Printing to file: " + arg.substr(1));
                }
                else
                {
                    liberator.echomsg("Sending to printer...");
                }

                options.setPref("print.always_print_silent", args.bang);
                options.setPref("print.show_print_progress", !args.bang);

                getBrowser().contentWindow.print();
            });

            if (arg)
                liberator.echomsg("Printed: " + arg.substr(1));
            else
                liberator.echomsg("Print job sent.");
        },
        {
            argCount: "?",
            literal: 0,
            bang: true
        });

    commands.add(["pa[geinfo]"],
        "Show various page information",
        function (args) { buffer.showPageInfo(true, args[0]); },
        {
            argCount: "?",
            completer: function (context)
            {
                completion.optionValue(context, "pageinfo", "+", "");
                context.title = ["Page Info"];
            }
        });

    commands.add(["pagest[yle]"],
        "Select the author style sheet to apply",
        function (args)
        {
            let arg = args.literalArg;

            let titles = buffer.alternateStyleSheets.map(function (stylesheet) stylesheet.title);

            if (arg && titles.indexOf(arg) == -1)
            {
                liberator.echoerr("E475: Invalid argument: " + arg);
                return;
            }

            if (options["usermode"])
                options["usermode"] = false;

            window.stylesheetSwitchAll(window.content, arg);
        },
        {
            argCount: "?",
            completer: function (context) completion.alternateStyleSheet(context),
            literal: 0
        });

    commands.add(["re[load]"],
        "Reload current page",
        function (args) { tabs.reload(getBrowser().mCurrentTab, args.bang); },
        {
            bang: true,
            argCount: "0"
        });

    // TODO: we're prompted if download.useDownloadDir isn't set and no arg specified - intentional?
    commands.add(["sav[eas]", "w[rite]"],
        "Save current document to disk",
        function (args)
        {
            let doc = window.content.document;
            let chosenData = null;
            let filename = args[0];

            if (filename)
            {
                let file = io.getFile(filename);

                if (file.exists() && !args.bang)
                    return void liberator.echoerr("E13: File exists (add ! to override)");

                chosenData = { file: file, uri: window.makeURI(doc.location.href, doc.characterSet) };
            }

            // if browser.download.useDownloadDir = false then the "Save As"
            // dialog is used with this as the default directory
            // TODO: if we're going to do this shouldn't it be done in setCWD or the value restored?
            options.setPref("browser.download.lastDir", io.getCurrentDirectory().path);

            try
            {
                var contentDisposition = window.content
                                               .QueryInterface(Ci.nsIInterfaceRequestor)
                                               .getInterface(Ci.nsIDOMWindowUtils)
                                               .getDocumentMetadata("content-disposition");
            } catch (e) {}

            window.internalSave(doc.location.href, doc, null, contentDisposition,
                doc.contentType, false, null, chosenData, doc.referrer ?
                window.makeURI(doc.referrer) : null, true);
        },
        {
            argCount: "?",
            bang: true,
            completer: function (context) completion.file(context)
        });

    commands.add(["st[op]"],
        "Stop loading",
        function () { window.BrowserStop(); },
        { argCount: "0" });

    commands.add(["vie[wsource]"],
        "View source code of current document",
        function (args) { buffer.viewSource(args[0], args.bang); },
        {
            argCount: "?",
            bang: true,
            completer: function (context) completion.url(context, "bhf")
        });

    commands.add(["zo[om]"],
        "Set zoom value of current web page",
        function (args)
        {
            let arg = args[0];
            let level;

            if (!arg)
            {
                level = 100;
            }
            else if (/^\d+$/.test(arg))
            {
                level = parseInt(arg, 10);
            }
            else if (/^[+-]\d+$/.test(arg))
            {
                if (args.bang)
                    level = buffer.fullZoom + parseInt(arg, 10);
                else
                    level = buffer.textZoom + parseInt(arg, 10);

                // relative args shouldn't take us out of range
                if (level < ZOOM_MIN)
                    level = ZOOM_MIN;
                if (level > ZOOM_MAX)
                    level = ZOOM_MAX;
            }
            else
            {
                liberator.echoerr("E488: Trailing characters");
                return;
            }

            if (args.bang)
                buffer.fullZoom = level;
            else
                buffer.textZoom = level;
        },
        {
            argCount: "?",
            bang: true
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PAGE INFO ///////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    addPageInfoSection("f", "Feeds", function (verbose)
    {
        let doc = window.content.document;

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
                    isFeed = ((type == "text/xml" || type == "application/rdf+xml" || type == "application/xml")
                        && titleRegex.test(data.title));
                }
            }

            if (isFeed)
            {
                try
                {
                    window.urlSecurityCheck(data.href, principal,
                            Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL);
                }
                catch (e)
                {
                    isFeed = false;
                }
            }

            if (type)
                data.type = type;

            return isFeed;
        }

        // put feeds rss into pageFeeds[]
        let nFeed = 0;
        for (let [,link] in Iterator(doc.getElementsByTagName("link")))
        {
            if (!link.href)
                return;

            let rel = link.rel && link.rel.toLowerCase();

            if (rel == "feed" || (link.type && rel == "alternate"))
            {
                let feed = { title: link.title, href: link.href, type: link.type || "" };
                if (isValidFeed(feed, doc.nodePrincipal, rel == "feed"))
                {
                    nFeed++;
                    let type = feedTypes[feed.type] || feedTypes["application/rss+xml"];
                    if (verbose)
                        yield [feed.title, template.highlightURL(feed.href, true) + <span class="extra-info">&#xa0;({type})</span>];
                }
            }
        }

        if (!verbose && nFeed)
            yield nFeed + " feed" + (nFeed > 1 ? "s" : "");
    });

    addPageInfoSection("g", "General Info", function (verbose)
    {
        let doc = window.content.document;

        // get file size
        const ACCESS_READ = Ci.nsICache.ACCESS_READ;
        let cacheKey = doc.location.toString().replace(/#.*$/, "");

        for (let proto in util.Array.iterator(["HTTP", "FTP"]))
        {
            try
            {
                var cacheEntryDescriptor = services.get("cache").createSession(proto, 0, true)
                                                   .openCacheEntry(cacheKey, ACCESS_READ, false);
                break;
            }
            catch (e) {}
        }

        let pageSize = []; // [0] bytes; [1] kbytes
        if (cacheEntryDescriptor)
        {
            pageSize[0] = util.formatBytes(cacheEntryDescriptor.dataSize, 0, false);
            pageSize[1] = util.formatBytes(cacheEntryDescriptor.dataSize, 2, true);
            if (pageSize[1] == pageSize[0])
                pageSize.length = 1; // don't output "xx Bytes" twice
        }

        let lastModVerbose = new Date(doc.lastModified).toLocaleString();
        let lastMod = new Date(doc.lastModified).toLocaleFormat("%x %X");

        // FIXME: probably not portable across different language versions
        if (lastModVerbose == "Invalid Date" || new Date(doc.lastModified).getFullYear() == 1970)
            lastModVerbose = lastMod = null;

        if (!verbose)
        {
            if (pageSize[0])
                yield (pageSize[1] || pageSize[0]) + " bytes";
            yield lastMod;
            return;
        }

        yield ["Title", doc.title];
        yield ["URL", template.highlightURL(doc.location.toString(), true)];

        let ref = "referrer" in doc && doc.referrer;
        if (ref)
            yield ["Referrer", template.highlightURL(ref, true)];

        if (pageSize[0])
            yield ["File Size", pageSize[1] ? pageSize[1] + " (" + pageSize[0] + ")"
                                            : pageSize[0]];

        yield ["Mime-Type", doc.contentType];
        yield ["Encoding", doc.characterSet];
        yield ["Compatibility", doc.compatMode == "BackCompat" ? "Quirks Mode" : "Full/Almost Standards Mode"];
        if (lastModVerbose)
            yield ["Last Modified", lastModVerbose];
    });

    addPageInfoSection("m", "Meta Tags", function (verbose)
    {
        // get meta tag data, sort and put into pageMeta[]
        let metaNodes = window.content.document.getElementsByTagName("meta");

        return Array.map(metaNodes, function (node) [(node.name || node.httpEquiv), template.highlightURL(node.content)])
                    .sort(function (a, b) util.compareIgnoreCase(a[0], b[0]));
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        /**
         * @property {Array} The alternative stylesheets for the current
         *     buffer. Only returns stylesheets for the 'screen' media type.
         */
        get alternateStyleSheets()
        {
            let stylesheets = window.getAllStyleSheets(window.content);

            return stylesheets.filter(
                function (stylesheet) /^(screen|all|)$/i.test(stylesheet.media.mediaText) && !/^\s*$/.test(stylesheet.title)
            );
        },

        /**
         * @property {Object} A map of page info sections to their
         *     content generating functions.
         */
        get pageInfo() pageInfo,

        /**
         * @property {number} A value indicating whether the buffer is loaded.
         *     Values may be:
         *         0 - Loading.
         *         1 - Fully loaded.
         *         2 - Load failed.
         */
        get loaded()
        {
            if (window.content.document.pageIsFullyLoaded !== undefined)
                return window.content.document.pageIsFullyLoaded;
            else
                return 0; // in doubt return "loading"
        },
        set loaded(value)
        {
            window.content.document.pageIsFullyLoaded = value;
        },

        /**
         * @property {Object} The last focused input field in the buffer. Used
         *     by the "gi" key binding.
         */
        get lastInputField()
        {
            if (window.content.document.lastInputField)
                return window.content.document.lastInputField;
            else
                return null;
        },
        set lastInputField(value)
        {
            window.content.document.lastInputField = value;
        },

        /**
         * @property {string} The current top-level document's URL.
         */
        get URL()
        {
            return window.content.document.location.href;
        },

        /**
         * @property {number} The buffer's height in pixels.
         */
        get pageHeight()
        {
            return window.content.innerHeight;
        },

        /**
         * @property {number} The current browser's text zoom level, as a
         *     percentage with 100 as 'normal'. Only affects text size.
         */
        get textZoom()
        {
            return getBrowser().markupDocumentViewer.textZoom * 100;
        },
        set textZoom(value)
        {
            setZoom(value, false);
        },

        /**
         * @property {number} The current browser's text zoom level, as a
         *     percentage with 100 as 'normal'. Affects text size, as well as
         *     image size and block size.
         */
        get fullZoom()
        {
            return getBrowser().markupDocumentViewer.fullZoom * 100;
        },
        set fullZoom(value)
        {
            setZoom(value, true);
        },

        /**
         * @property {string} The current document's title.
         */
        get title()
        {
            return window.content.document.title;
        },

        /**
         * Adds a new section to the page information output.
         *
         * @param {string} option The section's value in 'pageinfo'.
         * @param {string} title The heading for this section's
         *     output.
         * @param {function} fn The function to generate this
         *     section's output.
         */
        addPageInfoSection: addPageInfoSection,

        /**
         * Evaluates an XPath expression in the current or provided
         * document.  It provides the xhtml and liberator XML
         * namespaces. The result may be used as an iterator.
         *
         * @param {string} expression The XPath expression to evaluate.
         * @param {Document} doc The document to evaluate the expression in.
         * @default The current document.
         * @param {Node} elem The context element.
         * @default <b>doc</b>
         * @param {boolean} asIterator Whether to return the results as an XPath
         *     iterator.
         */
        evaluateXPath: function (expression, doc, elem, asIterator)
        {
            if (!doc)
                doc = window.content.document;
            if (!elem)
                elem = doc;

            let result = doc.evaluate(expression, elem,
                function lookupNamespaceURI(prefix)
                {
                    return {
                        xhtml: "http://www.w3.org/1999/xhtml",
                        liberator: NS.uri
                    }[prefix] || null;
                },
                asIterator ? XPathResult.ORDERED_NODE_ITERATOR_TYPE : XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null
            );

            result.__iterator__ = asIterator
                                ? function () { let elem; while ((elem = this.iterateNext())) yield elem; }
                                : function () { for (let i = 0; i < this.snapshotLength; i++) yield this.snapshotItem(i); };

            return result;
        },

        /**
         * Returns the currently selected word. If the selection is
         * null, it tries to guess the word that the caret is
         * positioned in.
         *
         * NOTE: might change the selection
         *
         * @returns {string}
         */
        // FIXME: getSelection() doesn't always preserve line endings, see:
        // https://www.mozdev.org/bugs/show_bug.cgi?id=19303
        getCurrentWord: function ()
        {
            let selection = window.content.getSelection();
            if (selection.isCollapsed)
            {
                let selController = this.selectionController;
                let caretmode = selController.getCaretEnabled();
                selController.setCaretEnabled(true);
                selController.wordMove(false, false);
                selController.wordMove(true, true);
                selController.setCaretEnabled(caretmode);
            }
            let range = selection.getRangeAt(0);
            if (util.computedStyle(range.startContainer).whiteSpace == "pre"
                && util.computedStyle(range.endContainer).whiteSpace == "pre")
                return String(range);
            return String(selection);
        },

        /**
         * Focuses the given element. In contrast to a simple
         * elem.focus() call, this function works for iframes and
         * image maps.
         *
         * @param {Node} elem The element to focus.
         */
        // TODO: merge with followLink()?
        focusElement: function (elem)
        {
            let doc = window.content.document;
            let elemTagName = elem.localName.toLowerCase();
            if (elemTagName == "frame" || elemTagName == "iframe")
            {
                elem.contentWindow.focus();
                return;
            }

            elem.focus();

            let evt = doc.createEvent("MouseEvents");
            let x = 0;
            let y = 0;
            // for imagemap
            if (elemTagName == "area")
                [x, y] = elem.getAttribute("coords").split(",").map(Number);

            evt.initMouseEvent("mouseover", true, true, doc.defaultView, 1, x, y, 0, 0, 0, 0, 0, 0, 0, null);
            elem.dispatchEvent(evt);
        },

        /**
         * Tries to guess links the like of "next" and "prev". Though it has a
         * singularly horrendous name, it turns out to be quite useful.
         *
         * @param {string} rel The relationship to look for. Looks for
         *     links with matching @rel or @rev attributes, and,
         *     failing that, looks for an option named rel +
         *     "pattern", and finds the last link matching that
         *     RegExp.
         */
        followDocumentRelationship: function (rel)
        {
            let regexps = options.get(rel + "pattern").values
                                 .map(function (re) RegExp(re, "i"));

            function followFrame(frame)
            {
                function iter(elems) (e for ([i, e] in Iterator(elems)) if (e.rel.toLowerCase() == rel || e.rev.toLowerCase() == rel));

                // <link>s have higher priority than normal <a> hrefs
                let elems = frame.document.getElementsByTagName("link");
                for (let elem in iter(elems))
                {
                    liberator.open(elem.href);
                    return true;
                }

                // no links? ok, look for hrefs
                elems = frame.document.getElementsByTagName("a");
                for (let elem in iter(elems))
                {
                    buffer.followLink(elem, liberator.CURRENT_TAB);
                    return true;
                }

                let res = buffer.evaluateXPath(options["hinttags"], frame.document);
                for (let [,regex] in Iterator(regexps))
                {
                    for (let i in util.range(res.snapshotLength, 0, true))
                    {
                        let elem = res.snapshotItem(i);
                        if (regex.test(elem.textContent))
                        {
                            buffer.followLink(elem, liberator.CURRENT_TAB);
                            return true;
                        }
                        // images with alt text being href
                        if (Array.some(elem.childNodes, function (child) regex.test(child.alt)))
                        {
                            buffer.followLink(elem, liberator.CURRENT_TAB);
                            return true;
                        }
                    }
                }
                return false;
            }

            let retVal = followFrame(window.content);
            if (!retVal)
                // only loop through frames if the main content didnt match
                retVal = Array.some(window.content.frames, followFrame);

            if (!retVal)
                liberator.beep();
        },

        /**
         * Fakes a click on a link.
         *
         * @param {Node} elem The element to click.
         * @param {number} where Where to open the link. See
         *     {@link liberator.open}.
         */
        followLink: function (elem, where)
        {
            let doc = elem.ownerDocument;
            let view = doc.defaultView;
            let offsetX = 1;
            let offsetY = 1;

            let localName = elem.localName.toLowerCase();
            if (localName == "frame" || localName == "iframe") // broken?
            {
                elem.contentWindow.focus();
                return;
            }
            else if (localName == "area") // for imagemap
            {
                let coords = elem.getAttribute("coords").split(",");
                offsetX = Number(coords[0]) + 1;
                offsetY = Number(coords[1]) + 1;
            }

            let ctrlKey = false, shiftKey = false;
            switch (where)
            {
                case liberator.NEW_TAB:
                case liberator.NEW_BACKGROUND_TAB:
                    ctrlKey = true;
                    shiftKey = (where != liberator.NEW_BACKGROUND_TAB);
                    break;
                case liberator.NEW_WINDOW:
                    shiftKey = true;
                    break;
                case liberator.CURRENT_TAB:
                    break;
                default:
                    liberator.log("Invalid where argument for followLink()", 0);
            }

            elem.focus();

            let evt = doc.createEvent("MouseEvents");
            ["mousedown", "mouseup", "click"].forEach(function (event) {
                evt.initMouseEvent(event, true, true, view, 1, offsetX, offsetY, 0, 0,
                        ctrlKey, /*altKey*/0, shiftKey, /*metaKey*/ ctrlKey, 0, null);
                elem.dispatchEvent(evt);
            });
        },

        /**
         * @property {Object} The current document's selection controller.
         */
        get selectionController() getBrowser().docShell
                .QueryInterface(Ci.nsIInterfaceRequestor)
                .getInterface(Ci.nsISelectionDisplay)
                .QueryInterface(Ci.nsISelectionController),

        /**
         * Saves a page link to disk.
         *
         * @param {Object} elem The page link to save.
         * @param {boolean} skipPrompt Whether to open the "Save Link As..." dialog
         */
        saveLink: function (elem, skipPrompt)
        {
            let doc  = elem.ownerDocument;
            let url  = window.makeURLAbsolute(elem.baseURI, elem.href);
            let text = elem.textContent;

            try
            {
                window.urlSecurityCheck(url, doc.nodePrincipal);
                // we always want to save that link relative to the current working directory
                options.setPref("browser.download.lastDir", io.getCurrentDirectory().path);
                window.saveURL(url, text, null, true, skipPrompt, makeURI(url, doc.characterSet));
            }
            catch (e)
            {
                liberator.echoerr(e);
            }
        },

        /**
         * Scrolls to the bottom of the current buffer.
         */
        scrollBottom: function ()
        {
            scrollToPercentiles(-1, 100);
        },

        /**
         * Scrolls the window laterally <b>cols</b> columns.
         *
         * @param {number} cols The number of columns to scroll.
         */
        scrollColumns: function (cols)
        {
            let win = findScrollableWindow();
            const COL_WIDTH = 20;

            if (cols > 0 && win.scrollX >= win.scrollMaxX || cols < 0 && win.scrollX == 0)
                liberator.beep();

            win.scrollBy(COL_WIDTH * cols, 0);
        },

        /**
         * Scrolls the buffer to its rightmost position.
         */
        scrollEnd: function ()
        {
            scrollToPercentiles(100, -1);
        },

        /**
         * Scrolls the buffer vertically <b>lines</b> rows.
         *
         * @param {number} lines The number of lines to scroll.
         */
        scrollLines: function (lines)
        {
            let win = findScrollableWindow();
            checkScrollYBounds(win, lines);
            win.scrollByLines(lines);
        },

        /**
         * Scrolls the buffer vertically <b>pages</b> pages.
         *
         * @param {number} pages The number of pages to scroll.
         */
        scrollPages: function (pages)
        {
            let win = findScrollableWindow();
            checkScrollYBounds(win, pages);
            win.scrollByPages(pages);
        },

        /**
         * Scrolls the buffer vertically <b>count</b> * 'scroll' rows.
         *
         * @param {number} count The multiple of 'scroll' lines to scroll.
         * @param {number} direction The direction to scroll, down if 1 and up if -1.
         */
        scrollByScrollSize: function (count, direction) // XXX: boolean
        {
            if (count > 0)
                options["scroll"] = count;

            let win = findScrollableWindow();
            checkScrollYBounds(win, direction);

            if (options["scroll"] > 0)
                this.scrollLines(options["scroll"] * direction);
            else // scroll half a page down in pixels
                win.scrollBy(0, win.innerHeight / 2 * direction);
        },

        /**
         * Scrolls the current buffer vertically to <b>percentage</b>.
         *
         * @param {number} percentage The page percentile to scroll the buffer to.
         */
        scrollToPercentile: function (percentage)
        {
            scrollToPercentiles(-1, percentage);
        },

        /**
         * Scrolls the current buffer laterally to its leftmost.
         */
        scrollStart: function ()
        {
            scrollToPercentiles(0, -1);
        },

        /**
         * Scrolls the current buffer vertically to its top.
         */
        scrollTop: function ()
        {
            scrollToPercentiles(-1, 0);
        },

        // TODO: allow callback for filtering out unwanted frames? User defined?
        /**
         * Shifts the focus to another frame within the buffer. Each buffer
         * contains at least one frame.
         *
         * @param {number} count The number of frames to skip through.
         * @param {boolean} forward The direction of motion.
         */
        shiftFrameFocus: function (count, forward)
        {
            if (!(window.content.document instanceof HTMLDocument))
                return;

            count = Math.max(count, 1);
            let frames = [];

            // find all frames - depth-first search
            (function (frame) {
                if (frame.document.body.localName.toLowerCase() == "body")
                    frames.push(frame);
                Array.forEach(frame.frames, arguments.callee);
            })(window.content);

            if (frames.length == 0) // currently top is always included
                return;

            // remove all unfocusable frames
            // TODO: find a better way to do this - walking the tree is too slow
            let start = document.commandDispatcher.focusedWindow;
            frames = frames.filter(function (frame) {
                frame.focus();
                return document.commandDispatcher.focusedWindow == frame;
            });
            start.focus();

            // find the currently focused frame index
            // TODO: If the window is a frameset then the first _frame_ should be
            //       focused.  Since this is not the current FF behaviour,
            //       we initalize current to -1 so the first call takes us to the
            //       first frame.
            let current = frames.indexOf(document.commandDispatcher.focusedWindow);

            // calculate the next frame to focus
            let next = current;
            if (forward)
            {
                next = current + count;

                if (next > frames.length - 1)
                {
                    if (current == frames.length - 1)
                        liberator.beep();
                    next = frames.length - 1; // still allow the frame indicator to be activated
                }
            }
            else
            {
                next = current - count;

                if (next < 0)
                {
                    if (current == 0)
                        liberator.beep();
                    next = 0; // still allow the frame indicator to be activated
                }
            }

            // focus next frame and scroll into view
            frames[next].focus();
            if (frames[next] != window.content)
                frames[next].frameElement.scrollIntoView(false);

            // add the frame indicator
            let doc = frames[next].document;
            let indicator = util.xmlToDom(<div highlight="FrameIndicator"/>, doc);
            doc.body.appendChild(indicator);

            setTimeout(function () { doc.body.removeChild(indicator); }, 500);

            // Doesn't unattach
            //doc.body.setAttributeNS(NS.uri, "activeframe", "true");
            //setTimeout(function () { doc.body.removeAttributeNS(NS.uri, "activeframe"); }, 500);
        },

        // similar to pageInfo
        // TODO: print more useful information, just like the DOM inspector
        /**
         * Displays information about the specified element.
         *
         * @param {Object} elem
         */
        showElementInfo: function (elem)
        {
            liberator.echo(<>Element:<br/>{util.objectToString(elem, true)}</>, commandline.FORCE_MULTILINE);
        },

        /**
         * Displays information about the current buffer.
         *
         * @param {boolean} verbose Display more verbose information.
         * @param {string} sections A string limiting the displayed sections.
         * @default The value of 'pageinfo'.
         */
        showPageInfo: function (verbose, sections)
        {
            // Ctrl-g single line output
            if (!verbose)
            {
                let file = content.document.location.pathname.split("/").pop() || "[No Name]";
                let title = content.document.title || "[No Title]";

                let info = template.map("gf", function (opt)
                        template.map(pageInfo[opt][0](), util.identity, ", "),
                    ", ");

                if (bookmarks.isBookmarked(this.URL))
                    info += ", bookmarked";

                let pageInfoText = <>"{file}" [{info}] {title}</>;
                liberator.echo(pageInfoText, commandline.FORCE_SINGLELINE);
                return;
            }

            let option = sections || options["pageinfo"];
            let list = template.map(option, function (option) {
                let opt = pageInfo[option];
                if (opt)
                    return template.table(opt[1], opt[0](true));
            }, <br/>);
            liberator.echo(list, commandline.FORCE_MULTILINE);
        },

        /**
         * Opens a viewer to inspect the source of the currently selected range.
         */
        viewSelectionSource: function ()
        {
            // copied (and tuned somebit) from browser.jar -> nsContextMenu.js
            let focusedWindow = document.commandDispatcher.focusedWindow;
            if (focusedWindow == window)
                focusedWindow = content;

            let docCharset = null;
            if (focusedWindow)
                docCharset = "charset=" + focusedWindow.document.characterSet;

            let reference = null;
            reference = focusedWindow.getSelection();

            let docUrl = null;
            window.openDialog("chrome://global/content/viewPartialSource.xul",
                    "_blank", "scrollbars,resizable,chrome,dialog=no",
                    docUrl, docCharset, reference, "selection");
        },

        /**
         * Opens a viewer to inspect the source of the current buffer or the
         * specified <b>url</b>. Either the default viewer or the configured
         * external editor is used.
         *
         * @param {string} url The URL of the source.
         * @default The current buffer.
         * @param {boolean} useExternalEditor View the source in the external editor.
         */
        viewSource: function (url, useExternalEditor)
        {
            url = url || buffer.URL;

            if (useExternalEditor)
                editor.editFileExternally(url);
            else
                liberator.open("view-source:" + url);
        },

        /**
         * Increases the zoom level of the current buffer.
         *
         * @param {number} steps The number of zoom levels to jump.
         * @param {boolean} fullZoom Whether to use full zoom or text zoom.
         */
        zoomIn: function (steps, fullZoom)
        {
            bumpZoomLevel(steps, fullZoom);
        },

        /**
         * Decreases the zoom level of the current buffer.
         *
         * @param {number} steps The number of zoom levels to jump.
         * @param {boolean} fullZoom Whether to use full zoom or text zoom.
         */
        zoomOut: function (steps, fullZoom)
        {
            bumpZoomLevel(-steps, fullZoom);
        }
    };
    //}}}
}; //}}}

/**
 * @instance marks
 */
function Marks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var localMarks = storage.newMap("local-marks", true);
    var urlMarks = storage.newMap("url-marks", true);

    var pendingJumps = [];
    var appContent = document.getElementById("appcontent");

    if (appContent)
        appContent.addEventListener("load", onPageLoad, true);

    function onPageLoad(event)
    {
        let win = event.originalTarget.defaultView;
        for (let i = 0, length = pendingJumps.length; i < length; i++)
        {
            let mark = pendingJumps[i];
            if (win && win.location.href == mark.location)
            {
                win.scrollTo(mark.position.x * win.scrollMaxX, mark.position.y * win.scrollMaxY);
                pendingJumps.splice(i, 1);
                return;
            }
        }
    }

    function markToString(name, mark)
    {
        return name + ", " + mark.location +
                ", (" + Math.round(mark.position.x * 100) +
                "%, " + Math.round(mark.position.y * 100) + "%)" +
                (("tab" in mark) ? ", tab: " + tabs.index(mark.tab) : "");
    }

    function removeLocalMark(mark)
    {
        let localmark = localMarks.get(mark);
        if (localmark)
        {
            let win = window.content;
            for (let [i,] in Iterator(localmark))
            {
                if (localmark[i].location == win.location.href)
                {
                    liberator.log("Deleting local mark: " + markToString(mark, localmark[i]), 5);
                    localmark.splice(i, 1);
                    if (localmark.length == 0)
                        localMarks.remove(mark);
                    break;
                }
            }
        }
    }

    function removeURLMark(mark)
    {
        let urlmark = urlMarks.get(mark);
        if (urlmark)
        {
            liberator.log("Deleting URL mark: " + markToString(mark, urlmark), 5);
            urlMarks.remove(mark);
        }
    }

    function isLocalMark(mark) /^[a-z]$/.test(mark);
    function isURLMark(mark) /^[A-Z0-9]$/.test(mark);

    function localMarkIter()
    {
        for (let [mark, value] in localMarks)
            for (let [,val] in Iterator(value))
                yield [mark, val];
    }

    function getSortedMarks()
    {
        // local marks
        let location = window.content.location.href;
        let lmarks = [i for (i in localMarkIter()) if (i[1].location == location)];
        lmarks.sort();

        // URL marks
        // FIXME: why does umarks.sort() cause a "Component is not available =
        // NS_ERROR_NOT_AVAILABLE" exception when used here?
        let umarks = [i for (i in urlMarks)];
        umarks.sort(function (a, b) a[0].localeCompare(b[0]));

        return lmarks.concat(umarks);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;

    mappings.add(myModes,
        ["m"], "Set mark at the cursor position",
        function (arg)
        {
            if (/[^a-zA-Z]/.test(arg))
            {
                liberator.beep();
                return;
            }

            marks.add(arg);
        },
        { flags: Mappings.flags.ARGUMENT });

    mappings.add(myModes,
        ["'", "`"], "Jump to the mark in the current buffer",
        function (arg) { marks.jumpTo(arg); },
        { flags: Mappings.flags.ARGUMENT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["delm[arks]"],
        "Delete the specified marks",
        function (args)
        {
            let special = args.bang;
            let args = args.string;

            if (!special && !args)
            {
                liberator.echoerr("E471: Argument required");
                return;
            }
            if (special && args)
            {
                liberator.echoerr("E474: Invalid argument");
                return;
            }
            let matches;
            if (matches = args.match(/(?:(?:^|[^a-zA-Z0-9])-|-(?:$|[^a-zA-Z0-9])|[^a-zA-Z0-9 -]).*/))
            {
                // NOTE: this currently differs from Vim's behavior which
                // deletes any valid marks in the arg list, up to the first
                // invalid arg, as well as giving the error message.
                liberator.echoerr("E475: Invalid argument: " + matches[0]);
                return;
            }
            // check for illegal ranges - only allow a-z A-Z 0-9
            if (matches = args.match(/[a-zA-Z0-9]-[a-zA-Z0-9]/g))
            {
                for (let i = 0; i < matches.length; i++)
                {
                    let start = matches[i][0];
                    let end   = matches[i][2];
                    if (/[a-z]/.test(start) != /[a-z]/.test(end) ||
                        /[A-Z]/.test(start) != /[A-Z]/.test(end) ||
                        /[0-9]/.test(start) != /[0-9]/.test(end) ||
                        start > end)
                    {
                        liberator.echoerr("E475: Invalid argument: " + args.match(matches[i] + ".*")[0]);
                        return;
                    }
                }
            }

            marks.remove(args, special);
        },
        { bang: true });

    commands.add(["ma[rk]"],
        "Mark current location within the web page",
        function (args)
        {
            let mark = args[0];
            if (mark.length > 1)
            {
                liberator.echoerr("E488: Trailing characters");
                return;
            }
            if (!/[a-zA-Z]/.test(mark))
            {
                liberator.echoerr("E191: Argument must be a letter or forward/backward quote");
                return;
            }

            marks.add(mark);
        },
        { argCount: "1" });

    commands.add(["marks"],
        "Show all location marks of current web page",
        function (args)
        {
            args = args.string;

            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z]/.test(args))
            {
                liberator.echoerr("E283: No marks matching " + args.quote());
                return;
            }

            let filter = args.replace(/[^a-zA-Z]/g, "");
            marks.list(filter);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        /**
         * Add a named mark for the current buffer, at its current position.
         * If mark matches [A-Z], it's considered a URL mark, and will jump to
         * the same position at the same URL no matter what buffer it's
         * selected from. If it matches [a-z'"], it's a local mark, and can
         * only be recalled from a buffer with a matching URL.
         *
         * @param {string} mark
         */
        // TODO: add support for frameset pages
        add: function (mark)
        {
            let win = window.content;

            if (win.document.body.localName.toLowerCase() == "frameset")
            {
                liberator.echoerr("Marks support for frameset pages not implemented yet");
                return;
            }

            let x = win.scrollMaxX ? win.pageXOffset / win.scrollMaxX : 0;
            let y = win.scrollMaxY ? win.pageYOffset / win.scrollMaxY : 0;
            let position = { x: x, y: y };

            if (isURLMark(mark))
            {
                urlMarks.set(mark, { location: win.location.href, position: position, tab: tabs.getTab() });
                liberator.log("Adding URL mark: " + markToString(mark, urlMarks.get(mark)), 5);
            }
            else if (isLocalMark(mark))
            {
                // remove any previous mark of the same name for this location
                removeLocalMark(mark);
                if (!localMarks.get(mark))
                    localMarks.set(mark, []);
                let vals = { location: win.location.href, position: position };
                localMarks.get(mark).push(vals);
                liberator.log("Adding local mark: " + markToString(mark, vals), 5);
            }
        },

        /**
         * Remove all marks matching <b>filter</b>. If <b>special</b> is
         * given, removes all local marks.
         *
         * @param {string} filter A string containing one character for each
         *     mark to be removed.
         * @param {boolean} special Whether to delete all local marks.
         */
        // FIXME: Shouldn't special be replaced with a null filter?
        remove: function (filter, special)
        {
            if (special)
            {
                // :delmarks! only deletes a-z marks
                for (let [mark,] in localMarks)
                    removeLocalMark(mark);
            }
            else
            {
                for (let [mark,] in urlMarks)
                {
                    if (filter.indexOf(mark) >= 0)
                        removeURLMark(mark);
                }
                for (let [mark,] in localMarks)
                {
                    if (filter.indexOf(mark) >= 0)
                        removeLocalMark(mark);
                }
            }
        },

        /**
         * Jumps to the named mark. See {@link #add}
         *
         * @param {string} mark The mark to jump to.
         */
        jumpTo: function (mark)
        {
            let ok = false;

            if (isURLMark(mark))
            {
                let slice = urlMarks.get(mark);
                if (slice && slice.tab && slice.tab.linkedBrowser)
                {
                    if (slice.tab.parentNode != getBrowser().tabContainer)
                    {
                        pendingJumps.push(slice);
                        // NOTE: this obviously won't work on generated pages using
                        // non-unique URLs :(
                        liberator.open(slice.location, liberator.NEW_TAB);
                        return;
                    }
                    let index = tabs.index(slice.tab);
                    if (index != -1)
                    {
                        tabs.select(index);
                        let win = slice.tab.linkedBrowser.contentWindow;
                        if (win.location.href != slice.location)
                        {
                            pendingJumps.push(slice);
                            win.location.href = slice.location;
                            return;
                        }
                        liberator.log("Jumping to URL mark: " + markToString(mark, slice), 5);
                        win.scrollTo(slice.position.x * win.scrollMaxX, slice.position.y * win.scrollMaxY);
                        ok = true;
                    }
                }
            }
            else if (isLocalMark(mark))
            {
                let win = window.content;
                let slice = localMarks.get(mark) || [];

                for (let [,lmark] in Iterator(slice))
                {
                    if (win.location.href == lmark.location)
                    {
                        liberator.log("Jumping to local mark: " + markToString(mark, lmark), 5);
                        win.scrollTo(lmark.position.x * win.scrollMaxX, lmark.position.y * win.scrollMaxY);
                        ok = true;
                        break;
                    }
                }
            }

            if (!ok)
                liberator.echoerr("E20: Mark not set"); // FIXME: move up?
        },

        /**
         * List all marks matching <b>filter</b>.
         *
         * @param {string} filter
         */
        list: function (filter)
        {
            let marks = getSortedMarks();

            if (marks.length == 0)
            {
                liberator.echoerr("No marks set");
                return;
            }

            if (filter.length > 0)
            {
                marks = marks.filter(function (mark) filter.indexOf(mark[0]) >= 0);
                if (marks.length == 0)
                {
                    liberator.echoerr("E283: No marks matching " + filter.quote());
                    return;
                }
            }

            let list = template.tabular(["mark", "line", "col", "file"],
                ["", "text-align: right", "text-align: right", "color: green"],
                ([mark[0],
                  Math.round(mark[1].position.x * 100) + "%",
                  Math.round(mark[1].position.y * 100) + "%",
                  mark[1].location]
                  for each (mark in marks)));
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
