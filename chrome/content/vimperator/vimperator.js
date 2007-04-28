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

var g_vimperator_version  = "0.4 (CVS) [>=28/04/2007]";

const MODE_NORMAL = 1;
const MODE_INSERT = 2;
const MODE_VISUAL = 4;
const MODE_ESCAPE_ONE_KEY = 8;
const MODE_ESCAPE_ALL_KEYS = 16;
const HINT_MODE_QUICK = 32;
const HINT_MODE_ALWAYS = 64;
const HINT_MODE_EXTENDED = 128;


var g_current_mode = MODE_NORMAL;
var popup_allowed_events; // need to change and reset this firefox pref

var g_inputbuffer = "";  // here we store partial commands (e.g. 'g' if you want to type 'gg')
var g_count = -1;        // the parsed integer of g_inputbuffer, or -1 if no count was given
var g_bufshow = false;   // keeps track if the preview window shows current buffers ('B')

// handles wildmode tab index
var wild_tab_index = 0;

// handles multi-line commands
var prev_match = new Array(5);
var heredoc = '';

// handles to our gui elements
var preview_window = null;
var status_line = null;
var completion_list = null;
var command_line = null;

// our status bar fields
const STATUSFIELD_URL = 1;
const STATUSFIELD_INPUTBUFFER = 2;
const STATUSFIELD_PROGRESS = 3;
const STATUSFIELD_BUFFERS = 4;
const STATUSFIELD_CURSOR_POSITION = 5;


/* this function reacts to status bar and url changes which are sent from
   the mozilla core */
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
        updateStatusbar(link);
            
        if (link == "")
            showMode();
            
    },
    setJSStatus : function(status)
    {
        // echo("setJSStatus");
        // this.updateStatusField(status);
    },
    setJSDefaultStatus : function(status)
    {
        //  echo("setJSDefaultStatus");
        // this.updateStatusField(status);
    },
    setDefaultStatus : function(status)
    {
        // echo("setDefaultStatus");
        // this.updateStatusField(status);
    },


    onStateChange:function(aProgress,aRequest,aFlag,aStatus)
        {
        //alert("state change");
            const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
            const nsIChannel = Components.interfaces.nsIChannel;
            if (aFlag & nsIWebProgressListener.STATE_START && aRequest && aRequest.URI)
            {
                var toLoadUrl = aRequest.URI.spec;
            }
            else if (aFlag & nsIWebProgressListener.STATE_STOP)
            {
                updateStatusbar();
                // also reset the buffer list, since the url titles are valid here
                buffer_preview_update();
            }
            return 0;
        },
    onLocationChange:function (aWebProgress, aRequest, aLocation)
        {
            // firefox 3.0 doesn't seem to have this function anymore
            if (typeof UpdateBackForwardButtons == "function")
                UpdateBackForwardButtons();

            var url = aLocation.spec;
            if (gURLBar)
                gURLBar.value = url; // also update the original firefox location bar

            // onLocationChange is also called when switching/deleting tabs
            if (hah.currentMode() != HINT_MODE_ALWAYS)
                hah.disableHahMode();

            // updating history cache is not done here but in
            // the 'pageshow' event handler, because at this point I don't
            // have access to the url title
            //alert('locchange2');
        },
    onProgressChange:function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress)
        {
            showStatusbarMessage(createProgressBar(aCurTotalProgress/aMaxTotalProgress), STATUSFIELD_PROGRESS);
            return 0;
        },
    onStatusChange:function (aWebProgress, aRequest, aStatus, aMessage)
        {
            showStatusbarMessage(aMessage, STATUSFIELD_URL);
            return 0;
        },
    onSecurityChange:function (aWebProgress, aRequest, aState)
        {
            const nsIWebProgressListener = Components.interfaces.nsIWebProgressListener;
            if(aState & nsIWebProgressListener.STATE_IS_INSECURE)
                setStatusbarColor("transparent");
            else if(aState & nsIWebProgressListener.STATE_IS_BROKEN)
                setStatusbarColor("orange");
            else if(aState & nsIWebProgressListener.STATE_IS_SECURE)
                setStatusbarColor("yellow");

            return 0;
        }
    //onLinkIconAvailable:function(a){}

};/*}}}*/

