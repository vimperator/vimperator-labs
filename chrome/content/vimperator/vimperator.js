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

var popup_allowed_events; // need to change and reset this firefox pref

var g_inputbuffer = "";  // here we store partial commands (e.g. 'g' if you want to type 'gg')
var g_count = -1;        // the parsed integer of g_inputbuffer, or -1 if no count was given

// handles multi-line commands
var prev_match = new Array(5);
var heredoc = '';

// handles to our gui elements
var command_line = null;

// FIXME: if I rename this to another class name, it doesn't work, find the reason
function nsBrowserStatusHandler() /*{{{*/
{
    this.init();
}
nsBrowserStatusHandler.prototype =
{
    QueryInterface : function(aIID)
    {
        if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
                aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
                aIID.equals(Components.interfaces.nsIXULBrowserWindow) ||
                aIID.equals(Components.interfaces.nsISupports))
            return this;
        throw Components.results.NS_NOINTERFACE;
    },

    init : function()
    {
    },

    setOverLink : function(link, b)
    {
        var ssli = get_pref("showstatuslinks");
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
            {
                //vimperator.echo("");
                vimperator.setMode(); // trick to reshow the mode in the command line
            }
        }
    },
    setJSStatus : function(status) { },
    setJSDefaultStatus : function(status) { },
    setDefaultStatus : function(status) { },


    onStateChange:function(aProgress,aRequest,aFlag,aStatus)
    {
        const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
        //const nsIChannel = Components.interfaces.nsIChannel;
        if (aFlag & nsIWebProgressListener.STATE_START && aRequest && aRequest.URI)
        {
            vimperator.statusline.updateProgress(0);
        }
        // this is called when all loading was done (or when the user canceled the load
        else if (aFlag & nsIWebProgressListener.STATE_STOP)
        {
            //alert('stop: ' + aRequest.URI.spec);
            vimperator.statusline.updateUrl(aRequest.URI.spec);
            vimperator.statusline.updateProgress("");
            // also reset the buffer list, since the url titles are valid here
            updateBufferList();
        }
        return 0;
    },
    onLocationChange:function (aWebProgress, aRequest, aLocation)
        {
            // firefox 3.0 doesn't seem to have this function anymore
            if (typeof UpdateBackForwardButtons == "function")
                UpdateBackForwardButtons();

            var url = aLocation.spec;

            // also update the original firefox location bar
            if (gURLBar)
                gURLBar.value = url;

            // onLocationChange is also called when switching/deleting tabs
            //if (hah.currentMode() != HINT_MODE_ALWAYS)
            if (vimperator.hasMode(vimperator.modes.HINTS) && !vimperator.hasMode(vimperator.modes.ALWAYS_HINT))
                hah.disableHahMode();
            
            vimperator.statusline.updateUrl(url);
            vimperator.statusline.updateProgress();
            setTimeout(function() { vimperator.statusline.updateBufferPosition(); }, 100); // if not delayed we get the wrong position of the old buffer

            // updating history cache is not done here but in the 'pageshow' event
            // handler, because at this point I don't have access to the url title
            return 0;
        },
    onProgressChange:function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
        {
            vimperator.statusline.updateProgress(aCurTotalProgress/aMaxTotalProgress);
            return 0;
        },
    onStatusChange:function (aWebProgress, aRequest, aStatus, aMessage)
        {
            //alert('change');
            vimperator.statusline.updateUrl(aMessage);
            return 0;
        },
    onSecurityChange:function (aWebProgress, aRequest, aState)
        {
            const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
            if(aState & nsIWebProgressListener.STATE_IS_INSECURE)
                vimperator.statusline.setClass("insecure");
            else if(aState & nsIWebProgressListener.STATE_IS_BROKEN)
                vimperator.statusline.setClass("broken");
            else if(aState & nsIWebProgressListener.STATE_IS_SECURE)
                vimperator.statusline.setClass("secure");

            return 0;
        }
    //onLinkIconAvailable:function(a){}

};/*}}}*/

// called when the chrome is fully loaded and before the main window is shown
window.addEventListener("load", init, false);

