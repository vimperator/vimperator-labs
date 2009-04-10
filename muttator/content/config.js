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

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>

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
    name: "Muttator",
    hostApplication: "Thunderbird", // TODO: can this be found out otherwise? gBrandBundle.getString("brandShortName");

    /*** optional options, there are checked for existence and a fallback provided  ***/
    features: ["hints", "mail", "marks", "addressbook", "tabs"],
    defaults: { guioptions: "frb" },

    guioptions: {
        m: ["MenuBar",            ["mail-toolbar-menubar2"]],
        T: ["Toolbar" ,           ["mail-bar2"]],
        f: ["Folder list",        ["folderPaneBox", "folderpane_splitter"]],
        F: ["Folder list header", ["folderPaneHeader"]]
    },

    get isComposeWindow() window.wintype == "msgcompose",
    get browserModes() [modes.MESSAGE],
    // focusContent() focuses this widget
    get mainWidget() this.isComposeWindow ? document.getElementById("content-frame") : GetThreadTree(),
    get mainWindowID() this.isComposeWindow ? "msgcomposeWindow" : "messengerWindow",
    get visualbellWindow() document.getElementById(this.mainWindowID),
    styleableChrome: "chrome://messenger/content/messenger.xul,chrome://messenger/content/messengercompose/messengercompose.xul",

    autocommands: [["FolderLoaded",  "Triggered after switching folders in Thunderbird"],
                   ["PageLoadPre",   "Triggered after a page load is initiated"],
                   ["PageLoad",      "Triggered when a page gets (re)loaded/opened"],
                   ["MuttatorEnter", "Triggered after Thunderbird starts"],
                   ["MuttatorLeave", "Triggered before exiting Thunderbird"],
                   ["MuttatorLeavePre", "Triggered before exiting Thunderbird"]],

    dialogs: [
        ["about",            "About Thunderbird",
            function () { window.openAboutDialog(); }],
        ["addons",           "Manage Add-ons",
            function () { window.openAddonsMgr(); }],
        ["addressbook",      "Address book",
            function () { window.toAddressBook(); }],
        ["checkupdates",     "Check for updates",
            function () { window.checkForUpdates(); }],
        /*["cleardata",        "Clear private data",
         function () { Components.classes[GLUE_CID].getService(Components.interfaces.nsIBrowserGlue).sanitize(window || null); }],*/
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

    focusChange: function(win) {
        // we switch to -- MESSAGE -- mode for Muttator, when the main HTML widget gets focus
        let elem = window.document.commandDispatcher.focusedElement;
        if ((win && win.document && win.document instanceof HTMLDocument) || elem instanceof HTMLAnchorElement)
        {
            if (config.isComposeWindow)
                modes.set(modes.INSERT, modes.TEXTAREA);
            else if (liberator.mode != modes.MESSAGE)
                liberator.mode = modes.MESSAGE;
        }
    },

    // they are sorted by relevance, not alphabetically
    helpFiles: ["intro.html", "version.html"],
     /* "tutorial.html", "starting.html",
        "browsing.html", "buffer.html", "pattern.html", "options.html",
        "tabs.html", "hints.html", "map.html", "eval.html", "marks.html",
        "repeat.html", "autocommands.html", "print.html", "developer.html",
        "various.html"
        ],*/

    optionDefaults: {
        showtabline: 1,
    },

    scripts: [
        "addressbook.js",
        "mail.js",
        "tabs.js",
    ],

    init: function ()
    {
        // don't wait too long when selecting new messages
        // GetThreadTree()._selectDelay = 300; // TODO: make configurable

        // 0: never automatically edit externally
        // 1: automatically edit externally when message window is shown the first time
        // 2: automatically edit externally, once the message text gets focus (not working currently)
        options.add(["autoexternal", "ae"],
            "Edit message with external editor by default",
            "boolean", false);

        // load Muttator specific modules
        if (this.isComposeWindow)
        {
            this.features = ["addressbook"]; // the composer has no special features
            //liberator.loadModule("addressbook", Addressbook);

            // TODO: move mappings elsewhere, probably compose.js
            mappings.add([modes.COMPOSE],
                ["e"], "Edit message",
                function () { editor.editFieldExternally(); });

            mappings.add([modes.COMPOSE],
                ["y"], "Send message now",
                function () { window.goDoCommand("cmd_sendNow"); });

            mappings.add([modes.COMPOSE],
                ["Y"], "Send message later",
                function () { window.goDoCommand("cmd_sendLater"); });

            // FIXME: does not really work reliably
            mappings.add([modes.COMPOSE],
                ["t"], "Select To: field",
                function () { awSetFocus(0, awGetInputElement(1)); });

            mappings.add([modes.COMPOSE],
                ["s"], "Select Subject: field",
                function () { GetMsgSubjectElement().focus(); });

            mappings.add([modes.COMPOSE],
                ["i"], "Select message body",
                function () { SetMsgBodyFrameFocus(); });

            mappings.add([modes.COMPOSE],
                ["q"], "Close composer, ask when for unsaved changes",
                function () { DoCommandClose(); });

            mappings.add([modes.COMPOSE],
                ["Q", "ZQ"], "Force closing composer",
                function () { MsgComposeCloseWindow(true); /* cache window for better performance*/ });

            var stateListener =
            {
                QueryInterface: function (aIID)
                {
                    if (aIID.equals(Components.interfaces.nsIDocumentStateListener))
                        return this;
                    throw Components.results.NS_NOINTERFACE;
                },

                // this is (also) fired once the new compose window loaded the message for the first time
                NotifyDocumentStateChanged: function (nowDirty)
                {
                    // only edit with external editor if this window was not cached!
                    if (options["autoexternal"] && !window.messageWasEditedExternally/* && !gMsgCompose.recycledWindow*/)
                    {
                        window.messageWasEditedExternally = true;
                        editor.editFieldExternally();
                    }

                },
                NotifyDocumentCreated: function () {},
                NotifyDocumentWillBeDestroyed: function () {}
            };

            // XXX: Hack!
            window.document.addEventListener("load", function ()
            {
                if (window.messageWasEditedExternally === undefined)
                {
                    window.messageWasEditedExternally = false;
                    GetCurrentEditor().addDocumentStateListener(stateListener);
                }
            }, true);

            window.addEventListener("compose-window-close", function ()
            {
                window.messageWasEditedExternally = false;
            }, true);

            /*window.document.addEventListener("unload", function () {
                GetCurrentEditor().removeDocumentStateListener(config.stateListener);
            }, true);*/
        }
        else
        {
            liberator.loadModule("mail",        Mail);
            liberator.loadModule("addressbook", Addressbook);
            liberator.loadModule("tabs",        Tabs);
            liberator.loadModule("marks",       Marks);
            liberator.loadModule("hints",       Hints);
        }

        commands.add(["pref[erences]", "prefs"],
            "Show " + config.hostApplication + " preferences",
            function (args)
            {
                window.openOptionsDialog();
            },
            {
                argCount: "0"
            });
    }
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
