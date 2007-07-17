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

    // our services
    var console_service = Components.classes['@mozilla.org/consoleservice;1']
        .getService(Components.interfaces.nsIConsoleService);

    function showMode()
    {
        if (!vimperator.options["showmode"])
            return;

        var str_mode = mode_messages[mode];
        var str_extended = mode_messages[extended_mode];
        if (!str_mode && !str_extended)
        {
            vimperator.echo("");
            return;
        }

        if (str_mode && str_extended)
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

    this.input = {
        buffer: "",                // partial command storage
        pendingMap: null,          // pending map storage
        count: -1                  // parsed count from the input buffer
    };

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
        // if (Options.getPref("verbose") >= level) // FIXME: hangs vimperator, probably timing issue --mst
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
