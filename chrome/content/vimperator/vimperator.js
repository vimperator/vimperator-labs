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

// The only global object, a handler to the main Vimperator object
var vimperator = null;

var popup_allowed_events; // need to change and reset this firefox pref XXX: move to options class

// called when the chrome is fully loaded and before the main window is shown
window.addEventListener("load", init, false);

////////////////////////////////////////////////////////////////////////
// init/uninit /////////////////////////////////////////////////////////
/////////////////////////////////////////////////////////////////////{{{

function init() //{{{
{
    window.dump("Vimperator init\n");
    // init the main object
    vimperator = new Vimperator();
    vimperator.log("Initializing vimperator object...", 1);

    // these inner classes are created here, because outside the init()
    // function, the chrome:// is not ready
    vimperator.log("Loading module options...", 3);
    Vimperator.prototype.options       = new Options();
    vimperator.log("Loading module events...", 3);
    Vimperator.prototype.events        = new Events();
    vimperator.log("Loading module commands...", 3);
    Vimperator.prototype.commands      = new Commands();
    vimperator.log("Loading module bookmarks...", 3);
    Vimperator.prototype.bookmarks     = new Bookmarks();
    vimperator.log("Loading module history...", 3);
    Vimperator.prototype.history       = new History();
    vimperator.log("Loading module commandline...", 3);
    Vimperator.prototype.commandline   = new CommandLine();
    vimperator.log("Loading module search...", 3);
    Vimperator.prototype.search        = new Search();
    vimperator.log("Loading module preview window...", 3);
    Vimperator.prototype.previewwindow = new InformationList("vimperator-previewwindow", { incremental_fill: false, max_items: 10 });
    vimperator.log("Loading module buffer window...", 3);
    Vimperator.prototype.bufferwindow  = new InformationList("vimperator-bufferwindow", { incremental_fill: false, max_items: 10 });
    vimperator.log("Loading module mappings...", 3);
    Vimperator.prototype.mappings      = new Mappings();
    vimperator.log("Loading module statusline...", 3);
    Vimperator.prototype.statusline    = new StatusLine();
    vimperator.log("Loading module tabs...", 3);
    Vimperator.prototype.tabs          = new Tabs();
    vimperator.log("Loading module marks...", 3);
    Vimperator.prototype.marks         = new Marks();
    vimperator.log("Loading module quickmarks...", 3);
    Vimperator.prototype.quickmarks    = new QuickMarks();
    vimperator.log("Loading module hints...", 3);
    Vimperator.prototype.hints         = new Hints();
    vimperator.log("All modules loaded", 3);

    // DJK FIXME
    Vimperator.prototype.echo    = vimperator.commandline.echo;
    Vimperator.prototype.echoerr = vimperator.commandline.echoErr;

    // XXX: move into Vimperator() ?
    vimperator.input = {
        buffer: "",                 // partial command storage
        pendingMap: null,           // pending map storage
        count: -1                  // parsed count from the input buffer
    };

    // XXX: move elsewhere
    vimperator.registerCallback("submit", vimperator.modes.EX, function(command) { /*vimperator.*/execute(command); } );
    vimperator.registerCallback("complete", vimperator.modes.EX, function(str) { return exTabCompletion(str); } );

    // this function adds all our required listeners to react on events
    // also stuff like window.onScroll is handled there.
    //addEventListeners();
    //vimperator.events();

    // work around firefox popup blocker
    popup_allowed_events = Options.getFirefoxPref('dom.popup_allowed_events', 'change click dblclick mouseup reset submit');
    if (!popup_allowed_events.match("keypress"))
        Options.setFirefoxPref('dom.popup_allowed_events', popup_allowed_events + " keypress");

    // we have our own typeahead find implementation
    Options.setFirefoxPref('accessibility.typeaheadfind.autostart', false);
    Options.setFirefoxPref('accessibility.typeaheadfind', false); // actually the above setting should do it, but has no effect in firefox

    // first time intro message
    if (Options.getPref("firsttime", true))
    {
        setTimeout(function() {
            vimperator.help(null, null, null, { inTab: true });
            Options.setPref("firsttime", false);
        }, 1000);
    }

    gURLBar.blur();
    vimperator.focusContent();

    // firefox preferences which we need to be changed to work well with vimperator
    Options.setFirefoxPref("browser.startup.page", 3); // start with saved session

    // Finally, read a ~/.vimperatorrc
    // Make sourcing asynchronous, otherwise commands that open new tabs won't work
    setTimeout(function() {
        vimperator.source("~/.vimperatorrc", true);
        vimperator.log("~/.vimperatorrc sourced", 1);
    }, 50);

    window.addEventListener("unload",   unload, false);
    vimperator.log("Vimperator fully initialized", 1);
} //}}}

