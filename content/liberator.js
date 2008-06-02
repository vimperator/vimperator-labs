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

const liberator = (function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    var callbacks = [];

    // Only general options are added here, which are valid for all vimperator like extensions
    function addOptions()
    {
        liberator.options.add(["guioptions", "go"],
            "Show or hide certain GUI elements like the menu or toolbar",
            "charlist", "",
            {
                setter: function (value)
                {
                    var guioptions = liberator.config.guioptions || {};
                    for (let option in guioptions)
                    {
                        guioptions[option].forEach(function (elem)
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
                    for (let option in liberator.config.guioptions)
                        regex += option.toString();

                    return !(new RegExp(regex + "]").test(value));
                }
            });

        liberator.options.add(["titlestring"], // TODO: broken for Thunderbird
            "Change the title of the window",
            "string", "Vimperator",
            {
                setter: function (value)
                {
                    try
                    {
                        var id = liberator.config.mainWindowID || "main-window";
                        document.getElementById(id).setAttribute("titlemodifier", value);
                        if (window.content.document.title.length > 0)
                            document.title = window.content.document.title + " - " + value;
                        else
                            document.title = value;
                    }
                    catch (e)
                    {
                        liberator.log("Couldn't set titlestring", 1);
                    }
                },
            });

        liberator.options.add(["verbose", "vbs"], 
            "Define which type of messages are logged",
            "number", 0,
            {
                validator: function (value) { return (value >= 0 && value <= 9); }
            });

        liberator.options.add(["visualbell", "vb"], 
            "Use visual bell instead of beeping on errors",
            "boolean", false,
            {
                setter: function (value) { liberator.options.setPref("accessibility.typeaheadfind.enablesound", !value); },
            });

        liberator.options.add(["visualbellstyle", "t_vb"],
            "CSS specification of the visual bell",
            "string", "border: none; background-color: black;"
        );
    }

    function addMappings()
    {
        liberator.mappings.add(liberator.modes.all, ["<F1>"],
            "Open help window",
            function () { liberator.help(); });

        if (liberator.has("session"))
        {
            liberator.mappings.add([liberator.modes.NORMAL], ["ZQ"],
                "Quit and don't save the session",
                function () { liberator.quit(false); });
        }

        liberator.mappings.add([liberator.modes.NORMAL], ["ZZ"],
            "Quit and save the session",
            function () { liberator.quit(true); });
    }

    function addCommands()
    {
        liberator.commands.add(["addo[ns]"],
            "Manage available Extensions and Themes",
            function ()
            {
                liberator.open("chrome://mozapps/content/extensions/extensions.xul",
                    (liberator.options.newtab &&
                        (liberator.options.newtab == "all" || liberator.options.newtab.split(",").indexOf("addons") != -1)) ?
                            liberator.NEW_TAB: liberator.CURRENT_TAB);
            });

        liberator.commands.add(["beep"],
            "Play a system beep",
            function () { liberator.beep(); });

        liberator.commands.add(["dia[log]"],
            "Open a " + liberator.config.appName + " dialog",
            function (args, special)
            {
                try
                {
                    var dialogs = liberator.config.dialogs || [];
                    for (let i = 0; i < dialogs.length; i++)
                    {
                        if (dialogs[i][0] == args)
                            return dialogs[i][2]();
                    }
                    liberator.echoerr(args ? "Dialog \"" + args + "\" not available" : "E474: Invalid argument");
                }
                catch (e)
                {
                    liberator.echoerr("Error opening '" + args + "': " + e);
                }
            },
            {
                completer: function (filter) { return liberator.completion.dialog(filter); }
            });

        liberator.commands.add(["exe[cute]"],
            "Execute the argument as an Ex command",
            function (args) { liberator.execute(args); });

        liberator.commands.add(["exu[sage]"],
            "List all Ex commands with a short description",
            function ()
            {
                var usage = "<table>";
                for (let command in liberator.commands)
                {
                    usage += "<tr><td style='color: magenta; padding-right: 20px'> :" +
                             liberator.util.escapeHTML(command.name) + "</td><td>" +
                             liberator.util.escapeHTML(command.description) + "</td></tr>";
                }
                usage += "</table>";

                liberator.echo(usage, liberator.commandline.FORCE_MULTILINE);
            });

        liberator.commands.add(["h[elp]"],
            "Display help",
            function (args) { liberator.help(args); },
            {
                completer: function (filter) { return liberator.completion.help(filter); }
            });

        liberator.commands.add(["javas[cript]", "js"],
            "Run a JavaScript command through eval()",
            function (args, special)
            {
                if (special) // open javascript console
                {
                    liberator.open("chrome://global/content/console.xul",
                        (liberator.options.newtab &&
                            (liberator.options.newtab == "all" || liberator.options.newtab.split(",").indexOf("javascript") != -1)) ?
                                liberator.NEW_TAB : liberator.CURRENT_TAB);
                }
                else
                {
                    // check for a heredoc
                    var matches = args.match(/(.*)<<\s*([^\s]+)$/);
                    if (matches && matches[2])
                    {
                        liberator.commandline.inputMultiline(new RegExp("^" + matches[2] + "$", "m"),
                            function (code)
                            {
                                try
                                {
                                    eval(matches[1] + "\n" + code);
                                }
                                catch (e)
                                {
                                    liberator.echoerr(e.name + ": " + e.message);
                                }
                            });
                    }
                    else // single line javascript code
                    {
                        try
                        {
                            eval("with(liberator){" + args + "}");
                        }
                        catch (e)
                        {
                            liberator.echoerr(e.name + ": " + e.message);
                        }
                    }
                }
            },
            {
                completer: function (filter) { return liberator.completion.javascript(filter); }
            });

        liberator.commands.add(["norm[al]"],
            "Execute Normal mode commands",
            function (args, special)
            {
                if (!args)
                {
                    liberator.echoerr("E471: Argument required");
                    return;
                }

                liberator.events.feedkeys(args, special);
            });

        liberator.commands.add(["q[uit]"],
            liberator.has("tabs") ? "Quit current tab" : "Quit application",
            function ()
            {
                if (liberator.has("tabs"))
                    liberator.tabs.remove(getBrowser().mCurrentTab, 1, false, 1);
                else
                    liberator.quit(false);
            });

        liberator.commands.add(["res[tart]"],
            "Force " + liberator.config.appName + " to restart",
            function () { liberator.restart(); });

        liberator.commands.add(["time"],
            "Profile a piece of code or run a command multiple times",
            function (args, special, count)
            {
                try
                {
                    if (count > 1)
                    {
                        var i = count;
                        var beforeTime = Date.now();

                        if (args && args[0] == ":")
                        {
                            while (i--)
                                liberator.execute(args);
                        }
                        else
                        {
                            while (i--)
                                eval("with(liberator){" + args + "}");
                        }

                        if (special)
                            return;

                        var afterTime = Date.now();

                        if ((afterTime - beforeTime) / count >= 100)
                        {
                            var each = ((afterTime - beforeTime) / 1000.0 / count);
                            var eachUnits = "sec";
                        }
                        else
                        {
                            var each = ((afterTime - beforeTime) / count);
                            var eachUnits = "msec";
                        }

                        if (afterTime - beforeTime >= 100)
                        {
                            var total = ((afterTime - beforeTime) / 1000.0);
                            var totalUnits = "sec";
                        }
                        else
                        {
                            var total = (afterTime - beforeTime);
                            var totalUnits = "msec";
                        }

                        var str = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                                  "<table>" +
                                  "<tr align=\"left\" class=\"hl-Title\"><th colspan=\"3\">Code execution summary</th></tr>" +
                                  "<tr><td>  Executed:</td><td align=\"right\"><span style=\"color: green\">" + count + "</span></td><td>times</td></tr>" +
                                  "<tr><td>  Average time:</td><td align=\"right\"><span style=\"color: green\">" + each.toFixed(2) + "</span></td><td>" + eachUnits + "</td></tr>" +
                                  "<tr><td>  Total time:</td><td align=\"right\"><span style=\"color: red\">" + total.toFixed(2) + "</span></td><td>" + totalUnits + "</td></tr>" +
                                  "</table>";

                        liberator.commandline.echo(str, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
                    }
                    else
                    {
                        var beforeTime = Date.now();
                        if (args && args[0] == ":")
                            liberator.execute(args);
                        else
                            eval("with(liberator){" + args + "}");

                        if (special)
                            return;

                        var afterTime = Date.now();

                        if (afterTime - beforeTime >= 100)
                            liberator.echo("Total time: " + ((afterTime - beforeTime) / 1000.0).toFixed(2) + " sec");
                        else
                            liberator.echo("Total time: " + (afterTime - beforeTime) + " msec");
                    }
                }
                catch (e)
                {
                    liberator.echoerr(e);
                }
            });

        liberator.commands.add(["ve[rsion]"],
            "Show version information",
            function (args, special)
            {
                if (special)
                    liberator.open("about:");
                else
                    liberator.echo(":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "\n" +
                                    liberator.config.name + " " + liberator.version +
                                    " running on:\n" + navigator.userAgent);
            });

        liberator.commands.add(["viu[sage]"],
            "List all mappings with a short description",
            function (args, special, count, modifiers)
            {
                var usage = "<table>";
                for (let mapping in liberator.mappings)
                {
                    usage += "<tr><td style='color: magenta; padding-right: 20px'> " +
                             liberator.util.escapeHTML(mapping.names[0]) + "</td><td>" +
                             liberator.util.escapeHTML(mapping.description) + "</td></tr>";
                }
                usage += "</table>";

                liberator.echo(usage, liberator.commandline.FORCE_MULTILINE);
            });
    }

    // initially hide all GUI, it is later restored unless the user has :set go= or something
    // similar in his config
    function hideGUI()
    {
        var guioptions = liberator.config.guioptions || {};
        for (let option in guioptions)
        {
            guioptions[option].forEach(function (elem)
            {
                try
                {
                    document.getElementById(elem).collapsed = true;
                }
                catch (e) { }
            });
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get mode()      { return liberator.modes.main; },
        set mode(value) { liberator.modes.main = value; },

        // Global constants
        CURRENT_TAB: 1,
        NEW_TAB: 2,
        NEW_BACKGROUND_TAB: 3,
        NEW_WINDOW: 4,

        forceNewTab: false,

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
            if (liberator.options["visualbell"])
            {
                var vbs = liberator.options["visualbellstyle"];
                if (vbs)
                {
                    // flash the visual bell
                    var popup = document.getElementById("liberator-visualbell");
                    var win = getBrowser().mPanelContainer;
                    var box = document.getBoxObjectFor(win);

                    popup.style.cssText = vbs;
                    popup.height = box.height;
                    popup.width = box.width;
                    popup.openPopup(win, "overlap", 0, 0, false, false);
                    setTimeout(function () { popup.hidePopup(); }, 50);
                }
            }
            else
            {
                var soundService = Components.classes["@mozilla.org/sound;1"].
                                   getService(Components.interfaces.nsISound);
                soundService.beep();
            }
        },

        // Execute an ex command like str=":zoom 300"
        execute: function (str, modifiers)
        {
            // skip comments and blank lines
            if (/^\s*("|$)/.test(str))
                return;

            if (!modifiers)
                modifiers = {};

            var [count, cmd, special, args] = liberator.commands.parseCommand(str.replace(/^'(.*)'$/, "$1"));
            var command = liberator.commands.get(cmd);

            if (command === null)
            {
                liberator.echoerr("E492: Not a browser command: " + str);
                liberator.focusContent();
                return;
            }

            // TODO: need to perform this test? -- djk
            if (command.action === null)
            {
                liberator.echoerr("E666: Internal error: command.action === null");
                return;
            }

            // valid command, call it:
            command.execute(args, special, count, modifiers);
        },

        // TODO: move to liberator.buffer.focus()?
        // after pressing Escape, put focus on a non-input field of the browser document
        // if clearFocusedElement, also blur a focused link
        focusContent: function (clearFocusedElement)
        {
            var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
                     getService(Components.interfaces.nsIWindowWatcher);
            if (window == ww.activeWindow && document.commandDispatcher.focusedElement && clearFocusedElement)
                document.commandDispatcher.focusedElement.blur();

            // TODO: make more generic
            try
            {
                if (liberator.has("mail") && clearFocusedElement && !liberator.config.isComposeWindow)
                {
                    var i = gDBView.selection.currentIndex;
                    if (i == -1 && gDBView.rowCount >= 0)
                        i = 0;

                    gDBView.selection.select(i);
                }
            }
            catch (e) { }

            var elem = liberator.config.mainWidget || window.content;
            if (elem && (elem != document.commandDispatcher.focusedElement))
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
            var features = liberator.config.features || [];
            return features.some (function (feat) { return feat == feature; });
        },

        help: function (topic)
        {
            var where = (liberator.options.newtab && (liberator.options.newtab == "all" || liberator.options.newtab.split(",").indexOf("help") != -1)) ?
                        liberator.NEW_TAB : liberator.CURRENT_TAB;

            function jumpToTag(file, tag)
            {
                liberator.open("chrome://" + liberator.config.name.toLowerCase() + "/locale/" + file, where);
                setTimeout(function () {
                    var elem = liberator.buffer.getElement('@class="tag" and text()="' + tag + '"');
                    if (elem)
                        window.content.scrollTo(0, elem.getBoundingClientRect().top - 10); // 10px context
                    else
                        dump('no element: ' + '@class="tag" and text()="' + tag + '"\n' );
                }, 500);
            }

            if (!topic)
            {
                liberator.open("chrome://" + liberator.config.name.toLowerCase() + "/locale/intro.html", where);
                return;
            }

            var [, items] = liberator.completion.help(topic);
            var partialMatch = -1;
            for (var i = 0; i < items.length; i++)
            {
                if (items[i][0] == topic)
                {
                    jumpToTag(items[i][1], items[i][0]);
                    return;
                }
                else if (partialMatch == -1 && items[i][0].indexOf(topic) > -1)
                {
                    partialMatch = i;
                }
            }

            if (partialMatch > -1)
                jumpToTag(items[partialMatch][1], items[partialMatch][0]);
            else
                liberator.echoerr("E149: Sorry, no help for " + topic);
        },

        // logs a message to the javascript error console
        // if msg is an object, it is beautified
        log: function (msg, level)
        {
            //if (liberator.options.getPref("verbose") >= level) // FIXME: hangs liberator, probably timing issue --mst
            if (typeof msg == "object")
                msg = liberator.util.objectToString(msg, false);

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
        //                  but NEW_TAB is set when liberator.forceNewTab is true.
        // @param callback: not implemented, will be allowed to specify a callback function
        //                  which is called, when the page finished loading
        // @returns true when load was initiated, or false on error
        open: function (urls, where)
        {
            // convert the string to an array of converted URLs
            // -> see liberator.util.stringToURLArray for more details
            if (typeof urls == "string")
                urls = liberator.util.stringToURLArray(urls);

            if (urls.length == 0)
                return false;

            if (liberator.forceNewTab && liberator.has("tabs"))
                where = liberator.NEW_TAB;
            else if (!where || !liberator.has("tabs"))
                where = liberator.CURRENT_TAB;

            var url =   typeof urls[0] == "string" ? urls[0] : urls[0][0];
            var postdata = typeof urls[0] == "string" ? null : urls[0][1];
            var whichwindow = window;

            // decide where to load the first url
            switch (where)
            {
                case liberator.CURRENT_TAB:
                    getBrowser().loadURIWithFlags(url, null, null, null, postdata);
                    break;

                case liberator.NEW_TAB:
                    var firsttab = getBrowser().addTab(url, null, null, postdata);
                    getBrowser().selectedTab = firsttab;
                    break;

                case liberator.NEW_BACKGROUND_TAB:
                    getBrowser().addTab(url, null, null, postdata);
                    break;

                case liberator.NEW_WINDOW:
                    window.open();
                    var wm = Components.classes["@mozilla.org/appshell/window-mediator;1"]
                               .getService(Components.interfaces.nsIWindowMediator);
                    whichwindow = wm.getMostRecentWindow("navigator:browser");
                    whichwindow.loadURI(url, null, postdata);
                    break;

                default:
                    liberator.echoerr("Exxx: Invalid 'where' directive in liberator.open(...)");
                    return false;
            }

            // only load more than one url if we have tab support
            if (!liberator.has("tabs"))
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

        // quit liberator, no matter how many tabs/windows are open
        quit: function (saveSession)
        {
            liberator.autocommands.trigger("BrowserExit", "");

            if (saveSession)
                liberator.options.setPref("browser.startup.page", 3); // start with saved session
            else
                liberator.options.setPref("browser.startup.page", 1); // start with default homepage session

            goQuitApplication();
        },

        restart: function ()
        {
            liberator.autocommands.trigger("BrowserRestart", "");

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

        // TODO: move to {muttator,vimperator,...}.js
        // this function is called, when the chrome is ready
        startup: function ()
        {
            function log(module) { liberator.log("Loading module " + module + "...", 3); };

            liberator.log("Initializing vimperator object...", 1);
            // commands must always be the first module to be initialized
            log("commands");       liberator.commands = liberator.Commands(); addCommands();
            log("options");        liberator.options  = liberator.Options();  addOptions();
            log("mappings");       liberator.mappings = liberator.Mappings(); addMappings();
            log("events");         liberator.events   = liberator.Events();
            log("commandline");    liberator.commandline   = liberator.CommandLine();
            log("search");         liberator.search        = liberator.Search();
            log("preview window"); liberator.previewwindow = liberator.InformationList("liberator-previewwindow", { incrementalFill: false, maxItems: 10 });
            log("buffer window");  liberator.bufferwindow  = liberator.InformationList("liberator-bufferwindow", { incrementalFill: false, maxItems: 10 });
            log("statusline");     liberator.statusline    = liberator.StatusLine();
            log("buffer");         liberator.buffer        = liberator.Buffer();
            log("editor");         liberator.editor        = liberator.Editor();
            log("autocommands");   liberator.autocommands  = liberator.AutoCommands();
            log("io");             liberator.io            = liberator.IO();
            log("completion");     liberator.completion    = liberator.Completion();

            // optional modules
            if (liberator.has("bookmarks"))  { log("bookmarks");  liberator.bookmarks  = liberator.Bookmarks(); }
            if (liberator.has("history"))    { log("history");    liberator.history    = liberator.History(); }
            if (liberator.has("mail") && liberator.Mail)       { log("mail");       liberator.mail       = liberator.Mail(); }
            if (liberator.has("tabs") && liberator.Tabs)       { log("tabs");       liberator.tabs       = liberator.Tabs(); }
            if (liberator.has("marks"))      { log("marks");      liberator.marks      = liberator.Marks(); }
            if (liberator.has("quickmarks")) { log("quickmarks"); liberator.quickmarks = liberator.QuickMarks(); }
            if (liberator.has("hints"))      { log("hints");      liberator.hints      = liberator.Hints(); }
            if (liberator.has("addressbook") && liberator.Addressbook)      { log("addressbook");      liberator.addressbook      = liberator.Addressbook(); }

            liberator.log("All modules loaded", 3);

            // This adds options/mappings/commands which are only valid in this particular extension
            if (liberator.config.init)
            {
                liberator.config.init();
                // liberator.log("Loaded additional mappings, etc. for " + liberator.config.name, 3);
            }

            // we define some shortcuts to functions which are used often
            liberator.echo    = function (str, flags) { liberator.commandline.echo(str, liberator.commandline.HL_NORMAL, flags); };
            liberator.echoerr = function (str, flags) { liberator.commandline.echo(str, liberator.commandline.HL_ERRORMSG, flags); };

            liberator.globalVariables = {};

            // namespace for plugins/scripts. Actually (only) the active plugin must/can set a
            // v.plugins.mode = <str> string to show on v.modes.CUSTOM
            // v.plugins.stop = <func> hooked on a v.modes.reset() 
            // v.plugins.onEvent = <func> function triggered, on keypresses (unless <esc>) (see events.js)
            liberator.plugins = {};

            // TODO: move elsewhere
            liberator.registerCallback("submit", liberator.modes.EX, function (command) { liberator.execute(command); });
            liberator.registerCallback("complete", liberator.modes.EX, function (str) { return liberator.completion.exTabCompletion(str); });

            // first time intro message
            if (liberator.options.getPref("extensions." + liberator.config.name.toLowerCase() + ".firsttime", true))
            {
                setTimeout(function () {
                    liberator.help();
                    liberator.options.setPref("extensions." + liberator.config.name.toLowerCase() + ".firsttime", false);
                }, 1000);
            }

            // always start in normal mode
            liberator.modes.reset();

            // TODO: we should have some class where all this guioptions stuff fits well
            hideGUI();

            // finally, read a ~/.vimperatorrc
            // make sourcing asynchronous, otherwise commands that open new tabs won't work
            setTimeout(function () {

                var rcFile = liberator.io.getRCFile();
                if (rcFile)
                    liberator.io.source(rcFile.path, true);
                else
                    liberator.log("No user RC file found", 3);

                // also source plugins in ~/.vimperator/plugin/
                try
                {
                    var pluginDir = liberator.io.getSpecialDirectory("plugin");
                    if (pluginDir)
                    {
                        var files = liberator.io.readDirectory(pluginDir.path);
                        liberator.log("Sourcing plugin directory...", 3);
                        files.forEach(function (file) {
                            if (!file.isDirectory() && /\.(js|vimp)$/i.test(file.path))
                                liberator.io.source(file.path, false);
                        });
                    }
                    else
                    {
                        liberator.log("No user plugin directory found", 3);
                    }
                }
                catch (e)
                {
                    // thrown if directory does not exist
                    //liberator.log("Error sourcing plugin directory: " + e);
                }

                // after sourcing the initialization files, this function will set
                // all gui options to their default values, if they have not been
                // set before by any rc file
                for (let option in liberator.options)
                {
                    if (option.setter && !option.hasChanged)
                        option.reset();
                }
            }, 0);

            liberator.statusline.update();
            liberator.log(liberator.config.name + " fully initialized", 1);
        },

        shutdown: function ()
        {
            // save our preferences
            liberator.commandline.destroy();
            liberator.options.destroy();
            liberator.events.destroy();
            if (liberator.has("quickmarks"))
                liberator.quickmarks.destroy();

            window.dump("All liberator modules destroyed\n");
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
window.addEventListener("load",   liberator.startup,  false);
window.addEventListener("unload", liberator.shutdown, false);

// vim: set fdm=marker sw=4 ts=4 et:
