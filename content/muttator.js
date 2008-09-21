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
    name: "Muttator",
    hostApplication: "Thunderbird", // TODO: can this be found out otherwise? gBrandBundle.getString("brandShortName");

    /*** optional options, there are checked for existance and a fallback provided  ***/
    features: ["hints", "mail", "marks", "addressbook", "tabs"],
    defaults: { guioptions: "f" },
    guioptions: { m: ["mail-toolbar-menubar2"], T: ["mail-bar2"], f: ["folderPaneBox", "folderpane_splitter"], F: ["folderPaneHeader"] },

    get browserModes() { return [liberator.modes.MESSAGE]; },
    get mainWidget() { // focusContent() focuses this widget
        return this.isComposeWindow ?
               document.getElementById("content-frame") :
               GetThreadTree();
    },
    get mainWindowID() { return this.isComposeWindow ? "msgcomposeWindow" : "messengerWindow"; },
    get visualbellWindow() { return document.getElementById(this.mainWindowID); },
    isComposeWindow: false,

    autocommands: [["FolderLoaded",  "Triggered after switching folders in Thunderbird"],
                   ["PageLoadPre",   "Triggered after a page load is initiated"],
                   ["PageLoad",      "Triggered when a page gets (re)loaded/opened"],
                   ["MuttatorEnter", "Triggered after Thunderbird starts"],
                   ["MuttatorLeave", "Triggered before exiting Thunderbird"],
                   ["MuttatorLeavePre", "Triggered before exiting Thunderbird"]],

    dialogs: [
        ["about",            "About Thunderbird",
            function () { openAboutDialog(); }],
        ["addons",           "Manage Add-ons",
            function () { openAddonsMgr(); }],
        ["addressbook",      "Address book",
            function () { toAddressBook(); }],
        ["checkupdates",     "Check for updates",
            function () { checkForUpdates(); }],
        /*["cleardata",        "Clear private data",
         function () { Components.classes[GLUE_CID].getService(Components.interfaces.nsIBrowserGlue).sanitize(window || null); }],*/
        ["console",          "JavaScript console",
            function () { toJavaScriptConsole(); }],
        /*["customizetoolbar", "Customize the Toolbar",
            function () { BrowserCustomizeToolbar(); }],*/
        ["dominspector",     "DOM Inspector",
            function () { inspectDOMDocument(content.document); }],
        ["downloads",        "Manage Downloads",
            function () { toOpenWindowByType('Download:Manager', 'chrome://mozapps/content/downloads/downloads.xul', 'chrome,dialog=no,resizable'); }],
        /*["import",           "Import Preferences, Bookmarks, History, etc. from other browsers",
            function () { BrowserImport(); }],
        ["openfile",         "Open the file selector dialog",
            function () { BrowserOpenFileWindow(); }],
        ["pageinfo",         "Show information about the current page",
            function () { BrowserPageInfo(); }],
        ["pagesource",       "View page source",
            function () { BrowserViewSourceOfDocument(content.document); }],
        ["preferences",      "Show Firefox preferences dialog",
            function () { openPreferences(); }],
        ["printpreview",     "Preview the page before printing",
            function () { PrintUtils.printPreview(onEnterPrintPreview, onExitPrintPreview); }],*/
        ["printsetup",       "Setup the page size and orientation before printing",
            function () { PrintUtils.showPageSetup(); }],
        ["print",            "Show print dialog",
            function () { PrintUtils.print(); }],
        ["saveframe",        "Save frame to disk",
            function () { saveFrameDocument(); }],
        ["savepage",         "Save page to disk",
            function () { saveDocument(window.content.document); }],
        /*["searchengines",    "Manage installed search engines",
            function () { openDialog("chrome://browser/content/search/engineManager.xul", "_blank", "chrome,dialog,modal,centerscreen"); }],
        ["selectionsource",  "View selection source",
            function () { liberator.buffer.viewSelectionSource(); }]*/
    ],

    // they are sorted by relevance, not alphabetically
    helpFiles: ["intro.html"],/* "tutorial.html", "starting.html",
        "browsing.html", "buffer.html", "pattern.html", "options.html",
        "tabs.html", "hints.html", "map.html", "eval.html", "marks.html",
        "repeat.html", "autocommands.html", "print.html", "developer.html",
        "various.html"
        ],*/

    init: function ()
    {
        // don't wait too long when selecting new messages
        // GetThreadTree()._selectDelay = 300; // TODO: make configurable
        this.isComposeWindow = window.wintype == "msgcompose";

        // 0: never automatically edit externally
        // 1: automatically edit externally when message window is shown the first time
        // 2: automatically edit externally, once the message text gets focus (not working currently)
        liberator.options.add(["autoexternal", "ae"],
            "Edit message with external editor by default",
            "boolean", false);

        // load Muttator specific modules
        if (this.isComposeWindow)
        {
            this.features = ["addressbook"]; // the composer has no special features
            //liberator.loadModule("addressbook", liberator.Addressbook);

            // TODO: move mappings elsewhere, probably compose.js
            liberator.mappings.add([liberator.modes.COMPOSE],
                ["e"], "Edit message",
                function () { liberator.editor.editWithExternalEditor(); });

            liberator.mappings.add([liberator.modes.COMPOSE],
                ["y"], "Send message now",
                function () { goDoCommand("cmd_sendNow"); });

            liberator.mappings.add([liberator.modes.COMPOSE],
                ["Y"], "Send message later",
                function () { goDoCommand("cmd_sendLater"); });

            // FIXME: does not really work reliably
            liberator.mappings.add([liberator.modes.COMPOSE],
                ["t"], "Select To: field",
                function () { awSetFocus(0, awGetInputElement(1)); });

            liberator.mappings.add([liberator.modes.COMPOSE],
                ["s"], "Select Subject: field",
                function () { GetMsgSubjectElement().focus(); });

            liberator.mappings.add([liberator.modes.COMPOSE],
                ["i"], "Select message body",
                function () { SetMsgBodyFrameFocus(); });

            liberator.mappings.add([liberator.modes.COMPOSE],
                ["q"], "Close composer, ask when for unsaved changes",
                function () { DoCommandClose(); });

            liberator.mappings.add([liberator.modes.COMPOSE],
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
                    if (liberator.options["autoexternal"] && !window.messageWasEditedExternally/* && !gMsgCompose.recycledWindow*/)
                    {
                        window.messageWasEditedExternally = true;
                        liberator.editor.editWithExternalEditor();
                    }

                },
                NotifyDocumentCreated: function () {},
                NotifyDocumentWillBeDestroyed: function () {}
            };

            // XXX: Hack!
            window.document.addEventListener("load", function ()
            {
                if (typeof(window.messageWasEditedExternally) == "undefined")
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
                GetCurrentEditor().removeDocumentStateListener(liberator.config.stateListener);
            }, true);*/

        }
        else
        {
            liberator.loadModule("mail",        liberator.Mail);
            liberator.loadModule("addressbook", liberator.Addressbook);
            liberator.loadModule("tabs",        liberator.Tabs);
            liberator.loadModule("marks",       liberator.Marks);
            liberator.loadModule("hints",       liberator.Hints);
        }
    }
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