function unload() //{{{
{
    /*** save our preferences ***/
    vimperator.commandline.destroy();
    vimperator.events.destroy();
    vimperator.quickmarks.destroy();

    // reset some modified firefox prefs
    if (Options.getFirefoxPref('dom.popup_allowed_events', 'change click dblclick mouseup reset submit')
            == popup_allowed_events + " keypress")
        Options.setFirefoxPref('dom.popup_allowed_events', popup_allowed_events);
} //}}}
//}}}

function Vimperator() //{{{
{
	////////////////////////////////////////////////////////////////////////////////
	////////////////////// PRIVATE SECTION /////////////////////////////////////////
	/////////////////////////////////////////////////////////////////////////////{{{

    this.modes = { // actually not private, but Firefox complains if this doesn't come first
        // main modes
        NONE:             0,
        NORMAL:           1 << 0,
        INSERT:           1 << 1,
        VISUAL:           1 << 2,
        HINTS:            1 << 3,
        COMMAND_LINE:     1 << 4,
        // extended modes
        EX:               1 << 10,
        READ_MULTLINE:    1 << 11,
        SEARCH_FORWARD:   1 << 12,
        SEARCH_BACKWARD:  1 << 13,
        ESCAPE_ONE_KEY:   1 << 14,
        ESCAPE_ALL_KEYS:  1 << 15,
        QUICK_HINT:       1 << 16,
        EXTENDED_HINT:    1 << 17,
        ALWAYS_HINT:      1 << 18
    }
    var mode_messages = {};
    mode_messages[this.modes.NORMAL]          = "";
    mode_messages[this.modes.INSERT]          = "INSERT";
    mode_messages[this.modes.VISUAL]          = "VISUAL";
    mode_messages[this.modes.HINTS]           = "HINTS";
    mode_messages[this.modes.ESCAPE_ONE_KEY]  = "escape one key";
    mode_messages[this.modes.ESCAPE_ALL_KEYS] = "escape all keys";
    mode_messages[this.modes.ESCAPE_ONE_KEY | this.modes.ESCAPE_ALL_KEYS] = "pass one key";
    mode_messages[this.modes.QUICK_HINT]      = "quick";
    mode_messages[this.modes.EXTENDED_HINT]   = "extended";
    mode_messages[this.modes.ALWAYS_HINT]     = "always";

	var callbacks = new Array();
    var mode = this.modes.NORMAL;
    var extended_mode = this.modes.NONE;
    var count = -1;
    var inputbuffer = "";

    // our services
    var console_service = Components.classes['@mozilla.org/consoleservice;1']
        .getService(Components.interfaces.nsIConsoleService);

    function showMode()
    {
        if (!vimperator.options["showmode"])
            return;

        var str_mode = mode_messages[mode];
        var str_extended = mode_messages[extended_mode];
        if(!str_mode && !str_extended)
        {
            vimperator.echo("");
            return;
        }

        if(str_mode && str_extended)
            str_extended = " (" + str_extended + ")";
        else
        {
            str_extended = "(" + str_extended + ")";
            str_mode = "";
        }

        vimperator.echo("-- " + str_mode + str_extended + " --");
    }

	/////////////////////////////////////////////////////////////////////////////}}}
	////////////////////// PUBLIC SECTION //////////////////////////////////////////
	/////////////////////////////////////////////////////////////////////////////{{{

    this.version  = "###VERSION### CVS (created: ###DATE###)";

    /////////////// callbacks ////////////////////////////
    // XXX: shouldn't that callback be moved to commandline? --mst
	/**
     * @param type Can be:
     *  "submit": when the user pressed enter in the command line
     *  "change"
     *  "cancel"
     *  "complete"
     */
	this.registerCallback = function(type, mode, func)
	{
		// TODO: check if callback is already registered
		callbacks.push([type, mode, func]);
	}
	this.triggerCallback = function(type, data)
	{
		for (var i in callbacks)
		{
			var [thistype, thismode, thisfunc] = callbacks[i];
			if (vimperator.hasMode(thismode) && type == thistype)
				return thisfunc.call(this, data);
		}
		return false;
	}

    // just forward these echo commands
    // DJK FIXME: this.echo = this.commandline.echo;
    // DJK FIXME: this.echoerr = this.commandline.echoErr;


    this.getMode = function()
    {
        return [mode, extended_mode];
    }

    // set current mode
    // use "null" if you only want to set one of those modes
    this.setMode = function(main, extended, silent)
    {
        // if a main mode is set, the extended is always cleared
        if (main)
        {
            mode = main;
            extended_mode = this.modes.NONE;
        }
        if (typeof extended === "number")
            extended_mode = extended;

        if (!silent)
            showMode();
    }
    // returns true if "whichmode" is found in either the main or
    // extended mode
    this.hasMode = function(whichmode)
    {
        return ((mode & whichmode) || (extended_mode & whichmode) > 0) ? true : false;
    }
    this.addMode = function(main, extended)
    {
        if (main)
            mode |= main;
        if (extended)
            extended_mode |= extended;

        showMode();
    }
    // always show the new mode in the statusline
    this.removeMode = function(main, extended)
    {
        if (main)
            mode = (mode | main) ^ main;
        if (extended)
            extended_mode = (extended_mode | extended) ^ extended;

        showMode();
    }

    // After pressing Escape, put focus on a non-input field of the browser document
    this.focusContent = function()
    {
        var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"].
                 getService(Components.interfaces.nsIWindowWatcher);

        if (window == ww.activeWindow && document.commandDispatcher.focusedElement)
            document.commandDispatcher.focusedElement.blur();

        content.focus();
    }

    /**
     * logs any object to the javascript error console
     * also prints all properties of thie object
     */
    this.log = function(msg, level)
    {
        // if(Options.getPref("verbose") >= level) // FIXME: hangs vimperator, probably timing issue --mst
            console_service.logStringMessage('vimperator: ' + msg);
    }

    /**
     * logs any object to the javascript error console
     * also prints all properties of the object
     */
    this.logObject = function(object, level)
    {
        if (typeof object != 'object')
            return false;

        var string = object + '::\n';
        for (var i in object)
        {
            var value;
            try {
                var value = object[i];
            } catch (e) { value = '' }

            string += i + ': ' + value + '\n';
        }
        this.log(string, level);
    }
    //}}}
} //}}}

