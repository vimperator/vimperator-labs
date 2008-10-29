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

Components.utils.import("resource://gre/modules/XPCOMUtils.jsm");

const Point = new Struct("x", "y");

function Buffer() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const highlightClasses = ["Boolean", "ErrorMsg", "Filter", "Function", "InfoMsg", "Keyword",
            "LineNr", "ModeMsg", "MoreMsg", "Normal", "Null", "Number", "Object", "Question",
            "StatusLine", "StatusLineBroken", "StatusLineSecure", "String", "TabClose", "TabIcon",
            "TabIconNumber", "TabNumber", "TabText", "Tag", "Title", "URL", "WarningMsg",
            ["Hint",   ".liberator-hint",     "*"],
            ["Search", ".__liberator-search", "*"],
            ["Bell",   "#liberator-visualbell"],
            ];
    const highlightDocs = "chrome://liberator/content/buffer.xhtml,chrome://browser/content/browser.xul";

    var highlight = storage.newMap("highlight", false);

    const util = modules.util;
    const arrayIter = util.Array.iterator;

    function Styles(name, store, serial)
    {
        /* Can't reference liberator or Components inside Styles --
         * they're members of the window object, which disappear
         * with this window.
         */
        const sleep = liberator.sleep;
        const storage = modules.storage;
        const consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                         .getService(Components.interfaces.nsIConsoleService);
        const ios = Components.classes["@mozilla.org/network/io-service;1"]
                              .getService(Components.interfaces.nsIIOService);
        const sss = Components.classes["@mozilla.org/content/style-sheet-service;1"]
                              .getService(Components.interfaces.nsIStyleSheetService);
        const XHTML = "http://www.w3.org/1999/xhtml";
        const namespace = "@namespace html url(" + XHTML + ");\n" +
                          "@namespace xul url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);\n";
        const Sheet = new Struct("name", "sites", "css", "ref");

        let cssUri = function (css) "chrome-data:text/css," + encodeURI(css);

        let userSheets = [];
        let systemSheets = [];
        let userNames = {};
        let systemNames = {};

        this.__iterator__ = function () Iterator(userSheets.concat(systemSheets));
        this.__defineGetter__("systemSheets", function () Iterator(systemSheets));
        this.__defineGetter__("userSheets", function () Iterator(userSheets));
        this.__defineGetter__("systemNames", function () Iterator(systemNames));
        this.__defineGetter__("userNames", function () Iterator(userNames));

        this.addSheet = function (name, filter, css, system, force)
        {
            let sheets = system ? systemSheets : userSheets;
            let names = system ? systemNames : userNames;
            if (name && name in names)
                this.removeSheet(name, null, null, null, system);

            let sheet = sheets.filter(function (s) s.sites.join(",") == filter && s.css == css)[0];
            if (!sheet)
                sheet = new Sheet(name, filter.split(","), css, null);

            if (sheet.ref == null) // Not registered yet
            {
                sheet.ref = [];
                try
                {
                    this.registerSheet(cssUri(wrapCSS(sheet)), !force);
                }
                catch (e)
                {
                    return e.echoerr || e;
                }
                sheets.push(sheet);
            }
            if (name)
            {
                sheet.ref.push(name);
                names[name] = sheet;
            }
            return null;
        }

        this.findSheets = function (name, filter, css, index, system)
        {
            let sheets = system ? systemSheets : userSheets;
            let names = system ? systemNames : userNames;

            // Grossly inefficient.
            let matches = [k for ([k, v] in sheets)];
            if (index)
                matches = String(index).split(",").filter(function (i) i in sheets);
            if (name)
                matches = matches.filter(function (i) sheets[i] == names[name]);
            if (css)
                matches = matches.filter(function (i) sheets[i].css == css);
            if (filter)
                matches = matches.filter(function (i) sheets[i].sites.indexOf(filter) >= 0);
            return matches;
        },

        this.removeSheet = function (name, filter, css, index, system)
        {
            let self = this;
            let sheets = system ? systemSheets : userSheets;
            let names = system ? systemNames : userNames;

            if (filter && filter.indexOf(",") > -1)
                return filter.split(",").reduce(
                    function (n, f) n + self.removeSheet(name, f, index, system), 0);

            if (filter == undefined)
                filter = "";

            let matches = this.findSheets(name, filter, css, index, system);
            if (matches.length == 0)
                return;

            for (let [,i] in Iterator(matches.reverse()))
            {
                let sheet = sheets[i];
                if (name)
                {
                    sheet.ref.splice(sheet.ref.indexOf(name));
                    delete names[name];
                }
                if (!sheet.ref.length)
                {
                    sheets.splice(i);
                    this.unregisterSheet(cssUri(wrapCSS(sheet)));
                }
                // Filter out the given site, and re-add if there are any left
                if (filter)
                {
                    let sites = sheet.sites.filter(function (f) f != filter);
                    if (sites.length)
                        this.addSheet(name, sites.join(","), css, system, true);
                }
            }
            return matches.length;
        }

        this.registerSheet = function (uri, doCheckSyntax, reload)
        {
            if (doCheckSyntax)
                checkSyntax(uri);
            if (reload)
                this.unregisterSheet(uri);
            uri = ios.newURI(uri, null, null);
            if (reload || !sss.sheetRegistered(uri, sss.USER_SHEET))
                sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
        }

        this.unregisterSheet = function (uri)
        {
            uri = ios.newURI(uri, null, null);
            if (sss.sheetRegistered(uri, sss.USER_SHEET))
                sss.unregisterSheet(uri, sss.USER_SHEET);
        }

        function wrapCSS(sheet)
        {
            let filter = sheet.sites;
            let css = sheet.css;
            if (filter[0] == "*")
                return namespace + css;
            let selectors = filter.map(function (part) (/[*]$/.test(part)   ? "url-prefix" :
                                                        /[\/:]/.test(part)  ? "url"
                                                                            : "domain")
                                                + '("' + part.replace(/"/g, "%22").replace(/[*]$/, "") + '")')
                                  .join(", ");
            return namespace + "@-moz-document " + selectors + "{\n" + css + "\n}\n";
        }

        let queryinterface = XPCOMUtils.generateQI([Components.interfaces.nsIConsoleListener]);
        /* What happens if more than one thread tries to use this? */
        let testDoc = document.implementation.createDocument(XHTML, "doc", null);
        function checkSyntax(uri)
        {
            let errors = [];
            let listener = {
                QueryInterface: queryinterface,
                observe: function (message)
                {
                    try
                    {
                        message = message.QueryInterface(Components.interfaces.nsIScriptError);
                        if (message.sourceName == uri)
                            errors.push(message);
                    }
                    catch (e) {}
                }
            };

            try
            {
                consoleService.registerListener(listener);
                if (testDoc.documentElement.firstChild)
                    testDoc.documentElement.removeChild(testDoc.documentElement.firstChild);
                testDoc.documentElement.appendChild(util.xmlToDom(
                        <html><head><link type="text/css" rel="stylesheet" href={uri}/></head></html>, testDoc));

                while (true)
                {
                    try
                    {
                        // Throws NS_ERROR_DOM_INVALID_ACCESS_ERR if not finished loading
                        testDoc.styleSheets[0].cssRules.length;
                        break;
                    }
                    catch (e)
                    {
                        if (e.name != "NS_ERROR_DOM_INVALID_ACCESS_ERR")
                            return [e.toString()];
                        sleep(10);
                    }
                }
            }
            finally
            {
                consoleService.unregisterListener(listener);
            }
            if (errors.length)
            {
                let err = new Error("", errors[0].sourceName.replace(/^(chrome-data:text\/css,).*/, "$1..."), errors[0].lineNumber);
                err.name = "CSSError"
                err.message = errors.reduce(function (msg, e) msg + "; " + e.lineNumber + ": " + e.errorMessage, errors.shift().errorMessage);
                err.echoerr = err.fileName + ":" + err.lineNumber + ": " + err.message;
                throw err;
            }
        }
    }
    Styles.prototype = {
        get sites() util.Array.uniq(util.Array.flatten([v.sites for ([k, v] in this.userSheets)]))
    };

    let styles = storage.newObject("styles", Styles, false);

    /* FIXME: This doesn't belong here. */
    let mainWindowID = config.mainWindowID || "main-window";
    let fontSize = document.defaultView.getComputedStyle(document.getElementById(mainWindowID), null)
                                       .getPropertyValue("font-size");

    styles.registerSheet("chrome://liberator/skin/liberator.css");
    let error = styles.addSheet("font-size", "chrome://liberator/content/buffer.xhtml",
        "body { font-size: " + fontSize + "; }", true);

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
        var win = window.document.commandDispatcher.focusedWindow;
        if (win && (win.scrollMaxX > 0 || win.scrollMaxY > 0))
            return win;

        win = window.content;
        if (win.scrollMaxX > 0 || win.scrollMaxY > 0)
            return win;

        for (let i = 0; i < win.frames.length; i++)
            if (win.frames[i].scrollMaxX > 0 || win.frames[i].scrollMaxY > 0)
                return win.frames[i];

        return win;
    }

    // both values are given in percent, -1 means no change
    function scrollToPercentiles(horizontal, vertical)
    {
        var win = findScrollableWindow();
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
            setter: function (value)
            {
                window.fullScreen = value;
                return value;
            },
            getter: function () window.fullScreen
        });

    options.add(["nextpattern"],
        "Patterns to use when guessing the 'next' page in a document sequence",
        "stringlist", "\\bnext\\b,^>$,^(>>|»)$,^(>|»),(>|»)$,\\bmore\\b");

    options.add(["previouspattern"],
        "Patterns to use when guessing the 'previous' page in a document sequence",
        "stringlist", "\\bprev|previous\\b,^<$,^(<<|«)$,^(<|«),(<|«)$");

    options.add(["pageinfo", "pa"], "Desired info on :pa[geinfo]", "charlist", "gfm",
        { completer: function (filter) [[k, v[1]] for ([k, v] in Iterator(pageInfo))] });

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
            validator: function (value) value >= 0 && value <= 2
        });

    options.add(["usermode", "um"],
        "Show current website with a minimal style sheet to make it easily accessible",
        "boolean", false,
        {
            setter: function (value)
            {
                try
                {
                    getMarkupDocumentViewer().authorStyleDisabled = value;
                }
                catch (e) {}

                return value;
            },
            getter: function ()
            {
                try
                {
                    return getMarkupDocumentViewer().authorStyleDisabled;
                }
                catch (e) {}
            }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes || [modes.NORMAL];

    mappings.add(myModes, ["."],
        "Repeat the last key event",
        function (count)
        {
            if (mappings.repeat)
            {
                for (let i in util.rangeInterruptable(0, count || 1, 100))
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
        function () { BrowserStop(); });

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
                var elements = [];
                var matches = buffer.evaluateXPath(
                    // TODO: type="file"
                    "//input[not(@type) or @type='text' or @type='password'] | //textarea[not(@disabled) and not(@readonly)] |" +
                    "//xhtml:input[not(@type) or @type='text' or @type='password'] | //xhtml:textarea[not(@disabled) and not(@readonly)]"
                );

                for (match in matches)
                {
                    let computedStyle = window.content.getComputedStyle(match, null);

                    if (computedStyle.getPropertyValue("visibility") != "hidden" && computedStyle.getPropertyValue("display") != "none")
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
        function () { liberator.open(util.readFromClipboard()); });

    mappings.add(myModes, ["P"],
        "Open (put) a URL based on the current clipboard contents in a new buffer",
        function ()
        {
            liberator.open(util.readFromClipboard(),
                /\bpaste\b/.test(options["activate"]) ?
                liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB);
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
            var sel = buffer.getCurrentWord();
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
        function (args, special)
        {
            var aps = options.getPref("print.always_print_silent");
            var spp = options.getPref("print.show_print_progress");

            liberator.echo("Sending to printer...");
            options.setPref("print.always_print_silent", special);
            options.setPref("print.show_print_progress", !special);

            getBrowser().contentWindow.print();

            options.setPref("print.always_print_silent", aps);
            options.setPref("print.show_print_progress", spp);
            liberator.echo("Print job sent.");
        },
        {
            argCount: "0",
            bang: true
        });

    commands.add(["pa[geinfo]"],
        "Show various page information",
        function () { buffer.showPageInfo(true); },
        { argCount: "0" });

    commands.add(["pagest[yle]"],
        "Select the author style sheet to apply",
        function (args)
        {
            args = args.string;

            var titles = buffer.alternateStyleSheets.map(function (stylesheet) stylesheet.title);

            if (args && titles.indexOf(args) == -1)
            {
                liberator.echoerr("E475: Invalid argument: " + args);
                return;
            }

            if (options["usermode"])
                options["usermode"] = false;

            stylesheetSwitchAll(window.content, args);
        },
        { completer: function (filter) completion.stylesheet(filter) });

    commands.add(["re[load]"],
        "Reload current page",
        function (args, special) { tabs.reload(getBrowser().mCurrentTab, special); },
        {
            bang: true,
            argCount: "0"
        });

    // TODO: we're prompted if download.useDownloadDir isn't set and no arg specified - intentional?
    commands.add(["sav[eas]", "w[rite]"],
        "Save current document to disk",
        function (args, special)
        {
            let doc = window.content.document;
            let chosenData = null;
            let filename = args.arguments[0];

            if (filename)
            {
                let file = io.getFile(filename);

                if (file.exists() && !special)
                {
                    liberator.echoerr("E13: File exists (add ! to override)");
                    return;
                }

                chosenData = { file: file, uri: makeURI(doc.location.href, doc.characterSet) };
            }

            // if browser.download.useDownloadDir = false then the "Save As"
            // dialog is used with this as the default directory
            // TODO: if we're going to do this shouldn't it be done in setCWD or the value restored?
            options.setPref("browser.download.lastDir", io.getCurrentDirectory());

            try
            {
                var contentDisposition = window.content
                                               .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                                               .getInterface(Components.interfaces.nsIDOMWindowUtils)
                                               .getDocumentMetadata("content-disposition");
            } catch (e) {}

            internalSave(doc.location.href, doc, null, contentDisposition,
                doc.contentType, false, null, chosenData, doc.referrer ?
                makeURI(doc.referrer) : null, true);
        },
        {
            argCount: "?",
            bang: true,
            completer: function (filter) completion.file(filter)
        });

    commands.add(["st[op]"],
        "Stop loading",
        function () { BrowserStop(); },
        { argCount: "0" });

    commands.add(["sty[le]"],
        "Add or list user styles",
        function (args, special)
        {
            let [filter] = args.arguments;
            let name = args["-name"];
            let css = args.literalArg;

            if (!css)
            {
                let list = Array.concat([i for (i in styles.userNames)],
                                        [i for (i in styles.userSheets) if (!i[1].ref.length)]);
                let str = template.tabular(["", "Filter", "CSS"],
                    ["padding: 0 1em 0 1ex; vertical-align: top", "padding: 0 1em 0 0; vertical-align: top"],
                    ([k, v[1].join(","), v[2]]
                     for ([i, [k, v]] in Iterator(list))
                     if ((!filter || v[1].indexOf(filter) >= 0) && (!name || v[0] == name))));
                commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
            }
            else
            {
                let err = styles.addSheet(name, filter, css, false, special);
                if (err)
                    liberator.echoerr(err);
            }
        },
        {
            completer: function (filter) {
                let compl = [];
                try
                {
                    compl.push([content.location.host, "Current Host"]);
                    compl.push([content.location.href, "Current URL"]);
                }
                catch (e) {}
                comp = compl.concat([[s, ""] for each (s in styles.sites)])
                return [0, completion.filter(compl, filter)];
            },
            argCount: 1,
            bang: true,
            hereDoc: true,
            literal: true,
            options: [[["-name", "-n"], commands.OPTION_STRING]]
        });

    commands.add(["dels[tyle]"],
        "Remove a user stylesheet",
        function (args) {
            styles.removeSheet(args["-name"], args.arguments[0], args.literalArg, args["-index"], false);
        },
        {
            argCount: 1,
            completer: function (filter) [0, completion.filter(
                    [[i, <>{s.sites.join(",")}: {s.css.replace("\n", "\\n")}</>]
                        for ([i, s] in styles.userSheets)
                    ]
                    .concat([[s, ""] for each (s in styles.sites)])
                    , filter)],
            literal: true,
            options: [[["-index", "-i"], commands.OPTION_INT],
                      [["-name", "-n"],  commands.OPTION_STRING]]
        });

    commands.add(["hi[ghlight]"],
        "Set the style of certain display elements",
        function (args, special)
        {
            let key = args.arguments[0];
            let css = args.literalArg;
            if (!css && !(key && special))
            {
                let str = template.tabular(["Key", "CSS"],
                    ["padding: 0 1em 0 0; vertical-align: top"],
                    (h for (h in highlight) if (!key || h[0].indexOf(key) > -1)));
                commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                return;
            }
            buffer.highlight(key, css, special);
        },
        {
            // TODO: add this as a standard highlight completion function?
            // I agree. It could (should) be much more sophisticated. --Kris
            completer: function (filter) [0,
                    completion.filter([[v instanceof Array ? v[0] : v, ""] for ([k, v] in Iterator(highlightClasses))], filter)
                ],
            argCount: 1,
            bang: true,
            hereDoc: true,
            literal: true
        });

    commands.add(["vie[wsource]"],
        "View source code of current document",
        function (args, special) { buffer.viewSource(args.arguments[0], special); },
        {
            argCount: "?",
            bang: true,
            completer: function (filter) completion.url(filter, "bhf")
        });

    commands.add(["zo[om]"],
        "Set zoom value of current web page",
        function (args, special)
        {
            args = args.string;

            let level;

            if (!args)
            {
                level = 100;
            }
            else if (/^\d+$/.test(args))
            {
                level = parseInt(args, 10);
            }
            else if (/^[+-]\d+$/.test(args))
            {
                if (special)
                    level = buffer.fullZoom + parseInt(args, 10);
                else
                    level = buffer.textZoom + parseInt(args, 10);

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

            if (special)
                buffer.fullZoom = level;
            else
                buffer.textZoom = level;
        },
        { bang: true });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PAGE INFO ///////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    addPageInfoSection("f", "Feeds", function (verbose)
    {
        var doc = window.content.document;

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
                    urlSecurityCheck(data.href, principal,
                            Components.interfaces.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL);
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
        var linkNodes = doc.getElementsByTagName("link");
        for (link in arrayIter(linkNodes))
        {
            if (!link.href)
                return;

            var rel = link.rel && link.rel.toLowerCase();

            if (rel == "feed" || (link.type && rel == "alternate"))
            {
                var feed = { title: link.title, href: link.href, type: link.type || "" };
                if (isValidFeed(feed, doc.nodePrincipal, rel == "feed"))
                {
                    nFeed++;
                    var type = feedTypes[feed.type] || feedTypes["application/rss+xml"];
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
        const nsICacheService = Components.interfaces.nsICacheService;
        const ACCESS_READ = Components.interfaces.nsICache.ACCESS_READ;
        const cacheService = Components.classes["@mozilla.org/network/cache-service;1"]
                                       .getService(nsICacheService);
        let cacheKey = doc.location.toString().replace(/#.*$/, "");

        for (let proto in arrayIter(["HTTP", "FTP"]))
        {
            try
            {
                var cacheEntryDescriptor = cacheService.createSession(proto, 0, true)
                                                       .openCacheEntry(cacheKey, ACCESS_READ, false);
                break;
            }
            catch (e) {}
        }

        var pageSize = []; // [0] bytes; [1] kbytes
        if (cacheEntryDescriptor)
        {
            pageSize[0] = util.formatBytes(cacheEntryDescriptor.dataSize, 0, false);
            pageSize[1] = util.formatBytes(cacheEntryDescriptor.dataSize, 2, true);
            if (pageSize[1] == pageSize[0])
                pageSize.length = 1; // don't output "xx Bytes" twice
        }

        var lastModVerbose = new Date(doc.lastModified).toLocaleString();
        var lastMod = new Date(doc.lastModified).toLocaleFormat("%x %X");
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

        var ref = "referrer" in doc && doc.referrer;
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
        var metaNodes = window.content.document.getElementsByTagName("meta");

        return Array.map(metaNodes, function (node) [(node.name || node.httpEquiv), template.highlightURL(node.content)])
                    .sort(function (a, b) String.localeCompare(a[0].toLowerCase(), b[0].toLowerCase()));
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get alternateStyleSheets()
        {
            var stylesheets = getAllStyleSheets(window.content);

            stylesheets = stylesheets.filter(
                function (stylesheet) /^(screen|all|)$/i.test(stylesheet.media.mediaText) && !/^\s*$/.test(stylesheet.title)
            );

            return stylesheets;
        },

        get pageInfo() pageInfo,

        // 0 if loading, 1 if loaded or 2 if load failed
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

        // used to keep track of the right field for "gi"
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

        get URL()
        {
            return window.content.document.location.href;
        },

        get pageHeight()
        {
            return window.content.innerHeight;
        },

        get textZoom()
        {
            return getBrowser().markupDocumentViewer.textZoom * 100;
        },
        set textZoom(value)
        {
            setZoom(value, false);
        },

        get fullZoom()
        {
            return getBrowser().markupDocumentViewer.fullZoom * 100;
        },
        set fullZoom(value)
        {
            setZoom(value, true);
        },

        get title()
        {
            return window.content.document.title;
        },

        addPageInfoSection: addPageInfoSection,

        highlight: function (key, style, force)
        {
            let [, class, selectors] = key.match(/^([a-zA-Z_-]+)(.*)/);

            class = highlightClasses.filter(function (i) i == class || i[0] == class)[0];
            if (!class)
            {
                liberator.echoerr("Unknown highlight keyword");
                return;
            }
            if (!(class instanceof Array))
                class = [class];

            styles.removeSheet("hl-" + key, null, null, null, true);
            highlight.remove(key);

            if (/^\s*$/.test(style))
                return;

            let cssClass = class[1] || ".hl-" + class[0];
            let scope = class[2] || highlightDocs;

            let css = style.replace(/(?:!\s*important\s*)?(?:;?\s*$|;)/g, "!important;")
                           .replace(";!important;", ";", "g") // Seeming Spidermonkey bug
            css = cssClass + selectors + " { " + css + " }";

            let error = styles.addSheet("hl-" + key, scope, css, true, force);
            if (error)
                liberator.echoerr(error);
            else
                highlight.set(key, style);
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

            result.__iterator__ = asIterator
                                ? function () { let elem; while ((elem = this.iterateNext())) yield elem; }
                                : function () { for (let i = 0; i < this.snapshotLength; i++) yield this.snapshotItem(i); };

            return result;
        },

        // in contrast to vim, returns the selection if one is made,
        // otherwise tries to guess the current word unter the text cursor
        // NOTE: might change the selection
        getCurrentWord: function ()
        {
            var selection = window.content.getSelection().toString();

            if (!selection)
            {
                let selController = this.selectionController;
                let caretmode = selController.getCaretEnabled();
                selController.setCaretEnabled(true);
                selController.wordMove(false, false);
                selController.wordMove(true, true);
                selection = window.content.getSelection().toString();
                selController.setCaretEnabled(caretmode);
            }

            return selection;
        },

        // quick function to get elements inside the document reliably
        // argument "args" is something like: @id='myid' or @type='text' (don't forget the quotes around myid)
        getElement: function (args, index)
        {
            return buffer.evaluateXPath("//*[" + (args || "") + "]").snapshotItem(index || 0);
        },

        // more advanced than a simple elem.focus() as it also works for iframes
        // and image maps
        // TODO: merge with followLink()?
        focusElement: function (elem)
        {
            var doc = window.content.document;
            var elemTagName = elem.localName.toLowerCase();
            if (elemTagName == "frame" || elemTagName == "iframe")
            {
                elem.contentWindow.focus();
                return false;
            }
            else
            {
                elem.focus();
            }

            var evt = doc.createEvent("MouseEvents");
            var x = 0;
            var y = 0;
            // for imagemap
            if (elemTagName == "area")
            {
                var coords = elem.getAttribute("coords").split(",");
                x = Number(coords[0]);
                y = Number(coords[1]);
            }

            evt.initMouseEvent("mouseover", true, true, doc.defaultView, 1, x, y, 0, 0, 0, 0, 0, 0, 0, null);
            elem.dispatchEvent(evt);
        },

        followDocumentRelationship: function (relationship)
        {
            function followFrameRelationship(relationship, parsedFrame)
            {
                var regexps;
                var relText;
                var patternText;
                var revString;
                switch (relationship)
                {
                    case "next":
                        regexps = options["nextpattern"].split(",");
                        revString = "previous";
                        break;
                    case "previous":
                        // TODO: accept prev\%[ious]
                        regexps = options["previouspattern"].split(",");
                        revString = "next";
                        break;
                    default:
                        liberator.echoerr("Bad document relationship: " + relationship);
                }

                relText = new RegExp(relationship, "i");
                revText = new RegExp(revString, "i");
                var elems = parsedFrame.document.getElementsByTagName("link");
                // links have higher priority than normal <a> hrefs
                for (let i = 0; i < elems.length; i++)
                {
                    if (relText.test(elems[i].rel) || revText.test(elems[i].rev))
                    {
                            liberator.open(elems[i].href);
                            return true;
                    }
                }

                // no links? ok, look for hrefs
                elems = parsedFrame.document.getElementsByTagName("a");
                for (let i = 0; i < elems.length; i++)
                {
                    if (relText.test(elems[i].rel) || revText.test(elems[i].rev))
                    {
                        buffer.followLink(elems[i], liberator.CURRENT_TAB);
                        return true;
                    }
                }

                for (let pattern = 0; pattern < regexps.length; pattern++)
                {
                    patternText = new RegExp(regexps[pattern], "i");
                    for (let i = 0; i < elems.length; i++)
                    {
                        if (patternText.test(elems[i].textContent))
                        {
                            buffer.followLink(elems[i], liberator.CURRENT_TAB);
                            return true;
                        }
                        else
                        {
                            // images with alt text being href
                            var children = elems[i].childNodes;
                            for (let j = 0; j < children.length; j++)
                            {
                                if (patternText.test(children[j].alt))
                                {
                                    buffer.followLink(elems[i], liberator.CURRENT_TAB);
                                    return true;
                                }
                            }
                        }
                    }
                }
                return false;
            }

            var retVal;
            if (window.content.frames.length != 0)
            {
                retVal = followFrameRelationship(relationship, window.content);
                if (!retVal)
                {
                    // only loop through frames if the main content didnt match
                    for (let i = 0; i < window.content.frames.length; i++)
                    {
                        retVal = followFrameRelationship(relationship, window.content.frames[i]);
                        if (retVal)
                            break;
                    }
                }
            }
            else
            {
                retVal = followFrameRelationship(relationship, window.content);
            }

            if (!retVal)
                liberator.beep();
        },

        // artificially "clicks" a link in order to open it
        followLink: function (elem, where)
        {
            var doc = window.content.document;
            var view = window.document.defaultView;
            var offsetX = 1;
            var offsetY = 1;

            var localName = elem.localName.toLowerCase();
            if (localName == "frame" || localName == "iframe") // broken?
            {
                elem.contentWindow.focus();
                return false;
            }
            else if (localName == "area") // for imagemap
            {
                var coords = elem.getAttribute("coords").split(",");
                offsetX = Number(coords[0]) + 1;
                offsetY = Number(coords[1]) + 1;
            }

            var ctrlKey = false, shiftKey = false;
            switch (where)
            {
                case liberator.NEW_TAB:
                case liberator.NEW_BACKGROUND_TAB:
                    ctrlKey = true;
                    shiftKey = (where == liberator.NEW_BACKGROUND_TAB);
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

            var evt = doc.createEvent("MouseEvents");
            ["mousedown", "mouseup", "click"].forEach(function (event)
            {
                evt.initMouseEvent(event, true, true, view, 1, offsetX, offsetY, 0, 0,
                        ctrlKey, /*altKey*/0, shiftKey, /*metaKey*/ ctrlKey, 0, null);
                elem.dispatchEvent(evt);
            })
        },

        get selectionController() getBrowser().docShell
                .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                .getInterface(Components.interfaces.nsISelectionDisplay)
                .QueryInterface(Components.interfaces.nsISelectionController),

        saveLink: function (elem, skipPrompt)
        {
            var doc  = elem.ownerDocument;
            var url  = makeURLAbsolute(elem.baseURI, elem.href);
            var text = elem.textContent;

            try
            {
                urlSecurityCheck(url, doc.nodePrincipal);
                // we always want to save that link relative to the current working directory
                options.setPref("browser.download.lastDir", io.getCurrentDirectory());
                saveURL(url, text, null, true, skipPrompt, makeURI(url, doc.characterSet));
            }
            catch (e)
            {
                liberator.echoerr(e);
            }
        },

        scrollBottom: function ()
        {
            scrollToPercentiles(-1, 100);
        },

        scrollColumns: function (cols)
        {
            var win = findScrollableWindow();
            const COL_WIDTH = 20;

            if (cols > 0 && win.scrollX >= win.scrollMaxX || cols < 0 && win.scrollX == 0)
                liberator.beep();

            win.scrollBy(COL_WIDTH * cols, 0);
        },

        scrollEnd: function ()
        {
            scrollToPercentiles(100, -1);
        },

        scrollLines: function (lines)
        {
            var win = findScrollableWindow();
            checkScrollYBounds(win, lines);
            win.scrollByLines(lines);
        },

        scrollPages: function (pages)
        {
            var win = findScrollableWindow();
            checkScrollYBounds(win, pages);
            win.scrollByPages(pages);
        },

        scrollByScrollSize: function (count, direction)
        {
            if (count > 0)
                options["scroll"] = count;

            var win = findScrollableWindow();
            checkScrollYBounds(win, direction);

            if (options["scroll"] > 0)
                this.scrollLines(options["scroll"] * direction);
            else // scroll half a page down in pixels
                win.scrollBy(0, win.innerHeight / 2 * direction);
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
            (function (frame) {
                if (frame.document.body.localName.toLowerCase() == "body")
                    frames.push(frame);
                Array.forEach(frame.frames, arguments.callee);
            })(window.content);

            if (frames.length == 0) // currently top is always included
                return;

            // remove all unfocusable frames
            // TODO: find a better way to do this - walking the tree is too slow
            var start = document.commandDispatcher.focusedWindow;
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
            var current = frames.indexOf(document.commandDispatcher.focusedWindow);

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
                        liberator.beep(); // still allow the frame indicator to be activated

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
                        liberator.beep(); // still allow the frame indicator to be activated

                    next = 0;
                }
            }

            // focus next frame and scroll into view
            frames[next].focus();
            if (frames[next] != window.content)
                frames[next].frameElement.scrollIntoView(false);

            // add the frame indicator
            var doc = frames[next].document;
            var indicator = util.xmlToDom(<div id="liberator-frame-indicator"/>, doc);
            doc.body.appendChild(indicator);

            // remove the frame indicator
            setTimeout(function () { doc.body.removeChild(indicator); }, 500);
        },

        // similar to pageInfo
        // TODO: print more useful information, just like the DOM inspector
        showElementInfo: function (elem)
        {
            liberator.echo(<>Element:<br/></> + util.objectToString(elem), commandline.FORCE_MULTILINE);
        },

        showPageInfo: function (verbose)
        {
            // Ctrl-g single line output
            if (!verbose)
            {
                let file = content.document.location.pathname.split("/").pop() || "[No Name]";
                let title = content.document.title || "[No Title]";

                let info = template.map("gf", function (opt)
                        template.map(pageInfo[opt][0](),
                            function (val) val, ", "),
                    ", ");

                if (bookmarks.isBookmarked(this.URL))
                    info += ", bookmarked";

                var pageInfoText = <>"{file}" [{info}] {title}</>;
                liberator.echo(pageInfoText, commandline.FORCE_SINGLELINE);
                return;
            }

            let option = options["pageinfo"];
            let list = template.map(option, function (option)
            {
                let opt = pageInfo[option];
                if (opt)
                    return template.table(opt[1], opt[0](true));
            }, <br/>);
            liberator.echo(list, commandline.FORCE_MULTILINE);
        },

        viewSelectionSource: function ()
        {
            // copied (and tuned somebit) from browser.jar -> nsContextMenu.js
            var focusedWindow = document.commandDispatcher.focusedWindow;
            if (focusedWindow == window)
                focusedWindow = content;

            var docCharset = null;
            if (focusedWindow)
                docCharset = "charset=" + focusedWindow.document.characterSet;

            var reference = null;
            reference = focusedWindow.getSelection();

            var docUrl = null;
            window.openDialog("chrome://global/content/viewPartialSource.xul",
                    "_blank", "scrollbars,resizable,chrome,dialog=no",
                    docUrl, docCharset, reference, "selection");
        },

        // url is optional
        viewSource: function (url, useExternalEditor)
        {
            url = url || buffer.URL;

            if (useExternalEditor)
            {
                // TODO: make that a helper function
                // TODO: save return value in v:shell_error
                var editor = options["editor"];
                var args = commands.parseArgs(editor, [], "*", true).arguments;
                if (args.length < 1)
                {
                    liberator.echoerr("No editor specified");
                    return;
                }

                var prog = args.shift();
                args.push(url);
                liberator.callFunctionInThread(null, io.run, [prog, args, true]);
            }
            else
            {
                liberator.open("view-source:" + url);
            }
        },

        zoomIn: function (steps, fullZoom)
        {
            bumpZoomLevel(steps, fullZoom);
        },

        zoomOut: function (steps, fullZoom)
        {
            bumpZoomLevel(-steps, fullZoom);
        }
    };
    //}}}
}; //}}}

function Marks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var localMarks = storage.newMap('local-marks', true);
    var urlMarks = storage.newMap('url-marks', true);

    var pendingJumps = [];
    var appContent = document.getElementById("appcontent");

    if (appContent)
        appContent.addEventListener("load", onPageLoad, true);

    function onPageLoad(event)
    {
        var win = event.originalTarget.defaultView;
        for (let i = 0, length = pendingJumps.length; i < length; i++)
        {
            var mark = pendingJumps[i];
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
                (('tab' in mark) ? ", tab: " + tabs.index(mark.tab) : "");
    }

    function removeLocalMark(mark)
    {
        var localmark = localMarks.get(mark);
        if (localmark)
        {
            var win = window.content;
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
        var urlmark = urlMarks.get(mark);
        if (urlmark)
        {
            liberator.log("Deleting URL mark: " + markToString(mark, urlmark), 5);
            urlMarks.remove(mark);
        }
    }

    function isLocalMark(mark)
    {
        return /^[a-z]$/.test(mark);
    }

    function isURLMark(mark)
    {
        return /^[A-Z0-9]$/.test(mark);
    }

    function getSortedMarks()
    {
        var location = window.content.location.href;
        var lmarks = [];

        // local marks
        for (let [mark, value] in Iterator(localMarks))
        {
            for (let [,val] in Iterator(value.filter(function (val) val.location == location)))
                lmarks.push([mark, val]);
        }
        lmarks.sort();

        // URL marks
        // FIXME: why does umarks.sort() cause a "Component is not available =
        // NS_ERROR_NOT_AVAILABLE" exception when used here?
        var umarks = [[key, mark] for ([key, mark] in urlMarks)];
        umarks.sort(function (a, b) a[0].localeCompare(b[0]));

        return lmarks.concat(umarks);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes || [modes.NORMAL];

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
        function (args, special)
        {
            args = args.string;

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
            var matches;
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
                    var start = matches[i][0];
                    var end   = matches[i][2];
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
            var mark = args.arguments[0];
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
                liberator.echoerr("E283: No marks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z]/g, "");
            marks.list(filter);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // TODO: add support for frameset pages
        add: function (mark)
        {
            var win = window.content;

            if (win.document.body.localName.toLowerCase() == "frameset")
            {
                liberator.echoerr("Marks support for frameset pages not implemented yet");
                return;
            }

            var x = win.scrollMaxX ? win.pageXOffset / win.scrollMaxX : 0;
            var y = win.scrollMaxY ? win.pageYOffset / win.scrollMaxY : 0;
            var position = { x: x, y: y };

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
                var pattern = new RegExp("[" + filter.replace(/\s+/g, "") + "]");
                for (let [mark,] in urlMarks)
                {
                    if (pattern.test(mark))
                        removeURLMark(mark);
                }
                for (let [mark,] in localMarks)
                {
                    if (pattern.test(mark))
                        removeLocalMark(mark);
                }
            }
        },

        jumpTo: function (mark)
        {
            var ok = false;

            if (isURLMark(mark))
            {
                var slice = urlMarks.get(mark);
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
                    var index = tabs.index(slice.tab);
                    if (index != -1)
                    {
                        tabs.select(index);
                        var win = slice.tab.linkedBrowser.contentWindow;
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
                var win = window.content;
                var slice = localMarks.get(mark) || [];

                for (let i = 0; i < slice.length; i++)
                {
                    if (win.location.href == slice[i].location)
                    {
                        liberator.log("Jumping to local mark: " + markToString(mark, slice[i]), 5);
                        win.scrollTo(slice[i].position.x * win.scrollMaxX, slice[i].position.y * win.scrollMaxY);
                        ok = true;
                    }
                }
            }

            if (!ok)
                liberator.echoerr("E20: Mark not set"); // FIXME: move up?
        },

        list: function (filter)
        {
            var marks = getSortedMarks();

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
                    liberator.echoerr("E283: No marks matching \"" + filter + "\"");
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
