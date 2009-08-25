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

const config = (function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var name = "Muttator";
    var host = "Thunderbird";
    var tabmail;

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {
        /*** required options, no checks done if they really exist, so be careful ***/
        name: name,
        hostApplication: host, // TODO: can this be found out otherwise? gBrandBundle.getString("brandShortName");
                                        // Yes, but it will be localized unlike all other strings. So, it's best left until we i18n liberator. --djk
        get mainWindowId() this.isComposeWindow ? "msgcomposeWindow" : "messengerWindow",

        /*** optional options, there are checked for existence and a fallback provided  ***/
        features: ["hints", "mail", "marks", "addressbook", "tabs"],
        defaults: {
            guioptions: "frb",
            showtabline: 1,
            titlestring: name
        },

        guioptions: {
            m: ["MenuBar",            ["mail-toolbar-menubar2"]],
            T: ["Toolbar" ,           ["mail-bar2"]],
            f: ["Folder list",        ["folderPaneBox", "folderpane_splitter"]],
            F: ["Folder list header", ["folderPaneHeader"]]
        },

        get isComposeWindow() window.wintype == "msgcompose",
        get browserModes() [modes.MESSAGE],
        get mailModes() [modes.NORMAL],
        // focusContent() focuses this widget
        get mainWidget() this.isComposeWindow ? document.getElementById("content-frame") : GetThreadTree(),
        get visualbellWindow() document.getElementById(this.mainWindowId),
        styleableChrome: ["chrome://messenger/content/messenger.xul",
                          "chrome://messenger/content/messengercompose/messengercompose.xul"],

        autocommands: [["DOMLoad",         "Triggered when a page's DOM content has fully loaded"],
                       ["FolderLoad",      "Triggered after switching folders in " + host],
                       ["PageLoadPre",     "Triggered after a page load is initiated"],
                       ["PageLoad",        "Triggered when a page gets (re)loaded/opened"],
                       [name + "Enter",    "Triggered after " + host + " starts"],
                       [name + "Leave",    "Triggered before exiting " + host],
                       [name + "LeavePre", "Triggered before exiting " + host]],

        dialogs: [
            ["about",            "About " + host,
                function () { window.openAboutDialog(); }],
            ["addons",           "Manage Add-ons",
                function () { window.openAddonsMgr(); }],
            ["addressbook",      "Address book",
                function () { window.toAddressBook(); }],
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
            ["preferences",      "Show " + host + " preferences dialog",
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

        focusChange: function (win)
        {
            // we switch to -- MESSAGE -- mode for Muttator, when the main HTML widget gets focus
            if (win && win.document instanceof HTMLDocument || liberator.focus instanceof HTMLAnchorElement)
            {
                if (config.isComposeWindow)
                    modes.set(modes.INSERT, modes.TEXTAREA);
                else if (liberator.mode != modes.MESSAGE)
                    liberator.mode = modes.MESSAGE;
            }
        },

        getBrowser: function () {
            if (!tabmail)
            {
                tabmail = { __proto__: document.getElementById("tabmail") };
                tabmail.__defineGetter__("mTabContainer", function () this.tabContainer);
                tabmail.__defineGetter__("mTabs", function () this.tabContainer.childNodes);
                tabmail.__defineGetter__("mCurrentTab", function () this.tabContainer.selectedItem);
                tabmail.__defineGetter__("mStrip", function () this.tabStrip);
                tabmail.__defineGetter__("browsers", function () [browser for (browser in Iterator(this.mTabs))]);
            }
            return tabmail;
        },

        // they are sorted by relevance, not alphabetically
        helpFiles: ["intro.html", "version.html"],

        get ignoreKeys() {
            delete this.ignoreKeys;
            return this.ignoreKeys = {
                "<Return>": modes.NORMAL | modes.INSERT,
                "<Space>": modes.NORMAL | modes.INSERT,
                "<Up>": modes.NORMAL | modes.INSERT,
                "<Down>": modes.NORMAL | modes.INSERT
            }
        },

        modes: [
            ["MESSAGE", { char: "m" }],
            ["COMPOSE"]
        ],

        // NOTE: as I don't use TB I have no idea how robust this is. --djk
        get outputHeight()
        {
            if (!this.isComposeWindow)
            {
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

        scripts: [
            "addressbook.js",
            "compose/compose.js",
            "mail.js",
            "tabs.js"
        ],

        // to allow Vim to :set ft=mail automatically
        tempFile: "mutt-ator-mail",

        init: function ()
        {
            services.add("commandLineHandler", "@mozilla.org/commandlinehandler/general-startup;1?type=muttator",
                Ci.nsICommandLineHandler);

            // don't wait too long when selecting new messages
            // GetThreadTree()._selectDelay = 300; // TODO: make configurable

            // load Muttator specific modules
            if (this.isComposeWindow)
                // TODO: this should probably be "composer"
                liberator.loadModule("compose",      Compose);
            else
            {
                liberator.loadModule("mail",        Mail);
                liberator.loadModule("addressbook", Addressbook);
                liberator.loadModule("tabs",        Tabs);
                liberator.loadModule("marks",       Marks);
                liberator.loadModule("hints",       Hints);
            }

            ////////////////////////////////////////////////////////////////////////////////
            ////////////////////// STYLES //////////////////////////////////////////////////
            /////////////////////////////////////////////////////////////////////////////{{{

            let img = Image();
            img.src = "chrome://muttator/content/logo.png";
            img.onload = function () {
                styles.addSheet(true, "logo", "chrome://liberator/locale/*",
                    ".muttator-logo {" + <>
                         display:    inline-block;
                         background: url({img.src});
                         width:      {img.width}px;
                         height:     {img.height}px;
                    </> + "}",
                    true);
                delete img;
            };

            /////////////////////////////////////////////////////////////////////////////}}}
            ////////////////////// COMMANDS ////////////////////////////////////////////////
            /////////////////////////////////////////////////////////////////////////////{{{

            commands.add(["pref[erences]", "prefs"],
                "Show " + config.hostApplication + " preferences",
                function () { window.openOptionsDialog(); },
                { argCount: "0" });

            /////////////////////////////////////////////////////////////////////////////}}}
            ////////////////////// OPTIONS /////////////////////////////////////////////////
            /////////////////////////////////////////////////////////////////////////////{{{

            // FIXME: comment obviously incorrect
            // 0: never automatically edit externally
            // 1: automatically edit externally when message window is shown the first time
            // 2: automatically edit externally, once the message text gets focus (not working currently)
            options.add(["autoexternal", "ae"],
                "Edit message with external editor by default",
                "boolean", false);

            options.add(["online"],
                "Set the 'work offline' option",
                "boolean", true,
                {
                    setter: function (value)
                    {
                        if (MailOfflineMgr.isOnline() != value)
                            MailOfflineMgr.toggleOfflineStatus();
                        return value;
                    },
                    getter: function () MailOfflineMgr.isOnline()
                });

            //}}}
        }
    }; //}}}
})(); //}}}

// vim: set fdm=marker sw=4 ts=4 et:
