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

// do NOT create instances of this class yourself, use the helper method
// options.add() instead
function Option(names, description, type, defaultValue, extraInfo) //{{{
{
    if (!names || !type)
        return null;

    if (!extraInfo)
        extraInfo = {};

    let cannonName = names[0];
    this.name = cannonName;
    this.names = names;
    this.type = type;
    this.scope = (extraInfo.scope & options.OPTION_SCOPE_BOTH) ||
                 options.OPTION_SCOPE_GLOBAL;
                 // XXX set to BOTH by default someday? - kstep
    this.description = description || "";

    // "", 0 are valid default values
    this.defaultValue = (defaultValue === undefined) ? null : defaultValue;

    this.setter = extraInfo.setter || null;
    this.getter = extraInfo.getter || null;
    this.completer = extraInfo.completer || null;
    this.validator = extraInfo.validator || null;

    // this property is set to true whenever the option is first set
    // useful to see whether it was changed by some rc file
    this.hasChanged = false;

    // add no{option} variant of boolean {option} to this.names
    if (this.type == "boolean")
    {
        this.names = []; // reset since order is important
        for (let i = 0; i < names.length; i++)
        {
            this.names.push(names[i]);
            this.names.push("no" + names[i]);
        }
    }

    this.__defineGetter__("globalvalue", function () options.store.get(cannonName));
    this.__defineSetter__("globalvalue", function (val) { options.store.set(cannonName, val); });
    if (this.globalvalue == undefined)
        this.globalvalue = this.defaultValue;

    this.get = function (scope)
    {
        if (scope)
        {
            if ((scope & this.scope) == 0) // option doesn't exist in this scope
                return null;
        }
        else
        {
            scope = this.scope;
        }

        var aValue;

        if (liberator.has("tabs") && (scope & options.OPTION_SCOPE_LOCAL))
            aValue = tabs.options[this.name];
        if ((scope & options.OPTION_SCOPE_GLOBAL) && (aValue == undefined))
            aValue = this.globalvalue;

        if (this.getter)
            this.getter.call(this, aValue);

        return aValue;
    };

    this.set = function (newValue, scope)
    {
        scope = scope || this.scope;
        if ((scope & this.scope) == 0) // option doesn't exist in this scope
            return null;

        if (this.setter)
        {
            let tmpValue = newValue;
            newValue = this.setter.call(this, newValue);

            if (newValue === undefined)
            {
                newValue = tmpValue;
                liberator.log("DEPRECATED: '" + this.name + "' setter should return a value");
            }
        }

        if (liberator.has("tabs") && (scope & options.OPTION_SCOPE_LOCAL))
            tabs.options[this.name] = newValue;
        if ((scope & options.OPTION_SCOPE_GLOBAL) && newValue != this.globalValue)
            this.globalvalue = newValue;

        this.hasChanged = true;
    };

    this.has = function ()
    {
        let value = this.value;
        if (this.type == "stringlist")
            value = this.value.split(",");
        /* Return whether some argument matches */
        return Array.some(arguments, function (val) value.indexOf(val) >= 0);
    };

    this.__defineGetter__("value", this.get);
    this.__defineSetter__("value", this.set);

    this.hasName = function (name)
    {
        return this.names.indexOf(name) >= 0;
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

function Options() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var prefService = Components.classes["@mozilla.org/preferences-service;1"]
                                .getService(Components.interfaces.nsIPrefBranch);
    var optionHash = {};

    function optionObserver(key, event, option)
    {
        // Trigger any setters.
        let opt = options.get(option);
        if (event == "change" && opt)
            opt.set(opt.value, options.OPTION_SCOPE_GLOBAL)
    }

    storage.newMap("options", false);
    storage.addObserver("options", optionObserver);
    liberator.registerObserver("shutdown", function () {
        storage.removeObserver("options", optionObserver)
    });

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
        var defaultValue = null; // XXX
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
                    // try in case it's a localized string (will throw an exception if not)
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
    {
        storePreference("dom.popup_allowed_events", popupAllowedEvents + " keypress");
        liberator.registerObserver("shutdown", function ()
        {
            if (loadPreference("dom.popup_allowed_events", "")
                    == popupAllowedEvents + " keypress")
                storePreference("dom.popup_allowed_events", popupAllowedEvents);
        });
    }

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

    commands.add(["let"],
        "Set or list a variable",
        function (args)
        {
            args = args.string;

            if (!args)
            {
                var str =
                    <table>
                    {
                        template.map(liberator.globalVariables, function ([i, value]) {
                            let prefix = typeof value == "number"   ? "#" :
                                         typeof value == "function" ? "*" :
                                                                      " ";
                            return <tr>
                                        <td style="width: 200px;">{i}</td>
                                        <td>{prefix}{value}</td>
                                   </tr>
                        })
                    }
                    </table>;
                if (str.*.length())
                    liberator.echo(str, commandline.FORCE_MULTILINE);
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
                    if (expr === undefined)
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
                let prefix = typeof value == "number"   ? "#" :
                             typeof value == "function" ? "*" :
                                                          " ";
                liberator.echo(reference[1] + "\t\t" + prefix + value);
            }
        });

    commands.add(["pref[erences]", "prefs"],
        "Show " + config.hostApplication + " preferences",
        function (args, special)
        {
            if (special) // open Firefox settings GUI dialog
            {
                liberator.open("about:config",
                    (options["newtab"] && options.get("newtab").has("all", "prefs"))
                            ? liberator.NEW_TAB : liberator.CURRENT_TAB);
            }
            else
            {
                openPreferences();
            }
        },
        {
            argCount: "0",
            bang: true
        });

    commands.add(["setl[ocal]"],
        "Set local option",
        function (args, special, count)
        {
            commands.get("set").execute(args.string, special, count, { scope: options.OPTION_SCOPE_LOCAL });
        },
        {
            bang: true,
            count: true,
            completer: function (filter, special, count)
            {
                return commands.get("set").completer(filter, special, count, { scope: options.OPTION_SCOPE_LOCAL });
            }
        }
    );

    commands.add(["setg[lobal]"],
        "Set global option",
        function (args, special, count)
        {
            commands.get("set").execute(args.string, special, count, { scope: options.OPTION_SCOPE_GLOBAL });
        },
        {
            bang: true,
            count: true,
            completer: function (filter, special, count)
            {
                return commands.get("set").completer(filter, special, count, { scope: options.OPTION_SCOPE_GLOBAL });
            }
        }
    );

    // FIXME: Integrate with setter
    function parseOpt(args, modifiers)
    {
        let ret = {};
        let matches, prefix, postfix, valueGiven;

        [matches, prefix, ret.name, postfix, valueGiven, ret.operator, ret.value] =
        args.match(/^\s*(no|inv)?([a-z_]+)([?&!])?\s*(([-+^]?)=(.*))?\s*$/) || [];

        ret.args = args;
        ret.onlyNonDefault = false; // used for :set to print non-default options
        if (!args)
        {
            ret.name = "all";
            ret.onlyNonDefault = true;
        }

        if (matches)
            ret.option = options.get(ret.name, ret.scope);

        ret.prefix = prefix;
        ret.postfix = postfix;

        ret.all = (ret.name == "all")
        ret.get = (ret.all || postfix == "?" || (ret.option && ret.option.type != "boolean" && !valueGiven))
        ret.invert = (prefix == "inv" || postfix == "!");
        ret.reset = (postfix == "&");
        ret.unsetBoolean = (prefix == "no");

        ret.scope = modifiers && modifiers.scope;

        if (!ret.option)
            return ret;

        if (ret.value === undefined)
            ret.value = "";

        ret.optionValue = ret.option.get(ret.scope);

        switch (ret.option.type)
        {
            case "stringlist":
                ret.optionHas = ret.optionValue.split(",");
                ret.valueHas = ret.value.split(",");
                break;
            case "charlist":
                ret.optionHas = Array.slice(ret.optionValue);
                ret.valueHas = Array.slice(ret.value);
                break;
        }

        return ret;
    }

    // TODO: support setting multiple options at once
    commands.add(["se[t]"],
        "Set an option",
        function (args, special, count, modifiers)
        {
            args = args.string;

            if (special)
            {
                var onlyNonDefault = false;
                if (!args)
                {
                    args = "all";
                    onlyNonDefault = true;
                }

                let [matches, name, postfix, valueGiven, operator, value] =
                args.match(/^\s*?([a-zA-Z0-9\.\-_{}]+)([?&!])?\s*(([-+^]?)=(.*))?\s*$/);
                let reset = (postfix == "&");
                let invertBoolean = (postfix == "!");

                if (name == "all" && reset)
                    liberator.echoerr("You can't reset all options, it could make " + config.hostApplication + " unusable.");
                else if (name == "all")
                    options.listPrefs(onlyNonDefault, "");
                else if (reset)
                    options.resetPref(name);
                else if (invertBoolean)
                    options.invertPref(name);
                else if (valueGiven)
                {
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
                    options.setPref(name, value);
                }
                else
                {
                    options.listPrefs(onlyNonDefault, name);
                }
                return;
            }

            let opt = parseOpt(args, modifiers);
            if (!opt)
            {
                liberator.echoerr("Error parsing :set command: " + args);
                return;
            }

            let option = opt.option;
            if (option == null && !opt.all)
            {
                liberator.echoerr("No such option: " + opt.name);
                return;
            }

            // reset a variable to its default value
            if (opt.reset)
            {
                if (opt.all)
                {
                    for (let option in options)
                        option.reset();
                }
                else
                {
                    option.reset();
                }
            }
            // read access
            else if (opt.get)
            {
                if (opt.all)
                {
                    options.list(opt.onlyNonDefault, opt.scope);
                }
                else
                {
                    if (option.type == "boolean")
                        liberator.echo((opt.optionValue ? "  " : "no") + option.name);
                    else
                        liberator.echo("  " + option.name + "=" + opt.optionValue);
                }
            }
            // write access
            // NOTE: the behavior is generally Vim compatible but could be
            // improved. i.e. Vim's behavior is pretty sloppy to no real benefit
            else
            {
                let currentValue = opt.optionValue;
                let newValue;

                switch (option.type)
                {
                    case "boolean":
                        if (opt.valueGiven)
                        {
                            liberator.echoerr("E474: Invalid argument: " + args);
                            return;
                        }

                        if (opt.invert)
                            newValue = !currentValue;
                        else
                            newValue = !opt.unsetBoolean;

                        break;

                    case "number":
                        let value = parseInt(opt.value); // deduce radix

                        if (isNaN(value))
                        {
                            liberator.echoerr("E521: Number required after =: " + args);
                            return;
                        }

                        switch (opt.operator)
                        {
                            case "+":
                                newValue = currentValue + value;
                                break;
                            case "-":
                                newValue = currentValue - value;
                                break;
                            case "^":
                                newValue = currentValue * value;
                                break;
                            default:
                                newValue = value;
                                break;
                        }

                        break;

                    case "charlist":
                    case "stringlist":
                        switch (opt.operator)
                        {
                            case "+":
                                newValue = util.uniq(Array.concat(opt.optionHas, opt.valueHas), true);
                                break;
                            case "^":
                                // NOTE: Vim doesn't prepend if there's a match in the current value
                                newValue = util.uniq(Array.concat(opt.valueHas, opt.optionHas), true);
                                break;
                            case "-":
                                newValue = opt.optionHas.filter(function (item) opt.valueHas.indexOf(item) == -1);
                                break;
                            default:
                                newValue = opt.valueHas;
                                if (opt.invert)
                                {
                                    let keepValues = opt.optionHas.filter(function (item) opt.valueHas.indexOf(item) == -1);
                                    let addValues  = opt.valueHas .filter(function (item) opt.optionHas.indexOf(item) == -1);
                                    newValue = addValues.concat(keepValues);
                                }
                                break;
                        }
                        newValue = newValue.filter(function (x) x != "").join(option.type == "charlist" ? "" : ",");

                        break;

                    case "string":
                        switch (opt.operator)
                        {
                            case "+":
                                newValue = currentValue + opt.value;
                                break;
                            case "-":
                                newValue = currentValue.replace(opt.value, "");
                                break;
                            case "^":
                                newValue = opt.value + currentValue;
                                break;
                            default:
                                newValue = opt.value;
                                break;
                        }

                        break;

                    default:
                        liberator.echoerr("E685: Internal error: option type `" + option.type + "' not supported");
                }

                if (option.isValidValue(newValue))
                {
                    option.set(newValue, opt.scope);
                }
                else
                    // FIXME: need to be able to specify more specific errors
                    liberator.echoerr("E474: Invalid argument: " + args);
            }
        },
        {
            bang: true,
            completer: function (filter, special, count, modifiers)
            {
                var optionCompletions = [];

                if (prefix)
                    filter = filter.replace(ret.prefix, "");

                if (special) // list completions for about:config entries
                {
                    var prefs = Components.classes["@mozilla.org/preferences-service;1"]
                                          .getService(Components.interfaces.nsIPrefBranch);
                    var prefArray = prefs.getChildList("", { value: 0 });
                    prefArray.sort();

                    if (filter.length > 0 && filter.lastIndexOf("=") == filter.length - 1)
                    {
                        for (let [,name] in Iterator(prefArray))
                        {
                            if (name.match("^" + filter.substr(0, filter.length - 1) + "$" ))
                            {
                                let value = options.getPref(name) + "";
                                return [filter.length + 1, [[value, ""]]];
                            }
                        }
                        return [0, []];
                    }

                    optionCompletions = prefArray.map(function (pref)
                        [pref, options.getPref(pref)]);

                    return [0, completion.filter(optionCompletions, filter)];
                }

                let prefix = (filter.match(/^(no|inv)/) || [""])[0];
                if (prefix)
                    filter = filter.substr(prefix.length);

                let scope = modifiers && modifiers.scope || options.OPTION_SCOPE_BOTH;

                let opts = (opt for (opt in options)
                                if ((opt.scope & scope) && (!prefix || opt.type == "boolean" || prefix == "inv" && /list$/.test(opt.type))));

                if (!filter)
                {
                    let opts = [[prefix + option.name, option.description]
                                        for (option in opts)];
                    return [0, opts];
                }
                else if (filter.indexOf("=") == -1)
                {
                    for (let option in opts)
                        optionCompletions.push([[prefix + name, option.description]
                            for each (name in option.names)
                            if (name.indexOf(filter) == 0)]);
                    // Flatten array.
                    optionCompletions = Array.concat.apply(Array, optionCompletions);

                    return [0, completion.filter(optionCompletions, prefix + filter, true)];
                }
                else if (prefix == "no")
                    return;

                let [name, value] = filter.split("=", 2);
                let offset = name.length + 1;
                let opt = parseOpt(filter, modifiers);
                let option = opt.option;

                commandline.highlight(0, 0, "SPELLCHECK");
                if (!option) /* FIXME: Kludge. */
                    commandline.highlight(0, name.length, "SPELLCHECK");

                if (opt.get || opt.reset || !option || prefix)
                    return [0, []];

                let completer = option.completer;

                let len = opt.value.length;

                switch (option.type)
                {
                    case "boolean":
                        completer = function () [["true", ""], ["false", ""]]
                        break;
                    case "stringlist":
                        len = opt.valueHas.pop().length;
                        break;
                    case "charlist":
                        len = 0;
                        break;
                }

                len = filter.length - len;
                filter = filter.substr(len);

                /* Not vim compatible, but is a significant enough improvement
                 * that it's worth breaking compatibility.
                 */
                let completions = [];
                if (!opt.value)
                    completions = [[option.value, "Current value"], [option.defaultValue, "Default value"]].filter(function (f) f[0]);

                if (completer)
                {
                    completions = completions.concat(completer(filter));
                    if (opt.optionHas)
                    {
                        completions = completions.filter(function (val) opt.valueHas.indexOf(val[0]) == -1);
                        switch (opt.operator)
                        {
                            case "+":
                                completions = completions.filter(function (val) opt.optionHas.indexOf(val[0]) == -1);
                                break;
                            case "-":
                                completions = completions.filter(function (val) opt.optionHas.indexOf(val[0]) > -1);
                                break;
                        }
                    }
                }
                return [len, completion.filter(completions, filter, true)];
            }
        });

    commands.add(["unl[et]"],
        "Delete a variable",
        function (args, special)
        {
            //var names = args.split(/ /);
            //if (typeof names == "string") names = [names];

            //var length = names.length;
            //for (let i = 0, name = names[i]; i < length; name = names[++i])
            for (let i = 0; i < args.arguments.length; i++)
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
        {
            argCount: "+",
            bang: true
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        OPTION_SCOPE_GLOBAL: 1,
        OPTION_SCOPE_LOCAL:  2,
        OPTION_SCOPE_BOTH:   3,

        __iterator__: function ()
        {
            let sorted = [o for ([i, o] in Iterator(optionHash))].sort(function (a, b) String.localeCompare(a.name, b.name));
            return (v for ([k, v] in Iterator(sorted)));
        },

        add: function (names, description, type, defaultValue, extraInfo)
        {
            if (!extraInfo)
                extraInfo = {};

            let option = new Option(names, description, type, defaultValue, extraInfo);

            if (!option)
                return false;

            if (option.name in optionHash)
            {
                // never replace for now
                liberator.log("Warning: '" + names[0] + "' already exists, NOT replacing existing option.", 1);
                return false;
            }

            // quickly access options with options["wildmode"]:
            this.__defineGetter__(option.name, function () option.value);
            this.__defineSetter__(option.name, function (value) { option.value = value; });

            optionHash[option.name] = option;
            return true;
        },

        get: function (name, scope)
        {
            if (!scope)
                scope = options.OPTION_SCOPE_BOTH;

            if (name in optionHash)
                return (optionHash[name].scope & scope) && optionHash[name];

            for (let opt in Iterator(options))
            {
                if (opt.hasName(name))
                    return (opt.scope & scope) && opt;
            }

            return null;
        },

        list: function (onlyNonDefault, scope)
        {
            if (!scope)
                scope = options.OPTION_SCOPE_BOTH;

            let opts = function (opt) {
                for (let opt in Iterator(options))
                {
                    let option = {
                        isDefault: opt.value == opt.defaultValue,
                        name:      opt.name,
                        default:   opt.defaultValue,
                        pre:       "\u00a0\u00a0", /* Unicode nonbreaking space. */
                        value:     <></>
                    };

                    if (onlyNonDefault && option.isDefault)
                        continue;
                    if (!(opt.scope & scope))
                        continue;

                    if (opt.type == "boolean")
                    {
                        if (!opt.value)
                            option.pre = "no";
                        option.default = (option.default ? "" : "no") + opt.name;
                    }
                    else
                    {
                        option.value = <>={template.highlight(opt.value)}</>;
                    }
                    yield option;
                }
            }

            let list = template.options("Options", opts());
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },

        listPrefs: function (onlyNonDefault, filter)
        {
            if (!filter)
                filter = "";

            var prefArray = prefService.getChildList("", { value: 0 });
            prefArray.sort();
            let prefs = function () {
                for each (let pref in prefArray)
                {
                    var userValue = prefService.prefHasUserValue(pref);
                    if (onlyNonDefault && !userValue || pref.indexOf(filter) == -1)
                        continue;

                    value = options.getPref(pref);
                    if (typeof value == "string")
                        value = value.substr(0, 100).replace(/\n/g, " ");

                    let option = {
                        isDefault: !userValue,
                        default:   loadPreference(pref, null, true),
                        value:     <>={template.highlight(value)}</>,
                        name:      pref,
                        pre:       "\u00a0\u00a0" /* Unicode nonbreaking space. */
                    };

                    yield option;
                }
            }

            let list = template.options(config.hostApplication + " Options", prefs());
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },

        get store() storage.options,

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
