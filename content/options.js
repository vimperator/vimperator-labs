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

vimperator.Option = function (names, type, extraInfo) //{{{
{
    if (!names || !type)
        return null;

    var value = null;

    this.name = names[0];
    this.names = names;
    this.type = type;

    if (extraInfo)
    {
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

    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                     .getService(Components.interfaces.nsIPrefBranch);
    var preferences = prefService.getDefaultBranch("");

    var options = [];

    // save if we already changed a GUI related option, used for setInitialGUI
    var guioptionsDone = false, showtablineDone = false, laststatusDone = false;

    function optionsIterator()
    {
        for (var i = 0; i < options.length; i++)
            yield options[i];

        throw StopIteration;
    }

    function storePreference(name, value)
    {
        var type = prefService.getPrefType(name);
        switch (typeof value)
        {
            case "string":
                if (type == prefService.PREF_INVALID || type == prefService.PREF_STRING)
                    prefService.setCharPref(name, value);
                else if (type == prefService.PREF_INT)
                    vimperator.echoerr("E521: Number required after =: " + name + "=" + value);
                else
                    vimperator.echoerr("E474: Invalid argument: " + name + "=" + value);
                break;
            case "number":
                if (type == prefService.PREF_INVALID || type == prefService.PREF_INT)
                    prefService.setIntPref(name, value);
                else
                    vimperator.echoerr("E474: Invalid argument: " + name + "=" + value);
                break;
            case "boolean":
                if (type == prefService.PREF_INVALID || type == prefService.PREF_BOOL)
                    prefService.setBoolPref(name, value);
                else if (type == prefService.PREF_INT)
                    vimperator.echoerr("E521: Number required after =: " + name + "=" + value);
                else
                    vimperator.echoerr("E474: Invalid argument: " + name + "=" + value);
                break;
            default:
                vimperator.echoerr("Unknown preference type: " + typeof value + " (" + name + "=" + value + ")");
        }
    }

    function loadPreference(name, forcedDefault)
    {
        var defaultValue = null;
        if (forcedDefault != null)  // this argument sets defaults for non-user settable options (like extensions.history.comp_history)
            defaultValue = forcedDefault;

        var type = prefService.getPrefType(name);
        try
        {
            switch (type)
            {
                case prefService.PREF_STRING:
                    var value = prefService.getComplexValue(name, Components.interfaces.nsISupportsString).data;
                    // Try in case it's a localized string (will throw an exception if not)
                    if (!prefService.prefIsLocked(name) && !prefService.prefHasUserValue(name) &&
                        /^chrome:\/\/.+\/locale\/.+\.properties/.test(value))
                            value = prefService.getComplexValue(name, Components.interfaces.nsIPrefLocalizedString).data;
                    return value;
                case prefService.PREF_INT:
                    return prefService.getIntPref(name);
                case prefService.PREF_BOOL:
                    return prefService.getBoolPref(name);
                default:
                    return defaultValue;
            }
        }
        catch (e)
        {
            return defaultValue;
        }
    }

    // show/hide the menubar, toolbar and bookmarks toolbar
    function setGuiOptions(value)
    {
        var guioptions = vimperator.config.guioptions || {};
        try
        {
            for (let option in guioptions)
                guioptions[option].forEach( function(elem) {
                    document.getElementById(elem).collapsed = (value.indexOf(option.toString()) < 0); });
        }
        catch (e) { }

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

        list: function (onlyNonDefault)
        {
            var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                       "<table><tr align=\"left\" class=\"hl-Title\"><th>--- Options ---</th></tr>";
            var name, value, def;

            for (var i = 0; i < options.length; i++)
            {
                name  = options[i].name;
                value = options[i].value;
                def   = options[i].defaultValue;

                if (onlyNonDefault && value == def)
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

        listPrefs: function (onlyNonDefault, filter)
        {
            if (!filter)
                filter = "";

            var prefArray = prefService.getChildList("", {value: 0});
            prefArray.sort();
            var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                "<table><tr align=\"left\" class=\"hl-Title\"><th>--- " + vimperator.config.hostApplication +
                " Options ---</th></tr>";
            var name, value;

            for (var i = 0; i < prefArray.length; i++)
            {
                var userValue = prefService.prefHasUserValue(prefArray[i]);
                if ((!onlyNonDefault || userValue) && prefArray[i].indexOf(filter) >= 0)
                {
                    name = prefArray[i];
                    value = this.getPref(name);
                    if (typeof value == "string")
                        value = value.substr(0,100).replace(/\n/g, " ");

                    value = vimperator.util.colorize(value, false);
                    defaultValue = loadPreference(name, null);

                    if (defaultValue == null)
                        defaultValue = "no default";
                    else
                        defaultValue = "default: " + defaultValue;

                    if (userValue)
                    {
                        list += "<tr><td>  <span style=\"font-weight: bold\">" + name + "</span>=" + value + "<span style=\"color: gray\">  (" + defaultValue + ")</span></td></tr>";
                    }
                    else
                        list += "<tr><td>  " + name + "=" + value + "</td></tr>";
                }
            }
            list += "</table>";
            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        },

        // this hack is only needed, because we need to do asynchronous loading of the .vimperatorrc
        setInitialGUI: function ()
        {
            if (vimperator.config.name != "Vimperator")
                return;

            if (!guioptionsDone)
                this.get("guioptions").reset();
            if (!laststatusDone)
                this.get("laststatus").reset();
            if (!showtablineDone)
                this.get("showtabline").reset();
        },

        // be better placed in the 'core' vimperator namespace somewhere?
        setPref: function (name, value)
        {
            return storePreference(name, value);
        },

        getPref: function (name, forcedDefault)
        {
            return loadPreference(name, forcedDefault);
        },

        resetPref: function (name)
        {
            return preferences.clearUserPref(name);
        },

        // this works only for booleans
        invertPref: function (name)
        {
            if (prefService.getPrefType(name) == prefService.PREF_BOOL)
                this.setPref(name, !this.getPref(name));
            else
                vimperator.echoerr("E488: Trailing characters: " + name + "!");
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
            defaultValue: "sfbh",
            validator: function (value) { return !/[^sfbh]/.test(value); }
        }
    ));
    optionManager.add(new vimperator.Option(["defsearch", "ds"], "string",
        {
            shortHelp: "Set the default search engine",
            defaultValue: "google"
        }
    ));
    optionManager.add(new vimperator.Option(["editor"], "string",
        {
            shortHelp: "Set the external text editor",
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
            setter: function (value) { setGuiOptions(value); },
            defaultValue: "",
            validator: function (value)
            {
                var regex = "[^";
                for (let option in vimperator.config.guioptions)
                    regex += option.toString();

                return !(new RegExp(regex + "]").test(value));
            }
        }
    ));
    optionManager.add(new vimperator.Option(["hinttimeout", "hto"], "number",
        {
            shortHelp: "Automatically follow non unique numerical hint after {arg} ms",
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
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["insertmode", "im"], "boolean",
        {
            shortHelp: "Use Insert mode as the default for text areas",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["laststatus", "ls"], "number",
        {
            shortHelp: "Show the status line",
            defaultValue: 2,
            setter: function (value) { setLastStatus(value); },
            validator: function (value) { return (value >= 0 && value <= 2); }
        }
    ));
    optionManager.add(new vimperator.Option(["linksearch", "lks"], "boolean",
        {
            shortHelp: "Limit the search to hyperlink text",
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
            defaultValue: "\\bnext,^>$,^(>>|»)$,^(>|»),(>|»)$"
        }
    ));
    optionManager.add(new vimperator.Option(["pageinfo", "pa"], "charlist",
        {
            shortHelp: "Desired info on :pa[geinfo]",
            defaultValue: "gfm",
            validator: function (value) { return !(/[^gfm]/.test(value) || value.length > 3 || value.length < 1); }
        }
    ));
    optionManager.add(new vimperator.Option(["popups", "pps"], "number",
        {
            shortHelp: "Where to show requested popup windows",
            defaultValue: 1,
            setter: function (value) { setPopups(value); },
            validator: function (value) { return (value >= 0 && value <= 3); }
        }
    ));
    optionManager.add(new vimperator.Option(["preload"], "boolean",
        {
            shortHelp: "Speed up first time history/bookmark completion",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["previewheight", "pvh"], "number",
        {
            shortHelp: "Default height for preview window",
            defaultValue: 10,
            validator: function (value) { return (value >= 1 && value <= 50); }
        }
    ));
    optionManager.add(new vimperator.Option(["previouspattern"], "stringlist",
        {
            shortHelp: "Patterns to use when guessing the 'previous' page in a document sequence",
            defaultValue: "\\bprev|previous\\b,^<$,^(<<|«)$,^(<|«),(<|«)$"
        }
    ));
    optionManager.add(new vimperator.Option(["scroll", "scr"], "number",
        {
            shortHelp: "Number of lines to scroll with <code class=\"mapping\">C-u</code> and <code class=\"mapping\">C-d</code> commands",
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
            defaultValue: 1,
            validator: function (value) { return (value >= 0 && value <= 2); }
        }
    ));
    optionManager.add(new vimperator.Option(["showtabline", "stal"], "number",
        {
            shortHelp: "Control when to show the tab bar of opened web pages",
            setter: function (value) { setShowTabline(value); },
            defaultValue: 2,
            validator: function (value) { return (value >= 0 && value <= 2); }
        }
    ));
    optionManager.add(new vimperator.Option(["smartcase", "scs"], "boolean",
        {
            shortHelp: "Override the 'ignorecase' option if the pattern contains uppercase characters",
            defaultValue: true
        }
    ));
    optionManager.add(new vimperator.Option(["titlestring"], "string",
        {
            shortHelp: "Change the title of the browser window",
            setter: function (value) { setTitleString(value); },
            defaultValue: "Vimperator"
        }
    ));
    optionManager.add(new vimperator.Option(["usermode", "um"], "boolean",
        {
            shortHelp: "Show current website with a minimal style sheet to make it easily accessible",
            setter: function (value) { getMarkupDocumentViewer().authorStyleDisabled = value; },
            getter: function () { return getMarkupDocumentViewer().authorStyleDisabled; },
            defaultValue: false
        }
    ));
    optionManager.add(new vimperator.Option(["verbose", "vbs"], "number",
        {
            shortHelp: "Define which type of messages are logged",
            defaultValue: 0,
            validator: function (value) { return (value >= 0 && value <= 9); }
        }
    ));
    optionManager.add(new vimperator.Option(["visualbell", "vb"], "boolean",
        {
            shortHelp: "Use visual bell instead of beeping on errors",
            setter: function (value) { vimperator.options.setPref("accessibility.typeaheadfind.enablesound", !value); },
            defaultValue: false
        }
    ));
    optionManager.add(new vimperator.Option(["wildmode", "wim"], "stringlist",
        {
            shortHelp: "Define how command line completion works",
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
            defaultValue: "",
            validator: function (value) { return /^(sort|)$/.test(value); }
        }
    ));
    //}}}

    // we start with an "empty" GUI so that no toolbars or tabbar is shown if the user
    // sets them to empty in the .vimperatorrc, which is sourced asynchronously
    if (vimperator.config.name != "Vimperator")
        return optionManager;

    setShowTabline(0);
    setGuiOptions("");
    setLastStatus(0);
    guioptionsDone = showtablineDone = laststatusDone = false;

    setTitleString(optionManager.titlestring);
    setPopups(optionManager.popups);

    return optionManager;
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
