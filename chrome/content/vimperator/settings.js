// settings.js
//
// handles all persistent storage of information
// to and from the firefox registry

// the global handle to the root of the firefox settings
var g_firefox_prefs = Components.classes["@mozilla.org/preferences-service;1"].getService(Components.interfaces.nsIPrefBranch);
var g_vimperator_prefs = null;

// non persistent options
var opt_usermode = false;
var opt_fullscreen = false;

/* all user-setable vimperator settings
 * format:
 * [
 *     0: [all names of this setting],
 *     1: description,
 *     2: help text,
 *     3: set_function,
 *     4: get_function,
 *     5: type,
 *     6: default,
 *     7: checkfunc,
 *     8: completefunc
 * ]
 */
var g_settings = [/*{{{*/
    [
        ["activate"],
        "Define when tabs are automatically activated",
        "Not implemented yet",
        function(value) { set_pref("activate", value); },
        function() { return get_pref("activate"); },
        "stringlist",
        "quickmark,tabopen,paste",
        null,
        null
    ],
    [
        ["beep"],
        "Emit a pc speaker beep on certain errors",
        null,
        function(value) { set_pref("beep", value); },
        function() { return get_pref("beep"); },
        "boolean",
        true,
        null,
        null
    ],
    [
        ["complete", "cpt"],
        "Order and items which are completed at the :[tab]open prompt",
        "Available items:<br>"+
        "<ul><li><b>s</b>: Search machines</li><li>"+
        "        <b>b</b>: Bookmarks</li><li>"+
        "        <b>h</b>: History</li></ul>"+
        "The order is important, so <code class=command>:set complete=bs</code> would list bookmarks first, and then any available quick searches.",
        function(value) { set_pref("complete", value); },
        function() { return get_pref("complete"); },
        "charlist",
        "sbh",
        null,
        null
    ],
    [
        ["completeopt", "cot"],
        "Define how command line completion works",
        "Not implemented yet.",
        function(value) { set_pref("completeopt", value); },
        function() { return get_pref("completeopt"); },
        "stringlist",
        "menu",
        null,
        null
    ],
    [
        ["extendedhinttags", "eht"],
        "XPath string of hintable elements activated by ';'",
        null,
        function(value) { set_pref("extendedhinttags", value); },
        function() { return get_pref("extendedhinttags"); },
        "string",
        "//*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @class='s'] | //input[@type!='hidden'] | //a | //area | //iframe | //textarea | //button | //select",
        null,
        null
    ],
    [
        ["focusedhintstyle", "fhs"],
        "CSS specification of focused hints appearance",
        null,
        function(value) { set_pref("focusedhintstyle", value); },
        function() { return get_pref("focusedhintstyle"); },
        "string",
        "z-index:5000;font-family:monospace;font-size:12;color:ButtonText;background-color:ButtonShadow;border-color:ButtonShadow;border-width:1px;border-style:solid;padding:0px 1px 0px 1px;position:absolute;",
        null,
        null
    ],
    [
        ["fullscreen", "fs"],
        "Shows the current window fullscreen",
        null,
        function(value) { opt_fullscreen = value; BrowserFullScreen(); },
        function() { return opt_fullscreen; },
        "boolean",
        false,
        null,
        null
    ],
    [
        ["guioptions", "go"],
        "Shows or hides the menu, toolbar and scrollbars",
        "Supported characters:<br><ul><li><b>m</b>: menubar</li><li><b>T</b>: toolbar<li><b>b</b>: bookmark bar</li><li><b>s</b>: original Firefox statusbar</ul>",
        function(value) { set_pref("guioptions", value); set_guioptions(value); },
        function() { return get_pref("guioptions"); },
        "charlist",
        "",
        null,
        null
    ],
    [
        ["hintchars", "hc"],
        "String of single characters which can be used to follow hints",
        null,
        function(value) { set_pref("hintchars", value); },
        function() { return get_pref("hintchars"); },
        "charlist",
        "hjklasdfgyuiopqwertnmzxcvb",
        null,
        null
    ],
    [
        ["hintstyle", "hs"],
        "CSS specification of unfocused hints appearance",
        null,
        function(value) { set_pref("hintstyle", value); },
        function() { return get_pref("hintstyle"); },
        "string",
        "z-index:5000;font-family:monospace;font-size:12;color:black;background-color:yellow;border-color:ButtonShadow;border-width:0px;border-style:solid;padding:0px 1px 0px 1px;position:absolute;",
        null,
        null
    ],
    [
        ["hinttags"],
        "XPath string of hintable elements activated by 'f'",
        null,
        function(value) { set_pref("hinttags", value); },
        function() { return get_pref("hinttags"); },
        "string",
        "//*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @class='s'] | //input[@type!='hidden'] | //a | //area | //iframe | //textarea | //button | //select",
        null,
        null
    ],
    [
        ["maxhints", "mh"],
        "Maximum of simultanously shown hints",
        "If you want to speed up display of hints, choose a smaller value",
        function(value) { set_pref("maxhints", value); },
        function() { return get_pref("maxhints"); },
        "number",
        250,
        function (value) { if (value>=1 && value <=1000) return true; else return false; },
        null
    ],
    [
        ["preload"],
        "Speed up first time history/bookmark completion",
        "History access can be quite slow for a large history. Vimperator maintains a cache to speed it up significantly on subsequent access.<br>"+
        "In order to also speed up first time access, it is cached at startup, if this option is set (recommended).",
        function(value) { set_pref("preload", value); },
        function() { return get_pref("preload"); },
        "boolean",
        true,
        null,
        null
    ],
    [
        ["showtabline", "stal"],
        "Control when to show the tab bar of opened web pages",
        "Available items:<br>"+
        "<ul><li><b>0</b>: Never show tab bar</li><li>"+
        "        <b>1</b>: Show tab bar only if more than one tab is open</li><li>"+
        "        <b>2</b>: Always show tab bar</li></ul>"+
        "Not implemented yet.",
        function(value) { set_pref("showtabline", value); set_showtabline(value); },
        function() { return get_pref("showtabline"); },
        "number",
        2,
        function (value) { if (value>=0 && value <=2) return true; else return false; },
        null
    ],
    [
        ["usermode", "um"],
        "Show current website with a minimal stylesheet to make it easily accessible",
        "Note that this is a local setting for now, later it may be split into a global and <code style=command>:setlocal</code> part",
        function(value) { opt_usermode = value; setStyleDisabled(value); },
        function() { return opt_usermode; },
        "boolean",
        false,
        null,
        null
    ]
]/*}}}*/

