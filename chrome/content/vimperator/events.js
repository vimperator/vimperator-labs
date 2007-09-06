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

function Events() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // this handler is for middle click only in the content
    //window.addEventListener("mousedown", onVimperatorKeypress, true);
    //content.mPanelContainer.addEventListener("mousedown", onVimperatorKeypress, true);
    //document.getElementById("content").onclick = function(event) { alert("foo"); };

    // any tab related events
    var tabcontainer = getBrowser().tabContainer;
    tabcontainer.addEventListener("TabMove",   function(event) {
        vimperator.statusline.updateTabCount()
        vimperator.buffer.updateBufferList();
    }, false);
    tabcontainer.addEventListener("TabOpen",   function(event) {
        vimperator.statusline.updateTabCount();
        vimperator.buffer.updateBufferList();
        //vimperator.setMode(); // trick to reshow the mode in the command line
    }, false);
    tabcontainer.addEventListener("TabClose",  function(event) {
        vimperator.statusline.updateTabCount()
        vimperator.buffer.updateBufferList();
        //vimperator.setMode(); // trick to reshow the mode in the command line
    }, false);
    tabcontainer.addEventListener("TabSelect", function(event) {
        vimperator.statusline.updateTabCount();
        vimperator.buffer.updateBufferList();
        //vimperator.setMode(); // trick to reshow the mode in the command line
        vimperator.tabs.updateSelectionHistory();
        setTimeout(vimperator.focusContent, 10); // just make sure, that no widget has focus
    }, false);

    // this adds an event which is is called on each page load, even if the
    // page is loaded in a background tab
    getBrowser().addEventListener("load", onPageLoad, true);

    // called when the active document is scrolled
    getBrowser().addEventListener("scroll", function (event)
    {
        vimperator.statusline.updateBufferPosition();
        vimperator.setMode(); // trick to reshow the mode in the command line
    }, null);

    //
    // track if a popup is open or the menubar is active
    //

    var active_menubar = false;

    function enterPopupMode(event)
    {
        if (event.originalTarget.localName == "tooltip" || event.originalTarget.id == "vimperator-visualbell")
            return;

        vimperator.addMode(null, vimperator.modes.MENU);
    }

    function exitPopupMode()
    {
        // gContextMenu is set to NULL by firefox, when a context menu is closed
        if (!gContextMenu && !active_menubar)
            vimperator.removeMode(null, vimperator.modes.MENU);
    }

    function enterMenuMode()
    {
        active_menubar = true;
        vimperator.addMode(null, vimperator.modes.MENU)
    }

    function exitMenuMode()
    {
        active_menubar = false;
        vimperator.removeMode(null, vimperator.modes.MENU);
    }

    window.addEventListener("popupshown", enterPopupMode, true);
    window.addEventListener("popuphidden", exitPopupMode, true);
    window.addEventListener("DOMMenuBarActive", enterMenuMode, true);
    window.addEventListener("DOMMenuBarInactive", exitMenuMode, true);

    window.document.addEventListener("DOMTitleChanged", function(event)
    {
        //alert("titlechanged");
    }, null);

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
        [ KeyEvent.DOM_VK_F24, ["F24"] ],
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

            if ( (tagname == "input" && (type != "image")) ||
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
            vimperator.buffer.updateBufferList();

            //update history
            var url = vimperator.buffer.URL;
            var title = vimperator.buffer.title;
            vimperator.history.add(url, title);

            // code which is only relevant if the page load is the current tab goes here:
            if (doc == getBrowser().selectedBrowser.contentDocument)
            {
                // we want to stay in command mode after a page has loaded
                // TODO: remember the last focused input widget, so we can go there with 'gi'
                setTimeout(vimperator.focusContent, 10);
            }
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.destroy = function()
    {
        // BIG TODO: removeEventListeners() to avoid mem leaks
        window.dump("TODO: remove all eventlisteners");

        getBrowser().removeProgressListener(this.progressListener);

        window.removeEventListener("popupshown", enterPopupMode(), true);
        window.removeEventListener("popuphidden", exitPopupMode(), true);
        window.removeEventListener("DOMMenuBarActive", enterMenuMode(), true);
        window.removeEventListener("DOMMenuBarInactive", exitMenuMode(), true);
    }

    // This method pushes keys into the event queue from vimperator
    // it is similar to vim's feedkeys() method, but cannot cope with
    // 2 partially feeded strings, you have to feed one parsable string
    //
    // @param keys: a string like "2<C-f>" to pass
    //              if you want < to be taken literally, prepend it with a \\
    this.feedkeys = function(keys)
    {
        var doc = window.content.document;
        var view = window.document.defaultView;
        var escapeKey = false; // \ to escape some special keys

        for (var i = 0; i < keys.length; i++)
        {
            var charCode = keys.charCodeAt(i);
            var keyCode = 0;
            var shift = false, ctrl = false, alt = false, meta = false;
            //if (charCode == 92) // the '\' key FIXME: support the escape key
            if (charCode == 60 && !escapeKey) // the '<' key starts a complex key
            {
                var matches = keys.substr(i+1).match(/([CSMAcsma]-)*([^>]+)/);
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
                    else //an invalid key like <A-xxx> was found, stop propagation here (like vim)
                        return;

                    i += matches[0].length + 1;
                }
            }
            var evt = doc.createEvent('KeyEvents');
            evt.initKeyEvent('keypress', true, true, view, ctrl, alt, shift, meta, keyCode, charCode );

            var elem = window.document.commandDispatcher.focusedElement;
            if (!elem)
                elem = window;

            elem.dispatchEvent(evt);
        }
    }

    // this function converts the given event to
    // a keycode which can be used in mappings
    // e.g. pressing ctrl+n would result in the string "<C-n>"
    // null if unknown key
    this.toString = function(event) //{{{
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

        if (key == null)
            return null;

        // a key like F1 is always enclosed in < and >
        return "<" + modifier + key + ">";
    } //}}}

    this.isAcceptKey = function(key)
    {
        return (key == "<Return>" || key == "<C-j>" || key == "<C-m>");
    }
    this.isCancelKey = function(key)
    {
        return (key == "<Esc>" || key == "<C-[>" || key == "<C-c>");
    }

    this.onEscape = function()
    {
        if (!vimperator.hasMode(vimperator.modes.ESCAPE_ONE_KEY))
        {
            // setting this option will trigger an observer which will care about all other details
            if (vimperator.hasMode(vimperator.modes.CARET))
                Options.setFirefoxPref("accessibility.browsewithcaret", false);

            // clear any selection made
            var selection = window.content.getSelection();
            selection.collapseToStart();

            vimperator.setMode(vimperator.modes.NORMAL);
            vimperator.commandline.clear();
            vimperator.hints.disableHahMode();
            vimperator.statusline.updateUrl();
            vimperator.focusContent();
        }
    }

    this.onKeyPress = function(event)
    {
        var key = vimperator.events.toString(event);
        if (!key)
             return false;
        // sometimes the non-content area has focus, making our keys not work
        //    if (event.target.id == "main-window")
        //        alert("focusContent();");

        if (vimperator.hasMode(vimperator.modes.MENU))
            return false;

        // XXX: ugly hack for now pass certain keys to firefox as they are without beeping
        // also fixes key navigation in menus, etc.
        if (key == "<Tab>" || key == "<Return>" || key == "<Space>" || key == "<Up>" || key == "<Down>")
            return false;


        // XXX: for now only, later: input mappings if form element focused
        if (isFormElemFocused())
        {
            if (key == "<S-Insert>")
            {
                var elt = window.document.commandDispatcher.focusedElement;

                if (elt.setSelectionRange && readFromClipboard())
                    // readFromClipboard would return 'undefined' if not checked
                    // dunno about .setSelectionRange
                {
                    var rangeStart = elt.selectionStart; // caret position
                    var rangeEnd = elt.selectionEnd;
                    var tempStr1 = elt.value.substring(0,rangeStart);
                    var tempStr2 = readFromClipboard();
                    var tempStr3 = elt.value.substring(rangeEnd);
                    elt.value = tempStr1 + tempStr2  + tempStr3;
                    elt.selectionStart = rangeStart + tempStr2.length;
                    elt.selectionEnd = elt.selectionStart;
                    // prevent additional firefox-clipboard pasting
                    event.preventDefault();
                }
            }
            return false;
            //vimperator.setMode(vimperator.modes.CARET); // FOR TESTING ONLY
        }

        // handle Escape-one-key mode (Ctrl-v)
        if (vimperator.hasMode(vimperator.modes.ESCAPE_ONE_KEY) && !vimperator.hasMode(vimperator.modes.ESCAPE_ALL_KEYS))
        {
            vimperator.removeMode(null, vimperator.modes.ESCAPE_ONE_KEY);
            return false;
        }
        // handle Escape-all-keys mode (I)
        if (vimperator.hasMode(vimperator.modes.ESCAPE_ALL_KEYS))
        {
            if (vimperator.hasMode(vimperator.modes.ESCAPE_ONE_KEY))
                vimperator.removeMode(null, vimperator.modes.ESCAPE_ONE_KEY); // and then let flow continue
            else if (key == "<Esc>" || key == "<C-[>" || key == "<C-v>")
                ; // let flow continue to handle these keys
            else
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
        // FIXME: total mess
        if (vimperator.hasMode(vimperator.modes.HINTS))
        {
            // never propagate this key to firefox, when hints are visible
            event.preventDefault();
            event.stopPropagation();

            var map = vimperator.mappings.get(vimperator.modes.HINTS, key);
            if (map)
            {
                if (map.always_active || vimperator.hints.currentState() == 1)
                {
                    map.execute(null, vimperator.input.count);
                    if (map.cancel_mode) // stop processing this event
                    {
                        vimperator.hints.disableHahMode();
                        vimperator.input.buffer = "";
                        vimperator.statusline.updateInputBuffer("");
                        return false;
                    }
                    else
                    {
                        // FIXME: make sure that YOU update the statusbar message yourself
                        // first in g_hint_mappings when in this mode!
                        vimperator.statusline.updateInputBuffer(vimperator.input.buffer);
                        return false;
                    }
                }
            }

            // no mapping found, beep()
            if (vimperator.hints.currentState() == 1)
            {
                vimperator.beep();
                vimperator.hints.disableHahMode();
                vimperator.input.buffer = "";
                vimperator.statusline.updateInputBuffer(vimperator.input.buffer);
                return true;
            }

            // if we came here, let hit-a-hint process the key as it is part
            // of a partial link
            var res = vimperator.hints.processEvent(event);
            if (res < 0) // error occured processing this key
            {
                vimperator.beep();
                if (vimperator.hasMode(vimperator.modes.QUICK_HINT))
                    vimperator.hints.disableHahMode();
                else // ALWAYS mode
                    vimperator.hints.resetHintedElements();
                vimperator.input.buffer = "";
            }
            else if (res == 0 || vimperator.hasMode(vimperator.modes.EXTENDED_HINT)) // key processed, part of a larger hint
                vimperator.input.buffer += key;
            else // this key completed a quick hint
            {
                // if the hint is all in UPPERCASE, open it in new tab
                vimperator.input.buffer += key;
                if (/[A-Za-z]/.test(vimperator.input.buffer) && vimperator.input.buffer.toUpperCase() == vimperator.input.buffer)
                    vimperator.hints.openHints(true, false);
                else // open in current window
                    vimperator.hints.openHints(false, false);

                //if (vimperator.hints.currentMode() == HINT_MODE_QUICK)
                if (vimperator.hasMode(vimperator.modes.QUICK_HINT))
                    vimperator.hints.disableHahMode();
                else // ALWAYS mode
                    vimperator.hints.resetHintedElements();

                vimperator.input.buffer = "";
            }

            vimperator.statusline.updateInputBuffer(vimperator.input.buffer);
            return true;
        }


        var [mode, extended_mode] = vimperator.getMode();
        var count_str = vimperator.input.buffer.match(/^[0-9]*/)[0];
        var candidate_command = (vimperator.input.buffer + key).replace(count_str, '');
        var map;

        // counts must be at the start of a complete mapping (10j -> go 10 lines down)
        if ((vimperator.input.buffer + key).match(/^[1-9][0-9]*$/))
        {
            vimperator.input.buffer += key;
            vimperator.statusline.updateInputBuffer(vimperator.input.buffer);
            return true;
        }

        if (vimperator.input.pendingMap)
        {
            vimperator.input.buffer = "";

            if (key != "<Esc>" && key != "<C-[>")
                vimperator.input.pendingMap.execute(null, vimperator.input.count, key);

            vimperator.input.pendingMap = null;
            event.preventDefault();
            event.stopPropagation();
        }
        else if (map = vimperator.mappings.get(mode, candidate_command))
        {
            vimperator.input.count = parseInt(count_str, 10);
            if (isNaN(vimperator.input.count))
                vimperator.input.count = -1;
            if (map.flags & Mappings.flags.ARGUMENT)
            {
                vimperator.input.pendingMap = map;
                vimperator.input.buffer += key;
            }
            else
            {
                vimperator.input.buffer = "";
                map.execute(null, vimperator.input.count);
            }

            event.preventDefault();
            event.stopPropagation();
        }
        else if (vimperator.mappings.getCandidates(mode, candidate_command).length > 0)
        {
            vimperator.input.buffer += key;
            event.preventDefault();
            event.stopPropagation();
        }
        else
        {
            vimperator.input.buffer = "";
            vimperator.input.pendingMap = null;
            vimperator.beep();
        }

        vimperator.statusline.updateInputBuffer(vimperator.input.buffer);
        return false;
    }
    window.addEventListener("keypress", this.onKeyPress, true);

    this.progressListener =
    {
        QueryInterface: function(aIID)
        {
            if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
                    aIID.equals(Components.interfaces.nsIXULBrowserWindow) || // for setOverLink();
                    aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
                    aIID.equals(Components.interfaces.nsISupports))
                return this;
            throw Components.results.NS_NOINTERFACE;
        },

        // XXX: function may later be needed to detect a canceled synchronous openURL()
        onStateChange: function(webProgress, aRequest, flags, aStatus)
        {
            // STATE_IS_DOCUMENT | STATE_IS_WINDOW is important, because we also
            // receive statechange events for loading images and other parts of the web page
            if (flags & (Components.interfaces.nsIWebProgressListener.STATE_IS_DOCUMENT |
                        Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW))
            {
                // This fires when the load event is initiated
                if (flags & Components.interfaces.nsIWebProgressListener.STATE_START)
                {
                    vimperator.statusline.updateProgress(0);
                }
                else if (flags & Components.interfaces.nsIWebProgressListener.STATE_STOP)
                    ;// vimperator.statusline.updateUrl();
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
        onStatusChange: function(webProgress, request, status, message)
        {
            vimperator.statusline.updateUrl(message);
        },
        onProgressChange: function(webProgress, request, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress)
        {
            vimperator.statusline.updateProgress(curTotalProgress/maxTotalProgress);
        },
        // happens when the users switches tabs
        onLocationChange: function()
        {
            // if (vimperator.hasMode(vimperator.modes.HINTS) && !vimperator.hasMode(vimperator.modes.ALWAYS_HINT))
            //     vimperator.hints.disableHahMode();

            vimperator.statusline.updateUrl();
            vimperator.statusline.updateProgress();

            // if this is not delayed we get the wrong position of the old buffer
            setTimeout(function() { vimperator.statusline.updateBufferPosition(); }, 100);
        },
        // called at the very end of a page load
        asyncUpdateUI: function()
        {
            setTimeout(vimperator.statusline.updateUrl, 100);
        },
        setOverLink : function(link, b)
        {
            var ssli = vimperator.options["showstatuslinks"];
            if (link && ssli)
            {
                if (ssli == 1)
                    vimperator.statusline.updateUrl("Link: " + link);
                else if (ssli == 2)
                    vimperator.echo("Link: " + link);
            }

            if (link == "")
            {
                if (ssli == 1)
                    vimperator.statusline.updateUrl();
                else if (ssli == 2)
                    vimperator.setMode(); // trick to reshow the mode in the command line
            }
        },

        // stub functions for the interfaces
        setJSStatus : function(status) { ; },
        setJSDefaultStatus : function(status) { ; },
        setDefaultStatus : function(status) { ; },
        onLinkIconAvailable: function() { ; }
    };

    window.XULBrowserWindow = this.progressListener;
    window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIWebNavigation)
        .QueryInterface(Components.interfaces.nsIDocShellTreeItem).treeOwner
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIXULWindow)
        .XULBrowserWindow = window.XULBrowserWindow;
    getBrowser().addProgressListener(this.progressListener, Components.interfaces.nsIWebProgress.NOTIFY_ALL);


    this.prefObserver =
    {
        register: function()
        {
            var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                  .getService(Components.interfaces.nsIPrefService);
              this._branch = prefService.getBranch(""); // better way to monitor all changes?
              this._branch.QueryInterface(Components.interfaces.nsIPrefBranch2);
              this._branch.addObserver("", this, false);
        },

        unregister: function()
        {
            if(!this._branch) return;
            this._branch.removeObserver("", this);
        },

        observe: function(aSubject, aTopic, aData)
        {
            if(aTopic != "nsPref:changed") return;
            // aSubject is the nsIPrefBranch we're observing (after appropriate QI)
            // aData is the name of the pref that's been changed (relative to aSubject)
            switch (aData)
            {
                case "accessibility.browsewithcaret":
                    var value = Options.getFirefoxPref("accessibility.browsewithcaret", false);
                    vimperator.setMode(value ? vimperator.modes.CARET : vimperator.modes.NORMAL, null);
                    break;
            }
         }
    }
    this.prefObserver.register();

    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
