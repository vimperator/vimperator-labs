// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

const DEFAULT_FAVICON = "chrome://global/skin/icons/Portrait.png";

const Config = Module("config", ConfigBase, {
    init: function () {
        // don't wait too long when selecting new messages
        // GetThreadTree()._selectDelay = 300; // TODO: make configurable
    },

    /*** required options, no checks done if they really exist, so be careful ***/
    name: "Muttator",
    hostApplication: "Thunderbird",

    get mainWindowId() this.isComposeWindow ? "msgcomposeWindow" : "messengerWindow",

    /*** optional options, there are checked for existence and a fallback provided  ***/
    get features() this.isComposeWindow ? ["addressbook"] : ["hints", "mail", "marks", "addressbook", "tabs"],
    defaults: {
        titlestring: "Muttator"
    },


    toolbars: {
        composition: [["composeToolbar2"],                                   "Composition toolbar"],
        folderlist:  [["folderPaneBox", "folderpane_splitter"],              "Folder list"],
        mail:        [["mail-bar3"],                                         "Main toolbar for getting mail and composing new ones."],
        menu:        [["mail-toolbar-menubar2", "compose-toolbar-menubar2"], "Menu Bar"],/*,
        // TODO: stupid element doesn't have an id!
        tabs:       [[function(visible) document.getElementById("tabmail").tabStrip.collapsed = !visible],       "Tab bar"]*/
        status:      [["status-bar"],                                        "Status Bar"]
    },

    //get isComposeWindow() window.wintype == "msgcompose",
    get isComposeWindow() window.document.location == "chrome://messenger/content/messengercompose/messengercompose.xul",
    get browserModes() [modes.MESSAGE],
    get mailModes() [modes.NORMAL],
    // focusContent() focuses this widget
    get mainWidget() this.isComposeWindow ? document.getElementById("content-frame") : GetThreadTree(),
    get mainToolbar() document.getElementById(this.isComposeWindow ? "compose-toolbar-menubar2" : "mail-bar3"),
    get visualbellWindow() document.getElementById(this.mainWindowId),
    styleableChrome: ["chrome://messenger/content/messenger.xul",
                      "chrome://messenger/content/messengercompose/messengercompose.xul"],

    autocommands: [["DOMLoad",         "Triggered when a page's DOM content has fully loaded"],
                   ["FolderLoad",      "Triggered after switching folders in Thunderbird"],
                   ["PageLoadPre",     "Triggered after a page load is initiated"],
                   ["PageLoad",        "Triggered when a page gets (re)loaded/opened"],
                   ["MuttatorEnter",    "Triggered after Thunderbird starts"],
                   ["MuttatorLeave",    "Triggered before exiting Thunderbird"],
                   ["MuttatorLeavePre", "Triggered before exiting Thunderbird"]],

    dialogs: [
        ["about",            "About Thunderbird",
            function () { window.openAboutDialog(); }],
        ["addons",           "Manage Add-ons",
            function () { window.openAddonsMgr(); }],
        ["addressbook",      "Address book",
            function () { window.toAddressBook(); }],
        ["accounts",      "Account Manager",
            function () { MsgAccountManager(); }],
        ["checkupdates",     "Check for updates",
            function () { window.checkForUpdates(); }],
        /*["cleardata",        "Clear private data",
         function () { Cc[GLUE_CID].getService(Ci.nsIBrowserGlue).sanitize(window || null); }],*/
        ["console",          "JavaScript console",
            function () { window.toJavaScriptConsole(); }],
        /*["customizetoolbar", "Customize the Toolbar",
            function () { BrowserCustomizeToolbar(); }],*/
        ["dominspector",     "DOM Inspector",
            function () { window.inspectDOMDocument(content.document); }],
        ["downloads",        "Manage Downloads",
            function () { window.toOpenWindowByType('Download:Manager', 'chrome://mozapps/content/downloads/downloads.xul', 'chrome,dialog=no,resizable'); }],
        /*["import",           "Import Preferences, Bookmarks, History, etc. from other browsers",
            function () { BrowserImport(); }],
        ["openfile",         "Open the file selector dialog",
            function () { BrowserOpenFileWindow(); }],
        ["pageinfo",         "Show information about the current page",
            function () { BrowserPageInfo(); }],
        ["pagesource",       "View page source",
            function () { BrowserViewSourceOfDocument(content.document); }],*/
        ["preferences",      "Show Thunderbird preferences dialog",
            function () { openOptionsDialog(); }],
        /*["printpreview",     "Preview the page before printing",
            function () { PrintUtils.printPreview(onEnterPrintPreview, onExitPrintPreview); }],*/
        ["printsetup",       "Setup the page size and orientation before printing",
            function () { PrintUtils.showPageSetup(); }],
        ["print",            "Show print dialog",
            function () { PrintUtils.print(); }],
        ["saveframe",        "Save frame to disk",
            function () { window.saveFrameDocument(); }],
        ["savepage",         "Save page to disk",
            function () { window.saveDocument(window.content.document); }],
        /*["searchengines",    "Manage installed search engines",
            function () { openDialog("chrome://browser/content/search/engineManager.xul", "_blank", "chrome,dialog,modal,centerscreen"); }],
        ["selectionsource",  "View selection source",
            function () { buffer.viewSelectionSource(); }]*/
    ],

    get hasTabbrowser() !this.isComposeWindow,

    /*focusChange: function (win) {
        // we switch to -- MESSAGE -- mode for Muttator, when the main HTML widget gets focus
        if (win && (win.document instanceof HTMLDocument || win.document instanceof XMLDocument) ||
            liberator.focus instanceof HTMLAnchorElement) {
            if (config.isComposeWindow)
                modes.set(modes.INSERT, modes.TEXTAREA);
            else if (liberator.mode != modes.MESSAGE)
                liberator.mode = modes.MESSAGE;
        }
    },*/
    get browser() this.isComposeWindow ? null : window.getBrowser(), // XXX: Does the composer really don't have a browser object?
    tabbrowser: {
        __proto__: document.getElementById("tabmail"),
        get mTabContainer() this.tabContainer,
        get mTabs() this.tabContainer.childNodes,
        get visibleTabs() Array.slice(this.mTabs),
        get mCurrentTab() this.tabContainer.selectedItem,
        get mStrip() this.tabStrip,
        get browsers() {
            let browsers = [];
            for ([,tab] in Iterator(this.tabInfo)) {
                let func = tab.mode.getBrowser || tab.mode.tabType.getBrowser;
                if (func)
                    browsers.push(func.call(tab.mode.tabType, tab));
            }
            return browsers;
        }
    },

    modes: [
        ["MESSAGE", { char: "m" }],
        ["COMPOSE"]
    ],

    // NOTE: as I don't use TB I have no idea how robust this is. --djk
    get outputHeight() {
        if (!this.isComposeWindow) {
            let container = document.getElementById("tabpanelcontainer").boxObject;
            let deck      = document.getElementById("displayDeck");
            let box       = document.getElementById("messagepanebox");
            let splitter  = document.getElementById("threadpane-splitter").boxObject;

            if (splitter.width > splitter.height)
                return container.height - deck.minHeight - box.minHeight- splitter.height;
            else
                return container.height - Math.max(deck.minHeight, box.minHeight);
        }
        else
            return document.getElementById("appcontent").boxObject.height;
    },

    get scripts() this.isComposeWindow ? ["compose/compose.js"] : [
        "addressbook.js",
        "mail.js",
        "tabs.js",
    ],

    // to allow Vim to :set ft=mail automatically
    tempFile: "mutt-ator-mail",

}, {
}, {
    commands: function () {
        commands.add(["pref[erences]", "prefs"],
            "Show " + config.hostApplication + " preferences",
            function () { window.openOptionsDialog(); },
            { argCount: "0" });
    },
    modes: function () {
        this.ignoreKeys = {
            "<Return>": modes.NORMAL | modes.INSERT,
            "<Space>": modes.NORMAL | modes.INSERT,
            "<Up>": modes.INSERT,
            "<Down>": modes.INSERT
        };
    },
    options: function () {
        // FIXME: comment obviously incorrect
        // 0: never automatically edit externally
        // 1: automatically edit externally when message window is shown the first time
        // 2: automatically edit externally, once the message text gets focus (not working currently)
        options.add(["autoexternal", "ae"],
            "Edit message with external editor by default",
            "boolean", false);

        if (!this.isComposeWindow) {
            options.add(["online"],
                "Set the 'work offline' option",
                "boolean", true,
                {
                    setter: function (value) {
                        if (MailOfflineMgr.isOnline() != value)
                            MailOfflineMgr.toggleOfflineStatus();
                        return value;
                    },
                    getter: function () MailOfflineMgr.isOnline()
                });
        }
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