////////////////////////////////////////////////////////////////////////
// init/uninit //////////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function init()
{
    // init the main object
    vimperator = new Vimperator;
    
    // these inner classes are created here, because outside the init()
    // function, the chrome:// is not ready
    Vimperator.prototype.commands      = new Commands;
    Vimperator.prototype.bookmarks     = new Bookmarks;
    Vimperator.prototype.history       = new History;
    Vimperator.prototype.qm            = new QM;
//    Vimperator.prototype.commandline   = new CommandLine;
    Vimperator.prototype.search        = new Search;
    Vimperator.prototype.previewwindow = new InformationList("vimperator-previewwindow", { incremental_fill: false, max_items: 10 });
    Vimperator.prototype.bufferwindow  = new InformationList("vimperator-bufferwindow", { incremental_fill: false, max_items: 10 });
    Vimperator.prototype.statusline    = new StatusLine();
    Vimperator.prototype.tabs          = new Tabs();

    // XXX: move elsewhere
    vimperator.registerCallback("submit", vimperator.modes.EX, function(command) { /*vimperator.*/execute(command); } );
    vimperator.registerCallback("complete", vimperator.modes.EX, function(str) { return exTabCompletion(str); } );
    //vimperator.registerCallback("complete", vimperator.modes.EX, function(str) { return moo();; } );

    //status_line = document.getElementById("vim-statusbar");
    command_line = document.getElementById("vimperator-commandline");

    // Setup our main status handler - from browser.js
    // this function reacts to status bar and url changes which are sent from the mozilla core
    window.XULBrowserWindow = new vimperator.browserStatusHandler;

    window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIWebNavigation)
        .QueryInterface(Components.interfaces.nsIDocShellTreeItem).treeOwner
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIXULWindow)
        .XULBrowserWindow = window.XULBrowserWindow;

    var interfaceRequestor = QueryInterface(Components.interfaces.nsIInterfaceRequestor);
//    var webProgress = interfaceRequestor.getInterface(Components.interfaces.nsIWebProgress);
//    webProgress.addProgressListener(window.XULBrowserWindow, Components.interfaces.nsIWebProgress.NOTIFY_ALL);




    // this function adds all our required listeners to react on events
    // also stuff like window.onScroll is handled there.
    addEventListeners();

    set_showtabline(get_pref("showtabline"));
    set_guioptions(get_pref("guioptions"));
    set_titlestring();

    // work around firefox popup blocker
    popup_allowed_events = get_firefox_pref('dom.popup_allowed_events', 'change click dblclick mouseup reset submit');
    if (!popup_allowed_events.match("keypress"))
        set_firefox_pref('dom.popup_allowed_events', popup_allowed_events + " keypress");

    // we have our own typeahead find implementation
    set_firefox_pref('accessibility.typeaheadfind.autostart', false);
    set_firefox_pref('accessibility.typeaheadfind', false); // actually the above setting should do it, but has no effect in firefox

    // first time intro message
    if (get_pref("firsttime", true))
    {
        setTimeout(function() {
            help(null, null, null, { inTab: true });
            set_pref("firsttime", false);
        }, 1000); 
    }


    gURLBar.blur();
    vimperator.focusContent();

    // firefox preferences which we need to be changed to work well with vimperator
    set_firefox_pref("browser.startup.page", 3); // start with saved session

    // Finally, read a ~/.vimperatorrc
    // Make sourcing asynchronous, otherwise commands that open new tabs won't work
    setTimeout(function() {
        source("~/.vimperatorrc", true);
        logMessage("~/.vimperatorrc sourced");
    }, 50);

    logMessage("Vimperator fully initialized");
}

function unload()
{
    /*** save our preferences ***/
    vimperator.commandline.saveHistory();

    // TODO: removeEventListeners();

    // reset some modified firefox prefs
    if (get_firefox_pref('dom.popup_allowed_events', 'change click dblclick mouseup reset submit')
            == popup_allowed_events + " keypress")
        set_firefox_pref('dom.popup_allowed_events', popup_allowed_events);
}


////////////////////////////////////////////////////////////////////////
// focus and mode handling //////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function onEscape()
{
    if (!vimperator.hasMode(vimperator.modes.ESCAPE_ONE_KEY))
    {
        vimperator.setMode(vimperator.modes.NORMAL);
        vimperator.echo("");
        hah.disableHahMode();
        vimperator.focusContent();
        vimperator.statusline.updateUrl();
    }
}

