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

liberator.AutoCommands = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var autoCommands = {};

    function autoCommandsIterator()
    {
        for (let item in autoCommands)
            for (let i = 0; i < autoCommands[item].length; i++)
                yield item + " " + autoCommands[item][i][0] + " " + autoCommands[item][i][1];
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.options.add(["eventignore", "ei"],
        "List of autocommand event names which should be ignored",
        "stringlist", "");

    liberator.options.add(["focuscontent", "fc"],
        "Try to stay in normal mode after loading a web page",
        "boolean", false);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["au[tocmd]"],
        "Execute commands automatically on events",
        function (args, special)
        {
            if (!args)
            {
                if (special) // :au!
                    liberator.autocommands.remove(null, null);
                else // :au
                    liberator.autocommands.list(null, null);
            }
            else
            {
                // (?:  ) means don't store; (....)? <-> exclamation marks makes the group optional
                var [all, asterix, auEvent, regex, cmds] = args.match(/^(\*)?(?:\s+)?(\S+)(?:\s+)?(\S+)?(?:\s+)?(.+)?$/);

                if (cmds)
                {
                    liberator.autocommands.add(auEvent, regex, cmds);
                }
                else if (regex) // e.g. no cmds provided
                {
                    if (special)
                        liberator.autocommands.remove(auEvent, regex);
                    else
                        liberator.autocommands.list(auEvent, regex);
                }
                else if (auEvent)
                {
                    if (asterix)
                        if (special)
                            liberator.autocommands.remove(null, auEvent); // ':au! * auEvent'
                        else
                            liberator.autocommands.list(null, auEvent);
                    else
                        if (special)
                            liberator.autocommands.remove(auEvent, null);
                        else
                            liberator.autocommands.list(auEvent, null);
                }
            }
        },
        {
            completer: function (filter)
            {
                return [0, liberator.completion.filter(liberator.config.autocommands || [], filter)];
            }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    //TODO: maybe this.function rather than v.autocommands.function...

    return {

        __iterator__: function ()
        {
            return autoCommandsIterator();
        },

        add: function (auEvent, regex, cmds)
        {
            var eventsIter = auEvent.split(",");
            for (let i = 0; i < eventsIter.length; i++)
            {
                if (!autoCommands[eventsIter[i]])
                    autoCommands[eventsIter[i]] = [];

                var flag = true;
                for (let j = 0; j < autoCommands[eventsIter[i]].length; j++)
                {
                    if (autoCommands[eventsIter[i]][j][0] == regex && autoCommands[eventsIter[i]][j][1] == cmds)
                    {
                        flag = false;
                        break;
                    }
                }
                if (flag)
                    autoCommands[eventsIter[i]].push([regex, cmds, new RegExp(regex)]);
            }
        },

        remove: function (auEvent, regex) // arguments are filters (NULL = all)
        {
            if (!auEvent && !regex)
            {
                autoCommands = {}; // delete all
            }
            else if (!regex) // remove all on this auEvent
            {
                for (let item in autoCommands)
                {
                    if (item == auEvent)
                        delete autoCommands[item];
                }
            }
            else if (!auEvent) // delete all matches to this regex
            {
                for (let item in autoCommands)
                {
                    var i = 0;
                    while (i < autoCommands[item].length)
                    {
                        if (regex == autoCommands[item][i][0])
                        {
                            autoCommands[item].splice(i, 1); // remove array
                            // keep `i' since this is removed, so a possible next one is at this place now
                        }
                        else
                            i++;
                    }
                }
            }
            else // delete matching `auEvent && regex' items
            {
                for (let item in autoCommands)
                {
                    if (item == auEvent)
                    {
                        for (let i = 0; i < autoCommands[item].length; i++)
                        {
                            if (regex == autoCommands[item][i][0])
                                autoCommands[item].splice(i, 1); // remove array
                        }
                    }
                }
            }
        },

        list: function (auEvent, regex) // arguments are filters (NULL = all)
        {
            var flag;
            var list = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                "<table><tr><td class=\"hl-Title\" colspan=\"2\">---- Auto-Commands ----</td></tr>";

            for (let item in autoCommands)
            {
                flag = true;
                if (!auEvent || item == auEvent) // filter event
                {
                    for (let i = 0; i < autoCommands[item].length; i++)
                    {
                        if (!regex || regex == autoCommands[item][i][0]) // filter regex
                        {
                            if (flag == true)
                            {
                                list += "<tr><td class=\"hl-Title\" colspan=\"2\">" +
                                        liberator.util.escapeHTML(item) + "</td></tr>";
                                flag = false;
                            }

                            list += "<tr>";
                            list += "<td> &nbsp; " + liberator.util.escapeHTML(autoCommands[item][i][0]) + "</td>";
                            list += "<td>" + liberator.util.escapeHTML(autoCommands[item][i][1]) + "</td>";
                            list += "</tr>";
                        }
                    }
                }
            }

            list += "</table>";
            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        },

        trigger: function (auEvent, url)
        {
            if (liberator.options["eventignore"].split(",").some(function (event) {
                    return event == "all" || event == auEvent;
                }))
            {
                return;
            }

            if (autoCommands[auEvent])
            {
                for (let i = 0; i < autoCommands[auEvent].length; i++)
                {
                    if (autoCommands[auEvent][i][2].test(url))
                        liberator.execute(autoCommands[auEvent][i][1]);
                }
            }
        }
    };
    //}}}
}; //}}}

liberator.Events = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var inputBufferLength = 0; // count the number of keys in v.input.buffer (can be different from v.input.buffer.length)
    var skipMap = false; // while feeding the keys (stored in v.input.buffer | no map found) - ignore mappings

    var macros = liberator.storage.newMap('macros', true);

    var currentMacro = "";
    var lastMacro = "";

    try // not every extension has a getBrowser() method
    {
        var tabcontainer = getBrowser().mTabContainer;
        if (tabcontainer) // not every VIM-like extension has a tab container
        {
            tabcontainer.addEventListener("TabMove", function (event)
            {
                liberator.statusline.updateTabCount();
            }, false);
            tabcontainer.addEventListener("TabOpen", function (event)
            {
                liberator.statusline.updateTabCount();
            }, false);
            tabcontainer.addEventListener("TabClose", function (event)
            {
                liberator.statusline.updateTabCount();
            }, false);
            tabcontainer.addEventListener("TabSelect", function (event)
            {
                // TODO: is all of that necessary?
                liberator.modes.reset();
                liberator.commandline.clear();
                liberator.modes.show();
                liberator.statusline.updateTabCount();
                liberator.tabs.updateSelectionHistory();

                if (liberator.options["focuscontent"])
                    setTimeout(function () { liberator.focusContent(true); }, 10); // just make sure, that no widget has focus
            }, false);
        }

        // this adds an event which is is called on each page load, even if the
        // page is loaded in a background tab
        getBrowser().addEventListener("load", onPageLoad, true);

        // called when the active document is scrolled
        getBrowser().addEventListener("scroll", function (event)
        {
            liberator.statusline.updateBufferPosition();
            liberator.modes.show();
        }, null);
    }
    catch (e) {}

//    getBrowser().addEventListener("submit", function (event)
//    {
//        // reset buffer loading state as early as possible, important for macros
//        dump("submit\n");
//        liberator.buffer.loaded = 0;
//    }, null);

    /////////////////////////////////////////////////////////
    // track if a popup is open or the menubar is active
    var activeMenubar = false;
    function enterPopupMode(event)
    {
        if (event.originalTarget.localName == "tooltip" || event.originalTarget.id == "liberator-visualbell")
            return;

        liberator.modes.add(liberator.modes.MENU);
    }
    function exitPopupMode()
    {
        // gContextMenu is set to NULL by Firefox, when a context menu is closed
        if (typeof gContextMenu != "undefined" && gContextMenu == null && !activeMenubar)
            liberator.modes.remove(liberator.modes.MENU);
    }
    function enterMenuMode()
    {
        activeMenubar = true;
        liberator.modes.add(liberator.modes.MENU);
    }
    function exitMenuMode()
    {
        activeMenubar = false;
        liberator.modes.remove(liberator.modes.MENU);
    }
    window.addEventListener("popupshown", enterPopupMode, true);
    window.addEventListener("popuphidden", exitPopupMode, true);
    window.addEventListener("DOMMenuBarActive", enterMenuMode, true);
    window.addEventListener("DOMMenuBarInactive", exitMenuMode, true);

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

    function onPageLoad(event)
    {
        if (event.originalTarget instanceof HTMLDocument)
        {
            var doc = event.originalTarget;
            // document is part of a frameset
            if (doc.defaultView.frameElement)
            {
                // hacky way to get rid of "Transfering data from ..." on sites with frames
                // when you click on a link inside a frameset, because asyncUpdateUI
                // is not triggered there (firefox bug?)
                setTimeout(liberator.statusline.updateUrl, 10);
                return;
            }

            // code which should happen for all (also background) newly loaded tabs goes here:

            var url = doc.location.href;
            var title = doc.title;

            // update history
            if (url && liberator.history)
                liberator.history.add(url, title);

            liberator.autocommands.trigger("PageLoad", url);

            // mark the buffer as loaded, we can't use liberator.buffer.loaded
            // since that always refers to the current buffer, while doc can be
            // any buffer, even in a background tab
            doc.pageIsFullyLoaded = 1;

            // code which is only relevant if the page load is the current tab goes here:
            if (doc == getBrowser().contentDocument)
            {
                // we want to stay in command mode after a page has loaded
                // TODO: move somehwere else, as focusing can already happen earlier than on "load"
                if (liberator.options["focuscontent"])
                {
                    setTimeout(function () {
                        var focused = document.commandDispatcher.focusedElement;
                        if (focused && (typeof focused.value != "undefined") && focused.value.length == 0)
                            focused.blur();
                    }, 100);
                }
            }
            else // background tab
            {
                liberator.commandline.echo("Background tab loaded: " + title || url, liberator.commandline.HL_INFOMSG);
            }
        }
    }

    // return true when load successful, or false otherwise
    function waitForPageLoaded()
    {
        liberator.dump("start waiting in loaded state: " + liberator.buffer.loaded + "\n");
        var mainThread = Components.classes["@mozilla.org/thread-manager;1"]
                                   .getService(Components.interfaces.nsIThreadManager).mainThread;
        while (mainThread.hasPendingEvents()) // clear queue
            mainThread.processNextEvent(true);

        if (liberator.buffer.loaded == 1)
            return true;

        var ms = 25000; // maximum time to wait - TODO: add option
        var then = new Date().getTime();
        for (let now = then; now - then < ms; now = new Date().getTime())
        {
            mainThread.processNextEvent(true);
            if ((now - then) % 1000 < 10)
                liberator.dump("waited: " + (now - then) + " ms\n");

            if (!liberator.modes.isReplaying)
                return false;

            if (liberator.buffer.loaded > 0)
            {
                liberator.sleep(250);
                break;
            }
            else
                liberator.echo("Waiting for page to load...");
        }
        liberator.modes.show();

        // TODO: allow macros to be continued when page does not fully load with an option
        var ret = (liberator.buffer.loaded == 1);
        if (!ret)
            liberator.echoerr("Page did not load completely in " + ms + " milliseconds. Macro stopped.");
        liberator.dump("done waiting: " + ret + "\n");

        // sometimes the input widget had focus when replaying a macro
        // maybe this call should be moved somewhere else?
        // liberator.focusContent(true);

        return ret;
    }

    // load all macros inside ~/.vimperator/macros/
    // setTimeout needed since liberator.io. is loaded after liberator.events.
    setTimeout (function () {
        try
        {
            var files = liberator.io.readDirectory(liberator.io.getSpecialDirectory("macros"));
            for (let i = 0; i < files.length; i++)
            {
                var file = files[i];
                if (!file.exists() || file.isDirectory() ||
                    !file.isReadable() || !/^[\w_-]+(\.vimp)?$/i.test(file.leafName))
                        continue;

                var name = file.leafName.replace(/\.vimp$/i, "");
                macros.set(name, liberator.io.readFile(file).split(/\n/)[0]);
                liberator.log("Macro " + name + " added: " + macros.get(name), 5);
            }
        }
        catch (e)
        {
            liberator.log("Macro directory not found or error reading macro file", 9);
        }
    }, 100);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.mappings.add(liberator.modes.all,
        ["<Esc>", "<C-[>"], "Focus content",
        function () { liberator.events.onEscape(); });

    // add the ":" mapping in all but insert mode mappings
    liberator.mappings.add([liberator.modes.NORMAL, liberator.modes.VISUAL, liberator.modes.HINTS, liberator.modes.MESSAGE, liberator.modes.COMPOSE, liberator.modes.CARET, liberator.modes.TEXTAREA],
        [":"], "Enter command line mode",
        function () { liberator.commandline.open(":", "", liberator.modes.EX); });

    // focus events
    liberator.mappings.add([liberator.modes.NORMAL, liberator.modes.VISUAL, liberator.modes.CARET],
        ["<Tab>"], "Advance keyboard focus",
        function () { document.commandDispatcher.advanceFocus(); });

    liberator.mappings.add([liberator.modes.NORMAL, liberator.modes.VISUAL, liberator.modes.CARET, liberator.modes.INSERT, liberator.modes.TEXTAREA],
        ["<S-Tab>"], "Rewind keyboard focus",
        function () { document.commandDispatcher.rewindFocus(); });

    liberator.mappings.add(liberator.modes.all,
        ["<C-z>"], "Temporarily ignore all " + liberator.config.name + " key bindings",
        function () { liberator.modes.passAllKeys = true; });

    liberator.mappings.add(liberator.modes.all,
        ["<C-v>"], "Pass through next key",
        function () { liberator.modes.passNextKey = true; });

    liberator.mappings.add(liberator.modes.all,
        ["<Nop>"], "Do nothing",
        function () { return; });

    // macros
    liberator.mappings.add([liberator.modes.NORMAL, liberator.modes.MESSAGE],
        ["q"], "Record a key sequence into a macro",
        function (arg) { liberator.events.startRecording(arg); },
        { flags: liberator.Mappings.flags.ARGUMENT });

    liberator.mappings.add([liberator.modes.NORMAL, liberator.modes.MESSAGE],
        ["@"], "Play a macro",
        function (count, arg)
        {
            if (count < 1) count = 1;
            while (count-- && liberator.events.playMacro(arg))
                ;
        },
        { flags: liberator.Mappings.flags.ARGUMENT | liberator.Mappings.flags.COUNT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["delmac[ros]"],
        "Delete macros",
        function (args)
        {
            if (!args)
                liberator.echoerr("E474: Invalid argument");
            else
                liberator.events.deleteMacros(args);
        },
        {
            completer: function (filter) { return liberator.completion.macro(filter); }
        });

    liberator.commands.add(["macros"],
        "List all macros",
        function (args)
        {
            var str = "<table>";
            var macroRef = liberator.events.getMacros(args);
            for (let [macro, keys] in macroRef)
               str += "<tr><td> " + macro + " &nbsp; </td><td>" +
                      liberator.util.escapeHTML(keys) + "</td></tr>";

            str += "</table>";

            liberator.echo(str, liberator.commandline.FORCE_MULTILINE);
        },
        {
            completer: function (filter) { return liberator.completion.macro(filter); }
        });

    liberator.commands.add(["pl[ay]"],
        "Replay a recorded macro",
        function (args)
        {
            if (!args)
                liberator.echoerr("E474: Invalid argument");
            else
                liberator.events.playMacro(args);
        },
        {
            completer: function (filter) { return liberator.completion.macro(filter); }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var eventManager = {

        wantsModeReset: true, // used in onFocusChange since Firefox is so buggy here

        destroy: function ()
        {
            // removeEventListeners() to avoid mem leaks
            liberator.dump("TODO: remove all eventlisteners\n");

            if (typeof(getBrowser) != "undefined")
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

            liberator.modes.isRecording = true;

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
                liberator.modes.isReplaying = true;
                // make sure the page is stopped before starting to play the macro
                try
                {
                    getWebNavigation().stop(nsIWebNavigation.STOP_ALL);
                }
                catch (e) {}

                liberator.buffer.loaded = 1; // even if not a full page load, assume it did load correctly before starting the macro
                res = liberator.events.feedkeys(macros.get(lastMacro), true); // true -> noremap
                liberator.modes.isReplaying = false;
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
        feedkeys: function (keys, noremap)
        {
            var doc = window.document;
            var view = window.document.defaultView;
            var escapeKey = false; // \ to escape some special keys
            var wasReplaying = liberator.modes.isReplaying;

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
                // stop feeding keys if page loading failed
                if (wasReplaying) {
                    if (!liberator.modes.isReplaying)
                        break;
                    if (!waitForPageLoaded())
                        break;
                }
                // else // a short break between keys often helps
                //     liberator.sleep(50);
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
            if (liberator.mode == liberator.modes.COMMAND_LINE)
                return;

            var win  = window.document.commandDispatcher.focusedWindow;
            var elem = window.document.commandDispatcher.focusedElement;
            if (elem && elem.readOnly)
                return;

            //liberator.log("onFocusChange: " + elem);
            //liberator.dump("=+++++++++=\n" + liberator.util.objectToString(event.target) + "\n")
            //liberator.dump (elem + ": " + win + "\n");//" - target: " + event.target + " - origtarget: " + event.originalTarget + " - expltarget: " + event.explicitOriginalTarget + "\n");

            if (elem && (
                   (elem instanceof HTMLInputElement && (elem.type.toLowerCase() == "text" || elem.type.toLowerCase() == "password")) ||
                   (elem instanceof HTMLSelectElement)
                ))
            {
                this.wantsModeReset = false;
                liberator.mode = liberator.modes.INSERT;
                liberator.buffer.lastInputField = elem;
                return;
            }

            if (elem && elem instanceof HTMLTextAreaElement)
            {
                this.wantsModeReset = false;
                if (liberator.options["insertmode"])
                    liberator.modes.set(liberator.modes.INSERT, liberator.modes.TEXTAREA);
                else if (elem.selectionEnd - elem.selectionStart > 0)
                    liberator.modes.set(liberator.modes.VISUAL, liberator.modes.TEXTAREA);
                else
                    liberator.modes.main = liberator.modes.TEXTAREA;
                liberator.buffer.lastInputField = elem;
                return;
            }

            if (liberator.config.name == "Muttator")
            {
                // we switch to -- MESSAGE -- mode for muttator, when the main HTML widget gets focus
                if ((win && win.document && win.document instanceof HTMLDocument)
                    || elem instanceof HTMLAnchorElement)
                {
                    if (liberator.config.isComposeWindow)
                    {
                        liberator.dump("Compose editor got focus\n");
                        liberator.modes.set(liberator.modes.INSERT, liberator.modes.TEXTAREA);
                    }
                    else if (liberator.mode != liberator.modes.MESSAGE)
                        liberator.mode = liberator.modes.MESSAGE;
                    return;
                }
            }

            if (liberator.mode == liberator.modes.INSERT ||
                liberator.mode == liberator.modes.TEXTAREA ||
                liberator.mode == liberator.modes.MESSAGE ||
                liberator.mode == liberator.modes.VISUAL)
            {
               // FIXME: currently this hack is disabled to make macros work
               // this.wantsModeReset = true;
               // setTimeout(function ()
               // {
               //     liberator.dump("cur: " + liberator.mode + "\n");
               //     if (liberator.events.wantsModeReset)
               //     {
               //         liberator.events.wantsModeReset = false;
                        liberator.modes.reset();
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

            if (liberator.mode != liberator.modes.VISUAL)
            {
                if (couldCopy)
                {
                    if ((liberator.mode == liberator.modes.TEXTAREA ||
                         (liberator.modes.extended & liberator.modes.TEXTAREA))
                            && !liberator.options["insertmode"])
                        liberator.modes.set(liberator.modes.VISUAL, liberator.modes.TEXTAREA);
                    else if (liberator.mode == liberator.modes.CARET)
                        liberator.modes.set(liberator.modes.VISUAL, liberator.modes.CARET);
                }
            }
            // XXX: disabled, as i think automatically starting visual caret mode does more harm than help
            // else
            // {
            //     if (!couldCopy && liberator.modes.extended & liberator.modes.CARET)
            //         liberator.mode = liberator.modes.CARET;
            // }
        },

        // global escape handler, is called in ALL modes
        onEscape: function ()
        {
            if (!liberator.modes.passNextKey)
            {
                if (liberator.modes.passAllKeys)
                {
                    liberator.modes.passAllKeys = false;
                    return;
                }

                switch (liberator.mode)
                {
                    case liberator.modes.NORMAL:
                        // clear any selection made
                        var selection = window.content.getSelection();
                        try
                        { // a simple if (selection) does not seem to work
                            selection.collapseToStart();
                        }
                        catch (e) {}
                        liberator.commandline.clear();

                        liberator.modes.reset();
                        liberator.focusContent(true);
                        break;

                    case liberator.modes.VISUAL:
                        if (liberator.modes.extended & liberator.modes.TEXTAREA)
                            liberator.mode = liberator.modes.TEXTAREA;
                        else if (liberator.modes.extended & liberator.modes.CARET)
                            liberator.mode = liberator.modes.CARET;
                        break;

                    case liberator.modes.CARET:
                        // setting this option will trigger an observer which will
                        // care about all other details like setting the NORMAL mode
                        liberator.options.setPref("accessibility.browsewithcaret", false);
                        break;

                    case liberator.modes.INSERT:
                        if ((liberator.modes.extended & liberator.modes.TEXTAREA) && !liberator.options["insertmode"])
                        {
                            liberator.mode = liberator.modes.TEXTAREA;
                        }
                        else
                        {
                            liberator.modes.reset();
                            liberator.focusContent(true);
                        }
                        break;

                    default: // HINTS, CUSTOM or COMMAND_LINE
                        liberator.modes.reset();
                        break;
                }
            }
        },

        // this keypress handler gets always called first, even if e.g.
        // the commandline has focus
        onKeyPress: function (event)
        {
            var key = liberator.events.toString(event);
            if (!key)
                 return true;

            //liberator.log(key + " in mode: " + liberator.mode);
            //liberator.dump(key + " in mode: " + liberator.mode + "\n");

            if (liberator.modes.isRecording)
            {
                if (key == "q") // TODO: should not be hardcoded
                {
                    liberator.modes.isRecording = false;
                    liberator.log("Recorded " + currentMacro + ": " + macros.get(currentMacro), 9);
                    liberator.echo("Recorded macro '" + currentMacro + "'");
                    event.preventDefault();
                    event.stopPropagation();
                    return true;
                }
                else if (!(liberator.modes.extended & liberator.modes.INACTIVE_HINT) &&
                         !liberator.mappings.hasMap(liberator.mode, liberator.input.buffer + key))
                {
                    macros.set(currentMacro, macros.get(currentMacro) + key);
                }
            }

            if (liberator.modes.isReplaying)
            {
                // XXX: Prevents using <C-c> in a macro.
                if (key == "<C-c>" && !event.isMacro)
                {
                    liberator.modes.isReplaying = false;
                    liberator.echo("Canceled playback of macro '" + lastMacro + "'");
                    event.preventDefault();
                    event.stopPropagation();
                    return true;
                }
            }

            var stop = true; // set to false if we should NOT consume this event but let Firefox handle it

            var win = document.commandDispatcher.focusedWindow;
            if (win && win.document.designMode == "on" && !liberator.config.isComposeWindow)
                return false;

            // menus have their own command handlers
            if (liberator.modes.extended & liberator.modes.MENU)
                return false;

            // handle Escape-one-key mode (Ctrl-v)
            if (liberator.modes.passNextKey && !liberator.modes.passAllKeys)
            {
                liberator.modes.passNextKey = false;
                return false;
            }
            // handle Escape-all-keys mode (Ctrl-q)
            if (liberator.modes.passAllKeys)
            {
                if (liberator.modes.passNextKey)
                    liberator.modes.passNextKey = false; // and then let flow continue
                else if (key == "<Esc>" || key == "<C-[>" || key == "<C-v>")
                    ; // let flow continue to handle these keys to cancel escape-all-keys mode
                else
                    return false;
            }

            // just forward event without checking any mappings when the MOW is open
            if (liberator.mode == liberator.modes.COMMAND_LINE &&
                (liberator.modes.extended & liberator.modes.OUTPUT_MULTILINE))
            {
                liberator.commandline.onMultilineOutputEvent(event);
                event.preventDefault();
                event.stopPropagation();
                return false;
            }

            // XXX: ugly hack for now pass certain keys to firefox as they are without beeping
            // also fixes key navigation in combo boxes, submitting forms, etc.
            // FIXME: breaks iabbr for now --mst
            if ((liberator.config.name == "Vimperator" && liberator.mode == liberator.modes.NORMAL)
                 || liberator.mode == liberator.modes.INSERT)
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
                if (liberator.mode == liberator.modes.CUSTOM)
                {
                    liberator.plugins.onEvent(event);
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
                // if Hint mode is on, special handling of keys is required
                if (liberator.mode == liberator.modes.HINTS)
                {
                    liberator.hints.onEvent(event);
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
            }

            // FIXME (maybe): (is an ESC or C-] here): on HINTS mode, it enters
            // into 'if (map && !skipMap) below. With that (or however) it
            // triggers the onEscape part, where it resets mode. Here I just
            // return true, with the effect that it also gets to there (for
            // whatever reason).  if that happens to be correct, well..
            // XXX: why not just do that as well for HINTS mode actually?

            if (liberator.mode == liberator.modes.CUSTOM)
                return true;

            var countStr = liberator.input.buffer.match(/^[0-9]*/)[0];
            var candidateCommand = (liberator.input.buffer + key).replace(countStr, "");
            var map;
            if (event.noremap)
                map = liberator.mappings.getDefault(liberator.mode, candidateCommand);
            else
                map = liberator.mappings.get(liberator.mode, candidateCommand);

            // counts must be at the start of a complete mapping (10j -> go 10 lines down)
            if (/^[1-9][0-9]*$/.test(liberator.input.buffer + key))
            {
                // no count for insert mode mappings
                if (liberator.mode == liberator.modes.INSERT || liberator.mode == liberator.modes.COMMAND_LINE)
                    stop = false;
                else
                {
                    liberator.input.buffer += key;
                    inputBufferLength++;
                }
            }
            else if (liberator.input.pendingArgMap)
            {
                liberator.input.buffer = "";
                inputBufferLength = 0;
                var tmp = liberator.input.pendingArgMap; // must be set to null before .execute; if not
                liberator.input.pendingArgMap = null;    // v.input.pendingArgMap is still 'true' also for new feeded keys
                if (key != "<Esc>" && key != "<C-[>")
                {
                    if (liberator.modes.isReplaying && !waitForPageLoaded())
                        return true;

                    tmp.execute(null, liberator.input.count, key);
                }
            }
            // only follow a map if there isn't a longer possible mapping
            // (allows you to do :map z yy, when zz is a longer mapping than z)
            // TODO: map.rhs is only defined for user defined commands, should add a "isDefault" property
            else if (map && !skipMap && (map.rhs ||
                     liberator.mappings.getCandidates(liberator.mode, candidateCommand).length == 0))
            {
                liberator.input.count = parseInt(countStr, 10);
                if (isNaN(liberator.input.count))
                    liberator.input.count = -1;
                if (map.flags & liberator.Mappings.flags.ARGUMENT)
                {
                    liberator.input.pendingArgMap = map;
                    liberator.input.buffer += key;
                    inputBufferLength++;
                }
                else if (liberator.input.pendingMotionMap)
                {
                    if (key != "<Esc>" && key != "<C-[>")
                    {
                        liberator.input.pendingMotionMap.execute(candidateCommand, liberator.input.count, null);
                    }
                    liberator.input.pendingMotionMap = null;
                    liberator.input.buffer = "";
                    inputBufferLength = 0;
                }
                // no count support for these commands yet
                else if (map.flags & liberator.Mappings.flags.MOTION)
                {
                    liberator.input.pendingMotionMap = map;
                    liberator.input.buffer = "";
                    inputBufferLength = 0;
                }
                else
                {
                    liberator.input.buffer = "";
                    inputBufferLength = 0;

                    if (liberator.modes.isReplaying && !waitForPageLoaded())
                        return true;

                    var ret = map.execute(null, liberator.input.count);
                    if (map.flags & liberator.Mappings.flags.ALLOW_EVENT_ROUTING && ret)
                        stop = false;
                }
            }
            else if (liberator.mappings.getCandidates(liberator.mode, candidateCommand).length > 0 && !skipMap)
            {
                liberator.input.buffer += key;
                inputBufferLength++;
            }
            else // if the key is neither a mapping nor the start of one
            {
                // the mode checking is necessary so that things like g<esc> do not beep
                if (liberator.input.buffer != "" && !skipMap && (liberator.mode == liberator.modes.INSERT ||
                    liberator.mode == liberator.modes.COMMAND_LINE || liberator.mode == liberator.modes.TEXTAREA))
                {
                    // no map found -> refeed stuff in v.input.buffer (only while in INSERT, CO... modes)
                    skipMap = true; // ignore maps while doing so
                    liberator.events.feedkeys(liberator.input.buffer, true);
                }
                if (skipMap)
                {
                    if (--inputBufferLength == 0) // inputBufferLength == 0. v.input.buffer refeeded...
                        skipMap = false; // done...
                }

                liberator.input.buffer = "";
                liberator.input.pendingArgMap = null;
                liberator.input.pendingMotionMap = null;

                if (key != "<Esc>" && key != "<C-[>")
                {
                    // allow key to be passed to firefox if we can't handle it
                    stop = false;

                    if (liberator.mode == liberator.modes.COMMAND_LINE)
                    {
                        if (!(liberator.modes.extended & liberator.modes.INPUT_MULTILINE))
                            liberator.commandline.onEvent(event); // reroute event in command line mode
                    }
                    else if (liberator.mode != liberator.modes.INSERT && liberator.mode != liberator.modes.TEXTAREA)
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

            var motionMap = (liberator.input.pendingMotionMap && liberator.input.pendingMotionMap.names[0]) || "";
            liberator.statusline.updateInputBuffer(motionMap + liberator.input.buffer);
            return false;
        },

        // this is need for sites like msn.com which focus the input field on keydown
        onKeyUpOrDown: function (event)
        {
            if (liberator.modes.passNextKey ^ liberator.modes.passAllKeys || isFormElemFocused())
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
                        liberator.buffer.loaded = 0;
                        liberator.statusline.updateProgress(0);

                        liberator.autocommands.trigger("PageLoadPre", liberator.buffer.URL);

                        // don't reset mode if a frame of the frameset gets reloaded which
                        // is not the focused frame
                        if (document.commandDispatcher.focusedWindow == webProgress.DOMWindow)
                        {
                            setTimeout (function () { liberator.modes.reset(false); },
                                liberator.mode == liberator.modes.HINTS ? 500 : 0);
                        }
                    }
                    else if (flags & Components.interfaces.nsIWebProgressListener.STATE_STOP)
                    {
                        liberator.buffer.loaded = (status == 0 ? 1 : 2);
                        liberator.statusline.updateUrl();
                    }
                }
            },
            // for notifying the user about secure web pages
            onSecurityChange: function (webProgress, aRequest, aState)
            {
                const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
                if (aState & nsIWebProgressListener.STATE_IS_INSECURE)
                    liberator.statusline.setClass("insecure");
                else if (aState & nsIWebProgressListener.STATE_IS_BROKEN)
                    liberator.statusline.setClass("broken");
                else if (aState & nsIWebProgressListener.STATE_IS_SECURE)
                    liberator.statusline.setClass("secure");
            },
            onStatusChange: function (webProgress, request, status, message)
            {
                liberator.statusline.updateUrl(message);
            },
            onProgressChange: function (webProgress, request, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress)
            {
                liberator.statusline.updateProgress(curTotalProgress/maxTotalProgress);
            },
            // happens when the users switches tabs
            onLocationChange: function ()
            {
                liberator.statusline.updateUrl();
                liberator.statusline.updateProgress();

                liberator.autocommands.trigger("LocationChange", liberator.buffer.URL);

                // if this is not delayed we get the position of the old buffer
                setTimeout(function () { liberator.statusline.updateBufferPosition(); }, 100);
            },
            // called at the very end of a page load
            asyncUpdateUI: function ()
            {
                setTimeout(liberator.statusline.updateUrl, 100);
            },
            setOverLink : function (link, b)
            {
                var ssli = liberator.options["showstatuslinks"];
                if (link && ssli)
                {
                    if (ssli == 1)
                        liberator.statusline.updateUrl("Link: " + link);
                    else if (ssli == 2)
                        liberator.echo("Link: " + link, liberator.commandline.DISALLOW_MULTILINE);
                }

                if (link == "")
                {
                    if (ssli == 1)
                        liberator.statusline.updateUrl();
                    else if (ssli == 2)
                        liberator.modes.show();
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
                if (!this._branch) return;
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
                        var value = liberator.options.getPref("accessibility.browsewithcaret", false);
                        liberator.mode = value ? liberator.modes.CARET : liberator.modes.NORMAL;
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

    window.addEventListener("keypress", eventManager.onKeyPress,    true);
    window.addEventListener("keydown",  eventManager.onKeyUpOrDown, true);
    window.addEventListener("keyup",    eventManager.onKeyUpOrDown, true);

    return eventManager;

}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
