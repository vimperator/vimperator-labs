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
    this.argCount    = extraInfo.argCount || 0;
    this.completer   = extraInfo.completer || null;
    this.hereDoc     = extraInfo.hereDoc || false;
    this.options     = extraInfo.options || [];
    this.bang        = extraInfo.bang || false;
    this.count       = extraInfo.count || false;
    this.literal     = extraInfo.literal == null ? null : extraInfo.literal;
    this.serial      = extraInfo.serial;

    this.isUserCommand   = extraInfo.isUserCommand || false;
    this.replacementText = extraInfo.replacementText || null;
};

Command.prototype = {

    execute: function (args, bang, count, modifiers)
    {
        // XXX
        bang = !!bang;
        count = (count === undefined) ? -1 : count;
        modifiers = modifiers || {};

        let self = this;
        function exec(args)
        {
            // FIXME: Move to parseCommand?
            args = self.parseArgs(args);
            if (!args)
                return;
            args.count = count;
            args.bang = bang;
            self.action.call(self, args, bang, count, modifiers);
        }

        if (this.hereDoc)
        {
            let matches = args.match(/(.*)<<\s*(\S+)$/);
            if (matches && matches[2])
            {
                commandline.inputMultiline(new RegExp("^" + matches[2] + "$", "m"),
                    function (args) { exec(matches[1] + "\n" + args) });
                return;
            }
        }

        exec(args);
    },

    hasName: function (name)
    {
        for (let [,spec] in Iterator(this.specs))
        {
            let fullName = spec.replace(/\[(\w+)]$/, "$1");
            let index = spec.indexOf("[");
            let min = index == -1 ? fullName.length : index;

            if (fullName.indexOf(name) == 0 && name.length >= min)
                return true;
        }

        return false;
    },

    parseArgs: function (args, complete, extra) commands.parseArgs(args, this.options, this.argCount, false, this.literal, complete, extra)

}; //}}}

