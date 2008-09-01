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

liberator.config = { //{{{
    /*** required options, no checks done if they really exist, so be careful ***/
    name: "Vimperator",
    hostApplication: "Firefox",

    /*** optional options, there are checked for existance and a fallback provided  ***/
    features: ["bookmarks", "hints", "history", "marks", "quickmarks", "session", "tabs", "windows"],
    defaults: { guioptions: "" },
    guioptions: { m: ["toolbar-menubar"], T: ["nav-bar"], b: ["PersonalToolbar"] },

    get visualbellWindow() { return getBrowser().mPanelContainer; },

    autocommands: [["BookmarkPost",   "Triggered after a page is bookmarked"],
                   ["LocationChange", "Triggered when changing tabs or when naviagtion to a new location"],
                   ["PageLoadPre",    "Triggered after a page load is initiated"],
                   ["PageLoad",       "Triggered when a page gets (re)loaded/opened"],
                   ["QuitPre",        "Triggered before exiting Firefox, just before destroying each module"],
                   ["Quit",           "Triggered before exiting Firefox"],
                   ["ShellCmdPost",   "Triggered after executing a shell command with :!cmd"],
                   ["Startup",        "Triggered after Firefox starts"]],

    dialogs: [
        ["about",            "About Firefox",
            function () { openDialog("chrome://browser/content/aboutDialog.xul", "_blank", "chrome,dialog,modal,centerscreen"); }],
        ["addbookmark",      "Add bookmark for the current page",
            function () { PlacesCommandHook.bookmarkCurrentPage(true, PlacesUtils.bookmarksRootId); }],
        ["addons",           "Manage Add-ons",
            function () { BrowserOpenAddonsMgr(); }],
        ["bookmarks",        "List your bookmarks",
            function () { openDialog("chrome://browser/content/bookmarks/bookmarksPanel.xul", "Bookmarks", "dialog,centerscreen,width=600,height=600"); }],
        ["checkupdates",     "Check for updates",
            function () { checkForUpdates(); }],
        ["cleardata",        "Clear private data",
            function () { Components.classes[GLUE_CID].getService(Components.interfaces.nsIBrowserGlue).sanitize(window || null); }],
        ["cookies",          "List your cookies",
            function () { toOpenWindowByType("Browser:Cookies", "chrome://browser/content/preferences/cookies.xul", "chrome,dialog=no,resizable"); }],
        ["console",          "JavaScript console",
            function () { toJavaScriptConsole(); }],
        ["customizetoolbar", "Customize the Toolbar",
            function () { BrowserCustomizeToolbar(); }],
        ["dominspector",     "DOM Inspector",
            function () { try { inspectDOMDocument(content.document); } catch (e) { liberator.echoerr("DOM Inspector extension not installed"); } }],
        ["downloads",        "Manage Downloads",
            function () { toOpenWindowByType("Download:Manager", "chrome://mozapps/content/downloads/downloads.xul", "chrome,dialog=no,resizable"); }],
        ["history",          "List your history",
            function () { openDialog("chrome://browser/content/history/history-panel.xul", "History", "dialog,centerscreen,width=600,height=600"); }],
        ["import",           "Import Preferences, Bookmarks, History, etc. from other browsers",
            function () { BrowserImport(); }],
        ["openfile",         "Open the file selector dialog",
            function () { BrowserOpenFileWindow(); }],
        ["pageinfo",         "Show information about the current page",
            function () { BrowserPageInfo(); }],
        ["pagesource",       "View page source",
            function () { BrowserViewSourceOfDocument(content.document); }],
        ["places",           "Places Organizer: Manage your bookmarks and history",
            function () { PlacesCommandHook.showPlacesOrganizer(ORGANIZER_ROOT_BOOKMARKS); }],
        ["preferences",      "Show Firefox preferences dialog",
            function () { openPreferences(); }],
        ["printpreview",     "Preview the page before printing",
            function () { PrintUtils.printPreview(onEnterPrintPreview, onExitPrintPreview); }],
        ["printsetup",       "Setup the page size and orientation before printing",
            function () { PrintUtils.showPageSetup(); }],
        ["print",            "Show print dialog",
            function () { PrintUtils.print(); }],
        ["saveframe",        "Save frame to disk",
            function () { saveFrameDocument(); }],
        ["savepage",         "Save page to disk",
            function () { saveDocument(window.content.document); }],
        ["searchengines",    "Manage installed search engines",
            function () { openDialog("chrome://browser/content/search/engineManager.xul", "_blank", "chrome,dialog,modal,centerscreen"); }],
        ["selectionsource",  "View selection source",
            function () { liberator.buffer.viewSelectionSource(); }]
    ],

    // they are sorted by relevance, not alphabetically
    helpFiles: ["intro.html", "tutorial.html", "starting.html",
        "browsing.html", "buffer.html", "pattern.html", "options.html",
        "tabs.html", "hints.html", "map.html", "eval.html", "marks.html",
        "repeat.html", "autocommands.html", "print.html", "gui.html",
        "developer.html", "various.html"
    ],

    init: function ()
    {
        function incrementURL(count)
        {
            var url = liberator.buffer.URL;
            var regex = /(.*?)(\d+)(\D*)$/;

            var matches = url.match(regex);
            if (!matches || !matches[2]) // no number to increment
                return liberator.beep();

            var newNum = parseInt(matches[2], 10) + count + ""; // "" to make sure its a string
            var nums = newNum.match(/^(-?)(\d+)$/);
            var oldLength = matches[2].replace(/-/, "").length, newLength = nums[2].length;
            newNum = nums[1] || "";
            for (let i = 0; i < oldLength - newLength; i++)
                newNum += "0"; // keep leading zeros
            newNum += nums[2];

            liberator.open(matches[1] + newNum + matches[3]);
        }

        // load Vimperator specific modules
        liberator.loadModule("search",     liberator.Search);
        liberator.loadModule("bookmarks",  liberator.Bookmarks);
        liberator.loadModule("history",    liberator.History);
        liberator.loadModule("tabs",       liberator.Tabs);
        liberator.loadModule("marks",      liberator.Marks);
        liberator.loadModule("quickmarks", liberator.QuickMarks);
        liberator.loadModule("hints",      liberator.Hints);

        ////////////////////////////////////////////////////////////////////////////////
        ////////////////////// MAPPINGS ////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        liberator.mappings.add([liberator.modes.NORMAL],
            ["y"], "Yank current location to the clipboard",
            function () { liberator.util.copyToClipboard(liberator.buffer.URL, true); });

        // opening websites
        liberator.mappings.add([liberator.modes.NORMAL],
            ["o"], "Open one or more URLs",
            function () { liberator.commandline.open(":", "open ", liberator.modes.EX); });

        liberator.mappings.add([liberator.modes.NORMAL], ["O"],
            "Open one or more URLs, based on current location",
            function () { liberator.commandline.open(":", "open " + liberator.buffer.URL, liberator.modes.EX); });

        liberator.mappings.add([liberator.modes.NORMAL], ["t"],
            "Open one or more URLs in a new tab",
            function () { liberator.commandline.open(":", "tabopen ", liberator.modes.EX); });

        liberator.mappings.add([liberator.modes.NORMAL], ["T"],
            "Open one or more URLs in a new tab, based on current location",
            function () { liberator.commandline.open(":", "tabopen " + liberator.buffer.URL, liberator.modes.EX); });

        liberator.mappings.add([liberator.modes.NORMAL],
            ["<C-a>"], "Increment last number in URL",
            function (count) { incrementURL(count > 1 ? count : 1); },
            { flags: liberator.Mappings.flags.COUNT });

        liberator.mappings.add([liberator.modes.NORMAL],
            ["<C-x>"], "Decrement last number in URL",
            function (count) { incrementURL(-(count > 1 ? count : 1)); },
            { flags: liberator.Mappings.flags.COUNT });

        liberator.mappings.add([liberator.modes.NORMAL], ["~"],
            "Open home directory",
            function () { liberator.open("~"); });

        liberator.mappings.add([liberator.modes.NORMAL], ["gh"],
            "Open homepage",
            function () { BrowserHome(); });

        liberator.mappings.add([liberator.modes.NORMAL], ["gH"],
            "Open homepage in a new tab",
            function ()
            {
                var homepages = gHomeButton.getHomePage();
                liberator.open(homepages, /\bhomepage\b/.test(liberator.options["activate"]) ?
                        liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB);
            });

        liberator.mappings.add([liberator.modes.NORMAL], ["gu"],
            "Go to parent directory",
            function (count)
            {
                function isDirectory(url)
                {
                    if (/^file:\/|^\//.test(url))
                    {
                        //var strippedFilename = url.replace(/^(file:\/\/)?(.*)/, "$2");
                        var file = liberator.io.getFile(url);
                        if (!file.exists() || !file.isDirectory())
                            return false;
                        else
                            return true;
                    }

                    // for all other locations just check if the URL ends with /
                    return /\/$/.test(url);
                }

                if (count < 1)
                    count = 1;

                var url = liberator.buffer.URL;
                for (var i = 0; i < count; i++)
                {
                    if (isDirectory(url))
                        url = url.replace(/^(.*?:)(.*?)([^\/]+\/*)$/, "$1$2/");
                    else
                        url = url.replace(/^(.*?:)(.*?)(\/+[^\/]+)$/, "$1$2/");
                }
                url = url.replace(/^(.*:\/+.*?)\/+$/, "$1/"); // get rid of more than 1 / at the end

                if (url == liberator.buffer.URL)
                {
                    liberator.beep();
                    return;
                }
                liberator.open(url);
            },
            { flags: liberator.Mappings.flags.COUNT });

        liberator.mappings.add([liberator.modes.NORMAL], ["gU"],
            "Go to the root of the website",
            function ()
            {
                var uri = content.document.location;
                if (/(about|mailto):/.test(uri.protocol)) // exclude these special protocols for now
                {
                    liberator.beep();
                    return;
                }
                liberator.open(uri.protocol + "//" + (uri.host || "") + "/");
            });

        liberator.mappings.add([liberator.modes.NORMAL], ["<C-l>"],
            "Redraw the screen",
            function () { liberator.commands.get("redraw").execute(); });

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// COMMANDS ////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        liberator.commands.add(["downl[oads]", "dl"],
            "Show progress of current downloads",
            function ()
            {
                liberator.open("chrome://mozapps/content/downloads/downloads.xul",
                    (liberator.options["newtab"] == "all" || liberator.options["newtab"].split(",").indexOf("downloads") != -1) ?
                        liberator.NEW_TAB : liberator.CURRENT_TAB);
            },
            { argCount: "0" });

        liberator.commands.add(["o[pen]", "e[dit]"],
            "Open one or more URLs in the current tab",
            function (args, special)
            {
                if (args)
                {
                    liberator.open(args);
                }
                else
                {
                    if (special)
                        BrowserReloadSkipCache();
                    else
                        BrowserReload();
                }
            },
            {
                completer: function (filter) { return liberator.completion.url(filter); }
            });

        liberator.commands.add(["redr[aw]"],
            "Redraw the screen",
            function ()
            {
                var wu = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor).
                                getInterface(Components.interfaces.nsIDOMWindowUtils);
                wu.redraw();
            },
            { argCount: "0" });

        // TODO: move sidebar commands to ui.js?
        liberator.commands.add(["sbcl[ose]"],
            "Close the sidebar window",
            function ()
            {
                if (document.getElementById("sidebar-box").hidden == false)
                    toggleSidebar();
            },
            { argCount: "0" });

        liberator.commands.add(["sideb[ar]", "sb[ar]", "sbope[n]"],
            "Open the sidebar window",
            function (args)
            {
                // do nothing if the requested sidebar is already open
                if (document.getElementById("sidebar-title").value == args.string)
                {
                    document.getElementById("sidebar-box").contentWindow.focus();
                    return;
                }

                var menu = document.getElementById("viewSidebarMenu");
                for (var i = 0; i < menu.childNodes.length; i++)
                {
                    if (menu.childNodes[i].label == args.string)
                    {
                        menu.childNodes[i].doCommand();
                        return;
                    }
                }
                liberator.echoerr("No sidebar " + args.string + " found");
            },
            {
                argCount: "+",
                completer: function (filter)
                {
                    var menu = document.getElementById("viewSidebarMenu");
                    var nodes = [];

                    for (var i = 0; i < menu.childNodes.length; i++)
                        nodes.push([menu.childNodes[i].label, ""]);

                    return [0, liberator.completion.filter(nodes, filter)];
                }
            });

        liberator.commands.add(["winc[lose]", "wc[lose]"],
            "Close window",
            function ()
            {
                window.close();
            },
            { argCount: "0" });

        liberator.commands.add(["wino[pen]", "wo[pen]", "wine[dit]"],
            "Open one or more URLs in a new window",
            function (args)
            {
                if (args)
                    liberator.open(args, liberator.NEW_WINDOW);
                else
                    liberator.open("about:blank", liberator.NEW_WINDOW);
            },
            {
                completer: function (filter) { return liberator.completion.url(filter); }
            });

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// OPTIONS /////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        liberator.options.add(["online"],
            "Set the 'work offline' option",
            "boolean", true,
            {
                setter: function (value)
                {
                    var ioService = Components.classes['@mozilla.org/network/io-service;1']
                                              .getService(Components.interfaces.nsIIOService2);

                    ioService.offline = !value;
                    gPrefService.setBoolPref("browser.offline", ioService.offline);
                },

                getter: function ()
                {
                    return Components.classes['@mozilla.org/network/io-service;1']
                                     .getService(Components.interfaces.nsIIOService2).offline;
                }
            });

        liberator.options.add(["titlestring"],
            "Change the title of the window",
            "string", "Vimperator",
            {
                setter: function (value)
                {
                    try
                    {
                        var id = liberator.config.mainWindowID || "main-window";
                        document.getElementById(id).setAttribute("titlemodifier", value);
                        if (window.content.document.title.length > 0)
                            document.title = window.content.document.title + " - " + value;
                        else
                            document.title = value;
                    }
                    catch (e)
                    {
                        liberator.log("Couldn't set titlestring", 3);
                    }
                }
            });

        liberator.options.add(["urlseparator"],
            "Set the separator regexp used to separate multiple URL args",
            "string", ",\\s");
    }
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
