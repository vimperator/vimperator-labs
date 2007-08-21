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

function Option(names, type, extra_info) //{{{
{
    if (!names || !type)
        return null;

    this.name = names[0];
    this.names = names;
    this.usage = this.names;
    this.type = type;

    this.setter = function(value) { Options.setPref(this.name, value); };
    this.getter = function() { return Options.getPref(this.name); };

    if (extra_info)
    {
        if (extra_info.usage)
            this.usage = extra_info.usage;

        this.help = extra_info.help || null;
        this.short_help = extra_info.short_help || null;

        // "", 0 are valid default values
        if (extra_info.default_value !== undefined)
            this.default_value = extra_info.default_value;
        else
            this.default_value = null;

        if (extra_info.setter)
            this.setter = extra_info.setter;
        if (extra_info.getter)
            this.getter = extra_info.getter;

        this.completer = extra_info.completer || null;
        this.validator = extra_info.validator || null;
    }

    // add noOPTION variant of boolean OPTION to this.names
    // FIXME: are these variants really considered names?
    if (this.type == "boolean")
    {
        this.names = []; // reset since order is important
        for (var i = 0; i < names.length; i++)
        {
            this.names.push(names[i]);
            this.names.push("no" + names[i]);
        }
    }

    // NOTE: forced defaults need to use Options.getPref
    Option.prototype.__defineGetter__("value", function() { return this.getter.call(this); });
    Option.prototype.__defineSetter__("value", function(value) { this.setter.call(this, value); });

    // TODO: add is[Type]() queries for use in set()?
    //     : add isValid() or just throw an exception?

    this.hasName = function(name)
    {
        for (var i = 0; i < this.names.length; i++)
        {
            if (this.names[i] == name)
                return true;
        }
        return false;
    }
} //}}}

