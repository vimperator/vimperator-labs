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

liberator.Buffer = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var zoomLevels = [ 1, 10, 25, 50, 75, 90, 100,
                        120, 150, 200, 300, 500, 1000, 2000 ];

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

        for (var i = 0; i < win.frames.length; i++)
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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // override this stupid pref, because otherwise zoom is lost after switching tabs
    liberator.options.setPref("browser.zoom.siteSpecific", false);

    liberator.options.add(["fullscreen", "fs"],
        "Show the current window fullscreen",
        "boolean", false,
        {
            setter: function (value) { window.fullScreen = value; },
            getter: function () { return window.fullScreen; }
        });

    liberator.options.add(["nextpattern"],
        "Patterns to use when guessing the 'next' page in a document sequence",
        "stringlist", "\\bnext\\b,^>$,^(>>|»)$,^(>|»),(>|»)$,\\bmore\\b");

    liberator.options.add(["previouspattern"],
        "Patterns to use when guessing the 'previous' page in a document sequence",
        "stringlist", "\\bprev|previous\\b,^<$,^(<<|«)$,^(<|«),(<|«)$");

    liberator.options.add(["pageinfo", "pa"], "Desired info on :pa[geinfo]", "charlist", "gfm",
        {
            validator: function (value) { return !(/[^gfm]/.test(value) || value.length > 3 || value.length < 1); }
        });

    liberator.options.add(["scroll", "scr"],
        "Number of lines to scroll with <C-u> and <C-d> commands",
        "number", 0,
        {
            validator: function (value) { return value >= 0; }
        });

    liberator.options.add(["showstatuslinks", "ssli"],
        "Show the destination of the link under the cursor in the status bar",
        "number", 1,
        {
            validator: function (value) { return (value >= 0 && value <= 2); },
            completer: function (filter)
            {
                return [
                  ["0", "Don't show link destination"],
                  ["1", "Show the link in the status line"],
                  ["2", "Show the link in the command line"]
                ];
            }
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
        "Follow a link labeled to 'next' or '>' if it exists",
        function (count) { liberator.buffer.followDocumentRelationship("next"); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes, ["[["],
        "Follow a link labeled to 'prev', 'previous' or '<' if it exists",
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
                liberator.buffer.lastInputField.focus();
            else
            {
                var first = liberator.buffer.evaluateXPath(
                    "//*[@type='text'] | //textarea | //xhtml:textarea")
                    .snapshotItem(count > 0 ? (count - 1) : 0);

                if (first)
                    first.focus();
                else
                    liberator.beep();
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
            // TODO: Hide the progress bar ("print.show_print_progress") when
            // the special version is called?
            var value = liberator.options.getPref("print.always_print_silent");
            liberator.options.setPref("print.always_print_silent", special);

            getBrowser().contentWindow.print();

            liberator.options.setPref("print.always_print_silent", value);
        });

    liberator.commands.add(["pa[geinfo]"],
        "Show various page information",
        function ()
        {
            liberator.buffer.showPageInfo(true);
        },
        { argCount: "0" });

    liberator.commands.add(["pagest[yle]"],
        "Select the author style sheet to apply",
        function (args)
        {
            var titles = liberator.buffer.alternateStyleSheets.map(function (stylesheet) { return stylesheet.title; });

            if (args && !titles.some(function (title) { return title == args; }))
            {
                liberator.echoerr("E475: Invalid argument: " + args);
                return;
            }

            if (liberator.options["usermode"])
                liberator.options["usermode"] = false;

            stylesheetSwitchAll(window.content, args);
        },
        {
            completer: function (filter) { return liberator.completion.stylesheet(filter); }
        });

    liberator.commands.add(["re[load]"],
        "Reload current page",
        function (args, special)
        {
            liberator.tabs.reload(getBrowser().mCurrentTab, special);
        },
        { argCount: "0" });

    liberator.commands.add(["sav[eas]", "w[rite]"],
        "Save current document to disk",
        function (args, special)
        {
            var file = liberator.io.getFile(args || "");
            // we always want to save that link relative to the current working directory
            liberator.options.setPref("browser.download.lastDir", liberator.io.getCurrentDirectory());
            //if (args)
            //{
            //    saveURL(liberator.buffer.URL, args, null, true, special, // special == skipPrompt
            //            makeURI(liberator.buffer.URL, content.document.characterSet));
            //}
            //else
            saveDocument(window.content.document, special);
        });

    liberator.commands.add(["st[op]"],
        "Stop loading",
        function ()
        {
            BrowserStop();
        },
        { argCount: "0" });

    liberator.commands.add(["vie[wsource]"],
        "View source code of current document",
        function (args, special) { liberator.buffer.viewSource(args, special); });

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
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get alternateStyleSheets()
        {
            var stylesheets = getAllStyleSheets(window.content);

            // TODO: how should we handle duplicate titles?
            stylesheets = stylesheets.filter(function (stylesheet) {
                return !(!/^(screen|all|)$/i.test(stylesheet.media.mediaText) || /^\s*$/.test(stylesheet.title))
            });

            return stylesheets;
        },

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
                for (var i = 0; i < elems.length; i++)
                {
                    if (relText.test(elems[i].rel) || revText.test(elems[i].rev))
                    {
                            liberator.open(elems[i].href);
                            return true;
                    }
                }

                // no links? ok, look for hrefs
                elems = parsedFrame.document.getElementsByTagName("a");
                for (var i = 0; i < elems.length; i++)
                {
                    if (relText.test(elems[i].rel) || revText.test(elems[i].rev))
                    {
                        liberator.buffer.followLink(elems[i], liberator.CURRENT_TAB);
                        return true;
                    }
                }

                for (var pattern = 0; pattern < regexps.length; pattern++)
                {
                    patternText = new RegExp(regexps[pattern], "i");
                    for (var i = 0; i < elems.length; i++)
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
                            for (var j = 0; j < children.length; j++)
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
                    for (var i = 0; i < window.content.frames.length; i++)
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

            var newTab = false, newWindow = false;
            switch (where)
            {
                case liberator.NEW_TAB:
                case liberator.NEW_BACKGROUND_TAB:
                    newTab = true;
                    newWindow = (where == liberator.NEW_BACKGROUND_TAB);
                    break;
                case liberator.NEW_WINDOW:
                    newWindow = true;
                    break;
                case liberator.CURRENT_TAB:
                    break;
                default:
                    liberator.log("Invalid where argument for followLink()", 0);
            }

            elem.focus();

            var evt = doc.createEvent("MouseEvents");
            evt.initMouseEvent("mousedown", true, true, view, 1, offsetX, offsetY, 0, 0, /*ctrl*/ newTab, /*event.altKey*/0, /*event.shiftKey*/ newWindow, /*event.metaKey*/ newTab, 0, null);
            elem.dispatchEvent(evt);
            evt.initMouseEvent("click", true, true, view, 1, offsetX, offsetY, 0, 0, /*ctrl*/ newTab, /*event.altKey*/0, /*event.shiftKey*/ newWindow, /*event.metaKey*/ newTab, 0, null);
            elem.dispatchEvent(evt);
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
            // TODO: make this an XBL element rather than messing with the content
            // document
            var doc = frames[next].document;
            var indicator = doc.createElement("div");
            indicator.id = "liberator-frame-indicator";
            // NOTE: need to set a high z-index - it's a crapshoot!
            var style = "background-color: red; opacity: 0.5; z-index: 999;" +
                        "position: fixed; top: 0; bottom: 0; left: 0; right: 0;";
            indicator.setAttribute("style", style);
            doc.body.appendChild(indicator);

            // remove the frame indicator
            setTimeout(function () { doc.body.removeChild(indicator); }, 500);
        },

        // similar to pageInfo
        // TODO: print more useful information, just like the DOM inspector
        showElementInfo: function (elem)
        {
            liberator.echo("Element:<br/>" + liberator.util.objectToString(elem), liberator.commandline.FORCE_MULTILINE);
        },

        showPageInfo: function (verbose)
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
                    catch (e)
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
            catch (e)
            {
                try
                {
                    cacheEntryDescriptor = ftpCacheSession.openCacheEntry(cacheKey, ACCESS_READ, false);
                }
                catch (e) {}
            }

            var pageSize = []; // [0] bytes; [1] kbytes
            if (cacheEntryDescriptor)
            {
                pageSize[0] = liberator.util.formatBytes(cacheEntryDescriptor.dataSize, 0, false);
                pageSize[1] = liberator.util.formatBytes(cacheEntryDescriptor.dataSize, 2, true);
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
                        pageFeeds.push([feed.title, liberator.util.highlightURL(feed.href, true) + " <span style='color: gray;'>(" + type + ")</span>"]);
                    }
                }
            }

            var lastModVerbose = new Date(window.content.document.lastModified).toLocaleString();
            var lastMod = new Date(window.content.document.lastModified).toLocaleFormat("%x %X");
            // FIXME: probably unportable across different language versions
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

                if (liberator.bookmarks.isBookmarked(this.URL))
                    info.push("bookmarked");

                var pageInfoText = '"' + file + '" [' + info.join(", ") + "] " + title;
                liberator.echo(pageInfoText, liberator.commandline.FORCE_SINGLELINE);
                return;
            }

            // get general infos
            pageGeneral.push(["Title", window.content.document.title]);
            pageGeneral.push(["URL", liberator.util.highlightURL(window.content.document.location.toString(), true)]);

            var ref = "referrer" in window.content.document && window.content.document.referrer;
            if (ref)
                pageGeneral.push(["Referrer", liberator.util.highlightURL(ref, true)]);

            if (pageSize[0])
            {
                if (pageSize[1])
                    pageGeneral.push(["File Size", pageSize[1] + " (" + pageSize[0] + ")"]);
                else
                    pageGeneral.push(["File Size", pageSize[0]]);
            }

            pageGeneral.push(["Mime-Type", content.document.contentType]);
            pageGeneral.push(["Encoding", content.document.characterSet]);
            pageGeneral.push(["Compatibility", content.document.compatMode == "BackCompat" ? "Quirks Mode" : "Full/Almost Standards Mode"]);
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
                    pageMeta.push([tmpDict[tmpSort[i]][0], liberator.util.highlightURL(tmpDict[tmpSort[i]][1], false)]);
            }

            pageMeta.push(["Meta Tags", ""]); // add extra text to the end
            pageGeneral.push(["General Info", ""]);
            pageFeeds.push(["Feeds", ""]);

            var pageInfoText = "";
            var option = liberator.options["pageinfo"];
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
            liberator.echo(pageInfoText, liberator.commandline.FORCE_MULTILINE);
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
            var url = url || liberator.buffer.URL;
            if (useExternalEditor)
            {
                // TODO: make that a helper function
                // TODO: save return value in v:shell_error
                var newThread = Components.classes["@mozilla.org/thread-manager;1"].getService().newThread(0);
                var editor = liberator.options["editor"];
                var args = liberator.commands.parseArgs(editor, [], "*", true).arguments;
                if (args.length < 1)
                {
                    liberator.echoerr("No editor specified");
                    return;
                }

                var prog = args.shift();
                args.push(url);
                liberator.callFunctionInThread(newThread, liberator.io.run, [prog, args, true]);
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

    var localMarks = {};
    var urlMarks = {};
    var pendingJumps = [];
    var appContent = document.getElementById("appcontent");

    if (appContent)
        appContent.addEventListener("load", onPageLoad, true);

    function onPageLoad(event)
    {
        var win = event.originalTarget.defaultView;
        for (var i = 0, length = pendingJumps.length; i < length; i++)
        {
            var mark = pendingJumps[i];
            if (win.location.href == mark.location)
            {
                win.scrollTo(mark.position.x * win.scrollMaxX, mark.position.y * win.scrollMaxY);
                pendingJumps.splice(i, 1);
                return;
            }
        }
    }

    function removeLocalMark(mark)
    {
        if (mark in localMarks)
        {
            var win = window.content;
            for (var i = 0; i < localMarks[mark].length; i++)
            {
                if (localMarks[mark][i].location == win.location.href)
                {
                    liberator.log("Deleting local mark: " + mark + " | " + localMarks[mark][i].location + " | (" + localMarks[mark][i].position.x + ", " + localMarks[mark][i].position.y + ") | tab: " + liberator.tabs.index(localMarks[mark][i].tab), 5);
                    localMarks[mark].splice(i, 1);
                    if (localMarks[mark].length == 0)
                        delete localMarks[mark];
                    break;
                }
            }
        }
    }

    function removeURLMark(mark)
    {
        if (mark in urlMarks)
        {
            liberator.log("Deleting URL mark: " + mark + " | " + urlMarks[mark].location + " | (" + urlMarks[mark].position.x + ", " + urlMarks[mark].position.y + ") | tab: " + liberator.tabs.index(urlMarks[mark].tab), 5);
            delete urlMarks[mark];
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
        // local marks
        var lmarks = [];

        for (var mark in localMarks)
        {
            for (var i = 0; i < localMarks[mark].length; i++)
            {
                if (localMarks[mark][i].location == window.content.location.href)
                    lmarks.push([mark, localMarks[mark][i]]);
            }
        }
        lmarks.sort();

        // URL marks
        var umarks = [];

        for (var mark in urlMarks)
            umarks.push([mark, urlMarks[mark]]);
        umarks.sort();

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
                for (var i = 0; i < matches.length; i++)
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
        });

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
                liberator.log("Adding URL mark: " + mark + " | " + win.location.href + " | (" + position.x + ", " + position.y + ") | tab: " + liberator.tabs.index(liberator.tabs.getTab()), 5);
                urlMarks[mark] = { location: win.location.href, position: position, tab: liberator.tabs.getTab() };
            }
            else if (isLocalMark(mark))
            {
                // remove any previous mark of the same name for this location
                removeLocalMark(mark);
                if (!localMarks[mark])
                    localMarks[mark] = [];
                liberator.log("Adding local mark: " + mark + " | " + win.location.href + " | (" + position.x + ", " + position.y + ")", 5);
                localMarks[mark].push({ location: win.location.href, position: position });
            }
        },

        remove: function (filter, special)
        {
            if (special)
            {
                // :delmarks! only deletes a-z marks
                for (var mark in localMarks)
                    removeLocalMark(mark);
            }
            else
            {
                var pattern = new RegExp("[" + filter.replace(/\s+/g, "") + "]");
                for (var mark in urlMarks)
                {
                    if (pattern.test(mark))
                        removeURLMark(mark);
                }
                for (var mark in localMarks)
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
                var slice = urlMarks[mark];
                if (slice && slice.tab && slice.tab.linkedBrowser)
                {
                    if (!slice.tab.parentNode)
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
                        liberator.log("Jumping to URL mark: " + mark + " | " + slice.location + " | (" + slice.position.x + ", " + slice.position.y + ") | tab: " + liberator.tabs.index(slice.tab), 5);
                        win.scrollTo(slice.position.x * win.scrollMaxX, slice.position.y * win.scrollMaxY);
                        ok = true;
                    }
                }
            }
            else if (isLocalMark(mark))
            {
                var win = window.content;
                var slice = localMarks[mark] || [];

                for (var i = 0; i < slice.length; i++)
                {
                    if (win.location.href == slice[i].location)
                    {
                        liberator.log("Jumping to local mark: " + mark + " | " + slice[i].location + " | (" + slice[i].position.x + ", " + slice[i].position.y + ")", 5);
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
                marks = marks.filter(function (mark) {
                        if (filter.indexOf(mark[0]) > -1)
                            return mark;
                });
                if (marks.length == 0)
                {
                    liberator.echoerr("E283: No marks matching \"" + filter + "\"");
                    return;
                }
            }

            var list = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                       "<table><tr align=\"left\" class=\"hl-Title\"><th>mark</th><th>line</th><th>col</th><th>file</th></tr>";
            for (var i = 0; i < marks.length; i++)
            {
                list += "<tr>" +
                        "<td> "                        + marks[i][0]                              +  "</td>" +
                        "<td align=\"right\">"         + Math.round(marks[i][1].position.y * 100) + "%</td>" +
                        "<td align=\"right\">"         + Math.round(marks[i][1].position.x * 100) + "%</td>" +
                        "<td style=\"color: green;\">" + liberator.util.escapeHTML(marks[i][1].location) + "</td>" +
                        "</tr>";
            }
            list += "</table>";

            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