window.addEventListener("load", init, false);

////////////////////////////////////////////////////////////////////////
// init/uninit //////////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function init()
{
    preview_window = document.getElementById("vim-preview_window");
    status_line = document.getElementById("vim-statusbar");
    completion_list = document.getElementById("vim-completion");
    command_line = document.getElementById("vim-commandbar");
    if (!completion_list || !command_line)
        alert("GUI not correctly created! Strange things will happen (until I find out, how to exit this script by code)");

    // Setup our status handler - from browser.js
    window.XULBrowserWindow = new nsBrowserStatusHandler();
    window.QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIWebNavigation)
        .QueryInterface(Components.interfaces.nsIDocShellTreeItem).treeOwner
        .QueryInterface(Components.interfaces.nsIInterfaceRequestor)
        .getInterface(Components.interfaces.nsIXULWindow)
        .XULBrowserWindow = window.XULBrowserWindow;


    // this function adds all our required listeners to react on events
    // also stuff like window.onScroll is handled there.
    addEventListeners();

    // we always start in normal mode
    setCurrentMode(MODE_NORMAL);

    /*** load our preferences ***/
    load_history();

    set_showtabline(get_pref("showtabline"));
    set_guioptions(get_pref("guioptions"));

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
            var tab = openURLsInNewTab("about:blank", true);
            BrowserStop();
            help();
            set_pref("firsttime", false);
        },1000);
    }



    gURLBar.blur();
    focusContent(true, true);

    // everything important is done, register a preload handler to speed up first time history cache
    if(get_pref("preload"))
        setTimeout(function() { get_url_completions(""); } , 100);

    // firefox preferences which we need to be changed to work well with vimperator
    set_firefox_pref("browser.startup.page", 3); // start with saved session


    logMessage("Initialized");

    /*
     * Finally, read a ~/.vimperatorrc
     * Make sourcing asynchronous, otherwise commands that open new tabs won't work
     */
    setTimeout(function() {
        source("~/.vimperatorrc", true);
        logMessage("~/.vimperatorrc sourced");
    }, 50);
}

function unload()
{
    /*** save our preferences ***/
    save_history();

    // reset firefox pref
    if (get_firefox_pref('dom.popup_allowed_events', 'change click dblclick mouseup reset submit')
            == popup_allowed_events + " keypress")
        set_firefox_pref('dom.popup_allowed_events', popup_allowed_events);
}


