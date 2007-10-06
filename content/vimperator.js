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

    // our services
    var sound_service = Components.classes['@mozilla.org/sound;1']
        .getService(Components.interfaces.nsISound);
    var console_service = Components.classes['@mozilla.org/consoleservice;1']
        .getService(Components.interfaces.nsIConsoleService);
    var environment_service = Components.classes["@mozilla.org/process/environment;1"]
        .getService(Components.interfaces.nsIEnvironment);

    var callbacks = [];


    function expandPath(path)
    {
        const WINDOWS = navigator.platform == "Win32";

        // TODO: proper pathname separator translation like Vim
        if (WINDOWS)
            path = path.replace('/', '\\', 'g');

        // expand "~" to VIMPERATOR_HOME or HOME (USERPROFILE or HOMEDRIVE\HOMEPATH on Windows if HOME is not set)
        if (/^~/.test(path))
        {
            var home = environment_service.get("VIMPERATOR_HOME");

            if (!home)
                home = environment_service.get("HOME");

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

    // TODO: make secure
    // TODO: test if it actually works on windows
    function getTempFile()
    {
        var file = Components.classes["@mozilla.org/file/local;1"].
                              createInstance(Components.interfaces.nsILocalFile);
        if (navigator.platform == "Win32")
        {
            var dir = environment_service.get("TMP") || environment_service.get("TEMP") || "C:\\";
            file.initWithPath(dir + "\\vimperator.tmp");
        }
        else
        {
            var dir = environment_service.get("TMP") || environment_service.get("TEMP") || "/tmp/";
            file.initWithPath(dir + "/vimperator.tmp");
        }
        file.createUnique(Components.interfaces.nsIFile.NORMAL_FILE_TYPE, 0600);

        if (file.exists())
            return file;
        else
            return null;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {
        get mode() { return vimperator.modes.main; },
        set mode(value) { vimperator.modes.main = value; },

        // Global contants
        CURRENT_TAB: 1,
        NEW_TAB: 2,
        NEW_BACKGROUND_TAB: 3,
        NEW_WINDOW: 4,

        // ###VERSION### and ###DATE### are replaced by the Makefile
        version: "###VERSION### (created: ###DATE###)",

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
        registerCallback: function(type, mode, func)
        {
            // TODO: check if callback is already registered
            callbacks.push([type, mode, func]);
        },

        triggerCallback: function(type, mode, data)
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

        beep: function()
        {
            if (!vimperator.options["visualbell"])
            {
                sound_service.beep();
                return;
            }

            // flash the visual bell
            var popup = document.getElementById("vimperator-visualbell");
            var win = getBrowser().mPanelContainer;
            var box = document.getBoxObjectFor(win);

            popup.height = box.height;
            popup.width = box.width;
            //popup.style.backgroundColor = "black";
            ////popup.showPopup(win, box.screenX, box.screenY, "popup");
            //popup.showPopup(win, -1, -1, "popup", "topleft", "topleft");

            popup.openPopup(win, "overlap", 0, 0, false, false)

            setTimeout(function() { popup.hidePopup(); }, 50);
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

        // partial sixth level expression evaluation
        eval: function(string)
        {
            string = string.toString().replace(/^\s*/, "").replace(/\s*$/, "");
            var match = string.match(/^&(\w+)/);
            if (match)
            {
                var opt = this.options.get(match[1]);
                if (!opt)
                {
                    this.echoerr("E113: Unknown option: " + match[1]);
                    return;
                }
                var type = opt.type;
                var value = opt.getter();
                if (type != "boolean" && type != "number")
                    value = value.toString();
                return value;
            }

            // String
            else if (match = string.match(/^(['"])([^\1]*?[^\\]?)\1/))
            {
                if (match)
                    return match[2].toString();
                else
                {
                    this.echoerr("E115: Missing quote: " + string);
                    return;
                }
            }

            // Number
            else if (match = string.match(/^(\d+)$/))
            {
                return parseInt(match[1]);
            }

            var reference = this.variableReference(string);
            if (!reference[0])
                this.echoerr("E121: Undefined variable: " + string);
            else
                return reference[0][reference[1]];

            return;
        },

        variableReference: function(string)
        {
            if (!string)
                return [null, null, null];

            if (match = string.match(/^([bwtglsv]):(\w+)/)) // Variable
            {
                // Other variables should be implemented
                if (match[1] == "g")
                {
                    if (match[2] in this.globalVariables)
                        return [this.globalVariables, match[2], match[1]];
                    else
                        return [null, match[2], match[1]];
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

        // if color = true it uses HTML markup to color certain items
        objectToString: function(object, color)
        {
            if (object === null)
                return "null";
            if (typeof object != "object")
                return false;

            var string = "";
            var obj = "";
            try { // for window.JSON
                obj = object.toString();
            } catch (e) {
                obj = "&lt;Object&gt;";
            }

            if (color)
                string += "<span class=\"hl-Title\">" + obj + "</span>::\n";
            else
                string += obj + "::\n";

            for (var i in object)
            {
                var value;
                try
                {
                    if (i == "JSON") // without this ugly hack, ":echo window" does not work
                        value = "[object JSON]";
                    else
                        value = object[i];
                }
                catch (e)
                {
                    value = "";
                }

                if (color)
                {
                    // syntax highlighting for special items
                    if (typeof value === "number")
                        value = "<span style=\"color: red;\">" + value + "</span>";
                    else if (typeof value === "string")
                    {
                        value = value.replace(/\n/, "\\n").replace(/</, "&lt;");
                        value = "<span style=\"color: green;\">\"" + value + "\"</span>";
                    }
                    else if (typeof value === "boolean")
                        value = "<span style=\"color: blue;\">" + value + "</span>";
                    else if (value == null || value == "undefined")
                        value = "<span style=\"color: blue;\">" + value + "</span>";
                    else if (typeof value === "object" || typeof value === "function")
                    {
                        // for java packages value.toString() would crash so badly 
                        // that we cannot even try/catch it
                        if (/^\[JavaPackage.*\]$/.test(value)) 
                            value = "[JavaPackage]";
                        else
                        {
                            var str = value.toString();
                            if (typeof str == "string")  // can be "undefined"
                                value = vimperator.util.escapeHTML(str);
                        }
                    }
                    
                    string += "<span style=\"font-weight: bold;\">" + i + "</span>: " + value + "\n";
                }
                else
                    string += i + ": " + value + "\n";
            }
            return string;
        },

        // logs a message to the javascript error console
        // if msg is an object, it is beautified
        log: function(msg, level)
        {
            //if (Options.getPref("verbose") >= level) // FIXME: hangs vimperator, probably timing issue --mst
            if (typeof msg == "object")
                msg = this.objectToString(msg, false);

            console_service.logStringMessage('vimperator: ' + msg);
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

        run: function(program, args, blocking)
        {
            const WINDOWS = navigator.platform == "Win32";

            var file = Components.classes["@mozilla.org/file/local;1"].
                                  createInstance(Components.interfaces.nsILocalFile);
            try
            {
                file.initWithPath(program);
            }
            catch (e)
            {
                var dirs = environment_service.get("PATH").split(WINDOWS ? ";" : ":");
                for (var i = 0; i < dirs.length; i++)
                {
                    var path = dirs[i] + (WINDOWS ? "\\" : "/") + program;
                    try
                    {
                        file.initWithPath(path);
                        if (file.exists())
                            break;
                    }
                    catch (e) { }
                }
            }
            if (!file.exists())
            {
                vimperator.echoerr("command not found: " + program);
                return -1;
            }

            var process = Components.classes["@mozilla.org/process/util;1"].
                                     createInstance(Components.interfaces.nsIProcess);
            process.init(file);
             
            var ec = process.run(blocking, args, args.length);
            return ec;
        },

        // when https://bugzilla.mozilla.org/show_bug.cgi?id=68702 is fixed
        // is fixed, should use that instead of a tmpfile
        // TODO: make it usable on windows
        // TODO: pass "input" as stdin
        // TODO: add shell/shellcmdflag options to replace "sh" and "-c"
        system: function (str, input)
        {
            var fileout = getTempFile();
            if (!fileout)
                return "";

            var filein = null;
            var command = str + " > \"" + fileout.path.replace('"', '\\"') + "\"";
            if (input)
            {
                filein = getTempFile();
                var fdin = vimperator.fopen(filein, ">");
                fdin.write(input);
                fdin.close();
                command += " < \"" + filein.path.replace('"', '\\"') + "\"";
            }

            this.run("sh", ["-c", command], true);
            var fd = vimperator.fopen(fileout, "<");
            if (!fd)
                return null;

            var s = fd.read();
            fd.close();
            fileout.remove(false);
            if (filein)
                filein.remove(false);

            return s;
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
                {
                    eval(s);
                }
                else
                {
                    var heredoc = "";
                    var heredoc_end = null; // the string which ends the heredoc
                    s.split("\n").forEach(function(line)
                    {
                        if (heredoc_end) // we already are in a heredoc
                        {
                            if (heredoc_end.test(line))
                            {
                                eval(heredoc);
                                heredoc = "";
                                heredoc_end = null;
                            }
                            else
                            {
                                heredoc += line + "\n";
                            }
                        }
                        else
                        {
                            // check for a heredoc
                            var [count, cmd, special, args] = vimperator.commands.parseCommand(line);
                            var command = vimperator.commands.get(cmd);
                            if (command && command.name == "javascript")
                            {
                                var matches = args.match(/(.*)<<\s*([^\s]+)$/);
                                if (matches)
                                {
                                    heredoc_end = new RegExp("^" + matches[2] + "$", "m");
                                    if (matches[1])
                                        heredoc = matches[1] + "\n";
                                }
                                else
                                {
                                    command.execute(args, special, count);
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
            vimperator.log("Loading module editor...", 3);
            vimperator.editor        = new Editor();
            vimperator.log("Loading module tabs...", 3);
            vimperator.tabs          = new Tabs();
            vimperator.log("Loading module marks...", 3);
            vimperator.marks         = new Marks();
            vimperator.log("Loading module quickmarks...", 3);
            vimperator.quickmarks    = new QuickMarks();
            vimperator.log("Loading module hints...", 3);
            vimperator.hints         = new Hints();
            vimperator.log("All modules loaded", 3);

            vimperator.echo    = function(str) { vimperator.commandline.echo(str); }
            vimperator.echoerr = function(str) { vimperator.commandline.echo(str, vimperator.commandline.HL_ERRORMSG); }

            vimperator.globalVariables = {};

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

            // disable caret browsing initially
            //Options.setFirefoxPref("accessibility.browsewithcaret", false);
            //vimperator.focusContent();

            // always start in normal mode
            vimperator.modes.reset();

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
            vimperator.quickmarks.destroy();
            vimperator.options.destroy();
            vimperator.events.destroy();

            window.dump("All vimperator modules destroyed\n");
        },

        sleep: function(ms)
        {
            var threadManager = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager); 
            var mainThread = threadManager.mainThread; 

            var then = new Date().getTime(), now = then; 
            for (; now - then < ms; now = new Date().getTime()) { 
                mainThread.processNextEvent(true); 
            } 
        } 

    } //}}}
})(); //}}}

// called when the chrome is fully loaded and before the main window is shown
window.addEventListener("load",   vimperator.startup,  false);
window.addEventListener("unload", vimperator.shutdown, false);

// vim: set fdm=marker sw=4 ts=4 et:
