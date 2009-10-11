// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.


/** @scope modules */

/**
 * @instance autocommands
 */
function AutoCommands() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const AutoCommand = new Struct("event", "pattern", "command");
    var store = [];

    function matchAutoCmd(autoCmd, event, regex)
    {
        return (!event || autoCmd.event == event) && (!regex || autoCmd.pattern.source == regex);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["eventignore", "ei"],
        "List of autocommand event names which should be ignored",
        "stringlist", "",
        {
            completer: function () config.autocommands.concat([["all", "All events"]]),
            validator: Option.validateCompleter
        });

    options.add(["focuscontent", "fc"],
        "Try to stay in normal mode after loading a web page",
        "boolean", false);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["au[tocmd]"],
        "Execute commands automatically on events",
        function (args)
        {
            let [event, regex, cmd] = args;
            let events = [];

            try
            {
                RegExp(regex);
            }
            catch (e)
            {
                return void liberator.echoerr("E475: Invalid argument: " + regex);
            }

            if (event)
            {
                // NOTE: event can only be a comma separated list for |:au {event} {pat} {cmd}|
                let validEvents = config.autocommands.map(function (event) event[0]);
                validEvents.push("*");

                events = event.split(",");
                if (!events.every(function (event) validEvents.indexOf(event) >= 0))
                    return void liberator.echoerr("E216: No such group or event: " + event);
            }

            if (cmd) // add new command, possibly removing all others with the same event/pattern
            {
                if (args.bang)
                    autocommands.remove(event, regex);
                if (args["-javascript"])
                    cmd = eval("(function (args) { with(args) {" + cmd + "} })");
                autocommands.add(events, regex, cmd);
            }
            else
            {
                if (event == "*")
                    event = null;

                if (args.bang)
                {
                    // TODO: "*" only appears to work in Vim when there is a {group} specified
                    if (args[0] != "*" || regex)
                        autocommands.remove(event, regex); // remove all
                }
                else
                    autocommands.list(event, regex);   // list all
            }
        },
        {
            bang: true,
            completer: function (context) completion.autocmdEvent(context),
            literal: 2,
            options: [[["-javascript", "-js"], commands.OPTION_NOARG]]
        });

    [
        {
            name: "do[autocmd]",
            description: "Apply the autocommands matching the specified URL pattern to the current buffer"
        },
        {
            name: "doautoa[ll]",
            description: "Apply the autocommands matching the specified URL pattern to all buffers"
        }
    ].forEach(function (command) {
        commands.add([command.name],
            command.description,
            // TODO: Perhaps this should take -args to pass to the command?
            function (args)
            {
                // Vim compatible
                if (args.length == 0)
                    return void liberator.echomsg("No matching autocommands");

                let [event, url] = args;
                let defaultURL = url || buffer.URL;
                let validEvents = config.autocommands.map(function (e) e[0]);

                // TODO: add command validators
                if (event == "*")
                    return void liberator.echoerr("E217: Can't execute autocommands for ALL events");
                else if (validEvents.indexOf(event) == -1)
                    return void liberator.echoerr("E216: No such group or event: " + args);
                else if (!autocommands.get(event).some(function (c) c.pattern.test(defaultURL)))
                    return void liberator.echomsg("No matching autocommands");

                if (this.name == "doautoall" && liberator.has("tabs"))
                {
                    let current = tabs.index();

                    for (let i = 0; i < tabs.count; i++)
                    {
                        tabs.select(i);
                        // if no url arg is specified use the current buffer's URL
                        autocommands.trigger(event, { url: url || buffer.URL });
                    }

                    tabs.select(current);
                }
                else
                    autocommands.trigger(event, { url: defaultURL });
            },
            {
                argCount: "*", // FIXME: kludged for proper error message should be "1".
                completer: function (context) completion.autocmdEvent(context)
            });
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMPLETIONS /////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function () {
        completion.setFunctionCompleter(autocommands.get, [function () config.autocommands]);

        completion.autocmdEvent = function autocmdEvent(context) {
            context.completions = config.autocommands;
        };

        completion.macro = function macro(context) {
            context.title = ["Macro", "Keys"];
            context.completions = [item for (item in events.getMacros())];
        };
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        __iterator__: function () util.Array.itervalues(store),

        /**
         * Adds a new autocommand. <b>cmd</b> will be executed when one of the
         * specified <b>events</b> occurs and the URL of the applicable buffer
         * matches <b>regex</b>.
         *
         * @param {Array} events The array of event names for which this
         *     autocommand should be executed.
         * @param {string} regex The URL pattern to match against the buffer URL.
         * @param {string} cmd The Ex command to run.
         */
        add: function (events, regex, cmd)
        {
            if (typeof events == "string")
            {
                events = events.split(",");
                liberator.log("DEPRECATED: the events list arg to autocommands.add() should be an array of event names");
            }
            events.forEach(function (event) {
                store.push(new AutoCommand(event, RegExp(regex), cmd));
            });
        },

        /**
         * Returns all autocommands with a matching <b>event</b> and
         * <b>regex</b>.
         *
         * @param {string} event The event name filter.
         * @param {string} regex The URL pattern filter.
         * @returns {AutoCommand[]}
         */
        get: function (event, regex)
        {
            return store.filter(function (autoCmd) matchAutoCmd(autoCmd, event, regex));
        },

        /**
         * Deletes all autocommands with a matching <b>event</b> and
         * <b>regex</b>.
         *
         * @param {string} event The event name filter.
         * @param {string} regex The URL pattern filter.
         */
        remove: function (event, regex)
        {
            store = store.filter(function (autoCmd) !matchAutoCmd(autoCmd, event, regex));
        },

        /**
         * Lists all autocommands with a matching <b>event</b> and
         * <b>regex</b>.
         *
         * @param {string} event The event name filter.
         * @param {string} regex The URL pattern filter.
         */
        list: function (event, regex)
        {
            let cmds = {};

            // XXX
            store.forEach(function (autoCmd) {
                if (matchAutoCmd(autoCmd, event, regex))
                {
                    cmds[autoCmd.event] = cmds[autoCmd.event] || [];
                    cmds[autoCmd.event].push(autoCmd);
                }
            });

            let list = template.commandOutput(
                <table>
                    <tr highlight="Title">
                        <td colspan="2">----- Auto Commands -----</td>
                    </tr>
                    {
                        template.map(cmds, function ([event, items])
                        <tr highlight="Title">
                            <td colspan="2">{event}</td>
                        </tr>
                        +
                            template.map(items, function (item)
                            <tr>
                                <td>&#160;{item.pattern.source}</td>
                                <td>{item.command}</td>
                            </tr>))
                    }
                </table>);

            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },

        /**
         * Triggers the execution of all autocommands registered for
         * <b>event</b>. A map of <b>args</b> is passed to each autocommand
         * when it is being executed.
         *
         * @param {string} event The event to fire.
         * @param {Object} args The args to pass to each autocommand.
         */
        trigger: function (event, args)
        {
            if (options.get("eventignore").has("all", event))
                return;

            let autoCmds = store.filter(function (autoCmd) autoCmd.event == event);

            liberator.echomsg("Executing " + event + " Auto commands for \"*\"", 8);

            let lastPattern = null;
            let url = args.url || "";

            for (let [, autoCmd] in Iterator(autoCmds))
            {
                if (autoCmd.pattern.test(url))
                {
                    if (!lastPattern || lastPattern.source != autoCmd.pattern.source)
                        liberator.echomsg("Executing " + event + " Auto commands for \"" + autoCmd.pattern.source + "\"", 8);

                    lastPattern = autoCmd.pattern;
                    liberator.echomsg("autocommand " + autoCmd.command, 9);

                    if (typeof autoCmd.command == "function")
                    {
                        try
                        {
                            autoCmd.command.call(autoCmd, args);
                        }
                        catch (e)
                        {
                            liberator.reportError(e);
                            liberator.echoerr(e);
                        }
                    }
                    else
                        liberator.execute(commands.replaceTokens(autoCmd.command, args), null, true);
                }
            }
        }
    };
    //}}}
} //}}}

