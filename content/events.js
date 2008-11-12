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

function AutoCommands() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var store = [];

    function matchAutoCmd(autoCmd, event, regex)
    {
        return (!event || autoCmd.event == event) &&
               (!regex || autoCmd.pattern.source == regex);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["eventignore", "ei"],
        "List of autocommand event names which should be ignored",
        "stringlist", "",
        {
            completer: function (value) config.autocommands.concat([["all", "All events"]]),
            validator: function (value)
            {
                let values = value.split(",");
                let events = config.autocommands.map(function (event) event[0]);
                events.push("all");

                return values.every(function (event) events.indexOf(event) >= 0);
            }
        });

    options.add(["focuscontent", "fc"],
        "Try to stay in normal mode after loading a web page",
        "boolean", false);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["au[tocmd]"],
        "Execute commands automatically on events",
        function (args, special)
        {
            let [event, regex] = args.arguments;
            let cmd = args.literalArg;
            let events = null;
            if (event)
            {
                // NOTE: event can only be a comma separated list for |:au {event} {pat} {cmd}|
                let validEvents = config.autocommands.map(function (event) event[0]);
                validEvents.push("*");

                events = event.split(",");
                if (!events.every(function (event) validEvents.indexOf(event) >= 0))
                {
                    liberator.echoerr("E216: No such group or event: " + event);
                    return;
                }
            }

            if (cmd) // add new command, possibly removing all others with the same event/pattern
            {
                if (special)
                    autocommands.remove(event, regex);
                autocommands.add(events, regex, cmd);
            }
            else
            {
                if (event == "*")
                    event = null;
                if (special)
                {
                    // TODO: "*" only appears to work in Vim when there is a {group} specified
                    if (args.arguments[0] != "*" || regex)
                        autocommands.remove(event, regex); // remove all
                }
                else
                {
                    autocommands.list(event, regex);   // list all
                }
            }
        },
        {
            argCount: "3",
            bang: true,
            completer: function (filter) completion.event(filter),
            literal: true
        });

    // TODO: expand target to all buffers
    commands.add(["doauto[all]"],
        "Apply the autocommands matching the specified URL pattern to all buffers",
        function (args)
        {
            commands.get("doautocmd").action.call(this, args.string);
        },
        {
            argCount: "+",
            completer: function (filter) completion.event(filter)
        }
    );

    // TODO: restrict target to current buffer
    commands.add(["do[autocmd]"],
        "Apply the autocommands matching the specified URL pattern to the current buffer",
        function (args)
        {
            args = args.string;

            let [, event, url] = args.match(/^(\S+)(?:\s+(\S+))?$/);
            url = url || buffer.URL;

            let validEvents = config.autocommands.map(function (e) e[0]);

            if (event == "*")
            {
                liberator.echoerr("E217: Can't execute autocommands for ALL events");
            }
            else if (validEvents.indexOf(event) == -1)
            {
                liberator.echoerr("E216: No such group or event: " + args);
            }
            else
            {
                // TODO: perhaps trigger could return the number of autocmds triggered
                // TODO: Perhaps this should take -args to pass to the command?
                if (!autocommands.get(event).some(function (c) c.pattern.test(url)))
                    liberator.echo("No matching autocommands");
                else
                    autocommands.trigger(event, { url: url });
            }
        },
        {
            // TODO: Vim actually just displays "No matching autocommands" when no arg is specified
            argCount: "+",
            completer: function (filter) completion.event(filter)
        }
    );

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function ()
    {
        completion.setFunctionCompleter(autocommands.get, [function () config.autocommands]);
    });


    return {

        __iterator__: function () util.Array.iterator(store),

        add: function (events, regex, cmd)
        {
            if (typeof events == "string")
            {
                events = events.split(",");
                liberator.log("DEPRECATED: the events list arg to autocommands.add() should be an array of event names");
            }
            events.forEach(function (event)
                store.push({ event: event, pattern: RegExp(regex), command: cmd }));
        },

        get: function (event, regex)
        {
            return store.filter(function (autoCmd) matchAutoCmd(autoCmd, event, regex));
        },

        remove: function (event, regex)
        {
            store = store.filter(function (autoCmd) !matchAutoCmd(autoCmd, event, regex));
        },

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

            var list = template.generic(
                <table>
                    <tr>
                        <td class="hl-Title" colspan="2">----- Auto Commands -----</td>
                    </tr>
                    {
                        template.map(cmds, function ([event, items])
                        <tr>
                            <td class="hl-Title" colspan="2">{event}</td>
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

        trigger: function (event, args)
        {
            if (options.get("eventignore").has("all", event))
                return;

            let autoCmds = store.filter(function (autoCmd) autoCmd.event == event);

            liberator.echomsg("Executing " + event + " Auto commands for \"*\"", 8);

            let lastPattern = null;

            let url = args.url || "";
            for (let [,autoCmd] in Iterator(autoCmds))
            {
                if (autoCmd.pattern.test(url))
                {
                    if (!lastPattern || lastPattern.source != autoCmd.pattern.source)
                        liberator.echomsg("Executing " + event + " Auto commands for \"" + autoCmd.pattern.source + "\"", 8);

                    lastPattern = autoCmd.pattern;

                    liberator.echomsg("autocommand " + autoCmd.command, 9);
                    liberator.execute(commands.replaceTokens(autoCmd.command, args));
                }
            }
        }
    };
    //}}}
}; //}}}

function Events() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const input = liberator.input;

    var fullscreen = window.fullScreen;

    var inputBufferLength = 0; // count the number of keys in v.input.buffer (can be different from v.input.buffer.length)
    var skipMap = false; // while feeding the keys (stored in v.input.buffer | no map found) - ignore mappings

    var macros = storage.newMap('macros', true);

    var currentMacro = "";
    var lastMacro = "";

    try // not every extension has a getBrowser() method
    {
        var tabcontainer = getBrowser().mTabContainer;
        if (tabcontainer) // not every VIM-like extension has a tab container
        {
            tabcontainer.addEventListener("TabMove", function (event)
            {
                statusline.updateTabCount();
            }, false);
            tabcontainer.addEventListener("TabOpen", function (event)
            {
                statusline.updateTabCount();
            }, false);
            tabcontainer.addEventListener("TabClose", function (event)
            {
                statusline.updateTabCount();
            }, false);
            tabcontainer.addEventListener("TabSelect", function (event)
            {
                // TODO: is all of that necessary?
                modes.reset();
                commandline.clear();
                modes.show();
                statusline.updateTabCount();
                tabs.updateSelectionHistory();

                if (options["focuscontent"])
                    setTimeout(function () { liberator.focusContent(true); }, 10); // just make sure, that no widget has focus
            }, false);
        }

        getBrowser().addEventListener("DOMContentLoaded", onDOMContentLoaded, true);

        // this adds an event which is is called on each page load, even if the
        // page is loaded in a background tab
        getBrowser().addEventListener("load", onPageLoad, true);

        // called when the active document is scrolled
        getBrowser().addEventListener("scroll", function (event)
        {
            statusline.updateBufferPosition();
            modes.show();
        }, null);
    }
    catch (e) {}

//    getBrowser().addEventListener("submit", function (event)
//    {
//        // reset buffer loading state as early as possible, important for macros
//        dump("submit\n");
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
        // gContextMenu is set to NULL by Firefox, when a context menu is closed
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

    // window.document.addEventListener("DOMTitleChanged", function (event)
    // {
    //     liberator.log("titlechanged");
    // }, null);

    // NOTE: the order of ["Esc", "Escape"] or ["Escape", "Esc"]
    //       matters, so use that string as the first item, that you
    //       want to refer to within liberator's source code for
    //       comparisons like if (key == "<Esc>") { ... }
    var keyTable = [
        [ KeyEvent.DOM_VK_ESCAPE, ["Esc", "Escape"] ],
        [ KeyEvent.DOM_VK_LEFT_SHIFT, ["<"] ],
        [ KeyEvent.DOM_VK_RIGHT_SHIFT, [">"] ],
        [ KeyEvent.DOM_VK_RETURN, ["Return", "CR", "Enter"] ],
        [ KeyEvent.DOM_VK_TAB, ["Tab"] ],
        [ KeyEvent.DOM_VK_DELETE, ["Del"] ],
        [ KeyEvent.DOM_VK_BACK_SPACE, ["BS"] ],
        [ KeyEvent.DOM_VK_HOME, ["Home"] ],
        [ KeyEvent.DOM_VK_INSERT, ["Insert", "Ins"] ],
        [ KeyEvent.DOM_VK_END, ["End"] ],
        [ KeyEvent.DOM_VK_LEFT, ["Left"] ],
        [ KeyEvent.DOM_VK_RIGHT, ["Right"] ],
        [ KeyEvent.DOM_VK_UP, ["Up"] ],
        [ KeyEvent.DOM_VK_DOWN, ["Down"] ],
        [ KeyEvent.DOM_VK_PAGE_UP, ["PageUp"] ],
        [ KeyEvent.DOM_VK_PAGE_DOWN, ["PageDown"] ],
        [ KeyEvent.DOM_VK_F1, ["F1"] ],
        [ KeyEvent.DOM_VK_F2, ["F2"] ],
        [ KeyEvent.DOM_VK_F3, ["F3"] ],
        [ KeyEvent.DOM_VK_F4, ["F4"] ],
        [ KeyEvent.DOM_VK_F5, ["F5"] ],
        [ KeyEvent.DOM_VK_F6, ["F6"] ],
        [ KeyEvent.DOM_VK_F7, ["F7"] ],
        [ KeyEvent.DOM_VK_F8, ["F8"] ],
        [ KeyEvent.DOM_VK_F9, ["F9"] ],
        [ KeyEvent.DOM_VK_F10, ["F10"] ],
        [ KeyEvent.DOM_VK_F11, ["F11"] ],
        [ KeyEvent.DOM_VK_F12, ["F12"] ],
        [ KeyEvent.DOM_VK_F13, ["F13"] ],
        [ KeyEvent.DOM_VK_F14, ["F14"] ],
        [ KeyEvent.DOM_VK_F15, ["F15"] ],
        [ KeyEvent.DOM_VK_F16, ["F16"] ],
        [ KeyEvent.DOM_VK_F17, ["F17"] ],
        [ KeyEvent.DOM_VK_F18, ["F18"] ],
        [ KeyEvent.DOM_VK_F19, ["F19"] ],
        [ KeyEvent.DOM_VK_F20, ["F20"] ],
        [ KeyEvent.DOM_VK_F21, ["F21"] ],
        [ KeyEvent.DOM_VK_F22, ["F22"] ],
        [ KeyEvent.DOM_VK_F23, ["F23"] ],
        [ KeyEvent.DOM_VK_F24, ["F24"] ]
    ];

    function getKeyCode(str)
    {
        str = str.toLowerCase();

        for (let i = 0; i < keyTable.length; i++)
        {
            for (let j = 0; j < keyTable[i][1].length; j++)
            {
                // we don't store lowercase keys in the keyTable, because we
                // also need to get good looking strings for the reverse action
                if (keyTable[i][1][j].toLowerCase() == str)
                    return keyTable[i][0];
            }
        }

        return 0;
    }

    function isFormElemFocused()
    {
        var elt = window.document.commandDispatcher.focusedElement;
        if (elt == null)
            return false;

        try
        { // sometimes the elt doesn't have .localName
            var tagname = elt.localName.toLowerCase();
            var type = elt.type.toLowerCase();

            if ((tagname == "input" && (type != "image")) ||
                    tagname == "textarea" ||
                    //            tagName == "SELECT" ||
                    //            tagName == "BUTTON" ||
                    tagname == "isindex") // isindex is a deprecated one-line input box
                return true;
        }
        catch (e)
        {
            // FIXME: do nothing?
        }

        return false;
    }

    function triggerLoadAutocmd(name, doc)
    {
        let args = {
            url:   doc.location.href,
            title: doc.title
        };

        if (liberator.has("tabs"))
            args.tab = tabs.getContentIndex(doc) + 1;

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
        if (event.originalTarget instanceof HTMLDocument)
            triggerLoadAutocmd("DOMLoad", event.originalTarget);
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
                // is not triggered there (firefox bug?)
                setTimeout(statusline.updateUrl, 10);
                return;
            }

            // code which should happen for all (also background) newly loaded tabs goes here:

            let url = doc.location.href;
            let title = doc.title;

            // update history
            if (url && liberator.has("history"))
                history.add(url, title);

            // mark the buffer as loaded, we can't use buffer.loaded
            // since that always refers to the current buffer, while doc can be
            // any buffer, even in a background tab
            doc.pageIsFullyLoaded = 1;

            // code which is only relevant if the page load is the current tab goes here:
            if (doc == getBrowser().contentDocument)
            {
                // we want to stay in command mode after a page has loaded
                // TODO: move somehwere else, as focusing can already happen earlier than on "load"
                if (options["focuscontent"])
                {
                    setTimeout(function () {
                        var focused = document.commandDispatcher.focusedElement;
                        if (focused && (focused.value !== undefined) && focused.value.length == 0)
                            focused.blur();
                    }, 100);
                }
            }
            else // background tab
            {
                liberator.echomsg("Background tab loaded: " + title || url, 3);
            }

            triggerLoadAutocmd("PageLoad", doc);
        }
    }

    function wrapListener(method)
    {
        return function (event)
        {
            try
            {
                eventManager[method](event);
            }
            catch (e)
            {
                if (e.message == "Interrupted")
                    liberator.echoerr("Interrupted");
                else
                    liberator.echoerr("Processing " + event.type + " event: " + (e.echoerr || e));
                liberator.dump(e);
                if (Components.utils.reportError)
                    Components.utils.reportError(e);
            }
        };
    }

    // return true when load successful, or false otherwise
    function waitForPageLoaded()
    {
        liberator.dump("start waiting in loaded state: " + buffer.loaded);
        liberator.threadYield(true); // clear queue

        if (buffer.loaded == 1)
            return true;

        var ms = 25000; // maximum time to wait - TODO: add option
        var then = new Date().getTime();
        for (let now = then; now - then < ms; now = new Date().getTime())
        {
            liberator.threadYield();
            if ((now - then) % 1000 < 10)
                liberator.dump("waited: " + (now - then) + " ms");

            if (!events.feedingKeys)
                return false;

            if (buffer.loaded > 0)
            {
                liberator.sleep(250);
                break;
            }
            else
                liberator.echo("Waiting for page to load...");
        }
        modes.show();

        // TODO: allow macros to be continued when page does not fully load with an option
        var ret = (buffer.loaded == 1);
        if (!ret)
            liberator.echoerr("Page did not load completely in " + ms + " milliseconds. Macro stopped.");
        liberator.dump("done waiting: " + ret);

        // sometimes the input widget had focus when replaying a macro
        // maybe this call should be moved somewhere else?
        // liberator.focusContent(true);

        return ret;
    }

    // load all macros inside ~/.vimperator/macros/
    // setTimeout needed since io. is loaded after events.
    setTimeout (function () {
        // FIXME: largely duplicated for loading plugins
        try
        {
            let dirs = io.getRuntimeDirectories("macros");

            if (dirs.length > 0)
            {
                for (let [,dir] in Iterator(dirs))
                {
                    liberator.echomsg("Searching for \"macros/*\" in \"" + dir.path + "\"", 2);

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
            {
                liberator.log("No user macros directory found", 3);
            }
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

    mappings.add(modes.all,
        ["<Esc>", "<C-[>"], "Focus content",
        function () { events.onEscape(); });

    // add the ":" mapping in all but insert mode mappings
    mappings.add([modes.NORMAL, modes.VISUAL, modes.HINTS, modes.MESSAGE, modes.COMPOSE, modes.CARET, modes.TEXTAREA],
        [":"], "Enter command line mode",
        function () { commandline.open(":", "", modes.EX); });

    // focus events
    mappings.add([modes.NORMAL, modes.VISUAL, modes.CARET],
        ["<Tab>"], "Advance keyboard focus",
        function () { document.commandDispatcher.advanceFocus(); });

    mappings.add([modes.NORMAL, modes.VISUAL, modes.CARET, modes.INSERT, modes.TEXTAREA],
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
    mappings.add([modes.NORMAL, modes.MESSAGE],
        ["q"], "Record a key sequence into a macro",
        function (arg) { events.startRecording(arg); },
        { flags: Mappings.flags.ARGUMENT });

    mappings.add([modes.NORMAL, modes.MESSAGE],
        ["@"], "Play a macro",
        function (count, arg)
        {
            if (count < 1) count = 1;
            while (count-- && events.playMacro(arg))
                ;
        },
        { flags: Mappings.flags.ARGUMENT | Mappings.flags.COUNT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["delmac[ros]"],
        "Delete macros",
        function (args, special)
        {
            args = args.string;

            if (special)
                args = ".*"; // XXX

            events.deleteMacros(args);
        },
        {
            bang: true,
            completer: function (filter) completion.macro(filter)
        });

    commands.add(["macros"],
        "List all macros",
        function (args)
        {
            XML.prettyPrinting = false;
            var str = template.tabular(["Macro", "Keys"], [], events.getMacros(args.string));
            liberator.echo(str, commandline.FORCE_MULTILINE);
        },
        { completer: function (filter) completion.macro(filter) });

    commands.add(["pl[ay]"],
        "Replay a recorded macro",
        function (args) { events.playMacro(args.arguments[0]); },
        {
            argCount: "1",
            completer: function (filter) completion.macro(filter)
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var eventManager = {

        feedingKeys: false,

        wantsModeReset: true, // used in onFocusChange since Firefox is so buggy here

        destroy: function ()
        {
            // removeEventListeners() to avoid mem leaks
            liberator.dump("TODO: remove all eventlisteners");

            if (typeof getBrowser != "undefined")
                getBrowser().removeProgressListener(this.progressListener);

            window.removeEventListener("popupshown", enterPopupMode, true);
            window.removeEventListener("popuphidden", exitPopupMode, true);
            window.removeEventListener("DOMMenuBarActive", enterMenuMode, true);
            window.removeEventListener("DOMMenuBarInactive", exitMenuMode, true);

            window.removeEventListener("keypress", this.onKeyPress, true);
            window.removeEventListener("keydown", this.onKeyDown, true);
        },

        startRecording: function (macro)
        {
            if (!/[a-zA-Z0-9]/.test(macro))
            {
                // TODO: ignore this like Vim?
                liberator.echoerr("E354: Invalid register name: '" + macro + "'");
                return;
            }

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

        playMacro: function (macro)
        {
            var res = false;
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
                    getWebNavigation().stop(nsIWebNavigation.STOP_ALL);
                }
                catch (e) {}

                buffer.loaded = 1; // even if not a full page load, assume it did load correctly before starting the macro
                modes.isReplaying = true;
                res = events.feedkeys(macros.get(lastMacro), true); // true -> noremap
                modes.isReplaying = false;
            }
            else
            {
                if (lastMacro.length == 1)
                    // TODO: ignore this like Vim?
                    liberator.echoerr("Exxx: Register " + lastMacro + " not set");
                else
                    liberator.echoerr("Exxx: Named macro '" + lastMacro + "' not set");
            }
            return res;
        },

        getMacros: function (filter)
        {
            if (!filter)
                return macros;

            var re = new RegExp(filter);
            return ([macro, keys] for ([macro, keys] in macros) if (re.test(macro)));
        },

        deleteMacros: function (filter)
        {
            var re = new RegExp(filter);

            for (let [item,] in macros)
            {
                if (re.test(item))
                    macros.remove(item);
            }
        },

        // This method pushes keys into the event queue from liberator
        // it is similar to vim's feedkeys() method, but cannot cope with
        // 2 partially feeded strings, you have to feed one parsable string
        //
        // @param keys: a string like "2<C-f>" to pass
        //              if you want < to be taken literally, prepend it with a \\
        feedkeys: function (keys, noremap, silent)
        {
            var doc = window.document;
            var view = window.document.defaultView;
            var escapeKey = false; // \ to escape some special keys

            var wasFeeding = this.feedingKeys;
            this.feedingKeys = true;
            var wasSilent = commandline.silent;
            if (silent)
                commandline.silent = silent;

            try
            {
                noremap = !!noremap;

                for (var i = 0; i < keys.length; i++)
                {
                    var charCode = keys.charCodeAt(i);
                    var keyCode = 0;
                    var shift = false, ctrl = false, alt = false, meta = false;

                    //if (charCode == 92) // the '\' key FIXME: support the escape key
                    if (charCode == 60 && !escapeKey) // the '<' key starts a complex key
                    {
                        var matches = keys.substr(i + 1).match(/([CSMAcsma]-)*([^>]+)/);
                        if (matches && matches[2])
                        {
                            if (matches[1]) // check for modifiers
                            {
                                ctrl  = /[cC]-/.test(matches[1]);
                                alt   = /[aA]-/.test(matches[1]);
                                shift = /[sS]-/.test(matches[1]);
                                meta  = /[mM]-/.test(matches[1]);
                            }
                            if (matches[2].length == 1)
                            {
                                if (!ctrl && !alt && !shift && !meta)
                                    return false; // an invalid key like <a>
                                charCode = matches[2].charCodeAt(0);
                            }
                            else if (matches[2].toLowerCase() == "space")
                            {
                                charCode = 32;
                            }
                            else if (keyCode = getKeyCode(matches[2]))
                            {
                                charCode = 0;
                            }
                            else // an invalid key like <A-xxx> was found, stop propagation here (like Vim)
                            {
                                break;
                            }

                            i += matches[0].length + 1;
                        }
                    }
                    else // a simple key
                    {
                        // FIXME: does not work for non A-Z keys like Ö,Ä,...
                        shift = (keys[i] >= "A" && keys[i] <= "Z");
                    }

                    var elem = window.document.commandDispatcher.focusedElement;
                    if (!elem)
                        elem = window.content;

                    var evt = doc.createEvent("KeyEvents");
                    evt.initKeyEvent("keypress", true, true, view, ctrl, alt, shift, meta, keyCode, charCode);
                    evt.noremap = noremap;
                    evt.isMacro = true;
                    elem.dispatchEvent(evt);
                    if (!this.feedingKeys)
                        break;
                    // stop feeding keys if page loading failed
                    if (modes.isReplaying && !waitForPageLoaded())
                        break;
                    // else // a short break between keys often helps
                    //     liberator.sleep(50);
                }
            }
            finally
            {
                this.feedingKeys = wasFeeding;
                if (silent)
                    commandline.silent = wasSilent;
            }
            return i == keys.length;
        },

        // this function converts the given event to
        // a keycode which can be used in mappings
        // e.g. pressing ctrl+n would result in the string "<C-n>"
        // null if unknown key
        toString: function (event)
        {
            if (!event)
                return;

            var key = null;
            var modifier = "";

            if (event.ctrlKey)
                modifier += "C-";
            if (event.altKey)
                modifier += "A-";
            if (event.metaKey)
                modifier += "M-";

            if (event.type == "keypress")
            {
                if (event.charCode == 0)
                {
                    if (event.shiftKey)
                        modifier += "S-";

                    for (let i = 0; i < keyTable.length; i++)
                    {
                        if (keyTable[i][0] == event.keyCode)
                        {
                            key = keyTable[i][1][0];
                            break;
                        }
                    }
                }
                // special handling of the Space key
                else if (event.charCode == 32)
                {
                    if (event.shiftKey)
                        modifier += "S-";
                    key = "Space";
                }
                // a normal key like a, b, c, 0, etc.
                else if (event.charCode > 0)
                {
                    key = String.fromCharCode(event.charCode);
                    if (modifier.length == 0)
                        return key;
                }
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

            // a key like F1 is always enclosed in < and >
            return "<" + modifier + key + ">";
        },

        isAcceptKey: function (key)
        {
            return (key == "<Return>" || key == "<C-j>" || key == "<C-m>");
        },

        isCancelKey: function (key)
        {
            return (key == "<Esc>" || key == "<C-[>" || key == "<C-c>");
        },

        // argument "event" is delibarately not used, as i don't seem to have
        // access to the real focus target
        //
        // the ugly wantsModeReset is needed, because firefox generates a massive
        // amount of focus changes for things like <C-v><C-k> (focusing the search field)
        onFocusChange: function (event)
        {
            // command line has it's own focus change handler
            if (liberator.mode == modes.COMMAND_LINE)
                return;

            function hasHTMLDocument(win) win && win.document && win.document instanceof HTMLDocument

            var win  = window.document.commandDispatcher.focusedWindow;
            var elem = window.document.commandDispatcher.focusedElement;

            if (elem && elem.readOnly)
                return;

            //liberator.log("onFocusChange: " + elem);
            //liberator.dump("=+++++++++=\n" + util.objectToString(event.target) + "\n")
            //liberator.dump (elem + ": " + win + "\n");//" - target: " + event.target + " - origtarget: " + event.originalTarget + " - expltarget: " + event.explicitOriginalTarget + "\n");

            if (elem && (
                   (elem instanceof HTMLInputElement && (elem.type.toLowerCase() == "text" || elem.type.toLowerCase() == "password")) ||
                   (elem instanceof HTMLSelectElement)
                ))
            {
                this.wantsModeReset = false;
                liberator.mode = modes.INSERT;
                if (hasHTMLDocument(win))
                    buffer.lastInputField = elem;
                return;
            }

            if (elem && elem instanceof HTMLTextAreaElement)
            {
                this.wantsModeReset = false;
                if (options["insertmode"])
                    modes.set(modes.INSERT, modes.TEXTAREA);
                else if (elem.selectionEnd - elem.selectionStart > 0)
                    modes.set(modes.VISUAL, modes.TEXTAREA);
                else
                    modes.main = modes.TEXTAREA;
                if (hasHTMLDocument(win))
                    buffer.lastInputField = elem;
                return;
            }

            if (config.name == "Muttator")
            {
                // we switch to -- MESSAGE -- mode for muttator, when the main HTML widget gets focus
                if (hasHTMLDocument(win) || elem instanceof HTMLAnchorElement)
                {
                    if (config.isComposeWindow)
                    {
                        liberator.dump("Compose editor got focus");
                        modes.set(modes.INSERT, modes.TEXTAREA);
                    }
                    else if (liberator.mode != modes.MESSAGE)
                        liberator.mode = modes.MESSAGE;
                    return;
                }
            }

            if (liberator.mode == modes.INSERT ||
                liberator.mode == modes.TEXTAREA ||
                liberator.mode == modes.MESSAGE ||
                liberator.mode == modes.VISUAL)
            {
               // FIXME: currently this hack is disabled to make macros work
               // this.wantsModeReset = true;
               // setTimeout(function () {
               //     liberator.dump("cur: " + liberator.mode + "\n");
               //     if (events.wantsModeReset)
               //     {
               //         events.wantsModeReset = false;
                        modes.reset();
               //     }
               // }, 0);
            }
        },

        onSelectionChange: function (event)
        {
            var couldCopy = false;
            var controller = document.commandDispatcher.getControllerForCommand("cmd_copy");
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

        // global escape handler, is called in ALL modes
        onEscape: function ()
        {
            if (!modes.passNextKey)
            {
                if (modes.passAllKeys)
                {
                    modes.passAllKeys = false;
                    return;
                }

                switch (liberator.mode)
                {
                    case modes.NORMAL:
                        // clear any selection made
                        var selection = window.content.getSelection();
                        try
                        { // a simple if (selection) does not seem to work
                            selection.collapseToStart();
                        }
                        catch (e) {}
                        commandline.clear();

                        modes.reset();
                        liberator.focusContent(true);
                        break;

                    case modes.VISUAL:
                        if (modes.extended & modes.TEXTAREA)
                            liberator.mode = modes.TEXTAREA;
                        else if (modes.extended & modes.CARET)
                            liberator.mode = modes.CARET;
                        break;

                    case modes.CARET:
                        // setting this option will trigger an observer which will
                        // care about all other details like setting the NORMAL mode
                        options.setPref("accessibility.browsewithcaret", false);
                        break;

                    case modes.INSERT:
                        if ((modes.extended & modes.TEXTAREA) && !options["insertmode"])
                        {
                            liberator.mode = modes.TEXTAREA;
                        }
                        else
                        {
                            modes.reset();
                            liberator.focusContent(true);
                        }
                        break;

                    default: // HINTS, CUSTOM or COMMAND_LINE
                        modes.reset();
                        break;
                }
            }
        },

        // this keypress handler gets always called first, even if e.g.
        // the commandline has focus
        onKeyPress: function (event)
        {
            var key = events.toString(event);
            if (!key)
                 return true;

            //liberator.log(key + " in mode: " + liberator.mode);
            //liberator.dump(key + " in mode: " + liberator.mode + "\n");

            if (modes.isRecording)
            {
                if (key == "q") // TODO: should not be hardcoded
                {
                    modes.isRecording = false;
                    liberator.log("Recorded " + currentMacro + ": " + macros.get(currentMacro), 9);
                    liberator.echo("Recorded macro '" + currentMacro + "'");
                    event.preventDefault();
                    event.stopPropagation();
                    return true;
                }
                else if (!mappings.hasMap(liberator.mode, input.buffer + key))
                {
                    macros.set(currentMacro, macros.get(currentMacro) + key);
                }
            }

            if (key == "<C-c>")
                liberator.interrupted = true;

            // feedingKeys needs to be separate from interrupted so
            // we can differentiate between a recorded <C-c>
            // interrupting whatever it's started and a real <C-c>
            // interrupting our playback.
            if (events.feedingKeys)
            {
                if (key == "<C-c>" && !event.isMacro)
                {
                    events.feedingKeys = false;
                    setTimeout(function () { liberator.echo("Canceled playback of macro '" + lastMacro + "'") }, 100);
                    event.preventDefault();
                    event.stopPropagation();
                    return true;
                }
            }

            var stop = true; // set to false if we should NOT consume this event but let Firefox handle it

            var win = document.commandDispatcher.focusedWindow;
            if (win && win.document.designMode == "on" && !config.isComposeWindow)
                return false;

            // menus have their own command handlers
            if (modes.extended & modes.MENU)
                return false;

            // handle Escape-one-key mode (Ctrl-v)
            if (modes.passNextKey && !modes.passAllKeys)
            {
                modes.passNextKey = false;
                return false;
            }
            // handle Escape-all-keys mode (Ctrl-q)
            if (modes.passAllKeys)
            {
                if (modes.passNextKey)
                    modes.passNextKey = false; // and then let flow continue
                else if (key == "<Esc>" || key == "<C-[>" || key == "<C-v>")
                    ; // let flow continue to handle these keys to cancel escape-all-keys mode
                else
                    return false;
            }

            // just forward event without checking any mappings when the MOW is open
            if (liberator.mode == modes.COMMAND_LINE &&
                (modes.extended & modes.OUTPUT_MULTILINE))
            {
                commandline.onMultilineOutputEvent(event);
                event.preventDefault();
                event.stopPropagation();
                return false;
            }

            // XXX: ugly hack for now pass certain keys to firefox as they are without beeping
            // also fixes key navigation in combo boxes, submitting forms, etc.
            // FIXME: breaks iabbr for now --mst
            if ((config.name == "Vimperator" && liberator.mode == modes.NORMAL)
                 || liberator.mode == modes.INSERT)
            {
                if (key == "<Return>")
                    return false;
                else if (key == "<Space>" || key == "<Up>" || key == "<Down>")
                    return false;
            }

        //  // FIXME: handle middle click in content area {{{
        //  //     alert(event.target.id);
        //  if (/*event.type == 'mousedown' && */event.button == 1 && event.target.id == 'content')
        //  {
        //      //echo("foo " + event.target.id);
        //      //if (document.commandDispatcher.focusedElement == command_line.inputField)
        //      {
        //      //alert(command_line.value.substring(0, command_line.selectionStart));
        //          command_line.value = command_line.value.substring(0, command_line.selectionStart) +
        //                               readFromClipboard() +
        //                               command_line.value.substring(command_line.selectionEnd, command_line.value.length);
        //         alert(command_line.value);
        //      }
        //      //else
        // //       {
        // //           openURLs(readFromClipboard());
        // //       }
        //      return true;
        //  } }}}

            if (key != "<Esc>" && key != "<C-[>")
            {
                // custom mode...
                if (liberator.mode == modes.CUSTOM)
                {
                    plugins.onEvent(event);
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }

                if (modes.extended & modes.HINTS)
                {
  	                // under HINT mode, certain keys are redirected to hints.onEvent
                	if (key == "<Return>" || key == "<Tab>" || key == "<S-Tab>"
                		|| key == mappings.getMapLeader()
                		|| (key == "<BS>" && hints.previnput == "number")
                		|| (/^[0-9]$/.test(key) && !hints.escNumbers))
                	{
                		hints.onEvent(event);
                		event.preventDefault();
                		event.stopPropagation();
                		return false;
                	}

                	// others are left to generate the 'input' event or handled by firefox
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
                return true;

            var countStr = input.buffer.match(/^[0-9]*/)[0];
            var candidateCommand = (input.buffer + key).replace(countStr, "");
            var map;
            if (event.noremap)
                map = mappings.getDefault(liberator.mode, candidateCommand);
            else
                map = mappings.get(liberator.mode, candidateCommand);

            // counts must be at the start of a complete mapping (10j -> go 10 lines down)
            if (/^[1-9][0-9]*$/.test(input.buffer + key))
            {
                // no count for insert mode mappings
                if (liberator.mode == modes.INSERT || liberator.mode == modes.COMMAND_LINE)
                    stop = false;
                else
                {
                    input.buffer += key;
                    inputBufferLength++;
                }
            }
            else if (input.pendingArgMap)
            {
                input.buffer = "";
                inputBufferLength = 0;
                var tmp = input.pendingArgMap; // must be set to null before .execute; if not
                input.pendingArgMap = null;    // v.input.pendingArgMap is still 'true' also for new feeded keys
                if (key != "<Esc>" && key != "<C-[>")
                {
                    if (modes.isReplaying && !waitForPageLoaded())
                        return true;

                    tmp.execute(null, input.count, key);
                }
            }
            // only follow a map if there isn't a longer possible mapping
            // (allows you to do :map z yy, when zz is a longer mapping than z)
            // TODO: map.rhs is only defined for user defined commands, should add a "isDefault" property
            else if (map && !skipMap && (map.rhs ||
                     mappings.getCandidates(liberator.mode, candidateCommand).length == 0))
            {
                input.count = parseInt(countStr, 10);
                if (isNaN(input.count))
                    input.count = -1;
                if (map.flags & Mappings.flags.ARGUMENT)
                {
                    input.pendingArgMap = map;
                    input.buffer += key;
                    inputBufferLength++;
                }
                else if (input.pendingMotionMap)
                {
                    if (key != "<Esc>" && key != "<C-[>")
                    {
                        input.pendingMotionMap.execute(candidateCommand, input.count, null);
                    }
                    input.pendingMotionMap = null;
                    input.buffer = "";
                    inputBufferLength = 0;
                }
                // no count support for these commands yet
                else if (map.flags & Mappings.flags.MOTION)
                {
                    input.pendingMotionMap = map;
                    input.buffer = "";
                    inputBufferLength = 0;
                }
                else
                {
                    input.buffer = "";
                    inputBufferLength = 0;

                    if (modes.isReplaying && !waitForPageLoaded())
                        return true;

                    var ret = map.execute(null, input.count);
                    if (map.flags & Mappings.flags.ALLOW_EVENT_ROUTING && ret)
                        stop = false;
                }
            }
            else if (mappings.getCandidates(liberator.mode, candidateCommand).length > 0 && !skipMap)
            {
                input.buffer += key;
                inputBufferLength++;
            }
            else // if the key is neither a mapping nor the start of one
            {
                // the mode checking is necessary so that things like g<esc> do not beep
                if (input.buffer != "" && !skipMap && (liberator.mode == modes.INSERT ||
                    liberator.mode == modes.COMMAND_LINE || liberator.mode == modes.TEXTAREA))
                {
                    // no map found -> refeed stuff in v.input.buffer (only while in INSERT, CO... modes)
                    skipMap = true; // ignore maps while doing so
                    events.feedkeys(input.buffer, true);
                }
                if (skipMap)
                {
                    if (--inputBufferLength == 0) // inputBufferLength == 0. v.input.buffer refeeded...
                        skipMap = false; // done...
                }

                input.buffer = "";
                input.pendingArgMap = null;
                input.pendingMotionMap = null;

                if (key != "<Esc>" && key != "<C-[>")
                {
                    // allow key to be passed to firefox if we can't handle it
                    stop = false;

                    if (liberator.mode == modes.COMMAND_LINE)
                    {
                        if (!(modes.extended & modes.INPUT_MULTILINE))
                            commandline.onEvent(event); // reroute event in command line mode
                    }
                    else if (liberator.mode != modes.INSERT && liberator.mode != modes.TEXTAREA)
                    {
                        liberator.beep();
                    }
                }
            }

            if (stop)
            {
                event.preventDefault();
                event.stopPropagation();
            }

            var motionMap = (input.pendingMotionMap && input.pendingMotionMap.names[0]) || "";
            statusline.updateInputBuffer(motionMap + input.buffer);
            return false;
        },

        // this is need for sites like msn.com which focus the input field on keydown
        onKeyUpOrDown: function (event)
        {
            if (modes.passNextKey ^ modes.passAllKeys || isFormElemFocused())
                return true;

            event.stopPropagation();
            return false;
        },

        // TODO: move to buffer.js?
        progressListener: {
            QueryInterface: function (aIID)
            {
                if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
                        aIID.equals(Components.interfaces.nsIXULBrowserWindow) || // for setOverLink();
                        aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
                        aIID.equals(Components.interfaces.nsISupports))
                    return this;
                throw Components.results.NS_NOINTERFACE;
            },

            // XXX: function may later be needed to detect a canceled synchronous openURL()
            onStateChange: function (webProgress, request, flags, status)
            {
                // STATE_IS_DOCUMENT | STATE_IS_WINDOW is important, because we also
                // receive statechange events for loading images and other parts of the web page
                if (flags & (Components.interfaces.nsIWebProgressListener.STATE_IS_DOCUMENT |
                            Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW))
                {
                    // This fires when the load event is initiated
                    // only thrown for the current tab, not when another tab changes
                    if (flags & Components.interfaces.nsIWebProgressListener.STATE_START)
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
                    else if (flags & Components.interfaces.nsIWebProgressListener.STATE_STOP)
                    {
                        buffer.loaded = (status == 0 ? 1 : 2);
                        statusline.updateUrl();
                    }
                }
            },
            // for notifying the user about secure web pages
            onSecurityChange: function (webProgress, aRequest, aState)
            {
                const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
                if (aState & nsIWebProgressListener.STATE_IS_INSECURE)
                    statusline.setClass("insecure");
                else if (aState & nsIWebProgressListener.STATE_IS_BROKEN)
                    statusline.setClass("broken");
                else if (aState & nsIWebProgressListener.STATE_IS_SECURE)
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
                setTimeout(function () { statusline.updateBufferPosition(); }, 100);
            },
            // called at the very end of a page load
            asyncUpdateUI: function ()
            {
                setTimeout(statusline.updateUrl, 100);
            },
            setOverLink : function (link, b)
            {
                var ssli = options["showstatuslinks"];
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

            // stub functions for the interfaces
            setJSStatus: function (status) { ; },
            setJSDefaultStatus: function (status) { ; },
            setDefaultStatus: function (status) { ; },
            onLinkIconAvailable: function () { ; }
        },

        // TODO: move to options.js?
        prefObserver: {
            register: function ()
            {
                var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                            .getService(Components.interfaces.nsIPrefService);
                this._branch = prefService.getBranch(""); // better way to monitor all changes?
                this._branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
                this._branch.addObserver("", this, false);
            },

            unregister: function ()
            {
                if (this._branch)
                    this._branch.removeObserver("", this);
            },

            observe: function (aSubject, aTopic, aData)
            {
                if (aTopic != "nsPref:changed")
                    return;

                // aSubject is the nsIPrefBranch we're observing (after appropriate QI)
                // aData is the name of the pref that's been changed (relative to aSubject)
                switch (aData)
                {
                    case "accessibility.browsewithcaret":
                        var value = options.getPref("accessibility.browsewithcaret", false);
                        liberator.mode = value ? modes.CARET : modes.NORMAL;
                        break;
                }
             }
        }
    }; //}}}

    window.XULBrowserWindow = eventManager.progressListener;
    window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIWebNavigation)
        .QueryInterface(Components.interfaces.nsIDocShellTreeItem).treeOwner
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIXULWindow)
        .XULBrowserWindow = window.XULBrowserWindow;
    try
    {
        getBrowser().addProgressListener(eventManager.progressListener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);
    }
    catch (e) {}

    eventManager.prefObserver.register();
    liberator.registerObserver("shutdown", function () {
            eventManager.destroy();
            eventManager.prefObserver.unregister();
    });

    window.addEventListener("keypress", wrapListener("onKeyPress"),    true);
    window.addEventListener("keydown",  wrapListener("onKeyUpOrDown"), true);
    window.addEventListener("keyup",    wrapListener("onKeyUpOrDown"), true);

    return eventManager;

}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
