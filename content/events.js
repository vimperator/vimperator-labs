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

vimperator.AutoCommands = function() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var autoCommands = {};

    function autoCommandsIterator()
    {
        for (var item in autoCommands)
            for (var i = 0; i < autoCommands[item].length; i++)
                yield  item + " " + autoCommands[item][i][0] + " " + autoCommands[item][i][1];
        throw StopIteration;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    //TODO: maybe this.function rather than v.autocommands.function...

    return {

        __iterator__: function ()
        {
            return autoCommandsIterator();
        },

        remove: function (auEvent, regex) // arguments are filters (NULL = all)
        {
            if (!auEvent && !regex)
            {
                autoCommands = {}; // delete all TODO: rather delete.. or something?
            }
            else if (!regex) // remove all on this auEvent
            {
                for (var item in autoCommands)
                {
                    if (item == auEvent)
                        delete autoCommands[item];
                }
            }
            else if (!auEvent) // delete all match's to this regex
            {
                for (var item in autoCommands)
                {
                    var i = 0;
                    while (i < autoCommands[item].length)
                    {
                        if (regex == autoCommands[item][i][0])
                        {
                            autoCommands[item].splice(i, 1); // remove array
                            // keep `i' since this is removed, so a possible next one is at this place now)
                        }
                        else
                            i++;
                    }
                }
            }
            else // delete matching `auEvent && regex' items
            {
                for (var item in autoCommands)
                {
                    if (item == auEvent)
                    {
                        for (var i = 0; i < autoCommands[item].length; i++)
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
            var list = "<table><tr><td style='font-weight: bold;'  colspan='2'>---- Auto-Commands ----</td></tr>";
            for (var item in autoCommands)
            {
                flag = true;
                if (!auEvent || item == auEvent) // filter event
                {
                    for (var i = 0; i < autoCommands[item].length; i++)
                    {
                        if (!regex || regex == autoCommands[item][i][0]) // filter regex
                        {
                            if (flag == true)
                            {
                                list += "<tr><td style='font-weight: bold;'  colspan='2'>" +
                                        vimperator.util.escapeHTML(item) + "</td></tr>";
                                flag = false;
                            }

                            list += "<tr>";
                            list += "<td> &nbsp; " + vimperator.util.escapeHTML(autoCommands[item][i][0]) + "</td>";
                            list += "<td>" + vimperator.util.escapeHTML(autoCommands[item][i][1]) + "</td>";
                            list += "</tr>";
                        }
                    }
                }
            }

            list += "</table>";
            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        },

        add: function (auEvent, regex, cmds)
        {
            var eventsIter = auEvent.split(",");
            for (var i = 0; i < eventsIter.length; i++)
            {
                if (!autoCommands[eventsIter[i]])
                    autoCommands[eventsIter[i]] = [];

                var flag = true;
                for (var y = 0; y < autoCommands[eventsIter[i]].length; y++)
                {
                    if (autoCommands[eventsIter[i]][y][0] == regex && autoCommands[eventsIter[i]][y][1] == cmds)
                        flag = false;
                }
                if (flag)
                    autoCommands[eventsIter[i]].push([regex, cmds]);
            }
        },

        trigger: function (auEvent, url)
        {
            if (autoCommands[auEvent])
            {
                for (var i = 0; i < autoCommands[auEvent].length; i++)
                {
                    var regex = new RegExp(autoCommands[auEvent][i][0]);
                    if (regex.test(url))
                        vimperator.execute(autoCommands[auEvent][i][1]);
                }
            }
        }
    };
    //}}}
} //}}}

vimperator.Events = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var inputBufferLength = 0; // counts the number of keys in v.input.buffer (can be different from v.input.buffer.length)
    var skipMap = false; // while feeding the keys (stored in v.input.buffer | no map found) - ignore mappings

    var macros = {};
    var currentMacro = "";
    var lastMacro = "";

    // any tab related events
    var tabcontainer = getBrowser().mTabContainer;
    tabcontainer.addEventListener("TabMove",   function (event)
    {
        vimperator.statusline.updateTabCount();
        vimperator.buffer.updateBufferList();
    }, false);
    tabcontainer.addEventListener("TabOpen",   function (event)
    {
        vimperator.statusline.updateTabCount();
        vimperator.buffer.updateBufferList();
    }, false);
    tabcontainer.addEventListener("TabClose",  function (event)
    {
        vimperator.statusline.updateTabCount();
        vimperator.buffer.updateBufferList();
    }, false);
    tabcontainer.addEventListener("TabSelect", function (event)
    {
        if (vimperator.mode == vimperator.modes.HINTS)
            vimperator.modes.reset();

        vimperator.commandline.clear();
        vimperator.modes.show();
        vimperator.statusline.updateTabCount();
        vimperator.buffer.updateBufferList();
        vimperator.tabs.updateSelectionHistory();

        setTimeout(function () { vimperator.focusContent(true); }, 10); // just make sure, that no widget has focus
    }, false);

    // this adds an event which is is called on each page load, even if the
    // page is loaded in a background tab
    getBrowser().addEventListener("load", onPageLoad, true);

    // called when the active document is scrolled
    getBrowser().addEventListener("scroll", function (event)
    {
        vimperator.statusline.updateBufferPosition();
        vimperator.modes.show();
    }, null);

//    getBrowser().addEventListener("submit", function (event)
//    {
//        // reset buffer loading state as early as possible, important for macros
//        dump("submit\n");
//        vimperator.buffer.loaded = 0;
//    }, null);

    /////////////////////////////////////////////////////////
    // track if a popup is open or the menubar is active
    var activeMenubar = false;
    function enterPopupMode(event)
    {
        if (event.originalTarget.localName == "tooltip" || event.originalTarget.id == "vimperator-visualbell")
            return;

        vimperator.modes.add(vimperator.modes.MENU);
    }
    function exitPopupMode()
    {
        // gContextMenu is set to NULL by firefox, when a context menu is closed
        if (!gContextMenu && !activeMenubar)
            vimperator.modes.remove(vimperator.modes.MENU);
    }
    function enterMenuMode()
    {
        activeMenubar = true;
        vimperator.modes.add(vimperator.modes.MENU);
    }
    function exitMenuMode()
    {
        activeMenubar = false;
        vimperator.modes.remove(vimperator.modes.MENU);
    }
    window.addEventListener("popupshown", enterPopupMode, true);
    window.addEventListener("popuphidden", exitPopupMode, true);
    window.addEventListener("DOMMenuBarActive", enterMenuMode, true);
    window.addEventListener("DOMMenuBarInactive", exitMenuMode, true);

    // window.document.addEventListener("DOMTitleChanged", function (event)
    // {
    //     vimperator.log("titlechanged");
    // }, null);

    // NOTE: the order of ["Esc", "Escape"] or ["Escape", "Esc"]
    //       matters, so use that string as the first item, that you
    //       want to refer to within Vimperator's source code for
    //       comparisons like if (key == "Esc") { ... }
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
        for (var i in keyTable)
        {
            for (var k in keyTable[i][1])
            {
                // we don't store lowercase keys in the keyTable, because we
                // also need to get good looking strings for the reverse action
                if (keyTable[i][1][k].toLowerCase() == str)
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
                setTimeout(vimperator.statusline.updateUrl, 10);
                return;
            }

            // code which should happen for all (also background) newly loaded tabs goes here:

            var url = vimperator.buffer.URL;
            var title = vimperator.buffer.title;

            //update history
            vimperator.history.add(url, title);

            vimperator.buffer.updateBufferList();
            vimperator.autocommands.trigger("PageLoad", url);

            // mark the buffer as loaded, we can't use vimperator.buffer.loaded
            // since that always refers to the current buffer, while doc can be
            // any buffer, even in a background tab
            doc.pageIsFullyLoaded = 1;

            // code which is only relevant if the page load is the current tab goes here:
            if (doc == getBrowser().selectedBrowser.contentDocument)
            {
            //    // FIXME: this currently causes window map events which is _very_ annoying
            //    // we want to stay in command mode after a page has loaded
                setTimeout(function () {
                    var focused = document.commandDispatcher.focusedElement;
                    if (focused && focused.value.length == 0)
                        focused.blur();
                }, 100);
            }
        }
    }

    // return true when load successful, or false otherwise
    function waitForPageLoaded()
    {
        dump("start waiting in loaded state: " + vimperator.buffer.loaded + "\n");
        var mainThread = Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager).mainThread;
        while (mainThread.hasPendingEvents()) // clear queue
            mainThread.processNextEvent(true);

//        if (vimperator.buffer.loaded == 1)
//            return true;

        var ms = 10000; // maximum time to wait - TODO: add option
        var then = new Date().getTime();
        for (var now = then; now - then < ms; now = new Date().getTime())
        {
            mainThread.processNextEvent(true);
            if ((now -then) % 1000 < 10)
                dump("waited: " + (now - then) + " ms\n");

            if (vimperator.buffer.loaded > 0)
                break;
            else
                vimperator.echo("Waiting for page to load...");
        }

        // TODO: allow macros to be continued when page does not fully load with an option
        var ret = (vimperator.buffer.loaded == 1);
        if (!ret)
            vimperator.echoerr("Page did not load completely in " + ms + " milliseconds. Macro stopped.");
        dump("done waiting: " + ret + "\n");

        return ret;
    }

    // load all macros inside ~/.vimperator/macros/
    // setTimeout needed since vimperator.io. is loaded after vimperator.events.
    setTimeout (function() {
        try
        {
            var files = vimperator.io.readDirectory(vimperator.io.getSpecialDirectory("macros"));
            for (var i = 0; i < files.length; i++)
            {
                var file = files[i];
                if (!file.exists() || file.isDirectory() || !file.isReadable())
                continue;

                var name = file.leafName.replace(/\.vimp$/i, "");
                macros[name] = vimperator.io.readFile(file).split(/\n/)[0];
                vimperator.log("Macro " + name + " added: " + macros[name], 8);
            }
        }
        catch (e)
        {
            vimperator.log("macro directory not found or error reading macro file");
        }
    }, 100);



    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var eventManager = {

        wantsModeReset: true, // used in onFocusChange since Firefox is so buggy here

        destroy: function ()
        {
            // removeEventListeners() to avoid mem leaks
            window.dump("TODO: remove all eventlisteners\n");

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
                vimperator.echoerr("Register must be [a-zA-z0-9]");
                return false;
            }
            vimperator.modes.isRecording = true;

            if (/[A-Z]/.test(macro)) // uppercase (append)
            {
                currentMacro = macro.toLowerCase();
                if (!macros[currentMacro])
                    macros[currentMacro] = ""; // initialize if it does not yet exist
            }
            else
            {
                currentMacro = macro;
                macros[currentMacro] = "";
            }
        },

        playMacro: function (macro)
        {
            if (!/[a-zA-Z0-9@]/.test(macro))
            {
                vimperator.echoerr("Register must be [a-z0-9]");
                return false;
            }
            if (macro == "@") // use lastMacro if it's set
            {
                if (!lastMacro)
                {
                    vimperator.echoerr("E748: No previously used register");
                    return false;
                }
            }
            else
            {
                lastMacro = macro.toLowerCase(); // XXX: sets last playerd macro, even if it does not yet exist
            }

            if (macros[lastMacro])
            {
                vimperator.modes.isReplaying = true;
                BrowserStop(); // make sure the page is stopped before starting to play the macro
                vimperator.buffer.loaded = 1; // even if not a full page load, assume it did load correctly before starting the macro
                vimperator.events.feedkeys(macros[lastMacro], true);  // true -> noremap
                vimperator.modes.isReplaying = false;
            }
            else
                vimperator.echoerr("Register " + lastMacro + " not set");
        },

        // This method pushes keys into the event queue from vimperator
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
                                return; // an invalid key like <a>
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
                        else //an invalid key like <A-xxx> was found, stop propagation here (like Vim)
                        {
                            return;
                        }

                        i += matches[0].length + 1;
                    }
                }

                var elem = window.document.commandDispatcher.focusedElement;
                if (!elem)
                    elem = window.content;

                var evt = doc.createEvent("KeyEvents");
                evt.initKeyEvent("keypress", true, true, view, ctrl, alt, shift, meta, keyCode, charCode);
                evt.noremap = noremap;
                if (elem.dispatchEvent(evt)) // return true in onEvent to stop feeding keys
                {
                    vimperator.beep();
                    return
                }
            }
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

                    for (var i in keyTable)
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

        getMapLeader: function ()
        {
            var leaderRef = vimperator.variableReference("mapleader");
            return leaderRef[0] ? leaderRef[0][leaderRef[1]] : "\\";
        },

        // argument "event" is delibarately not used, as i don't seem to have
        // access to the real focus target
        //
        // the ugly wantsModeReset is needed, because firefox generates a massive
        // amount of focus changes for things like <C-v><C-k> (focusing the search field)
        onFocusChange: function (event)
        {
            // command line has it's own focus change handler
            if (vimperator.mode == vimperator.modes.COMMAND_LINE)
                return;

            var elem = window.document.commandDispatcher.focusedElement;
            if (elem && elem.readOnly)
                return;

            if (elem && elem instanceof HTMLInputElement &&
                    (elem.type.toLowerCase() == "text" || elem.type.toLowerCase() == "password"))
            {
                this.wantsModeReset = false;
                vimperator.mode = vimperator.modes.INSERT;
                vimperator.buffer.lastInputField = elem;
            }
            else if (elem && elem instanceof HTMLTextAreaElement)
            {
                this.wantsModeReset = false;
                if (vimperator.options["insertmode"])
                    vimperator.modes.set(vimperator.modes.INSERT, vimperator.modes.TEXTAREA);
                else if (elem.selectionEnd - elem.selectionStart > 0)
                    vimperator.modes.set(vimperator.modes.VISUAL, vimperator.modes.TEXTAREA);
                else
                    vimperator.modes.main = vimperator.modes.TEXTAREA;
                vimperator.buffer.lastInputField = elem;
            }
            else if (vimperator.mode == vimperator.modes.INSERT ||
                     vimperator.mode == vimperator.modes.TEXTAREA ||
                     vimperator.mode == vimperator.modes.VISUAL)
            {
               // FIXME: currently this hack is disabled to make macros work
               // this.wantsModeReset = true;
               // setTimeout(function ()
               // {
               //     dump("cur: " + vimperator.mode + "\n");
               //     if (vimperator.events.wantsModeReset)
               //     {
               //         vimperator.events.wantsModeReset = false;
                        vimperator.modes.reset();
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

            if (vimperator.mode != vimperator.modes.VISUAL)
            {
                if (couldCopy)
                {
                    if ((vimperator.mode == vimperator.modes.TEXTAREA || (vimperator.modes.extended & vimperator.modes.TEXTAREA))
                            && !vimperator.options["insertmode"])
                        vimperator.modes.set(vimperator.modes.VISUAL, vimperator.modes.TEXTAREA);
                    else if (vimperator.mode == vimperator.modes.CARET)
                        vimperator.modes.set(vimperator.modes.VISUAL, vimperator.modes.CARET);
                }
            }
            //else
            //{
            //    if (!couldCopy && vimperator.modes.extended & vimperator.modes.CARET)
            //        vimperator.mode = vimperator.modes.CARET;
            //}
        },

        // global escape handler, is called in ALL modes
        onEscape: function ()
        {
            if (!vimperator.modes.passNextKey)
            {
                if (vimperator.modes.passAllKeys)
                {
                    vimperator.modes.passAllKeys = false;
                    return;
                }

                switch (vimperator.mode)
                {
                    case vimperator.modes.HINTS:
                    case vimperator.modes.COMMAND_LINE:
                        vimperator.modes.reset();
                        break;

                    case vimperator.modes.VISUAL:
                        if (vimperator.modes.extended & vimperator.modes.TEXTAREA)
                            vimperator.mode = vimperator.modes.TEXTAREA;
                        else if (vimperator.modes.extended & vimperator.modes.CARET)
                            vimperator.mode = vimperator.modes.CARET;
                        break;

                    case vimperator.modes.CARET:
                        // setting this option will trigger an observer which will
                        // care about all other details like setting the NORMAL mode
                        vimperator.options.setFirefoxPref("accessibility.browsewithcaret", false);
                        break;

                    case vimperator.modes.INSERT:
                        if ((vimperator.modes.extended & vimperator.modes.TEXTAREA) && !vimperator.options["insertmode"])
                        {
                            vimperator.mode = vimperator.modes.TEXTAREA;
                        }
                        else
                        {
                            vimperator.modes.reset();
                            vimperator.focusContent(true);
                        }
                        break;


                    default:
                        // clear any selection made
                        var selection = window.content.getSelection();
                        try
                        { // a simple if (selection) does not seem to work
                            selection.collapseToStart();
                        }
                        catch (e) { }
                        vimperator.commandline.clear();

                        vimperator.modes.reset();
                        vimperator.focusContent(true);
                }
            }
        },

        // this keypress handler gets always called first, even if e.g.
        // the commandline has focus
        onKeyPress: function (event)
        {
            var key = vimperator.events.toString(event);
            if (!key)
                 return true;
            // dump(key + " in mode: " + vimperator.mode + "\n");

            if (vimperator.modes.isRecording)
            {
                if (key == "q") // TODO: should not be hardcoded
                {
                    vimperator.modes.isRecording = false;
                    vimperator.log("Recorded " + currentMacro + ": " + macros[currentMacro], 8);
                    event.preventDefault(); // XXX: or howto stop that key being processed?
                    event.stopPropagation();
                    return true;
                }
                else if (!(vimperator.modes.extended & vimperator.modes.INACTIVE_HINT) &&
                         !vimperator.mappings.hasMap(vimperator.mode, vimperator.input.buffer + key))
                {
                    macros[currentMacro] += key;
                }
            }

            var stop = true; // set to false if we should NOT consume this event but let also firefox handle it

            var win = document.commandDispatcher.focusedWindow;
            if (win && win.document.designMode == "on")
                return false;

            // menus have their own command handlers
            if (vimperator.modes.extended & vimperator.modes.MENU)
                return false;

            // handle Escape-one-key mode (Ctrl-v)
            if (vimperator.modes.passNextKey && !vimperator.modes.passAllKeys)
            {
                vimperator.modes.passNextKey = false;
                return false;
            }
            // handle Escape-all-keys mode (Ctrl-q)
            if (vimperator.modes.passAllKeys)
            {
                if (vimperator.modes.passNextKey)
                    vimperator.modes.passNextKey = false; // and then let flow continue
                else if (key == "<Esc>" || key == "<C-[>" || key == "<C-v>")
                    ; // let flow continue to handle these keys to cancel escape-all-keys mode
                else
                    return false;
            }

            // FIXME: proper way is to have a better onFocus handler which also handles events for the XUL
            if (!vimperator.mode == vimperator.modes.TEXTAREA &&
                !vimperator.mode == vimperator.modes.INSERT &&
                !vimperator.mode == vimperator.modes.COMMAND_LINE &&
                        isFormElemFocused()) // non insert mode, but e.g. the location bar has focus
                    return false;

            // just forward event, without checking any mappings
            if (vimperator.mode == vimperator.modes.COMMAND_LINE &&
                vimperator.modes.extended & vimperator.modes.OUTPUT_MULTILINE)
            {
                vimperator.commandline.onMultilineOutputEvent(event);
                return false;
            }

            // XXX: ugly hack for now pass certain keys to firefox as they are without beeping
            // also fixes key navigation in combo boxes, submitting forms, etc.
            // FIXME: breaks iabbr for now --mst
            if (vimperator.mode == vimperator.modes.NORMAL || vimperator.mode == vimperator.modes.INSERT)
            {
                if (key == "<Return>")
                {
                    if (vimperator.modes.isReplaying)
                    {
                        // TODO: how to really submit the correct form?
                        vimperator.modes.reset();
                        content.document.forms[0].submit();
                        waitForPageLoaded();
                        dump("before return\n");
                        event.stopPropagation();
                        event.preventDefault();
                        return true;
                    }
                    else
                        return false;
                }
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


            // if Hit-a-hint mode is on, special handling of keys is required
            if (key != "<Esc>" && key != "<C-[>")
            {
                if (vimperator.mode == vimperator.modes.HINTS)
                {
                    vimperator.hints.onEvent(event);
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
            }

            var countStr = vimperator.input.buffer.match(/^[0-9]*/)[0];
            var candidateCommand = (vimperator.input.buffer + key).replace(countStr, "");
            var map;
            if (event.noremap)
                map = vimperator.mappings.getDefault(vimperator.mode, candidateCommand);
            else
                map = vimperator.mappings.get(vimperator.mode, candidateCommand);

            // counts must be at the start of a complete mapping (10j -> go 10 lines down)
            if (/^[1-9][0-9]*$/.test(vimperator.input.buffer + key))
            {
                // no count for insert mode mappings
                if (vimperator.mode == vimperator.modes.INSERT || vimperator.mode == vimperator.modes.COMMAND_LINE)
                    stop = false;
                else
                {
                    vimperator.input.buffer += key;
                    inputBufferLength++;
                }
            }
            else if (vimperator.input.pendingArgMap)
            {
                vimperator.input.buffer = "";
                inputBufferLength = 0;
                var tmp = vimperator.input.pendingArgMap; // must be set to null before .execute; if not
                vimperator.input.pendingArgMap = null;    // v.inputpendingArgMap is still 'true' also for new feeded keys
                if (key != "<Esc>" && key != "<C-[>")
                {
                    if (vimperator.modes.isReplaying && !waitForPageLoaded())
                        return true;

                    tmp.execute(null, vimperator.input.count, key);
                }

            }
            else if (map && !skipMap)
            {
                vimperator.input.count = parseInt(countStr, 10);
                if (isNaN(vimperator.input.count))
                    vimperator.input.count = -1;
                if (map.flags & vimperator.Mappings.flags.ARGUMENT)
                {
                    vimperator.input.pendingArgMap = map;
                    vimperator.input.buffer += key;
                    inputBufferLength++;
                }
                else if (vimperator.input.pendingMotionMap)
                {
                    if (key != "<Esc>" && key != "<C-[>")
                    {
                        vimperator.input.pendingMotionMap.execute(candidateCommand, vimperator.input.count, null);
                    }
                    vimperator.input.pendingMotionMap = null;
                    vimperator.input.buffer = "";
                    inputBufferLength = 0;
                }
                // no count support for these commands yet
                else if (map.flags & vimperator.Mappings.flags.MOTION)
                {
                    vimperator.input.pendingMotionMap = map;
                    vimperator.input.buffer = "";
                    inputBufferLength = 0;
                }
                else
                {
                    vimperator.input.buffer = "";
                    inputBufferLength = 0;

                    if (vimperator.modes.isReplaying && !waitForPageLoaded())
                        return true;

                    var ret = map.execute(null, vimperator.input.count);
                    if (map.flags & vimperator.Mappings.flags.ALLOW_EVENT_ROUTING && ret)
                        stop = false;
                }
            }
            else if (vimperator.mappings.getCandidates(vimperator.mode, candidateCommand).length > 0 && !skipMap)
            {
                vimperator.input.buffer += key;
                inputBufferLength++;
            }
            else // if the key is neither a mapping nor the start of one
            {
                if (vimperator.input.buffer != "" && !skipMap) // no map found -> refeed stuff in v.input.buffer
                {
                    skipMap = true; // ignore maps while doing so
                    vimperator.events.feedkeys(vimperator.input.buffer, true);
                }
                if (skipMap)
                {
                    if (--inputBufferLength == 0) // inputBufferLength == 0. v.input.buffer refeeded...
                        skipMap = false; // done...
                }
                vimperator.input.buffer = "";
                vimperator.input.pendingArgMap = null;
                vimperator.input.pendingMotionMap = null;

                if (key != "<Esc>" && key != "<C-[>")
                {
                    // allow key to be passed to firefox if we can't handle it
                    stop = false;

                    if (vimperator.mode == vimperator.modes.COMMAND_LINE)
                        vimperator.commandline.onEvent(event); // reroute event in command line mode
                    else if (vimperator.mode != vimperator.modes.INSERT)
                        vimperator.beep();
                }
            }

            if (stop)
            {
                event.preventDefault();
                event.stopPropagation();
            }

            var motionMap = (vimperator.input.pendingMotionMap && vimperator.input.pendingMotionMap.names[0]) || "";
            vimperator.statusline.updateInputBuffer(motionMap + vimperator.input.buffer);
            return false;
        },

        // this is need for sites like msn.com which focus the input field on keydown
        onKeyUpOrDown: function (event)
        {
            if (vimperator.modes.passNextKey ^ vimperator.modes.passAllKeys || isFormElemFocused())
                return true;

            event.stopPropagation();
            return false;
        },

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
                        dump("start\n");
                        vimperator.buffer.loaded = 0;
                        vimperator.statusline.updateProgress(0);
                        setTimeout (function () { vimperator.modes.reset(false); },
                            vimperator.mode == vimperator.modes.HINTS ? 500 : 0);
                    }
                    else if (flags & Components.interfaces.nsIWebProgressListener.STATE_STOP)
                    {
                        dump("stop\n");
                        vimperator.buffer.loaded = (status == 0 ? 1 : 2);
                        vimperator.statusline.updateUrl();
                    }
                }
            },
            // for notifying the user about secure web pages
            onSecurityChange: function (webProgress, aRequest, aState)
            {
                const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
                if (aState & nsIWebProgressListener.STATE_IS_INSECURE)
                    vimperator.statusline.setClass("insecure");
                else if (aState & nsIWebProgressListener.STATE_IS_BROKEN)
                    vimperator.statusline.setClass("broken");
                else if (aState & nsIWebProgressListener.STATE_IS_SECURE)
                    vimperator.statusline.setClass("secure");
            },
            onStatusChange: function (webProgress, request, status, message)
            {
                vimperator.statusline.updateUrl(message);
            },
            onProgressChange: function (webProgress, request, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress)
            {
                vimperator.statusline.updateProgress(curTotalProgress/maxTotalProgress);
            },
            // happens when the users switches tabs
            onLocationChange: function ()
            {
                vimperator.statusline.updateUrl();
                vimperator.statusline.updateProgress();

                // if this is not delayed we get the position of the old buffer
                setTimeout(function () { vimperator.statusline.updateBufferPosition(); }, 100);
            },
            // called at the very end of a page load
            asyncUpdateUI: function ()
            {
                setTimeout(vimperator.statusline.updateUrl, 100);
            },
            setOverLink : function (link, b)
            {
                var ssli = vimperator.options["showstatuslinks"];
                if (link && ssli)
                {
                    if (ssli == 1)
                        vimperator.statusline.updateUrl("Link: " + link);
                    else if (ssli == 2)
                        vimperator.echo("Link: " + link, vimperator.commandline.DISALLOW_MULTILINE);
                }

                if (link == "")
                {
                    if (ssli == 1)
                        vimperator.statusline.updateUrl();
                    else if (ssli == 2)
                        vimperator.modes.show();
                }
            },

            // stub functions for the interfaces
            setJSStatus: function (status) { ; },
            setJSDefaultStatus: function (status) { ; },
            setDefaultStatus: function (status) { ; },
            onLinkIconAvailable: function () { ; }
        },

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
                if (aTopic != "nsPref:changed") return;
                // aSubject is the nsIPrefBranch we're observing (after appropriate QI)
                // aData is the name of the pref that's been changed (relative to aSubject)
                switch (aData)
                {
                    case "accessibility.browsewithcaret":
                        var value = vimperator.options.getFirefoxPref("accessibility.browsewithcaret", false);
                        vimperator.mode = value ? vimperator.modes.CARET : vimperator.modes.NORMAL;
                        break;
                }
             }
        }
    };

    window.XULBrowserWindow = eventManager.progressListener;
    window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIWebNavigation)
        .QueryInterface(Components.interfaces.nsIDocShellTreeItem).treeOwner
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIXULWindow)
        .XULBrowserWindow = window.XULBrowserWindow;
    getBrowser().addProgressListener(eventManager.progressListener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);

    eventManager.prefObserver.register();

    window.addEventListener("keypress", eventManager.onKeyPress,    true);
    window.addEventListener("keydown",  eventManager.onKeyUpOrDown, true);
    window.addEventListener("keyup",    eventManager.onKeyUpOrDown, true);

    return eventManager;
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
