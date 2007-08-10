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
        vimperator.setMode(); // trick to reshow the mode in the command line
    }, false);
    tabcontainer.addEventListener("TabClose",  function(event) {
        vimperator.statusline.updateTabCount()
        vimperator.buffer.updateBufferList();
        vimperator.setMode(); // trick to reshow the mode in the command line
    }, false);
    tabcontainer.addEventListener("TabSelect", function(event) {
        vimperator.statusline.updateTabCount();
        vimperator.buffer.updateBufferList();
        vimperator.setMode(); // trick to reshow the mode in the command line
        vimperator.tabs.updateSelectionHistory();
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

    window.document.addEventListener("DOMTitleChanged", function(event)
    {
        //alert("titlechanged");
    }, null);

    // TODO: use this table also for KeyboardEvent.prototype.toString
    var keyTable = [
        [ KeyEvent.DOM_VK_ESCAPE, ["Esc", "Escape"] ], 
        [ KeyEvent.DOM_VK_LEFT_SHIFT, ["<"] ],
        [ KeyEvent.DOM_VK_RIGHT_SHIFT, [">"] ],
        [ KeyEvent.DOM_VK_RETURN, ["Return", "CR"] ],
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
            var url = vimperator.buffer.location;
            var title = vimperator.buffer.title;
            vimperator.history.add(url, title);

            // code which is only relevant if the page load is the current tab goes here:
            if (doc == getBrowser().selectedBrowser.contentDocument)
            {
                /* none yet */
                //vimperator.statusline.updateUrl();
                //logMessage("onpageLoad");
            }
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.destroy = function()
    {
        // BIG TODO: removeEventListeners() to avoid mem leaks
        window.dump("TODO: remove eventlisteners");
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
            if(!elem)
                elem = window;

            elem.dispatchEvent(evt);
        }
    }

    this.onEscape = function()
    {
        if (!vimperator.hasMode(vimperator.modes.ESCAPE_ONE_KEY))
        {
            vimperator.setMode(vimperator.modes.NORMAL);
            vimperator.echo("");
            vimperator.hints.disableHahMode();
            vimperator.focusContent();
            vimperator.statusline.updateUrl();
        }
    }

    this.onKeyPress = function(event)
    {
        var key = event.toString()
        if (!key)
             return false;
        // sometimes the non-content area has focus, making our keys not work
        //    if (event.target.id == "main-window")
        //        alert("focusContent();");


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
                    event.preventDefault();
                    // prevents additional firefox-clipboard pasting
                }
            }
            return false;
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
                    map.execute();
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
                //if (vimperator.hints.currentMode() == HINT_MODE_QUICK)
                if (vimperator.hasMode(vimperator.modes.QUICK_HINT))
                    vimperator.hints.disableHahMode();
                else // ALWAYS mode
                    vimperator.hints.resetHintedElements();
                vimperator.input.buffer = "";
            }
            //else if (res == 0 || vimperator.hints.currentMode() == HINT_MODE_EXTENDED) // key processed, part of a larger hint
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

        if (vimperator.hasMode(vimperator.modes.NORMAL))
        {
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
                if (key != "<Esc>" && key != "<C-[>")
                    vimperator.input.pendingMap.execute(null, vimperator.input.count, key);

                vimperator.input.pendingMap = null;
                vimperator.input.buffer = "";
                event.preventDefault();
                event.stopPropagation();
            }
            else if (map = vimperator.mappings.get(vimperator.modes.NORMAL, candidate_command))
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
                    map.execute(null, vimperator.input.count);
                    vimperator.input.buffer = "";
                }

                event.preventDefault();
                event.stopPropagation();
            }
            else if (vimperator.mappings.getCandidates(vimperator.modes.NORMAL, candidate_command).length > 0)
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
    //}}}
} //}}}