function Options() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var firefox_prefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);
    var vimperator_prefs = firefox_prefs.getBranch("extensions.vimperator.");
    var options = [];

    function addOption(option)
    {
        Options.prototype.__defineGetter__(option.name, function() { return option.value; });
        Options.prototype.__defineSetter__(option.name, function(value) { option.value = value; });
        options.push(option);
    }

    function optionsIterator()
    {
        for (var i = 0; i < options.length; i++)
            yield options[i];

        throw StopIteration;
    }

    function storePreference(name, value, vimperator_branch)
    {
        if (vimperator_branch)
            branch = vimperator_prefs;
        else
            branch = firefox_prefs;

        switch (typeof value)
        {
            case "string":
                branch.setCharPref(name, value);
                break;
            case "number":
                branch.setIntPref(name, value);
                break;
            case "boolean":
                branch.setBoolPref(name, value);
                break;
            default:
                vimperator.echoerr("Unknown preference type: " + typeof value + " (" + name + "=" + value + ")");
        }
    }

    function loadPreference(name, forced_default, vimperator_branch)
    {
        var pref = null;
        var default_value = "";

        if (vimperator_branch)
        {
            branch = vimperator_prefs;

            if (forced_default)  // this argument sets defaults for non-user settable options (like comp_history)
                default_value = forced_default;
            else
            {
                for (var i = 0; i < options.length; i++)
                {
                    if (options[i].name == name) // only first name is searched
                    {
                        default_value = options[i].default_value;
                        break;
                    }
                }
            }
        }
        else
        {
            branch = firefox_prefs;
        }

        try
        {
            if (typeof default_value == "string")
                pref = branch.getCharPref(name);
            else if (typeof default_value == "number")
                pref = branch.getIntPref(name);
            else if (typeof default_value == "boolean")
                pref = branch.getBoolPref(name);
            else
                pref = default_value;
        }
        catch (e)
        {
            //alert("error: " + e);
            pref = default_value;
        }
        return pref;
    }

    function setGuiOptions(value)
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

    function setShowTabline(value)
    {
        // hide tabbar
        if (value == 0)
        {
            getBrowser().mStrip.collapsed = true;
            getBrowser().mStrip.hidden = true;
        }
        else if (value == 1)
            vimperator.echo("show tabline only with > 1 page open not impl. yet");
        else
        {
            getBrowser().mStrip.collapsed = false;
            getBrowser().mStrip.hidden = false;
        }
    }

    function setTitleString(value)
    {
        document.getElementById("main-window").setAttribute("titlemodifier", value);
        document.title = window.content.document.title + " - " + value; // not perfect fix, but good enough
    }

    //
    // firefox preferences which need to be changed to work well with vimperator
    //

    // work around firefox popup blocker
    var popup_allowed_events = loadPreference('dom.popup_allowed_events', 'change click dblclick mouseup reset submit');
    if (!popup_allowed_events.match("keypress"))
        storePreference('dom.popup_allowed_events', popup_allowed_events + " keypress");

    // TODO: shouldn't we be resetting these in destroy() as well?
    // we have our own typeahead find implementation
    storePreference('accessibility.typeaheadfind.autostart', false);
    storePreference('accessibility.typeaheadfind', false); // actually the above setting should do it, but has no effect in firefox

    // start with saved session
    storePreference("browser.startup.page", 3);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.__iterator__ = function()
    {
        return optionsIterator();
    }

    this.get = function(name)
    {
        for (var i = 0; i < options.length; i++)
        {
            if (options[i].hasName(name))
                return options[i];
        }
        return null;
    }

    this.destroy = function()
    {
        // reset some modified firefox prefs
        if (loadPreference('dom.popup_allowed_events', 'change click dblclick mouseup reset submit')
                == popup_allowed_events + " keypress")
            storePreference('dom.popup_allowed_events', popup_allowed_events);
    }

    this.list = function()
    {
        // TODO: columns like Vim?
        var list = "<table style=\"white-space: nowrap;\">" +
                   "<tr align=\"left\" style=\"color: magenta\"><th>--- Options ---</th></tr>";
        var name, value;

        for (var i = 0; i < options.length; i++)
        {
            name  = options[i].name;
            value = options[i].value;

            if (options[i].type == "boolean")
            {
                name = value ? "&nbsp;&nbsp;" + name : "no" + name;
                list += "<tr><td>" + name + "</td></tr>";
            }
            else
            {
                list += "<tr><td>" + "&nbsp;&nbsp;" + name + "=" + value + "</td></tr>";
            }
        }

        list += "</table>";

        vimperator.commandline.echo(list, true);
    }

    // TODO: separate Preferences from Options? Would these utility functions
    // be better placed in the 'core' vimperator namespace somewhere?
    Options.setPref = function(name, value)
    {
        return storePreference(name, value, true);
    }

    Options.getPref = function(name, forced_default)
    {
        return loadPreference(name, forced_default, true);
    }

    Options.setFirefoxPref = function(name, value)
    {
        return storePreference(name, value);
    }

    Options.getFirefoxPref = function(name, forced_default)
    {
        return loadPreference(name, forced_default);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// DEFAULT OPTIONS /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const DEFAULT_HINTTAGS = "//*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @class='s'] | " +
                             "//input[not(@type='hidden')] | //a | //area | //iframe | //textarea | //button | //select | " +
                             "//xhtml:*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @class='s'] | " +
                             "//xhtml:input[not(@type='hidden')] | //xhtml:a | //xhtml:area | //xhtml:iframe | //xhtml:textarea | //xhtml:button | //xhtml:select"

    addOption(new Option(["activate", "act"], "stringlist",
        {
            short_help: "Define when tabs are automatically activated",
            help: "Available items:<br/>" +
                  "<ul>" +
                  "<li><b>homepage</b>:  <code class=\"mapping\">gH</code> mapping</li>" +
                  "<li><b>quickmark</b>: <code class=\"mapping\">go</code> and <code class=\"mapping\">gn</code> mappings</li>" +
                  "<li><b>tabopen</b>:   <code class=\"command\">:tabopen[!]</code> command</li>" +
                  "<li><b>paste</b>:     <code class=\"mapping\">P</code> and <code class=\"mapping\">gP</code> mappings</li>" +
                  "</ul>",
            default_value: "homepage,quickmark,tabopen,paste"
        }
    ));
    addOption(new Option(["beep"], "boolean",
        {
            short_help: "Emit a pc speaker beep on certain errors",
            default_value: true
        }
    ));
    addOption(new Option(["complete", "cpt"], "charlist",
        {
            short_help: "Items which are completed at the :[tab]open prompt",
            help: "Available items:<br/><ul>" +
                  "<li><b>s</b>: Search machines and keyword URLs</li>" +
                  "<li><b>f</b>: Local files</li>" +
                  "<li><b>b</b>: Bookmarks</li>" +
                  "<li><b>h</b>: History</li></ul>" +
                  "The order is important, so <code class=\"command\">:set complete=bs</code> would list bookmarks first, and then any available quick searches.<br/>" +
                  "Add 'sort' to the <code class=\"option\">'wildoptions'</code> option if you want all entries sorted.",
            default_value: "sfbh",
            validator: function (value) { if (/[^sfbh]/.test(value)) return false; else return true; }
        }
    ));
    addOption(new Option(["defsearch", "ds"], "string",
        {
            short_help: "Set the default search engine",
            help: "The default search engine is used in the <code class=\"command\">:[tab]open [arg]</code> command " +
                  "if [arg] neither looks like a URL or like a specified search engine/keyword.",
            completer: function() { return [["foo", "bar"], ["shit", "blub"]]; },
            default_value: "google"
        }
    ));
    addOption(new Option(["extendedhinttags", "eht"], "string",
        {
            short_help: "XPath string of hintable elements activated by ';'",
            default_value: DEFAULT_HINTTAGS
        }
    ));
    addOption(new Option(["focusedhintstyle", "fhs"], "string",
        {
            short_help: "CSS specification of focused hints appearance",
            default_value: "z-index:5000; font-family:monospace; font-size:12px; color:ButtonText; background-color:ButtonShadow; " +
                           "border-color:ButtonShadow; border-width:1px; border-style:solid; padding:0px 1px 0px 1px; position:absolute;"
        }
    ));
    addOption(new Option(["fullscreen", "fs"], "boolean",
        {
            short_help: "Shows the current window fullscreen",
            setter: function(value) { window.fullScreen = value; },
            getter: function() { return window.fullScreen; },
            default_value: false
        }
    ));
    addOption(new Option(["guioptions", "go"], "charlist",
        {
            short_help: "Shows or hide the menu, toolbar and scrollbars",
            help: "Supported characters:<br/><ul>" +
                  "<li><b>m</b>: menubar</li>" +
                  "<li><b>T</b>: toolbar</li>" +
                  "<li><b>b</b>: bookmark bar</li>" +
                  "<li><b>s</b>: original Firefox statusbar</li></ul>",
            setter: function(value) { Options.setPref("guioptions", value); setGuiOptions(value); },
            default_value: "",
            validator: function (value) { if (/[^mTbs]/.test(value)) return false; else return true; }
        }
    ));
    addOption(new Option(["hintchars", "hc"], "charlist",
        {
            short_help: "String of single characters which can be used to follow hints",
            default_value: "hjklasdfgyuiopqwertnmzxcvb"
        }
    ));
    addOption(new Option(["hintstyle", "hs"], "string",
        {
            short_help: "CSS specification of unfocused hints appearance",
            default_value: "z-index:5000; font-family:monospace; font-size:12px; color:black; background-color:yellow; " +
                           "border-color:ButtonShadow; border-width:0px; border-style:solid; padding:0px 1px 0px 1px; position:absolute;"
        }
    ));
    addOption(new Option(["hinttags"], "string",
        {
            short_help: "XPath string of hintable elements activated by <code class=\"mapping\">'f'</code> and <code class=\"mapping\">'F'</code>",
            default_value: DEFAULT_HINTTAGS
        }
    ));
    addOption(new Option(["maxhints", "mh"], "number",
        {
            short_help: "Maximum number of simultaneously shown hints",
            help: "If you want to speed up display of hints, choose a smaller value",
            default_value: 250,
            validator: function (value) { if (value>=1 && value <=1000) return true; else return false; }
        }
    ));
    addOption(new Option(["preload"], "boolean",
        {
            short_help: "Speed up first time history/bookmark completion",
            help: "History access can be quite slow for a large history. Vimperator maintains a cache to speed it up significantly on subsequent access.<br/>" +
                  "In order to also speed up first time access, it is cached at startup, if this option is set (recommended).",
            default_value: true
        }
    ));
    addOption(new Option(["previewheight", "pvh"], "number",
        {
            short_help: "Default height for preview window",
            help: "Value must be between 1 and 50. If the value is too high, completions may cover the command-line. " +
                  "Close the preview window with <code class=\"command\">:pclose</code>." +
                  "NOTE: Option currently disabled",
            default_value: 10,
            validator: function (value) { if (value>=1 && value <=50) return true; else return false; }
        }
    ));
    addOption(new Option(["scroll", "scr"], "number",
        {
            short_help: "Number of lines to scroll with <code class=\"mapping\">C-u</code> and <code class=\"mapping\">C-d</code> commands",
            help: "The number of lines scrolled defaults to half the window size. " +
                  "When a <code class=\"argument\">{count}</code> is specified to the <code class=\"mapping\">&lt;C-u&gt;</code> or <code class=\"mapping\">&lt;C-d&gt;</code> commands this is used to set the value of <code class=\"option\">'scroll'</code> and also used for the current command. " +
                  "The value can be reset to half the window height with <code class=\"command\">:set scroll=0</code>.",
            default_value: 0,
            validator: function (value) { if (value >= 0) return true; else return false; }
        }
    ));
    addOption(new Option(["showmode", "smd"], "boolean",
        {
            short_help: "Show the current mode in the command line",
            default_value: true
        }
    ));
    addOption(new Option(["showstatuslinks", "ssli"], "number",
        {
            short_help: "Show the destination of the link under the cursor in the status bar",
            help: "Also links which are focused by keyboard commands like <code class=\"mapping\">&lt;Tab&gt;</code> are shown. " +
                  "Possible values:<br/><ul>" +
                  "<li><b>0</b>: Don't show link destination</li>" +
                  "<li><b>1</b>: Show the link in the status line</li>" +
                  "<li><b>2</b>: Show the link in the command line</li></ul>",
            default_value: 1,
            validator: function (value) { if (value >= 0 && value <= 2) return true; else return false; }
        }
    ));
    addOption(new Option(["showtabline", "stal"], "number",
        {
            short_help: "Control when to show the tab bar of opened web pages",
            help: "Possible values:<br/><ul>" +
                  "<li><b>0</b>: Never show tab bar</li>" +
                  "<li><b>1</b>: Show tab bar only if more than one tab is open</li>" +
                  "<li><b>2</b>: Always show tab bar</li></ul>" +
                  "NOTE: Not fully implemented yet and buggy with stal=0",
            setter: function(value) { Options.setPref("showtabline", value); setShowTabline(value); },
            default_value: 2,
            validator: function (value) { if (value>=0 && value <=2) return true; else return false; }
        }
    ));
    addOption(new Option(["titlestring"], "string",
        {
            short_help: "Change the title of the browser window",
            help: "Vimperator changes the browser title from \"Title of web page - Mozilla Firefox\" to " +
                  "\"Title of web page - Vimperator\".<br/>If you don't like that, you can restore it with: " +
                  "<code class=\"command\">:set titlestring=Mozilla Firefox</code>.",
            setter: function(value) { Options.setPref("titlestring", value); setTitleString(value); },
            default_value: "Vimperator"
        }
    ));
    addOption(new Option(["usermode", "um"], "boolean",
        {
            short_help: "Show current website with a minimal style sheet to make it easily accessible",
            help: "Note that this is a local option for now, later it may be split into a global and <code class=\"command\">:setlocal</code> part",
            setter: function(value) { getMarkupDocumentViewer().authorStyleDisabled = value; },
            getter: function() { return getMarkupDocumentViewer().authorStyleDisabled; },
            default_value: false
        }
    ));
    addOption(new Option(["verbose", "vbs"], "number",
        {
            short_help: "Define which type of messages are logged",
            help: "When bigger than zero, Vimperator will give messages about what it is doing. They are printed to the error console which can be shown with <code class=\"command\">:javascript!</code>.<br/>" +
                  "The highest value is 9, being the most verbose mode.",
            default_value: 0,
            validator: function (value) { if (value>=0 && value <=9) return true; else return false; }
        }
    ));
    addOption(new Option(["wildmode", "wim"], "stringlist",
        {
            short_help: "Define how command line completion works",
            help: "It is a comma-separated list of parts, where each part specifies " +
                  "what to do for each consecutive use of the completion key. The first part " +
                  "specifies the behavior for the first use of the completion key, the second part " +
                  "for the second use, etc.<br/>" +
                  "These are the possible values for each part:<br/>" +
                  "<table>" +
                  "<tr><td><b>''</b></td><td>Complete only the first match</td></tr>" +
                  "<tr><td><b>'full'</b></td><td>Complete the next full match. After the last, the original string is used.</td></tr>" +
                  "<tr><td><b>'longest'</b></td><td>Complete till the longest common string.</td></tr>" +
                  "<tr><td><b>'list'</b></td><td>When more than one match, list all matches.</td></tr>" +
                  "<tr><td><b>'list:full'</b></td><td>When more than one match, list all matches and complete first match.</td></tr>" +
                  "<tr><td><b>'list:longest'</b></td><td>When more than one match, list all matches and complete till the longest common string.</td></tr>" +
                  "</table>" +
                  "When there is only a single match, it is fully completed regardless of the case.",
            default_value: "list:full",
            validator: function (value)
            {
                if (/^(?:(?:full|longest|list|list:full|list:longest)(?:,(?!,))?){0,3}(?:full|longest|list|list:full|list:longest)?$/.test(value))
                    return true;
                else
                    return false;
            }
        }
    ));
    addOption(new Option(["wildoptions", "wop"], "stringlist",
        {
            short_help: "Change how command line completion is done",
            help: "A list of words that change how command line completion is done.<br/>" +
                  "Currently only one word is allowed:<br/>" +
                  "<table>" +
                  "<tr><td><b>sort</b></td><td>Always sorts completion list, overriding the <code class=\"option\">'complete'</code> option.</td></tr>" +
                  "</table>",
            default_value: "",
            validator: function (value) { if (/^sort$/.test(value)) return true; else return false; }
        }
    ));
    //}}}

    setShowTabline(this.showtabline);
    setGuiOptions(this.guioptions);
    setTitleString(this.titlestring);
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