////////////////////////////////////////////////////////////////////////
// event listeners //////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function addEventListeners()
{
    window.addEventListener("unload",   unload, false);

    window.addEventListener("keypress", vimperator.onEvent, true);
    //window.addEventListener("keypress",  onVimperatorKeypress, true);

    // this handler is for middle click only in the content
    //window.addEventListener("mousedown", onVimperatorKeypress, true);
    //content.mPanelContainer.addEventListener("mousedown", onVimperatorKeypress, true);
    //document.getElementById("content").onclick = function(event) { alert("foo"); };

    // these 4 events require >=firefox-2.0 beta1
    window.addEventListener("TabMove",   vimperator.statusline.updateTabCount, false);
    window.addEventListener("TabOpen",   vimperator.statusline.updateTabCount, false);
    window.addEventListener("TabClose",  vimperator.statusline.updateTabCount, false);
    window.addEventListener("TabSelect", function(event)
    { 
    // FIXME:
//        if (hah.currentMode == HINT_MODE_ALWAYS)
//        {
//            hah.disableHahMode();
//            hah.enableHahMode(HINT_MODE_ALWAYS);
//        }
        vimperator.statusline.updateTabCount();
    }, false);

    // update our history cache when a new page is shown
    // XXX: there should be a cleaner way with onload() handler, but it just
    //      does not work out well for me :(
    window.document.addEventListener("pageshow", function(event)
    {
        if (!event.persisted) // only if not bypassing cache
        {
            var url = getCurrentLocation();
            var title = getCurrentTitle(); // not perfect "- Vimperator" in the title
            vimperator.history.add(url, title);
        }
        //alert("moo");
    }
    , null);

    window.document.addEventListener("DOMTitleChanged", function(event)
            {
        //alert("tit");
        }
        , null);


    // called when the window is scrolled.
    window.onscroll = function (event)
    {
        vimperator.statusline.updateBufferPosition();
    };

    // adds listeners to buffer actions.
    var container = getBrowser().tabContainer;
    container.addEventListener("TabOpen", function(event)
    {
        var browser = event.target.linkedBrowser;
        browser.addProgressListener(buffer_changed_listener, Components.interfaces.nsIWebProgress.NOTIFY_STATE_DOCUMENT);
    }, false);
    container.addEventListener("TabClose", function(event)
    {
        var browser = event.target.linkedBrowser;
        browser.removeProgressListener(buffer_changed_listener);
        updateBufferList();
    }, false);
    container.addEventListener("TabSelect", updateBufferList, false);
    container.addEventListener("TabMove",   updateBufferList, false);
}

var buffer_changed_listener =
{
    QueryInterface: function(aIID)
    {
        if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
                aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
                aIID.equals(Components.interfaces.nsISupports))
            return this;
        throw Components.results.NS_NOINTERFACE;
    },

    onStateChange: function(aProgress, aRequest, aFlag, aStatus)
    {
        if(aFlag & Components.interfaces.nsIWebProgressListener.STATE_START)
        {
          // This fires when the load event is initiated
        }
        else if(aFlag & Components.interfaces.nsIWebProgressListener.STATE_STOP)
        {
            //alert('stopchange');
            //buffer_preview_update();
        }
        return 0;
    },

    onLocationChange: function(aProgress, aRequest, aURI) { /*alert('locchange');*/ setTimeout( updateBufferList, 250); return 0; },
    onProgressChange:function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress){ return 0; },
    onStatusChange: function() {return 0;},
    onSecurityChange: function() {return 0;},
    onLinkIconAvailable: function() {return 0;}
}



////////////////////////////////////////////////////////////////////////
// text input functions /////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function isFormElemFocused()
{
    var elt = document.commandDispatcher.focusedElement;
    if (elt == null)
        return false;

    var tagname = elt.localName.toLowerCase();
    var type = elt.type.toLowerCase();

    if ( (tagname == "input" && (type != "image")) ||
          tagname == "textarea" ||
//            tagName == "SELECT" ||
//            tagName == "BUTTON" ||
          tagname == "isindex") // isindex is a deprecated one-line input box
        return true;

    return false;
}


////////////////////////////////////////////////////////////////////////
// logging //////////////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////

var gConsoleService = Components.classes['@mozilla.org/consoleservice;1']
                    .getService(Components.interfaces.nsIConsoleService);

/**
 * logs any object to the javascript error console
 * also prints all properties of thie object
 */
