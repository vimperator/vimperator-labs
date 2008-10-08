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

liberator.Buffer = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const highlightClasses = ["Boolean", "ErrorMsg", "Filter", "Function", "InfoMsg", "Keyword",
            "LineNr", "ModeMsg", "MoreMsg", "Normal", "Null", "Number", "Object", "Question",
            "StatusLine", "StatusLineBroken", "StatusLineSecure", "String", "Tag",
            "Title", "URL", "WarningMsg",
            ["Hint", ".liberator-hint", "*"],
            ["Search", ".__liberator-search", "*"],
            ["Bell", "#liberator-visualbell"],
            ];
    let name = liberator.config.name.toLowerCase();
    const highlightDocs = "chrome://" + name + "/content/buffer.xhtml,chrome://browser/content/browser.xul";

    var highlight = liberator.storage.newMap("highlight", false);

    var zoomLevels = [ 1, 10, 25, 50, 75, 90, 100,
                        120, 150, 200, 300, 500, 1000, 2000 ];

    const arrayIter = liberator.util.arrayIter;

    const util = liberator.util;
    function Styles(name, store, serial)
    {
        /* Can't reference liberator or Components inside Styles --
         * they're members of the window object, which disappear
         * with this window.
         */
        const sleep = liberator.sleep;
        const storage = liberator.storage;
        const consoleService = Components.classes["@mozilla.org/consoleservice;1"]
                                         .getService(Components.interfaces.nsIConsoleService);
        const ios = Components.classes["@mozilla.org/network/io-service;1"]
                              .getService(Components.interfaces.nsIIOService);
        const sss = Components.classes["@mozilla.org/content/style-sheet-service;1"]
                              .getService(Components.interfaces.nsIStyleSheetService);
        const XHTML = "http://www.w3.org/1999/xhtml";
        const namespace = "@namespace html url(" + XHTML + ");\n" +
                          "@namespace xul url(http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul);\n";

        let cssUri = function (css) "data:text/css," + encodeURI(css);

        let userSheets = [];
        let systemSheets = [];

        this.__iterator__ = function () Iterator(userSheets.concat(systemSheets));
        this.__defineGetter__("systemSheets", function () Iterator(systemSheets));
        this.__defineGetter__("userSheets", function () Iterator(userSheets));

        this.addSheet = function (filter, css, system, force)
        {
            let sheets = system ? systemSheets : userSheets;

            if (sheets.some(function (s) s[0] == filter && s[1] == css))
                return null;
            filter = filter.split(",");
            try
            {
                this.registerSheet(cssUri(wrapCSS(filter, css)), !force);
            }
            catch (e)
            {
                return e.echoerr || e;
            }
            sheets.push([filter, css]);
            return null;
        }

        this.removeSheet = function (filter, index, system)
        {
            let self = this;
            let sheets = system ? systemSheets : userSheets;

            if (filter.indexOf(",") > -1)
                return filter.split(",").reduce(
                    function (n, f) n + self.removeSheet(f, index, system), 0);

            if (filter == undefined)
                filter = "";

            /* Find all sheets with URIs matching the filter */
            let matches = [s for (s in Iterator(sheets))
                             if (filter == "" || s[1][0].indexOf(filter) >= 0)];

            if (matches.length == 0 && sheets[Number(filter)]) /* Match nth sheet */
                matches.push([filter, sheets[filter]]);
            else if (!isNaN(index)) /* Match nth matching URI */
                matches = (index < matches.length) ? [matches[index]] : [];
            else if (index) /* Match on CSS */
                matches = [m for each (m in matches) if (m[1][1] == index)];

            let foundChrome = false;
            for (let [,[i, sheet]] in Iterator(matches.reverse()))
            {
                let sites = sheet[0];
                this.unregisterSheet(cssUri(wrapCSS(sheet[0], sheet[1])));
                sheet[0] = sites.filter(function (f) f != filter);
                if (sheet[0].length && isNaN(filter))
                    this.registerSheet(cssUri(wrapCSS(sheet[0], sheet[1])));
                else
                    sheets.splice(i, 1);
            }
            return matches.length;
        }

        this.registerSheet = function (uri, doCheckSyntax)
        {
            if (doCheckSyntax)
                checkSyntax(uri);
            uri = ios.newURI(uri, null, null);
            if (!sss.sheetRegistered(uri, sss.USER_SHEET))
                sss.loadAndRegisterSheet(uri, sss.USER_SHEET);
        }

        this.unregisterSheet = function (uri)
        {
            uri = ios.newURI(uri, null, null);
            if (sss.sheetRegistered(uri, sss.USER_SHEET))
                sss.unregisterSheet(uri, sss.USER_SHEET);
        }

        function wrapCSS(filter, css)
        {
            if (filter[0] == "*")
                return namespace + css;
            let selectors = filter.map(function (part) (/[*]$/.test(part)   ? "url-prefix" :
                                                        /[\/:]/.test(part)  ? "url"
                                                                            : "domain")
                                                + '("' + part.replace(/"/g, "%22").replace(/[*]$/, "") + '")')
                                  .join(", ");
            return namespace + "@-moz-document " + selectors + "{\n" + css + "\n}\n";
            /* } vim */
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
                let err = new Error("", errors[0].sourceName.replace(/^(data:text\/css,).*/, "$1..."), errors[0].lineNumber);
                err.name = "CSSError"
                err.message = errors.reduce(function (msg, e) msg + "; " + e.lineNumber + ": " + e.errorMessage, errors.shift().errorMessage);
                err.echoerr = err.fileName + ":" + err.lineNumber + ": " + err.message;
                throw err;
            }
        }
    }
    Styles.prototype = {
        get sites() util.uniq(util.flatten([v[0] for ([k, v] in this.userSheets)])),
    };

    let styles = liberator.storage.newObject("styles", Styles, false);

    /* FIXME: This doesn't belong here. */
    let mainWindowID = liberator.config.mainWindowID || "main-window";
    let fontSize = document.defaultView.getComputedStyle(document.getElementById(mainWindowID), null)
                                       .getPropertyValue("font-size");

    styles.registerSheet("chrome://" + name + "/skin/vimperator.css");
    let error = styles.addSheet("chrome://" + name + "/content/buffer.xhtml",
        "body { font-size: " + fontSize + "; }", true);

    function setZoom(value, fullZoom)
    {
        if (value < 1 || value > 2000)
        {
            liberator.echoerr("Zoom value out of range (1-2000%)");
            return;
        }

        if (fullZoom)
            getBrowser().markupDocumentViewer.fullZoom = value / 100.0;
        else
            getBrowser().markupDocumentViewer.textZoom = value / 100.0;

        liberator.echo((fullZoom ? "Full zoom: " : "Text zoom: ") + value + "%");

        // TODO: shouldn't this just recalculate hint coords, rather than
        // unsuccessfully attempt to reshow hints?  i.e. isn't it just relying
        // on the recalculation side effect? -- djk
        // NOTE: we could really do with a zoom event...
        // liberator.hints.reshowHints();
    }

    function bumpZoomLevel(steps, fullZoom)
    {
        if (fullZoom)
            var value = getBrowser().markupDocumentViewer.fullZoom * 100.0;
        else
            var value = getBrowser().markupDocumentViewer.textZoom * 100.0;

        var index = -1;
        if (steps <= 0)
        {
            for (let i = zoomLevels.length - 1; i >= 0; i--)
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
            for (let i = 0; i < zoomLevels.length; i++)
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
            liberator.beep();
            return;
        }
        setZoom(zoomLevels[index], fullZoom);
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

    // override this stupid pref, because otherwise zoom is lost after switching tabs
    liberator.options.setPref("browser.zoom.siteSpecific", false);

    liberator.options.add(["fullscreen", "fs"],
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

    liberator.options.add(["nextpattern"],
        "Patterns to use when guessing the 'next' page in a document sequence",
        "stringlist", "\\bnext\\b,^>$,^(>>|»)$,^(>|»),(>|»)$,\\bmore\\b");

    liberator.options.add(["previouspattern"],
        "Patterns to use when guessing the 'previous' page in a document sequence",
        "stringlist", "\\bprev|previous\\b,^<$,^(<<|«)$,^(<|«),(<|«)$");

    liberator.options.add(["pageinfo", "pa"], "Desired info on :pa[geinfo]", "charlist", "gfm",
        { completer: function (filter) [0, [[k, v[1]] for ([k, v] in Iterator(pageInfo))]] });

    liberator.options.add(["scroll", "scr"],
        "Number of lines to scroll with <C-u> and <C-d> commands",
        "number", 0,
        { validator: function (value) value >= 0 });

    liberator.options.add(["showstatuslinks", "ssli"],
        "Show the destination of the link under the cursor in the status bar",
        "number", 1,
        {
            completer: function (filter) [0, [
                ["0", "Don't show link destination"],
                ["1", "Show the link in the status line"],
                ["2", "Show the link in the command line"]
            ]],
            validator: function (value) value >= 0 && value <= 2
        });

    liberator.options.add(["usermode", "um"],
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

    var modes = liberator.config.browserModes || [liberator.modes.NORMAL];

    liberator.mappings.add(modes, ["i", "<Insert>"],
        "Start caret mode",
        function ()
        {
            // setting this option triggers an observer which takes care of the mode setting
            liberator.options.setPref("accessibility.browsewithcaret", true);
        });

    liberator.mappings.add(modes, ["<C-c>"],
        "Stop loading",
        function () { BrowserStop(); });

    // scrolling
    liberator.mappings.add(modes, ["j", "<Down>", "<C-e>"],
        "Scroll document down",
        function (count) { liberator.buffer.scrollLines(count > 1 ? count : 1); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["k", "<Up>", "<C-y>"],
        "Scroll document up",
        function (count) { liberator.buffer.scrollLines(-(count > 1 ? count : 1)); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, liberator.has("mail") ? ["h"] : ["h", "<Left>"],
        "Scroll document to the left",
        function (count) { liberator.buffer.scrollColumns(-(count > 1 ? count : 1)); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, liberator.has("mail") ? ["l"] : ["l", "<Right>"],
        "Scroll document to the right",
        function (count) { liberator.buffer.scrollColumns(count > 1 ? count : 1); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["0", "^"],
        "Scroll to the absolute left of the document",
        function () { liberator.buffer.scrollStart(); });

    liberator.mappings.add(modes, ["$"],
        "Scroll to the absolute right of the document",
        function () { liberator.buffer.scrollEnd(); });

    liberator.mappings.add(modes, ["gg", "<Home>"],
        "Goto the top of the document",
        function (count) { liberator.buffer.scrollToPercentile(count > 0 ? count : 0); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["G", "<End>"],
        "Goto the end of the document",
        function (count) { liberator.buffer.scrollToPercentile(count >= 0 ? count : 100); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["<C-d>"],
        "Scroll window downwards in the buffer",
        function (count) { liberator.buffer.scrollByScrollSize(count, 1); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["<C-u>"],
        "Scroll window upwards in the buffer",
        function (count) { liberator.buffer.scrollByScrollSize(count, -1); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["<C-b>", "<PageUp>", "<S-Space>"],
        "Scroll up a full page",
        function (count) { liberator.buffer.scrollPages(-(count > 1 ? count : 1)); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["<C-f>", "<PageDown>", "<Space>"],
        "Scroll down a full page",
        function (count) { liberator.buffer.scrollPages(count > 1 ? count : 1); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["]f"],
        "Focus next frame",
        function (count) { liberator.buffer.shiftFrameFocus(count > 1 ? count : 1, true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["[f"],
        "Focus previous frame",
        function (count) { liberator.buffer.shiftFrameFocus(count > 1 ? count : 1, false); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["]]"],
        "Follow the link labeled 'next' or '>' if it exists",
        function (count) { liberator.buffer.followDocumentRelationship("next"); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["[["],
        "Follow the link labeled 'prev', 'previous' or '<' if it exists",
        function (count) { liberator.buffer.followDocumentRelationship("previous"); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["gf"],
        "View source",
        function () { liberator.buffer.viewSource(null, false); });

    liberator.mappings.add(modes, ["gF"],
        "View source with an external editor",
        function () { liberator.buffer.viewSource(null, true); });

    liberator.mappings.add(modes, ["gi"],
        "Focus last used input field",
        function (count)
        {
            if (count < 1 && liberator.buffer.lastInputField)
            {
                liberator.buffer.lastInputField.focus();
            }
            else
            {
                var elements = [];
                var matches = liberator.buffer.evaluateXPath(
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
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["gP"],
        "Open (put) a URL based on the current clipboard contents in a new buffer",
        function ()
        {
            liberator.open(liberator.util.readFromClipboard(),
                /\bpaste\b/.test(liberator.options["activate"]) ?
                liberator.NEW_BACKGROUND_TAB : liberator.NEW_TAB);
        });

    liberator.mappings.add(modes, ["p", "<MiddleMouse>"],
        "Open (put) a URL based on the current clipboard contents in the current buffer",
        function () { liberator.open(liberator.util.readFromClipboard()); });

    liberator.mappings.add(modes, ["P"],
        "Open (put) a URL based on the current clipboard contents in a new buffer",
        function ()
        {
            liberator.open(liberator.util.readFromClipboard(),
                /\bpaste\b/.test(liberator.options["activate"]) ?
                liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB);
        });

    // reloading
    liberator.mappings.add(modes, ["r"],
        "Reload current page",
        function () { liberator.tabs.reload(getBrowser().mCurrentTab, false); });

    liberator.mappings.add(modes, ["R"],
        "Reload while skipping the cache",
        function () { liberator.tabs.reload(getBrowser().mCurrentTab, true); });

    // yanking
    liberator.mappings.add(modes, ["Y"],
        "Copy selected text or current word",
        function ()
        {
            var sel = liberator.buffer.getCurrentWord();
            if (sel)
                liberator.util.copyToClipboard(sel, true);
            else
                liberator.beep();
        });

    // zooming
    liberator.mappings.add(modes, ["zi", "+"],
        "Enlarge text zoom of current web page",
        function (count) { liberator.buffer.zoomIn(count > 1 ? count : 1, false); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zm"],
        "Enlarge text zoom of current web page by a larger amount",
        function (count) { liberator.buffer.zoomIn((count > 1 ? count : 1) * 3, false); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zo", "-"],
        "Reduce text zoom of current web page",
        function (count) { liberator.buffer.zoomOut(count > 1 ? count : 1, false); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zr"],
        "Reduce text zoom of current web page by a larger amount",
        function (count) { liberator.buffer.zoomOut((count > 1 ? count : 1) * 3, false); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zz"],
        "Set text zoom value of current web page",
        function (count) { liberator.buffer.textZoom = count > 1 ? count : 100; },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zI"],
        "Enlarge full zoom of current web page",
        function (count) { liberator.buffer.zoomIn(count > 1 ? count : 1, true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zM"],
        "Enlarge full zoom of current web page by a larger amount",
        function (count) { liberator.buffer.zoomIn((count > 1 ? count : 1) * 3, true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zO"],
        "Reduce full zoom of current web page",
        function (count) { liberator.buffer.zoomOut(count > 1 ? count : 1, true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zR"],
        "Reduce full zoom of current web page by a larger amount",
        function (count) { liberator.buffer.zoomOut((count > 1 ? count : 1) * 3, true); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["zZ"],
        "Set full zoom value of current web page",
        function (count) { liberator.buffer.fullZoom = count > 1 ? count : 100; },
        { flags: liberator.Mappings.flags.COUNT });

    // page info
    liberator.mappings.add(modes, ["<C-g>"],
        "Print the current file name",
        function (count) { liberator.buffer.showPageInfo(false); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["g<C-g>"],
        "Print file information",
        function () { liberator.buffer.showPageInfo(true); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["ha[rdcopy]"],
        "Print current document",
        function (args, special)
        {
            var aps = liberator.options.getPref("print.always_print_silent");
            var spp = liberator.options.getPref("print.show_print_progress");

            liberator.echo("Sending to printer...");
            liberator.options.setPref("print.always_print_silent", special);
            liberator.options.setPref("print.show_print_progress", !special);

            getBrowser().contentWindow.print();

            liberator.options.setPref("print.always_print_silent", aps);
            liberator.options.setPref("print.show_print_progress", spp);
            liberator.echo("Print job sent.");
        },
        {
            argCount: "0",
            bang: true
        });

    liberator.commands.add(["pa[geinfo]"],
        "Show various page information",
        function () { liberator.buffer.showPageInfo(true); },
        { argCount: "0" });

    liberator.commands.add(["pagest[yle]"],
        "Select the author style sheet to apply",
        function (args)
        {
            var titles = liberator.buffer.alternateStyleSheets.map(function (stylesheet) stylesheet.title);

            if (args && titles.indexOf(args) == -1)
            {
                liberator.echoerr("E475: Invalid argument: " + args);
                return;
            }

            if (liberator.options["usermode"])
                liberator.options["usermode"] = false;

            stylesheetSwitchAll(window.content, args);
        },
        { completer: function (filter) liberator.completion.stylesheet(filter) });

    liberator.commands.add(["re[load]"],
        "Reload current page",
        function (args, special) { liberator.tabs.reload(getBrowser().mCurrentTab, special); },
        {
            bang: true,
            argCount: "0"
        });

    liberator.commands.add(["sav[eas]", "w[rite]"],
        "Save current document to disk",
        function (args, special)
        {
            //var file = liberator.io.getFile(args || "");
            // we always want to save that link relative to the current working directory
            liberator.options.setPref("browser.download.lastDir", liberator.io.getCurrentDirectory());
            //if (args)
            //{
            //    saveURL(liberator.buffer.URL, args, null, true, special, // special == skipPrompt
            //            makeURI(liberator.buffer.URL, content.document.characterSet));
            //}
            //else
            saveDocument(window.content.document, special);
        },
        {
            argCount: "0",
            bang: true
        });

    liberator.commands.add(["st[op]"],
        "Stop loading",
        function () { BrowserStop(); },
        { argCount: "0" });

    liberator.commands.add(["sty[le]"],
        "Add or list user styles",
        function (args, special)
        {
            let [, filter, css] = args.match(/(\S+)\s*((?:.|\n)*)/) || [];
            if (!css)
            {
                let str = liberator.template.tabular(["", "Filter", "CSS"],
                    ["padding: 0 1em 0 1ex; vertical-align: top", "padding: 0 1em 0 0; vertical-align: top"],
                    ([i,
                      style[0].join(","),
                      style[1]]
                     for ([i, style] in styles.userSheets)
                     if (!filter || style[0].indexOf(filter) >= 0)));
                liberator.commandline.echo(str, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
            }
            else
            {
                let err = styles.addSheet(filter, css, false, special);
                if (err)
                    liberator.echoerr(err);
            }
        },
        {
            completer: function (filter) [0, liberator.completion.filter(
                [[content.location.host, ""],
                 [content.location.href, ""]]
                    .concat([[s, ""] for each (s in styles.sites)])
                , filter)],
            hereDoc: true,
            bang: true,
        });

    liberator.commands.add(["dels[tyle]"],
        "Remove a user stylesheet",
        function (args) { styles.removeSheet.apply(styles, args.arguments); },
        {
            completer: function (filter) [0, liberator.completion.filter(
                    [[i, <>{s[0].join(",")}: {s[1].replace("\n", "\\n")}</>] for ([i, s] in styles.userSheets)]
                        .concat([[s, ""] for each (s in styles.sites)])
                    , filter)],
            argCount: "*",
        });

    liberator.commands.add(["hi[ghlight]"],
        "Set the style of certain display elements",
        function (args, special)
        {
            let [, key, css] = args.match(/(\S+)\s*((?:.|\n)*)/) || [];
            if (!css && !(key && special))
            {
                let str = liberator.template.tabular(["Key", "CSS"],
                    ["padding: 0 1em 0 0; vertical-align: top"],
                    (h for (h in highlight) if (!key || h[0].indexOf(key) > -1)));
                liberator.commandline.echo(str, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
                return;
            }
            liberator.buffer.highlight(key, css, special);
        },
        {
            // TODO: add this as a standard highlight completion function?
            // I agree. It could (should) be much more sophisticated. --Kris
            completer: function (filter) [0,
                    liberator.completion.filter([[v instanceof Array ? v[0] : v, ""] for ([k, v] in Iterator(highlightClasses))], filter)
                ],
            hereDoc: true,
            bang: true,
        });

    liberator.commands.add(["vie[wsource]"],
        "View source code of current document",
        function (args, special) { liberator.buffer.viewSource(args.arguments[0], special); },
        {
            argCount: "1",
            bang: true
        });

    liberator.commands.add(["zo[om]"],
        "Set zoom value of current web page",
        function (args, special)
        {
            var level;

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
                    level = liberator.buffer.fullZoom + parseInt(args, 10);
                else
                    level = liberator.buffer.textZoom + parseInt(args, 10);

                // relative args shouldn't take us out of range
                if (level < 1)
                    level = 1;
                if (level > 2000)
                    level = 2000;
            }
            else
            {
                liberator.echoerr("E488: Trailing characters");
                return;
            }

            if (special)
                liberator.buffer.fullZoom = level;
            else
                liberator.buffer.textZoom = level;
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
                        yield [feed.title, liberator.template.highlightURL(feed.href, true) + <span class="extra-info"> ({type})</span>];
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
            pageSize[0] = liberator.util.formatBytes(cacheEntryDescriptor.dataSize, 0, false);
            pageSize[1] = liberator.util.formatBytes(cacheEntryDescriptor.dataSize, 2, true);
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
        yield ["URL", liberator.template.highlightURL(doc.location.toString(), true)];

        var ref = "referrer" in doc && doc.referrer;
        if (ref)
            yield ["Referrer", liberator.template.highlightURL(ref, true)];

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

        return Array.map(metaNodes, function (node) [(node.name || node.httpEquiv), liberator.template.highlightURL(node.content)])
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
            if (typeof window.content.document.pageIsFullyLoaded != "undefined")
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
            let cssClass = class[1] || ".hl-" + class[0];
            let scope = class[2] || highlightDocs;

            let getCSS = function (style) cssClass + selectors +
                " { " + style.replace(/(?:!\s*important\s*)?(?:;?\s*$|;)/g, "!important;").replace(";!important;", ";", "g") + " }";
            let css = getCSS(style);

            if (highlight.get(key))
                styles.removeSheet(scope, getCSS(highlight.get(key)), true);

            if (/^\s*$/.test(style))
                return highlight.remove(key);

            let error = styles.addSheet(scope, css, true, force);
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
                var selectionController = getBrowser().docShell
                    .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
                    .getInterface(Components.interfaces.nsISelectionDisplay)
                    .QueryInterface(Components.interfaces.nsISelectionController);

                var caretmode = selectionController.getCaretEnabled();
                selectionController.setCaretEnabled(true);
                selectionController.wordMove(false, false);
                selectionController.wordMove(true, true);
                selection = window.content.getSelection().toString();
                selectionController.setCaretEnabled(caretmode);
            }

            return selection;
        },

        // quick function to get elements inside the document reliably
        // argument "args" is something like: @id='myid' or @type='text' (don't forget the quotes around myid)
        getElement: function (args, index)
        {
            return liberator.buffer.evaluateXPath("//*[" + (args || "") + "]").snapshotItem(index || 0);
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
                        regexps = liberator.options["nextpattern"].split(",");
                        revString = "previous";
                        break;
                    case "previous":
                        // TODO: accept prev\%[ious]
                        regexps = liberator.options["previouspattern"].split(",");
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
                        liberator.buffer.followLink(elems[i], liberator.CURRENT_TAB);
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
                            liberator.buffer.followLink(elems[i], liberator.CURRENT_TAB);
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
                                    liberator.buffer.followLink(elems[i], liberator.CURRENT_TAB);
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

        saveLink: function (elem, skipPrompt)
        {
            var doc  = elem.ownerDocument;
            var url  = makeURLAbsolute(elem.baseURI, elem.href);
            var text = elem.textContent;

            try
            {
                urlSecurityCheck(url, doc.nodePrincipal);
                // we always want to save that link relative to the current working directory
                liberator.options.setPref("browser.download.lastDir", liberator.io.getCurrentDirectory());
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
                liberator.options["scroll"] = count;

            var win = findScrollableWindow();
            checkScrollYBounds(win, direction);

            if (liberator.options["scroll"] > 0)
                this.scrollLines(liberator.options["scroll"] * direction);
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
            var indicator =
                <div id="liberator-frame-indicator"/>;
            doc.body.appendChild(liberator.util.xmlToDom(indicator));

            // remove the frame indicator
            setTimeout(function () { doc.body.removeChild(indicator); }, 500);
        },

        // similar to pageInfo
        // TODO: print more useful information, just like the DOM inspector
        showElementInfo: function (elem)
        {
            liberator.echo(<>Element:<br/></> + liberator.util.objectToString(elem), liberator.commandline.FORCE_MULTILINE);
        },

        showPageInfo: function (verbose)
        {
            // Ctrl-g single line output
            if (!verbose)
            {
                let file = content.document.location.pathname.split("/").pop() || "[No Name]";
                let title = content.document.title || "[No Title]";

                let info = liberator.template.map("gf",
                    function (opt) liberator.template.map(pageInfo[opt][0](), function (val) val, ", "),
                    ", ");

                if (liberator.bookmarks.isBookmarked(this.URL))
                    info += ", bookmarked";

                var pageInfoText = <>"{file}" [{info}] {title}</>;
                liberator.echo(pageInfoText, liberator.commandline.FORCE_SINGLELINE);
                return;
            }

            let option = liberator.options["pageinfo"];
            let list = liberator.template.map(option, function (option)
            {
                let opt = pageInfo[option];
                if (opt)
                    return liberator.template.table(opt[1], opt[0](true));
            }, <br/>);
            liberator.echo(list, liberator.commandline.FORCE_MULTILINE);
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
            url = url || liberator.buffer.URL;

            if (useExternalEditor)
            {
                // TODO: make that a helper function
                // TODO: save return value in v:shell_error
                var editor = liberator.options["editor"];
                var args = liberator.commands.parseArgs(editor, [], "*", true).arguments;
                if (args.length < 1)
                {
                    liberator.echoerr("No editor specified");
                    return;
                }

                var prog = args.shift();
                args.push(url);
                liberator.callFunctionInThread(null, liberator.io.run, [prog, args, true]);
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

liberator.Marks = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var localMarks = liberator.storage.newMap('local-marks', true);
    var urlMarks = liberator.storage.newMap('url-marks', true);

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
                (('tab' in mark) ? ", tab: " + liberator.tabs.index(mark.tab) : "");
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

    var modes = liberator.config.browserModes || [liberator.modes.NORMAL];

    liberator.mappings.add(modes,
        ["m"], "Set mark at the cursor position",
        function (arg)
        {
            if (/[^a-zA-Z]/.test(arg))
            {
                liberator.beep();
                return;
            }

            liberator.marks.add(arg);
        },
        { flags: liberator.Mappings.flags.ARGUMENT });

    liberator.mappings.add(modes,
        ["'", "`"], "Jump to the mark in the current buffer",
        function (arg) { liberator.marks.jumpTo(arg); },
        { flags: liberator.Mappings.flags.ARGUMENT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["delm[arks]"],
        "Delete the specified marks",
        function (args, special)
        {
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

            liberator.marks.remove(args, special);
        },
        { bang: true });

    liberator.commands.add(["ma[rk]"],
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

            liberator.marks.add(mark);
        },
        { argCount: "1" });

    liberator.commands.add(["marks"],
        "Show all location marks of current web page",
        function (args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z]/.test(args))
            {
                liberator.echoerr("E283: No marks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z]/g, "");
            liberator.marks.list(filter);
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
                urlMarks.set(mark, { location: win.location.href, position: position, tab: liberator.tabs.getTab() });
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
                    var index = liberator.tabs.index(slice.tab);
                    if (index != -1)
                    {
                        liberator.tabs.select(index);
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

            let list = liberator.template.tabular(["mark", "line", "col", "file"],
                ["", "text-align: right", "text-align: right", "color: green"],
                ([mark[0],
                  Math.round(mark[1].position.x * 100) + "%",
                  Math.round(mark[1].position.y * 100) + "%",
                  mark[1].location]
                  for each (mark in marks)));
            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
