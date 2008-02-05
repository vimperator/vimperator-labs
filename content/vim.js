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

const vimperator = (function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    var callbacks = [];

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get mode()      { return vimperator.modes.main; },
        set mode(value) { vimperator.modes.main = value; },

        // Global constants
        CURRENT_TAB: 1,
        NEW_TAB: 2,
        NEW_BACKGROUND_TAB: 3,
        NEW_WINDOW: 4,

//        config: {
//            name: "Vimperator",
//            hostApplication: "Firefox",
//            dialogs: []
//        },

        // ###VERSION### and ###DATE### are replaced by the Makefile
        version: "###VERSION### (created: ###DATE###)",

        // TODO: move to events.js?
        input: {
            buffer: "",                // partial command storage
            pendingMotionMap: null,    // e.g. "d{motion}" if we wait for a motion of the "d" command
            pendingArgMap: null,       // pending map storage for commands like m{a-z}
            count: -1                  // parsed count from the input buffer
        },

        // @param type can be:
        //  "submit": when the user pressed enter in the command line
        //  "change"
        //  "cancel"
        //  "complete"
        //  TODO: "zoom": if the zoom value of the current buffer changed
        registerCallback: function (type, mode, func)
        {
            // TODO: check if callback is already registered
            callbacks.push([type, mode, func]);
        },

        triggerCallback: function (type, mode, data)
        {
            // dump("type: " + type + " mode: " + mode + "data: " + data  + "\n");
            for (var i in callbacks)
            {
                var [thistype, thismode, thisfunc] = callbacks[i];
                if (mode == thismode && type == thistype)
                    return thisfunc.call(this, data);
            }
            return false;
        },

        beep: function ()
        {
            if (vimperator.options["visualbell"])
            {
                // flash the visual bell
                var popup = document.getElementById("vimperator-visualbell");
                var win = getBrowser().mPanelContainer;
                var box = document.getBoxObjectFor(win);

                popup.height = box.height;
                popup.width = box.width;
                popup.openPopup(win, "overlap", 0, 0, false, false);
                setTimeout(function () { popup.hidePopup(); }, 50);
            }
            else
            {
                var soundService = Components.classes["@mozilla.org/sound;1"].
                                   getService(Components.interfaces.nsISound);
                soundService.beep();
            }
        },

        // XXX? move to vimperaotr.util?
        copyToClipboard: function (str, verbose)
        {
            var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                .getService(Components.interfaces.nsIClipboardHelper);
            clipboardHelper.copyString(str);

            if (verbose)
                vimperator.echo("Yanked " + str, vimperator.commandline.FORCE_SINGLELINE);
        },

        // Execute an ex command like str=":zoom 300"
        execute: function (str, modifiers)
        {
            // skip comments and blank lines
            if (/^\s*("|$)/.test(str))
                return;

            if (!modifiers)
                modifiers = {};

            var [count, cmd, special, args] = vimperator.commands.parseCommand(str.replace(/^'(.*)'$/, "$1"));
            var command = vimperator.commands.get(cmd);

            if (command === null)
            {
                vimperator.echoerr("E492: Not an editor command: " + str);
                vimperator.focusContent();
                return;
            }

            // TODO: need to perform this test? -- djk
            if (command.action === null)
            {
                vimperator.echoerr("E666: Internal error: command.action === null");
                return;
            }

            // valid command, call it:
            command.execute(args, special, count, modifiers);
        },

        // after pressing Escape, put focus on a non-input field of the browser document
        // if clearFocusedElement, also blur a focused link
        focusContent: function (clearFocusedElement)
        {
            var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
                     getService(Components.interfaces.nsIWindowWatcher);

            if (window == ww.activeWindow && document.commandDispatcher.focusedElement && clearFocusedElement)
                document.commandDispatcher.focusedElement.blur();

            var elem = vimperator.config.mainWidget || content;
            if (elem != document.commandDispatcher.focusedElement)
                elem.focus();
        },

        // partial sixth level expression evaluation
        eval: function (string)
        {
            string = string.toString().replace(/^\s*/, "").replace(/\s*$/, "");
            var matches = string.match(/^&(\w+)/);
            if (matches)
            {
                var opt = this.options.get(matches[1]);
                if (!opt)
                {
                    this.echoerr("E113: Unknown option: " + matches[1]);
                    return;
                }
                var type = opt.type;
                var value = opt.getter();
                if (type != "boolean" && type != "number")
                    value = value.toString();
                return value;
            }

            // String
            else if (matches = string.match(/^(['"])([^\1]*?[^\\]?)\1/))
            {
                if (matches)
                    return matches[2].toString();
                else
                {
                    this.echoerr("E115: Missing quote: " + string);
                    return;
                }
            }

            // Number
            else if (matches = string.match(/^(\d+)$/))
            {
                return parseInt(match[1], 10);
            }

            var reference = this.variableReference(string);
            if (!reference[0])
                this.echoerr("E121: Undefined variable: " + string);
            else
                return reference[0][reference[1]];

            return;
        },

        variableReference: function (string)
        {
            if (!string)
                return [null, null, null];

            var matches = string.match(/^([bwtglsv]):(\w+)/);
            if (matches) // Variable
            {
                // Other variables should be implemented
                if (matches[1] == "g")
                {
                    if (matches[2] in this.globalVariables)
                        return [this.globalVariables, matches[2], matches[1]];
                    else
                        return [null, matches[2], matches[1]];
                }
            }
            else // Global variable
            {
                if (string in this.globalVariables)
                    return [this.globalVariables, string, "g"];
                else
                    return [null, string, "g"];
            }
        },

        // logs a message to the javascript error console
        // if msg is an object, it is beautified
        log: function (msg, level)
        {
            //if (vimperator.options.getPref("verbose") >= level) // FIXME: hangs vimperator, probably timing issue --mst
            if (typeof msg == "object")
                msg = vimperator.util.objectToString(msg, false);

            var consoleService = Components.classes["@mozilla.org/consoleservice;1"].
                                 getService(Components.interfaces.nsIConsoleService);
            consoleService.logStringMessage("vimperator: " + msg);
        },

        // open one or more URLs
        //
        // @param urls: either a string or an array of urls
        //              The array can look like this:
        //              ["url1", "url2", "url3", ...] or:
        //              [["url1", postdata1], ["url2", postdata2], ...]
        // @param where: if ommited, CURRENT_TAB is assumed
        // @param callback: not implemented, will be allowed to specify a callback function
        //                  which is called, when the page finished loading
        // @returns true when load was initiated, or false on error
        open: function (urls, where, callback)
        {
            // convert the string to an array of converted URLs
            // -> see vimperator.util.stringToURLArray for more details
            if (typeof urls == "string")
                urls = vimperator.util.stringToURLArray(urls);

            if (urls.length == 0)
                return false;

            if (!where)
                where = vimperator.CURRENT_TAB;

            var url =   typeof urls[0] == "string" ? urls[0] : urls[0][0];
            var postdata = typeof urls[0] == "string" ? null : urls[0][1];
            var whichwindow = window;

            // decide where to load the first url
            switch (where)
            {
                case vimperator.CURRENT_TAB:
                    window.loadURI(url, null, postdata); // getBrowser.loadURI() did not work with postdata in my quick experiments --mst
                    break;

                case vimperator.NEW_TAB:
                    var firsttab = getBrowser().addTab(url, null, null, postdata);
                    getBrowser().selectedTab = firsttab;
                    break;

                case vimperator.NEW_BACKGROUND_TAB:
                    getBrowser().addTab(url, null, null, postdata);
                    break;

                case vimperator.NEW_WINDOW:
                    window.open();
                    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                               .getService(Components.interfaces.nsIWindowMediator);
                    whichwindow = wm.getMostRecentWindow("navigator:browser");
                    whichwindow.loadURI(url, null, postdata);
                    break;

                default:
                    vimperator.echoerr("Exxx: Invalid 'where' directive in vimperator.open(...)");
                    return false;
            }

            // all other URLs are always loaded in background
            for (var i = 1; i < urls.length; i++)
            {
                url =   typeof urls[i] == "string" ? urls[i] : urls[i][0];
                postdata = typeof urls[i] == "string" ? null : urls[i][1];
                whichwindow.getBrowser().addTab(url, null, null, postdata);
            }

            // TODO: register callbacks

            return true;
        },

        // quit vimperator, no matter how many tabs/windows are open
        quit: function (saveSession)
        {
            vimperator.autocommands.trigger("BrowserExit", "");

            if (saveSession)
                vimperator.options.setPref("browser.startup.page", 3); // start with saved session
            else
                vimperator.options.setPref("browser.startup.page", 1); // start with default homepage session

            goQuitApplication();
        },

        restart: function ()
        {
            vimperator.autocommands.trigger("BrowserRestart", "");

            const nsIAppStartup = Components.interfaces.nsIAppStartup;

            // notify all windows that an application quit has been requested.
            var os = Components.classes["@mozilla.org/observer-service;1"]
                .getService(Components.interfaces.nsIObserverService);
            var cancelQuit = Components.classes["@mozilla.org/supports-PRBool;1"]
                .createInstance(Components.interfaces.nsISupportsPRBool);
            os.notifyObservers(cancelQuit, "quit-application-requested", null);

            // something aborted the quit process.
            if (cancelQuit.data)
                return;

            // notify all windows that an application quit has been granted.
            os.notifyObservers(null, "quit-application-granted", null);

            // enumerate all windows and call shutdown handlers
            var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                .getService(Components.interfaces.nsIWindowMediator);
            var windows = wm.getEnumerator(null);
            while (windows.hasMoreElements())
            {
                var win = windows.getNext();
                if (("tryToClose" in win) && !win.tryToClose())
                    return;
            }
            Components.classes["@mozilla.org/toolkit/app-startup;1"].getService(nsIAppStartup)
                .quit(nsIAppStartup.eRestart | nsIAppStartup.eAttemptQuit);
        },

        startup: function ()
        {
            window.dump("Vimperator startup\n");
            vimperator.log("Initializing vimperator object...", 1);

            // these objects are created here only after the chrome is ready
            vimperator.log("Loading module options...", 3);
            vimperator.options       = vimperator.Options();
            vimperator.log("Loading module events...", 3);
            vimperator.events        = vimperator.Events();
            vimperator.log("Loading module commands...", 3);
            vimperator.commands      = vimperator.Commands();
            if (vimperator.Bookmarks)
            {
                vimperator.log("Loading module bookmarks...", 3);
                vimperator.bookmarks     = vimperator.Bookmarks();
            }
            if (vimperator.History)
            {
                vimperator.log("Loading module history...", 3);
                vimperator.history       = vimperator.History();
            }
            vimperator.log("Loading module commandline...", 3);
            vimperator.commandline   = vimperator.CommandLine();
            vimperator.log("Loading module search...", 3);
            vimperator.search        = vimperator.Search();
            vimperator.log("Loading module preview window...", 3);
            vimperator.previewwindow = vimperator.InformationList("vimperator-previewwindow", { incrementalFill: false, maxItems: 10 });
            vimperator.log("Loading module buffer window...", 3);
            vimperator.bufferwindow  = vimperator.InformationList("vimperator-bufferwindow", { incrementalFill: false, maxItems: 10 });
            vimperator.log("Loading module mappings...", 3);
            vimperator.mappings      = vimperator.Mappings();
            vimperator.log("Loading module statusline...", 3);
            vimperator.statusline    = vimperator.StatusLine();
            vimperator.log("Loading module buffer...", 3);
            vimperator.buffer        = vimperator.Buffer();
            vimperator.log("Loading module editor...", 3);
            vimperator.editor        = vimperator.Editor();
            if (vimperator.Tabs)
            {
                vimperator.log("Loading module tabs...", 3);
                vimperator.tabs          = vimperator.Tabs();
            }
            if (vimperator.Marks)
            {
                vimperator.log("Loading module marks...", 3);
                vimperator.marks         = vimperator.Marks();
            }
            if (vimperator.QuickMarks)
            {
                vimperator.log("Loading module quickmarks...", 3);
                vimperator.quickmarks    = vimperator.QuickMarks();
            }
            vimperator.log("Loading module hints...", 3);
            vimperator.hints         = vimperator.Hints();
            vimperator.log("Loading module autocommands...", 3);
            vimperator.autocommands  = vimperator.AutoCommands();
            vimperator.log("Loading module io...", 3);
            vimperator.io            = vimperator.IO();
            vimperator.log("Loading module completion...", 3);
            vimperator.completion    = vimperator.Completion();
            vimperator.log("All modules loaded", 3);

            // we define some shortcuts to functions which are used often
            vimperator.echo    = function (str, flags) { vimperator.commandline.echo(str, vimperator.commandline.HL_NORMAL, flags); };
            vimperator.echoerr = function (str, flags) { vimperator.commandline.echo(str, vimperator.commandline.HL_ERRORMSG, flags); };

            vimperator.globalVariables = {};

            // namespace for plugins/scripts. Actually (only) the active plugin must/can set a
            // v.plugins.mode = <str> string to show on v.modes.CUSTOM
            // v.plugins.stop = <func> hooked on a v.modes.reset() 
            // v.plugins.onEvent = <func> function triggered, on keypresses (unless <esc>) (see events.js)
            vimperator.plugins = {};

            // TODO: move elsewhere
            vimperator.registerCallback("submit", vimperator.modes.EX, function (command) { vimperator.execute(command); });
            vimperator.registerCallback("complete", vimperator.modes.EX, function (str) { return vimperator.completion.exTabCompletion(str); });

            // first time intro message
            if (vimperator.options.getPref("extensions.vimperator.firsttime", true))
            {
                setTimeout(function () {
                    vimperator.commands.help();
                    vimperator.options.setPref("extensions.vimperator.firsttime", false);
                }, 1000);
            }

            // disable caret browsing initially
            //vimperator.options.setFirefoxPref("accessibility.browsewithcaret", false);
            //vimperator.focusContent();

            // always start in normal mode
            vimperator.modes.reset();

            // finally, read a ~/.vimperatorrc
            // make sourcing asynchronous, otherwise commands that open new tabs won't work
            setTimeout(function () {

                var rcFile = vimperator.io.getRCFile();
                if (rcFile)
                    vimperator.io.source(rcFile.path, true);
                else
                    vimperator.log("No user RC file found", 3);

                // also source plugins in ~/.vimperator/plugin/
                try
                {
                    var pluginDir = vimperator.io.getSpecialDirectory("plugin");
                    if (pluginDir)
                    {
                        var files = vimperator.io.readDirectory(pluginDir.path);
                        vimperator.log("Sourcing plugin directory...", 3);
                        files.forEach(function (file) {
                            if (!file.isDirectory() && /\.(js|vimp)$/i.test(file.path))
                                vimperator.io.source(file.path, false);
                        });
                    }
                    else
                    {
                        vimperator.log("No user plugin directory found", 3);
                    }
                }
                catch (e)
                {
                    // thrown if directory does not exist
                    //vimperator.log("Error sourcing plugin directory: " + e);
                }

                // after sourcing the initialization files, this function will set
                // all gui options to their default values, if they have not been
                // set before by any rc file
                vimperator.options.setInitialGUI();
            }, 0);

            vimperator.statusline.update();
            vimperator.log("Vimperator fully initialized", 1);
        },

        shutdown: function ()
        {
            window.dump("Vimperator shutdown\n");

            // save our preferences
            vimperator.commandline.destroy();
            vimperator.quickmarks.destroy();
            vimperator.options.destroy();
            vimperator.events.destroy();

            window.dump("All vimperator modules destroyed\n");
        },

        sleep: function (ms)
        {
            var threadManager = Components.classes["@mozilla.org/thread-manager;1"].
                                getService(Components.interfaces.nsIThreadManager);
            var mainThread = threadManager.mainThread;

            var then = new Date().getTime(), now = then;
            for (; now - then < ms; now = new Date().getTime())
                mainThread.processNextEvent(true);
        },

        get windows()
        {
            var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                     .getService(Components.interfaces.nsIWindowMediator);
            var wa = [];
            var enumerator = wm.getEnumerator("navigator:browser");
            while (enumerator.hasMoreElements())
                wa.push(enumerator.getNext());
            return wa;
        },

        // be sure to call GUI related methods like alert() or dump() ONLY in the main thread
        callFunctionInThread: function (thread, func, args)
        {
            function CallbackEvent(func, args)
            {
                if (!(args instanceof Array))
                    args = [];

                return {
                    QueryInterface: function (iid)
                    {
                        if (iid.equals(Components.interfaces.nsIRunnable) ||
                            iid.equals(Components.interfaces.nsISupports))
                            return this;
                        throw Components.results.NS_ERROR_NO_INTERFACE;
                    },

                    run: function ()
                    {
                        func.apply(window, args);
                    }
                };
            }

            if (!thread)
                thread = Components.classes["@mozilla.org/thread-manager;1"].getService().newThread(0);

            // DISPATCH_SYNC is necessary, otherwise strange things will happen
			thread.dispatch(new CallbackEvent(func, args), thread.DISPATCH_SYNC);
        }

    }; //}}}
})(); //}}}

// called when the chrome is fully loaded and before the main window is shown
window.addEventListener("load",   vimperator.startup,  false);
window.addEventListener("unload", vimperator.shutdown, false);

// vim: set fdm=marker sw=4 ts=4 et:
