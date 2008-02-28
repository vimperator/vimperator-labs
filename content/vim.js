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

    // Only general options are added here, which are valid for all vimperator like extensions
    function addOptions()
    {
        vimperator.options.add(["guioptions", "go"],
            "Show or hide certain GUI elements like the menu or toolbar",
            "charlist", "",
            {
                setter: function (value)
                {
                    var guioptions = vimperator.config.guioptions || {};
                    for (let option in guioptions)
                    {
                        guioptions[option].forEach( function(elem)
                        {
                            try
                            {
                                document.getElementById(elem).collapsed = (value.indexOf(option.toString()) < 0);
                            }
                            catch (e) { }
                        });
                    }
                },
                validator: function (value)
                {
                    var regex = "[^";
                    for (let option in vimperator.config.guioptions)
                        regex += option.toString();

                    return !(new RegExp(regex + "]").test(value));
                }
            });
        vimperator.options.add(["titlestring"], // TODO: broken for Thunderbird
            "Change the title of the window",
            "string", "Vimperator",
            {
                setter: function (value)
                {
                    try
                    {
                        var id = vimperator.config.mainWindowID || "main-window";
                        document.getElementById(id).setAttribute("titlemodifier", value);
                        if (window.content.document.title.length > 0)
                            document.title = window.content.document.title + " - " + value;
                        else
                            document.title = value;
                    }
                    catch (e)
                    {
                        vimperator.log("Couldn't set titlestring", 1);
                    }
                },
            });
        vimperator.options.add(["verbose", "vbs"], 
            "Define which type of messages are logged",
            "number", 0,
            {
                validator: function (value) { return (value >= 0 && value <= 9); }
            });
        vimperator.options.add(["visualbell", "vb"], 
            "Use visual bell instead of beeping on errors",
            "boolean", false,
            {
                setter: function (value) { vimperator.options.setPref("accessibility.typeaheadfind.enablesound", !value); },
            });
    }

    function addMappings()
    {
        vimperator.mappings.add(vimperator.modes.all, ["<F1>"],
            "Open help window",
            function () { vimperator.commands.help(); });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["ZQ"],
            "Quit and don't save the session",
            function () { vimperator.quit(false); });

        vimperator.mappings.add([vimperator.modes.NORMAL], ["ZZ"],
            "Quit and save the session",
            function () { vimperator.quit(true); });
    }

    function addCommands()
    {
        vimperator.commands.add(["addo[ns]"],
            "Manage available Extensions and Themes",
            function () { vimperator.open("chrome://mozapps/content/extensions/extensions.xul", vimperator.NEW_TAB); });

        vimperator.commands.add(["beep"],
            "Play a system beep",
            function () { vimperator.beep(); });

        vimperator.commands.add(["dia[log]"],
            "Open a " + vimperator.config.appName + " dialog",
            function (args, special)
            {
                try
                {
                    var dialogs = vimperator.config.dialogs || [];
                    for (let i = 0; i < dialogs.length; i++)
                    {
                        if (dialogs[i][0] == args)
                            return dialogs[i][2]();
                    }
                    vimperator.echoerr(args ? "Dialog \"" + args + "\" not available" : "E474: Invalid argument");
                }
                catch (e)
                {
                    vimperator.echoerr("Error opening '" + args + "': " + e);
                }
            },
            {
                completer: function (filter) { return vimperator.completion.dialog(filter); }
            });

        vimperator.commands.add(["exe[cute]"],
            "Execute the argument as an Ex command",
            function (args) { vimperator.execute(args); });

        vimperator.commands.add(["exu[sage]"],
            "List all Ex commands with a short description",
            function ()
            {
                var usage = "<table>";
                for (let command in vimperator.commands)
                {
                    usage += "<tr><td style='color: magenta; padding-right: 20px'> :" +
                             vimperator.util.escapeHTML(command.name) + "</td><td>" +
                             vimperator.util.escapeHTML(command.shortHelp) + "</td></tr>";
                }
                usage += "</table>";

                vimperator.echo(usage, vimperator.commandline.FORCE_MULTILINE);
            });

        vimperator.commands.add(["h[elp]"],
            "Display help",
            function (args, special, count, modifiers)
            {
                function jumpToTag(file, tag)
                {
                    vimperator.open("chrome://" + vimperator.config.name.toLowerCase() + "/locale/" + file);
                    setTimeout(function() {
                        var elem = vimperator.buffer.getElement('@class="tag" and text()="' + tag + '"');
                        if (elem)
                            window.content.scrollTo(0, elem.getBoundingClientRect().top - 10); // 10px context
                        else
                            dump('no element: ' + '@class="tag" and text()="' + tag + '"\n' );
                    }, 200);
                }

                if (!args)
                {
                    vimperator.open("chrome://" + vimperator.config.name.toLowerCase() + "/locale/intro.html");
                    return;
                }

                var [, items] = vimperator.completion.help(args);
                var partialMatch = -1;
                for (var i = 0; i < items.length; i++)
                {
                    if (items[i][0] == args)
                    {
                        jumpToTag(items[i][1], items[i][0]);
                        return;
                    }
                    else if (partialMatch == -1 && items[i][0].indexOf(args) > -1)
                    {
                        partialMatch = i;
                    }
                }

                if (partialMatch > -1)
                    jumpToTag(items[partialMatch][1], items[partialMatch][0]);
                else
                    vimperator.echoerr("E149: Sorry, no help for " + args);
            },
            {
                completer: function (filter) { return vimperator.completion.help(filter); }
            });

        vimperator.commands.add(["javas[cript]", "js"],
            "Run a JavaScript command through eval()",
            function (args, special)
            {
                if (special) // open javascript console
                    vimperator.open("chrome://global/content/console.xul", vimperator.NEW_TAB);
                else
                {
                    // check for a heredoc
                    var matches = args.match(/(.*)<<\s*([^\s]+)$/);
                    if (matches && matches[2])
                    {
                        vimperator.commandline.inputMultiline(new RegExp("^" + matches[2] + "$", "m"),
                            function (code)
                            {
                                try
                                {
                                    eval(matches[1] + "\n" + code);
                                }
                                catch (e)
                                {
                                    vimperator.echoerr(e.name + ": " + e.message);
                                }
                            });
                    }
                    else // single line javascript code
                    {
                        try
                        {
                            eval("with(vimperator){" + args + "}");
                        }
                        catch (e)
                        {
                            vimperator.echoerr(e.name + ": " + e.message);
                        }
                    }
                }
            },
            {
                completer: function (filter) { return vimperator.completion.javascript(filter); }
            });
    }

    // initially hide all GUI, it is later restored unless the user has :set go= or something
    // similar in his config
    function hideGUI()
    {
        var guioptions = vimperator.config.guioptions || {};
        for (let option in guioptions)
        {
            guioptions[option].forEach( function(elem)
            {
                try
                {
                    document.getElementById(elem).collapsed = true;
                }
                catch (e) { }
            });
        }

//        if (vimperator.has("tabs"))

    }

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

        // XXX? move to vimperator.util?
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

        // TODO: move to vimperator.buffer.focus()?
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

        // return true, if this VIM-like extension has a certain feature
        has: function (feature)
        {
            var features = vimperator.config.features || [];
            return features.some (function(feat) { return feat == feature; });
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
        open: function (urls, where)
        {
            // convert the string to an array of converted URLs
            // -> see vimperator.util.stringToURLArray for more details
            if (typeof urls == "string")
                urls = vimperator.util.stringToURLArray(urls);

            if (urls.length == 0)
                return false;

            if (!where || !vimperator.has("tabs"))
                where = vimperator.CURRENT_TAB;

            var url =   typeof urls[0] == "string" ? urls[0] : urls[0][0];
            var postdata = typeof urls[0] == "string" ? null : urls[0][1];
            var whichwindow = window;

            // decide where to load the first url
            switch (where)
            {
                case vimperator.CURRENT_TAB:
                    getBrowser().loadURIWithFlags(url, null, null, null, postdata);
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

            // only load more than one url if we have tab support
            if (!vimperator.has("tabs"))
                return true;

            // all other URLs are always loaded in background
            for (var i = 1; i < urls.length; i++)
            {
                url =   typeof urls[i] == "string" ? urls[i] : urls[i][0];
                postdata = typeof urls[i] == "string" ? null : urls[i][1];
                whichwindow.getBrowser().addTab(url, null, null, postdata);
            }

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

        // this function is called, when the chrome is ready
        startup: function ()
        {
            function log(module) { vimperator.log("Loading module " + module + "...", 3); };

            vimperator.log("Initializing vimperator object...", 1);
            // commands must always be the first module to be initialized
            log("commands");       vimperator.commands = vimperator.Commands(); addCommands();
            log("options");        vimperator.options  = vimperator.Options();  addOptions();
            log("mappings");       vimperator.mappings = vimperator.Mappings(); addMappings();
            log("events");         vimperator.events   = vimperator.Events();
            log("commandline");    vimperator.commandline   = vimperator.CommandLine();
            log("search");         vimperator.search        = vimperator.Search();
            log("preview window"); vimperator.previewwindow = vimperator.InformationList("vimperator-previewwindow", { incrementalFill: false, maxItems: 10 });
            log("buffer window");  vimperator.bufferwindow  = vimperator.InformationList("vimperator-bufferwindow", { incrementalFill: false, maxItems: 10 });
            log("statusline");     vimperator.statusline    = vimperator.StatusLine();
            log("buffer");         vimperator.buffer        = vimperator.Buffer();
            log("editor");         vimperator.editor        = vimperator.Editor();
            log("autocommands");   vimperator.autocommands  = vimperator.AutoCommands();
            log("io");             vimperator.io            = vimperator.IO();
            log("completion");     vimperator.completion    = vimperator.Completion();

            // optional modules
            if (vimperator.has("bookmarks"))  { log("bookmarks");  vimperator.bookmarks  = vimperator.Bookmarks(); }
            if (vimperator.has("history"))    { log("history");    vimperator.history    = vimperator.History(); }
            if (vimperator.has("mail"))       { log("mail");       vimperator.mail       = vimperator.Mail(); }
            if (vimperator.has("tabs"))       { log("tabs");       vimperator.tabs       = vimperator.Tabs(); }
            if (vimperator.has("marks"))      { log("marks");      vimperator.marks      = vimperator.Marks(); }
            if (vimperator.has("quickmarks")) { log("quickmarks"); vimperator.quickmarks = vimperator.QuickMarks(); }
            if (vimperator.has("hints"))      { log("hints");      vimperator.hints      = vimperator.Hints(); }

            vimperator.log("All modules loaded", 3);

            // This adds options/mappings/commands which are only valid in this particular extension
            if (vimperator.config.init)
            {
                vimperator.config.init();
                // vimperator.log("Loaded additional mappings, etc. for " + vimperator.config.name, 3);
            }

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
            if (vimperator.options.getPref("extensions." + vimperator.config.name.toLowerCase() + ".firsttime", true))
            {
                setTimeout(function () {
                    vimperator.commands.help();
                    vimperator.options.setPref("extensions." + vimperator.config.name.toLowerCase() + ".firsttime", false);
                }, 1000);
            }

            // always start in normal mode
            vimperator.modes.reset();

            // TODO: we should have some class where all this guioptions stuff fits well
            hideGUI();

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
                for (let option in vimperator.options)
                {
                    if (option.setter && !option.hasChanged)
                        option.reset();
                }
            }, 0);

            vimperator.statusline.update();
            vimperator.log("Vimperator fully initialized", 1);
        },

        shutdown: function ()
        {
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
