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

/** @scope modules */

/**
 * @instance browser
 */
function Browser() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

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

    /////////////////////////////////////////////////////////////////////////////}}}
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

    mappings.add([modes.NORMAL], ["w"],
        "Open one or more URLs in a new window",
        function () { commandline.open(":", "winopen ", modes.EX); });

    mappings.add([modes.NORMAL], ["W"],
        "Open one or more URLs in a new window, based on current location",
        function () { commandline.open(":", "winopen " + buffer.URL, modes.EX); });

    mappings.add([modes.NORMAL],
        ["<C-a>"], "Increment last number in URL",
        function (count) { incrementURL(Math.max(count, 1)); },
        { count: true });

    mappings.add([modes.NORMAL],
        ["<C-x>"], "Decrement last number in URL",
        function (count) { incrementURL(-Math.max(count, 1)); },
        { count: true });

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
        { count: true });

    mappings.add([modes.NORMAL], ["gU"],
        "Go to the root of the website",
        function ()
        {
            let uri = content.document.location;
            if (/(about|mailto):/.test(uri.protocol)) // exclude these special protocols for now
                return void liberator.beep();
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
                liberator.open(args.string);
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

    commands.add(["redr[aw]"],
        "Redraw the screen",
        function ()
        {
            let wu = window.QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIDOMWindowUtils);
            wu.redraw();
            modes.show();
        },
        { argCount: "0" });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["encoding", "enc"],
        "Sets the current buffer's character encoding",
        "string", "UTF-8",
        {
            scope: options.OPTION_SCOPE_LOCAL,
            getter: function () getBrowser().docShell.QueryInterface(Ci.nsIDocCharset).charset,
            setter: function (val)
            {
                // Stolen from browser.jar/content/browser/browser.js, more or less.
                try
                {
                    var docCharset = getBrowser().docShell.QueryInterface(Ci.nsIDocCharset).charset = val
                    PlacesUtils.history.setCharsetForURI(getWebNavigation().currentURI, val);
                    getWebNavigation().reload(Ci.nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE);
                }
                catch (e) { liberator.reportError(e); }
            },
            completer: function (context) completion.charset(context),
            validator: Option.validateCompleter
        });

    options.add(["online"],
        "Set the 'work offline' option",
        "boolean", true,
        {
            setter: function (value)
            {
                const ioService = services.get("io");
                if (ioService.offline == value)
                    BrowserOffline.toggleOfflineStatus();
                return value;
            },
            getter: function () !services.get("io").offline
        });

    // only available in FF 3.5
    services.add("privateBrowsing", "@mozilla.org/privatebrowsing;1", Ci.nsIPrivateBrowsingService);
    if (services.get("privateBrowsing"))
    {
        options.add(["private", "pornmode"],
            "Set the 'private browsing' option",
            "boolean", false,
            {
                setter: function (value) services.get("privateBrowsing").privateBrowsingEnabled = value,
                getter: function () services.get("privateBrowsing").privateBrowsingEnabled,
            });
        let services = modules.services; // Storage objects are global to all windows, 'modules' isn't.
        storage.newObject("private-mode", function () {
            ({
                init: function () {
                    services.get("observer").addObserver(this, "private-browsing", false);
                    services.get("observer").addObserver(this, "quit-application", false);
                    this.private = services.get("privateBrowsing").privateBrowsingEnabled;
                },
                observe: function (subject, topic, data) {
                    if (topic == "private-browsing") {
                        if (data == "enter")
                            storage.privateMode = true;
                        else if (data == "exit")
                            storage.privateMode = false;
                        storage.fireEvent("private-mode", "change", storage.privateMode);
                    } else if (topic == "quit-application") {
                        services.get("observer").removeObserver(this, "quit-application");
                        services.get("observer").removeObserver(this, "private-browsing");
                    }
                },
            }).init();
        }, false);
        storage.addObserver("private-mode",
            function (key, event, value) {
                autocommands.trigger("PrivateMode", { state: value });
            }, window);
    }

    options.add(["urlseparator"],
        "Set the separator regexp used to separate multiple URL args",
        "string", ",\\s");

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
                liberator.open(args.string);
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

    commands.add(["redr[aw]"],
        "Redraw the screen",
        function ()
        {
            let wu = window.QueryInterface(Ci.nsIInterfaceRequestor)
                           .getInterface(Ci.nsIDOMWindowUtils);
            wu.redraw();
            modes.show();
        },
        { argCount: "0" });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["encoding", "enc"],
        "Sets the current buffer's character encoding",
        "string", "UTF-8",
        {
            scope: options.OPTION_SCOPE_LOCAL,
            getter: function () getBrowser().docShell.QueryInterface(Ci.nsIDocCharset).charset,
            setter: function (val)
            {
                // Stolen from browser.jar/content/browser/browser.js, more or less.
                try
                {
                    var docCharset = getBrowser().docShell.QueryInterface(Ci.nsIDocCharset).charset = val
                    PlacesUtils.history.setCharsetForURI(getWebNavigation().currentURI, val);
                    getWebNavigation().reload(Ci.nsIWebNavigation.LOAD_FLAGS_CHARSET_CHANGE);
                }
                catch (e) { liberator.reportError(e); }
            },
            completer: function (context) completion.charset(context),
            validator: Option.validateCompleter
        });

    options.add(["urlseparator"],
        "Set the separator regexp used to separate multiple URL args",
        "string", ",\\s");

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {
        // TODO: extract browser-specific functionality from liberator
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