function logMessage(msg)
{
    gConsoleService.logStringMessage('vimperator: ' + msg);
}

/**
 * logs any object to the javascript error console
 * also prints all properties of thie object
 */
function logObject(object)
{
    if (typeof object != 'object')
        return;

    var string = object + '::\n';
    for (var i in object)
    {
        var value;
        try {
            var value = object[i];
        } catch (e) { value = '' }

        string += i + ': ' + value + '\n';
    }
    logMessage(string);
}


////////////////////////////////////////////////////////////////////////
// misc helper functions ////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
// this function gets an event as the input and converts it to 
// a keycode which can be used in mappings
// e.g. pressing ctrl+n would result in the string "<C-n>"
// null if unknown key
function keyToString(event)
{
    var key = String.fromCharCode(event.charCode);
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
        if (event.keyCode == KeyEvent.DOM_VK_ESCAPE)
            key = "Esc";
        else if (event.keyCode == KeyEvent.DOM_VK_RETURN)
            key = "Return";
        else if (event.keyCode == KeyEvent.DOM_VK_TAB)
            key = "Tab";
        else if (event.keyCode == KeyEvent.DOM_VK_DELETE)
            key = "Del";
        else if (event.keyCode == KeyEvent.DOM_VK_BACK_SPACE)
            key = "BS";
        else if (event.keyCode == KeyEvent.DOM_VK_HOME)
            key = "Home";
        else if (event.keyCode == KeyEvent.DOM_VK_END)
            key = "End";
        else if (event.keyCode == KeyEvent.DOM_VK_LEFT)
            key = "Left";
        else if (event.keyCode == KeyEvent.DOM_VK_RIGHT)
            key = "Right";
        else if (event.keyCode == KeyEvent.DOM_VK_UP)
            key = "Up";
        else if (event.keyCode == KeyEvent.DOM_VK_DOWN)
            key = "Down";
        else if (event.keyCode == KeyEvent.DOM_VK_PAGE_UP)
            key = "PageUp";
        else if (event.keyCode == KeyEvent.DOM_VK_PAGE_DOWN)
            key = "PageDown";
        else if (event.keyCode == KeyEvent.DOM_VK_F1)
            key = "F1";
        else if (event.keyCode == KeyEvent.DOM_VK_F2)
            key = "F2";
        else if (event.keyCode == KeyEvent.DOM_VK_F3)
            key = "F3";
        else if (event.keyCode == KeyEvent.DOM_VK_F4)
            key = "F4";
        else if (event.keyCode == KeyEvent.DOM_VK_F5)
            key = "F5";
        else if (event.keyCode == KeyEvent.DOM_VK_F6)
            key = "F6";
        else if (event.keyCode == KeyEvent.DOM_VK_F7)
            key = "F7";
        else if (event.keyCode == KeyEvent.DOM_VK_F8)
            key = "F8";
        else if (event.keyCode == KeyEvent.DOM_VK_F9)
            key = "F9";
        else if (event.keyCode == KeyEvent.DOM_VK_F10)
            key = "F10";
        else if (event.keyCode == KeyEvent.DOM_VK_F11)
            key = "F11";
        else if (event.keyCode == KeyEvent.DOM_VK_F12)
            key = "F12";
        else
            return null;
    }

    // special handling of the Space key
    if (event.charCode == 32)
    {
        if (event.shiftKey)
            modifier += "S-";
        key = "Space";
    }

    // a normal key like a, b, c, 0, etc.
    if (event.charCode > 0)
    {
        if (modifier.length > 0 || event.charCode == 32)
            return "<" + modifier + key + ">";
        else
            return key;
    }
    else // a key like F1 is always enclosed in < and >
        return "<" + modifier + key + ">";
}

////////////////////////////////////////////////////////////////////////
// DOM related helper functsion /////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
// Handle frames if they're present
function getPageLinkNodes()
{
    var frames = window._content.frames;

    // The main content may have link nodes as well as it's frames.
    var nodes = getLinkNodes(_content.content.document);
    var tmp;
    for (var i=0; i<frames.length; i++) {
    tmp = getLinkNodes(frames[i].document);
    // is javascript this crappy?
    for (var j=0; j<tmp.length; j++)
        nodes.push(tmp[j]);
    }
    return nodes;
}