// this function converts the given event to
// a keycode which can be used in mappings
// e.g. pressing ctrl+n would result in the string "<C-n>"
// null if unknown key
KeyboardEvent.prototype.toString = function() //{{{
{
    var key = String.fromCharCode(this.charCode);
    var modifier = "";
    if (this.ctrlKey)
        modifier += "C-";
    if (this.altKey)
        modifier += "A-";
    if (this.metaKey)
        modifier += "M-";

    if (this.charCode == 0)
    {
        if (this.shiftKey)
            modifier += "S-";
        if (this.keyCode == KeyEvent.DOM_VK_ESCAPE)
            key = "Esc";
        else if (this.keyCode == KeyEvent.DOM_VK_LEFT_SHIFT)
            key = "<";
        else if (this.keyCode == KeyEvent.DOM_VK_RIGHT_SHIFT)
            key = ">";
        else if (this.keyCode == KeyEvent.DOM_VK_RETURN)
            key = "Return";
        else if (this.keyCode == KeyEvent.DOM_VK_TAB)
            key = "Tab";
        else if (this.keyCode == KeyEvent.DOM_VK_DELETE)
            key = "Del";
        else if (this.keyCode == KeyEvent.DOM_VK_BACK_SPACE)
            key = "BS";
        else if (this.keyCode == KeyEvent.DOM_VK_HOME)
            key = "Home";
        else if (this.keyCode == KeyEvent.DOM_VK_INSERT)
            key = "Insert";
        else if (this.keyCode == KeyEvent.DOM_VK_END)
            key = "End";
        else if (this.keyCode == KeyEvent.DOM_VK_LEFT)
            key = "Left";
        else if (this.keyCode == KeyEvent.DOM_VK_RIGHT)
            key = "Right";
        else if (this.keyCode == KeyEvent.DOM_VK_UP)
            key = "Up";
        else if (this.keyCode == KeyEvent.DOM_VK_DOWN)
            key = "Down";
        else if (this.keyCode == KeyEvent.DOM_VK_PAGE_UP)
            key = "PageUp";
        else if (this.keyCode == KeyEvent.DOM_VK_PAGE_DOWN)
            key = "PageDown";
        else if (this.keyCode == KeyEvent.DOM_VK_F1)
            key = "F1";
        else if (this.keyCode == KeyEvent.DOM_VK_F2)
            key = "F2";
        else if (this.keyCode == KeyEvent.DOM_VK_F3)
            key = "F3";
        else if (this.keyCode == KeyEvent.DOM_VK_F4)
            key = "F4";
        else if (this.keyCode == KeyEvent.DOM_VK_F5)
            key = "F5";
        else if (this.keyCode == KeyEvent.DOM_VK_F6)
            key = "F6";
        else if (this.keyCode == KeyEvent.DOM_VK_F7)
            key = "F7";
        else if (this.keyCode == KeyEvent.DOM_VK_F8)
            key = "F8";
        else if (this.keyCode == KeyEvent.DOM_VK_F9)
            key = "F9";
        else if (this.keyCode == KeyEvent.DOM_VK_F10)
            key = "F10";
        else if (this.keyCode == KeyEvent.DOM_VK_F11)
            key = "F11";
        else if (this.keyCode == KeyEvent.DOM_VK_F12)
            key = "F12";
        else if (this.keyCode == KeyEvent.DOM_VK_F13)
            key = "F13";
        else if (this.keyCode == KeyEvent.DOM_VK_F14)
            key = "F14";
        else if (this.keyCode == KeyEvent.DOM_VK_F15)
            key = "F15";
        else if (this.keyCode == KeyEvent.DOM_VK_F16)
            key = "F16";
        else if (this.keyCode == KeyEvent.DOM_VK_F17)
            key = "F17";
        else if (this.keyCode == KeyEvent.DOM_VK_F18)
            key = "F18";
        else if (this.keyCode == KeyEvent.DOM_VK_F19)
            key = "F19";
        else if (this.keyCode == KeyEvent.DOM_VK_F20)
            key = "F20";
        else if (this.keyCode == KeyEvent.DOM_VK_F21)
            key = "F21";
        else if (this.keyCode == KeyEvent.DOM_VK_F22)
            key = "F22";
        else if (this.keyCode == KeyEvent.DOM_VK_F23)
            key = "F23";
        else if (this.keyCode == KeyEvent.DOM_VK_F24)
            key = "F24";
        else
            return null;
    }

    // special handling of the Space key
    if (this.charCode == 32)
    {
        if (this.shiftKey)
            modifier += "S-";
        key = "Space";
    }

    // a normal key like a, b, c, 0, etc.
    if (this.charCode > 0)
    {
        if (modifier.length > 0 || this.charCode == 32)
            return "<" + modifier + key + ">";
        else
            return key;
    }
    else // a key like F1 is always enclosed in < and >
        return "<" + modifier + key + ">";
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