function Commands() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var exCommands = [];

    function parseBool(arg)
    {
        if (arg == "true" || arg == "1" || arg == "on")
            return true;
        if (arg == "false" || arg == "0" || arg == "off")
            return false;
        return NaN;
    }

    const quoteMap = {
        "\n": "n",
        "\t": "t"
    }
    function quote(q, list)
    {
        let re = RegExp("[" + list + "]", "g");
        return function (str) q + String.replace(str, re, function ($0) $0 in quoteMap ? quoteMap[$0] : ("\\" + $0)) + q;
    }
    const complQuote = { // FIXME
        '"': ['"', quote("", '\n\t"\\\\'), '"'],
        "'": ["'", quote("", "\\\\'"), "'"],
        "":  ["", quote("",  "\\\\ "), ""]
    };
    const quoteArg = {
        '"': quote('"', '\n\t"\\\\'),
        "'": quote("'", "\\\\'"),
        "":  quote("",  "\\\\ ")
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

    function addCommand(command, isUserCommand, replace)
    {
        if (!command) // XXX
            return false;

        if (exCommands.some(function (c) c.hasName(command.name)))
        {
            if (isUserCommand && replace)
            {
                commands.removeUserCommand(command.name);
            }
            else
            {
                liberator.log("Warning: :" + command.name + " already exists, NOT replacing existing command.", 1);
                return false;
            }
        }

        exCommands.push(command);

        return true;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.registerObserver("load_completion", function ()
    {
        completion.setFunctionCompleter(commands.get, [function () ([c.name, c.description] for (c in commands))]);
    });

    var commandManager = {

        // FIXME: remove later, when our option handler is better
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
            return addCommand(new Command(names, description, action, extra), false, false);
        },

        addUserCommand: function (names, description, action, extra, replace)
        {
            extra = extra || {};
            extra.isUserCommand = true;
            description = description || "User defined command";

            return addCommand(new Command(names, description, action, extra), true, replace);
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
            return exCommands.filter(function (cmd) cmd.hasName(name))[0] || null;
        },

        getUserCommand: function (name)
        {
            return exCommands.filter(function (cmd) cmd.isUserCommand && cmd.hasName(name))[0] || null;
        },

        getUserCommands: function ()
        {
            return exCommands.filter(function (cmd) cmd.isUserCommand);
        },

        // returns [count, parsed_argument]
        parseArg: function getNextArg(str)
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
        //     : it might be nice to be able to specify that certain quoting
        //     should be disabled E.g. backslash without having to resort to
        //     using literal etc
        parseArgs: function (str, options, argCount, allowUnknownOptions, literal, complete, extra)
        {
            function getNextArg(str) commands.parseArg(str);

            if (!options)
                options = [];

            if (!argCount)
                argCount = "*";

            var args = [];       // parsed options
            args.__iterator__ = function () util.Array.iterator2(this);
            args.string = str;   // for access to the unparsed string
            args.literalArg = "";

            // FIXME!
            for (let [k, v] in Iterator(extra || []))
                args[k] = v;

            var invalid = false;
            // FIXME: best way to specify these requirements?
            var onlyArgumentsRemaining = allowUnknownOptions || options.length == 0 || false; // after a -- has been found
            var arg = null;
            var count = 0; // the length of the argument
            var i = 0;
            var completeOpts;

            // XXX
            function matchOpts(arg)
            {
                // Push possible option matches into completions
                if (complete && !onlyArgumentsRemaining)
                    completeOpts = [[opt[0], opt[0][0]] for ([i, opt] in Iterator(options)) if (!(opt[0][0] in args))];
            }
            function resetCompletions()
            {
                completeOpts = null;
                args.completeArg = null;
                args.completeOpt = null;
                args.completeFilter = null;
                args.completeStart = i;
                args.quote = complQuote[""];
            }
            if (complete)
            {
                resetCompletions();
                matchOpts("");
                args.completeArg = 0;
            }

            function echoerr(error)
            {
                if (complete)
                    complete.message = error;
                else
                    liberator.echoerr(error);
            }

            outer:
            while (i < str.length || complete)
            {
                // skip whitespace
                while (/\s/.test(str[i]) && i < str.length)
                    i++;
                if (i == str.length && !complete)
                    break;

                if (complete)
                    resetCompletions();

                var sub = str.substr(i);
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
                                count = 0;
                                let sep = sub[optname.length];
                                if (sep == "=" || /\s/.test(sep) && opt[1] != this.OPTION_NOARG)
                                {
                                    [count, arg, quote] = getNextArg(sub.substr(optname.length + 1));

                                    // if we add the argument to an option after a space, it MUST not be empty
                                    if (sep != "=" && !quote && arg.length == 0)
                                        arg = null;

                                    count++; // to compensate the "=" character
                                }
                                else if (!/\s/.test(sep)) // this isn't really an option as it has trailing characters, parse it as an argument
                                {
                                    invalid = true;
                                }

                                let context = null;
                                if (!complete && quote)
                                {
                                    liberator.echoerr("Invalid argument for option " + optname);
                                    return null;
                                }

                                if (!invalid)
                                {
                                    if (complete && count > 0)
                                    {
                                        args.completeStart += optname.length + 1;
                                        args.completeOpt = opt;
                                        args.completeFilter = arg;
                                        args.quote = complQuote[quote] || complQuote[""];
                                    }
                                    let type = argTypes[opt[1]];
                                    if (type && (!complete || arg != null))
                                    {
                                        let orig = arg;
                                        arg = type.parse(arg);
                                        if (arg == null || (typeof arg == "number" && isNaN(arg)))
                                        {
                                            if (!complete || orig != "" || args.completeStart != str.length)
                                                echoerr("Invalid argument for " + type.description + " option: " + optname);
                                            if (complete)
                                                complete.highlight(args.completeStart, count - 1, "SPELLCHECK");
                                            else
                                                return null;
                                        }
                                    }

                                    // we have a validator function
                                    if (typeof opt[2] == "function")
                                    {
                                        if (opt[2].call(this, arg) == false)
                                        {
                                            echoerr("Invalid argument for option: " + optname);
                                            if (complete)
                                                complete.highlight(args.completeStart, count - 1, "SPELLCHECK");
                                            else
                                                return null;
                                        }
                                    }

                                    args[opt[0][0]] = arg; // always use the first name of the option
                                    i += optname.length + count;
                                    if (i == str.length)
                                        break outer;
                                    continue outer;
                                }
                                // if it is invalid, just fall through and try the next argument
                            }
                        }
                    }
                }

                matchOpts(sub);

                if (complete)
                {
                    if (argCount == "0" || args.length > 0  && (/[1?]/.test(argCount)))
                        complete.highlight(i, sub.length, "SPELLCHECK")
                }

                if (args.length == literal)
                {
                    if (complete)
                        args.completeArg = args.length;
                    args.literalArg = sub;
                    args.push(sub);
                    args.quote = null;
                    break;
                }

                // if not an option, treat this token as an argument
                var [count, arg, quote] = getNextArg(sub);
                if (complete)
                {
                    args.quote = complQuote[quote] || complQuote[""];
                    args.completeFilter = arg || "";
                }
                else if (count == -1)
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
                    args.push(arg);
                if (complete)
                    args.completeArg = args.length - 1;

                i += count;
                if (count <= 0 || i == str.length)
                    break;
            }

            if (complete)
            {
                if (args.completeOpt)
                {
                    let opt = args.completeOpt;
                    let context = complete.fork(opt[0][0], args.completeStart);
                    context.filter = args.completeFilter;
                    if (typeof opt[3] == "function")
                        var compl = opt[3](context, args);
                    else
                        compl = opt[3] || [];
                    context.title = [opt[0][0]];
                    context.quote = args.quote;
                    context.completions = compl;
                }
                complete.advance(args.completeStart);
                complete.title = ["Options"];
                if (completeOpts)
                    complete.completions = completeOpts;
            }

            // check for correct number of arguments
            if (args.length == 0 && /^[1+]$/.test(argCount) ||
                    literal != null && /[1+]/.test(argCount) && !/\S/.test(args.literalArg || ""))
            {
                if (!complete)
                {
                    liberator.echoerr("E471: Argument required");
                    return null;
                }
            }
            else if (args.length == 1 && (argCount == "0") ||
                     args.length > 1  && /^[01?]$/.test(argCount))
            {
                echoerr("E488: Trailing characters");
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
            let matches = str.match(/^:*(\d+|%)?([a-zA-Z]+|!)(!)?(?:\s*(.*?))?$/);
            //var matches = str.match(/^:*(\d+|%)?([a-zA-Z]+|!)(!)?(?:\s*(.*?)\s*)?$/);
            if (!matches)
                return [null, null, null, null, null];
            let [, count, cmd, special, args, heredoc] = matches;

            // parse count
            if (count)
                count = count == "%" ? this.COUNT_ALL: parseInt(count, 10);
            else
                count = this.COUNT_NONE;

            if (args)
            {
                tag = args.match(/<<\s*(\w+)\s*$/);
                if (tag && tag[1])
                    heredoc = tag[1];
            }

            return [count, cmd, !!special, args || "", heredoc];
        },

        get complQuote() complQuote,

        get quoteArg() quoteArg,

        removeUserCommand: function (name)
        {
            exCommands = exCommands.filter(function (cmd) !(cmd.isUserCommand && cmd.hasName(name)));
        },

        // FIXME: still belong here? Also used for autocommand parameters
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

    function userCommand(args, modifiers)
    {
        let tokens = {
            args:  this.argCount && args.string,
            bang:  this.bang && args.bang ? "!" : "",
            count: this.count && args.count
        };

        liberator.execute(commands.replaceTokens(this.replacementText, tokens));
    }

    // TODO: offer completion.ex?
    var completeOptionMap = {
        altstyle: "alternateStyleSheet", bookmark: "bookmark",
        buffer: "buffer", color: "colorScheme", command: "command",
        dialog: "dialog", dir: "directory", environment: "environment",
        event: "autocmdEvent", file: "file", help: "help",
        highlight: "highlightGroup", javascript: "javascript", macro: "macro",
        mapping: "userMapping", menu: "menuItem", option: "option",
        preference: "preference", search: "search",
        shellcmd: "shellCommand", sidebar: "sidebar", url: "url",
        usercommand: "userCommand"
    };

    // TODO: Vim allows commands to be defined without {rep} if there are {attr}s
    // specified - useful?
    commandManager.add(["com[mand]"],
        "List and define commands",
        function (args)
        {
            let cmd = args[0];

            if (cmd != null && /\W/.test(cmd))
            {
                liberator.echoerr("E182: Invalid command name");
                return;
            }

            if (args.literalArg)
            {
                let nargsOpt    = args["-nargs"] || "0";
                let bangOpt     = "-bang"  in args;
                let countOpt    = "-count" in args;
                let completeOpt = args["-complete"];

                let completeFunc = null; // default to no completion for user commands

                if (completeOpt)
                {
                    let func;

                    if (/^custom,/.test(completeOpt))
                        func = completeOpt.replace("custom,", "");
                    else
                        func = "completion." + completeOptionMap[completeOpt];

                    completeFunc = eval(func);
                }

                if (!commands.addUserCommand(
                        [cmd],
                        "User defined command",
                        userCommand,
                        {
                            argCount: nargsOpt,
                            bang: bangOpt,
                            count: countOpt,
                            completer: completeFunc,
                            replacementText: args.literalArg
                        },
                        args.bang)
                    )
                {
                    liberator.echoerr("E174: Command already exists: add ! to replace it");
                }
            }
            else
            {
                function completerToString(completer)
                {
                    if (completer)
                        return [k for ([k, v] in Iterator(completeOptionMap))
                                  if (v == completer.name)][0] || "custom";
                    else
                        return "";
                }

                // TODO: using an array comprehension here generates flakey results across repeated calls
                //     : perhaps we shouldn't allow options in a list call but just ignore them for now
                let cmds = exCommands.filter(function (c) c.isUserCommand && (!cmd || c.name.match("^" + cmd)));

                if (cmds.length > 0)
                {
                    let str = template.tabular(["", "Name", "Args", "Range", "Complete", "Definition"], ["padding-right: 2em;"],
                        ([cmd.bang ? "!" : " ",
                          cmd.name,
                          cmd.argCount,
                          cmd.count ? "0c" : "",
                          completerToString(cmd.completer),
                          cmd.replacementText || "function () { ... }"]
                         for each (cmd in cmds)));

                    commandline.echo(str, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
                }
                else
                {
                    liberator.echomsg("No user-defined commands found");
                }
            }
        },
        {
            bang: true,
            completer: function (context) completion.userCommand(context),
            options: [
                [["-nargs"], commandManager.OPTION_STRING,
                     function (arg) /^[01*?+]$/.test(arg), ["0", "1", "*", "?", "+"]],
                [["-bang"], commandManager.OPTION_NOARG],
                [["-count"], commandManager.OPTION_NOARG],
                [["-complete"], commandManager.OPTION_STRING,
                     function (arg) arg in completeOptionMap || /custom,\w+/.test(arg)]
            ],
            literal: 1,
            serial: function () [
                {
                    command: this.name,
                    bang: true,
                    // Yeah, this is a bit scary. Perhaps I'll fix it when I'm
                    // awake.
                    options: util.Array.assocToObj(
                        util.map({ argCount: "-nargs", bang: "-bang", count: "-count" },
                                function ([k, v]) k in cmd && cmd[k] != "0" && [v, typeof cmd[k] == "boolean" ? null : cmd[k]])
                            .filter(util.identity)),
                    arguments: [cmd.name],
                    literalArg: cmd.replacementText
                }
                for ([k, cmd] in Iterator(exCommands))
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
            let name = args[0];

            if (commands.get(name))
                commands.removeUserCommand(name);
            else
                liberator.echoerr("E184: No such user-defined command: " + name);
        },
        {
            argCount: "1",
            completer: function (context) completion.userCommand(context)
        });

    //}}}

    return commandManager;

}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
