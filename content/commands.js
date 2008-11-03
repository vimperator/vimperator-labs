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
// commands.add() instead
function Command(specs, description, action, extraInfo) //{{{
{
    if (!specs || !action)
        return null;

    if (!extraInfo)
        extraInfo = {};

    // convert command name abbreviation specs of the form
    // 'shortname[optional-tail]' to short and long versions Eg. 'abc[def]' ->
    // 'abc', 'abcdef'
    function parseSpecs(specs)
    {
        // Whoever wrote the following should be ashamed. :(
        // Good grief! I have no words... -- djk ;-)
        // let shortNames = longNames = names = [];
        let names = [];
        let longNames = [];
        let shortNames = [];

        for (let [,spec] in Iterator(specs))
        {
            let matches = spec.match(/(\w+)\[(\w+)\]/);

            if (matches)
            {
                shortNames.push(matches[1]);
                longNames.push(matches[1] + matches[2]);
                // order as long1, short1, long2, short2
                names.push(matches[1] + matches[2]);
                names.push(matches[1]);
            }
            else
            {
                longNames.push(spec);
                names.push(spec);
            }
        }

        return { names: names, longNames: longNames, shortNames: shortNames };
    };

    let expandedSpecs = parseSpecs(specs);
    this.specs      = specs;
    this.shortNames = expandedSpecs.shortNames;
    this.longNames  = expandedSpecs.longNames;

    // return the primary command name (the long name of the first spec listed)
    this.name        = this.longNames[0];
    this.names       = expandedSpecs.names; // return all command name aliases
    this.description = description || "";
    this.action      = action;
    this.argCount    = extraInfo.argCount || "";
    this.completer   = extraInfo.completer || null;
    this.hereDoc     = extraInfo.hereDoc || false;
    this.options     = extraInfo.options || [];
    this.bang        = extraInfo.bang || false;
    this.count       = extraInfo.count || false;
    this.literal     = extraInfo.literal || false;
    this.serial      = extraInfo.serial;

    this.isUserCommand   = extraInfo.isUserCommand || false;
    this.replacementText = extraInfo.replacementText || null;
};

Command.prototype = {

    execute: function (args, special, count, modifiers)
    {
        // XXX
        special = !!special;
        count = (count === undefined) ? -1 : count;
        modifiers = modifiers || {};

        let self = this;

        function parseArgs(args) commands.parseArgs(args, this.options, this.argCount, false, this.literal);

        if (this.hereDoc)
        {
            let matches = args.match(/(.*)<<\s*(\S+)$/);
            if (matches && matches[2])
            {
                commandline.inputMultiline(new RegExp("^" + matches[2] + "$", "m"),
                    function (args)
                    {
                        args = parseArgs.call(self, matches[1] + "\n" + args);

                        if (args)
                            self.action.call(self, args, special, count, modifiers);
                    });
                return;
            }
        }

        args = parseArgs.call(this, args);

        if (args)
            this.action.call(this, args, special, count, modifiers);
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

        for (let i = 0; i < this.specs.length; i++)
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

}; //}}}

function Commands() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var exCommands = [];

    function getMatchingUserCommands(name, filter)
    {
        var matches = [];
        for (let [,cmd] in Iterator(exCommands))
        {
            if (cmd.isUserCommand)
            {
                if (!name || cmd.name.match("^" + name))
                {
                    if (util.map(filter, function (f) f).every(function ([k, v]) v == null || cmd[k] == v))
                        matches.push(cmd);
                }
            }
        }
        return matches;
    }

    function parseBool(arg)
    {
        if (arg == "true" || arg == "1" || arg == "on")
            return true;
        if (arg == "false" || arg == "0" || arg == "off")
            return false;
        return NaN;
    }

    function quote(q, list) list.reduce(function (acc, [k,v])
    {
        v = "\\" + (v || k);
        return function (str) acc(String.replace(str, k, v, "g"))
    }, function (val) q + val + q);
    const quoteArg = {
        '"': quote('"', [["\n", "n"], ["\t", "t"], ['"'], ["\\"]]),
        "'": quote("'", [["\\"], ["'"]]),
        "":  quote("",  [["\\"], [" "]])
    }

    const ArgType = new Struct("description", "parse");
    const argTypes = [
        null,
        ["no arg",  function (arg) !arg],
        ["boolean", parseBool],
        ["string",  function (val) val],
        ["int",     parseInt],
        ["float",   parseFloat],
        ["list",    function (arg) arg && arg.split(/\s*,\s*/)]
    ].map(function (x) x && ArgType.apply(null, x));

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var commandManager = {

        // FIXME: remove later, when our option handler is better
        //        Idea: If v.commands.add() specifies args or opts in extraInfo, don't call the function
        //        with args as a string, but already pass an object like:
        //        args = { -option: value, -anotheroption: true, arguments: [] }
        OPTION_ANY:    0, // can be given no argument or an argument of any type,
                          // caller is responsible for parsing the return value
        OPTION_NOARG:  1,
        OPTION_BOOL:   2,
        OPTION_STRING: 3,
        OPTION_INT:    4,
        OPTION_FLOAT:  5,
        OPTION_LIST:   6,

        COUNT_NONE: -1,
        COUNT_ALL:  -2, // :%...

        __iterator__: function ()
        {
            let sorted = exCommands.sort(function (a, b) a.name > b.name);
            return util.Array.iterator(sorted);
        },

        add: function (names, description, action, extra)
        {
            var command = new Command(names, description, action, extra);
            if (!command)
                return false;

            if (exCommands.some(function (c) c.name == command.name))
            {
                // never replace for now
                liberator.log("Warning: :" + names[0] + " already exists, NOT replacing existing command.", 1);
                return false;
            }

            exCommands.push(command);
            return true;
        },

        addUserCommand: function (names, description, action, extra, replace)
        {
            extra = extra || {};
            extra.isUserCommand = true;
            description = description || "User defined command";

            var command = new Command(names, description, action, extra);
            // FIXME: shouldn't this be testing for an existing command by name?
            // Requiring uppercase user command names like Vim would be easier
            if (!command)
                return false;

            for (let i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].name == command.name)
                {
                    if (!replace)
                    {
                        return false;
                    }
                    else
                    {
                        this.removeUserCommand(command.name);
                        break;
                    }
                }
            }

            exCommands.push(command);

            return true;
        },

        commandToString: function (args)
        {
            let res = [args.command + (args.bang ? "!" : "")];
            function quote(str) quoteArg[/\s/.test(str) ? '"' : ""](str);

            for (let [opt, val] in Iterator(args.options || {}))
            {
                res.push(opt);
                if (val != null)
                    res.push(quote(val));
            }
            for (let [,arg] in Iterator(args.arguments || []))
                res.push(quote(arg));

            let str = args.literalArg;
            if (str)
                res.push(/\n/.test(str) ? "<<EOF\n" + str + "EOF" : str);
            return res.join(" ");
        },

        get: function (name)
        {
            for (let i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].hasName(name))
                    return exCommands[i];
            }

            return null;
        },

        getUserCommand: function (name)
        {
            for (let i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].isUserCommand && exCommands[i].hasName(name))
                    return exCommands[i];
            }

            return null;
        },

        getUserCommands: function ()
        {
            var userCommands = [];

            for (let i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].isUserCommand)
                    userCommands.push(exCommands[i]);
            }

            return userCommands;
        },

        // in '-quoted strings, only ' and \ itself are escaped
        // in "-quoted strings, also ", \n and \t are translated
        // in non-quoted strings everything is taken literally apart from "\ " and "\\"
        //
        // @param str: something like "-x=foo -opt=bar arg1 arg2"
        // "options" is an array [name, type, validator, completions] and could look like:
        //  options = [[["-force"], OPTION_NOARG],
        //             [["-fullscreen", "-f"], OPTION_BOOL],
        //             [["-language"], OPTION_STRING, validateFunc, ["perl", "ruby"]],
        //             [["-speed"], OPTION_INT],
        //             [["-acceleration"], OPTION_FLOAT],
        //             [["-accessories"], OPTION_LIST, null, ["foo", "bar"]],
        //             [["-other"], OPTION_ANY]];
        // @param argCount can be:
        //            "0": no arguments
        //            "1": exactly one argument
        //            "+": one or more arguments
        //            "*": zero or more arguments (default if unspecified)
        //            "?": zero or one arguments
        // @param allowUnknownOptions: -foo won't result in an error, if -foo isn't
        //                             specified in "options"
        // TODO: should it handle comments?
        parseArgs: function (str, options, argCount, allowUnknownOptions, literal, complete)
        {
            // returns [count, parsed_argument]
            function getNextArg(str)
            {
                var stringDelimiter = null;
                var escapeNext = false;

                var arg = "";

                outer:
                for (let i = 0; i < str.length; i++)
                {
                    inner:
                    switch (str[i])
                    {
                        case '"':
                        case "'":
                            if (escapeNext)
                            {
                                escapeNext = false;
                                break;
                            }
                            switch (stringDelimiter)
                            {
                                case str[i]:
                                    stringDelimiter = null;
                                    continue outer;
                                case null:
                                    stringDelimiter = str[i];
                                    continue outer;
                            }
                            break;

                        // \ is an escape key for non quoted or "-quoted strings
                        // for '-quoted strings it is taken literally, apart from \' and \\
                        case "\\":
                            if (escapeNext)
                            {
                                escapeNext = false;
                                break;
                            }
                            else
                            {
                                // in non-quoted strings, only escape "\\" and "\ ", otherwise drop "\\"
                                if (!stringDelimiter && str[i + 1] != "\\" && str[i + 1] != " ")
                                    continue outer;
                                // in single quoted strings, only escape "\\" and "\'", otherwise keep "\\"
                                if (stringDelimiter == "'" && str[i + 1] != "\\" && str[i + 1] != "'")
                                    break;
                                escapeNext = true;
                                continue outer;
                            }
                            break;

                        default:
                            if (stringDelimiter == "'")
                            {
                                escapeNext = false;
                                break;
                            }
                            if (escapeNext)
                            {
                                escapeNext = false;
                                switch (str[i])
                                {
                                    case "n": arg += "\n"; break;
                                    case "t": arg += "\t"; break;
                                    default:
                                        break inner; // this makes "a\fb" -> afb; wanted or should we return ab? --mst
                                }
                                continue outer;
                            }
                            else if (stringDelimiter != '"' && /\s/.test(str[i]))
                            {
                                return [i, arg];
                            }
                            break;
                    }
                    arg += str[i];
                }

                // TODO: add parsing of a " comment here:
                if (stringDelimiter)
                    return [str.length, arg, stringDelimiter];
                if (escapeNext)
                    return [str.length, arg, "\\"];
                else
                    return [str.length, arg];
            }

            if (!options)
                options = [];

            if (!argCount)
                argCount = "*";

            if (literal)
                var literalIndex = parseInt(argCount) - 1 || 0;

            var args = {};       // parsed options
            args.arguments = []; // remaining arguments
            args.string = str;   // for access to the unparsed string
            args.literalArg = "";

            var invalid = false;
            // FIXME: best way to specify these requirements?
            var onlyArgumentsRemaining = allowUnknownOptions || options.length == 0 || false; // after a -- has been found
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
                //liberator.dump(i + ": " + sub + " - " + onlyArgumentsRemaining + "\n");
                if ((!onlyArgumentsRemaining) && /^--(\s|$)/.test(sub))
                {
                    onlyArgumentsRemaining = true;
                    i += 2;
                    continue;
                }

                var optname = "";
                if (!onlyArgumentsRemaining)
                {
                    for (let [,opt] in Iterator(options))
                    {
                        for (let [,optname] in Iterator(opt[0]))
                        {
                            if (sub.indexOf(optname) == 0)
                            {
                                invalid = false;
                                arg = null;
                                quote = null;
                                // no value to the option
                                if (optname.length >= sub.length)
                                {
                                    count = 0;
                                }
                                else if (sub[optname.length] == "=")
                                {
                                    [count, arg, quote] = getNextArg(sub.substr(optname.length + 1));

                                    count++; // to compensate the "=" character
                                }
                                else if (/\s/.test(sub[optname.length]))
                                {
                                    if (opt[1] != this.OPTION_NOARG)
                                    {
                                        [count, arg, quote] = getNextArg(sub.substr(optname.length + 1));
                                        if (count == -1)

                                        // if we add the argument to an option after a space, it MUST not be empty
                                        if (!quote && arg.length == 0)
                                            arg = null;

                                        count++; // to compensate the " " character
                                    }
                                    else
                                        count = 1; // the space
                                }
                                else
                                {
                                    // this isn't really an option as it has trailing characters, parse it as an argument
                                    invalid = true;
                                }

                                if (quote)
                                {
                                    if (!complete)
                                    {
                                        liberator.echoerr("Invalid argument for option " + optname);
                                        return null;
                                    }
                                    let compl = opt[3] || [];
                                    if (typeof compl == "function")
                                        compl = compl();
                                    let quote = quoteArg[sub[optname.length + 1]] || quoteArg[""];
                                    return [i + optname.length + 1, completion.filter(compl.map(quote), quote(arg))];
                                }

                                if (!invalid)
                                {
                                    let type = argTypes[opt[1]];
                                    if (type)
                                    {
                                        arg = type.parse(arg);
                                        if (arg == null || arg == NaN)
                                        {
                                            liberator.echoerr("Invalid argument for " + type.description + "option: " + optname);
                                            return null;
                                        }
                                    }

                                    // we have a validator function
                                    if (typeof opt[2] == "function")
                                    {
                                        if (opt[2].call(this, arg) == false)
                                        {
                                            liberator.echoerr("Invalid argument for option: " + optname);
                                            return null;
                                        }
                                    }

                                    args[opt[0][0]] = arg; // always use the first name of the option
                                    i += optname.length + count;
                                    continue outer;
                                }
                                // if it is invalid, just fall through and try the next argument
                            }
                        }
                    }
                }

                if (literal && args.arguments.length == literalIndex)
                {
                    args.literalArg = sub;
                    args.arguments.push(sub);
                    break;
                }

                // if not an option, treat this token as an argument
                var [count, arg] = getNextArg(sub);
                if (count == -1)
                {
                    liberator.echoerr("Error parsing arguments: " + arg);
                    return null;
                }
                else if (!onlyArgumentsRemaining && /^-/.test(arg))
                {
                    liberator.echoerr("Invalid option: " + arg);
                    return null;
                }

                if (arg != null)
                    args.arguments.push(arg);

                i += count; // hopefully count is always > 0, otherwise we get an endless loop
            }

            // check for correct number of arguments
            if (args.arguments.length == 0 && (argCount == "1" || argCount == "+"))
            {
                liberator.echoerr("E471: Argument required");
                return null;
            }
            else if (args.arguments.length == 1 && (argCount == "0") ||
                     args.arguments.length > 1  && (argCount == "0" || argCount == "1" || argCount == "?"))
            {
                liberator.echoerr("E488: Trailing characters");
                return null;
            }

            return args;
        },

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
            var matches = str.match(/^:*(\d+|%)?([a-zA-Z]+|!)(!)?(?:\s*(.*?)\s*)?$/);
            if (!matches)
                return [null, null, null, null, null];
            matches.shift();

            // parse count
            if (matches[0])
                matches[0] = matches[0] == "%" ? this.COUNT_ALL: parseInt(matches[0], 10);
            else
                matches[0] = this.COUNT_NONE;

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
        },

        get quoteArg() quoteArg,

        removeUserCommand: function (name)
        {
            for (let i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].isUserCommand && exCommands[i].hasName(name))
                {
                    exCommands.splice(i, 1);
                    break;
                }
            }
        },

        replaceTokens: function replaceTokens(str, tokens)
        {
            return str.replace(/<((?:q-)?)([a-zA-Z]+)?>/g, function (match, quote, token)
            {
                if (token == "lt") // Don't quote, as in vim (but, why so in vim? You'd think people wouldn't say <q-lt> if they didn't want it)
                    return "<";
                let res = tokens[token];
                if (res == undefined) // Ignore anything undefined
                    res = "<" + token + ">";
                if (quote && typeof res != "number")
                    return quoteArg['"'](res);
                return res;
            });
        }

    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    function userCommand(args, special, count, modifiers)
    {
        let tokens = {
            args:  this.argCount && args.string,
            bang:  this.bang  && bang ? "!" : "",
            count: this.count && count
        };

        liberator.execute(commands.replaceTokens(this.replacementText, tokens));
    }

    // TODO: Vim allows commands to be defined without {rep} if there are {attr}s
    // specified - useful?
    commandManager.add(["com[mand]"],
        "List and define commands",
        function (args, special)
        {
            let cmd = args.arguments[0];
            if (cmd != null && /\W/.test(cmd))
            {
                liberator.echoerr("E182: Invalid command name");
                return;
            }

            if (args.literalArg)
            {
                let nargsOpt = args["-nargs"] || "0";
                let bangOpt  = "-bang"  in args;
                let countOpt = "-count" in args;

                if (!commands.addUserCommand(
                        [cmd],
                        "User defined command",
                        userCommand,
                        {
                            argCount: nargsOpt,
                            bang: bangOpt,
                            count: countOpt,
                            replacementText: args.literalArg
                        },
                        special)
                    )
                {
                    liberator.echoerr("E174: Command already exists: add ! to replace it");
                }
            }
            else
            {
                let filter = {
                    argCount: args["-nargs"],
                    bang:     "-bang" in args && true,
                    count:    args["-count"]
                };
                let cmds = getMatchingUserCommands(cmd, filter);

                if (cmds.length > 0)
                {
                    let str = template.tabular(["", "Name", "Args", "Range", "Definition"], ["padding-right: 2em;"],
                        ([cmd.bang ? "!" : " ",
                          cmd.name,
                          cmd.argCount,
                          cmd.count ? "0c" : "",
                          cmd.replacementText || "function () { ... }"] for each (cmd in cmds)));

                    commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                }
                else
                {
                    liberator.echo("No user-defined commands found");
                }
            }
        },
        {
            argCount: "2",
            bang: true,
            completer: function (filter) completion.userCommand(filter),
            options: [
                [["-nargs"], commandManager.OPTION_STRING, function (arg) /^[01*?+]$/.test(arg), ["0", "1", "*", "?", "+"]],
                [["-bang"],  commandManager.OPTION_NOARG],
                [["-count"], commandManager.OPTION_NOARG],
            ],
            literal: true,
            serial: function () [
                {
                    command: this.name,
                    bang: true,
                    // Yeah, this is a bit scary. Perhaps I'll fix it when I'm
                    // awake.
                    options: util.Array.assocToObj(util.map({argCount: "-nargs", bang: "-bang", count: "-count"},
                            function ([k, v]) k in cmd && cmd[k] != "0" && [v, typeof cmd[k] == "boolean" ? null : cmd[k]])
                            .filter(function (k) k)),
                    arguments: [cmd.name],
                    literalArg: cmd.replacementText
                }
                for ([k,cmd] in Iterator(exCommands))
                if (cmd.isUserCommand && cmd.replacementText)
            ]
        });

    commandManager.add(["comc[lear]"],
        "Delete all user-defined commands",
        function ()
        {
            commands.getUserCommands().forEach(function (cmd) { commands.removeUserCommand(cmd.name); });
        },
        { argCount: "0" });

    commandManager.add(["delc[ommand]"],
        "Delete the specified user-defined command",
        function (args)
        {
            var name = args.arguments[0];
            var cmdlist = commands.getUserCommands();

            for (let i = 0; i < cmdlist.length; i++)
            {
                if (cmdlist[i].name == name)
                {
                    commands.removeUserCommand(name);
                    return;
                }
            }

            liberator.echoerr("E184: No such user-defined command: " + name);
        },
        {
            argCount: "1",
            completer: function (filter) completion.userCommand(filter)
        });

    //}}}

    return commandManager;

}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