/**
 * @instance events
 */
function Events() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const input = {
        buffer: "",                // partial command storage
        pendingMotionMap: null,    // e.g. "d{motion}" if we wait for a motion of the "d" command
        pendingArgMap: null,       // pending map storage for commands like m{a-z}
        count: -1                  // parsed count from the input buffer
    };

    var fullscreen = window.fullScreen;

    var lastFocus = null;

    var macros = storage.newMap("macros", true, { privateData: true });

    var currentMacro = "";
    var lastMacro = "";

    if (liberator.has("tabs"))
    {
        // FIXME: most of this doesn't work for Muttator yet.
        liberator.registerObserver("load_tabs", function () {
            let tabContainer = tabs.getBrowser().mTabContainer;

            tabContainer.addEventListener("TabMove", function (event) {
                statusline.updateTabCount(true);
            }, false);
            tabContainer.addEventListener("TabOpen", function (event) {
                statusline.updateTabCount(true);
            }, false);
            tabContainer.addEventListener("TabClose", function (event) {
                statusline.updateTabCount(true);
            }, false);
            tabContainer.addEventListener("TabSelect", function (event) {
                // TODO: is all of that necessary?
                //       I vote no. --Kris
                modes.reset();
                statusline.updateTabCount(true);
                tabs.updateSelectionHistory();

                if (options["focuscontent"])
                    setTimeout(function () { liberator.focusContent(true); }, 10); // just make sure, that no widget has focus
            }, false);

            tabs.getBrowser().addEventListener("DOMContentLoaded", onDOMContentLoaded, true);

            // this adds an event which is is called on each page load, even if the
            // page is loaded in a background tab
            tabs.getBrowser().addEventListener("load", onPageLoad, true);

            // called when the active document is scrolled
            tabs.getBrowser().addEventListener("scroll", function (event) {
                statusline.updateBufferPosition();
                modes.show();
            }, null);
        });
    }