function Events() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// CONSTRUCTOR /////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // this handler is for middle click only in the content
    //window.addEventListener("mousedown", onVimperatorKeypress, true);
    //content.mPanelContainer.addEventListener("mousedown", onVimperatorKeypress, true);
    //document.getElementById("content").onclick = function(event) { alert("foo"); };

    // any tab related events
    var tabcontainer = getBrowser().tabContainer;
    tabcontainer.addEventListener("TabMove",   function(event) {
        vimperator.statusline.updateTabCount()
        vimperator.tabs.updateBufferList();
    }, false);
    tabcontainer.addEventListener("TabOpen",   function(event) {
        vimperator.statusline.updateTabCount();
        vimperator.tabs.updateBufferList();
        vimperator.setMode(); // trick to reshow the mode in the command line
    }, false);
    tabcontainer.addEventListener("TabClose",  function(event) {
        vimperator.statusline.updateTabCount()
        vimperator.tabs.updateBufferList();
        vimperator.setMode(); // trick to reshow the mode in the command line
    }, false);
    tabcontainer.addEventListener("TabSelect", function(event) {
        vimperator.statusline.updateTabCount();
        vimperator.tabs.updateBufferList();
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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

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
            vimperator.tabs.updateBufferList();

            //update history
            var url = getCurrentLocation();
            var title = getCurrentTitle(); // not perfect "- Vimperator" in the title
            vimperator.history.add(url, title);

            // code which is only relevant if the page load is the current tab goes here:
            if(doc == getBrowser().selectedBrowser.contentDocument)
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
    };

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
    };


    this.onKeyPress = function(event)
    {
//        alert(event)
//        if (event.type != "keypress")
//            return false;
//        vimperator.logObject(event);
        var key = event.toString()
//        alert(key);
        if (!key)
             return false;
//        event.stopPropagation();
//        event.preventDefault();
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

                if(elt.setSelectionRange && readFromClipboard())
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
            if(vimperator.hasMode(vimperator.modes.ESCAPE_ONE_KEY))
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
                if(map.always_active || vimperator.hints.currentState() == 1)
                {
                    //g_hint_mappings[i][1].call(this, event);
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
                //if(vimperator.hints.currentMode() == HINT_MODE_QUICK)
                if(vimperator.hasMode(vimperator.modes.QUICK_HINT))
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

                //if(vimperator.hints.currentMode() == HINT_MODE_QUICK)
                if(vimperator.hasMode(vimperator.modes.QUICK_HINT))
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
    };
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
            if(flags & (Components.interfaces.nsIWebProgressListener.STATE_IS_DOCUMENT |
                        Components.interfaces.nsIWebProgressListener.STATE_IS_WINDOW))
            {
                // This fires when the load event is initiated
                if(flags & Components.interfaces.nsIWebProgressListener.STATE_START)
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
            if(aState & nsIWebProgressListener.STATE_IS_INSECURE)
                vimperator.statusline.setClass("insecure");
            else if(aState & nsIWebProgressListener.STATE_IS_BROKEN)
                vimperator.statusline.setClass("broken");
            else if(aState & nsIWebProgressListener.STATE_IS_SECURE)
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

/** provides functions for working with tabs
 * XXX: ATTENTION: We are planning to move to the FUEL API once we switch to
 * Firefox 3.0, then this class should go away and their tab methods should be used
 * @deprecated
 */
function Tabs() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    /** @param spec can either be:
     * - an absolute integer
     * - "" for the current tab
     * - "+1" for the next tab
     * - "-3" for the tab, which is 3 positions left of the current
     * - "$" for the last tab
     */
    function indexFromSpec(spec, wrap)
    {
        var position = getBrowser().tabContainer.selectedIndex;
        var length   = getBrowser().mTabs.length;
        var last     = length - 1;

        if (spec === undefined || spec === "")
            return position;

        if (typeof spec === "number")
            position = spec;
        else if (spec === "$")
            return last;
        else if (!spec.match(/^([+-]?\d+|)$/))
        {
            // TODO: move error reporting to ex-command?
            vimperator.echoerr("E488: Trailing characters");
            return false;
        }
        else
        {
            if (spec.match(/^([+-]\d+)$/)) // relative position +/-N
                position += parseInt(spec);
            else                           // absolute position
                position = parseInt(spec);
        }

        if (position > last)
            position = wrap ? position % length : last;
        else if (position < 0)
            position = wrap ? (position % length) + length: 0;

        return position;
    }

    var alternates = [null, null];

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    // @returns the index of the currently selected tab starting with 0
    this.index = function(tab)
    {
        if (tab)
        {
            var length = getBrowser().mTabs.length;
            for (var i = 0; i < length; i++)
            {
                if (getBrowser().mTabs[i] == tab)
                    return i;
            }
            return -1;
        }

        return getBrowser().tabContainer.selectedIndex;
    }

    this.count = function()
    {
        return getBrowser().mTabs.length;
    }

    // TODO: implement filter
    // @returns an array of tabs which match filter
    this.get = function(filter)
    {
        var buffers = [];
        var browsers = getBrowser().browsers;
        for (var i in browsers)
        {
            var title = browsers[i].contentTitle || "(Untitled)";
            var uri = browsers[i].currentURI.spec;
            var number = i + 1;
            buffers.push([number, title, uri]);
        }
        return buffers;
    }

    this.getTab = function(index)
    {
        if (index)
            return getBrowser().mTabs[index];

        return getBrowser().tabContainer.selectedItem;
    }

    /*  spec == "" moves the tab to the last position as per Vim
     *  wrap causes the movement to wrap around the start and end of the tab list
     *  NOTE: position is a 0 based index
     *  FIXME: tabmove! N should probably produce an error
     */
    this.move = function(tab, spec, wrap)
    {
        if (spec === "")
            spec = "$"; // if not specified, move to the last tab -> XXX: move to ex handling?

        var index = indexFromSpec(spec, false); // XXX: really no wrap?
        getBrowser().moveTabTo(tab, index);
    }

    /* quit_on_last_tab = 1: quit without saving session
     * quit_on_last_tab = 2: quit and save session
     */
    this.remove = function(tab, count, focus_left_tab, quit_on_last_tab)
    {
        if (count < 1) count = 1;

        if (quit_on_last_tab >= 1 && getBrowser().mTabs.length <= count)
            vimperator.quit(quit_on_last_tab == 2);

        if(focus_left_tab && tab.previousSibling)
            this.select("-1", false);

        getBrowser().removeTab(tab);
    }

    this.keepOnly = function(tab)
    {
        getBrowser().removeAllTabsBut(tab);
    }

    this.select = function(spec, wrap)
    {
        var index = indexFromSpec(spec, wrap);
        if (index === false)
        {
            vimperator.beep(); // XXX: move to ex-handling?
            return false;
        }
        getBrowser().mTabContainer.selectedIndex = index;
    }

    // TODO: when restarting a session FF selects the first tab and then the
    // tab that was selected when the session was created.  As a result the
    // alternate after a restart is often incorrectly tab 1 when there
    // shouldn't be one yet.
    this.updateSelectionHistory = function()
    {
        alternates = [this.getTab(), alternates[0]];
        this.alternate = alternates[1];
    }

    this.alternate = this.getTab();

    // updates the buffer preview in place only if list is visible
    this.updateBufferList = function()
    {
        if (!vimperator.bufferwindow.visible())
            return false;

        var items = get_buffer_completions("");
        vimperator.bufferwindow.show(items);
        vimperator.bufferwindow.selectItem(getBrowser().mTabContainer.selectedIndex);
    }

    this.reload = function(tab, bypass_cache)
    {
        if (bypass_cache)
        {
            const nsIWebNavigation = Components.interfaces.nsIWebNavigation;
            const flags = nsIWebNavigation.LOAD_FLAGS_BYPASS_PROXY | nsIWebNavigation.LOAD_FLAGS_BYPASS_CACHE;
            getBrowser().getBrowserForTab(tab).reloadWithFlags(flags);
        }
        else
        {
            getBrowser().reloadTab(tab);
        }
    }

    this.reloadAll = function(bypass_cache)
    {
        if (bypass_cache)
        {
            for (var i = 0; i < getBrowser().mTabs.length; i++)
            {
                try
                {
                    this.reload(getBrowser().mTabs[i], bypass_cache)
                }
                catch (e) {
                    // FIXME: can we do anything useful here without stopping the
                    //        other tabs from reloading?
                }
            }
        }
        else
        {
            getBrowser().reloadAllTabs();
        }
    }
    //}}}
} //}}}

////////////////////////////////////////////////////////////////////////
// DOM related helper functions ////////////////////////////////////////
/////////////////////////////////////////////////////////////////////{{{
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
//}}}

// vim: set fdm=marker sw=4 ts=4 et:
