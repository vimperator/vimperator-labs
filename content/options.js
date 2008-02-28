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

// Do NOT create instances of this class yourself, use the helper method
// vimperator.options.add() instead
vimperator.Option = function (names, description, type, defaultValue, getter, setter, validator, completer)
{
    if (!names || !type)
        return null;

    var value = null;

    this.name = names[0];
    this.names = names;
    this.type = type;
    this.shortHelp = description || "";

    // "", 0 are valid default values
    this.defaultValue = (defaultValue === undefined) ? null : defaultValue;
    value = this.defaultValue;

    this.setter = setter || null;
    this.getter = getter || null;
    this.completer = completer || null;
    this.validator = validator || null;

    // this property is set to true whenever the option is first set
    // useful to see whether it was changed by some rc file
    this.hasChanged = false;

    // add noOPTION variant of boolean OPTION to this.names
    if (this.type == "boolean")
    {
        this.names = []; // reset since order is important
        for (var i = 0; i < names.length; i++)
        {
            this.names.push(names[i]);
            this.names.push("no" + names[i]);
        }
    }

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
            this.hasChanged = true;
            if (this.setter)
                this.setter.call(this, value);
        }
    );

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
    var options = [];

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

    function loadPreference(name, forcedDefault, defaultBranch)
    {
        var defaultValue = null;
        if (forcedDefault != null)  // this argument sets defaults for non-user settable options (like extensions.history.comp_history)
            defaultValue = forcedDefault;

        var branch = defaultBranch ? prefService.getDefaultBranch("") : prefService;
        var type = prefService.getPrefType(name);
        try
        {
            switch (type)
            {
                case prefService.PREF_STRING:
                    var value = branch.getComplexValue(name, Components.interfaces.nsISupportsString).data;
                    // Try in case it's a localized string (will throw an exception if not)
                    if (!prefService.prefIsLocked(name) && !prefService.prefHasUserValue(name) &&
                        /^chrome:\/\/.+\/locale\/.+\.properties/.test(value))
                            value = branch.getComplexValue(name, Components.interfaces.nsIPrefLocalizedString).data;
                    return value;
                case prefService.PREF_INT:
                    return branch.getIntPref(name);
                case prefService.PREF_BOOL:
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

    //
    // firefox preferences which need to be changed to work well with vimperator
    //

    // work around firefox popup blocker
    var popupAllowedEvents = loadPreference("dom.popup_allowed_events", "change click dblclick mouseup reset submit");
    if (!/keypress/.test(popupAllowedEvents))
        storePreference("dom.popup_allowed_events", popupAllowedEvents + " keypress");

    // TODO: maybe reset in .destroy()?
    // TODO: move to vim.js or buffer.js
    // we have our own typeahead find implementation
    storePreference("accessibility.typeaheadfind.autostart", false);
    storePreference("accessibility.typeaheadfind", false); // actually the above setting should do it, but has no effect in firefox

    // start with saved session
    storePreference("browser.startup.page", 3);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.commands.add(["pref[erences]", "prefs"],
        "Show " + vimperator.config.appName + " Preferences",
        function (args, special, count, modifiers)
        {
            if (!args)
            {
                // TODO: copy these snippets to more function which should work with :tab xxx
                if (modifiers && modifiers.inTab)
                {
                    vimperator.open(special ? "about:config" :
                        "chrome://browser/content/preferences/preferences.xul", vimperator.NEW_TAB);
                }
                else
                {
                    if (special) // open firefox settings gui dialog
                        vimperator.open("about:config", vimperator.CURRENT_TAB);
                    else
                        openPreferences();
                }
            }
            else
            {
                vimperator.echoerr("E488: Trailing characters");
            }
        });

    // TODO: support setting multiple options at once
    vimperator.commands.add(["se[t]"],
        "Set an option",
        function (args, special, count, modifiers)
        {
            if (special)
            {
                var onlyNonDefault = false;
                if (!args)
                {
                    args = "all";
                    onlyNonDefault = true;
                }
                //                                1                    2       3  4       5
                var matches = args.match(/^\s*?([a-zA-Z0-9\.\-_{}]+)([?&!])?\s*(([+-^]?)=(.*))?\s*$/);
                var name = matches[1];
                var reset = false;
                var invertBoolean = false;

                if (matches[2] == "&")
                    reset = true;
                else if (matches[2] == "!")
                    invertBoolean = true;

                if (name == "all" && reset)
                    vimperator.echoerr("You can't reset all the firefox options, it could make your browser unusable.");
                else if (name == "all")
                    vimperator.options.listPrefs(onlyNonDefault, "");
                else if (reset)
                    vimperator.options.resetPref(name);
                else if (invertBoolean)
                    vimperator.options.invertPref(name);
                else if (matches[3])
                {
                    var value = matches[5];
                    switch (value)
                    {
                        case undefined:
                            value = "";
                            break;
                        case "true":
                            value = true;
                            break;
                        case "false":
                            value = false;
                            break;
                        default:
                            var valueInt = parseInt(value, 10);
                            if (!isNaN(valueInt))
                                value = valueInt;
                    }
                    vimperator.options.setPref(name, value);
                }
                else
                {
                    vimperator.options.listPrefs(onlyNonDefault, name);
                }
                return;
            }

            var onlyNonDefault = false; // used for :set to print non-default options
            if (!args)
            {
                args = "all";
                onlyNonDefault = true;
            }

            //                               1        2       3       4  5       6
            var matches = args.match(/^\s*(no|inv)?([a-z]+)([?&!])?\s*(([+-^]?)=(.*))?\s*$/);
            if (!matches)
            {
                vimperator.echoerr("E518: Unknown option: " + args);
                return;
            }

            var unsetBoolean = false;
            if (matches[1] == "no")
                unsetBoolean = true;

            var name = matches[2];
            var all = false;
            if (name == "all")
                all = true;

            var option = vimperator.options.get(name);
            if (!option && !all)
            {
                vimperator.echoerr("E518: Unknown option: " + args);
                return;
            }

            var valueGiven = !!matches[4];

            var get = false;
            if (all || matches[3] == "?" || (option.type != "boolean" && !valueGiven))
                get = true;

            var reset = false;
            if (matches[3] == "&")
                reset = true;

            var invertBoolean = false;
            if (matches[1] == "inv" || matches[3] == "!")
                invertBoolean = true;

            var operator = matches[5];

            var value = matches[6];
            if (value === undefined)
                value = "";

            // reset a variable to its default value
            if (reset)
            {
                if (all)
                {
                    for (let option in vimperator.options)
                        option.reset();
                }
                else
                {
                    option.reset();
                }
            }
            // read access
            else if (get)
            {
                if (all)
                {
                    vimperator.options.list(onlyNonDefault);
                }
                else
                {
                    if (option.type == "boolean")
                        vimperator.echo((option.value ? "  " : "no") + option.name);
                    else
                        vimperator.echo("  " + option.name + "=" + option.value);
                }
            }
            // write access
            // NOTE: the behaviour is generally Vim compatible but could be
            // improved. i.e. Vim's behaviour is pretty sloppy to no real
            // benefit
            else
            {
                var currentValue = option.value;
                var newValue;

                switch (option.type)
                {
                    case "boolean":
                        if (valueGiven)
                        {
                            vimperator.echoerr("E474: Invalid argument: " + args);
                            return;
                        }

                        if (invertBoolean)
                            newValue = !option.value;
                        else
                            newValue = !unsetBoolean;

                        break;

                    case "number":
                        value = parseInt(value);

                        if (isNaN(value))
                        {
                            vimperator.echoerr("E521: Number required after =: " + args);
                            return;
                        }

                        if (operator == "+")
                            newValue = currentValue + value;
                        else if (operator == "-")
                            newValue = currentValue - value;
                        else if (operator == "^")
                            newValue = currentValue * value;
                        else
                            newValue = value;

                        break;

                    case "charlist":
                        if (operator == "+")
                            newValue = currentValue.replace(new RegExp("[" + value + "]", "g"), "") + value;
                        else if (operator == "-")
                            newValue = currentValue.replace(value, "");
                        else if (operator == "^")
                            // NOTE: Vim doesn't prepend if there's a match in the current value
                            newValue = value + currentValue.replace(new RegExp("[" + value + "]", "g"), "");
                        else
                            newValue = value;

                        break;

                    case "stringlist":
                        if (operator == "+")
                        {
                            if (!currentValue.match(value))
                                newValue = (currentValue ? currentValue + "," : "") + value;
                            else
                                newValue = currentValue;
                        }
                        else if (operator == "-")
                        {
                            newValue = currentValue.replace(new RegExp("^" + value + ",?|," + value), "");
                        }
                        else if (operator == "^")
                        {
                            if (!currentValue.match(value))
                                newValue = value + (currentValue ? "," : "") + currentValue;
                            else
                                newValue = currentValue;
                        }
                        else
                        {
                            newValue = value;
                        }

                        break;

                    case "string":
                        if (operator == "+")
                            newValue = currentValue + value;
                        else if (operator == "-")
                            newValue = currentValue.replace(value, "");
                        else if (operator == "^")
                            newValue = value + currentValue;
                        else
                            newValue = value;

                        break;

                    default:
                        vimperator.echoerr("E685: Internal error: option type `" + option.type + "' not supported");
                }

                if (option.isValidValue(newValue))
                    option.value = newValue;
                else
                    // FIXME: need to be able to specify more specific errors
                    vimperator.echoerr("E474: Invalid argument: " + args);
            }
        },
        {
            completer: function (filter, special) { return vimperator.completion.option(filter, special); }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        __iterator__: function ()
        {
            for (var i = 0; i < options.length; i++)
                yield options[i];

            throw StopIteration;
        },

        add: function (names, description, type, defaultValue, extraInfo)
        {
            if (!extraInfo)
                extraInfo = {};

            var option = new vimperator.Option(names, description, type, defaultValue,
                                               extraInfo.getter, extraInfo.setter, extraInfo.validator);

            // quickly access options with vimperator.options["wildmode"]:
            this.__defineGetter__(option.name, function () { return option.value; });
            this.__defineSetter__(option.name, function (value) { option.value = value; });

            // TODO: sort option
            options.push(option);
        },

        destroy: function ()
        {
            // reset some modified firefox prefs
            if (loadPreference("dom.popup_allowed_events", "change click dblclick mouseup reset submit")
                    == popupAllowedEvents + " keypress")
                storePreference("dom.popup_allowed_events", popupAllowedEvents);
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
            var name, value, defaultValue;

            for (var i = 0; i < prefArray.length; i++)
            {
                var userValue = prefService.prefHasUserValue(prefArray[i]);
                if ((!onlyNonDefault || userValue) && prefArray[i].indexOf(filter) >= 0)
                {
                    name = prefArray[i];
                    value = this.getPref(name);
                    if (typeof value == "string")
                        value = value.substr(0, 100).replace(/\n/g, " ");

                    value = vimperator.util.colorize(value, true);
                    defaultValue = loadPreference(name, null, true);

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

        getPref: function (name, forcedDefault)
        {
            return loadPreference(name, forcedDefault);
        },

        setPref: function (name, value)
        {
            return storePreference(name, value);
        },

        resetPref: function (name)
        {
            return prefService.clearUserPref(name);
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
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
