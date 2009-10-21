// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


/** @scope modules */

Cu.import("resource://gre/modules/XPCOMUtils.jsm", modules);

const plugins = { __proto__: modules };
const userContext = { __proto__: modules };

const EVAL_ERROR = "__liberator_eval_error";
const EVAL_RESULT = "__liberator_eval_result";
const EVAL_STRING = "__liberator_eval_string";

const liberator = (function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

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

    const observers = {};

    function registerObserver(type, callback)
    {
        if (!(type in observers))
            observers[type] = [];
        observers[type].push(callback);
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
                toOpenWindowByType("global:console", "chrome://global/content/console.xul");
            liberator.reportError(e);
        }
    }

    // initially hide all GUI elements, they are later restored unless the user
    // has :set go= or something similar in his config
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

    // return the platform normalized to Vim values
    function getPlatformFeature()
    {
        let platform = navigator.platform;
        return /^Mac/.test(platform) ? "MacUnix" : platform == "Win32" ? "Win32" : "Unix";
    }

    // TODO: move this
    function getMenuItems()
    {
        function addChildren(node, parent)
        {
            for (let [, item] in Iterator(node.childNodes))
            {
                if (item.childNodes.length == 0 && item.localName == "menuitem"
                    && !/rdf:http:/.test(item.getAttribute("label"))) // FIXME
                {
                    item.fullMenuPath = parent + item.getAttribute("label");
                    items.push(item);
                }
                else
                {
                    let path = parent;
                    if (item.localName == "menu")
                        path += item.getAttribute("label") + ".";
                    addChildren(item, path);
                }
            }
        }

        let items = [];
        addChildren(document.getElementById(config.guioptions["m"][1]), "");
        return items;
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
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // Only general options are added here, which are valid for all Liberator extensions
    registerObserver("load_options", function () {

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
                    for (let [opt, [, ids]] in Iterator(this.opts))
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
                        styles.addSheet(true, "scrollbar", "*", class.join(", ") + " { visibility: collapse !important; }", true);
                    else
                        styles.removeSheet(true, "scrollbar");
                    options.safeSetPref("layout.scrollbar.side", opts.indexOf("l") >= 0 ? 3 : 2,
                        "See 'guioptions' scrollbar flags.");
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
                    const self = this;
                    let classes = [v[1] for ([k, v] in Iterator(this.opts)) if (opts.indexOf(k) < 0)];
                    let css = classes.length ? classes.join(",") + "{ display: none; }" : "";
                    styles.addSheet(true, "taboptions", "chrome://*", css);
                    tabs.tabsBound = Array.some(opts, function (k) k in self.opts);
                    statusline.updateTabCount();
                }
            }
        };

        options.add(["fullscreen", "fs"],
            "Show the current window fullscreen",
            "boolean", false,
            {
                setter: function (value) window.fullScreen = value,
                getter: function () window.fullScreen
            });

        options.add(["guioptions", "go"],
            "Show or hide certain GUI elements like the menu or toolbar",
            "charlist", config.defaults.guioptions || "",
            {
                setter: function (value)
                {
                    for (let [, group] in Iterator(groups))
                        group.setter(value);
                    return value;
                },
                completer: function (context)
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

        options.add(["titlestring"],
            "Change the title of the window",
            "string", config.defaults.titlestring || config.hostApplication,
            {
                setter: function (value)
                {
                    let win = document.documentElement;
                    function updateTitle(old, current)
                    {
                        document.title = document.title.replace(RegExp("(.*)" + util.escapeRegex(old)), "$1" + current);
                    }

                    // TODO: remove this FF3.5 test when we no longer support 3.0
                    //     : make this a config feature
                    if (services.get("privateBrowsing"))
                    {
                        let oldValue = win.getAttribute("titlemodifier_normal");
                        let suffix = win.getAttribute("titlemodifier_privatebrowsing").substr(oldValue.length);

                        win.setAttribute("titlemodifier_normal", value);
                        win.setAttribute("titlemodifier_privatebrowsing", value + suffix);

                        if (services.get("privateBrowsing").privateBrowsingEnabled)
                        {
                            updateTitle(oldValue + suffix, value + suffix);
                            return value;
                        }
                    }

                    updateTitle(win.getAttribute("titlemodifier"), value);
                    win.setAttribute("titlemodifier", value);

                    return value;
                }
            });

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
                    options.safeSetPref("accessibility.typeaheadfind.enablesound", !value,
                        "See 'visualbell' option");
                    return value;
                }
            });
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    registerObserver("load_mappings", function () {

        mappings.add(modes.all, ["<F1>"],
            "Open the help page",
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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var toolbox;

    registerObserver("load_commands", function () {

        commands.add(["addo[ns]"],
            "Manage available Extensions and Themes",
            function ()
            {
                liberator.open("chrome://mozapps/content/extensions/extensions.xul",
                    { from: "addons" });
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
                    // TODO: why are these sorts of properties arrays? --djk
                    let dialogs = config.dialogs;

                    for (let [, dialog] in Iterator(dialogs))
                    {
                        if (util.compareIgnoreCase(arg, dialog[0]) == 0)
                        {
                            dialog[2]();
                            return;
                        }
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
                completer: function (context)
                {
                    context.ignoreCase = true;
                    return completion.dialog(context);
                }
            });

        commands.add(["em[enu]"],
            "Execute the specified menu item from the command line",
            function (args)
            {
                let arg = args.literalArg;
                let items = getMenuItems();

                if (!items.some(function (i) i.fullMenuPath == arg))
                    return void liberator.echoerr("E334: Menu not found: " + arg);

                for (let [, item] in Iterator(items))
                {
                    if (item.fullMenuPath == arg)
                        item.doCommand();
                }
            },
            {
                argCount: "1",
                completer: function (context) completion.menuItem(context),
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
                    liberator.execute(cmd, null, true);
                }
                catch (e)
                {
                    liberator.echoerr(e);
                }
            });

        commands.add(["exta[dd]"],
            "Install an extension",
            function (args)
            {
                let file = io.getFile(args[0]);

                if (file.exists() && file.isReadable() && file.isFile())
                    services.get("extensionManager").installItemFromFile(file, "app-profile");
                else
                {
                    if (file.exists() && file.isDirectory())
                        liberator.echomsg("Cannot install a directory: \"" + file.path + "\"", 0);

                    liberator.echoerr("E484: Can't open file " + file.path);
                }
            },
            {
                argCount: "1",
                completer: function (context) {
                    context.filters.push(function ({ item: f }) f.isDirectory() || /\.xpi$/.test(f.leafName));
                    completion.file(context);
                }
            });

        // TODO: handle extension dependencies
        [
            {
                name: "extde[lete]",
                description: "Uninstall an extension",
                action: "uninstallItem"
            },
            {
                name: "exte[nable]",
                description: "Enable an extension",
                action: "enableItem",
                filter: function ({ item: e }) !e.enabled
            },
            {
                name: "extd[isable]",
                description: "Disable an extension",
                action: "disableItem",
                filter: function ({ item: e }) e.enabled
            }
        ].forEach(function (command) {
            commands.add([command.name],
                command.description,
                function (args)
                {
                    let name = args[0];
                    function action(e) { services.get("extensionManager")[command.action](e.id); };

                    if (args.bang)
                        liberator.extensions.forEach(function (e) { action(e); });
                    else
                    {
                        if (!name)
                            return void liberator.echoerr("E471: Argument required"); // XXX

                        let extension = liberator.getExtension(name);
                        if (extension)
                            action(extension);
                        else
                            liberator.echoerr("E474: Invalid argument");
                    }
                },
                {
                    argCount: "?", // FIXME: should be "1"
                    bang: true,
                    completer: function (context)
                    {
                        completion.extension(context);
                        if (command.filter)
                            context.filters.push(command.filter);
                    },
                    literal: 0
                });
        });

        commands.add(["exto[ptions]", "extp[references]"],
            "Open an extension's preference dialog",
            function (args)
            {
                let extension = liberator.getExtension(args[0]);
                if (!extension || !extension.options)
                    return void liberator.echoerr("E474: Invalid argument");
                if (args.bang)
                    window.openDialog(extension.options, "_blank", "chrome");
                else
                    liberator.open(extension.options, { from: "extoptions" });
            },
            {
                argCount: "1",
                bang: true,
                completer: function (context)
                {
                    completion.extension(context);
                    context.filters.push(function ({ item: e }) e.options);
                },
                literal: 0
            });

        // TODO: maybe indicate pending status too?
        commands.add(["extens[ions]"],
            "List available extensions",
            function (args)
            {
                let filter = args[0] || "";
                let extensions = liberator.extensions.filter(function (e) e.name.indexOf(filter) >= 0);

                if (extensions.length > 0)
                {
                    let list = template.tabular(
                        ["Name", "Version", "Status", "Description"], [],
                        ([template.icon(e, e.name),
                          e.version,
                          e.enabled ? <span highlight="Enabled">enabled</span>
                                    : <span highlight="Disabled">disabled</span>,
                          e.description] for ([, e] in Iterator(extensions)))
                    );

                    commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                }
                else
                {
                    if (filter)
                        liberator.echoerr("Exxx: No extension matching \"" + filter + "\"");
                    else
                        liberator.echoerr("No extensions installed");
                }
            },
            { argCount: "?" });

        commands.add(["exu[sage]"],
            "List all Ex commands with a short description",
            function (args) { showHelpIndex("ex-cmd-index", commands, args.bang); },
            {
                argCount: "0",
                bang: true
            });

        [
            {
                name: "h[elp]",
                description: "Open the help page"
            },
            {
                name: "helpa[ll]",
                description: "Open the single unchunked help page"
            }
        ].forEach(function (command) {
            let unchunked = command.name == "helpa[ll]";

            commands.add([command.name],
                command.description,
                function (args)
                {
                    if (args.bang)
                        return void liberator.echoerr("E478: Don't panic!");

                    liberator.help(args.literalArg, unchunked);
                },
                {
                    argCount: "?",
                    bang: true,
                    completer: function (context) completion.help(context, unchunked),
                    literal: 0
                });
        });

        commands.add(["javas[cript]", "js"],
            "Run a JavaScript command through eval()",
            function (args)
            {
                if (args.bang) // open JavaScript console
                {
                    liberator.open("chrome://global/content/console.xul",
                        { from: "javascript" });
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

        toolbox = document.getElementById("navigator-toolbox");
        if (toolbox)
        {
            function findToolbar(name) buffer.evaluateXPath(
                "./*[@toolbarname=" + util.escapeString(name, "'") + "]",
                document, toolbox).snapshotItem(0);

            let tbcmd = function (names, desc, action, filter)
            {
                commands.add(names, desc,
                    function (args)
                    {
                        let toolbar = findToolbar(args[0]);
                        if (!toolbar)
                            return void liberator.echoerr("E474: Invalid argument");
                        action(toolbar);
                    },
                    {
                        argcount: "1",
                        completer: function (context)
                        {
                            completion.toolbar(context)
                            if (filter)
                                context.filters.push(filter);
                        },
                        literal: 0
                    });
            }

            tbcmd(["toolbars[how]", "tbs[how]"], "Show the named toolbar",
                function (toolbar) toolbar.collapsed = false,
                function (item) item.item.collapsed);
            tbcmd(["toolbarh[ide]", "tbh[ide]"], "Hide the named toolbar",
                function (toolbar) toolbar.collapsed = true,
                function (item) !item.item.collapsed);
            tbcmd(["toolbart[oggle]", "tbt[oggle]"], "Toggle the named toolbar",
                function (toolbar) toolbar.collapsed = !toolbar.collapsed);
        }

        commands.add(["time"],
            "Profile a piece of code or run a command multiple times",
            function (args)
            {
                let count = args.count;
                let special = args.bang;
                args = args.string;

                if (args[0] == ":")
                    var method = function () liberator.execute(args, null, true);
                else
                    method = liberator.eval("(function () {" + args + "})");

                try
                {
                    if (count > 1)
                    {
                        let each, eachUnits, totalUnits;
                        let total = 0;

                        for (let i in util.interruptibleRange(0, count, 500))
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
                            totalUnits = "msec";

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

        commands.add(["verb[ose]"],
            "Execute a command with 'verbose' set",
            function (args)
            {
                let vbs = options.get("verbose");
                let value = vbs.value;
                let setFrom = vbs.setFrom;

                try
                {
                    vbs.set(args.count > -1 ? args.count : 1);
                    vbs.setFrom = null;
                    liberator.execute(args[0], null, true);
                }
                finally
                {
                    vbs.set(value);
                    vbs.setFrom = setFrom;
                }
            },
            {
                argCount: "+",
                completer: function (context) completion.ex(context),
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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMPLETIONS /////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    registerObserver("load_completion", function () {
        completion.setFunctionCompleter(services.get, [function () services.services]);
        completion.setFunctionCompleter(services.create, [function () [[c, ""] for (c in services.classes)]]);

        completion.dialog = function dialog(context) {
            context.title = ["Dialog"];
            context.completions = config.dialogs;
        };

        completion.extension = function extension(context) {
            context.title = ["Extension"];
            context.anchored = false;
            context.keys = { text: "name", description: "description", icon: "icon" },
            context.completions = liberator.extensions;
        };

        completion.help = function help(context, unchunked) {
            context.title = ["Help"];
            context.anchored = false;
            context.key = unchunked;
            context.completions = services.get("liberator:").HELP_TAGS;
            if (unchunked)
                context.keys = { text: "text", description: function () "all" };
        };

        completion.menuItem = function menuItem(context) {
            context.title = ["Menu Path", "Label"];
            context.anchored = false;
            context.keys = { text: "fullMenuPath", description: function (item) item.getAttribute("label") };
            context.completions = liberator.menuItems;
        };

        completion.toolbar = function toolbar(context) {
            context.title = ["Toolbar"];
            context.keys = { text: function (item) item.getAttribute("toolbarname"), description: function () "" };
            context.completions = buffer.evaluateXPath("./*[@toolbarname]", document, toolbox);
        };

        completion.window = function window(context) {
            context.title = ["Window", "Title"]
            context.keys = { text: function (win) liberator.windows.indexOf(win) + 1, description: function (win) win.document.title };
            context.completions = liberator.windows;
        };
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        modules: modules,

        /**
         * @property {number} The current main mode.
         * @see modes#mainModes
         */
        get mode()      modes.main,
        set mode(value) modes.main = value,

        get menuItems() getMenuItems(),

        /** @property {Element} The currently focused element. */
        get focus() document.commandDispatcher.focusedElement,

        get extensions()
        {
            const rdf = services.get("rdf");
            const extensionManager = services.get("extensionManager");

            let extensions = extensionManager.getItemList(Ci.nsIUpdateItem.TYPE_EXTENSION, {});

            function getRdfProperty(item, property)
            {
                let resource = rdf.GetResource("urn:mozilla:item:" + item.id);
                let value = "";

                if (resource)
                {
                    let target = extensionManager.datasource.GetTarget(resource,
                        rdf.GetResource("http://www.mozilla.org/2004/em-rdf#" + property), true);
                    if (target && target instanceof Ci.nsIRDFLiteral)
                        value = target.Value;
                }

                return value;
            }

            //const Extension = new Struct("id", "name", "description", "icon", "enabled", "version");
            return extensions.map(function (e) ({
                id: e.id,
                name: e.name,
                description: getRdfProperty(e, "description"),
                enabled: getRdfProperty(e, "isDisabled") != "true",
                icon: e.iconURL,
                options: getRdfProperty(e, "optionsURL"),
                version: e.version
            }));
        },

        getExtension: function (name) this.extensions.filter(function (e) e.name == name)[0],

        // Global constants
        CURRENT_TAB: [],
        NEW_TAB: [],
        NEW_BACKGROUND_TAB: [],
        NEW_WINDOW: [],

        forceNewTab: false,
        forceNewWindow: false,

        /** @property {string} The Liberator version string. */
        version: "###VERSION### (created: ###DATE###)", // these VERSION and DATE tokens are replaced by the Makefile

        // NOTE: services.get("profile").selectedProfile.name doesn't return
        // what you might expect. It returns the last _actively_ selected
        // profile (i.e. via the Profile Manager or -P option) rather than the
        // current profile. These will differ if the current process was run
        // without explicitly selecting a profile.
        /** @property {string} The name of the current user profile. */
        profileName: services.get("directory").get("ProfD", Ci.nsIFile).leafName.replace(/^.+?\./, ""),

        /**
         * @property {Object} The map of command-line options. These are
         *     specified in the argument to the host application's -liberator
         *     option. E.g. $ firefox -liberator '+u=tempRcFile ++noplugin'
         *     Supported options:
         *         +u=RCFILE   Use RCFILE instead of .vimperatorrc.
         *         ++noplugin  Don't load plugins.
         */
        commandLineOptions: {
            /** @property Whether plugin loading should be prevented. */
            noPlugins: false,
            /** @property An RC file to use rather than the default. */
            rcFile: null,
            /** @property An Ex command to run before any initialization is performed. */
            preCommands: null,
            /** @property An Ex command to run after all initialization has been performed. */
            postCommands: null
        },

        registerObserver: registerObserver,

        unregisterObserver: function (type, callback)
        {
            if (type in observers)
                observers[type] = observers[type].filter(function (c) c != callback);
        },

        // TODO: "zoom": if the zoom value of the current buffer changed
        triggerObserver: function (type)
        {
            let args = Array.slice(arguments, 1);
            for (let [, func] in Iterator(observers[type] || []))
                func.apply(null, args);
        },

        /**
         * Triggers the application bell to notify the user of an error. The
         * bell may be either audible or visual depending on the value of the
         * 'visualbell' option.
         */
        beep: function ()
        {
            // FIXME: popups clear the command line
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

        /**
         * Creates a new thread.
         */
        newThread: function () services.get("threadManager").newThread(0),

        /**
         * Calls a function asynchronously on a new thread.
         *
         * @param {nsIThread} thread The thread to call the function on. If no
         *     thread is specified a new one is created.
         * @optional
         * @param {Object} self The 'this' object used when executing the
         *     function.
         * @param {function} func The function to execute.
         *
         */
        callAsync: function (thread, self, func)
        {
            thread = thread || services.get("threadManager").newThread(0);
            thread.dispatch(new Runnable(self, func, Array.slice(arguments, 3)), thread.DISPATCH_NORMAL);
        },

        /**
         * Calls a function synchronously on a new thread.
         *
         * NOTE: Be sure to call GUI related methods like alert() or dump()
         * ONLY in the main thread.
         *
         * @param {nsIThread} thread The thread to call the function on. If no
         *     thread is specified a new one is created.
         * @optional
         * @param {function} func The function to execute.
         */
        callFunctionInThread: function (thread, func)
        {
            thread = thread || services.get("threadManager").newThread(0);

            // DISPATCH_SYNC is necessary, otherwise strange things will happen
            thread.dispatch(new Runnable(null, func, Array.slice(arguments, 2)), thread.DISPATCH_SYNC);
        },

        /**
         * Prints a message to the console. If <b>msg</b> is an object it is
         * pretty printed.
         *
         * NOTE: the "browser.dom.window.dump.enabled" preference needs to be
         * set.
         *
         * @param {string|Object} msg The message to print.
         */
        dump: function ()
        {
            let msg = Array.map(arguments, function (msg) {
                if (typeof msg == "object")
                    msg = util.objectToString(msg);
                return msg;
            }).join(", ");
            msg = String.replace(msg, /\n?$/, "\n");
            window.dump(msg.replace(/^./gm, ("config" in modules && config.name.toLowerCase()) + ": $&"));
        },

        /**
         * Dumps a stack trace to the console.
         *
         * @param {string} msg The trace message.
         * @param {number} frames The number of frames to print.
         */
        dumpStack: function (msg, frames)
        {
            let stack = Error().stack.replace(/(?:.*\n){2}/, "");
            if (frames != null)
                [stack] = stack.match(RegExp("(?:.*\n){0," + frames + "}"));
            liberator.dump((msg || "Stack") + "\n" + stack);
        },

        /**
         * Outputs a plain message to the command line.
         *
         * @param {string} str The message to output.
         * @param {number} flags These control the multiline message behaviour.
         *     See {@link CommandLine#echo}.
         */
        echo: function (str, flags)
        {
            commandline.echo(str, commandline.HL_NORMAL, flags);
        },

        // TODO: Vim replaces unprintable characters in echoerr/echomsg
        /**
         * Outputs an error message to the command line.
         *
         * @param {string} str The message to output.
         * @param {number} flags These control the multiline message behaviour.
         *     See {@link CommandLine#echo}.
         */
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
        /**
         * Outputs an information message to the command line.
         *
         * @param {string} str The message to output.
         * @param {number} verbosity The messages log level (0 - 15). Only
         *     messages with verbosity less than or equal to the value of the
         *     'verbosity' option will be output.
         * @param {number} flags These control the multiline message behaviour.
         *     See {@link CommandLine#echo}.
         */
        echomsg: function (str, verbosity, flags)
        {
            // TODO: is there a reason for this? --djk
            // yes, it doesn't show the MOW on startup if you have e.g. some qmarks in your vimperatorrc.
            // Feel free to add another flag like DONT_OPEN_MULTILINE if really needed --mst
            //
            // But it's _supposed_ to show the MOW on startup when there are
            // messages, surely?  As far as I'm concerned it essentially works
            // exactly as it should with the DISALLOW_MULTILINE flag removed.
            // Sending N messages to the command line in a row and having them
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

        /**
         * Loads and executes the script referenced by <b>uri</b> in the scope
         * of the <b>context</b> object.
         *
         * @param {string} uri The URI of the script to load. Should be a local
         *     chrome:, file:, or resource: URL.
         * @param {Object} context The context object into which the script
         *     should be loaded.
         */
        loadScript: function (uri, context)
        {
            services.get("subscriptLoader").loadSubScript(uri, context);
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
                    return void this.echoerr("E113: Unknown option: " + matches[1]);

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
                    return matches[2].toString();
                else
                    return void this.echoerr("E115: Missing quote: " + string);
            }
            // Number
            else if (matches = string.match(/^(\d+)$/))
                return parseInt(matches[1], 10);

            let reference = this.variableReference(string);

            if (!reference[0])
                this.echoerr("E121: Undefined variable: " + string);
            else
                return reference[0][reference[1]];

            return;
        },

        /**
         * Execute an Ex command string. E.g. ":zoom 300".
         *
         * @param {string} str The command to execute.
         * @param {Object} modifiers Any modifiers to be passed to
         *     {@link Command#action}.
         * @param {boolean} silent Whether the command should be echoed on the
         *     command line.
         */
        execute: function (str, modifiers, silent)
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
                err = "E666: Internal error: command.action === null"; // TODO: need to perform this test? -- djk
            else if (count != -1 && !command.count)
                err = "E481: No range allowed";
            else if (special && !command.bang)
                err = "E477: No ! allowed";

            if (err)
                return void liberator.echoerr(err);
            if (!silent)
                commandline.command = str.replace(/^\s*:\s*/, "");

            command.execute(args, special, count, modifiers);
        },

        /**
         * Focuses the content window.
         *
         * @param {boolean} clearFocusedElement Remove focus from any focused
         *     element.
         */
        focusContent: function (clearFocusedElement)
        {
            if (window != services.get("windowWatcher").activeWindow)
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

            if (clearFocusedElement && liberator.focus)
                liberator.focus.blur();
            if (elem && elem != liberator.focus)
                elem.focus();
        },

        /**
         * Returns whether this Liberator extension supports <b>feature</b>.
         *
         * @param {string} feature The feature name.
         * @returns {boolean}
         */
        has: function (feature) config.features.indexOf(feature) >= 0,

        /**
         * Returns whether the host application has the specified extension
         * installed.
         *
         * @param {string} name The extension name.
         * @returns {boolean}
         */
        hasExtension: function (name)
        {
            let extensions = services.get("extensionManager").getItemList(Ci.nsIUpdateItem.TYPE_EXTENSION, {});
            return extensions.some(function (e) e.name == name);
        },

        /**
         * Returns the URL of the specified help <b>topic</b> if it exists.
         *
         * @param {string} topic The help topic to lookup.
         * @param {boolean} unchunked Whether to search the unchunked help page.
         * @returns {string}
         */
        findHelp: function (topic, unchunked)
        {
            unchunked = !!unchunked;
            let items = completion._runCompleter("help", topic, null, unchunked).items;
            let partialMatch = null;

            function format(item) item.description + "#" + encodeURIComponent(item.text);

            for (let [i, item] in Iterator(items))
            {
                if (item.text == topic)
                    return format(item);
                else if (!partialMatch && topic)
                    partialMatch = item;
            }

            if (partialMatch)
                return format(partialMatch);
            return null;
        },

        /**
         * Opens the help page containing the specified <b>topic</b> if it
         * exists.
         *
         * @param {string} topic The help topic to open.
         * @param {boolean} unchunked Whether to use the unchunked help page.
         * @returns {string}
         */
        help: function (topic, unchunked)
        {
            if (!topic && !unchunked)
            {
                let helpFile = options["helpfile"];
                if (config.helpFiles.indexOf(helpFile) != -1)
                    liberator.open("liberator://help/" + helpFile, { from: "help" });
                else
                    liberator.echomsg("Sorry, help file " + helpFile.quote() + " not found");
                return;
            }

            let page = this.findHelp(topic, unchunked);
            if (page == null)
                return void liberator.echoerr("E149: Sorry, no help for " + topic);

            liberator.open("liberator://help/" + page, { from: "help" });
            if (options.get("activate").has("all", "help"))
                content.postMessage("fragmentChange", "*");
        },

        /**
         * The map of global variables.
         *
         * These are set and accessed with the "g:" prefix.
         */
        globalVariables: {},

        loadModule: function (name, func) { loadModule(name, func); },

        loadPlugins: function ()
        {
            function sourceDirectory(dir)
            {
                if (!dir.isReadable())
                    return void liberator.echoerr("E484: Can't open file " + dir.path);

                liberator.log("Sourcing plugin directory: " + dir.path + "...", 3);
                io.readDirectory(dir.path, true).forEach(function (file) {
                    if (file.isFile() && /\.(js|vimp)$/i.test(file.path) && !(file.path in liberator.pluginFiles))
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
                    else if (file.isDirectory())
                        sourceDirectory(file);
                });
            }

            let dirs = io.getRuntimeDirectories("plugin");

            if (dirs.length == 0)
            {
                liberator.log("No user plugin directory found", 3);
                return;
            }

            liberator.echomsg('Searching for "plugin/**/*.{js,vimp}" in "'
                                + [dir.path.replace(/.plugin$/, "") for ([, dir] in Iterator(dirs))].join(",") + '"', 2);

            dirs.forEach(function (dir) {
                liberator.echomsg("Searching for \"" + (dir.path + "/**/*.{js,vimp}") + "\"", 3);
                sourceDirectory(dir);
            });
        },

        // TODO: add proper level constants
        /**
         * Logs a message to the JavaScript error console. Each message has an
         * associated log level. Only messages with a log level less than or
         * equal to <b>level</b> will be printed. If <b>msg</b> is an object,
         * it is pretty printed.
         *
         * @param {string|Object} msg The message to print.
         * @param {number} level The logging level 0 - 15.
         */
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

            services.get("console").logStringMessage(config.name.toLowerCase() + ": " + msg);
        },

        /**
         * Opens one or more URLs. Returns true when load was initiated, or
         * false on error.
         *
         * @param {string|string[]} urls Either a URL string or an array of URLs.
         *     The array can look like this:
         *       ["url1", "url2", "url3", ...]
         *     or:
         *       [["url1", postdata1], ["url2", postdata2], ...]
         * @param {number|Object} where If ommited, CURRENT_TAB is assumed but NEW_TAB
         *     is set when liberator.forceNewTab is true.
         * @param {boolean} force Don't prompt whether to open more than 20
         *     tabs.
         * @returns {boolean}
         */
        open: function (urls, where, force)
        {
            // convert the string to an array of converted URLs
            // -> see util.stringToURLArray for more details
            if (typeof urls == "string")
            {
                // rather switch to the tab instead of opening a new url in case of "12: Tab Title" like "urls"
                if (liberator.has("tabs"))
                {
                    let matches = urls.match(/^(\d+):/);
                    if (matches)
                    {
                        tabs.select(parseInt(matches[1], 10) - 1, false); // make it zero-based
                        return;
                    }
                }

                urls = util.stringToURLArray(urls);
            }

            if (urls.length > 20 && !force)
            {
                commandline.input("This will open " + urls.length + " new tabs. Would you like to continue? (yes/[no]) ",
                    function (resp) {
                        if (resp && resp.match(/^y(es)?$/i))
                            liberator.open(urls, where, true);
                    });
                return true;
            }

            let flags = 0;
            if (where && !(where instanceof Array))
            {
                for (let [opt, flag] in Iterator({ replace: "REPLACE_HISTORY", hide: "BYPASS_HISTORY" }))
                    if (where[opt])
                        flags |= Ci.nsIWebNavigation["LOAD_FLAGS_" + flag];
                if ("from" in where)
                    where = (options["newtab"] && options.get("newtab").has("all", where.from))
                            ? liberator.NEW_TAB : liberator.CURRENT_TAB;
                else
                    where = where.where || liberator.CURRENT_TAB;
            }

            if (urls.length == 0)
                return false;

            let browser = window.getBrowser();

            function open(urls, where)
            {
                let url = Array.concat(urls)[0];
                let postdata = Array.concat(urls)[1];

                // decide where to load the first url
                switch (where)
                {
                    case liberator.CURRENT_TAB:
                        browser.loadURIWithFlags(url, flags, null, null, postdata);
                        break;

                    case liberator.NEW_BACKGROUND_TAB:
                    case liberator.NEW_TAB:
                        if (!liberator.has("tabs"))
                            return open(urls, liberator.NEW_WINDOW);

                        options.withContext(function () {
                            options.setPref("browser.tabs.loadInBackground", true);
                            browser.loadOneTab(url, null, null, postdata, where == liberator.NEW_BACKGROUND_TAB);
                        });
                        break;

                    case liberator.NEW_WINDOW:
                        window.open();
                        let win = services.get("windowMediator").getMostRecentWindow("navigator:browser");
                        win.loadURI(url, null, postdata);
                        browser = win.getBrowser();
                        break;

                    default:
                        throw Error("Invalid 'where' directive in liberator.open(...)");
                }
            }

            if (liberator.forceNewTab)
                where = liberator.NEW_TAB;
            else if (liberator.forceNewWindow)
                where = liberator.NEW_WINDOW;
            else if (!where)
                where = liberator.CURRENT_TAB;

            for (let [, url] in Iterator(urls))
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

        /**
         * Quit the host application, no matter how many tabs/windows are open.
         *
         * @param {boolean} saveSession If true the current session will be
         *     saved and restored when the host application is restarted.
         * @param {boolean} force Forcibly quit irrespective of whether all
         *    windows could be closed individually.
         */
        quit: function (saveSession, force)
        {
            // TODO: Use safeSetPref?
            if (saveSession)
                options.setPref("browser.startup.page", 3); // start with saved session
            else
                options.setPref("browser.startup.page", 1); // start with default homepage session

            if (force)
                services.get("appStartup").quit(Ci.nsIAppStartup.eForceQuit);
            else
                window.goQuitApplication();
        },

        /**
         * Reports an error to both the console and the host application's
         * Error Console.
         *
         * @param {Object} error The error object.
         */
        reportError: function (error)
        {
            if (Cu.reportError)
                Cu.reportError(error);

            try
            {
                try
                {
                    var string = String(error);
                    var stack = error.stack;
                }
                catch (e) {}

                let obj = {
                    toString: function () string || {}.toString.call(error),
                    stack: <>{String.replace(stack || Error().stack, /^/mg, "\t")}</>
                };
                for (let [k, v] in Iterator(error))
                {
                    if (!(k in obj))
                        obj[k] = v;
                }
                if (liberator.storeErrors)
                {
                    let errors = storage.newArray("errors", false);
                    errors.toString = function () [String(v[0]) + "\n" + v[1] for ([k, v] in this)].join("\n\n");
                    errors.push([new Date, obj + obj.stack]);
                }
                liberator.dump(string);
                liberator.dump(obj);
                liberator.dump("");
            }
            catch (e) { window.dump(e) }
        },

        /**
         * Restart the host application.
         */
        restart: function ()
        {
            // notify all windows that an application quit has been requested.
            var cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(Ci.nsISupportsPRBool);
            services.get("observer").notifyObservers(cancelQuit, "quit-application-requested", null);

            // something aborted the quit process.
            if (cancelQuit.data)
                return;

            // notify all windows that an application quit has been granted.
            services.get("observer").notifyObservers(null, "quit-application-granted", null);

            // enumerate all windows and call shutdown handlers
            let windows = services.get("windowMediator").getEnumerator(null);
            while (windows.hasMoreElements())
            {
                let win = windows.getNext();
                if (("tryToClose" in win) && !win.tryToClose())
                    return;
            }
            services.get("appStartup").quit(Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit);
        },

        /**
         * Parses a Liberator command-line string i.e. the value of the
         * -liberator command-line option.
         *
         * @param {string} cmdline The string to parse for command-line
         *     options.
         * @returns {Object}
         * @see Commands#parseArgs
         */
        parseCommandLine: function (cmdline)
        {
            const options = [
                [["+u"], commands.OPTIONS_STRING],
                [["++noplugin"], commands.OPTIONS_NOARG],
                [["++cmd"], commands.OPTIONS_STRING, null, null, true],
                [["+c"], commands.OPTIONS_STRING, null, null, true]
            ];
            return commands.parseArgs(cmdline, options, "*");
        },

        // this function is called when the chrome is ready
        startup: function ()
        {
            let start = Date.now();
            liberator.log("Initializing liberator object...", 0);

            services.get("liberator:").helpFiles = config.helpFiles.map(function (f) f.replace(/\..*/, ""));

            config.features.push(getPlatformFeature());

            try
            {
                let infoPath = services.create("file");
                infoPath.initWithPath(IO.expandPath(IO.runtimePath.replace(/,.*/, "")));
                infoPath.append("info");
                infoPath.append(liberator.profileName);
                storage.infoPath = infoPath;
            }
            catch (e)
            {
                liberator.reportError(e);
            }

            // commands must always be the first module to be initialized
            loadModule("commands",     Commands);
            loadModule("options",      Options);
            loadModule("events",       Events);
            loadModule("mappings",     Mappings);
            loadModule("buffer",       Buffer);
            loadModule("commandline",  CommandLine);
            loadModule("statusline",   StatusLine);
            loadModule("editor",       Editor);
            loadModule("autocommands", AutoCommands);
            loadModule("io",           IO);
            loadModule("completion",   Completion);

            // add options/mappings/commands which are only valid in this particular extension
            if (config.init)
                config.init();

            liberator.triggerObserver("load");

            liberator.log("All modules loaded", 3);

            let commandline = services.get("commandLineHandler").wrappedJSObject.optionValue;
            if (commandline)
            {
                let args = liberator.parseCommandLine(commandline);
                liberator.commandLineOptions.rcFile = args["+u"];
                liberator.commandLineOptions.noPlugins = "++noplugin" in args;
                liberator.commandLineOptions.postCommands = args["+c"];
                liberator.commandLineOptions.preCommands = args["++cmd"];
                liberator.dump("Processing command-line option: " + commandline);
            }

            liberator.log("Command-line options: " + util.objectToString(liberator.commandLineOptions), 3);

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

            if (liberator.commandLineOptions.preCommands)
                liberator.commandLineOptions.preCommands.forEach(function (cmd) {
                    liberator.execute(cmd);
                });

            // finally, read the RC file and source plugins
            // make sourcing asynchronous, otherwise commands that open new tabs won't work
            setTimeout(function () {

                let extensionName = config.name.toUpperCase();
                let init = services.get("environment").get(extensionName + "_INIT");
                let rcFile = io.getRCFile("~");

                if (liberator.commandLineOptions.rcFile)
                {
                    let filename = liberator.commandLineOptions.rcFile;
                    if (!/^(NONE|NORC)$/.test(filename))
                        io.source(io.getFile(filename).path, false); // let io.source handle any read failure like Vim
                }
                else
                {
                    if (init)
                        liberator.execute(init);
                    else
                    {
                        if (rcFile)
                        {
                            io.source(rcFile.path, true);
                            services.get("environment").set("MY_" + extensionName + "RC", rcFile.path);
                        }
                        else
                            liberator.log("No user RC file found", 3);
                    }

                    if (options["exrc"] && !liberator.commandLineOptions.rcFile)
                    {
                        let localRCFile = io.getRCFile(io.getCurrentDirectory().path);
                        if (localRCFile && !localRCFile.equals(rcFile))
                            io.source(localRCFile.path, true);
                    }
                }

                if (liberator.commandLineOptions.rcFile == "NONE" || liberator.commandLineOptions.noPlugins)
                    options["loadplugins"] = false;

                if (options["loadplugins"])
                    liberator.loadPlugins();

                // after sourcing the initialization files, this function will set
                // all gui options to their default values, if they have not been
                // set before by any RC file
                for (let option in options)
                {
                    // 'encoding' option should not be set at this timing.
                    // Probably a wrong value is set into the option,
                    // if current page's encoging is not UTF-8.
                    if (option.name != "encoding" && option.setter)
                        option.value = option.value;
                }

                if (liberator.commandLineOptions.postCommands)
                    liberator.commandLineOptions.postCommands.forEach(function (cmd) {
                        liberator.execute(cmd);
                    });

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
            let mainThread = services.get("threadManager").mainThread;

            let end = Date.now() + delay;
            while (Date.now() < end)
                mainThread.processNextEvent(true);
            return true;
        },

        callInMainThread: function (callback, self)
        {
            let mainThread = services.get("threadManager").mainThread;
            if (!services.get("threadManager").isMainThread)
                mainThread.dispatch({ run: callback.call(self) }, mainThread.DISPATCH_NORMAL);
            else
                callback.call(self);
        },

        threadYield: function (flush, interruptable)
        {
            let mainThread = services.get("threadManager").mainThread;
            liberator.interrupted = false;
            do
            {
                mainThread.processNextEvent(!flush);
                if (liberator.interrupted)
                    throw new Error("Interrupted");
            }
            while (flush === true && mainThread.hasPendingEvents());
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

        /**
         * @property {Window[]} Returns an array of all the host application's
         *     open windows.
         */
        get windows()
        {
            let windows = [];
            let enumerator = services.get("windowMediator").getEnumerator("navigator:browser");
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