////////////////////////////////////////////////////////////////////////
// keyboard input handling //////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function onVimperatorKeypress(event)/*{{{*/
{
    // change the event to a usable string representation
    var key = keyToString(event);
    // alert(key);
    if (key == null)
         return false;

    // XXX: for now only, later: input mappings if form element focused
    if (isFormElemFocused())
        return false;
    
    // handle Escape-one-key mode (Ctrl-v)
    if (hasMode(MODE_ESCAPE_ONE_KEY) && !hasMode(MODE_ESCAPE_ALL_KEYS))
    {
        removeMode(MODE_ESCAPE_ONE_KEY);
        showMode();
        return false;
    }
    // handle Escape-all-keys mode (I)
    if (hasMode(MODE_ESCAPE_ALL_KEYS))
    {
        if(hasMode(MODE_ESCAPE_ONE_KEY))
            removeMode(MODE_ESCAPE_ONE_KEY); // and then let flow continue
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
    if (hah.hintsVisible())
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
                        updateStatusbar();
                        return false;
                    }
                    else
                    {
                        // make sure that YOU update the statusbar message yourself
                        // first in g_hint_mappings when in this mode!
                        updateStatusbar();
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
            updateStatusbar();
            return true;
        }

        // if we came here, let hit-a-hint process the key as it is part
        // of a partial link
        var res = hah.processEvent(event);
        if (res < 0) // error occured processing this key
        {
            beep();
            if(hah.currentMode() == HINT_MODE_QUICK)
                hah.disableHahMode();
            else // ALWAYS mode
                hah.resetHintedElements();
            g_inputbuffer = "";
        }
        else if (res == 0 || hah.currentMode() == HINT_MODE_EXTENDED) // key processed, part of a larger hint
            g_inputbuffer += key;
        else // this key completed a quick hint
        {
            // if the hint is all in UPPERCASE, open it in new tab
            g_inputbuffer += key;
            if (g_inputbuffer.toUpperCase() == g_inputbuffer)
                hah.openHints(true, false);
            else // open in current window
                hah.openHints(false, false);

            if(hah.currentMode() == HINT_MODE_QUICK)
                hah.disableHahMode();
            else // ALWAYS mode
                hah.resetHintedElements();

            g_inputbuffer = "";
        }

        updateStatusbar();
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
            updateStatusbar();
            return true;
        }
        else
        {
            // handle '0' specially to allow binding of 0
            if (g_inputbuffer != "" || key != "0") 
            {
                g_inputbuffer += key;
                updateStatusbar();
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
            {
                g_count = parseInt(count_str, 10);
                if (isNaN(g_count))
                    g_count = -1;

                // allow null (= no operation) mappings
                if(g_mappings[i][FUNCTION] != null)
                    g_mappings[i][FUNCTION].call(this, g_count);

                // command executed, reset input buffer
                g_inputbuffer = "";
                updateStatusbar();
                event.preventDefault();
                event.stopPropagation();
                return false;
            }
            else if ((count_str+mapping).indexOf(g_inputbuffer + key) == 0)
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

    updateStatusbar();
    return false;
}/*}}}*/

function onCommandBarKeypress(evt)/*{{{*/
{
    var end = false;
    try
    {
        /* parse our command string into tokens */
        var command = command_line.value;

        /* user pressed ENTER to carry out a command */
        if (evt.keyCode == KeyEvent.DOM_VK_RETURN)
        {
            // unfocus command line first
            add_to_command_history(command);

            try {
                [prev_match, heredoc, end] = multiliner(command, prev_match, heredoc);
            } catch(e) {
                echoerr(e.name + ": " + e.message);
                prev_match = new Array(5);
                heredoc = '';
            }
            if (!end)
                command_line.value = "";
        }

        else if ((evt.keyCode == KeyEvent.DOM_VK_ESCAPE) ||
                 (keyToString(evt) == "<C-[>"))
        {
            add_to_command_history(command);
            focusContent(true, true);
        }

        /* user pressed UP or DOWN arrow to cycle completion */
        else if (evt.keyCode == KeyEvent.DOM_VK_UP || evt.keyCode == KeyEvent.DOM_VK_DOWN)
        {
            /* save 'start' position for iterating through the history */
            if (comp_history_index == -1)
            {
                comp_history_index = comp_history.length;
                comp_history_start = command_line.value;
            }

            while (comp_history_index >= -1 && comp_history_index <= comp_history.length)
            {
                evt.keyCode == KeyEvent.DOM_VK_UP ? comp_history_index-- : comp_history_index++;
                if (comp_history_index == comp_history.length) // user pressed DOWN when there is no newer history item
                {
                    command_line.value = comp_history_start;
                    return;
                }

                /* if we are at either end of the list, reset the counter, break the loop and beep */
                if((evt.keyCode == KeyEvent.DOM_VK_UP && comp_history_index <= -1) ||
                   (evt.keyCode == KeyEvent.DOM_VK_DOWN && comp_history_index >= comp_history.length))
                {
                    evt.keyCode == KeyEvent.DOM_VK_UP ? comp_history_index++ : comp_history_index--;
                    break;
                }

                if (comp_history[comp_history_index].indexOf(comp_history_start) == 0)
                {
                    command_line.value = comp_history[comp_history_index];
                    return;
                }

            }
            beep();
        }

        /* user pressed TAB to get completions of a command */
        else if (evt.keyCode == KeyEvent.DOM_VK_TAB)
        {
            var start_cmd = command;
            var match = tokenize_ex(command);
            var [count, cmd, special, args] = match;
            var command = get_command(cmd);
            //always reset our completion history so up/down keys will start with new values
            comp_history_index = -1;

            // we need to build our completion list first
            if (comp_tab_index == COMPLETION_UNINITIALIZED) 
            {
                g_completions = [];
                comp_tab_index = -1;
                comp_tab_list_offset = 0;
                comp_tab_startstring = start_cmd;
                wild_tab_index = 0;

                /* if there is no space between the command name and the cursor
                 * then get completions of the command name
                 */
                if(command_line.value.substring(0, command_line.selectionStart).search(/[ \t]/) == -1)
                {
                    get_command_completions(cmd);
                }
                else // dynamically get completions as specified in the g_commands array
                {
                    if (command && command[COMPLETEFUNC])
                    {
                        g_completions = command[COMPLETEFUNC].call(this, args);
                        // Sort the completion list
                        if (get_pref('wildsort'))
                        {
                            g_completions.sort(function(a, b) {
                                if (a[0] < b[0])
                                    return -1;
                                else if (a[0] > b[0])
                                    return 1;
                                else
                                    return 0;
                            });
                        }
                    }
                }
            }

            /* now we have the g_completions, so lets show them */
            if (comp_tab_index >= -1)
            {
                // we could also return when no completion is found
                // but we fall through to the cleanup anyway
                if (g_completions.length == 0)
                    beep();

                var wim = get_pref('wildmode').split(/,/);
                var has_list = false;
                var longest = false;
                var full = false;
                var wildtype = wim[wild_tab_index++] || wim[wim.length - 1];
                if (wildtype == 'list' || wildtype == 'list:full' || wildtype == 'list:longest')
                    has_list = true;
                if (wildtype == 'longest' || wildtype == 'list:longest')
                    longest = true;
                if (wildtype == 'full' || wildtype == 'list:full')
                    full = true;
                // show the list
                if (has_list)
                    completion_show_list();

                if (evt.shiftKey)
                    completion_select_previous_item(has_list, full, longest);
                else
                    completion_select_next_item(has_list, full, longest);
                //command_line.focus(); // workaraound only need for RICHlistbox


                if (comp_tab_index == -1 && !longest) // wrapped around matches, reset command line
                {
                    if (full && g_completions.length > 1)
                    {
                        command_line.value = comp_tab_startstring;
                        completion_list.selectedIndex = -1;
                    }
                }
                else
                {
                    if (longest && g_completions.length > 1)
                        var compl = get_longest_substring();
                    if (full)
                        var compl = g_completions[comp_tab_index][0];
                    if (g_completions.length == 1)
                        var compl = g_completions[0][0];

                    if (compl)
                    {
                        /* if there is no space between the command name and the cursor
                         * the completions are for the command name
                         */
                        if(command_line.value.substring(0, command_line.selectionStart).search(/[ \t]/) == -1)
                        {
                            command_line.value = ":" + (count ? count.toString() : "") + compl;
                        }
                        else // completions are for an argument
                        {
                            command_line.value = ":" + (count ? count.toString() : "") +
                                cmd + (special ? "!" : "") + " " + compl;
                            // Start a new completion in the next iteration. Useful for commands like :source
                            if (g_completions.length == 1 && !full) // RFC: perhaps the command can indicate whether the completion should be restarted
                                comp_tab_index = COMPLETION_UNINITIALIZED;
                        }
                    }
                }
            }

            // prevent tab from moving to the next field
            evt.preventDefault();
            evt.stopPropagation();

        }
        else if (evt.keyCode == KeyEvent.DOM_VK_BACK_SPACE)
        {
            if (command_line.value == ":")
            {
                evt.preventDefault();
                focusContent(true, true);
            }
            comp_tab_index = COMPLETION_UNINITIALIZED;
            comp_history_index = -1;
        }
        else
        {
            // some key hit, check if the cursor is before the : 
            if (command_line.selectionStart == 0)
                command_line.selectionStart = 1;

            // and reset the tab completion
            comp_tab_index = COMPLETION_UNINITIALIZED;
            comp_history_index = -1;

        }
    } catch(e) { alert(e); }
}/*}}}*/

function onCommandBarInput(event)
{
    if (command_line.value == "")
        command_line.value = ":";
}

function onCommandBarMouseDown(event)
{
    if (command_line.value.indexOf(':') != 0)
    {
        command_line.blur();
        event.preventDefault();
        event.stopPropagation();
        return false;
    }
}

////////////////////////////////////////////////////////////////////////
// focus and mode handling //////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
/* After pressing Escape, put focus on a non-input field of the browser document */
function focusContent(clear_command_line, clear_statusline)
{
    try
    {
        g_count = -1; // clear count

        if(clear_command_line)
        {
            command_line.value = "";
            command_line.inputField.setAttribute("style","font-family: monospace;");
        }

        if(clear_statusline)
        {
            completion_list.hidden = true;
            comp_tab_index = COMPLETION_UNINITIALIZED;
            comp_history_index = -1;
            updateStatusbar();
        }

        var ww = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
            .getService(Components.interfaces.nsIWindowWatcher);
        if (window == ww.activeWindow && document.commandDispatcher.focusedElement)
        {
            document.commandDispatcher.focusedElement.blur();
        }
        content.focus();
        
    } catch(e)
    {
        echoerr(e);
    }
}

function openVimperatorBar(str)
{
    // make sure the input field is not red anymore if we had an echoerr() first
    command_line.inputField.setAttribute("style","font-family: monospace;");

    if(str == null)
        str = "";

    if (g_count > 1)
        command_line.value = ":" + g_count.toString() + str;
    else
        command_line.value = ":" + str;

    try {
        command_line.focus();
    } catch(e) {
        echo(e);
    }
}


function onEscape()
{
    if (!hasMode(MODE_ESCAPE_ONE_KEY))
    {
        setCurrentMode(MODE_NORMAL);
        // BrowserStop(); -> moved to <C-c>
        hah.disableHahMode();
        focusContent(true, true);
    }
}

////////////////////////////////////////////////////////////////////////
// event listeners //////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function addEventListeners()
{
    window.addEventListener("unload", unload, false);
    window.addEventListener("keypress", onVimperatorKeypress, true);

    // this handler is for middle click only in the content
    //window.addEventListener("mousedown", onVimperatorKeypress, true);
    //content.mPanelContainer.addEventListener("mousedown", onVimperatorKeypress, true);
    //document.getElementById("content").onclick = function(event) { alert("foo"); };

    // these 4 events require >=firefox-2.0 beta1
    window.addEventListener("TabMove",   updateStatusbar, false);
    window.addEventListener("TabOpen",   updateStatusbar, false);
    window.addEventListener("TabClose",  updateStatusbar, false);
    window.addEventListener("TabSelect", function(event)
    { 
        if (hah.currentMode == HINT_MODE_ALWAYS)
        {
            hah.disableHahMode();
            hah.enableHahMode(HINT_MODE_ALWAYS);
        }
        updateStatusbar();
    }, false);

    // update our history cache when a new page is shown
    // XXX: there should be a cleaner way with onload() handler, but it just
    //      does not work out well for me :(
    window.document.addEventListener("pageshow", function(event)
    {
        if (!event.persisted) // only if not bypassing cache
        {
            var url = getCurrentLocation();
            var title = document.title;
            for(var i=0; i<g_history.length; i++)
            {
                if(g_history[i][0] == url)
                    return;
            }
            g_history.unshift([url, title]);
        }
        // alert('pageshow');
    }
    , null);

    // called when the window is scrolled.
    window.onscroll = function (event)
    {
        showStatusbarMessage(createCursorPositionString(), STATUSFIELD_CURSOR_POSITION);
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
        buffer_preview_update();
    }, false);
    container.addEventListener("TabSelect", buffer_preview_update, false);
    container.addEventListener("TabMove", buffer_preview_update, false);

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


   // This fires when the location bar changes i.e load event is confirmed
   // or when the user switches tabs
    onLocationChange: function(aProgress, aRequest, aURI) { /*alert('locchange');*/buffer_preview_update(); return 0; },
    onProgressChange:function(aWebProgress, aRequest, aCurSelfProgress, aMaxSelfProgress, aCurTotalProgress, aMaxTotalProgress){ return 0; },
    onStatusChange: function() {return 0;},
    onSecurityChange: function() {return 0;},
    onLinkIconAvailable: function() {return 0;}
}