// return null, if the cmd cannot be found in our g_settings array, or
// otherwise a refernce to our command
function get_setting(cmd)
{
    for (var i=0; i < g_settings.length; i++)
    {
        for (var j=0; j < g_settings[i][0].length; j++)
        {
            if (g_settings[i][0][j] == cmd)
            {
                return g_settings[i];
            }
        }
    }
    return null;
}

/////////////////////////////////////////////////
// preference getter functions ///////////// {{{1
/////////////////////////////////////////////////
function get_pref(name, forced_default)
{
    var pref = null;
    var default_value = "";

    // sometimes this var is not yet inititialized, make sure, it is
    if (!g_vimperator_prefs)
        g_vimperator_prefs = g_firefox_prefs.getBranch("extensions.vimperator.");

    if (forced_default)  // this argument sets defaults for non-user settable options (like comp_history)
        default_value = forced_default;
    else
    {
        for (var i=0; i<g_settings.length; i++)
        {
            if (g_settings[i][0][0] == name) // only first name is searched
            {
                default_value = g_settings[i][6];
                break;
            }
        }
    }

    try
    {
        if (typeof(default_value) == "string")
            pref = g_vimperator_prefs.getCharPref(name);
        else if (typeof(default_value) == "number")
            pref = g_vimperator_prefs.getIntPref(name);
        else if (typeof(default_value) == "boolean")
            pref = g_vimperator_prefs.getBoolPref(name);
        else
            pref = default_value;
    } catch (e)
    {
        //alert("error: " + e);
        pref = default_value;
    }
    return pref;
}


function get_firefox_pref(name, default_value)
{
    var pref;
    try
    {
        if (typeof(default_value) == "string")
            pref = g_firefox_prefs.getCharPref(name);
        else if (typeof(default_value) == "number")
            pref = g_firefox_prefs.getIntPref(name);
        else if (typeof(default_value) == "boolean")
            pref = g_firefox_prefs.getBoolPref(name);
        else
            pref = default_value;
    } catch (e)
    {
        pref = default_value;
    }
    return pref;
}

/////////////////////////////////////////////////
// preference setter functions ///////////// {{{1
/////////////////////////////////////////////////
function set_pref(name, value)
{
    // sometimes this var is not yet inititialized, make sure, it is
    if (!g_vimperator_prefs)
        g_vimperator_prefs = g_firefox_prefs.getBranch("extensions.vimperator.");

    if (typeof(value) == "string")
        g_vimperator_prefs.setCharPref(name, value);
    else if (typeof(value) == "number")
        g_vimperator_prefs.setIntPref(name, value);
    else if (typeof(value) == "boolean")
        g_vimperator_prefs.setBoolPref(name, value);
    else
        echoerr("Unkown typeof pref: " + value);
}

function set_firefox_pref(name, value)
{
    // NOTE: firefox prefs are always inititialized, no need to re-init

    if (typeof(value) == "string")
        g_firefox_prefs.setCharPref(name, value);
    else if (typeof(value) == "number")
        g_firefox_prefs.setIntPref(name, value);
    else if (typeof(value) == "boolean")
        g_firefox_prefs.setBoolPref(name, value);
    else
        echoerr("Unkown typeof pref: " + value);
}


/////////////////////////////////////////////////
// helper functions //////////////////////// {{{1
/////////////////////////////////////////////////

function set_guioptions(value)
{
    // hide menubar
    document.getElementById("toolbar-menubar").collapsed = value.indexOf("m") > -1 ? false : true;
    document.getElementById("toolbar-menubar").hidden = value.indexOf("m") > -1 ? false : true;
    // and main toolbar
    document.getElementById("nav-bar").collapsed = value.indexOf("T") > -1 ? false : true;
    document.getElementById("nav-bar").hidden = value.indexOf("T") > -1 ? false : true;
    // and bookmarks toolbar
    document.getElementById("PersonalToolbar").collapsed = value.indexOf("b") > -1 ? false : true;
    document.getElementById("PersonalToolbar").hidden = value.indexOf("b") > -1 ? false : true;
    // and original status bar (default), but show it, e.g. when needed for extensions
    document.getElementById("status-bar").collapsed = value.indexOf("s") > -1 ? false : true;
    document.getElementById("status-bar").hidden = value.indexOf("s") > -1 ? false : true;
}

function set_showtabline(value)
{
    // hide tabbar
    if(value == 0)
    {
        gBrowser.mStrip.collapsed = true;
        gBrowser.mStrip.hidden = true;
    }
    else if(value == 1)
        echo("show tabline only with > 1 page open not impl. yet");
    else
    {
        gBrowser.mStrip.collapsed = false;
        gBrowser.mStrip.hidden = false;
    }
}

// vim: set fdm=marker sw=4 ts=4 et:
