// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


Components.utils.import("resource://gre/modules/utils.js"); // XXX

const config = { //{{{
    /*** required options, no checks done if they really exist, so be careful ***/
    name: "Xulmus",
    hostApplication: "Songbird",

    /*** optional options, there are checked for existence and a fallback provided  ***/
    features: ["bookmarks", "hints", "marks", "history", "quickmarks", "session", "tabs", "player"],
    defaults: {
        guioptions: "mprb",
        showtabline: 2,
        titlestring: "Xulmus"
    },

    guioptions: {
        m: ["Menubar",         ["main-menubar"]],
        T: ["Toolbar",         ["nav-bar"]],
        p: ["Player controls", ["player_wrapper"]]
    },

    get isPlayerWindow() SBGetBrowser().mCurrentTab == SBGetBrowser().mediaTab,
    // focusContent() focuses this widget gSongbirdWindowController takes care of the focus.
    get visualbellWindow() document.getElementById(this.mainWindowId),

    styleableChrome: ["chrome://gonzo/content/xul/mainplayer.xul"],

    autocommands: [["BookmarkAdd",    "Triggered after a page is bookmarked"],
                   ["ColorScheme",    "Triggered after a color scheme has been loaded"],
                   ["DOMLoad",        "Triggered when a page's DOM content has fully loaded"],
                   ["DownloadPost",   "Triggered when a download has completed"],
                   ["Fullscreen",     "Triggered when the browser's fullscreen state changes"],
                   ["LocationChange", "Triggered when changing tabs or when navigation to a new location"],
                   ["PageLoadPre",    "Triggered after a page load is initiated"],
                   ["PageLoad",       "Triggered when a page gets (re)loaded/opened"],
                   ["ShellCmdPost",   "Triggered after executing a shell command with :!cmd"],
                   ["TrackChangePre", "Triggered before a playing track is changed"],
                   ["TrackChange",    "Triggered after a playing track has changed"],
                   ["ViewChangePre",  "Triggered before a sequencer view is changed"],
                   ["ViewChange",     "Triggered after a sequencer view is changed"],
                   ["StreamStart",    "Triggered after a stream has started"],
                   ["StreamPause",    "Triggered after a stream has paused"],
                   ["StreamEnd",      "Triggered after a stream has ended"],
                   ["StreamStop",     "Triggered after a stream has stopped"],
                   ["XulmusEnter",    "Triggered after Songbird starts"],
                   ["XulmusLeavePre", "Triggered before exiting Songbird, just before destroying each module"],
                   ["XulmusLeave",    "Triggered before exiting Songbird"]],

    // TODO: remove those which don't make sense, can't be provided.
    dialogs: [
        ["about",            "About Songbird",
            function () { window.openDialog("chrome://songbird/content/xul/about.xul", "_blank", "chrome,dialog,modal,centerscreen"); }],
        /*
        ["addbookmark",      "Add bookmark for the current page",
            function () { PlacesCommandHook.bookmarkCurrentPage(true, PlacesUtils.bookmarksRootId); }],
        */
        ["addons",           "Manage Add-ons",
            function () { SBOpenPreferences("paneAddons"); }],
        /*
        ["bookmarks",        "List your bookmarks",
            function () { window.openDialog("chrome://browser/content/bookmarks/bookmarksPanel.xul", "Bookmarks", "dialog,centerscreen,width=600,height=600"); }],
        */
        ["checkupdates",     "Check for updates",
            function () { window.checkForUpdates(); }],
        ["cleardata",        "Clear private data",
            function () {  Sanitizer.showUI(); }],
        ["cookies",          "List your cookies",
            function () { window.toOpenWindowByType("Browser:Cookies", "chrome://browser/content/preferences/cookies.xul", "chrome,dialog=no,resizable"); }],
        ["console",          "JavaScript console",
            function () { window.toJavaScriptConsole(); }],
        /*
        ["customizetoolbar", "Customize the Toolbar",
            function () { window.BrowserCustomizeToolbar(); }],
        */
        ["dominspector",     "DOM Inspector",
            function () { try { window.inspectDOMDocument(content.document); } catch (e) { liberator.echoerr("DOM Inspector extension not installed"); } }],
        ["downloads",        "Manage Downloads",
            function () { window.toOpenWindowByType("Download:Manager", "chrome://mozapps/content/downloads/downloads.xul", "chrome,dialog=no,resizable"); }],
        /*
        ["history",          "List your history",
            function () { window.openDialog("chrome://browser/content/history/history-panel.xul", "History", "dialog,centerscreen,width=600,height=600"); }],
        ["import",           "Import Preferences, Bookmarks, History, etc. from other browsers",
            function () { window.BrowserImport(); }],
        */
        ["jumpto",           "Jump to a media item",
            function () { onJumpToFileKey(); }],
        ["newsmartplaylist", "Open the file selector dialog",
            function () { SBNewSmartPlaylist(); }],
        ["openfile",         "Open the file selector dialog",
            function () { SBFileOpen(); }],
        /*
        ["pageinfo",         "Show information about the current page",
            function () { window.BrowserPageInfo(); }],
        */
        ["pagesource",       "View page source",
            function () { window.BrowserViewSourceOfDocument(content.document); }],
        ["places",           "Places Organizer: Manage your bookmarks and history",
            function () { PlacesCommandHook.showPlacesOrganizer(ORGANIZER_ROOT_BOOKMARKS); }],
        ["preferences",      "Show Songbird preferences dialog",
            function () { window.openPreferences(); }],
        /*
        ["printpreview",     "Preview the page before printing",
            function () { PrintUtils.printPreview(onEnterPrintPreview, onExitPrintPreview); }],
        */
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
            function () { buffer.viewSelectionSource(); }],
        ["subscribe",        "Add a new subscription",
            function () { SBSubscribe(); }]
    ],

    focusChange: function ()
    {
        // Switch to -- PLAYER -- mode for Songbird Media Player.
        if (config.isPlayerWindow)
            liberator.mode = modes.PLAYER;
        else
            liberator.mode = modes.NORMAL;
    },

    hasTabbrowser: true,

    modes: [["PLAYER", { char: "p" }]],

    get ignoreKeys() {
        delete this.ignoreKeys;
        return this.ignoreKeys = {
            "<Return>": modes.NORMAL | modes.INSERT,
            "<Space>": modes.NORMAL | modes.INSERT,
            "<Up>": modes.NORMAL | modes.INSERT,
            "<Down>": modes.NORMAL | modes.INSERT
        };
    },

    scripts: [
        "browser.js",
        "bookmarks.js",
        "tabs.js",
        "player.js",
        "library.js"
    ],

    // FIXME: tab arg and media tab exception?
    stop: function (tab)
    {
        SBGetBrowser().mCurrentBrowser.stop();
    },

    init: function ()
    {
        // Adding a mode for Player
        //modes.addMode("PLAYER"); // Player mode for songbird

        // TODO: support 'nrformats'? -> probably not worth it --mst
        function incrementURL(count)
        {
            let matches = buffer.URL.match(/(.*?)(\d+)(\D*)$/);
            if (!matches)
                return void liberator.beep();

            let [, pre, number, post] = matches;
            let newNumber = parseInt(number, 10) + count;
            let newNumberStr = String(newNumber > 0 ? newNumber : 0);
            if (number.match(/^0/)) // add 0009<C-a> should become 0010
            {
                while (newNumberStr.length < number.length)
                    newNumberStr = "0" + newNumberStr;
            }

            liberator.open(pre + newNumberStr + post);
        }

        function showServicePane(value)
        {
            const key = "splitter.servicepane_splitter.was_collapsed";
            gServicePane.open = value;
            SBDataSetBoolValue(key, gServicePane.open);
        }

        function openDisplayPane(id)
        {
            if (id == "servicepane")
                showServicePane(true);
            else
            {
                let pane = document.getElementById(id);
                let manager = Cc['@songbirdnest.com/Songbird/DisplayPane/Manager;1'].getService(Ci.sbIDisplayPaneManager);
                let paneinfo = manager.getPaneInfo(pane._lastURL.stringValue);

                if (!paneinfo)
                    paneinfo = manager.defaultPaneInfo;

                pane.loadContent(paneinfo);
            }
        }

        function closeDisplayPane(id)
        {
            if (id == "servicepane")
                showServicePane(false);
            else
                document.getElementById(id).hide();
        }

        // FIXME: best way to format these args? Hyphenated? One word like :dialog?
        let displayPanes = {
            "service pane left": "servicepane",
            "content pane bottom": "displaypane_contentpane_bottom",
            "service pane bottom": "displaypane_servicepane_bottom",
            "right sidebar": "displaypane_right_sidebar"
        };

        completion.displayPane = function (context) {
            context.title = ["Display Pane"];
            context.completions = displayPanes; // FIXME: useful description etc
        };

        // load Xulmus specific modules
        liberator.loadModule("browser",    Browser);
        liberator.loadModule("finder",     Finder);
        liberator.loadModule("bookmarks",  Bookmarks);
        liberator.loadModule("history",    History);
        liberator.loadModule("tabs",       Tabs);
        liberator.loadModule("marks",      Marks);
        liberator.loadModule("quickmarks", QuickMarks);
        liberator.loadModule("hints",      Hints);
        liberator.loadModule("player",     Player);
        liberator.loadModule("library",    Library);

        ////////////////////////////////////////////////////////////////////////////////
        ////////////////////// STYLES //////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        let img = Image();
        img.src = "chrome://xulmus/content/logo.png";
        img.onload = function () {
            styles.addSheet(true, "logo", "chrome://liberator/locale/*",
                ".xulmus-logo {" + <>
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

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// COMMANDS ////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        commands.add(["dpcl[ose]"],
            "Close a display pane",
            function (args)
            {
                let arg = args.literalArg;

                if (arg in displayPanes)
                    closeDisplayPane(displayPanes[arg]);
                else
                    liberator.echoerr("E475: Invalid argument: " + arg);

            },
            {
                argCount: "1",
                completer: function (context) completion.displayPane(context),
                literal: 0
            });

        // TODO: this should accept a second arg to specify content
        commands.add(["displayp[ane]", "dp[ane]", "dpope[n]"],
            "Open a display pane",
            function (args)
            {
                let arg = args.literalArg;

                if (arg in displayPanes)
                    openDisplayPane(displayPanes[arg]);
                    // TODO: focus when we have better key handling of these extended modes
                else
                    liberator.echoerr("E475: Invalid argument: " + arg);
            },
            {
                argCount: "1",
                completer: function (context) completion.displayPane(context),
                literal: 0
            });

        commands.add(["pref[erences]", "prefs"],
            "Show " + config.hostApplication + " preferences",
            function (args)
            {
                if (args.bang) // open Songbird settings GUI dialog
                {
                    liberator.open("about:config",
                        (options["newtab"] && options.get("newtab").has("all", "prefs"))
                                ? liberator.NEW_TAB : liberator.CURRENT_TAB);
                }
                else
                    window.openPreferences();
            },
            {
                argCount: "0",
                bang: true
            });

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// OPTIONS /////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        // TODO: SB doesn't explicitly support an offline mode. Should we? --djk
        options.add(["online"],
            "Set the 'work offline' option",
            "boolean", true,
            {
                setter: function (value)
                {
                    const ioService = services.get("io");
                    ioService.offline = !value;
                    options.setPref("browser.offline", ioService.offline);
                    return value;
                },
                getter: function () !services.get("io").offline
            });

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// COMPLETIONS /////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        //}}}

        // TODO: mention this to SB devs, they seem keen to provide these
        // functions to make porting from FF as simple as possible.
        window.toJavaScriptConsole = function () {
            toOpenWindowByType("global:console", "chrome://global/content/console.xul");
        };

        window.BrowserStop = function () {
            SBGetBrowser().mCurrentBrowser.stop();
        };
    }
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