////////////////////////////////////////////////////////////////////////
// statusbar/progressbar ////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
/* the statusbar is currently divided into 5 fields, you can set 
 * each one independently */
function showStatusbarMessage(msg, field)
{
    var bar = document.getElementById("vim-sb-field-" + field);
    if (bar)
        bar.value = msg;
}

function setStatusbarColor(color)
{
    var bar = document.getElementById("vim-statusbar");
    bar.setAttribute("style", "background-color: " + color);
}

function updateStatusbar(message)
{
    var buffers =   "[" + (gBrowser.tabContainer.selectedIndex + 1).toString() + "/" +
        gBrowser.tabContainer.childNodes.length.toString() + "]";

    showStatusbarMessage(message || getCurrentLocation(), STATUSFIELD_URL);
    showStatusbarMessage(" " + g_inputbuffer + " ", STATUSFIELD_INPUTBUFFER);
    showStatusbarMessage("", STATUSFIELD_PROGRESS);
    showStatusbarMessage(buffers, STATUSFIELD_BUFFERS);

    // required to postpone it a little, otherwise we could get the wrong cursor
    // position when switching tabs
    setTimeout(function() {
            showStatusbarMessage(createCursorPositionString(), STATUSFIELD_CURSOR_POSITION);
    } , 10);
}

