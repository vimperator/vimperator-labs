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
// liberator.options.add() instead
liberator.Option = function (names, description, type, defaultValue, scope, getter, setter, validator, completer) //{{{
{
    if (!names || !type)
        return null;

    var value = null;

    this.name = names[0];
    this.names = names;
    this.type = type;
    this.scope = (scope & liberator.options.OPTION_SCOPE_BOTH) || liberator.options.OPTION_SCOPE_GLOBAL; // XXX set to BOTH by default someday? - kstep
    this.description = description || "";

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

    this.get = function (scope)
    {
        if (scope)
        {
            if ((scope & this.scope) == 0) // option doesn't exist in this scope
                return null;
        }
        else
            scope = this.scope;

        var aValue;

        if (liberator.has("tabs") && (scope & liberator.options.OPTION_SCOPE_LOCAL))
            aValue = liberator.tabs.options[this.name];
        if ((scope & liberator.options.OPTION_SCOPE_GLOBAL) && (aValue == undefined))
            aValue = value;

        if (this.getter)
            this.getter.call(this, aValue);

        return aValue;
    };

    this.set = function (newValue, scope)
    {
        if (scope)
        {
            if ((scope & this.scope) == 0) // option doesn't exist in this scope
                return null;
        }
        else
            scope = this.scope;

        if (liberator.has("tabs") && (scope & liberator.options.OPTION_SCOPE_LOCAL))
            liberator.tabs.options[this.name] = newValue;
        if (scope & liberator.options.OPTION_SCOPE_GLOBAL)
            value = newValue;

        this.hasChanged = true;
        if (this.setter)
            this.setter.call(this, newValue);
    };

    this.__defineGetter__("value", this.get);

    this.__defineSetter__("value", this.set);

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

liberator.Options = function () //{{{
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
                    liberator.echoerr("E521: Number required after =: " + name + "=" + value);
                else
                    liberator.echoerr("E474: Invalid argument: " + name + "=" + value);
                break;
            case "number":
                if (type == prefService.PREF_INVALID || type == prefService.PREF_INT)
                    prefService.setIntPref(name, value);
                else
                    liberator.echoerr("E474: Invalid argument: " + name + "=" + value);
                break;
            case "boolean":
                if (type == prefService.PREF_INVALID || type == prefService.PREF_BOOL)
                    prefService.setBoolPref(name, value);
                else if (type == prefService.PREF_INT)
                    liberator.echoerr("E521: Number required after =: " + name + "=" + value);
                else
                    liberator.echoerr("E474: Invalid argument: " + name + "=" + value);
                break;
            default:
                liberator.echoerr("Unknown preference type: " + typeof value + " (" + name + "=" + value + ")");
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

    liberator.commands.add(["let"],
        "Set or list a variable",
        function (args)
        {
            if (!args)
            {
                var str = "";
                for (var i in liberator.globalVariables)
                {
                    var value = liberator.globalVariables[i];
                    if (typeof value == "number")
                        var prefix = "#";
                    else if (typeof value == "function")
                        var prefix = "*";
                    else
                        var prefix = "";

                    str += "<tr><td style=\"width: 200px;\">" + i + "</td><td>" + prefix + value + "</td>\n";
                }
                if (str)
                    liberator.echo("<table>" + str + "</table>", liberator.commandline.FORCE_MULTILINE);
                else
                    liberator.echo("No variables found");
                return;
            }

            var matches;
            // 1 - type, 2 - name, 3 - +-., 4 - expr
            if (matches = args.match(/([$@&])?([\w:]+)\s*([-+.])?=\s*(.+)/))
            {
                if (!matches[1])
                {
                    var reference = liberator.variableReference(matches[2]);
                    if (!reference[0] && matches[3])
                    {
                        liberator.echoerr("E121: Undefined variable: " + matches[2]);
                        return;
                    }

                    var expr = liberator.evalExpression(matches[4]);
                    if (typeof expr === undefined)
                    {
                        liberator.echoerr("E15: Invalid expression: " + matches[4]);
                        return;
                    }
                    else
                    {
                        if (!reference[0])
                        {
                            if (reference[2] == "g")
                                reference[0] = liberator.globalVariables;
                            else
                                return; // for now
                        }

                        if (matches[3])
                        {
                            if (matches[3] == "+")
                                reference[0][reference[1]] += expr;
                            else if (matches[3] == "-")
                                reference[0][reference[1]] -= expr;
                            else if (matches[3] == ".")
                                reference[0][reference[1]] += expr.toString();
                        }
                        else
                            reference[0][reference[1]] = expr;
                    }
                }
            }
            // 1 - name
            else if (matches = args.match(/^\s*([\w:]+)\s*$/))
            {
                var reference = liberator.variableReference(matches[1]);
                if (!reference[0])
                {
                    liberator.echoerr("E121: Undefined variable: " + matches[1]);
                    return;
                }

                var value = reference[0][reference[1]];
                if (typeof value == "number")
                    var prefix = "#";
                else if (typeof value == "function")
                    var prefix = "*";
                else
                    var prefix = "";
                liberator.echo(reference[1] + "\t\t" + prefix + value);
            }
        });

    liberator.commands.add(["pref[erences]", "prefs"],
        "Show " + liberator.config.hostApplication + " preferences",
        function (args, special)
        {
            if (special) // open Firefox settings GUI dialog
            {
                liberator.open("about:config",
                    (liberator.options.newtab &&
                        (liberator.options.newtab == "all" || liberator.options.newtab.split(",").indexOf("prefs") != -1)) ?
                            liberator.NEW_TAB : liberator.CURRENT_TAB);
            }
            else
            {
                openPreferences();
            }
        },
        { argCount: "0" });

    liberator.commands.add(["setl[ocal]"],
        "Set local option",
        function (args, special, count)
        {
            liberator.commands.get("set").execute(args, special, count, { scope: liberator.options.OPTION_SCOPE_LOCAL });
        },
        {
            completer: function (filter, special, count)
            {
                return liberator.commands.get("set").completer(filter, special, count, { scope: liberator.options.OPTION_SCOPE_LOCAL });
            }
        }
    );

    liberator.commands.add(["setg[lobal]"],
        "Set global option",
        function (args, special, count)
        {
            liberator.commands.get("set").execute(args, special, count, { scope: liberator.options.OPTION_SCOPE_GLOBAL });
        },
        {
            completer: function (filter, special, count)
            {
                return liberator.commands.get("set").completer(filter, special, count, { scope: liberator.options.OPTION_SCOPE_GLOBAL });
            }
        }
    );

    // TODO: support setting multiple options at once
    liberator.commands.add(["se[t]"],
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
                var matches = args.match(/^\s*?([a-zA-Z0-9\.\-_{}]+)([?&!])?\s*(([-+^]?)=(.*))?\s*$/);
                var name = matches[1];
                var reset = false;
                var invertBoolean = false;

                if (matches[2] == "&")
                    reset = true;
                else if (matches[2] == "!")
                    invertBoolean = true;

                if (name == "all" && reset)
                    liberator.echoerr("You can't reset all options, it could make " + liberator.config.hostApplication + " unusable.");
                else if (name == "all")
                    liberator.options.listPrefs(onlyNonDefault, "");
                else if (reset)
                    liberator.options.resetPref(name);
                else if (invertBoolean)
                    liberator.options.invertPref(name);
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
                            if (/^\d+$/.test(value))
                                value = parseInt(value, 10);
                    }
                    liberator.options.setPref(name, value);
                }
                else
                {
                    liberator.options.listPrefs(onlyNonDefault, name);
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
            var matches = args.match(/^\s*(no|inv)?([a-z_]+)([?&!])?\s*(([-+^]?)=(.*))?\s*$/);
            if (!matches)
            {
                liberator.echoerr("E518: Unknown option: " + args);
                return;
            }

            var unsetBoolean = false;
            if (matches[1] == "no")
                unsetBoolean = true;

            var name = matches[2];
            var all = false;
            if (name == "all")
                all = true;

            var scope = liberator.options.OPTION_SCOPE_BOTH;
            if (modifiers && modifiers.scope)
                scope = modifiers.scope;

            var option = liberator.options.get(name, scope);

            if (!option && !all)
            {
                liberator.echoerr("E518: Unknown option: " + args);
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
                    for (let option in liberator.options)
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
                    liberator.options.list(onlyNonDefault, scope);
                }
                else
                {
                    if (option.type == "boolean")
                        liberator.echo((option.get(scope) ? "  " : "no") + option.name);
                    else
                        liberator.echo("  " + option.name + "=" + option.get(scope));
                }
            }
            // write access
            // NOTE: the behavior is generally Vim compatible but could be
            // improved. i.e. Vim's behavior is pretty sloppy to no real benefit
            else
            {
                var currentValue = option.get(scope);

                var newValue;

                switch (option.type)
                {
                    case "boolean":
                        if (valueGiven)
                        {
                            liberator.echoerr("E474: Invalid argument: " + args);
                            return;
                        }

                        if (invertBoolean)
                            newValue = !currentValue;
                        else
                            newValue = !unsetBoolean;

                        break;

                    case "number":
                        value = parseInt(value); // deduce radix

                        if (isNaN(value))
                        {
                            liberator.echoerr("E521: Number required after =: " + args);
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
                        liberator.echoerr("E685: Internal error: option type `" + option.type + "' not supported");
                }

                if (option.isValidValue(newValue))
                {
                    option.set(newValue, scope);
                }
                else
                    // FIXME: need to be able to specify more specific errors
                    liberator.echoerr("E474: Invalid argument: " + args);
            }
        },
        {
            completer: function (filter, special, count, modifiers)
            {
                var optionCompletions = [];
                var prefix = filter.match(/^no|inv/) || "";

                if (prefix)
                    filter = filter.replace(prefix, "");

                if (special) // list completions for about:config entries
                {
                    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                                          .getService(Components.interfaces.nsIPrefBranch);
                    var prefArray = prefs.getChildList("", { value: 0 });
                    prefArray.sort();

                    if (filter.length > 0 && filter.lastIndexOf("=") == filter.length - 1)
                    {
                        for (var i = 0; i < prefArray.length; i++)
                        {
                            var name = prefArray[i];
                            if (name.match("^" + filter.substr(0, filter.length - 1) + "$" ))
                            {
                                var value = liberator.options.getPref(name) + "";
                                return [filter.length + 1, [[value, ""]]];
                            }
                        }
                        return [0, []];
                    }

                    for (var i = 0; i < prefArray.length; i++)
                        optionCompletions.push([prefArray[i], liberator.options.getPref(prefArray[i])]);

                    return [0, liberator.completion.filter(optionCompletions, filter)];
                }

                var scope = liberator.options.OPTION_SCOPE_BOTH;
                if (modifiers && modifiers.scope)
                    scope = modifiers.scope;

                if (!filter)
                {
                    var options = [];

                    for (var option in liberator.options)
                    {
                        if (!(option.scope & scope))
                            continue;
                        if (prefix && option.type != "boolean")
                            continue;
                        options.push([prefix + option.name, option.description]);
                    }
                    return [0, options];
                }
                // check if filter ends with =, then complete current value
                else if (filter.length > 0 && filter.lastIndexOf("=") == filter.length - 1)
                {
                    filter = filter.substr(0, filter.length - 1);
                    for (var option in liberator.options)
                    {
                        if (!(option.scope & scope))
                            continue;
                        if (option.hasName(filter))
                        {
                            if (option.completer)
                                return [filter.length + 1, option.completer(filter)];
                            return [filter.length + 1, [[option.value + "", ""]]];
                        }
                    }
                    return [0, optionCompletions];
                }

                var filterLength = filter.length;
                for (var option in liberator.options)
                {
                    if (!(option.scope & scope))
                        continue;
                    if (prefix && option.type != "boolean")
                        continue;

                    for (var j = 0; j < option.names.length; j++)
                    {
                        if (option.names[j].indexOf(filter) != 0)
                            continue;

                        optionCompletions.push([prefix + option.names[j], option.description]);
                        break;
                    }
                }

                return [0, liberator.completion.filter(optionCompletions, prefix + filter, true)];
            }
        });

    liberator.commands.add(["unl[et]"],
        "Delete a variable",
        function (args, special)
        {
            //var names = args.split(/ /);
            //if (typeof names == "string") names = [names];

            //var length = names.length;
            //for (var i = 0, name = names[i]; i < length; name = names[++i])
            for (var i = 0; i < args.arguments.length; i++)
            {
                var name = args.arguments[i];
                var reference = liberator.variableReference(name);
                if (!reference[0])
                {
                    if (!special)
                        liberator.echoerr("E108: No such variable: " + name);
                    return;
                }

                delete reference[0][reference[1]];
            }
        },
        { argCount: "+" });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        OPTION_SCOPE_GLOBAL: 1,
        OPTION_SCOPE_LOCAL:  2,
        OPTION_SCOPE_BOTH:   3,

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

            var option = new liberator.Option(names, description, type, defaultValue, extraInfo.scope,
                                              extraInfo.getter, extraInfo.setter, extraInfo.validator, extraInfo.completer);

            if (!option)
                return false;

            for (var i = 0; i < options.length; i++)
            {
                if (options[i].name == option.name)
                {
                    // never replace for now
                    liberator.log("Warning: '" + names[0] + "' already exists, NOT replacing existing option.", 1);
                    return false;
                }
            }

            // quickly access options with liberator.options["wildmode"]:
            this.__defineGetter__(option.name, function () { return option.value; });
            this.__defineSetter__(option.name, function (value) { option.value = value; });

            // TODO: sort option
            options.push(option);
            return true;
        },

        destroy: function ()
        {
            // reset some modified firefox prefs
            if (loadPreference("dom.popup_allowed_events", "change click dblclick mouseup reset submit")
                    == popupAllowedEvents + " keypress")
                storePreference("dom.popup_allowed_events", popupAllowedEvents);
        },

        get: function (name, scope)
        {
            if (!scope)
                scope = liberator.options.OPTION_SCOPE_BOTH;

            for (var i = 0; i < options.length; i++)
            {
                if (options[i].hasName(name) && (options[i].scope & scope))
                    return options[i];
            }

            return null;
        },

        list: function (onlyNonDefault, scope)
        {
            var list = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                       "<table><tr align=\"left\" class=\"hl-Title\"><th>--- Options ---</th></tr>";
            var name, value, def;

            if (!scope)
                scope = liberator.options.OPTION_SCOPE_BOTH;

            for (var i = 0; i < options.length; i++)
            {
                name  = options[i].name;
                value = options[i].value;
                def   = options[i].defaultValue;

                if (onlyNonDefault && value == def)
                    continue;

                if (!(options[i].scope & scope))
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
                        value = liberator.util.colorize(value, false) + "<span style=\"color: gray\">  (default: " + def + ")</span>";
                    }
                    else
                        value = liberator.util.colorize(value, false);

                    list += "<tr><td>" + "  " + name + "=" + value + "</td></tr>";
                }
            }

            list += "</table>";

            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        },

        listPrefs: function (onlyNonDefault, filter)
        {
            if (!filter)
                filter = "";

            var prefArray = prefService.getChildList("", { value: 0 });
            prefArray.sort();
            var list = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                "<table><tr align=\"left\" class=\"hl-Title\"><th>--- " + liberator.config.hostApplication +
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

                    value = liberator.util.colorize(value, true);
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
            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
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
                liberator.echoerr("E488: Trailing characters: " + name + "!");
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