//    getBrowser().addEventListener("submit", function (event) {
//        // reset buffer loading state as early as possible, important for macros
//        buffer.loaded = 0;
//    }, null);

    /////////////////////////////////////////////////////////
    // track if a popup is open or the menubar is active
    var activeMenubar = false;
    function enterPopupMode(event)
    {
        if (event.originalTarget.localName == "tooltip" || event.originalTarget.id == "liberator-visualbell")
            return;

        modes.add(modes.MENU);
    }
    function exitPopupMode()
    {
        // gContextMenu is set to NULL, when a context menu is closed
        if (typeof gContextMenu != "undefined" && gContextMenu == null && !activeMenubar)
            modes.remove(modes.MENU);
    }
    function enterMenuMode()
    {
        activeMenubar = true;
        modes.add(modes.MENU);
    }
    function exitMenuMode()
    {
        activeMenubar = false;
        modes.remove(modes.MENU);
    }
    window.addEventListener("popupshown", enterPopupMode, true);
    window.addEventListener("popuphidden", exitPopupMode, true);
    window.addEventListener("DOMMenuBarActive", enterMenuMode, true);
    window.addEventListener("DOMMenuBarInactive", exitMenuMode, true);
    window.addEventListener("resize", onResize, true);

    // NOTE: the order of ["Esc", "Escape"] or ["Escape", "Esc"]
    //       matters, so use that string as the first item, that you
    //       want to refer to within liberator's source code for
    //       comparisons like if (key == "<Esc>") { ... }
    var keyTable = {
        add: ["Plus", "Add"],
        back_space: ["BS"],
        delete: ["Del"],
        escape: ["Esc", "Escape"],
        insert: ["Insert", "Ins"],
        left_shift: ["LT", "<"],
        return: ["Return", "CR", "Enter"],
        right_shift: [">"],
        space: ["Space", " "],
        subtract: ["Minus", "Subtract"]
    };

    const code_key = {};
    const key_code = {};

    for (let [k, v] in Iterator(KeyEvent))
        if (/^DOM_VK_(?![A-Z0-9]$)/.test(k))
        {
            k = k.substr(7).toLowerCase();
            let names = [k.replace(/(^|_)(.)/g, function (m, n1, n2) n2.toUpperCase())
                          .replace(/^NUMPAD/, "k")];
            if (k in keyTable)
                names = keyTable[k];
            code_key[v] = names[0];
            for (let [, name] in Iterator(names))
                key_code[name.toLowerCase()] = v;
        }

    // HACK: as Gecko does not include an event for <, we must add this in manually.
    if (!("<" in key_code))
    {
        key_code["<"] = 60;
        key_code["lt"] = 60;
        code_key[60] = "lt";
    }

    function isInputElemFocused()
    {
        let elem = liberator.focus;
        return ((elem instanceof HTMLInputElement && !/image/.test(elem.type)) ||
                 elem instanceof HTMLTextAreaElement ||
                 elem instanceof HTMLIsIndexElement ||
                 elem instanceof HTMLObjectElement ||
                 elem instanceof HTMLEmbedElement);
    }

    function triggerLoadAutocmd(name, doc)
    {
        let args = {
            url:   doc.location.href,
            title: doc.title
        };

        if (liberator.has("tabs"))
        {
            args.tab = tabs.getContentIndex(doc) + 1;
            args.doc = "tabs.getTab(" + (args.tab - 1) + ").linkedBrowser.contentDocument";
        }

        autocommands.trigger(name, args);
    }

    function onResize(event)
    {
        if (window.fullScreen != fullscreen)
        {
            fullscreen = window.fullScreen;
            liberator.triggerObserver("fullscreen", fullscreen);
            autocommands.trigger("Fullscreen", { state: fullscreen });
        }
    }

    function onDOMContentLoaded(event)
    {
        let doc = event.originalTarget;
        if (doc instanceof HTMLDocument && !doc.defaultView.frameElement)
            triggerLoadAutocmd("DOMLoad", doc);
    }

    // TODO: see what can be moved to onDOMContentLoaded()
    function onPageLoad(event)
    {
        if (event.originalTarget instanceof HTMLDocument)
        {
            let doc = event.originalTarget;
            // document is part of a frameset
            if (doc.defaultView.frameElement)
            {
                // hacky way to get rid of "Transfering data from ..." on sites with frames
                // when you click on a link inside a frameset, because asyncUpdateUI
                // is not triggered there (Gecko bug?)
                setTimeout(function () { statusline.updateUrl(); }, 10);
                return;
            }

            // code which should happen for all (also background) newly loaded tabs goes here:

            // mark the buffer as loaded, we can't use buffer.loaded
            // since that always refers to the current buffer, while doc can be
            // any buffer, even in a background tab
            doc.pageIsFullyLoaded = 1;

            // code which is only relevant if the page load is the current tab goes here:
            if (doc == getBrowser().contentDocument)
            {
                // we want to stay in command mode after a page has loaded
                // TODO: move somewhere else, as focusing can already happen earlier than on "load"
                if (options["focuscontent"])
                {
                    setTimeout(function () {
                        let focused = liberator.focus;
                        if (focused && (focused.value != null) && focused.value.length == 0)
                            focused.blur();
                    }, 0);
                }
            }
            else // background tab
                liberator.echomsg("Background tab loaded: " + doc.title || doc.location.href, 3);

            triggerLoadAutocmd("PageLoad", doc);
        }
    }

    // return true when load successful, or false otherwise
    function waitForPageLoad() events.waitForPageLoad();

    // load all macros
    // setTimeout needed since io. is loaded after events.
    setTimeout(function () {
        try
        {
            let dirs = io.getRuntimeDirectories("macros");

            if (dirs.length > 0)
            {
                for (let [, dir] in Iterator(dirs))
                {
                    liberator.echomsg('Searching for "macros/*" in "' + dir.path + '"', 2);

                    liberator.log("Sourcing macros directory: " + dir.path + "...", 3);

                    let files = io.readDirectory(dir.path);

                    files.forEach(function (file) {
                        if (!file.exists() || file.isDirectory() ||
                            !file.isReadable() || !/^[\w_-]+(\.vimp)?$/i.test(file.leafName))
                                return;

                        let name = file.leafName.replace(/\.vimp$/i, "");
                        macros.set(name, io.readFile(file).split("\n")[0]);

                        liberator.log("Macro " + name + " added: " + macros.get(name), 5);
                    });
                }
            }
            else
                liberator.log("No user macros directory found", 3);
        }
        catch (e)
        {
            // thrown if directory does not exist
            liberator.log("Error sourcing macros directory: " + e, 9);
        }
    }, 100);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_mappings", function () {
        mappings.add(modes.all,
            ["<Esc>", "<C-[>"], "Focus content",
            function () { events.onEscape(); });

        // add the ":" mapping in all but insert mode mappings
        mappings.add([modes.NORMAL, modes.PLAYER, modes.VISUAL, modes.HINTS, modes.MESSAGE, modes.COMPOSE, modes.CARET, modes.TEXTAREA],
            [":"], "Enter command line mode",
            function () { commandline.open(":", "", modes.EX); });

        // focus events
        mappings.add([modes.NORMAL, modes.PLAYER, modes.VISUAL, modes.CARET],
            ["<Tab>"], "Advance keyboard focus",
            function () { document.commandDispatcher.advanceFocus(); });

        mappings.add([modes.NORMAL, modes.PLAYER, modes.VISUAL, modes.CARET, modes.INSERT, modes.TEXTAREA],
            ["<S-Tab>"], "Rewind keyboard focus",
            function () { document.commandDispatcher.rewindFocus(); });

        mappings.add(modes.all,
            ["<C-z>"], "Temporarily ignore all " + config.name + " key bindings",
            function () { modes.passAllKeys = true; });

        mappings.add(modes.all,
            ["<C-v>"], "Pass through next key",
            function () { modes.passNextKey = true; });

        mappings.add(modes.all,
            ["<Nop>"], "Do nothing",
            function () { return; });

        // macros
        mappings.add([modes.NORMAL, modes.PLAYER, modes.MESSAGE],
            ["q"], "Record a key sequence into a macro",
            function (arg) { events.startRecording(arg); },
            { arg: true });

        mappings.add([modes.NORMAL, modes.PLAYER, modes.MESSAGE],
            ["@"], "Play a macro",
            function (count, arg)
            {
                if (count < 1) count = 1;
                while (count-- && events.playMacro(arg))
                    ;
            },
            { arg: true, count: true });
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["delmac[ros]"],
        "Delete macros",
        function (args)
        {
            if (args.bang && args.string)
                return void liberator.echoerr("E474: Invalid argument");

            if (args.bang)
                events.deleteMacros();
            else if (args.string)
                events.deleteMacros(args.string);
            else
                liberator.echoerr("E471: Argument required");
        },
        {
            bang: true,
            completer: function (context) completion.macro(context)
        });

    commands.add(["macros"],
        "List all macros",
        function (args) { completion.listCompleter("macro", args[0]); },
        {
            argCount: "?",
            completer: function (context) completion.macro(context)
        });

    commands.add(["pl[ay]"],
        "Replay a recorded macro",
        function (args) { events.playMacro(args[0]); },
        {
            argCount: "1",
            completer: function (context) completion.macro(context)
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const self = {

        /**
         * @property {boolean} Whether synthetic key events are currently being
         *     processed.
         */
        feedingKeys: false,

        wantsModeReset: true, // used in onFocusChange since Firefox is so buggy here

        /**
         * A destructor called when this module is destroyed.
         */
        destroy: function ()
        {
            // removeEventListeners() to avoid mem leaks
            liberator.dump("TODO: remove all eventlisteners");

            try
            {
                getBrowser().removeProgressListener(this.progressListener);
            }
            catch (e) {}

            window.removeEventListener("popupshown", enterPopupMode, true);
            window.removeEventListener("popuphidden", exitPopupMode, true);
            window.removeEventListener("DOMMenuBarActive", enterMenuMode, true);
            window.removeEventListener("DOMMenuBarInactive", exitMenuMode, true);

            window.removeEventListener("keypress", this.onKeyPress, true);
            window.removeEventListener("keydown", this.onKeyDown, true);
        },

        /**
         * Initiates the recording of a key event macro.
         *
         * @param {string} macro The name for the macro.
         */
        startRecording: function (macro)
        {
            if (!/[a-zA-Z0-9]/.test(macro))
                // TODO: ignore this like Vim?
                return void liberator.echoerr("E354: Invalid register name: '" + macro + "'");

            modes.isRecording = true;

            if (/[A-Z]/.test(macro)) // uppercase (append)
            {
                currentMacro = macro.toLowerCase();
                if (!macros.get(currentMacro))
                    macros.set(currentMacro, ""); // initialize if it does not yet exist
            }
            else
            {
                currentMacro = macro;
                macros.set(currentMacro, "");
            }
        },

        /**
         * Replays a macro.
         *
         * @param {string} The name of the macro to replay.
         * @return {boolean}
         */
        playMacro: function (macro)
        {
            let res = false;
            if (!/[a-zA-Z0-9@]/.test(macro) && macro.length == 1)
            {
                liberator.echoerr("E354: Invalid register name: '" + macro + "'");
                return false;
            }

            if (macro == "@") // use lastMacro if it's set
            {
                if (!lastMacro)
                {
                    liberator.echoerr("E748: No previously used register");
                    return false;
                }
            }
            else
            {
                if (macro.length == 1)
                    lastMacro = macro.toLowerCase(); // XXX: sets last played macro, even if it does not yet exist
                else
                    lastMacro = macro; // e.g. long names are case sensitive
            }

            if (macros.get(lastMacro))
            {
                // make sure the page is stopped before starting to play the macro
                try
                {
                    window.getWebNavigation().stop(nsIWebNavigation.STOP_ALL);
                }
                catch (e) {}

                buffer.loaded = 1; // even if not a full page load, assume it did load correctly before starting the macro
                modes.isReplaying = true;
                res = events.feedkeys(macros.get(lastMacro), { noremap: true });
                modes.isReplaying = false;
            }
            else
            {
                if (lastMacro.length == 1)
                    // TODO: ignore this like Vim?
                    liberator.echoerr("Exxx: Register '" + lastMacro + "' not set");
                else
                    liberator.echoerr("Exxx: Named macro '" + lastMacro + "' not set");
            }
            return res;
        },

        /**
         * Returns all macros matching <b>filter</b>.
         *
         * @param {string} filter A regular expression filter string. A null
         *     filter selects all macros.
         */
        getMacros: function (filter)
        {
            if (!filter)
                return macros;

            let re = RegExp(filter);
            return ([macro, keys] for ([macro, keys] in macros) if (re.test(macro)));
        },

        /**
         * Deletes all macros matching <b>filter</b>.
         *
         * @param {string} filter A regular expression filter string. A null
         *     filter deletes all macros.
         */
        deleteMacros: function (filter)
        {
            let re = RegExp(filter);

            for (let [item, ] in macros)
            {
                if (re.test(item) || !filter)
                    macros.remove(item);
            }
        },

        /**
         * Pushes keys onto the event queue from liberator. It is similar to
         * Vim's feedkeys() method, but cannot cope with 2 partially-fed
         * strings, you have to feed one parsable string.
         *
         * @param {string} keys A string like "2<C-f>" to push onto the event
         *     queue. If you want "<" to be taken literally, prepend it with a
         *     "\\".
         * @param {boolean} noremap Allow recursive mappings.
         * @param {boolean} silent Whether the command should be echoed to the
         *     command line.
         * @returns {boolean}
         */
        feedkeys: function (keys, noremap, quiet)
        {
            let doc = window.document;
            let view = window.document.defaultView;

            let wasFeeding = this.feedingKeys;
            this.feedingKeys = true;
            this.duringFeed = this.duringFeed || [];
            let wasQuiet  = commandline.quiet;
            if (quiet)
                commandline.quiet = quiet;

            try
            {
                liberator.threadYield(1, true);

                for (let [, evt_obj] in Iterator(events.fromString(keys)))
                {
                    let elem = liberator.focus || window.content;
                    let evt = events.create(doc, "keypress", evt_obj);

                    if (typeof noremap == "object")
                        for (let [k, v] in Iterator(noremap))
                            evt[k] = v;
                    else
                        evt.noremap = !!noremap;
                    evt.isMacro = true;
                    // A special hack for liberator-specific key names.
                    if (evt_obj.liberatorString || evt_obj.liberatorShift)
                    {
                        evt.liberatorString = evt_obj.liberatorString; // for key-less keypress events e.g. <Nop>
                        evt.liberatorShift = evt_obj.liberatorShift; // for untypable shift keys e.g. <S-1>
                        events.onKeyPress(evt);
                    }

                    else
                        elem.dispatchEvent(evt);

                    if (!this.feedingKeys)
                        break;

                    // Stop feeding keys if page loading failed.
                    if (modes.isReplaying && !waitForPageLoad())
                        break;
                }
            }
            finally
            {
                this.feedingKeys = wasFeeding;
                if (quiet)
                    commandline.quiet = wasQuiet;

                if (this.duringFeed.length)
                {
                    let duringFeed = this.duringFeed;
                    this.duringFeed = [];
                    for (let [, evt] in Iterator(duringFeed))
                        evt.target.dispatchEvent(evt);
                }
            }
        },

        /**
         * Creates an actual event from a pseudo-event object.
         *
         * The pseudo-event object (such as may be retrieved from events.fromString)
         * should have any properties you want the event to have.
         *
         * @param {Document} doc  The DOM document to associate this event with
         * @param {Type} type  The type of event (keypress, click, etc.)
         * @param {Object} opts  The pseudo-event.
         */
        create: function (doc, type, opts)
        {
            var DEFAULTS = {
                Key: {
                    type: type,
                    bubbles: true, cancelable: true,
                    view: doc.defaultView,
                    ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
                    keyCode: 0, charCode: 0
                },
                Mouse: {
                    type: type,
                    bubbles: true, cancelable: true,
                    view: doc.defaultView,
                    detail: 1,
                    screenX: 0, screenY: 0,
                    clientX: 0, clientY: 0,
                    ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
                    button: 0,
                    relatedTarget: null
                }
            };
            const TYPES = {
                click: "Mouse", mousedown: "Mouse", mouseup: "Mouse",
                mouseover: "Mouse", mouseout: "Mouse",
                keypress: "Key", keyup: "Key", keydown: "Key"
            };
            var t = TYPES[type];
            var evt = doc.createEvent(t + "Events");
            evt["init" + t + "Event"].apply(evt,
                    [v for ([k, v] in Iterator(util.extend(DEFAULTS[t], opts)))]);
            return evt;
        },

        /**
         * Converts a user-input string of keys into a canonical
         * representation.
         *
         * <C-A> maps to <C-a>, <C-S-a> maps to <C-S-A>
         * <C- > maps to <C-Space>, <S-a> maps to A
         * << maps to <lt><lt>
         *
         * <S-@> is preserved, as in vim, to allow untypable key-combinations
         * in macros.
         *
         * canonicalKeys(canonicalKeys(x)) == canonicalKeys(x) for all values
         * of x.
         *
         * @param {string} keys Messy form.
         * @returns {string} Canonical form.
         */
        canonicalKeys: function (keys)
        {
            return events.fromString(keys).map(events.toString).join("");
        },

        /**
         * Converts an event string into an array of pseudo-event objects.
         *
         * These objects can be used as arguments to events.toString or
         * events.create, though they are unlikely to be much use for other
         * purposes. They have many of the properties you'd expect to find on a
         * real event, but none of the methods.
         *
         * Also may contain two "special" parameters, .liberatorString and
         * .liberatorShift these are set for characters that can never by
         * typed, but may appear in mappings, for example <Nop> is passed as
         * liberatorString, and liberatorShift is set when a user specifies
         * <S-@> where @ is a non-case-changable, non-space character.
         *
         * @param {string} keys The string to parse.
         * @return {Array[Object]}
         */
        fromString: function (input)
        {
            let out = [];

            let re = RegExp("<.*?>?>|[^<]|<(?!.*>)", "g");
            let match;

            while (match = re.exec(input))
            {
                let evt_str = match[0];
                let evt_obj = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
                                keyCode: 0, charCode: 0, type: "keypress" };

                if (evt_str.length > 1) // <.*?>
                {
                    let [match, modifier, keyname] = evt_str.match(/^<((?:[CSMA]-)*)(.+?)>$/i) || [false, '', ''];
                    modifier = modifier.toUpperCase();
                    keyname = keyname.toLowerCase();

                    if (keyname && !(keyname.length == 1 && modifier.length == 0 ||  // disallow <> and <a>
                        !(keyname.length == 1 || key_code[keyname] || keyname == "nop" || /mouse$/.test(keyname)))) // disallow <misteak>
                    {
                        evt_obj.ctrlKey  = /C-/.test(modifier);
                        evt_obj.altKey   = /A-/.test(modifier);
                        evt_obj.shiftKey = /S-/.test(modifier);
                        evt_obj.metaKey  = /M-/.test(modifier);

                        if (keyname.length == 1) // normal characters
                        {
                            if (evt_obj.shiftKey)
                            {
                                keyname = keyname.toUpperCase();
                                if (keyname == keyname.toLowerCase())
                                    evt_obj.liberatorShift = true;
                            }

                            evt_obj.charCode = keyname.charCodeAt(0);
                        }
                        else if (keyname == "nop")
                        {
                            evt_obj.liberatorString = "<Nop>";
                        }
                        else if (/mouse$/.test(keyname)) // mouse events
                        {
                            evt_obj.type = (/2-/.test(modifier) ? "dblclick" : "click");
                            evt_obj.button = ["leftmouse", "middlemouse", "rightmouse"].indexOf(keyname);
                            delete evt_obj.keyCode;
                            delete evt_obj.charCode;
                        }
                        else // spaces, control characters, and <
                        {
                            evt_obj.keyCode = key_code[keyname];
                            evt_obj.charCode = 0;
                        }
                    }
                    else // an invalid sequence starting with <, treat as a literal
                    {
                        out = out.concat(events.fromString("<lt>" + evt_str.substr(1)));
                        continue;
                    }
                }
                else // a simple key (no <...>)
                    evt_obj.charCode = evt_str.charCodeAt(0);

                // TODO: make a list of characters that need keyCode and charCode somewhere
                if (evt_obj.keyCode == 32 || evt_obj.charCode == 32)
                    evt_obj.charCode = evt_obj.keyCode = 32; // <Space>
                if (evt_obj.keyCode == 60 || evt_obj.charCode == 60)
                    evt_obj.charCode = evt_obj.keyCode = 60; // <lt>

                out.push(evt_obj);
            }
            return out;
        },

        /**
         * Converts the specified event to a string in liberator key-code
         * notation. Returns null for an unknown event.
         *
         * E.g. pressing ctrl+n would result in the string "<C-n>".
         *
         * @param {Event} event
         * @returns {string}
         */
        toString: function (event)
        {
            if (!event)
                return "[object Mappings]";

            if (event.liberatorString)
                return event.liberatorString;

            let key = null;
            let modifier = "";

            if (event.ctrlKey)
                modifier += "C-";
            if (event.altKey)
                modifier += "A-";
            if (event.metaKey)
                modifier += "M-";

            if (/^key/.test(event.type))
            {
                if (event.charCode == 0)
                {
                    if (event.shiftKey)
                        modifier += "S-";

                    if (event.keyCode in code_key)
                        key = code_key[event.keyCode];
                }
                // [Ctrl-Bug] special handling of mysterious <C-[>, <C-\\>, <C-]>, <C-^>, <C-_> bugs (OS/X)
                //            (i.e., cntrl codes 27--31)
                // ---
                // For more information, see:
                //     [*] Vimp FAQ: http://vimperator.org/trac/wiki/Vimperator/FAQ#WhydoesntC-workforEscMacOSX
                //     [*] Referenced mailing list msg: http://www.mozdev.org/pipermail/vimperator/2008-May/001548.html
                //     [*] Mozilla bug 416227: event.charCode in keypress handler has unexpected values on Mac for Ctrl with chars in "[ ] _ \"
                //         https://bugzilla.mozilla.org/show_bug.cgi?query_format=specific&order=relevance+desc&bug_status=__open__&id=416227
                //     [*] Mozilla bug 432951: Ctrl+'foo' doesn't seem same charCode as Meta+'foo' on Cocoa
                //         https://bugzilla.mozilla.org/show_bug.cgi?query_format=specific&order=relevance+desc&bug_status=__open__&id=432951
                // ---
                //
                // The following fixes are only activated if liberator.has("MacUnix").
                // Technically, they prevent mappings from <C-Esc> (and
                // <C-C-]> if your fancy keyboard permits such things<?>), but
                // these <C-control> mappings are probably pathological (<C-Esc>
                // certainly is on Windows), and so it is probably
                // harmless to remove the has("MacUnix") if desired.
                //
                else if (liberator.has("MacUnix") && event.ctrlKey && event.charCode >= 27 && event.charCode <= 31)
                {
                    if (event.charCode == 27) // [Ctrl-Bug 1/5] the <C-[> bug
                    {
                        key = "Esc";
                        modifier = modifier.replace("C-", "");
                    }
                    else // [Ctrl-Bug 2,3,4,5/5] the <C-\\>, <C-]>, <C-^>, <C-_> bugs
                        key = String.fromCharCode(event.charCode + 64);
                }
                // a normal key like a, b, c, 0, etc.
                else if (event.charCode > 0)
                {
                    key = String.fromCharCode(event.charCode);

                    if (key in key_code)
                    {
                        // a named charcode key (<Space> and <lt>) space can be shifted, <lt> must be forced
                        if ((key.match(/^\s$/) && event.shiftKey) || event.liberatorShift)
                            modifier += "S-";

                        key = code_key[key_code[key]];
                    }
                    else
                    {
                        // a shift modifier is only allowed if the key is alphabetical and used in a C-A-M- mapping in the uppercase,
                        // or if the shift has been forced for a non-alphabetical character by the user while :map-ping
                        if ((key != key.toLowerCase() && (event.ctrlKey || event.altKey || event.metaKey)) || event.liberatorShift)
                            modifier += "S-";
                        else if  (modifier.length == 0)
                            return key;
                    }
                }
                if (key == null)
                    return;
            }
            else if (event.type == "click" || event.type == "dblclick")
            {
                if (event.shiftKey)
                    modifier += "S-";
                if (event.type == "dblclick")
                    modifier += "2-";
                // TODO: triple and quadruple click

                switch (event.button)
                {
                    case 0:
                        key = "LeftMouse";
                        break;
                    case 1:
                        key = "MiddleMouse";
                        break;
                    case 2:
                        key = "RightMouse";
                        break;
                }
            }

            if (key == null)
                return null;

            return "<" + modifier + key + ">";
        },

        /**
         * Whether <b>key</b> is a key code defined to accept/execute input on
         * the command line.
         *
         * @param {string} key The key code to test.
         * @returns {boolean}
         */
        isAcceptKey: function (key) key == "<Return>" || key == "<C-j>" || key == "<C-m>",

        /**
         * Whether <b>key</b> is a key code defined to reject/cancel input on
         * the command line.
         *
         * @param {string} key The key code to test.
         * @returns {boolean}
         */
        isCancelKey: function (key) key == "<Esc>" || key == "<C-[>" || key == "<C-c>",

        /**
         * Waits for the current buffer to successfully finish loading. Returns
         * true for a successful page load otherwise false.
         *
         * @returns {boolean}
         */
        waitForPageLoad: function ()
        {
            //liberator.dump("start waiting in loaded state: " + buffer.loaded);
            liberator.threadYield(true); // clear queue

            if (buffer.loaded == 1)
                return true;

            const maxWaitTime = 25;
            let start = Date.now();
            let end = start + (maxWaitTime * 1000); // maximum time to wait - TODO: add option
            let now;
            while (now = Date.now(), now < end)
            {
                liberator.threadYield();
                //if ((now - start) % 1000 < 10)
                //    liberator.dump("waited: " + (now - start) + " ms");

                if (!events.feedingKeys)
                    return false;

                if (buffer.loaded > 0)
                {
                    liberator.sleep(250);
                    break;
                }
                else
                    liberator.echo("Waiting for page to load...", commandline.DISALLOW_MULTILINE);
            }
            modes.show();

            // TODO: allow macros to be continued when page does not fully load with an option
            let ret = (buffer.loaded == 1);
            if (!ret)
                liberator.echoerr("Page did not load completely in " + maxWaitTime + " seconds. Macro stopped.");
            //liberator.dump("done waiting: " + ret);

            // sometimes the input widget had focus when replaying a macro
            // maybe this call should be moved somewhere else?
            // liberator.focusContent(true);

            return ret;
        },

        // argument "event" is deliberately not used, as i don't seem to have
        // access to the real focus target
        // Huh? --djk
        onFocusChange: function (event)
        {
            // command line has it's own focus change handler
            if (liberator.mode == modes.COMMAND_LINE)
                return;

            function hasHTMLDocument(win) win && win.document && win.document instanceof HTMLDocument

            let win  = window.document.commandDispatcher.focusedWindow;
            let elem = window.document.commandDispatcher.focusedElement;

            if (win && win.top == content && liberator.has("tabs"))
                tabs.localStore.focusedFrame = win;

            try
            {
                if (elem && elem.readOnly)
                    return;

                if ((elem instanceof HTMLInputElement && /^(text|password)$/.test(elem.type)) ||
                    (elem instanceof HTMLSelectElement))
                {
                    liberator.mode = modes.INSERT;
                    if (hasHTMLDocument(win))
                        buffer.lastInputField = elem;
                    return;
                }
                if (elem instanceof HTMLEmbedElement || elem instanceof HTMLObjectElement)
                {
                    liberator.mode = modes.EMBED;
                    return;
                }

                if (elem instanceof HTMLTextAreaElement || (elem && elem.contentEditable == "true"))
                {
                    if (options["insertmode"])
                        modes.set(modes.INSERT);
                    else if (elem.selectionEnd - elem.selectionStart > 0)
                        modes.set(modes.VISUAL, modes.TEXTAREA);
                    else
                        modes.main = modes.TEXTAREA;
                    if (hasHTMLDocument(win))
                        buffer.lastInputField = elem;
                    return;
                }

                if (config.focusChange)
                    return void config.focusChange(win);

                let urlbar = document.getElementById("urlbar");
                if (elem == null && urlbar && urlbar.inputField == lastFocus)
                    liberator.threadYield(true);

                if (liberator.mode & (modes.EMBED | modes.INSERT | modes.TEXTAREA | modes.VISUAL))
                     modes.reset();
            }
            finally
            {
                lastFocus = elem;
            }
        },

        onSelectionChange: function (event)
        {
            let couldCopy = false;
            let controller = document.commandDispatcher.getControllerForCommand("cmd_copy");
            if (controller && controller.isCommandEnabled("cmd_copy"))
                couldCopy = true;

            if (liberator.mode != modes.VISUAL)
            {
                if (couldCopy)
                {
                    if ((liberator.mode == modes.TEXTAREA ||
                         (modes.extended & modes.TEXTAREA))
                            && !options["insertmode"])
                        modes.set(modes.VISUAL, modes.TEXTAREA);
                    else if (liberator.mode == modes.CARET)
                        modes.set(modes.VISUAL, modes.CARET);
                }
            }
            // XXX: disabled, as i think automatically starting visual caret mode does more harm than help
            // else
            // {
            //     if (!couldCopy && modes.extended & modes.CARET)
            //         liberator.mode = modes.CARET;
            // }
        },

        /**
         *  The global escape key handler. This is called in ALL modes.
         */
        onEscape: function ()
        {
            if (modes.passNextKey)
                return;

            if (modes.passAllKeys)
            {
                modes.passAllKeys = false;
                return;
            }

            switch (liberator.mode)
            {
                case modes.NORMAL:
                    // clear any selection made
                    let selection = window.content.getSelection();
                    try
                    { // a simple if (selection) does not seem to work
                        selection.collapseToStart();
                    }
                    catch (e) {}

                    modes.reset();
                    break;

                case modes.VISUAL:
                    if (modes.extended & modes.TEXTAREA)
                        liberator.mode = modes.TEXTAREA;
                    else if (modes.extended & modes.CARET)
                        liberator.mode = modes.CARET;
                    break;

                case modes.CARET:
                    // setting this option will trigger an observer which will
                    // take care of all other details like setting the NORMAL
                    // mode
                    options.setPref("accessibility.browsewithcaret", false);
                    break;

                case modes.TEXTAREA:
                    // TODO: different behaviour for text areas and other input
                    // fields seems unnecessarily complicated. If the user
                    // likes Vi-mode then they probably like it for all input
                    // fields, if not they can enter it explicitly for only
                    // text areas.  The mode name TEXTAREA is confusing and
                    // would be better replaced with something indicating that
                    // it's a Vi editing mode. Extended modes really need to be
                    // displayed too. --djk
                    function isInputField()
                    {
                        let elem = liberator.focus;
                        return ((elem instanceof HTMLInputElement && !/image/.test(elem.type))
                              || elem instanceof HTMLIsIndexElement);
                    }

                    if (options["insertmode"] || isInputField())
                        liberator.mode = modes.INSERT;
                    else
                        modes.reset();
                    break;

                case modes.INSERT:
                    if ((modes.extended & modes.TEXTAREA))
                        liberator.mode = modes.TEXTAREA;
                    else
                        modes.reset();
                    break;

                default: // HINTS, CUSTOM or COMMAND_LINE
                    modes.reset();
                    break;
            }
        },

        // this keypress handler gets always called first, even if e.g.
        // the commandline has focus
        onKeyPress: function (event)
        {
            function isEscapeKey(key) key == "<Esc>" || key == "<C-[>";

            function killEvent()
            {
                event.preventDefault();
                event.stopPropagation();
            }

            let key = events.toString(event);
            if (!key)
                 return;

            if (modes.isRecording)
            {
                if (key == "q") // TODO: should not be hardcoded
                {
                    modes.isRecording = false;
                    liberator.log("Recorded " + currentMacro + ": " + macros.get(currentMacro), 9);
                    liberator.echomsg("Recorded macro '" + currentMacro + "'");
                    return void killEvent();
                }
                else if (!mappings.hasMap(liberator.mode, input.buffer + key))
                    macros.set(currentMacro, macros.get(currentMacro) + key);
            }

            if (key == "<C-c>")
                liberator.interrupted = true;

            // feedingKeys needs to be separate from interrupted so
            // we can differentiate between a recorded <C-c>
            // interrupting whatever it's started and a real <C-c>
            // interrupting our playback.
            if (events.feedingKeys && !event.isMacro)
            {
                if (key == "<C-c>")
                {
                    events.feedingKeys = false;
                    if (modes.isReplaying)
                    {
                        modes.isReplaying = false;
                        setTimeout(function () { liberator.echomsg("Canceled playback of macro '" + lastMacro + "'"); }, 100);
                    }
                }
                else
                    events.duringFeed.push(event);

                return void killEvent();
            }

            try
            {
                let stop = false;

                let win = document.commandDispatcher.focusedWindow;
                if (win && win.document && win.document.designMode == "on" && !config.isComposeWindow)
                    stop = true;
                // menus have their own command handlers
                if (modes.extended & modes.MENU)
                    stop = true;
                // handle Escape-one-key mode (Ctrl-v)
                else if (modes.passNextKey && !modes.passAllKeys)
                {
                    modes.passNextKey = false;
                    stop = true;
                }
                // handle Escape-all-keys mode (Ctrl-q)
                else if (modes.passAllKeys)
                {
                    if (modes.passNextKey)
                        modes.passNextKey = false; // and then let flow continue
                    else if (isEscapeKey(key) || key == "<C-v>")
                        ; // let flow continue to handle these keys to cancel escape-all-keys mode
                    else
                        stop = true;
                }

                if (stop)
                {
                    input.buffer = "";
                    return;
                }

                stop = true; // set to false if we should NOT consume this event but let the host app handle it

                // just forward event without checking any mappings when the MOW is open
                if (liberator.mode == modes.COMMAND_LINE && (modes.extended & modes.OUTPUT_MULTILINE))
                {
                    commandline.onMultilineOutputEvent(event);
                    return void killEvent();
                }

                // XXX: ugly hack for now pass certain keys to the host app as
                // they are without beeping also fixes key navigation in combo
                // boxes, submitting forms, etc.
                // FIXME: breaks iabbr for now --mst
                if (key in config.ignoreKeys && (config.ignoreKeys[key] & liberator.mode))
                {
                    input.buffer = "";
                    return;
                }

                // TODO: handle middle click in content area

                if (!isEscapeKey(key))
                {
                    // custom mode...
                    if (liberator.mode == modes.CUSTOM)
                    {
                        plugins.onEvent(event);
                        return void killEvent();
                    }

                    // All of these special cases for hint mode are driving
                    // me insane! -Kris
                    if (modes.extended & modes.HINTS)
                    {
                        // under HINT mode, certain keys are redirected to hints.onEvent
                        if (key == "<Return>" || key == "<Tab>" || key == "<S-Tab>"
                            || key == mappings.getMapLeader()
                            || (key == "<BS>" && hints.previnput == "number")
                            || (/^[0-9]$/.test(key) && !hints.escNumbers))
                        {
                            hints.onEvent(event);
                            input.buffer = "";
                            return void killEvent();
                        }

                        // others are left to generate the 'input' event or handled by the host app
                        return;
                    }
                }

                // FIXME (maybe): (is an ESC or C-] here): on HINTS mode, it enters
                // into 'if (map && !skipMap) below. With that (or however) it
                // triggers the onEscape part, where it resets mode. Here I just
                // return true, with the effect that it also gets to there (for
                // whatever reason).  if that happens to be correct, well..
                // XXX: why not just do that as well for HINTS mode actually?

                if (liberator.mode == modes.CUSTOM)
                    return;

                let inputStr = input.buffer + key;
                let countStr = inputStr.match(/^[1-9][0-9]*|/)[0];
                let candidateCommand = inputStr.substr(countStr.length);
                let map = mappings[event.noremap ? "getDefault" : "get"](liberator.mode, candidateCommand);

                let candidates = mappings.getCandidates(liberator.mode, candidateCommand);
                if (candidates.length == 0 && !map)
                {
                    map = input.pendingMap;
                    input.pendingMap = null;
                    if (map && map.arg)
                        input.pendingArgMap = map;
                }

                // counts must be at the start of a complete mapping (10j -> go 10 lines down)
                if (countStr && !candidateCommand)
                {
                    // no count for insert mode mappings
                    if (!modes.mainMode.count || modes.mainMode.input)
                        stop = false;
                    else
                        input.buffer = inputStr;
                }
                else if (input.pendingArgMap)
                {
                    input.buffer = "";
                    let map = input.pendingArgMap;
                    input.pendingArgMap = null;
                    if (!isEscapeKey(key))
                    {
                        if (modes.isReplaying && !waitForPageLoad())
                            return;
                        map.execute(null, input.count, key);
                    }
                }
                // only follow a map if there isn't a longer possible mapping
                // (allows you to do :map z yy, when zz is a longer mapping than z)
                else if (map && !event.skipmap && candidates.length == 0)
                {
                    input.pendingMap = null;
                    input.count = parseInt(countStr, 10);
                    if (isNaN(input.count))
                        input.count = -1;
                    input.buffer = "";
                    if (map.arg)
                    {
                        input.buffer = inputStr;
                        input.pendingArgMap = map;
                    }
                    else if (input.pendingMotionMap)
                    {
                        if (!isEscapeKey(key))
                            input.pendingMotionMap.execute(candidateCommand, input.count, null);
                        input.pendingMotionMap = null;
                    }
                    // no count support for these commands yet
                    else if (map.motion)
                    {
                        input.pendingMotionMap = map;
                    }
                    else
                    {
                        if (modes.isReplaying && !waitForPageLoad())
                            return void killEvent();

                        let ret = map.execute(null, input.count);
                        if (map.route && ret)
                            stop = false;
                    }
                }
                else if (mappings.getCandidates(liberator.mode, candidateCommand).length > 0 && !event.skipmap)
                {
                    input.pendingMap = map;
                    input.buffer += key;
                }
                else // if the key is neither a mapping nor the start of one
                {
                    // the mode checking is necessary so that things like g<esc> do not beep
                    if (input.buffer != "" && !event.skipmap &&
                        (liberator.mode & (modes.INSERT | modes.COMMAND_LINE | modes.TEXTAREA)))
                        events.feedkeys(input.buffer, { noremap: true, skipmap: true });

                    input.buffer = "";
                    input.pendingArgMap = null;
                    input.pendingMotionMap = null;
                    input.pendingMap = null;

                    if (!isEscapeKey(key))
                    {
                        // allow key to be passed to the host app if we can't handle it
                        stop = false;

                        if (liberator.mode == modes.COMMAND_LINE)
                        {
                            if (!(modes.extended & modes.INPUT_MULTILINE))
                                commandline.onEvent(event); // reroute event in command line mode
                        }
                        else if (!modes.mainMode.input)
                            liberator.beep();
                    }
                }

                if (stop)
                    killEvent();
            }
            finally
            {
                let motionMap = (input.pendingMotionMap && input.pendingMotionMap.names[0]) || "";
                statusline.updateInputBuffer(motionMap + input.buffer);
            }
        },

        // this is need for sites like msn.com which focus the input field on keydown
        onKeyUpOrDown: function (event)
        {
            if (modes.passNextKey ^ modes.passAllKeys || isInputElemFocused())
                return;

            event.stopPropagation();
        },

        // TODO: move to buffer.js?
        /**
         * The liberator document loading progress listener.
         */
        progressListener: {
            QueryInterface: XPCOMUtils.generateQI([
                Ci.nsIWebProgressListener,
                Ci.nsIXULBrowserWindow
            ]),

            // XXX: function may later be needed to detect a canceled synchronous openURL()
            onStateChange: function (webProgress, request, flags, status)
            {
                // STATE_IS_DOCUMENT | STATE_IS_WINDOW is important, because we also
                // receive statechange events for loading images and other parts of the web page
                if (flags & (Ci.nsIWebProgressListener.STATE_IS_DOCUMENT | Ci.nsIWebProgressListener.STATE_IS_WINDOW))
                {
                    // This fires when the load event is initiated
                    // only thrown for the current tab, not when another tab changes
                    if (flags & Ci.nsIWebProgressListener.STATE_START)
                    {
                        buffer.loaded = 0;
                        statusline.updateProgress(0);

                        autocommands.trigger("PageLoadPre", { url: buffer.URL });

                        // don't reset mode if a frame of the frameset gets reloaded which
                        // is not the focused frame
                        if (document.commandDispatcher.focusedWindow == webProgress.DOMWindow)
                        {
                            setTimeout(function () { modes.reset(false); },
                                liberator.mode == modes.HINTS ? 500 : 0);
                        }
                    }
                    else if (flags & Ci.nsIWebProgressListener.STATE_STOP)
                    {
                        buffer.loaded = (status == 0 ? 1 : 2);
                        statusline.updateUrl();
                    }
                }
            },
            // for notifying the user about secure web pages
            onSecurityChange: function (webProgress, request, state)
            {
                // TODO: do something useful with STATE_SECURE_MED and STATE_SECURE_LOW
                if (state & Ci.nsIWebProgressListener.STATE_IS_INSECURE)
                    statusline.setClass("insecure");
                else if (state & Ci.nsIWebProgressListener.STATE_IS_BROKEN)
                    statusline.setClass("broken");
                else if (state & Ci.nsIWebProgressListener.STATE_IDENTITY_EV_TOPLEVEL)
                    statusline.setClass("extended");
                else if (state & Ci.nsIWebProgressListener.STATE_SECURE_HIGH)
                    statusline.setClass("secure");
            },
            onStatusChange: function (webProgress, request, status, message)
            {
                statusline.updateUrl(message);
            },
            onProgressChange: function (webProgress, request, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress)
            {
                statusline.updateProgress(curTotalProgress/maxTotalProgress);
            },
            // happens when the users switches tabs
            onLocationChange: function ()
            {
                statusline.updateUrl();
                statusline.updateProgress();

                autocommands.trigger("LocationChange", { url: buffer.URL });

                // if this is not delayed we get the position of the old buffer
                setTimeout(function () { statusline.updateBufferPosition(); }, 500);
            },
            // called at the very end of a page load
            asyncUpdateUI: function ()
            {
                setTimeout(function () { statusline.updateUrl(); }, 100);
            },
            setOverLink: function (link, b)
            {
                let ssli = options["showstatuslinks"];
                if (link && ssli)
                {
                    if (ssli == 1)
                        statusline.updateUrl("Link: " + link);
                    else if (ssli == 2)
                        liberator.echo("Link: " + link, commandline.DISALLOW_MULTILINE);
                }

                if (link == "")
                {
                    if (ssli == 1)
                        statusline.updateUrl();
                    else if (ssli == 2)
                        modes.show();
                }
            },

            // nsIXULBrowserWindow stubs
            setJSDefaultStatus: function (status) {},
            setJSStatus: function (status) {},

            // Stub for something else, presumably. Not in any documented
            // interface.
            onLinkIconAvailable: function () {}
        }
    }; //}}}

    window.XULBrowserWindow = self.progressListener;
    window.QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIWebNavigation)
          .QueryInterface(Ci.nsIDocShellTreeItem)
          .treeOwner
          .QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIXULWindow)
          .XULBrowserWindow = self.progressListener;
    try
    {
        getBrowser().addProgressListener(self.progressListener, Ci.nsIWebProgress.NOTIFY_ALL);
    }
    catch (e) {}

    liberator.registerObserver("shutdown", function () { self.destroy(); });

    function wrapListener(method)
    {
        return function (event) {
            try
            {
                self[method](event);
            }
            catch (e)
            {
                if (e.message == "Interrupted")
                    liberator.echoerr("Interrupted");
                else
                    liberator.echoerr("Processing " + event.type + " event: " + (e.echoerr || e));
                liberator.reportError(e);
            }
        };
    }
    window.addEventListener("keypress", wrapListener("onKeyPress"),    true);
    window.addEventListener("keydown",  wrapListener("onKeyUpOrDown"), true);
    window.addEventListener("keyup",    wrapListener("onKeyUpOrDown"), true);

    return self;

} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
