// Copyright (c) 2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
// Copyright (c) 2009 by Prathyush Thota <prathyushthota@gmail.com>
// Copyright (c) 2009 by Doug Kearns <dougkearns@gmail.com>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


Components.utils.import("resource://gre/modules/utils.js"); // XXX

const Config = Module("config", ConfigBase, {
    init: function () {
        // TODO: mention this to SB devs, they seem keen to provide these
        // functions to make porting from FF as simple as possible.
        window.toJavaScriptConsole = function () {
            toOpenWindowByType("global:console", "chrome://global/content/console.xul");
        };

        window.BrowserStop = function () {
            SBGetBrowser().mCurrentBrowser.stop();
        };
    },
    /*** required options, no checks done if they really exist, so be careful ***/
    name: "Xulmus",
    hostApplication: "Songbird",

    /*** optional options, there are checked for existence and a fallback provided  ***/
    features: ["bookmarks", "hints", "marks", "history", "quickmarks", "session", "tabs", "player"],
    defaults: {
        guioptions: "mprb",
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

    focusChange: function () {
        // Switch to -- PLAYER -- mode for Songbird Media Player.
        if (config.isPlayerWindow)
            liberator.mode = modes.PLAYER;
        else
            liberator.mode = modes.NORMAL;
    },

    hasTabbrowser: true,
    // FIXME: unless I'm seeing double in in the wee small hours gBrowser is
    // first set from getBrowser which they've deprecated in FF.
    get tabbrowser() window.getBrowser(),
    get browser() window.getBrowser(),

    modes: [["PLAYER", { char: "p" }]],

    scripts: [
        "browser.js",
        "bookmarks.js",
        "history.js",
        "quickmarks.js",
        "tabs.js",
        "player.js",
        "library.js"
    ],

    // FIXME: tab arg and media tab exception?
    stop: function (tab) {
        SBGetBrowser().mCurrentBrowser.stop();
    }
}, {

    /**
     * Shows or hides the main service pane.
     *
     * @param {boolean} value Show the service pane if true, hide it if false.
     */
    showServicePane: function (value) {
        const key = "splitter.servicepane_splitter.was_collapsed";
        gServicePane.open = value;
        SBDataSetBoolValue(key, gServicePane.open);
    },

    /**
     * Opens the display panel with the specified <b>id<b>.
     *
     * @param {string} id The ID of the display pane.
     */
    openDisplayPane: function (id) {
        if (id == "servicepane")
            this.showServicePane(true);
        else {
            let pane = document.getElementById(id);
            let manager = services.get("displayPaneManager");
            let paneinfo = manager.getPaneInfo(pane._lastURL.stringValue);

            if (!paneinfo)
                paneinfo = manager.defaultPaneInfo;

            pane.loadContent(paneinfo);
        }
    },

    /**
     * Closes the display panel with the specified <b>id</b>
     *
     * @param {string} id The ID of the display pane.
     */
    closeDisplayPane: function (id) {
        if (id == "servicepane")
            this.showServicePane(false);
        else
            document.getElementById(id).hide();
    },

    // FIXME: best way to format these args? Hyphenated? One word like :dialog?
    /**
     * @property {object} A map of display pane command argument strings to
     *     panel element IDs.
     */
    displayPanes: {
        "service pane left": "servicepane",
        "content pane bottom": "displaypane_contentpane_bottom",
        "service pane bottom": "displaypane_servicepane_bottom",
        "right sidebar": "displaypane_right_sidebar"
    }
}, {
    commands: function () {
        commands.add(["dpcl[ose]"],
            "Close a display pane",
            function (args) {
                let arg = args.literalArg;

                if (arg in Config.displayPanes)
                    Config.closeDisplayPane(Config.displayPanes[arg]);
                else
                    liberator.echoerr("Invalid argument: " + arg);

            },
            {
                argCount: "1",
                completer: function (context) completion.displayPane(context),
                literal: 0
            });

        // TODO: this should accept a second arg to specify content
        commands.add(["displayp[ane]", "dp[ane]", "dpope[n]"],
            "Open a display pane",
            function (args) {
                let arg = args.literalArg;

                if (arg in Config.displayPanes)
                    Config.openDisplayPane(Config.displayPanes[arg]);
                    // TODO: focus when we have better key handling of these extended modes
                else
                    liberator.echoerr("Invalid argument: " + arg);
            },
            {
                argCount: "1",
                completer: function (context) completion.displayPane(context),
                literal: 0
            });

        commands.add(["pref[erences]", "prefs"],
            "Show " + config.hostApplication + " preferences",
            function (args) {
                if (args.bang) { // open Songbird settings GUI dialog
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
    },
    completion: function () {
        completion.displayPane = function (context) {
            context.title = ["Display Pane"];
            context.completions = Config.displayPanes; // FIXME: useful description etc
        };
    },
    modes: function () {
        this.ignoreKeys = {
            "<Return>": modes.NORMAL | modes.INSERT,
            "<Space>": modes.NORMAL | modes.INSERT,
            "<Up>": modes.NORMAL | modes.INSERT,
            "<Down>": modes.NORMAL | modes.INSERT
        };
    },
    options: function () {
        // TODO: SB doesn't explicitly support an offline mode. Should we? --djk
        options.add(["online"],
            "Set the 'work offline' option",
            "boolean", true,
            {
                setter: function (value) {
                    const ioService = services.get("io");
                    ioService.offline = !value;
                    options.setPref("browser.offline", ioService.offline);
                    return value;
                },
                getter: function () !services.get("io").offline
            });
    },
    services: function () {
        services.add("displayPaneManager", "@songbirdnest.com/Songbird/DisplayPane/Manager;1", Ci.sbIDisplayPaneManager);
        services.add("mediaPageManager", "@songbirdnest.com/Songbird/MediaPageManager;1", Ci.sbIMediaPageManager);
        services.add("propertyManager","@songbirdnest.com/Songbird/Properties/PropertyManager;1", Ci.sbIPropertyManager);
        services.addClass("mutablePropertyArray", "@songbirdnest.com/Songbird/Properties/MutablePropertyArray;1",
            Ci.sbIMutablePropertyArray);
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
