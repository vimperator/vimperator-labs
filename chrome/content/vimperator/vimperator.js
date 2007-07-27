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

(c) 2006-2007: Martin Stubenschrott <stubenschrott@gmx.net>

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

const vimperator = (function() //{{{
{
	////////////////////////////////////////////////////////////////////////////////
	////////////////////// PRIVATE SECTION /////////////////////////////////////////
	/////////////////////////////////////////////////////////////////////////////{{{

    var modes = {
        // main modes
        NONE:             0,
        NORMAL:           1 << 0,
        INSERT:           1 << 1,
        VISUAL:           1 << 2,
        HINTS:            1 << 3,
        COMMAND_LINE:     1 << 4,
        // extended modes
        EX:               1 << 10,
        READ_MULTLINE:    1 << 11,
        SEARCH_FORWARD:   1 << 12,
        SEARCH_BACKWARD:  1 << 13,
        ESCAPE_ONE_KEY:   1 << 14,
        ESCAPE_ALL_KEYS:  1 << 15,
        QUICK_HINT:       1 << 16,
        EXTENDED_HINT:    1 << 17,
        ALWAYS_HINT:      1 << 18
    }

    var mode_messages = {};
    mode_messages[modes.NORMAL]          = "";
    mode_messages[modes.INSERT]          = "INSERT";
    mode_messages[modes.VISUAL]          = "VISUAL";
    mode_messages[modes.HINTS]           = "HINTS";
    mode_messages[modes.ESCAPE_ONE_KEY]  = "escape one key";
    mode_messages[modes.ESCAPE_ALL_KEYS] = "escape all keys";
    mode_messages[modes.ESCAPE_ONE_KEY | modes.ESCAPE_ALL_KEYS] = "pass one key";
    mode_messages[modes.QUICK_HINT]      = "quick";
    mode_messages[modes.EXTENDED_HINT]   = "extended";
    mode_messages[modes.ALWAYS_HINT]     = "always";

    var mode = modes.NORMAL;
    var extended_mode = modes.NONE;

	var callbacks = [];

    var popup_allowed_events; // need to change and reset this firefox pref XXX: move to options class

    // our services
    var sound_service = Components.classes['@mozilla.org/sound;1']
        .getService(Components.interfaces.nsISound);
    var console_service = Components.classes['@mozilla.org/consoleservice;1']
        .getService(Components.interfaces.nsIConsoleService);
    var environment_service = Components.classes["@mozilla.org/process/environment;1"]
        .getService(Components.interfaces.nsIEnvironment);

    function showMode()
    {
        if (!vimperator.options["showmode"])
            return;

        var str_mode = mode_messages[mode];
        var str_extended = mode_messages[extended_mode];
        if (!str_mode && !str_extended)
        {
            vimperator.echo("");
            return;
        }

        if (str_mode && str_extended)
            str_extended = " (" + str_extended + ")";
        else
        {
            str_extended = "(" + str_extended + ")";
            str_mode = "";
        }

        vimperator.echo("-- " + str_mode + str_extended + " --");
    }

	/////////////////////////////////////////////////////////////////////////////}}}
	////////////////////// PUBLIC SECTION //////////////////////////////////////////
	/////////////////////////////////////////////////////////////////////////////{{{

    return {

        modes: modes,

        //openflags: { // XXX: maybe move these consts in a subnamespace?
        CURRENT_TAB: 1,
        NEW_TAB: 2,
        NEW_BACKGROUND_TAB: 3,
        //},

        // ###VERSION### and ###DATE### are replaced by the Makefile
        version: "###VERSION### CVS (created: ###DATE###)",

        input: {
            buffer: "",                // partial command storage
            pendingMap: null,          // pending map storage
            count: -1                  // parsed count from the input buffer
        },

        /**
         * @param type Can be:
         *  "submit": when the user pressed enter in the command line
         *  "change"
         *  "cancel"
         *  "complete"
         */
        registerCallback: function(type, mode, func)
        {
            // TODO: check if callback is already registered
            callbacks.push([type, mode, func]);
        },

        triggerCallback: function(type, data)
        {
            for (var i in callbacks)
            {
                var [thistype, thismode, thisfunc] = callbacks[i];
                if (vimperator.hasMode(thismode) && type == thistype)
                    return thisfunc.call(this, data);
            }
            return false;
        },

        getMode: function()
        {
            return [mode, extended_mode];
        },

        // set current mode
        // use "null" if you only want to set one of those modes
        setMode: function(main, extended, silent)
        {
            // if a main mode is set, the extended is always cleared
            if (main)
            {
                mode = main;
                extended_mode = this.modes.NONE;
            }
            if (typeof extended === "number")
                extended_mode = extended;

            if (!silent)
                showMode();
        },

        // returns true if "whichmode" is found in either the main or
        // extended mode
        hasMode: function(whichmode)
        {
            return ((mode & whichmode) || (extended_mode & whichmode) > 0) ? true : false;
        },

        addMode: function(main, extended)
        {
            if (main)
                mode |= main;
            if (extended)
                extended_mode |= extended;

            showMode();
        },

        // always show the new mode in the statusline
        removeMode: function(main, extended)
        {
            if (main)
                mode = (mode | main) ^ main;
            if (extended)
                extended_mode = (extended_mode | extended) ^ extended;

            showMode();
        },

        beep: function()
        {
            if (vimperator.options["beep"])
                sound_service.beep();
        },

        // After pressing Escape, put focus on a non-input field of the browser document
        focusContent: function()
        {
            var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
                     getService(Components.interfaces.nsIWindowWatcher);

            if (window == ww.activeWindow && document.commandDispatcher.focusedElement)
                document.commandDispatcher.focusedElement.blur();

            content.focus();
        },

        /**
         * logs a message to the javascript error console
         */
        log: function(msg, level)
        {
            // if (Options.getPref("verbose") >= level) // FIXME: hangs vimperator, probably timing issue --mst
                console_service.logStringMessage('vimperator: ' + msg);
        },

        /**
         * logs an object to the javascript error console also prints all
         * properties of the object
         */
        logObject: function(object, level)
        {
            if (typeof object != 'object')
                return false;

            var string = object + '::\n';
            for (var i in object)
            {
                var value;
                try {
                    var value = object[i];
                } catch (e) { value = '' }

                string += i + ': ' + value + '\n';
            }
            this.log(string, level);
        },

        // open one or more URLs
        //
        // @param urls: either a string or an array of urls
        // @param where: if ommited, CURRENT_TAB is assumed
        // @param callback: not implmented, will be allowed to specifiy a callback function
        //                  which is called, when the page finished loading
        // @returns true when load was initiated, or false on error
        open: function(urls, where, callback)
        {
            // convert the string to an array of converted URLs
            // -> see String.prototype.toURLArray for more details
            if (typeof urls == "string")
                urls = urls.toURLArray();

            if (urls.length == 0)
                return false;

            if (!where)
                where = vimperator.CURRENT_TAB;

            // decide where to load the first tab
            if (where == vimperator.CURRENT_TAB)
                getBrowser().loadURI(urls[0]);
            else if (where == vimperator.NEW_TAB)
            {
                var firsttab = getBrowser().addTab(urls[0]);
                getBrowser().selectedTab = firsttab;
            }
            else if (where == vimperator.NEW_BACKGROUND_TAB)
            {
                getBrowser().addTab(urls[0]);
            }
            else
            {
                vimperator.echoerr("Exxx: Invalid where directive in vimperator.open(...)");
                return false;
            }

            // all other URLs are always loaded in background
            for (var url=1; url < urls.length; url++)
                getBrowser().addTab(urls[url]);

            // TODO: register callbacks

            return true;
        },

        // quit vimperator, no matter how many tabs/windows are open
        quit: function(save_session)
        {
            if (save_session)
                Options.setFirefoxPref("browser.startup.page", 3); // start with saved session
            else
                Options.setFirefoxPref("browser.startup.page", 1); // start with default homepage session

            goQuitApplication();
        },

        restart: function()
        {
            // if (!arguments[1]) return;
            const nsIAppStartup = Components.interfaces.nsIAppStartup;

            // Notify all windows that an application quit has been requested.
            var os = Components.classes["@mozilla.org/observer-service;1"]
                .getService(Components.interfaces.nsIObserverService);
            var cancelQuit = Components.classes["@mozilla.org/supports-PRBool;1"]
                .createInstance(Components.interfaces.nsISupportsPRBool);
            os.notifyObservers(cancelQuit, "quit-application-requested", null);

            // Something aborted the quit process.
            if (cancelQuit.data)
                return;

            // Notify all windows that an application quit has been granted.
            os.notifyObservers(null, "quit-application-granted", null);

            // Enumerate all windows and call shutdown handlers
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

        // TODO: allow callback for filtering out unwanted frames? User defined?
        shiftFrameFocus: function(count, forward)
        {
            try
            {
                var frames = [];

                // find all frames - depth-first search
                (function(frame)
                {
                    if (frame.document.body.localName.toLowerCase() == "body")
                        frames.push(frame);
                    for (var i = 0; i < frame.frames.length; i++)
                        arguments.callee(frame.frames[i])
                })(window.content);

                if (frames.length == 0) // currently top is always included
                    return;

                // remove all unfocusable frames
                // TODO: find a better way to do this
                var start = document.commandDispatcher.focusedWindow;
                frames = frames.filter(function(frame) {
                        frame.focus();
                        if (document.commandDispatcher.focusedWindow == frame)
                            return frame;
                });
                start.focus();

                // find the currently focused frame index
                // TODO: If the window is a frameset then the first _frame_ should be
                //       focused.  Since this is not the current FF behaviour,
                //       we initalise current to -1 so the first call takes us to the
                //       first frame.
                var current = -1;
                for (var i = 0; i < frames.length; i++)
                {
                    if (frames[i] == document.commandDispatcher.focusedWindow)
                    {
                        var current = i;
                        break;
                    }
                }

                // calculate the next frame to focus
                var next = current;
                if (forward)
                {
                    if (count > 1)
                        next = current + count;
                    else
                        next++;

                    if (next > frames.length - 1)
                        next = frames.length - 1;
                }
                else
                {
                    if (count > 1)
                        next = current - count;
                    else
                        next--;

                    if (next < 0)
                        next = 0;
                }

                // focus next frame and scroll into view
                frames[next].focus();
                if (frames[next] != window.content)
                    frames[next].frameElement.scrollIntoView(false);

                // add the frame indicator
                var doc = frames[next].document;
                var indicator = doc.createElement("div");
                indicator.id = "vimperator-frame-indicator";
                // NOTE: need to set a high z-index - it's a crapshoot!
                var style = "background-color: red; opacity: 0.5; z-index: 999;" +
                            "position: fixed; top: 0; bottom: 0; left: 0; right: 0;";
                indicator.setAttribute("style", style);
                doc.body.appendChild(indicator);

                // remove the frame indicator
                setTimeout(function() { doc.body.removeChild(indicator); }, 500);
            }
            catch (e)
            {
                //vimperator.echoerr(e);
                // FIXME: fail silently here for now
            }
        },

        source: function(filename, silent)
        {
            if (!filename)
                return;

            // convert "~" to HOME on Windows
            if (navigator.platform == "Win32")
            {
                // TODO: proper pathname separator translation like Vim
                filename = filename.replace('/', '\\', 'g');
                var matches = filename.match(/^~(.*)/)
                if (matches)
                {
                    var home_dir = environment_service.get("HOME");
                    if (!home_dir)
                        home_dir = environment_service.get("USERPROFILE");
                    if (!home_dir)
                    {
                        // TODO: are these guaranteed to be set?
                        home_dir = environment_service.get("HOMEDRIVE") + environment_service.get("HOMEPATH");
                    }
                    filename = home_dir + "\\" + matches[1];
                }
            }

            try
            {
                var fd = fopen(filename, "<");
                if (!fd)
                    return;

                var s = fd.read();
                fd.close();

                var prev_match = new Array(5);
                var heredoc = '';
                var end = false;
                s.split('\n').forEach(function(line) {
                    [prev_match, heredoc, end] = multiliner(line, prev_match, heredoc);
                });
            }
            catch (e)
            {
                if (!silent)
                    vimperator.echoerr(e);
            }
        },

        startup: function()
        {
            window.dump("Vimperator startup\n");
            vimperator.log("Initializing vimperator object...", 1);

            // these objects are created here only after the chrome is ready
            vimperator.log("Loading module options...", 3);
            vimperator.options       = new Options();
            vimperator.log("Loading module events...", 3);
            vimperator.events        = new Events();
            vimperator.log("Loading module commands...", 3);
            vimperator.commands      = new Commands();
            vimperator.log("Loading module bookmarks...", 3);
            vimperator.bookmarks     = new Bookmarks();
            vimperator.log("Loading module history...", 3);
            vimperator.history       = new History();
            vimperator.log("Loading module commandline...", 3);
            vimperator.commandline   = new CommandLine();
            vimperator.log("Loading module search...", 3);
            vimperator.search        = new Search();
            vimperator.log("Loading module preview window...", 3);
            vimperator.previewwindow = new InformationList("vimperator-previewwindow", { incremental_fill: false, max_items: 10 });
            vimperator.log("Loading module buffer window...", 3);
            vimperator.bufferwindow  = new InformationList("vimperator-bufferwindow", { incremental_fill: false, max_items: 10 });
            vimperator.log("Loading module mappings...", 3);
            vimperator.mappings      = new Mappings();
            vimperator.log("Loading module statusline...", 3);
            vimperator.statusline    = new StatusLine();
            vimperator.log("Loading module tabs...", 3);
            vimperator.tabs          = new Tabs();
            vimperator.log("Loading module marks...", 3);
            vimperator.marks         = new Marks();
            vimperator.log("Loading module quickmarks...", 3);
            vimperator.quickmarks    = new QuickMarks();
            vimperator.log("Loading module hints...", 3);
            vimperator.hints         = new Hints();
            vimperator.log("All modules loaded", 3);

            vimperator.echo    = vimperator.commandline.echo;
            vimperator.echoerr = vimperator.commandline.echoErr;

            // XXX: move elsewhere
            vimperator.registerCallback("submit", vimperator.modes.EX, function(command) { /*vimperator.*/execute(command); } );
            vimperator.registerCallback("complete", vimperator.modes.EX, function(str) { return exTabCompletion(str); } );

            // work around firefox popup blocker
            popup_allowed_events = Options.getFirefoxPref('dom.popup_allowed_events', 'change click dblclick mouseup reset submit');
            if (!popup_allowed_events.match("keypress"))
                Options.setFirefoxPref('dom.popup_allowed_events', popup_allowed_events + " keypress");

            // we have our own typeahead find implementation
            Options.setFirefoxPref('accessibility.typeaheadfind.autostart', false);
            Options.setFirefoxPref('accessibility.typeaheadfind', false); // actually the above setting should do it, but has no effect in firefox

            // first time intro message
            if (Options.getPref("firsttime", true))
            {
                setTimeout(function() {
                    vimperator.help(null, null, null, { inTab: true });
                    Options.setPref("firsttime", false);
                }, 1000);
            }

            //gURLBar.blur(); // TODO: needed anymore?
            vimperator.focusContent();

            // firefox preferences which we need to be changed to work well with vimperator
            Options.setFirefoxPref("browser.startup.page", 3); // start with saved session

            // Finally, read a ~/.vimperatorrc
            // Make sourcing asynchronous, otherwise commands that open new tabs won't work
            setTimeout(function() {
                vimperator.source("~/.vimperatorrc", true);
                vimperator.log("~/.vimperatorrc sourced", 1);
            }, 50);

            vimperator.log("Vimperator fully initialized", 1);
        },

        shutdown: function()
        {
            window.dump("Vimperator shutdown\n");

            /*** save our preferences ***/
            vimperator.commandline.destroy();
            vimperator.events.destroy();
            vimperator.quickmarks.destroy();

            // reset some modified firefox prefs
            if (Options.getFirefoxPref('dom.popup_allowed_events', 'change click dblclick mouseup reset submit')
                    == popup_allowed_events + " keypress")
                Options.setFirefoxPref('dom.popup_allowed_events', popup_allowed_events);
        }
    } //}}}
})(); //}}}

// called when the chrome is fully loaded and before the main window is shown
window.addEventListener("load",   vimperator.startup,  false);
window.addEventListener("unload", vimperator.shutdown, false);

// vim: set fdm=marker sw=4 ts=4 et:
