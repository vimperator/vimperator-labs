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
// liberator.commands.add() instead
liberator.Command = function (specs, description, action, extraInfo) //{{{
{
    if (!specs || !action)
        return null;

    if (!extraInfo)
        extraInfo = {};

    // convert command name abbreviation specs of the form
    // 'shortname[optional-tail]' to short and long versions Eg. 'abc[def]' ->
    // 'abc', 'abcdef'
    var parseSpecs = function (specs)
    {
        var shortNames = [];
        var longNames  = [];
        var names = [];
        for (var i = 0; i < specs.length; i++)
        {
            var match;
            if (match = specs[i].match(/(\w+|!)\[(\w+)\]/))
            {
                shortNames.push(match[1]);
                longNames.push(match[1] + match[2]);
                // order as long1, short1, long2, short2
                names.push(match[1] + match[2]);
                names.push(match[1]);
            }
            else
            {
                longNames.push(specs[i]);
                names.push(specs[i]);
            }
        }
        return { names: names, longNames: longNames, shortNames: shortNames };
    };

    var expandedSpecs = parseSpecs(specs);
    this.specs      = specs;
    this.shortNames = expandedSpecs.shortNames;
    this.longNames  = expandedSpecs.longNames;

    // return the primary command name (the long name of the first spec listed)
    this.name          = this.longNames[0];
    this.names         = expandedSpecs.names; // return all command name aliases
    this.description   = description || "";
    this.action        = action;
    this.completer     = extraInfo.completer || null;
    this.args          = extraInfo.args || [];
    this.isUserCommand = extraInfo.isUserCommand || false;
};

liberator.Command.prototype = {

    execute: function (args, special, count, modifiers)
    {
        return this.action.call(this, args, special, count, modifiers);
    },

    // return true if the candidate name matches one of the command's aliases
    // (including all acceptable abbreviations)
    hasName: function (name)
    {
        // match a candidate name against a command name abbreviation spec - returning
        // true if the candidate matches unambiguously
        function matchAbbreviation(name, format)
        {
            var minimum = format.indexOf("[");                    // minumum number of characters for a command name match
            var fullname = format.replace(/\[(\w+)\]$/, "$1");    // full command name
            if (fullname.indexOf(name) == 0 && name.length >= minimum)
                return true;
            else
                return false;
        }

        for (var i = 0; i < this.specs.length; i++)
        {
            if (this.specs[i] == name)                       // literal command name
            {
                return true;
            }
            else if (/^(\w+|!)\[\w+\]$/.test(this.specs[i])) // abbreviation spec
            {
                if (matchAbbreviation(name, this.specs[i]))
                    return true;
            }
        }
        return false;
    }

};
//}}}

liberator.Commands = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var exCommands = [];

    // in '-quoted strings, only ' and \ itself are escaped
    // in "-quoted strings, also ", \n and \t are translated
    // in non-quoted strings everything is taken literally apart from "\ " and "\\"
    //
    // "options" is an array [name, type, validator, completions] and could look like:
    //  options = [[["-force"], OPTION_NOARG],
    //             [["-fullscreen", "-f"], OPTION_BOOL],
    //             [["-language"], OPTION_STRING, validateFunc, ["perl", "ruby"]],
    //             [["-speed"], OPTION_INT],
    //             [["-acceleration"], OPTION_FLOAT],
    //             [["-accessories"], OPTION_LIST, null, ["foo", "bar"]],
    //             [["-other"], OPTION_ANY]];
    // TODO: should it handle comments?
    // TODO: should it return an error, if it contains arguments which look like options (beginning with -)?
    function parseArgs(str, options)
    {
        // returns [count, parsed_argument]
        function getNextArg(str)
        {
            var inSingleString = false;
            var inDoubleString = false;
            var inEscapeKey = false;

            var arg = "";

            outer:
            for (var i = 0; i < str.length; i++)
            {
                switch (str[i])
                {
                    case "\"":
                        if (inEscapeKey)
                        {
                            inEscapeKey = false;
                            break;
                        }
                        if (!inSingleString)
                        {
                            inDoubleString = !inDoubleString;
                            continue outer;
                        }
                        break;

                    case "'":
                        if (inEscapeKey)
                        {
                            inEscapeKey = false;
                            break;
                        }
                        if (!inDoubleString)
                        {
                            inSingleString = !inSingleString;
                            continue outer;
                        }
                        break;

                    // \ is an escape key for non quoted or "-quoted strings
                    // for '-quoted strings it is taken literally, apart from \' and \\
                    case "\\":
                        if (inEscapeKey)
                        {
                            inEscapeKey = false;
                            break;
                        }
                        else
                        {
                            // only escape "\\" and "\ " in non quoted strings
                            if (!inSingleString && !inDoubleString && str[i + 1] != "\\" && str[i + 1] != " ")
                                continue outer;
                            // only escape "\\" and "\'" in single quoted strings
                            else if (inSingleString && str[i + 1] != "\\" && str[i + 1] != "'")
                                break;
                            else
                            {
                                inEscapeKey = true;
                                continue outer;
                            }
                        }
                        break;

                    default:
                        if (inSingleString)
                        {
                            inEscapeKey = false;
                            break;
                        }
                        else if (inEscapeKey)
                        {
                            inEscapeKey = false;
                            switch (str[i])
                            {
                                case "n": arg += "\n"; continue outer;
                                case "t": arg += "\t"; continue outer;
                                default:
                                    break; // this makes "a\fb" -> afb; wanted or should we return ab? --mst
                            }
                        }
                        else if (!inDoubleString && /\s/.test(str[i]))
                        {
                            return [i, arg];
                        }
                        else // a normal charcter
                            break;
                }
                arg += str[i];
            }

            // TODO: add parsing of a " comment here:
            if (inDoubleString || inSingleString)
                return [-1, "E114: Missing quote"];
            if (inEscapeKey)
                return [-1, "trailing \\"];
            else
                return [str.length, arg];
        }

        var args = []; // parsed arguments
        var opts = []; // parsed options
        if (!options)
            options = [];

        var invalid = false;
        var arg = null;
        var count = 0; // the length of the argument
        var i = 0;
        outer:
        while (i < str.length)
        {
            // skip whitespace
            if (/\s/.test(str[i]))
            {
                i++;
                continue;
            }

            var sub = str.substr(i);
            var optname = "";
            for (var opt = 0; opt < options.length; opt++)
            {
                for (var name = 0; name < options[opt][0].length; name++)
                {
                    optname = options[opt][0][name];
                    if (sub.indexOf(optname) == 0)
                    {
                        invalid = false;
                        arg = null;
                        // no value to the option
                        if (optname.length >= sub.length)
                        {
                            count = 0;
                        }
                        else if (sub[optname.length] == "=")
                        {
                            [count, arg] = getNextArg(sub.substr(optname.length + 1));
                            if (count == -1)
                            {
                                liberator.echoerr("Invalid argument for option " + optname);
                                return null;
                            }

                            count++; // to compensate the "=" character
                        }
                        else if (options[opt][1] != commandManager.OPTION_NOARG && /\s/.test(sub[optname.length]))
                        {
                            [count, arg] = getNextArg(sub.substr(optname.length + 1));
                            if (count == -1)
                            {
                                liberator.echoerr("Invalid argument for option " + optname);
                                return null;
                            }

                            // if we add the argument to an option after a space, it MUST not be empty
                            if (arg.length == 0)
                                arg = null;

                            count++; // to compensate the " " character
                        }
                        else
                        {
                            // this isn't really an option as it has trailing characters, parse it as an argument
                            invalid = true;
                        }

                        if (!invalid)
                        {
                            switch (options[opt][1]) // type
                            {
                            case commandManager.OPTION_NOARG:
                                if (arg != null)
                                {
                                    liberator.echoerr("No argument allowed for option: " + optname);
                                    return null;
                                }
                                break;
                            case commandManager.OPTION_BOOL:
                                if (arg == "true" || arg == "1" || arg == "on")
                                    arg = true;
                                else if (arg == "false" || arg == "0" || arg == "off")
                                    arg = false;
                                else
                                {
                                    liberator.echoerr("Invalid argument for boolean option: " + optname);
                                    return null;
                                }
                                break;
                            case commandManager.OPTION_STRING:
                                if (arg == null)
                                {
                                    liberator.echoerr("Argument required for string option: " + optname);
                                    return null;
                                }
                                break;
                            case commandManager.OPTION_INT:
                                arg = parseInt(arg, 10);
                                if (isNaN(arg))
                                {
                                    liberator.echoerr("Numeric argument required for integer option: " + optname);
                                    return null;
                                }
                                break;
                            case commandManager.OPTION_FLOAT:
                                arg = parseFloat(arg);
                                if (isNaN(arg))
                                {
                                    liberator.echoerr("Numeric argument required for float option: " + optname);
                                    return null;
                                }
                                break;
                            case commandManager.OPTION_LIST:
                                if (arg == null)
                                {
                                    liberator.echoerr("Argument required for list option: " + optname);
                                    return null;
                                }
                                arg = arg.split(/\s*,\s*/);
                                break;
                            }

                            // we have a validator function
                            if (typeof options[opt][2] == "function")
                            {
                                if (options[opt][2].call(this, arg) == false)
                                {
                                    liberator.echoerr("Invalid argument for option: " + optname);
                                    return null;
                                }
                            }

                            opts.push([options[opt][0][0], arg]); // always use the first name of the option
                            i += optname.length + count;
                            continue outer;
                        }
                        // if it is invalid, just fall through and try the next argument
                    }
                }
            }

            // if not an option, treat this token as an argument
            var [count, arg] = getNextArg(sub);
            if (count == -1)
            {
                liberator.echoerr("Error parsing arguments: " + arg);
                return null;
            }

            if (arg != null)
                args.push(arg);

            i += count; // hopefully count is always >0, otherwise we get an endless loop
        }

        return { opts: opts, args: args };
    }

    function getOption(opts, option, def)
    {
        for (var i = 0; i < opts.length; i++)
        {
            if (opts[i][0] == option)
                return opts[i][1];
        }

        // no match found, return default
        return def;
    }

    function getUserCommands(name)
    {
        var matches = [];
        for (var i = 0; i < exCommands.length; i++)
        {
            if (exCommands[i].isUserCommand)
            {
                if (name)
                {
                    if (exCommands[i].name.match("^" + name))
                        matches.push(exCommands[i]);
                }
                else
                {
                    matches.push(exCommands[i]);
                }
            }
        }
        return matches;
    }

    function removeUserCommand(name)
    {
        for (var i = 0; i < exCommands.length; i++)
        {
            if (exCommands[i].isUserCommand && exCommands[i].name == name)
            {
                exCommands.splice(i, 1);
                break;
            }
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var commandManager = {

        // FIXME: remove later, when our option handler is better
        //        Idea: If v.commands.add() specifies args or opts in extraInfo, don't call the function
        //        with args as a string, but already pass an object like:
        //        args = { -option: value, -anotheroption: true, arguments: [] }
        getOption: function (opts, option, def) { return getOption(opts, option, def); },
        parseArgs: function (str, options) { return parseArgs(str, options); },

        OPTION_ANY: 0, // can be given no argument or an argument of any type,
                       // caller is responsible for parsing the return value
        OPTION_NOARG: 1,
        OPTION_BOOL:2,
        OPTION_STRING: 3,
        OPTION_INT: 4,
        OPTION_FLOAT: 5,
        OPTION_LIST: 6,

        __iterator__: function ()
        {
            var sorted = exCommands.sort(function (cmd1, cmd2) { return cmd1.name > cmd2.name; });
            for (var i = 0; i < sorted.length; i++)
                yield sorted[i];

            throw StopIteration;
        },

        add: function (names, description, action, extra)
        {
            var command = new liberator.Command(names, description, action, extra);
            if (!command)
                return false;

            for (var i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].name == command.name)
                {
                    // never replace for now
                    liberator.log("Warning: :" + names[0] + " already exists, NOT replacing existing command.", 2);
                    return false;
                }
            }

            exCommands.push(command);
            return true;
        },

        addUserCommand: function (names, description, action, extra, replace)
        {
            var extra = extra || {};
            extra.isUserCommand = true;
            description = description || "User defined command";

            var command = new liberator.Command(names, description, action, extra);
            if (!command)
                return false;

            for (var i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].name == command.name)
                {
                    if (!replace)
                    {
                        return false;
                    }
                    else
                    {
                        removeUserCommand(command.name);
                        break;
                    }
                }
            }

            exCommands.push(command);
            return true;
        },

        get: function (name)
        {
            for (var i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].hasName(name))
                    return exCommands[i];
            }

            return null;
        },

        // TODO: generalized 0 count handling -> "Zero count"
        // FIXME: doesn't really belong here...
        // return [null, null, null, null, heredoc_tag || false];
        //        [count, cmd, special, args] = match;
        parseCommand: function (str, tag)
        {
            // remove comments
            str.replace(/\s*".*$/, "");

            if (tag) // we already have a multiline heredoc construct
            {
                if (str == tag)
                    return [null, null, null, null, false];
                else
                    return [null, null, null, str, tag];
            }

            // 0 - count, 1 - cmd, 2 - special, 3 - args, 4 - heredoc tag
            var matches = str.match(/^:*(\d+)?([a-zA-Z]+|!)(!)?(?:\s*(.*?)\s*)?$/);
            if (!matches)
                return [null, null, null, null, null];
            matches.shift();

            // parse count
            if (matches[0])
                matches[0] = parseInt(matches[0], 10);
            else
                matches[0] = -1;

            matches[2] = !!matches[2];
            matches.push(null);
            if (matches[3])
            {
                tag = matches[3].match(/<<\s*(\w+)\s*$/);
                if (tag && tag[1])
                    matches[4] = tag[1];
            }
            else
                matches[3] = "";

            return matches;
        }
    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commandManager.add(["com[mand]"],
        "List and define commands",
        function (args, special)
        {
            if (args)
            {
                var res = args.match(/^(\w+)(?:\s+(.+))?$/);
                if (!res)
                {
                    liberator.echoerr("E182: Invalid command name");
                    return false;
                }
                var [cmd, rep] = [res[1], res[2]]
            }

            if (rep)
            {
                if (!liberator.commands.addUserCommand([cmd],
                        "User defined command",
                        function (args, special, count, modifiers) { eval(rep); },
                        null, special))
                {
                    liberator.echoerr("E174: Command already exists: add ! to replace it");
                }
            }
            else
            {
                var cmdlist = getUserCommands(cmd);
                if (cmdlist.length > 0)
                {
                    var str = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                              "<table><tr align=\"left\" class=\"hl-Title\"><th>Name</th><th>Args</th><th>Definition</th></tr>";
                    for (var i = 0; i < cmdlist.length; i++)
                        str += "<tr><td>" + cmdlist[i].name + "</td><td>" + "*" + "</td><td>" + cmdlist[i].isUserCommand + "</td></tr>";
                    str += "</table>";
                    liberator.commandline.echo(str, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
                }
                else
                    liberator.echo("No user-defined commands found");
            }
        },
        {
            /*args: [[["-nargs"],    OPTION_STRING, function (arg) { return /^(0|1|\*|\?|\+)$/.test(arg); }],
                   [["-bang"],     OPTION_NOARG],
                   [["-bar"],      OPTION_NOARG]] */
        });

    // TODO: remove preview window, or change it at least
    commandManager.add(["pc[lose]"],
        "Close preview window on bottom of screen",
        function () { liberator.previewwindow.hide(); });

    //}}}

    return commandManager;
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