/* aProgress is a float between 0 and 1 */
function createProgressBar(aProgress)
{
    /* the progress field */
    var progress;
    if (aProgress <= 0)
        progress = "[ Loading...         ]";
    else if (aProgress >= 1)
        progress = "[====================]";
    else
    {
        progress = /*(aProgress*100).round().toString() + "% */"[";
        done = Math.floor(aProgress * 20);
        for (i=0; i < done; i++)
            progress = progress + "=";
        progress = progress + ">";
        for (i=19; i > done; i--)
            progress = progress + " ";
        progress = progress + "]";
    }
    return progress;
}

function createCursorPositionString()
{
    var win = document.commandDispatcher.focusedWindow;
    //var x = win.scrollMaxX == 0 ? 100 : Math.round(win.scrollX / win.scrollMaxX * 100);
    var y = win.scrollMaxY == 0 ? -1 : Math.round(win.scrollY / win.scrollMaxY * 100);

    var percent;
    if (y < 0) percent = "All";
    else if (y == 0) percent = "Top";
    else if (y < 10) percent = " " + y.toString() + "%";
    else if (y >= 100) percent = "Bot";
    else percent = y.toString() + "%";

    return(" " + percent);
}

////////////////////////////////////////////////////////////////////////
// text input functions /////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////
function isFormElemFocused()
{
    var elt = document.commandDispatcher.focusedElement;
    if (elt == null) return false;

    var tagName = elt.localName.toUpperCase();

    if (tagName == "INPUT" ||
            tagName == "TEXTAREA" ||
            tagName == "SELECT" ||
            tagName == "BUTTON" ||
            tagName == "ISINDEX")
        return true;

    return false;
}


////////////////////////////////////////////////////////////////////////
// logging //////////////////////////////////////////////////////// {{{1
////////////////////////////////////////////////////////////////////////

var gConsoleService = Components.classes['@mozilla.org/consoleservice;1']
                    .getService(Components.interfaces.nsIConsoleService);

function logMessage(msg)
{
    gConsoleService.logStringMessage('vimperator: ' + msg);
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
}

// vim: set fdm=marker sw=4 ts=4 et:
