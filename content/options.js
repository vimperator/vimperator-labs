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

vimperator.Option = function (names, type, extraInfo) //{{{
{
    if (!names || !type)
        return null;

    var value = null;

    this.name = names[0];
    this.names = names;
    this.usage = this.names;
    this.type = type;

    if (extraInfo)
    {
        if (extraInfo.usage)
            this.usage = extraInfo.usage;

        this.help = extraInfo.help || null;
        this.shortHelp = extraInfo.shortHelp || null;

        // "", 0 are valid default values
        if (extraInfo.defaultValue !== undefined)
            this.defaultValue = extraInfo.defaultValue;
        else
            this.defaultValue = null;

        value = this.defaultValue;

        if (extraInfo.setter)
            this.setter = extraInfo.setter;
        if (extraInfo.getter)
            this.getter = extraInfo.getter;

        this.completer = extraInfo.completer || null;
        this.validator = extraInfo.validator || null;
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

    // NOTE: forced defaults need to use vimperator.options.getPref
    this.__defineGetter__("value",
        function ()
        {
            if (this.getter)
                this.getter.call(this);
            return value;
        }
    );
    this.__defineSetter__("value",
        function (newValue)
        {
            value = newValue;
            if (this.setter)
                this.setter.call(this, value);
        }
    );

    // TODO: add is[Type]() queries for use in set()?
    //     : add isValid() or just throw an exception?

    this.hasName = function (name)
    {
        return this.names.some(function (e) { return e == name; });
    };

    this.isValidValue = function (value)
    {
        if (this.validator)
            return this.validator(value);
        else
            return true;
    };

    this.reset = function ()
    {
        this.value = this.defaultValue;
    };
}; //}}}

vimperator.Options = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var firefoxPrefs = Components.classes["@mozilla.org/preferences-service;1"]
        .getService(Components.interfaces.nsIPrefBranch);
    var vimperatorPrefs = firefoxPrefs.getBranch("extensions.vimperator.");
    var options = [];

    // save if we already changed a GUI related option, used for setInitialGUI
    var guioptionsDone = false, showtablineDone = false, laststatusDone = false;

    function optionsIterator()
    {
        for (var i = 0; i < options.length; i++)
            yield options[i];

        throw StopIteration;
    }

    function storePreference(name, value, vimperatorBranch)
    {
        var branch;

        if (vimperatorBranch)
            branch = vimperatorPrefs;
        else
            branch = firefoxPrefs;

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

    function loadPreference(name, forcedDefault, vimperatorBranch)
    {
        var defaultValue = null;
        if (forcedDefault != null)  // this argument sets defaults for non-user settable options (like comp_history)
            defaultValue = forcedDefault;

        if (vimperatorBranch)
        {
            branch = vimperatorPrefs;

            if (!forcedDefault)  // this argument sets defaults for non-user settable options (like comp_history)
            {
                for (var i = 0; i < options.length; i++)
                {
                    if (options[i].name == name) // only first name is searched
                    {
                        defaultValue = options[i].defaultValue;
                        break;
                    }
                }
            }
        }
        else
        {
            branch = firefoxPrefs;
        }

        try
        {
            switch (typeof defaultValue)
            {
                case "string":
                    return branch.getCharPref(name);
                case "number":
                    return branch.getIntPref(name);
                case "boolean":
                    return branch.getBoolPref(name);
                default:
                    return defaultValue;
            }
        }
        catch (e)
        {
            return defaultValue;
        }
    }

    function setGuiOptions(value)
    {
        // hide the menubar, toolbar and bookmarks toolbar
        document.getElementById("toolbar-menubar").collapsed = !/m/.test(value);
        document.getElementById("nav-bar").        collapsed = !/T/.test(value);
        document.getElementById("PersonalToolbar").collapsed = !/b/.test(value);

        guioptionsDone = true;
    }

    function setLastStatus(value)
    {
        if (value == 0)
            document.getElementById("status-bar").collapsed = true;
        else if (value == 1)
            vimperator.echo("show status line only with > 1 window not implemented yet");
        else
            document.getElementById("status-bar").collapsed = false;

        laststatusDone = true;
    }

    function setShowTabline(value)
    {
        var tabs = getBrowser().mStrip.getElementsByClassName("tabbrowser-tabs")[0];
        if (!tabs)
            return;

        if (value == 0)
        {
            tabs.collapsed = true;
        }
        else if (value == 1)
        {
            storePreference("browser.tabs.autoHide", true);
            tabs.collapsed = false;
        }
        else
        {
            storePreference("browser.tabs.autoHide", false);
            tabs.collapsed = false;
        }

        showtablineDone = true;
    }

    function setTitleString(value)
    {
        document.getElementById("main-window").setAttribute("titlemodifier", value);
        if (window.content.document.title.length > 0)
            document.title = window.content.document.title + " - " + value;
        else
            document.title = value;
    }

    function setPopups(value)
    {
        var values = [ [0, 1], // always in current tab
                       [0, 3], // in a new tab
                       [2, 3], // in a new window if it has specified sizes
                       [1, 2]];// always in new window
        storePreference("browser.link.open_newwindow.restriction", values[value][0]);
        storePreference("browser.link.open_newwindow", values[value][1]);
    }

    //
    // firefox preferences which need to be changed to work well with vimperator
    //

    // work around firefox popup blocker
    var popupAllowedEvents = loadPreference("dom.popup_allowed_events", "change click dblclick mouseup reset submit");
    if (!/keypress/.test(popupAllowedEvents))
        storePreference("dom.popup_allowed_events", popupAllowedEvents + " keypress");

    // TODO: shouldn't we be resetting these in destroy() as well?
    // we have our own typeahead find implementation
    storePreference("accessibility.typeaheadfind.autostart", false);
    storePreference("accessibility.typeaheadfind", false); // actually the above setting should do it, but has no effect in firefox

    // start with saved session
    storePreference("browser.startup.page", 3);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var optionManager = {

        __iterator__: function ()
        {
            return optionsIterator();
        },

        get: function (name)
        {
            for (var i = 0; i < options.length; i++)
            {
                if (options[i].hasName(name))
                    return options[i];
            }
            return null;
        },

        add: function (option)
        {
            this.__defineGetter__(option.name, function () { return option.value; });
            this.__defineSetter__(option.name, function (value) { option.value = value; });
            options.push(option);
        },

        destroy: function ()
        {
            // reset some modified firefox prefs
            if (loadPreference("dom.popup_allowed_events", "change click dblclick mouseup reset submit")
                    == popupAllowedEvents + " keypress")
                storePreference("dom.popup_allowed_events", popupAllowedEvents);
        },

        list: function (onlyNondefault)
        {
            // TODO: columns like Vim?
            var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                       "<table><tr align=\"left\" class=\"hl-Title\"><th>--- Options ---</th></tr>";
            var name, value, def;

            for (var i = 0; i < options.length; i++)
            {
                name  = options[i].name;
                value = options[i].value;
                def   = options[i].defaultValue;

                if (onlyNondefault && value == def)
                    continue;

                if (options[i].type == "boolean")
                {
                    name = value ? "  " + name : "no" + name;
                    if (value != def)
                        name = "<span style=\"font-weight: bold\">" + name + "</span><span style=\"color: gray\">  (default: " + (def ? "" : "no") + options[i].name + ")</span>";
                    list += "<tr><td>" + name + "</td></tr>";
                }
                else
                {
                    if (value != def)
                    {
                        name  = "<span style=\"font-weight: bold\">" + name + "</span>";
                        value = vimperator.util.colorize(value, false) + "<span style=\"color: gray\">  (default: " + def + ")</span>";
                    }
                    else
                        value = vimperator.util.colorize(value, false);

                    list += "<tr><td>" + "  " + name + "=" + value + "</td></tr>";
                }
            }

            list += "</table>";

            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        },

        // this hack is only needed, because we need to do asynchronous loading of the .vimperatorrc
        setInitialGUI: function ()
        {
            if (!guioptionsDone)
                this.get("guioptions").reset();
            if (!laststatusDone)
                this.get("laststatus").reset();
            if (!showtablineDone)
                this.get("showtabline").reset();
        },

        // TODO: separate Preferences from Options? Would these utility functions
        // be better placed in the 'core' vimperator namespace somewhere?
        setPref: function (name, value)
        {
            return storePreference(name, value, true);
        },

        getPref: function (name, forcedDefault)
        {
            return loadPreference(name, forcedDefault, true);
        },

        setFirefoxPref: function (name, value)
        {
            return storePreference(name, value);
        },

        getFirefoxPref: function (name, forcedDefault)
        {
            return loadPreference(name, forcedDefault);
        }

    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// DEFAULT OPTIONS /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const DEFAULT_HINTTAGS = "//*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @class='s'] | " +
                             "//input[not(@type='hidden')] | //a | //area | //iframe | //textarea | //button | //select | " +
                             "//xhtml:*[@onclick or @onmouseover or @onmousedown or @onmouseup or @oncommand or @class='lk' or @class='s'] | " +
                             "//xhtml:input[not(@type='hidden')] | //xhtml:a | //xhtml:area | //xhtml:iframe | //xhtml:textarea | //xhtml:button | //xhtml:select";

    optionManager.add(new vimperator.Option(["activate", "act"], "stringlist",
        {
            shortHelp: "Define when tabs are automatically activated",
            help: "Available items:<br/>" +
                  "<ul>" +
                  "<li><b>homepage</b>:  <code class=\"mapping\">gH</code> mapping</li>" +
                  "<li><b>quickmark</b>: <code class=\"mapping\">go</code> and <code class=\"mapping\">gn</code> mappings</li>" +
                  "<li><b>tabopen</b>:   <code class=\"command\">:tabopen[!]</code> command</li>" +
                  "<li><b>paste</b>:     <code class=\"mapping\">P</code> and <code class=\"mapping\">gP</code> mappings</li>" +
                  "</ul>",
            defaultValue: "homepage,quickmark,tabopen,paste",
            validator: function (value)
            {
                return value.split(",").every(function (item) { return /^(homepage|quickmark|tabopen|paste|)$/.test(item); });
            }
        }
    ));
    optionManager.add(new vimperator.Option(["complete", "cpt"], "charlist",
        {
            shortHelp: "Items which are completed at the :[tab]open prompt",
            help: "Available items:<br/>" +
                  "<ul>" +
                  "<li><b>s</b>: Search engines and keyword URLs</li>" +
                  "<li><b>f</b>: Local files</li>" +
                  "<li><b>b</b>: Bookmarks</li>" +
                  "<li><b>h</b>: History</li>" +
                  "</ul>" +
                  "The order is important, so <code class=\"command\">:set complete=bs</code> would list bookmarks first, and then any available quick searches.<br/>" +
                  "Add <code class=\"option\">'sort'</code> to the <code class=\"option\">'wildoptions'</code> option if you want all entries sorted.",
            defaultValue: "sfbh",
            validator: function (value) { return !/[^sfbh]/.test(value); }
        }
    ));
    optionManager.add(new vimperator.Option(["defsearch", "ds"], "string",
        {
            shortHelp: "Set the default search engine",
            help: "The default search engine is used in the <code class=\"command\">:[tab]open [arg]</code> command " +
                  "if [arg] neither looks like a URL or like a specified search engine/keyword.",
            defaultValue: "google"
        }
    ));
    optionManager.add(new vimperator.Option(["editor"], "string",
        {
            shortHelp: "Set the external text editor",
            help: "Sets the editor to run when <code class=\"mapping\">&lt;C-i&gt;</code> " +
                  "is pressed in INSERT and TEXTAREA modes. Note that Vimperator will " +
                  "not behave correctly if the editor forks its own process, such as with " +
                  "gvim without the -f argument.",
            defaultValue: "gvim -f"
        }
    ));
    optionManager.add(new vimperator.Option(["extendedhinttags", "eht"], "string",
        {
            shortHelp: "XPath string of hintable elements activated by ';'",
            defaultValue: DEFAULT_HINTTAGS
        }
    ));
    optionManager.add(new vimperator.Option(["focusedhintstyle", "fhs"], "string",
        {
            shortHelp: "CSS specification of focused hints",
            defaultValue: "z-index:5000; font-family:monospace; font-size:12px; color:ButtonText; background-color:ButtonShadow; " +
                           "border-color:ButtonShadow; border-width:1px; border-style:solid; padding:0px 1px 0px 1px; position:absolute;"
        }
    ));
    optionManager.add(new vimperator.Option(["fullscreen", "fs"], "boolean",
        {
            shortHelp: "Show the current window fullscreen",
            setter: function (value) { window.fullScreen = value; },
            getter: function () { return window.fullScreen; },
            defaultValue: false
        }
    ));
    optionManager.add(new vimperator.Option(["guioptions", "go"], "charlist",
        {
            shortHelp: "Show or hide the menu, toolbar and scrollbars",
            help: "Supported characters:<br/>" +
                  "<ul>" +
                  "<li><b>m</b>: menubar</li>" +
                  "<li><b>T</b>: toolbar</li>" +
                  "<li><b>b</b>: bookmark bar</li>" +
                  "</ul>",
            setter: function (value) { setGuiOptions(value); },
            defaultValue: "",
            validator: function (value) { return !/[^mTb]/.test(value); }
        }
    ));
    optionManager.add(new vimperator.Option(["hinttimeout", "hto"], "number",
        {
            shortHelp: "Automatically follow non unique numerical hint after {arg} ms",
            help: "Set to 0 (the default) to only follow numeric hints after pressing &lt;Return&gt; or when the hint is unique.",
            defaultValue: 0,
            validator: function (value) { return value >= 0; }
        }
    ));
    optionManager.add(new vimperator.Option(["hintstyle", "hs"], "string",
        {
            shortHelp: "CSS specification of unfocused hints",
            defaultValue: "z-index:5000; font-family:monospace; font-size:12px; color:white; background-color:red; " +
                           "border-color:ButtonShadow; border-width:0px; border-style:solid; padding:0px 1px 0px 1px; position:absolute;"
        }
    ));
    optionManager.add(new vimperator.Option(["hinttags", "ht"], "string",
        {
            shortHelp: "XPath string of hintable elements activated by <code class=\"mapping\">'f'</code> and <code class=\"mapping\">'F'</code>",
            defaultValue: DEFAULT_HINTTAGS
        }
    ));
    optionManager.add(new vimperator.Option(["history", "hi"], "number",
        {
            shortHelp: "Number of Ex commands and search patterns to store in the commandline history",
            defaultValue: 500
        }
    ));
    optionManager.add(new vimperator.Option(["hlsearch", "hls"], "boolean",
        {
            shortHelp: "Highlight previous search pattern matches",
            setter: function (value) { if (value) vimperator.search.highlight(); else vimperator.search.clear(); },
            defaultValue: false
        }
    ));
    optionManager.add(new vimperator.Option(["hlsearchstyle", "hlss"], "string",
        {
            shortHelp: "CSS specification of highlighted search items",
            defaultValue: "color: black; background-color: yellow; padding: 0; display: inline;"
        }
    ));
    optionManager.add(new vimperator.Option(["ignorecase", "ic"], "boolean",
        {
            shortHelp: "Ignore case in search patterns",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["incsearch", "is"], "boolean",
        {
            shortHelp: "Show where the search pattern matches as it is typed",
            help: "NOTE: Incremental searching currently only works in the forward direction.",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["insertmode", "im"], "boolean",
        {
            shortHelp: "Use Insert mode as the default for text areas",
            help: "Makes Vimperator work in a way that Insert mode is the default mode for text areas. " +
                  "Useful if you want to use Vimperator as a modeless editor, keeping the known Firefox interface for editing text areas.",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["laststatus", "ls"], "number",
        {
            shortHelp: "Show the status line",
            help: "Determines when the last window will have a status line. " +
                  "Possible values:<br/>" +
                  "<ul>" +
                  "<li><b>0</b>: never</li>" +
                  "<li><b>1</b>: only if there are multiple windows</li>" +
                  "<li><b>2</b>: always</li>" +
                  "</ul>" +
                  "NOTE: laststatus=1 not implemented yet.",
            defaultValue: 2,
            setter: function (value) { setLastStatus(value); },
            validator: function (value) { return (value >= 0 && value <= 2); }
        }
    ));
    optionManager.add(new vimperator.Option(["linksearch", "lks"], "boolean",
        {
            shortHelp: "Limit the search to hyperlink text",
            help: "This includes (X)HTML elements with an \"href\" atrribute and XLink \"simple\" links.",
            defaultValue: false
        }
    ));
    optionManager.add(new vimperator.Option(["more"], "boolean",
        {
            shortHelp: "Pause the message list window when more than one screen of listings is displayed",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["nextpattern"], "stringlist",
        {
            shortHelp: "Patterns to use when guessing the 'next' page in a document sequence",
            help: "Each pattern, in order, is matched against all links in the page with the first match being used.<br/>" +
            "The patterns are case insensitive regular expressions.",
            defaultValue: "\\bnext,^>$,^>>$,^>,>$"
        }
    ));
    optionManager.add(new vimperator.Option(["pageinfo", "pa"], "charlist",
        {
            shortHelp: "Desired info on :pa[geinfo]",
            help: "Available items:<br/>" +
                  "<ul>" +
                  "<li><b>g</b>: general info</li>" +
                  "<li><b>f</b>: feeds</li>" +
                  "<li><b>m</b>: meta tags</li>" +
                  "</ul>" +
                  "The order matters",
            defaultValue: "gfm",
            validator: function (value) { return !(/[^gfm]/.test(value) || value.length > 3 || value.length < 1); }
        }
    ));
    optionManager.add(new vimperator.Option(["popups", "pps"], "number",
        {
            shortHelp: "Where to show requested popup windows",
            help: "Define where to show requested popup windows. Does not apply to windows which are opened by middle clicking a link, they always open in a new tab. " +
                  "Possible values:<br/>" +
                  "<ul>" +
                  "<li><b>0</b>: Force to open in the current tab (NOTE: this can stop some web sites from working correctly!)</li>" +
                  "<li><b>1</b>: Always open in a new tab</li>" +
                  "<li><b>2</b>: Open in a new window if it has a specific requested size (default in Firefox)</li>" +
                  "<li><b>3</b>: Always open in a new window</li>" +
                  "</ul>" +
                  "NOTE: This option does not change the popup blocker of Firefox in any way.",
            defaultValue: 1,
            setter: function (value) { setPopups(value); },
            validator: function (value) { return (value >= 0 && value <= 3); }
        }
    ));
    optionManager.add(new vimperator.Option(["preload"], "boolean",
        {
            shortHelp: "Speed up first time history/bookmark completion",
            help: "History access can be quite slow for a large history. Vimperator maintains a cache to speed it up significantly on subsequent access.<br/>" +
                  "In order to also speed up first time access, it is cached at startup, if this option is set (recommended).",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["previewheight", "pvh"], "number",
        {
            shortHelp: "Default height for preview window",
            help: "Value must be between 1 and 50. If the value is too high, completions may cover the command-line. " +
                  "Close the preview window with <code class=\"command\">:pclose</code>.<br/>" +
                  "NOTE: Option currently disabled",
            defaultValue: 10,
            validator: function (value) { return (value >= 1 && value <= 50); }
        }
    ));
    optionManager.add(new vimperator.Option(["previouspattern"], "stringlist",
        {
            shortHelp: "Patterns to use when guessing the 'previous' page in a document sequence",
            help: "Each pattern, in order, is matched against all links in the page with the first match being used.<br/>" +
            "The patterns are case insensitive regular expressions.",
            defaultValue: "\\bprev|previous\\b,^<$,^<<$,^<,<$"
        }
    ));
    optionManager.add(new vimperator.Option(["scroll", "scr"], "number",
        {
            shortHelp: "Number of lines to scroll with <code class=\"mapping\">C-u</code> and <code class=\"mapping\">C-d</code> commands",
            help: "The number of lines scrolled defaults to half the window size. " +
                  "When a <code class=\"argument\">{count}</code> is specified to the <code class=\"mapping\">&lt;C-u&gt;</code> or <code class=\"mapping\">&lt;C-d&gt;</code> commands this is used to set the value of <code class=\"option\">'scroll'</code> and also used for the current command. " +
                  "The value can be reset to half the window height with <code class=\"command\">:set scroll=0</code>.",
            defaultValue: 0,
            validator: function (value) { return value >= 0; }
        }
    ));
    optionManager.add(new vimperator.Option(["showmode", "smd"], "boolean",
        {
            shortHelp: "Show the current mode in the command line",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["showstatuslinks", "ssli"], "number",
        {
            shortHelp: "Show the destination of the link under the cursor in the status bar",
            help: "Also links which are focused by keyboard commands like <code class=\"mapping\">&lt;Tab&gt;</code> are shown. " +
                  "Possible values:<br/>" +
                  "<ul>" +
                  "<li><b>0</b>: Don't show link destination</li>" +
                  "<li><b>1</b>: Show the link in the status line</li>" +
                  "<li><b>2</b>: Show the link in the command line</li>" +
                  "</ul>",
            defaultValue: 1,
            validator: function (value) { return (value >= 0 && value <= 2); }
        }
    ));
    optionManager.add(new vimperator.Option(["showtabline", "stal"], "number",
        {
            shortHelp: "Control when to show the tab bar of opened web pages",
            help: "Possible values:<br/>" +
                  "<ul>" +
                  "<li><b>0</b>: Never show tab bar</li>" +
                  "<li><b>1</b>: Show tab bar only if more than one tab is open</li>" +
                  "<li><b>2</b>: Always show tab bar</li>" +
                  "</ul>",
            setter: function (value) { setShowTabline(value); },
            defaultValue: 2,
            validator: function (value) { return (value >= 0 && value <= 2); }
        }
    ));
    optionManager.add(new vimperator.Option(["smartcase", "scs"], "boolean",
        {
            shortHelp: "Override the 'ignorecase' option if the pattern contains uppercase characters",
            help: "This is only used if the <code class=\"option\">'ignorecase'</code> option is set.",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["titlestring"], "string",
        {
            shortHelp: "Change the title of the browser window",
            help: "Vimperator changes the browser title from \"Title of web page - Mozilla Firefox\" to " +
                  "\"Title of web page - Vimperator\".<br/>If you don't like that, you can restore it with: " +
                  "<code class=\"command\">:set titlestring=Mozilla Firefox</code>.",
            setter: function (value) { setTitleString(value); },
            defaultValue: "Vimperator"
        }
    ));
    optionManager.add(new vimperator.Option(["usermode", "um"], "boolean",
        {
            shortHelp: "Show current website with a minimal style sheet to make it easily accessible",
            help: "Note that this is a local option for now, later it may be split into a global and <code class=\"command\">:setlocal</code> part",
            setter: function (value) { getMarkupDocumentViewer().authorStyleDisabled = value; },
            getter: function () { return getMarkupDocumentViewer().authorStyleDisabled; },
            defaultValue: false
        }
    ));
    optionManager.add(new vimperator.Option(["verbose", "vbs"], "number",
        {
            shortHelp: "Define which type of messages are logged",
            help: "When bigger than zero, Vimperator will give messages about what it is doing. They are printed to the error console which can be shown with <code class=\"command\">:javascript!</code>.<br/>" +
                  "The highest value is 9, being the most verbose mode.",
            defaultValue: 0,
            validator: function (value) { return (value >= 0 && value <= 9); }
        }
    ));
    optionManager.add(new vimperator.Option(["visualbell", "vb"], "boolean",
        {
            shortHelp: "Use visual bell instead of beeping on errors",
            setter: function (value) { vimperator.options.setFirefoxPref("accessibility.typeaheadfind.enablesound", !value); },
            defaultValue: false
        }
    ));
    optionManager.add(new vimperator.Option(["wildmode", "wim"], "stringlist",
        {
            shortHelp: "Define how command line completion works",
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
            defaultValue: "list:full",
            validator: function (value)
            {
                return value.split(",").every(function (item) { return /^(full|longest|list|list:full|list:longest|)$/.test(item); });
            }
        }
    ));
    optionManager.add(new vimperator.Option(["wildoptions", "wop"], "stringlist",
        {
            shortHelp: "Change how command line completion is done",
            help: "A list of words that change how command line completion is done.<br/>" +
                  "Currently only one word is allowed:<br/>" +
                  "<table>" +
                  "<tr><td><b>sort</b></td><td>Always sorts completion list, overriding the <code class=\"option\">'complete'</code> option.</td></tr>" +
                  "</table>",
            defaultValue: "",
            validator: function (value) { return /^(sort|)$/.test(value); }
        }
    ));
    //}}}

    // we start with an "empty" GUI so that no toolbars or tabbar is shown if the user
    // sets them to empty in the .vimperatorrc, which is sourced asynchronously
    setShowTabline(0);
    setGuiOptions("");
    setLastStatus(0);
    guioptionsDone = showtablineDone = laststatusDone = false;

    setTitleString(optionManager.titlestring);
    setPopups(optionManager.popups);

    return optionManager;
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