// For a single document, grab all the nodes
function getLinkNodes(doc)
{
    var a_nodes = doc.getElementsByTagName('a');
    var i_nodes = doc.getElementsByTagName('input');
    var s_nodes = doc.getElementsByTagName('select');
    var t_nodes = doc.getElementsByTagName('textarea');

    var links = [];

    for (var i=0; i<t_nodes.length; i++) {
    links.push(t_nodes[i]);
    }
    for (var i=0; i<s_nodes.length; i++) {
    links.push(s_nodes[i]);
    }
    for (var i=0; i<i_nodes.length; i++) {
    if (i_nodes[i].type == "hidden") continue;
    links.push(i_nodes[i]);
    }
    for (var i=0; i<a_nodes.length; i++) {
    if (!a_nodes[i].hasAttribute('href')) continue;
    links.push(a_nodes[i]);
    }

    return links;
}//}}}

function Vimperator()
{
	////////////////////////////////////////////////////////////////////////////////
	////////////////////// PRIVATE SECTION /////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////
    this.modes = { // actually not private, but Firefox complains if this doesn't come first
        // main modes
        NONE:             0,
        NORMAL:           1 << 0,
        INSERT:           1 << 1,
        VISUAL:           1 << 2,
        HINTS:            1 << 3,
        COMMAND_LINE:     1 << 4,
        // extended modes
        EX:               1 << 5,
        SEARCH_FORWARD:   1 << 6,
        SEARCH_BACKWARD:  1 << 7,
        ESCAPE_ONE_KEY:   1 << 8,
        ESCAPE_ALL_KEYS:  1 << 9,
        QUICK_HINT:       1 << 10,
        EXTENDED_HINT:    1 << 11,
        ALWAYS_HINT:      1 << 12
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

    function showMode()
    {
        if (!get_pref("showmode"))
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

	////////////////////////////////////////////////////////////////////////////////
	////////////////////// PUBLIC SECTION //////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////
    this.ver  = "###VERSION### CVS (created: ###DATE###)";
    this.commandline = new CommandLine();
//    this.search = new Search();

    /////////////// callbacks ////////////////////////////
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
		for (i in callbacks)
		{
			[thistype, thismode, thisfunc] = callbacks[i];
			if (vimperator.hasMode(thismode) && type == thistype)
				return thisfunc.call(this, data);
		}
		return false;
	}

    // just forward these echo commands
    this.echo = this.commandline.echo;
    this.echoerr = this.commandline.echoErr;

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
        if (typeof(extended) === "number")
            extended_mode = extended;

        if (typeof(silent) == "undefined" || !silent)
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

    this.onEvent = function(event)/*{{{*/
    {
        if (event.type != "keypress")
            return false;

        // change the event to a usable string representation
        var key = keyToString(event);
         //alert(key);
        if (key == null)
             return false;

        if(event.type == "keydown")
        {
            logObject(event);
            logObject(event.target);
            return;//alert(event.target.id);
        }
        // sometimes the non-content area has focus, making our keys not work
    //    if (event.target.id == "main-window")
    //        alert("focusContent();");


        // XXX: ugly hack for now pass certain keys to firefox as they are without beeping
        // also fixes key navigation in menus, etc.
        if (key == "<Tab>" || key == "<Return>" || key == "<Space>" || key == "<Up>" || key == "<Down>")
            return false;

        // XXX: for now only, later: input mappings if form element focused
        if (isFormElemFocused())
            return false;
        
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
        // g_hint_mappings is used
        // FIXME: total mess
        //if (hah.hintsVisible())
        if (vimperator.hasMode(vimperator.modes.HINTS))
        {
            // never propagate this key to firefox, when hints are visible
            event.preventDefault();
            event.stopPropagation();

            for (i = 0; i < g_hint_mappings.length; i++)
            {
                if(g_hint_mappings[i][0] == key)
                {
                    if(g_hint_mappings[i][3] == true || hah.currentState() == 1)
                    {
                        //g_hint_mappings[i][1].call(this, event);
                        eval(g_hint_mappings[i][1]);
                        if (g_hint_mappings[i][2] == true) // stop processing this event
                        {
                            hah.disableHahMode();
                            g_inputbuffer = "";
                            vimperator.statusline.updateInputBuffer("");
                            return false;
                        }
                        else
                        {
                            // FIXME: make sure that YOU update the statusbar message yourself
                            // first in g_hint_mappings when in this mode!
                            vimperator.statusline.updateInputBuffer(g_inputbuffer);
                            return false;
                        }
                    }
                }
            }

            // no mapping found, beep()
            if (hah.currentState() == 1)
            {
                beep();
                hah.disableHahMode();
                g_inputbuffer = "";
                vimperator.statusline.updateInputBuffer(g_inputbuffer);
                return true;
            }

            // if we came here, let hit-a-hint process the key as it is part
            // of a partial link
            var res = hah.processEvent(event);
            if (res < 0) // error occured processing this key
            {
                beep();
                //if(hah.currentMode() == HINT_MODE_QUICK)
                if(vimperator.hasMode(vimperator.modes.QUICK_HINT))
                    hah.disableHahMode();
                else // ALWAYS mode
                    hah.resetHintedElements();
                g_inputbuffer = "";
            }
            //else if (res == 0 || hah.currentMode() == HINT_MODE_EXTENDED) // key processed, part of a larger hint
            else if (res == 0 || vimperator.hasMode(vimperator.modes.EXTENDED_HINT)) // key processed, part of a larger hint
                g_inputbuffer += key;
            else // this key completed a quick hint
            {
                // if the hint is all in UPPERCASE, open it in new tab
                g_inputbuffer += key;
                if (g_inputbuffer.toUpperCase() == g_inputbuffer)
                    hah.openHints(true, false);
                else // open in current window
                    hah.openHints(false, false);

                //if(hah.currentMode() == HINT_MODE_QUICK)
                if(vimperator.hasMode(vimperator.modes.QUICK_HINT))
                    hah.disableHahMode();
                else // ALWAYS mode
                    hah.resetHintedElements();

                g_inputbuffer = "";
            }

            vimperator.statusline.updateInputBuffer(g_inputbuffer);
            return true;
        }

        // set this variable to true, if we have the start of a mapping
        var couldBecomeCompleteMapping = false;
        var count_str = g_inputbuffer.match(/^[0-9]*/)[0];

        // counts must be at the start of a complete mapping (10j -> go 10 lines down)
        if (event.charCode >= 48 && event.charCode <= 57 && !(event.ctrlKey || event.altKey))
        {
            if (g_inputbuffer.search(/[^0-9]/) != -1)
            {
                g_inputbuffer = "";
                beep();
                vimperator.statusline.updateInputBuffer(g_inputbuffer);
                return true;
            }
            else
            {
                // handle '0' specially to allow binding of 0
                if (g_inputbuffer != "" || key != "0") 
                {
                    g_inputbuffer += key;
                    vimperator.statusline.updateInputBuffer(g_inputbuffer);
                    return true;
                }
                // else let the flow continue, and check if 0 is a mapping
            }
        }

        for (var i in g_mappings)
        {
            // each internal mapping can have multiple keys
            for (var j in g_mappings[i][COMMANDS])
            {
                var mapping = g_mappings[i][COMMANDS][j];
                // alert("key: " + key +" - mapping: "+ mapping + " - g_input: " + g_inputbuffer);
                if(count_str + mapping == g_inputbuffer + key)
                //if (count_str + mapping == vimperator.commandline.getCommand() + key)
                {
                    g_count = parseInt(count_str, 10);
                    if (isNaN(g_count))
                        g_count = -1;

                    // allow null (= no operation) mappings
                    if(g_mappings[i][FUNCTION] != null)
                        g_mappings[i][FUNCTION].call(this, g_count);

                    // command executed, reset input buffer
                    g_inputbuffer = "";
                    vimperator.statusline.updateInputBuffer(g_inputbuffer);
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
                else if ((count_str+mapping).indexOf(g_inputbuffer + key) == 0)
                //else if ((count_str+mapping).indexOf(vimperator.commandline.getCommand() + key) == 0)
                {
                    couldBecomeCompleteMapping = true;
                }
            }
        }

        if (couldBecomeCompleteMapping)
        {
            g_inputbuffer += key;
            event.preventDefault();
            event.stopPropagation();
        }
        else
        {
            g_inputbuffer = "";
            beep();
        }

        vimperator.statusline.updateInputBuffer(g_inputbuffer);
        return false;
    }/*}}}*/


    // FIXME: is not called for onLocationChange etc, find the reason
    this.browserStatusHandler = function() { this.init(); }
    this.browserStatusHandler.prototype =
    {
        QueryInterface : function(aIID)
        {
            if (aIID.equals(Components.interfaces.nsIWebProgressListener) ||
                    aIID.equals(Components.interfaces.nsISupportsWeakReference) ||
                    aIID.equals(Components.interfaces.nsIXULBrowserWindow) ||
                    aIID.equals(Components.interfaces.nsISupports))
                return this;
            throw Components.results.NS_NOINTERFACE;
        },

        init : function()
        {
        },

        setOverLink : function(link, b)
        {
            var ssli = get_pref("showstatuslinks");
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
                {
                    //vimperator.echo("");
                    vimperator.setMode(); // trick to reshow the mode in the command line
                }
            }
        },
        setJSStatus : function(status) { },
        setJSDefaultStatus : function(status) { },
        setDefaultStatus : function(status) { },


        onStateChange:function(aProgress,aRequest,aFlag,aStatus)
        {
            const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
            //const nsIChannel = Components.interfaces.nsIChannel;
            if (aFlag & nsIWebProgressListener.STATE_START && aRequest && aRequest.URI)
            {
                vimperator.statusline.updateProgress(0);
            }
            // this is called when all loading was done (or when the user canceled the load
            else if (aFlag & nsIWebProgressListener.STATE_STOP)
            {
                //alert('stop: ' + aRequest.URI.spec);
                vimperator.statusline.updateUrl(aRequest.URI.spec);
                vimperator.statusline.updateProgress("");
                // also reset the buffer list, since the url titles are valid here
                updateBufferList();
            }
            return 0;
        },
        onLocationChange:function (aWebProgress, aRequest, aLocation)
            {
                // firefox 3.0 doesn't seem to have this function anymore
                if (typeof UpdateBackForwardButtons == "function")
                    UpdateBackForwardButtons();

                var url = aLocation.spec;

                // also update the original firefox location bar
                if (gURLBar)
                    gURLBar.value = url;

                // onLocationChange is also called when switching/deleting tabs
                //if (hah.currentMode() != HINT_MODE_ALWAYS)
                if (vimperator.hasMode(vimperator.modes.HINTS) && !vimperator.hasMode(vimperator.modes.ALWAYS_HINT))
                    hah.disableHahMode();
                
                vimperator.statusline.updateUrl(url);
                vimperator.statusline.updateProgress();
                setTimeout(function() { vimperator.statusline.updateBufferPosition(); }, 100); // if not delayed we get the wrong position of the old buffer

                // updating history cache is not done here but in the 'pageshow' event
                // handler, because at this point I don't have access to the url title
                return 0;
            },
        onProgressChange:function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
            {
                vimperator.statusline.updateProgress(aCurTotalProgress/aMaxTotalProgress);
                return 0;
            },
        onStatusChange:function (aWebProgress, aRequest, aStatus, aMessage)
            {
                alert('change');
                vimperator.statusline.updateUrl(aMessage);
                return 0;
            },
        onSecurityChange:function (aWebProgress, aRequest, aState)
            {
                const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
                if(aState & nsIWebProgressListener.STATE_IS_INSECURE)
                    vimperator.statusline.setColor("transparent");
                else if(aState & nsIWebProgressListener.STATE_IS_BROKEN)
                    vimperator.statusline.setColor("orange");
                else if(aState & nsIWebProgressListener.STATE_IS_SECURE)
                    vimperator.statusline.setColor("yellow");

                return 0;
            }
        //onLinkIconAvailable:function(a){}

    };/*}}}*/
    // alert('end');
}

// XXX: move where?
// provides functions for working with tabs
function Tabs()
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////
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

        if (typeof(spec) === "undefined" || spec === "")
            return position;

        if (typeof(spec) === "number")
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

    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////
    // @returns the index of the currently selected tab starting with 0
    this.index = function(tab)
    {
        if(tab)
        {
            var length = getBrowser().mTabs.length;
            for (var i = 0; i < length; i++)
            {
                if (getBrowser().mTabs[i] == tab)
                    return i;
            }
            return false;
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
            quit(quit_on_last_tab == 2);

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
            beep(); // XXX: move to ex-handling?
            return false;
        }
        getBrowser().mTabContainer.selectedIndex = index;
    }
}
// vim: set fdm=marker sw=4 ts=4 et:
