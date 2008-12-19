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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const plugins = {};
plugins.__proto__ = modules;

const EVAL_ERROR = "__liberator_eval_error";
const EVAL_RESULT = "__liberator_eval_result";
const EVAL_STRING = "__liberator_eval_string";
const userContext = {
    __proto__: modules
};

const liberator = (function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const threadManager = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager);
    function Runnable(self, func, args)
    {
        this.self = self;
        this.func = func;
        this.args = args;
    }
    Runnable.prototype = {
        QueryInterface: XPCOMUtils.generateQI([Ci.nsIRunnable]),
        run: function () { this.func.apply(this.self, this.args); }
    };

    var callbacks = [];
    var observers = [];
    function registerObserver(type, callback)
    {
        observers.push([type, callback]);
    }

    let nError = 0;
    function loadModule(name, func)
    {
        let message = "Loading module " + name + "...";
        try
        {
            liberator.log(message, 0);
            liberator.dump(message);
            modules[name] = func();
            liberator.triggerObserver("load_" + name, name);
        }
        catch (e)
        {
            if (nError++ == 0)
                window.toJavaScriptConsole();
            liberator.reportError(e);
        }
    }

    // Only general options are added here, which are valid for all vimperator like extensions
    registerObserver("load_options", function ()
    {
        options.add(["errorbells", "eb"],
            "Ring the bell when an error message is displayed",
            "boolean", false);

        options.add(["exrc", "ex"],
            "Allow reading of an RC file in the current directory",
            "boolean", false);

        const groups = {
            config: {
                opts: config.guioptions,
                setter: function (opts)
                {
                    for (let [opt, [,ids]] in Iterator(this.opts))
                    {
                        ids.map(function (id) document.getElementById(id))
                           .forEach(function (elem)
                        {
                            if (elem)
                                elem.collapsed = (opts.indexOf(opt) == -1);
                        });
                    }
                }
            },
            scroll: {
                opts: { r: ["Right Scrollbar", "vertical"], l: ["Left Scrollbar", "vertical"], b: ["Bottom Scrollbar", "horizontal"] },
                setter: function (opts)
                {
                    let dir = ["horizontal", "vertical"].filter(function (dir) !Array.some(opts, function (o) this.opts[o] && this.opts[o][1] == dir, this), this);
                    let class = dir.map(function (dir) "html|html > xul|scrollbar[orient=" + dir + "]");

                    if (class.length)
                        styles.addSheet("scrollbar", "*", class.join(", ") + " { visibility: collapse !important; }", true, true);
                    else
                        styles.removeSheet("scrollbar", null, null, null, true);
                    options.safeSetPref("layout.scrollbar.side", opts.indexOf("l") >= 0 ? 3 : 2);
                },
                validator: function (opts) (opts.indexOf("l") < 0 || opts.indexOf("r") < 0)
            },
            tab: {
                opts: {
                    n: ["Tab number", highlight.selector("TabNumber")],
                    N: ["Tab number over icon", highlight.selector("TabIconNumber")]
                },
                setter: function (opts)
                {
                    let classes = [v[1] for ([k, v] in Iterator(this.opts)) if (opts.indexOf(k) < 0)];
                    let css = classes.length ? classes.join(",") + "{ display: none; }" : "";
                    styles.addSheet("taboptions", "chrome://*", css, true, true);
                    statusline.updateTabCount();
                }
            }
        };

        options.add(["guioptions", "go"],
            "Show or hide certain GUI elements like the menu or toolbar",
            "charlist", config.defaults.guioptions || "",
            {
                setter: function (value)
                {
                    for (let [,group] in Iterator(groups))
                        group.setter(value);
                    return value;
                },
                completer: function (filter)
                {
                    let opts = [v.opts for ([k, v] in Iterator(groups))];
                    opts = opts.map(function (opt) [[k, v[0]] for ([k, v] in Iterator(opt))]);
                    return util.Array.flatten(opts);
                },
                validator: function (val) Option.validateCompleter.call(this, val) &&
                        [v for ([k, v] in Iterator(groups))].every(function (g) !g.validator || g.validator(val))
            });

        options.add(["helpfile", "hf"],
            "Name of the main help file",
            "string", "intro.html");

        options.add(["loadplugins", "lpl"],
            "Load plugin scripts when starting up",
            "boolean", true);

        options.add(["verbose", "vbs"],
            "Define which info messages are displayed",
            "number", 1,
            { validator: function (value) value >= 0 && value <= 15 });

        options.add(["visualbell", "vb"],
            "Use visual bell instead of beeping on errors",
            "boolean", false,
            {
                setter: function (value)
                {
                    options.safeSetPref("accessibility.typeaheadfind.enablesound", !value);
                    return value;
                }
            });
    });

    registerObserver("load_mappings", function ()
    {
        mappings.add(modes.all, ["<F1>"],
            "Open help window",
            function () { liberator.help(); });

        if (liberator.has("session"))
        {
            mappings.add([modes.NORMAL], ["ZQ"],
                "Quit and don't save the session",
                function () { liberator.quit(false); });
        }

        mappings.add([modes.NORMAL], ["ZZ"],
            "Quit and save the session",
            function () { liberator.quit(true); });
    });

    registerObserver("load_commands", function ()
    {
        commands.add(["addo[ns]"],
            "Manage available Extensions and Themes",
            function ()
            {
                liberator.open("chrome://mozapps/content/extensions/extensions.xul",
                    (options["newtab"] && options.get("newtab").has("all", "addons"))
                        ? liberator.NEW_TAB: liberator.CURRENT_TAB);
            },
            { argCount: "0" });

        commands.add(["beep"],
            "Play a system beep",
            function () { liberator.beep(); },
            { argCount: "0" });

        commands.add(["dia[log]"],
            "Open a " + config.name + " dialog",
            function (args)
            {
                let arg = args[0];

                try
                {
                    let dialogs = config.dialogs;

                    for (let i = 0; i < dialogs.length; i++)
                    {
                        if (dialogs[i][0] == arg)
                            return dialogs[i][2]();
                    }

                    liberator.echoerr("E475: Invalid argument: " + arg);
                }
                catch (e)
                {
                    liberator.echoerr("Error opening '" + arg + "': " + e);
                }
            },
            {
                argCount: "1",
                bang: true,
                completer: function (context, args) completion.dialog(context)
            });

        // TODO: move this
        function getMenuItems()
        {
            function addChildren(node, parent)
            {
                for (let [,item] in Iterator(node.childNodes))
                {
                    if (item.childNodes.length == 0 && item.localName == "menuitem"
                        && !/rdf:http:/.test(item.label)) // FIXME
                    {
                        item.fullMenuPath = parent + item.label;
                        items.push(item);
                    }
                    else
                    {
                        path = parent;
                        if (item.localName == "menu")
                            path += item.label + ".";
                        addChildren(item, path);
                    }
                }
            }

            let items = [];
            addChildren(document.getElementById(config.guioptions["m"][1]), "");
            return items;
        }

        commands.add(["em[enu]"],
            "Execute the specified menu item from the command line",
            function (args)
            {
                args = args.literalArg;
                let items = getMenuItems();

                if (!items.some(function (i) i.fullMenuPath == args))
                {
                    liberator.echoerr("E334: Menu not found: " + args);
                    return;
                }

                for (let [,item] in Iterator(items))
                {
                    if (item.fullMenuPath == args)
                        item.doCommand();
                }
            },
            {
                argCount: "1",
                // TODO: add this as a standard menu completion function
                completer: function (context)
                {
                    context.title = ["Menu Path", "Label"];
                    context.keys = { text: "fullMenuPath", description: "label" };
                    context.completions = getMenuItems();
                },
                literal: 0
            });

        commands.add(["exe[cute]"],
            "Execute the argument as an Ex command",
            // FIXME: this should evaluate each arg separately then join
            // with " " before executing.
            // E.g. :execute "source" io.getRCFile().path
            // Need to fix commands.parseArgs which currently strips the quotes
            // from quoted args
            function (args)
            {
                try
                {
                    let cmd = liberator.eval(args.string);
                    liberator.execute(cmd);
                }
                catch (e)
                {
                    liberator.echoerr(e);
                    return;
                }
            });

        commands.add(["exu[sage]"],
            "List all Ex commands with a short description",
            function (args) { showHelpIndex("ex-cmd-index", commands, args.bang); },
            {
                argCount: "0",
                bang: true
            });

        commands.add(["h[elp]"],
            "Display help",
            function (args)
            {
                if (args.bang)
                {
                    liberator.echoerr("E478: Don't panic!");
                    return;
                }

                liberator.help(args.literalArg);
            },
            {
                argCount: "?",
                bang: true,
                completer: function (context) completion.help(context),
                literal: 0
            });

        commands.add(["javas[cript]", "js"],
            "Run a JavaScript command through eval()",
            function (args)
            {
                if (args.bang) // open javascript console
                {
                    liberator.open("chrome://global/content/console.xul",
                        (options["newtab"] && options.get("newtab").has("all", "javascript"))
                            ? liberator.NEW_TAB : liberator.CURRENT_TAB);
                }
                else
                {
                    try
                    {
                        liberator.eval(args.string);
                    }
                    catch (e)
                    {
                        liberator.echoerr(e);
                    }
                }
            },
            {
                bang: true,
                completer: function (context) completion.javascript(context),
                hereDoc: true,
                literal: 0
            });

        commands.add(["loadplugins", "lpl"],
            "Load all plugins immediately",
            function () { liberator.loadPlugins(); },
            { argCount: "0" });

        commands.add(["norm[al]"],
            "Execute Normal mode commands",
            function (args) { events.feedkeys(args.string, args.bang); },
            {
                argCount: "+",
                bang: true
            });

        commands.add(["optionu[sage]"],
            "List all options with a short description",
            function (args) { showHelpIndex("option-index", options, args.bang); },
            {
                argCount: "0",
                bang: true
            });

        commands.add(["q[uit]"],
            liberator.has("tabs") ? "Quit current tab" : "Quit application",
            function (args)
            {
                if (liberator.has("tabs"))
                    tabs.remove(getBrowser().mCurrentTab, 1, false, 1);
                else
                    liberator.quit(false, args.bang);
            },
            {
                argCount: "0",
                bang: true
            });

        commands.add(["res[tart]"],
            "Force " + config.name + " to restart",
            function () { liberator.restart(); },
            { argCount: "0" });

        commands.add(["time"],
            "Profile a piece of code or run a command multiple times",
            function (args)
            {
                let count = args.count;
                let special = args.bang;
                args = args.string;

                if (args[0] == ":")
                    var method = function () liberator.execute(args);
                else
                    method = liberator.eval("(function () {" + args + "})");

                try
                {
                    if (count > 1)
                    {
                        let each, eachUnits, totalUnits;
                        let total = 0;

                        for (let i in util.interruptableRange(0, count, 500))
                        {
                            let now = Date.now();
                            method();
                            total += Date.now() - now;
                        }

                        if (special)
                            return;

                        if (total / count >= 100)
                        {
                            each = total / 1000.0 / count;
                            eachUnits = "sec";
                        }
                        else
                        {
                            each = total / count;
                            eachUnits = "msec";
                        }

                        if (total >= 100)
                        {
                            total = total / 1000.0;
                            totalUnits = "sec";
                        }
                        else
                        {
                            totalUnits = "msec";
                        }

                        let str = template.commandOutput(
                                <table>
                                    <tr highlight="Title" align="left">
                                        <th colspan="3">Code execution summary</th>
                                    </tr>
                                    <tr><td>&#xa0;&#xa0;Executed:</td><td align="right"><span class="times-executed">{count}</span></td><td>times</td></tr>
                                    <tr><td>&#xa0;&#xa0;Average time:</td><td align="right"><span class="time-average">{each.toFixed(2)}</span></td><td>{eachUnits}</td></tr>
                                    <tr><td>&#xa0;&#xa0;Total time:</td><td align="right"><span class="time-total">{total.toFixed(2)}</span></td><td>{totalUnits}</td></tr>
                                </table>);
                        commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                    }
                    else
                    {
                        let beforeTime = Date.now();
                        method();

                        if (special)
                            return;

                        let afterTime = Date.now();

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
            },
            {
                argCount: "+",
                bang: true,
                completer: function (context)
                {
                    if (/^:/.test(context.filter))
                        return completion.ex(context);
                    else
                        return completion.javascript(context);
                },
                count: true,
                literal: 0
            });

        commands.add(["ve[rsion]"],
            "Show version information",
            function (args)
            {
                if (args.bang)
                    liberator.open("about:");
                else
                    liberator.echo(template.commandOutput(<>{config.name} {liberator.version} running on:<br/>{navigator.userAgent}</>));
            },
            {
                argCount: "0",
                bang: true
            });

        commands.add(["viu[sage]"],
            "List all mappings with a short description",
            function (args) { showHelpIndex("normal-index", mappings, args.bang); },
            {
                argCount: "0",
                bang: true
            });
    });

    // initially hide all GUI, it is later restored unless the user has :set go= or something
    // similar in his config
    function hideGUI()
    {
        let guioptions = config.guioptions;
        for (let option in guioptions)
        {
            guioptions[option].forEach(function (elem) {
                try
                {
                    document.getElementById(elem).collapsed = true;
                }
                catch (e) {}
            });
        }
    }

    // return the platform normalised to Vim values
    function getPlatformFeature()
    {
        let platform = navigator.platform;

        return /^Mac/.test(platform) ? "MacUnix" : platform == "Win32" ? "Win32" : "Unix";
    }

    // show a usage index either in the MOW or as a full help page
    function showHelpIndex(tag, items, inMow)
    {
        if (inMow)
            liberator.echo(template.usage(items), commandline.FORCE_MULTILINE);
        else
            liberator.help(tag);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        modules: modules,

        get mode()      modes.main,
        set mode(value) modes.main = value,

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
        //  TODO: move to ui.js?
        registerCallback: function (type, mode, func)
        {
            // TODO: check if callback is already registered
            callbacks.push([type, mode, func]);
        },

        triggerCallback: function (type, mode, data)
        {
            // liberator.dump("type: " + type + " mode: " + mode + "data: " + data + "\n");
            for (let i = 0; i < callbacks.length; i++)
            {
                let [thistype, thismode, thisfunc] = callbacks[i];
                if (mode == thismode && type == thistype)
                    return thisfunc.call(this, data);
            }
            return false;
        },

        registerObserver: registerObserver,

        unregisterObserver: function (type, callback)
        {
            observers = observers.filter(function ([t, c]) t != type || c != callback);
        },

        triggerObserver: function (type)
        {
            for (let [,[thistype, callback]] in Iterator(observers))
            {
                if (thistype == type)
                    callback.apply(null, Array.slice(arguments, 1));
            }
        },

        beep: function ()
        {
            // FIXME: popups clear the command-line
            if (options["visualbell"])
            {
                // flash the visual bell
                let popup = document.getElementById("liberator-visualbell");
                let win = config.visualbellWindow;
                let rect = win.getBoundingClientRect();
                let width = rect.right - rect.left;
                let height = rect.bottom - rect.top;

                // NOTE: this doesn't seem to work in FF3 with full box dimensions
                popup.openPopup(win, "overlap", 1, 1, false, false);
                popup.sizeTo(width - 2, height - 2);
                setTimeout(function () { popup.hidePopup(); }, 20);
            }
            else
            {
                let soundService = Cc["@mozilla.org/sound;1"].getService(Ci.nsISound);
                soundService.beep();
            }
            return false; // so you can do: if (...) return liberator.beep();
        },

        newThread: function () threadManager.newThread(0),

        callAsync: function (thread, self, func)
        {
            hread = thread || threadManager.newThread(0);
            thread.dispatch(new Runnable(self, func, Array.slice(arguments, 2)), thread.DISPATCH_NORMAL);
        },

        // be sure to call GUI related methods like alert() or dump() ONLY in the main thread
        callFunctionInThread: function (thread, func)
        {
            thread = thread || threadManager.newThread(0);

            // DISPATCH_SYNC is necessary, otherwise strange things will happen
            thread.dispatch(new Runnable(null, func, Array.slice(arguments, 2)), thread.DISPATCH_SYNC);
        },

        // NOTE: "browser.dom.window.dump.enabled" preference needs to be set
        dump: function (message)
        {
            if (typeof message == "object")
                message = util.objectToString(message);
            else
                message += "\n";
            window.dump(("config" in modules && config.name.toLowerCase()) + ": " + message);
        },

        dumpStack: function (msg, frames)
        {
            let stack = Error().stack.replace(/(?:.*\n){2}/, "");
            if (frames != null)
                [stack] = stack.match(RegExp("(?:.*\n){0," + frames + "}"));
            liberator.dump((msg || "Stack") + "\n" + stack);
        },

        echo: function (str, flags)
        {
            commandline.echo(str, commandline.HL_NORMAL, flags);
        },

        // TODO: Vim replaces unprintable characters in echoerr/echomsg
        echoerr: function (str, flags)
        {
            flags |= commandline.APPEND_TO_MESSAGES;

            if (typeof str == "object" && "echoerr" in str)
                str = str.echoerr;
            else if (str instanceof Error)
                str = str.fileName + ":" + str.lineNumber + ": " + str;

            if (options["errorbells"])
                liberator.beep();

            commandline.echo(str, commandline.HL_ERRORMSG, flags);
        },

        // TODO: add proper level constants
        echomsg: function (str, verbosity, flags)
        {
            // TODO: is there a reason for this? --djk
            // yes, it doesn't show the MOW on startup if you have e.g. some qmarks in your vimperatorrc.
            // Feel free to add another flag like DONT_OPEN_MULTILINE if really needed --mst
            //
            // But it's _supposed_ to show the MOW on startup when there are
            // messages, surely?  As far as I'm concerned it essentially works
            // exactly as it should with the DISALLOW_MULTILINE flag removed.
            // Sending N messages to the command-line in a row and having them
            // overwrite each other is completely broken. I also think many of
            // those messages like "Added quick mark" are plain silly but if
            // you don't like them you can set verbose=0, or use :silent when
            // someone adds it. I reckon another flag and 'class' of messages
            // is just going to unnecessarily complicate things. --djk
            flags |= commandline.APPEND_TO_MESSAGES | commandline.DISALLOW_MULTILINE;

            if (verbosity == null)
                verbosity = 0; // verbosity level is exclusionary

            if (options["verbose"] >= verbosity)
                commandline.echo(str, commandline.HL_INFOMSG, flags);
        },

        loadScript: function (uri, context)
        {
            let loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
            loader.loadSubScript(uri, context);
        },

        eval: function (str, context)
        {
            try
            {
                if (!context)
                    context = userContext;
                context[EVAL_ERROR] = null;
                context[EVAL_STRING] = str;
                context[EVAL_RESULT] = null;
                this.loadScript("chrome://liberator/content/eval.js", context);
                if (context[EVAL_ERROR])
                {
                    try
                    {
                        context[EVAL_ERROR].fileName = io.sourcing.file;
                        context[EVAL_ERROR].lineNumber += io.sourcing.line;
                    }
                    catch (e) {}
                    throw context[EVAL_ERROR];
                }
                return context[EVAL_RESULT];
            }
            finally
            {
                delete context[EVAL_ERROR];
                delete context[EVAL_RESULT];
                delete context[EVAL_STRING];
            }
        },

        // partial sixth level expression evaluation
        // TODO: what is that really needed for, and where could it be used?
        //       Or should it be removed? (c) Viktor
        //       Better name?  See other liberator.eval()
        //       I agree, the name is confusing, and so is the
        //           description --Kris
        evalExpression: function (string)
        {
            string = string.toString().replace(/^\s*/, "").replace(/\s*$/, "");
            let matches = string.match(/^&(\w+)/);

            if (matches)
            {
                let opt = this.options.get(matches[1]);

                if (!opt)
                {
                    this.echoerr("E113: Unknown option: " + matches[1]);
                    return;
                }

                let type = opt.type;
                let value = opt.getter();

                if (type != "boolean" && type != "number")
                    value = value.toString();

                return value;
            }

            // String
            else if (matches = string.match(/^(['"])([^\1]*?[^\\]?)\1/))
            {
                if (matches)
                {
                    return matches[2].toString();
                }
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

            let reference = this.variableReference(string);

            if (!reference[0])
                this.echoerr("E121: Undefined variable: " + string);
            else
                return reference[0][reference[1]];

            return;
        },

        // Execute an Ex command like str=":zoom 300"
        execute: function (str, modifiers)
        {
            // skip comments and blank lines
            if (/^\s*("|$)/.test(str))
                return;

            modifiers = modifiers || {};

            let err = null;
            let [count, cmd, special, args] = commands.parseCommand(str.replace(/^'(.*)'$/, "$1"));
            let command = commands.get(cmd);

            if (command === null)
            {
                err = "E492: Not a " + config.name.toLowerCase() + " command: " + str;
                liberator.focusContent();
            }
            else if (command.action === null)
            {
                err = "E666: Internal error: command.action === null"; // TODO: need to perform this test? -- djk
            }
            else if (count != -1 && !command.count)
            {
                err = "E481: No range allowed";
            }
            else if (special && !command.bang)
            {
                err = "E477: No ! allowed";
            }

            if (err)
                return liberator.echoerr(err);
            commandline.command = str.replace(/^\s*:\s*/, "");
            command.execute(args, special, count, modifiers);
        },

        // after pressing Escape, put focus on a non-input field of the browser document
        // if clearFocusedElement, also blur a focused link
        focusContent: function (clearFocusedElement)
        {
            let ww = Cc["@mozilla.org/embedcomp/window-watcher;1"].getService(Ci.nsIWindowWatcher);
            if (window != ww.activeWindow)
                return;

            let elem = config.mainWidget || window.content;
            // TODO: make more generic
            try
            {
                if (this.has("mail") && !config.isComposeWindow)
                {
                    let i = gDBView.selection.currentIndex;
                    if (i == -1 && gDBView.rowCount >= 0)
                        i = 0;
                    gDBView.selection.select(i);
                }
                else if (this.has("tabs"))
                {
                    let frame = tabs.localStore.focusedFrame;
                    if (frame && frame.top == window.content)
                        elem = frame;
                }
            }
            catch (e) {}
            if (clearFocusedElement && document.commandDispatcher.focusedElement)
                document.commandDispatcher.focusedElement.blur();
            if (elem && (elem != document.commandDispatcher.focusedElement))
                elem.focus();
        },

        // does this liberator extension have a certain feature?
        has: function (feature) config.features.indexOf(feature) >= 0,

        hasExtension: function (name)
        {
            let manager = Cc["@mozilla.org/extensions/manager;1"].getService(Ci.nsIExtensionManager);
            let extensions = manager.getItemList(Ci.nsIUpdateItem.TYPE_EXTENSION, {});

            return extensions.some(function (e) e.name == name);
        },

        help: function (topic)
        {
            let where = (options["newtab"] && options.get("newtab").has("all", "help"))
                            ? liberator.NEW_TAB : liberator.CURRENT_TAB;

            if (!topic)
            {
                let helpFile = options["helpfile"];

                if (config.helpFiles.indexOf(helpFile) != -1)
                    liberator.open("chrome://liberator/locale/" + helpFile, where);
                else
                    liberator.echomsg("Sorry, help file " + helpFile.quote() + " not found");

                return;
            }

            function jumpToTag(file, tag)
            {
                liberator.open("chrome://liberator/locale/" + file, where);
                // TODO: it would be better to wait for pageLoad
                setTimeout(function () {
                    let elem = buffer.evaluateXPath('//*[@class="tag" and text()="' + tag + '"]').snapshotItem(0);
                    if (elem)
                        buffer.scrollTo(0, elem.getBoundingClientRect().top - 10); // 10px context
                    else
                        liberator.dump('no element: ' + '@class="tag" and text()="' + tag + '"\n' );
                }, 500);
            }

            let items = completion.runCompleter("help", topic);
            let partialMatch = -1;

            for (let [i, item] in Iterator(items))
            {
                if (item[0] == topic)
                {
                    jumpToTag(item[1], item[0]);
                    return;
                }
                else if (partialMatch == -1 && item[0].indexOf(topic) > -1)
                {
                    partialMatch = i;
                }
            }

            if (partialMatch > -1)
                jumpToTag(items[partialMatch][1], items[partialMatch][0]);
            else
                liberator.echoerr("E149: Sorry, no help for " + topic);
        },

        globalVariables: {},

        loadModule: function (name, func) { loadModule(name, func); },

        loadPlugins: function ()
        {
            // FIXME: largely duplicated for loading macros
            try
            {
                let dirs = io.getRuntimeDirectories("plugin");

                if (dirs.length == 0)
                {
                    liberator.log("No user plugin directory found", 3);
                    return;
                }
                for (let [,dir] in Iterator(dirs))
                {
                    // TODO: search plugins/**/* for plugins
                    liberator.echomsg('Searching for "plugin/*.{js,vimp}" in ' + dir.path.quote(), 2);

                    liberator.log("Sourcing plugin directory: " + dir.path + "...", 3);

                    let files = io.readDirectory(dir.path, true);

                    files.forEach(function (file) {
                        if (!file.isDirectory() && /\.(js|vimp)$/i.test(file.path) && !(file.path in liberator.pluginFiles))
                        {
                            try
                            {
                                io.source(file.path, false);
                                liberator.pluginFiles[file.path] = true;
                            }
                            catch (e)
                            {
                                liberator.reportError(e);
                            }
                        }
                    });
                }
            }
            catch (e)
            {
                // thrown if directory does not exist
                liberator.log("Error sourcing plugin directory: " + e, 9);
            }
        },

        // logs a message to the javascript error console
        // if msg is an object, it is beautified
        // TODO: add proper level constants
        log: function (msg, level)
        {
            let verbose = 0;
            if (level == undefined)
                level = 1;

            // options does not exist at the very beginning
            if (modules.options)
                verbose = options.getPref("extensions.liberator.loglevel", 0);

            if (level > verbose)
                return;

            if (typeof msg == "object")
                msg = util.objectToString(msg, false);

            const consoleService = Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService);
            consoleService.logStringMessage(config.name.toLowerCase() + ": " + msg);
        },

        // open one or more URLs
        //
        // @param urls: either a string or an array of urls
        //              The array can look like this:
        //              ["url1", "url2", "url3", ...] or:
        //              [["url1", postdata1], ["url2", postdata2], ...]
        // @param where: if ommited, CURRENT_TAB is assumed
        //                  but NEW_TAB is set when liberator.forceNewTab is true.
        // @param force: Don't prompt whether to open more than 20 tabs.
        // @returns true when load was initiated, or false on error
        open: function (urls, where, force)
        {
            // convert the string to an array of converted URLs
            // -> see util.stringToURLArray for more details
            if (typeof urls == "string")
                urls = util.stringToURLArray(urls);

            if (urls.length > 20 && !force)
            {
                commandline.input("This will open " + urls.length + " new tabs. Would you like to continue? (yes/[no]) ",
                    function (resp) {
                        if (resp && resp.match(/^y(es)?$/i))
                            liberator.open(urls, where, true);
                    });
                return true;
            }

            if (urls.length == 0)
                return false;

            function open(urls, where)
            {
                let url = Array.concat(urls)[0];
                let postdata = Array.concat(urls)[1];
                let whichwindow = window;

                // decide where to load the first url
                switch (where)
                {
                    case liberator.CURRENT_TAB:
                        getBrowser().loadURIWithFlags(url, Ci.nsIWebNavigation.LOAD_FLAGS_NONE, null, null, postdata);
                        break;

                    case liberator.NEW_BACKGROUND_TAB:
                    case liberator.NEW_TAB:
                        if (!liberator.has("tabs"))
                            return open(urls, liberator.NEW_WINDOW);

                        let tab = getBrowser().addTab(url, null, null, postdata);

                        if (where == liberator.NEW_TAB)
                            getBrowser().selectedTab = tab;
                        break;

                    case liberator.NEW_WINDOW:
                        const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
                        window.open();
                        whichwindow = wm.getMostRecentWindow("navigator:browser");
                        whichwindow.loadURI(url, null, postdata);
                        break;

                    default:
                        liberator.echoerr("Exxx: Invalid 'where' directive in liberator.open(...)");
                        return false;
                }
            }

            if (liberator.forceNewTab)
                where = liberator.NEW_TAB;
            else if (!where)
                where = liberator.CURRENT_TAB;

            for (let [i, url] in Iterator(urls))
            {
                open(url, where);
                where = liberator.NEW_BACKGROUND_TAB;
            }

            return true;
        },

        pluginFiles: {},

        // namespace for plugins/scripts. Actually (only) the active plugin must/can set a
        // v.plugins.mode = <str> string to show on v.modes.CUSTOM
        // v.plugins.stop = <func> hooked on a v.modes.reset()
        // v.plugins.onEvent = <func> function triggered, on keypresses (unless <esc>) (see events.js)
        plugins: plugins,

        // quit liberator, no matter how many tabs/windows are open
        quit: function (saveSession, force)
        {
            // TODO: Use safeSetPref?
            if (saveSession)
                options.setPref("browser.startup.page", 3); // start with saved session
            else
                options.setPref("browser.startup.page", 1); // start with default homepage session

            const nsIAppStartup = Ci.nsIAppStartup;
            if (force)
                Cc["@mozilla.org/toolkit/app-startup;1"]
                          .getService(nsIAppStartup)
                          .quit(nsIAppStartup.eForceQuit);
            else
                window.goQuitApplication();
        },

        reportError: function (error)
        {
            if (Cu.reportError)
                Cu.reportError(error);
            try
            {
                let obj = {
                    toString: function () error.toString(),
                    stack: <>{error.stack.replace(/^/mg, "\t")}</>
                };
                for (let [k, v] in Iterator(error))
                {
                    if (!(k in obj))
                        obj[k] = v;
                }
                liberator.dump(obj);
                liberator.dump("");
            }
            catch (e) {}
        },

        restart: function ()
        {
            const nsIAppStartup = Ci.nsIAppStartup;

            // notify all windows that an application quit has been requested.
            const os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
            const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
            os.notifyObservers(cancelQuit, "quit-application-requested", null);

            // something aborted the quit process.
            if (cancelQuit.data)
                return;

            // notify all windows that an application quit has been granted.
            os.notifyObservers(null, "quit-application-granted", null);

            // enumerate all windows and call shutdown handlers
            const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
            let windows = wm.getEnumerator(null);
            while (windows.hasMoreElements())
            {
                let win = windows.getNext();
                if (("tryToClose" in win) && !win.tryToClose())
                    return;
            }
            Cc["@mozilla.org/toolkit/app-startup;1"].getService(nsIAppStartup)
                .quit(nsIAppStartup.eRestart | nsIAppStartup.eAttemptQuit);
        },

        // TODO: move to {muttator,vimperator,...}.js
        // this function is called when the chrome is ready
        startup: function ()
        {
            let start = Date.now();
            liberator.log("Initializing liberator object...", 0);

            config.features = config.features || [];
            config.features.push(getPlatformFeature());
            config.defaults = config.defaults || {};
            config.guioptions = config.guioptions || {};
            config.browserModes = config.browserModes || [modes.NORMAL];
            config.mailModes = config.mailModes || [modes.NORMAL];
            // TODO: suitable defaults?
            //config.mainWidget
            //config.mainWindowID
            //config.visualbellWindow
            //config.styleableChrome
            config.autocommands = config.autocommands || [];
            config.dialogs = config.dialogs || [];
            config.helpFiles = config.helpFiles || [];

            liberator.triggerObserver("load");

            // commands must always be the first module to be initialized
            loadModule("commands",     Commands);
            loadModule("options",      Options);
            loadModule("mappings",     Mappings);
            loadModule("buffer",       Buffer);
            loadModule("events",       Events);
            loadModule("commandline",  CommandLine);
            loadModule("statusline",   StatusLine);
            loadModule("editor",       Editor);
            loadModule("autocommands", AutoCommands);
            loadModule("io",           IO);
            loadModule("completion",   Completion);

            // add options/mappings/commands which are only valid in this particular extension
            if (config.init)
                config.init();

            liberator.log("All modules loaded", 3);

            // first time intro message
            const firstTime = "extensions." + config.name.toLowerCase() + ".firsttime";
            if (options.getPref(firstTime, true))
            {
                setTimeout(function () {
                    liberator.help();
                    options.setPref(firstTime, false);
                }, 1000);
            }

            // always start in normal mode
            modes.reset();

            // TODO: we should have some class where all this guioptions stuff fits well
            hideGUI();

            // finally, read a ~/.vimperatorrc and plugin/**.{vimp,js}
            // make sourcing asynchronous, otherwise commands that open new tabs won't work
            setTimeout(function () {

                let rcFile = io.getRCFile("~");

                if (rcFile)
                    io.source(rcFile.path, true);
                else
                    liberator.log("No user RC file found", 3);

                if (options["exrc"])
                {
                    let localRcFile = io.getRCFile(io.getCurrentDirectory().path);
                    if (localRcFile)
                        io.source(localRcFile.path, true);
                }

                if (options["loadplugins"])
                    liberator.loadPlugins();

                // after sourcing the initialization files, this function will set
                // all gui options to their default values, if they have not been
                // set before by any rc file
                for (let option in options)
                {
                    if (option.setter)
                        option.value = option.value;
                }

                liberator.triggerObserver("enter", null);
                autocommands.trigger(config.name + "Enter", {});
            }, 0);

            statusline.update();

            liberator.dump("loaded in " + (Date.now() - start) + " ms");
            liberator.log(config.name + " fully initialized", 0);
        },

        shutdown: function ()
        {
            autocommands.trigger(config.name + "LeavePre", {});

            storage.saveAll();

            liberator.triggerObserver("shutdown", null);

            liberator.dump("All liberator modules destroyed\n");

            autocommands.trigger(config.name + "Leave", {});
        },

        sleep: function (delay)
        {
            let mainThread = threadManager.mainThread;

            let end = Date.now() + delay;
            while (Date.now() < end)
                mainThread.processNextEvent(true);
            return true;
        },

        callInMainThread: function (callback, self)
        {
            let mainThread = threadManager.mainThread;
            if (!threadManager.isMainThread)
                mainThread.dispatch({ run: callback.call(self) }, mainThread.DISPATCH_NORMAL);
            else
                callback.call(self);
        },

        threadYield: function (flush, interruptable)
        {
            let mainThread = threadManager.mainThread;
            liberator.interrupted = false;
            do
            {
                mainThread.processNextEvent(!flush);
                if (liberator.interrupted)
                    throw new Error("Interrupted");
            }
            while (flush && mainThread.hasPendingEvents());
        },

        variableReference: function (string)
        {
            if (!string)
                return [null, null, null];

            let matches = string.match(/^([bwtglsv]):(\w+)/);
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

        get windows()
        {
            const wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
            let windows = [];
            let enumerator = wm.getEnumerator("navigator:browser");

            while (enumerator.hasMoreElements())
                windows.push(enumerator.getNext());

            return windows;
        }
    };
    //}}}
})(); //}}}

window.liberator = liberator;

// called when the chrome is fully loaded and before the main window is shown
window.addEventListener("load",   liberator.startup,  false);
window.addEventListener("unload", liberator.shutdown, false);

// vim: set fdm=marker sw=4 ts=4 et:
