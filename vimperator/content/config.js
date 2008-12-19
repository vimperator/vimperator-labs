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

const config = { //{{{
    /*** required options, no checks done if they really exist, so be careful ***/
    name: "Vimperator",
    hostApplication: "Firefox",

    /*** optional options, there are checked for existance and a fallback provided  ***/
    features: ["bookmarks", "hints", "history", "marks", "quickmarks", "session", "tabs", "windows"],
    defaults: { guioptions: "rb" },

    guioptions: {
        m: ["Menubar",      ["toolbar-menubar"]],
        T: ["Toolbar",      ["nav-bar"]],
        B: ["Bookmark bar", ["PersonalToolbar"]]
    },

    get visualbellWindow() getBrowser().mPanelContainer,
    styleableChrome: "chrome://browser/content/browser.xul",

    autocommands: [["BookmarkAdd",        "Triggered after a page is bookmarked"],
                   ["ColorScheme",        "Triggered after a color scheme has been loaded"],
                   ["DOMLoad",            "Triggered when a page's DOM content has fully loaded"],
                   ["DownloadPost",       "Triggered when a download has completed"],
                   ["Fullscreen",         "Triggered when the browser's fullscreen state changes"],
                   ["LocationChange",     "Triggered when changing tabs or when naviagtion to a new location"],
                   ["PageLoadPre",        "Triggered after a page load is initiated"],
                   ["PageLoad",           "Triggered when a page gets (re)loaded/opened"],
                   ["ShellCmdPost",       "Triggered after executing a shell command with :!cmd"],
                   ["VimperatorEnter",    "Triggered after Firefox starts"],
                   ["VimperatorLeavePre", "Triggered before exiting Firefox, just before destroying each module"],
                   ["VimperatorLeave",    "Triggered before exiting Firefox"]],

    dialogs: [
        ["about",            "About Firefox",
            function () { window.openDialog("chrome://browser/content/aboutDialog.xul", "_blank", "chrome,dialog,modal,centerscreen"); }],
        ["addbookmark",      "Add bookmark for the current page",
            function () { PlacesCommandHook.bookmarkCurrentPage(true, PlacesUtils.bookmarksRootId); }],
        ["addons",           "Manage Add-ons",
            function () { window.BrowserOpenAddonsMgr(); }],
        ["bookmarks",        "List your bookmarks",
            function () { window.openDialog("chrome://browser/content/bookmarks/bookmarksPanel.xul", "Bookmarks", "dialog,centerscreen,width=600,height=600"); }],
        ["checkupdates",     "Check for updates",
            function () { window.checkForUpdates(); }],
        ["cleardata",        "Clear private data",
            function () { Cc[GLUE_CID].getService(Ci.nsIBrowserGlue).sanitize(window || null); }],
        ["cookies",          "List your cookies",
            function () { window.toOpenWindowByType("Browser:Cookies", "chrome://browser/content/preferences/cookies.xul", "chrome,dialog=no,resizable"); }],
        ["console",          "JavaScript console",
            function () { window.toJavaScriptConsole(); }],
        ["customizetoolbar", "Customize the Toolbar",
            function () { window.BrowserCustomizeToolbar(); }],
        ["dominspector",     "DOM Inspector",
            function () { try { window.inspectDOMDocument(content.document); } catch (e) { liberator.echoerr("DOM Inspector extension not installed"); } }],
        ["downloads",        "Manage Downloads",
            function () { window.toOpenWindowByType("Download:Manager", "chrome://mozapps/content/downloads/downloads.xul", "chrome,dialog=no,resizable"); }],
        ["history",          "List your history",
            function () { window.openDialog("chrome://browser/content/history/history-panel.xul", "History", "dialog,centerscreen,width=600,height=600"); }],
        ["import",           "Import Preferences, Bookmarks, History, etc. from other browsers",
            function () { window.BrowserImport(); }],
        ["openfile",         "Open the file selector dialog",
            function () { window.BrowserOpenFileWindow(); }],
        ["pageinfo",         "Show information about the current page",
            function () { window.BrowserPageInfo(); }],
        ["pagesource",       "View page source",
            function () { window.BrowserViewSourceOfDocument(content.document); }],
        ["places",           "Places Organizer: Manage your bookmarks and history",
            function () { PlacesCommandHook.showPlacesOrganizer(ORGANIZER_ROOT_BOOKMARKS); }],
        ["preferences",      "Show Firefox preferences dialog",
            function () { window.openPreferences(); }],
        ["printpreview",     "Preview the page before printing",
            function () { PrintUtils.printPreview(onEnterPrintPreview, onExitPrintPreview); }],
        ["printsetup",       "Setup the page size and orientation before printing",
            function () { PrintUtils.showPageSetup(); }],
        ["print",            "Show print dialog",
            function () { PrintUtils.print(); }],
        ["saveframe",        "Save frame to disk",
            function () { window.saveFrameDocument(); }],
        ["savepage",         "Save page to disk",
            function () { window.saveDocument(window.content.document); }],
        ["searchengines",    "Manage installed search engines",
            function () { window.openDialog("chrome://browser/content/search/engineManager.xul", "_blank", "chrome,dialog,modal,centerscreen"); }],
        ["selectionsource",  "View selection source",
            function () { buffer.viewSelectionSource(); }]
    ],

    // they are sorted by relevance, not alphabetically
    helpFiles: [
        "intro.html", "tutorial.html", "starting.html", "browsing.html",
        "buffer.html", "cmdline.html", "options.html", "pattern.html",
        "tabs.html", "hints.html", "map.html", "eval.html", "marks.html",
        "repeat.html", "autocommands.html", "print.html", "gui.html",
        "styling.html", "message.html", "developer.html", "various.html",
        "index.html"
    ],

    scripts: [
        "bookmarks.js",
        "tabs.js",
    ],

    init: function ()
    {
        // TODO: support 'nrformats'?
        function incrementURL(count)
        {
            let matches = buffer.URL.match(/(.*?)(\d+)(\D*)$/);

            if (!matches)
            {
                liberator.beep();
                return;
            }

            [, pre, number, post] = matches;
            let newNumber = parseInt(number, 10) + count;

            liberator.open(pre + (newNumber > 0 ? newNumber : 0) + post);
        }

        // load Vimperator specific modules
        // FIXME: Why aren't these listed in config.scripts?
        // FIXME: Why isn't this automatic?
        liberator.loadModule("search",     Search);
        liberator.loadModule("bookmarks",  Bookmarks);
        liberator.loadModule("history",    History);
        liberator.loadModule("tabs",       Tabs);
        liberator.loadModule("marks",      Marks);
        liberator.loadModule("quickmarks", QuickMarks);
        liberator.loadModule("hints",      Hints);

        ////////////////////////////////////////////////////////////////////////////////
        ////////////////////// STYLES //////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        let img = Image();
        img.src = "chrome://vimperator/content/vimperator.png";
        img.onload = function () {
            styles.addSheet("logo", "chrome://liberator/locale/*",
                ".vimperator-logo {" + <>
                     display:    inline-block;
                     background: url({img.src});
                     width:      {img.width}px;
                     height:     {img.height}px;
                </> + "}",
                true);
            delete img;
        };

        ////////////////////////////////////////////////////////////////////////////////
        ////////////////////// MAPPINGS ////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        mappings.add([modes.NORMAL],
            ["y"], "Yank current location to the clipboard",
            function () { util.copyToClipboard(buffer.URL, true); });

        // opening websites
        mappings.add([modes.NORMAL],
            ["o"], "Open one or more URLs",
            function () { commandline.open(":", "open ", modes.EX); });

        mappings.add([modes.NORMAL], ["O"],
            "Open one or more URLs, based on current location",
            function () { commandline.open(":", "open " + buffer.URL, modes.EX); });

        mappings.add([modes.NORMAL], ["t"],
            "Open one or more URLs in a new tab",
            function () { commandline.open(":", "tabopen ", modes.EX); });

        mappings.add([modes.NORMAL], ["T"],
            "Open one or more URLs in a new tab, based on current location",
            function () { commandline.open(":", "tabopen " + buffer.URL, modes.EX); });

        mappings.add([modes.NORMAL],
            ["<C-a>"], "Increment last number in URL",
            function (count) { incrementURL(count > 1 ? count : 1); },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL],
            ["<C-x>"], "Decrement last number in URL",
            function (count) { incrementURL(-(count > 1 ? count : 1)); },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL], ["~"],
            "Open home directory",
            function () { liberator.open("~"); });

        mappings.add([modes.NORMAL], ["gh"],
            "Open homepage",
            function () { BrowserHome(); });

        mappings.add([modes.NORMAL], ["gH"],
            "Open homepage in a new tab",
            function ()
            {
                let homepages = gHomeButton.getHomePage();
                liberator.open(homepages, /\bhomepage\b/.test(options["activate"]) ?
                        liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB);
            });

        mappings.add([modes.NORMAL], ["gu"],
            "Go to parent directory",
            function (count)
            {
                function isDirectory(url)
                {
                    if (/^file:\/|^\//.test(url))
                    {
                        let file = io.getFile(url);
                        return file.exists() && file.isDirectory();
                    }
                    else
                    {
                        // for all other locations just check if the URL ends with /
                        return /\/$/.test(url);
                    }
                }

                if (count < 1)
                    count = 1;

                // XXX
                let url = buffer.URL;
                for (let i = 0; i < count; i++)
                {
                    if (isDirectory(url))
                        url = url.replace(/^(.*?:)(.*?)([^\/]+\/*)$/, "$1$2/");
                    else
                        url = url.replace(/^(.*?:)(.*?)(\/+[^\/]+)$/, "$1$2/");
                }
                url = url.replace(/^(.*:\/+.*?)\/+$/, "$1/"); // get rid of more than 1 / at the end

                if (url == buffer.URL)
                    liberator.beep();
                else
                    liberator.open(url);
            },
            { flags: Mappings.flags.COUNT });

        mappings.add([modes.NORMAL], ["gU"],
            "Go to the root of the website",
            function ()
            {
                let uri = content.document.location;
                if (/(about|mailto):/.test(uri.protocol)) // exclude these special protocols for now
                {
                    liberator.beep();
                    return;
                }
                liberator.open(uri.protocol + "//" + (uri.host || "") + "/");
            });

        mappings.add([modes.NORMAL], ["<C-l>"],
            "Redraw the screen",
            function () { commands.get("redraw").execute("", false); });

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// COMMANDS ////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        commands.add(["downl[oads]", "dl"],
            "Show progress of current downloads",
            function ()
            {
                liberator.open("chrome://mozapps/content/downloads/downloads.xul",
                    options.get("newtab").has("all", "downloads")
                        ? liberator.NEW_TAB : liberator.CURRENT_TAB);
            },
            { argCount: "0" });

        commands.add(["o[pen]", "e[dit]"],
            "Open one or more URLs in the current tab",
            function (args)
            {
                if (args.string)
                {
                    liberator.open(args.string);
                }
                else if (args.bang)
                    BrowserReloadSkipCache();
                else
                    BrowserReload();
            },
            {
                bang: true,
                completer: function (context) completion.url(context),
                literal: 0
            });

        commands.add(["pref[erences]", "prefs"],
            "Show " + config.hostApplication + " preferences",
            function (args)
            {
                if (args.bang) // open Firefox settings GUI dialog
                {
                    liberator.open("about:config",
                        (options["newtab"] && options.get("newtab").has("all", "prefs"))
                                ? liberator.NEW_TAB : liberator.CURRENT_TAB);
                }
                else
                {
                    window.openPreferences();
                }
            },
            {
                argCount: "0",
                bang: true
            });

        commands.add(["redr[aw]"],
            "Redraw the screen",
            function ()
            {
                let wu = window.QueryInterface(Ci.nsIInterfaceRequestor).
                                getInterface(Ci.nsIDOMWindowUtils);
                wu.redraw();
                modes.show();
            },
            { argCount: "0" });

        // TODO: move sidebar commands to ui.js?
        commands.add(["sbcl[ose]"],
            "Close the sidebar window",
            function ()
            {
                if (!document.getElementById("sidebar-box").hidden)
                    toggleSidebar();
            },
            { argCount: "0" });

        commands.add(["sideb[ar]", "sb[ar]", "sbope[n]"],
            "Open the sidebar window",
            function (args)
            {
                let arg = args.literalArg;

                // focus if the requested sidebar is already open
                if (document.getElementById("sidebar-title").value == arg)
                {
                    document.getElementById("sidebar-box").focus();
                    return;
                }

                let menu = document.getElementById("viewSidebarMenu");

                for (let [,panel] in Iterator(menu.childNodes))
                {
                    if (panel.label == arg)
                    {
                        panel.doCommand();
                        return;
                    }
                }

                liberator.echoerr("No sidebar " + arg + " found");
            },
            {
                argCount: "1",
                completer: function (context) completion.sidebar(context),
                literal: 0
            });

        commands.add(["winc[lose]", "wc[lose]"],
            "Close window",
            function () { window.close(); },
            { argCount: "0" });

        commands.add(["wino[pen]", "wo[pen]", "wine[dit]"],
            "Open one or more URLs in a new window",
            function (args)
            {
                args = args.string;

                if (args)
                    liberator.open(args, liberator.NEW_WINDOW);
                else
                    liberator.open("about:blank", liberator.NEW_WINDOW);
            },
            {
                completer: function (context) completion.url(context),
                literal: 0
            });

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// OPTIONS /////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        options.add(["online"],
            "Set the 'work offline' option",
            "boolean", true,
            {
                setter: function (value)
                {
                    const ioService = Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService2);

                    ioService.offline = !value;
                    gPrefService.setBoolPref("browser.offline", ioService.offline);

                    return value;
                },
                getter: function ()
                {
                    return Cc['@mozilla.org/network/io-service;1'].getService(Ci.nsIIOService2).offline;
                }
            });

        options.add(["titlestring"],
            "Change the title of the window",
            "string", "Vimperator",
            {
                setter: function (value)
                {
                    try
                    {
                        let id = config.mainWindowID || "main-window";
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

                    return value;
                }
            });

        options.add(["urlseparator"],
            "Set the separator regexp used to separate multiple URL args",
            "string", ",\\s");
    }
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
