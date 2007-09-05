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
        READ_MULTILINE:   1 << 11,
        SEARCH_FORWARD:   1 << 12,
        SEARCH_BACKWARD:  1 << 13,
        ESCAPE_ONE_KEY:   1 << 14,
        ESCAPE_ALL_KEYS:  1 << 15,
        QUICK_HINT:       1 << 16,
        EXTENDED_HINT:    1 << 17,
        ALWAYS_HINT:      1 << 18,
        MENU:             1 << 19 // a popupmenu is active
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
    mode_messages[modes.MENU]            = "menu"; // TODO: desirable? -> now that it seems to work reliable -> NO (--mst)

    var mode = modes.NORMAL;
    var extended_mode = modes.NONE;

    var callbacks = [];

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

    function expandPath(path)
    {
        const WINDOWS = navigator.platform == "Win32";

        // TODO: proper pathname separator translation like Vim
        if (WINDOWS)
            path = path.replace('/', '\\', 'g');

        // expand "~" to HOME (USERPROFILE or HOMEDRIVE\HOMEPATH on Windows if HOME is not set)
        if (/^~/.test(path))
        {
            var home = environment_service.get("HOME");

            if (WINDOWS && !home)
                home = environment_service.get("USERPROFILE") ||
                       environment_service.get("HOMEDRIVE") + environment_service.get("HOMEPATH");

            path = path.replace("~", home);
        }

        // expand any $ENV vars
        var env_vars = path.match(/\$\w+\b/g); // this is naive but so is Vim and we like to be compatible

        if (env_vars)
        {
            var expansion;

            for (var i = 0; i < env_vars.length; i++)
            {
                expansion = environment_service.get(env_vars[i].replace("$", ""));
                if (expansion)
                    path = path.replace(env_vars[i], expansion);
            }
        }

        return path;
    }

    // TODO: add this functionality to LocalFile or wait for Scriptable I/O in FUEL
    function pathExists(path)
    {
        var p = Components.classes["@mozilla.org/file/local;1"]
            .createInstance(Components.interfaces.nsILocalFile);
        p.initWithPath(expandPath(path));

        return p.exists();
    }

    function getPluginDir()
    {
        var plugin_dir;

        if (navigator.platform == "Win32")
            plugin_dir = "~/vimperator/plugin";
        else
            plugin_dir = "~/.vimperator/plugin";

        plugin_dir = expandPath(plugin_dir);

        return pathExists(plugin_dir) ? plugin_dir : null;
    }

    function getRCFile()
    {
        var rc_file1 = expandPath("~/.vimperatorrc");
        var rc_file2 = expandPath("~/_vimperatorrc");

        if (navigator.platform == "Win32")
            [rc_file1, rc_file2] = [rc_file2, rc_file1]

        if (pathExists(rc_file1))
            return rc_file1;
        else if (pathExists(rc_file2))
            return rc_file2;
        else
            return null;
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
        NEW_WINDOW: 4,
        //},

        // ###VERSION### and ###DATE### are replaced by the Makefile
        version: "###VERSION### (created: ###DATE###)",

        input: {
            buffer: "",                // partial command storage
            pendingMap: null,          // pending map storage
            count: -1                  // parsed count from the input buffer
        },

        // @param type can be:
        //  "submit": when the user pressed enter in the command line
        //  "change"
        //  "cancel"
        //  "complete"
        //  TODO: "zoom": if the zoom value of the current buffer changed
        registerCallback: function(type, mode, func)
        {
            // TODO: check if callback is already registered
            callbacks.push([type, mode, func]);
        },

        triggerCallback: function(type, mode, data)
        {
            for (var i in callbacks)
            {
                var [thistype, thismode, thisfunc] = callbacks[i];
                if (mode == thismode && type == thistype)
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
                extended_mode = vimperator.modes.NONE;
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
            if (!vimperator.options["visualbell"])
            {
                sound_service.beep();
                return;
            }

            // flash the visual bell
            var popup = document.getElementById("vimperator-visualbell");
            var win = document.getElementById("main-window");
            var box = document.getBoxObjectFor(win);

            popup.height = box.height;
            popup.width = box.width;
            popup.showPopup(win, box.screenX, box.screenY, "popup");

            setTimeout(function() { popup.hidePopup(); }, 375);
        },

        copyToClipboard: function(str)
        {
            var clipboardHelper = Components.classes["@mozilla.org/widget/clipboardhelper;1"]
                .getService(Components.interfaces.nsIClipboardHelper);
            clipboardHelper.copyString(str);
        },

        execute: function(string, modifiers)
        {
            // skip comments and blank lines
            if (/^\s*("|$)/.test(string))
                return;

            if (!modifiers)
                modifiers = {};

            var [count, cmd, special, args] = vimperator.commands.parseCommand(string.replace(/^'(.*)'$/, '$1'));
            var command = vimperator.commands.get(cmd);

            if (command === null)
            {
                vimperator.echoerr("E492: Not an editor command: " + cmd);
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
        focusContent: function()
        {
            var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
                     getService(Components.interfaces.nsIWindowWatcher);

            if (window == ww.activeWindow && document.commandDispatcher.focusedElement)
                document.commandDispatcher.focusedElement.blur();

            content.focus(); // FIXME: shouldn't be window.document.content?
        },

        fopen: function(path, mode, perms, tmp)
        {
            return new LocalFile(path, mode, perms, tmp);
        },

        // logs a message to the javascript error console
        log: function(msg, level)
        {
            // if (Options.getPref("verbose") >= level) // FIXME: hangs vimperator, probably timing issue --mst
                console_service.logStringMessage('vimperator: ' + msg);
        },

        // logs an object to the javascript error console also prints all
        // properties of the object
        logObject: function(object, level)
        {
            if (typeof object != 'object')
                return false;

            var string = object + '::\n';
            for (var i in object)
            {
                var value;
                try
                {
                    var value = object[i];
                }
                catch (e)
                {
                    value = '';
                }

                string += i + ': ' + value + '\n';
            }
            vimperator.log(string, level);
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
                    whichwindow.loadURI(url, null, postdata)
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


        // files which end in .js are sourced as pure javascript files,
        // no need (actually forbidden) to add: js <<EOF ... EOF around those files
        source: function(filename, silent)
        {
            filename = expandPath(filename);

            try
            {
                var fd = vimperator.fopen(filename, "<");
                if (!fd)
                    return;

                var s = fd.read();
                fd.close();

                // handle pure javascript files specially
                if (filename.search("\.js$") != -1)
                    eval(s);
                else
                {
                    var heredoc = "";
                    var heredocEnd = null; // the string which ends the heredoc
                    s.split("\n").forEach(function(line)
                    {
                        if (heredocEnd) // we already are in a heredoc
                        {
                            if (line.search(heredocEnd) != -1)
                            {
                                eval(heredoc);
                                heredoc = "";
                                heredocEnd = null;
                            }
                            else
                                heredoc += line + "\n";
                        }
                        else
                        {
                            // check for a heredoc
                            var [count, cmd, special, args] = vimperator.commands.parseCommand(line);
                            var command = vimperator.commands.get(cmd);
                            if (command && command.name == "javascript")
                            {
                                var matches = args.match(/(.*)<<\s*([^\s]+)$/);
                                if (matches && matches[2])
                                {
                                    heredocEnd = new RegExp("^" + matches[2] + "$", "m");
                                    if (matches[1])
                                        heredoc = matches[1] + "\n";
                                }
                            }
                            else
                            {
                                // execute a normal vimperator command
                                vimperator.execute(line);
                            }
                        }
                    });
                }

                vimperator.log("Sourced: " + filename, 3);
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
            vimperator.log("Loading module buffer...", 3);
            vimperator.buffer        = new Buffer();
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

            // TODO: move elsewhere
            vimperator.registerCallback("submit", vimperator.modes.EX, function(command) { vimperator.execute(command); } );
            vimperator.registerCallback("complete", vimperator.modes.EX, function(str) { return vimperator.completion.exTabCompletion(str); } );

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

            // finally, read a ~/.vimperatorrc
            // make sourcing asynchronous, otherwise commands that open new tabs won't work
            setTimeout(function() {

                var rc_file = getRCFile();

                if (rc_file)
                    vimperator.source(rc_file, true);
                else
                    vimperator.log("No user RC file found", 3);

                // also source plugins in ~/.vimperator/plugin/
                var entries = [];
                try
                {
                    var plugin_dir = getPluginDir();

                    if (plugin_dir)
                    {
                        var fd = vimperator.fopen(plugin_dir);
                        var entries = fd.read();
                        fd.close();
                        vimperator.log("Sourcing plugin directory...", 3);
                        entries.forEach(function(file) {
                            if (!file.isDirectory())
                                vimperator.source(file.path, false);
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
            }, 50);

            vimperator.log("Vimperator fully initialized", 1);
        },

        shutdown: function()
        {
            window.dump("Vimperator shutdown\n");

            // save our preferences
            vimperator.commandline.destroy();
            vimperator.events.destroy();
            vimperator.options.destroy();
            vimperator.quickmarks.destroy();
        }
    } //}}}
})(); //}}}

// called when the chrome is fully loaded and before the main window is shown
window.addEventListener("load",   vimperator.startup,  false);
window.addEventListener("unload", vimperator.shutdown, false);

// vim: set fdm=marker sw=4 ts=4 et:
