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

vimperator.Command = function(specs, action, extra_info) //{{{
{
    if (!specs || !action)
        return null;

    // convert command name abbreviation specs of the form
    // 'shortname[optional-tail]' to short and long versions Eg. 'abc[def]' ->
    // 'abc', 'abcdef'
    var parseSpecs = function(specs)
    {
        var short_names = [];
        var long_names  = [];
        var names = [];
        for (var i = 0; i < specs.length; i++)
        {
            var match;
            if (match = specs[i].match(/(\w+|!)\[(\w+)\]/))
            {
                short_names.push(match[1]);
                long_names.push(match[1] + match[2]);
                // order as long1, short1, long2, short2
                names.push(match[1] + match[2]);
                names.push(match[1]);
            }
            else
            {
                long_names.push(specs[i]);
                names.push(specs[i]);
            }
        }
        return { names: names, long_names: long_names, short_names: short_names };
    }

    this.specs = specs;
    var expanded_specs = parseSpecs(specs);
    this.short_names = expanded_specs.short_names;
    this.long_names = expanded_specs.long_names;

    // return the primary command name (the long name of the first spec listed)
    this.name = this.long_names[0];

    // return all command name aliases
    this.names = expanded_specs.names;

    this.action = action;

    // TODO: build a better default usage string
    this.usage = [this.specs[0]];

    if (extra_info)
    {
        //var flags = extra_info.flags || 0;

        if (extra_info.usage)
            this.usage = extra_info.usage;

        this.help       = extra_info.help || null;
        this.short_help = extra_info.short_help || null;
        this.completer  = extra_info.completer || null;
        this.args       = extra_info.args || [];
    }

}

vimperator.Command.prototype.execute = function(args, special, count, modifiers)
{
    this.action.call(this, args, special, count, modifiers);
}

// return true if the candidate name matches one of the command's aliases
// (including all acceptable abbreviations)
vimperator.Command.prototype.hasName = function(name)
{
    // match a candidate name against a command name abbreviation spec - returning
    // true if the candidate matches unambiguously
    function matchAbbreviation(name, format)
    {
        var minimum = format.indexOf('[');                    // minumum number of characters for a command name match
        var fullname = format.replace(/\[(\w+)\]$/, '$1');    // full command name
        if (fullname.indexOf(name) == 0 && name.length >= minimum)
            return true;
        else
            return false;
    }

    for (var i = 0; i < this.specs.length; i++)
    {
        if (this.specs[i] == name)                    // literal command name
            return true;
        else if (this.specs[i].match(/^(\w+|!)\[\w+\]$/)) // abbreviation spec
            if (matchAbbreviation(name, this.specs[i]))
                return true;
    }
    return false;
}
//}}}

vimperator.Commands = function() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    const OPTION_ANY    = 0; // can be given no argument or an argument of any type, user is responsible
                             // for parsing the return value
    const OPTION_NOARG  = 1;
    const OPTION_BOOL   = 2;
    const OPTION_STRING = 3;
    const OPTION_INT    = 4;
    const OPTION_FLOAT  = 5;
    const OPTION_LIST   = 6;

    var ex_commands = [];
    var last_run_command = ""; // updated whenever the users runs a command with :!

    function addDefaultCommand(command)
    {
        ex_commands.push(command);
        vimperator.Commands.prototype[command.name] = function(args, special, count, modifiers)
        {
            command.execute(args, special, count, modifiers);
        }
    }

    // in '-quoted strings, only ' and \ itself are escaped
    // in "-quoted strings, also ", \n and \t are translated
    // in non-quoted strings everything is taken literally apart from "\ " and "\\"
    //
    // "options" is an array [name, type, validator, completions] and could look like:
    //  options = [[["-force"], OPTION_NOARG],
    //             [["-fullscreen"], OPTION_BOOL],
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
            var in_single_string = false;
            var in_double_string = false;
            var in_escape_key = false;

            var arg = "";

            outer:
            for (var i = 0; i < str.length; i++)
            {
                switch(str[i])
                {
                case "\"":
                    if (in_escape_key)
                    {
                        in_escape_key = false;
                        break;
                    }
                    if (!in_single_string)
                    {
                        in_double_string = !in_double_string;
                        continue outer;
                    }
                    break;

                case "'":
                    if (in_escape_key)
                    {
                        in_escape_key = false;
                        break;
                    }
                    if (!in_double_string)
                    {
                        in_single_string = !in_single_string;
                        continue outer;
                    }
                    break;

                // \ is an escape key for non quoted or "-quoted strings
                // for '-quoted strings it is taken literally, apart from \' and \\
                case "\\":
                    if (in_escape_key)
                    {
                        in_escape_key = false;
                        break;
                    }
                    else
                    {
                        // only escape "\\" and "\ " in non quoted strings
                        if (!in_single_string && !in_double_string && str[i+1] != "\\" && str[i+1] != " ")
                            continue outer;
                        // only escape "\\" and "\'" in single quoted strings
                        else if (in_single_string && str[i+1] != "\\" && str[i+1] != "'")
                            break;
                        else
                        {
                            in_escape_key = true;
                            continue outer;
                        }
                    }
                    break;

                default:
                    if (in_single_string)
                    {
                        in_escape_key = false;
                        break;
                    }
                    else if (in_escape_key)
                    {
                        in_escape_key = false;
                        switch (str[i])
                        {
                            case "n": arg += "\n"; continue outer;
                            case "t": arg += "\t"; continue outer;
                            default:
                                break; // this makes "a\fb" -> afb; wanted or should we return ab? --mst
                        }
                    }
                    else if (!in_double_string && /\s/.test(str[i]))
                    {
                        return [i, arg];
                    }
                    else // a normal charcter
                        break;
                }
                arg += str[i];
            }

            // TODO: add parsing of a " comment here:
            if (in_double_string || in_single_string)
                return [-1, "E114: Missing quote"];
            if (in_escape_key)
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
        while(i < str.length)
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
                                vimperator.echoerr("Invalid argument for option " + optname);
                                return null;
                            }

                            count++; // to compensate the "=" character
                        }
                        else if (options[opt][1] != OPTION_NOARG && /\s/.test(sub[optname.length]))
                        {
                            [count, arg] = getNextArg(sub.substr(optname.length + 1));
                            if (count == -1)
                            {
                                vimperator.echoerr("Invalid argument for option " + optname);
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
                            case OPTION_NOARG:
                                if (arg != null)
                                {
                                    vimperator.echoerr("No argument allowed for option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_BOOL:
                                if (arg == "true" || arg == "1" || arg == "on")
                                    arg = true;
                                else if (arg == "false" || arg == "0" || arg == "off")
                                    arg = false;
                                else
                                {
                                    vimperator.echoerr("Invalid argument for boolean option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_STRING:
                                if (arg == null)
                                {
                                    vimperator.echoerr("Argument required for string option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_INT:
                                arg = parseInt(arg);
                                if (isNaN(arg))
                                {
                                    vimperator.echoerr("Numeric argument required for integer option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_FLOAT:
                                arg = parseFloat(arg);
                                if (isNaN(arg))
                                {
                                    vimperator.echoerr("Numeric argument required for float option: " + optname);
                                    return null;
                                }
                                break;
                            case OPTION_LIST:
                                if (arg == null)
                                {
                                    vimperator.echoerr("Argument required for list option: " + optname);
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
                                    vimperator.echoerr("Invalid argument for option: " + optname);
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
                vimperator.echoerr("Error parsing arguments: " + arg);
                return null;
            }

            if (arg != null)
                args.push(arg);

            i += count; // hopefully count is always >0, otherwise we get an endless loop
        }

        return { opts: opts, args: args }
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

    function commandsIterator()
    {
        for (var i = 0; i < ex_commands.length; i++)
            yield ex_commands[i];

        throw StopIteration;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.__iterator__ = function()
    {
        return commandsIterator();
    }

    this.add = function(command)
    {
        if (!command)
            return false;

        ex_commands.push(command);

        return true;
    }

    this.get = function(name)
    {
        for (var i = 0; i < ex_commands.length; i++)
        {
            if (ex_commands[i].hasName(name))
                return ex_commands[i];
        }

        return null;
    }

    // FIXME: doesn't really belong here...
    // return [null, null, null, null, heredoc_tag || false];
    //        [count, cmd, special, args] = match;
    this.parseCommand = function(string, tag)
    {
        // removing comments
        string.replace(/\s*".*$/, '');
        if (tag) // we already have a multiline heredoc construct
        {
            if (string == tag)
                return [null, null, null, null, false];
            else
                return [null, null, null, string, tag];
        }

        // 0 - count, 1 - cmd, 2 - special, 3 - args, 4 - heredoc tag
        var matches = string.match(/^:*(\d+)?([a-zA-Z]+|!)(!)?(?:\s*(.*?)\s*)?$/);
        if (!matches)
            return [null, null, null, null, null];
        matches.shift();

        // parse count
        if (matches[0])
        {
            matches[0] = parseInt(matches[0]);
            if (isNaN(matches[0]))
                matches[0] = 0; // 0 is the default if no count given
        }
        else
            matches[0] = 0;

        matches[2] = !!matches[2];
        matches.push(null);
        if (matches[3])
        {
            tag = matches[3].match(/<<\s*(\w+)\s*$/);
            if (tag && tag[1])
                matches[4] = tag[1];
        }
        else
            matches[3] = '';

        return matches;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// DEFAULT COMMANDS ////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    addDefaultCommand(new vimperator.Command(["addo[ns]"],
        function() { vimperator.open("chrome://mozapps/content/extensions/extensions.xul", vimperator.NEW_TAB); },
        {
            short_help: "Show available Browser Extensions and Themes",
            help: "You can add/remove/disable browser extensions from this dialog.<br/>Be aware that not all Firefox extensions work, because Vimperator overrides some keybindings and changes Firefox's GUI."
        }
    ));
    addDefaultCommand(new vimperator.Command(["ba[ck]"],
        function(args, special, count)
        {
            if (special)
                vimperator.history.goToStart();
            else
            {
                if (args)
                {
                    var sh = getWebNavigation().sessionHistory;
                    for (var i = sh.index - 1; i >= 0; i--)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                }
                vimperator.history.stepTo(count > 0 ? -1 * count : -1);
            }
        },
        {
            usage: ["[count]ba[ck][!] [url]"],
            short_help: "Go back in the browser history",
            help: "Count is supported, <code class=\"command\">:3back</code> goes back 3 pages in the browser history.<br/>" +
                  "The special version <code class=\"command\">:back!</code> goes to the beginning of the browser history.",
            completer: function(filter)
            {
                var sh = getWebNavigation().sessionHistory;
                var completions = [];
                for (var i = sh.index - 1; i >= 0; i--)
                {
                    var entry = sh.getEntryAtIndex(i, false);
                    var url = entry.URI.spec;
                    var title = entry.title;
                    if (vimperator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return completions;
            }
        }
    ));
    addDefaultCommand(new vimperator.Command(["bd[elete]", "bw[ipeout]", "bun[load]", "tabc[lose]"],
        function(args, special, count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, special, 0); },
        {
            usage: ["[count]bd[elete][!]"],
            short_help: "Delete current buffer (=tab)",
            help: "Count is supported, <code class=\"command\">:2bd</code> removes two tabs and the one to the right is selected. " +
                  "Do <code class=\"command\">:bdelete!</code> to select the tab to the left after removing the current tab."
        }
    ));
    addDefaultCommand(new vimperator.Command(["beep"],
        function() { vimperator.beep(); },
        {
            short_help: "Play a system beep"
        }
    ));
    addDefaultCommand(new vimperator.Command(["bma[rk]"],
        function(args)
        {
            var res = parseArgs(args, this.args);
            if (!res)
                return;

            var url = res.args.length == 0 ? vimperator.buffer.URL : res.args[0];
            var title = getOption(res.opts, "-title", res.args.length == 0 ? vimperator.buffer.title : null);
            if (!title)
                title = url;
            var keyword = getOption(res.opts, "-keyword", null);
            var tags = getOption(res.opts, "-tags", []);

            if (vimperator.bookmarks.add(title, url, keyword, tags))
                vimperator.echo("Bookmark `" + title + "' added with url `" + url + "'", vimperator.commandline.FORCE_SINGLELINE);
            else
                vimperator.echoerr("Exxx: Could not add bookmark `" + title + "'", vimperator.commandline.FORCE_SINGLELINE);
        },
        {
            usage: ["bma[rk] [-title=title] [-keyword=kw] [-tags=tag1,tag2] [url]"],
            short_help: "Add a bookmark",
            help: "If you don't add a custom title, either the title of the web page or the URL is taken as the title.<br/>" +
                  "You can omit the optional <code class=\"argument\">[url]</code> argument, so just do <code class=\"command\">:bmark</code> to bookmark the currently loaded web page with a default title and without any tags.<br/>" +
                  "The following options are interpreted:<br/>" +
                  " -title=\"custom title\"<br/>" +
                  " -tags=comma,separated,tag,list<br/>" +
                  " -keyword=keyword<br/>",
            args: [[["-title", "-t"],    OPTION_STRING],
                   [["-tags", "-T"],     OPTION_LIST],
                   [["-keyword", "-k"],  OPTION_STRING, function(arg) { return /\w/.test(arg); } ]]
        }
    ));
    addDefaultCommand(new vimperator.Command(["bmarks"],
        function(args, special)
        {
            var res = parseArgs(args, this.args);
            if (!res)
                return;

            var tags = getOption(res.opts, "-tags", []);
            vimperator.bookmarks.list(res.args.join(" "), tags, special);
        },
        {
            usage: ["bmarks [filter]", "bmarks!"],
            short_help: "Show bookmarks",
            help: "Open the message window at the bottom of the screen with all bookmarks which match <code class=\"argument\">[filter]</code> either in the title or URL.<br/>" +
                  "The special version <code class=\"command\">:bmarks!</code> opens the default Firefox bookmarks window.<br/>" +
                  "Filter can also contain the following options:<br/>" +
                  "-tags=comma,separated,tag,list<br/>",
            completer: function(filter) { return vimperator.bookmarks.get(filter); },
            args: [[["-tags", "-T"],     OPTION_LIST]]
        }
    ));
    addDefaultCommand(new vimperator.Command(["b[uffer]"],
        function(args, special) { vimperator.buffer.switchTo(args, special); },
        {
            usage: ["b[uffer][!] {url|index}"],
            short_help: "Go to buffer from buffer list",
            help: "Argument can be either the buffer index or the full URL.<br/>" +
                  "If argument is neither a full URL nor an index but uniquely identifies a buffer, " +
                  "it is selected. With <code class=\"argument\">[!]</code> the next buffer matching the argument " +
                  "is selected, even if it cannot be identified uniquely.<br/>" +
                  "Use <code class=\"mapping\">b</code> as a shortcut to open this prompt.",
            completer: function(filter) { return vimperator.completion.get_buffer_completions(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["buffers", "files", "ls", "tabs"],
        function(args, special)
        {
            if (args)
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }

            vimperator.buffer.list(special);
        },
        {
            usage: ["buffers[!]"],
            short_help: "Show a list of all buffers (=tabs)",
            help: "The special version <code class=\"command\">:buffers!</code> opens the buffer list in a persistent preview window. " +
                  "Call the special version of this command again to close the window."
        }
    ));
    addDefaultCommand(new vimperator.Command(["delbm[arks]"],
        function(args, special)
        {
            var url = args;
            if (!url)
                url = vimperator.buffer.URL;

            var deleted_count = vimperator.bookmarks.remove(url);
            vimperator.echo(deleted_count + " bookmark(s) with url `" + url + "' deleted", vimperator.commandline.FORCE_SINGLELINE);
        },
        {
            usage: ["delbm[arks] [url]"],
            short_help: "Delete a bookmark",
            help: "Deletes <b>all</b> bookmarks which match the <code class=\"argument\">[url]</code>. " +
                  "If ommited, <code class=\"argument\">[url]</code> defaults to the URL of the current buffer. " +
                  "Use <code>&lt;Tab&gt;</code> key on a string to complete the URL which you want to delete.<br/>" +
                  "The following options WILL be interpreted in the future:<br/>" +
                  " [!] a special version to delete ALL bookmarks <br/>",
            completer: function(filter) { return vimperator.bookmarks.get(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["com[mand]"],
        function(args)
        {
            var res = parseArgs(args, this.args);
            if (!res)
                return;

            vimperator.echo(vimperator.util.colorize(res.args));
        },
        {
            usage: ["com[mand][!] [{attr}...] {cmd} {rep}"],
            short_help: "Temporarily used for testing args parser",
            help: "",
            args: [[["-nargs"],    OPTION_STRING, function(arg) { return /^(0|1|\*|\?|\+)$/.test(arg); } ],
                   [["-bang"],     OPTION_NOARG],
                   [["-bar"],      OPTION_NOARG]]
        }
    ));
    addDefaultCommand(new vimperator.Command(["delm[arks]"],
        function(args, special)
        {
            if (!special && !args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }
            if (special && args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return
            }
            var matches;
            if (matches = args.match(/(?:(?:^|[^a-zA-Z0-9])-|-(?:$|[^a-zA-Z0-9])|[^a-zA-Z0-9 -]).*/))
            {
                // TODO: this currently differs from Vim's behaviour which
                // deletes any valid marks in the arg list, up to the first
                // invalid arg, as well as giving the error message. Do we want
                // to match this behaviour?
                vimperator.echoerr("E475: Invalid argument: " + matches[0]);
                return;
            }
            // check for illegal ranges - only allow a-z A-Z 0-9
            if (matches = args.match(/[a-zA-Z0-9]-[a-zA-Z0-9]/g))
            {
                for (var i = 0; i < matches.length; i++)
                {
                    var start = matches[i][0];
                    var end   = matches[i][2];
                    if (/[a-z]/.test(start) != /[a-z]/.test(end) ||
                        /[A-Z]/.test(start) != /[A-Z]/.test(end) ||
                        /[0-9]/.test(start) != /[0-9]/.test(end) ||
                        start > end)
                    {
                        vimperator.echoerr("E475: Invalid argument: " + args.match(new RegExp(matches[i] + ".*"))[0]);
                        return;
                    }
                }
            }

            vimperator.marks.remove(args, special);
        },
        {
            usage: ["delm[arks] {marks}", "delm[arks]!"],
            short_help: "Delete the specified marks",
            help: "Marks are presented as a list. Example:<br/>" +
                "<code class=\"command\">:delmarks Aa b p</code> deletes marks A, a, b and p<br/>" +
                "<code class=\"command\">:delmarks b-p</code> deletes all marks in the range b to p<br/>" +
                "<code class=\"command\">:delmarks!</code> deletes all marks for the current buffer"
        }

    ));
    addDefaultCommand(new vimperator.Command(["delqm[arks]"],
        function(args, special)
        {
            // TODO: finish arg parsing - we really need a proper way to do this. :)
            if (!special && !args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }
            if (special && args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return
            }

            if (special)
                vimperator.quickmarks.removeAll();
            else
                vimperator.quickmarks.remove(args);
        },
        {
            usage: ["delqm[arks] {marks}", "delqm[arks]!"],
            short_help: "Delete the specified QuickMarks",
            help: "QuickMarks are presented as a list. Example:<br/>" +
                "<code class=\"command\">:delqmarks Aa b p</code> deletes QuickMarks A, a, b and p<br/>" +
                "<code class=\"command\">:delqmarks b-p</code> deletes all QuickMarks in the range b to p<br/>" +
                "<code class=\"command\">:delqmarks!</code> deletes all QuickMarks"
        }
    ));
    addDefaultCommand(new vimperator.Command(["downl[oads]", "dl"],
        function() { vimperator.open("chrome://mozapps/content/downloads/downloads.xul", vimperator.NEW_TAB); },
        {
            short_help: "Show progress of current downloads",
            help: "Open the original Firefox download dialog in a new tab.<br/>" +
                  "Here, downloads can be paused, canceled and resumed."
        }
    ));

    function argToString(arg, color)
    {
        if (!arg)
            return "";

        try
        {
            // TODO: move to vimperator.eval()?
            arg = eval(arg);
        }
        catch (e)
        {
            vimperator.echoerr(e.toString());
            return null;
        }

        if (typeof arg === "object")
            arg = vimperator.objectToString(arg, color);
        else if (typeof arg === "function")
            arg = vimperator.util.escapeHTML(arg.toString());
        else if (typeof arg === "number" || typeof arg === "boolean")
            arg = "" + arg;
        else if (typeof arg === "undefined")
            arg = "undefined";

        return arg;
    }
    addDefaultCommand(new vimperator.Command(["ec[ho]"],
        function(args)
        {
            var res = argToString(args, true);
            if (res != null)
                vimperator.echo(res);
        },
        {
            usage: ["ec[ho] {expr}"],
            short_help: "Display a string at the bottom of the window",
            help: "Useful for showing informational messages. Multiple lines can be separated by \\n.<br/>" +
                  "<code class=\"argument\">{expr}</code> can either be a quoted string, or any expression which can be fed to eval() like 4+5. " +
                  "You can also view the source code of objects and functions if the return value of <code class=\"argument\">{expr}</code> is an object or function.",
            completer: function(filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["echoe[rr]"],
        function(args)
        {
            var res = argToString(args, false);
            if (res != null)
                vimperator.echoerr(res);
        },
        {
            usage: ["echoe[rr] {expr}"],
            short_help: "Display an error string at the bottom of the window",
            help: "Just like <code class=\"command\">:ec[ho]</code>, but echoes the result highlighted in red. Useful for showing important messages.",
            completer: function(filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["exe[cute]"],
        function(args)
        {
            // TODO: :exec has some difficult semantics -> later
            // var res = parseArgs(args, this.args);
            // if (!res)
            //     return;
            //
            // vimperator.execute(res.args);

            vimperator.execute(args);
        },
        {
            usage: ["exe[cute] {expr1} [ ... ]"],
            short_help: "Execute the string that results from the evaluation of {expr1} as an Ex command.",
            help: "Example: <code class=\"command\">:execute echo test</code> shows a message with the text &#34;test&#34;.<br/>"
        }
    ));
    addDefaultCommand(new vimperator.Command(["exu[sage]"],
        function(args, special, count, modifiers) { vimperator.help("commands", special, null, modifiers); },
        {
            short_help: "Show help for Ex commands"
        }
    ));
    addDefaultCommand(new vimperator.Command(["fo[rward]", "fw"],
        function(args, special, count)
        {
            if (special)
                vimperator.history.goToEnd();
            else
            {
                if (args)
                {
                    var sh = getWebNavigation().sessionHistory;
                    for (var i = sh.index + 1; i < sh.count; i++)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                }
                vimperator.history.stepTo(count > 0 ? count : 1);
            }
        },
        {
            usage: ["[count]fo[rward][!] [url]"],
            short_help: "Go forward in the browser history",
            help: "Count is supported, <code class=\"command\">:3forward</code> goes forward 3 pages in the browser history.<br/>" +
                  "The special version <code class=\"command\">:forward!</code> goes to the end of the browser history.",
            completer: function(filter)
            {
                var sh = getWebNavigation().sessionHistory;
                var completions = [];
                for (var i = sh.index + 1; i < sh.count; i++)
                {
                    var entry = sh.getEntryAtIndex(i, false);
                    var url = entry.URI.spec;
                    var title = entry.title;
                    if (vimperator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return completions;
            }
        }
    ));
    addDefaultCommand(new vimperator.Command(["ha[rdcopy]"],
        function() { getBrowser().contentWindow.print(); },
        {
            short_help: "Print current document",
            help: "Open a GUI dialog where you can select the printer, number of copies, orientation, etc."
        }
    ));
    addDefaultCommand(new vimperator.Command(["h[elp]"],
        function(args, special, count, modifiers) { vimperator.help(args, special, null, modifiers); },
        {
            usage: ["h[elp] {subject}"],
            short_help: "Open the help window",
            help: "You can jump to the specified <code class=\"argument\">{subject}</code> with <code class=\"command\">:help {subject}</code>.<br/>" +
                  "Make sure you use the full vim notation when jumping to <code class=\"argument\">{subject}</code>. This means:<br/>" +
                  "<ul>" +
                  "<li><code class=\"command\">:help :help</code> for commands (: prefix)</li>" +
                  "<li><code class=\"command\">:help 'complete'</code> for options (surrounded by ' and ')</li>" +
                  "<li><code class=\"command\">:help o</code> for mappings (no pre- or postfix)</li>" +
                  "</ul>" +
                  "You can however use partial stings in the tab completion, so <code class=\"command\">:help he&lt;Tab&gt;</code> completes <code class=\"command\">:help :help</code>.",
            completer: function(filter) { return vimperator.completion.get_help_completions(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["hist[ory]", "hs"],
        function(args, special) { vimperator.history.list(args, special); },
        {
            usage: ["hist[ory] [filter]", "history!"],
            short_help: "Show recently visited URLs",
            help: "Open the message window at the bottom of the screen with all history items which match <code class=\"argument\">[filter]</code> either in the title or URL.<br/>" +
                  "The special version <code class=\"command\">:history!</code> opens the default Firefox history window.",
            completer: function(filter) { return vimperator.history.get(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["javas[cript]", "js"],
        function(args, special)
        {
            if (special) // open javascript console
                vimperator.open("chrome://global/content/console.xul", vimperator.NEW_TAB);
            else
            {
                // check for a heredoc
                var matches = args.match(/(.*)<<\s*([^\s]+)$/);
                if (matches && matches[2])
                {
                    vimperator.commandline.inputMultiline(new RegExp("^" + matches[2] + "$", "m"),
                        function(code) {
                            try
                            {
                                eval(matches[1] + "\n" + code);
                            }
                            catch (e)
                            {
                                vimperator.echoerr(e.name + ": " + e.message);
                            }
                        });
                }
                else // single line javascript code
                {
                    try
                    {
                        eval(args);
                    }
                    catch (e)
                    {
                        vimperator.echoerr(e.name + ": " + e.message);
                    }
                }
            }
        },
        {
            usage: ["javas[cript] {cmd}", "javascript <<{endpattern}\\n{script}\\n{endpattern}", "javascript[!]"], // \\n is changed to <br/> in the help.js code
            short_help: "Run any JavaScript command through eval()",
            help: "Acts as a JavaScript interpreter by passing the argument to <code>eval()</code>.<br/>" +
                  "<code class=\"command\">:javascript alert('Hello world')</code> shows a dialog box with the text \"Hello world\".<br/>" +
                  "<code class=\"command\">:javascript &lt;&lt;EOF</code> reads all the lines until a line starting with 'EOF' is found, and interpret them with the JavaScript <code>eval()</code> function.<br/>" +
                  "The special version <code class=\"command\">:javascript!</code> opens the JavaScript console of Firefox.<br/>" +
                  "Rudimentary <code class=\"mapping\">&lt;Tab&gt;</code> completion is available for <code class=\"command\">:javascript {cmd}&lt;Tab&gt;</code> (but not yet for the " +
                  "<code class=\"command\">:js &lt;&lt;EOF</code> multiline widget). Be aware that Vimperator needs to run {cmd} through eval() " +
                  "to get the completions, which could have unwanted side effects.",
            completer: function(filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["let"],
        function(args)
        {
            if (!args)
            {
                var str = "";
                for (var i in vimperator.globalVariables)
                {
                    var value = vimperator.globalVariables[i];
                    if (typeof value == "number")
                        var prefix = "#";
                    else if (typeof value == "function")
                        var prefix = "*";
                    else
                        var prefix = "";

                    str += "<tr><td style=\"width: 200px;\">" + i + "</td><td>" + prefix + value + "</td>\n";
                }
                if (str)
                    vimperator.echo("<table>" + str + "</table>", vimperator.commandline.FORCE_MULTILINE);
                else
                    vimperator.echo("No variables found");
                return;
            }

            var match;
            // 1 - type, 2 - name, 3 - +-., 4 - expr
            if (match = args.match(/([$@&])?([\w:]+)\s*([+-.])?=\s*(.+)/))
            {
                if (!match[1])
                {
                    var reference = vimperator.variableReference(match[2]);
                    if (!reference[0] && match[3])
                        return vimperator.echoerr("E121: Undefined variable: " + match[2]);

                    var expr = vimperator.eval(match[4]);
                    if (typeof expr === undefined)
                        return vimperator.echoerr("E15: Invalid expression: " + match[4]);
                    else
                    {
                        if (!reference[0]) {
                            if (reference[2] == 'g')
                                reference[0] = vimperator.globalVariables;
                            else
                                return; // for now
                        }

                        if (match[3])
                        {
                            if (match[3] == '+')
                                reference[0][reference[1]] += expr;
                            else if (match[3] == '-')
                                reference[0][reference[1]] -= expr;
                            else if (match[3] == '.')
                                reference[0][reference[1]] += expr.toString();
                        }
                        else
                            reference[0][reference[1]] = expr;
                    }
                }
            }
            // 1 - name
            else if (match = args.match(/^\s*([\w:]+)\s*$/))
            {
                var reference = vimperator.variableReference(match[1]);
                if (!reference[0])
                    return vimperator.echoerr("E121: Undefined variable: " + match[1]);

                var value = reference[0][reference[1]];
                if (typeof value == 'number')
                    var prefix = '#';
                else if (typeof value == 'function')
                    var prefix = '*';
                else
                    var prefix = '';
                vimperator.echo(reference[1] + '\t\t' + prefix + value);
            }
        },
        {
            usage: ["let {var-name} [+-.]= {expr1}", "let {var-name}", "let"],
            short_help: "Sets or lists a variable",
            help: "Sets the variable <code class=\"argument\">{var-name}</code> " +
                  "to the value of the expression <code class=\"argument\">{expr1}</code>." +
                  "If no expression is given, the value of the variable is displayed." +
                  "Without arguments, displays a list of all variables."
        }
    ));
    addDefaultCommand(new vimperator.Command(["map"],
        // 0 args -> list all maps
        // 1 arg  -> list the maps starting with args
        // 2 args -> map arg1 to arg*
        function(args)
        {
            if (!args)
            {
                vimperator.mappings.list(vimperator.modes.NORMAL);
                return;
            }

            var matches = args.match(/^([^\s]+)(?:\s+(.+))?$/)
            var [lhs, rhs] = [matches[1], matches[2]];
            var leader_reg = new RegExp('<Leader>', 'i');

            if (leader_reg.test(lhs))
            {
                var leader_ref = vimperator.variableReference('mapleader');
                var leader = leader_ref[0] ? leader_ref[0][leader_ref[1]] : '\\';

                lhs = lhs.replace(leader_reg, leader);
            }

            if (rhs)
            {
                vimperator.mappings.add(new vimperator.Map([vimperator.modes.NORMAL], [lhs],
                    function() { vimperator.events.feedkeys(rhs); }, { rhs: rhs }
                ));
            }
            else
            {
                // FIXME: no filtering for now
                vimperator.mappings.list(vimperator.modes.NORMAL, lhs);
            }
        },
        {
            usage: ["map {lhs} {rhs}", "map {lhs}", "map"],
            short_help: "Map the key sequence {lhs} to {rhs}",
            help: "The <code class=\"argument\">{rhs}</code> is remapped, allowing for nested and recursive mappings.<br/>" +
                  "Mappings are NOT saved during sessions, make sure you put them in your vimperatorrc file!"
        }
    ));
    addDefaultCommand(new vimperator.Command(["mapc[lear]"],
        function(args)
        {
            if (args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            vimperator.mappings.removeAll(vimperator.modes.NORMAL);
        },
        {
            short_help: "Remove all mappings",
            help: "All user-defined mappings which were set by " +
                  "<code class=\"command\">:map</code> or <code class=\"command\">:noremap</code> are cleared."
        }
    ));
    addDefaultCommand(new vimperator.Command(["ma[rk]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }
            if (args.length > 1)
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }
            if (!/[a-zA-Z]/.test(args))
            {
                vimperator.echoerr("E191: Argument must be a letter or forward/backward quote");
                return;
            }

            vimperator.marks.add(args);
        },
        {
            usage: ["ma[rk] {a-zA-Z}"],
            short_help: "Mark current location within the web page"
        }
    ));
    addDefaultCommand(new vimperator.Command(["marks"],
        function(args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z]/.test(args))
            {
                vimperator.echoerr("E283: No marks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z]/g, '');
            vimperator.marks.list(filter)
        },
        {
            usage: ["marks [arg]"],
            short_help: "Show all location marks of current web page",
            help: "If <code class=\"argument\">[arg]</code> is specified then limit the list to those marks mentioned."
        }
    ));
    addDefaultCommand(new vimperator.Command(["mkv[imperatorrc]"],
        function(args, special)
        {   
            var filename;
            
            // TODO: "E172: Only one file name allowed"
            if (args)
                filename = args;
            else
                filename = vimperator.io.expandPath(navigator.platform == "Win32" ? "~/_vimperatorrc" : "~/.vimperatorrc");
            
            var file = vimperator.io.getFile(filename);
            if (file.exists() && !special)
            {
                vimperator.echoerr("E189: \".vimperatorrc\" exists (add ! to override)");
                return
            }

            var line = "\" " + vimperator.version + "\n";

            // TODO: write user maps for all modes when we have mode dependant map support
            for (var map in vimperator.mappings.getUserIterator(vimperator.modes.NORMAL))
            {
                for (var i = 0; i < map.names.length; i++)
                    line += "map " + map.names[i] + " " + map.rhs + "\n";
            }

            for (var option in vimperator.options)
            {   
                // TODO: options should be queried for this info
                if (!/fullscreen|usermode/.test(option.name) && option.value != option.default_value)
                {
                    if (option.type == "boolean")
                        line += "set " + (option.value ? option.name : "no" + option.name) + "\n";
                    else
                        line += "set " + option.name + "=" + option.value + "\n";
                }
            }

            line += "\" vim: set ft=vimperator:";

            vimperator.io.writeFile(file, line);
        },
        {   
            usage: ["mkv[imperatorrc] [file]"],
            short_help: "Write current keymappings and changed options to [file]",
            help: "If no <code class=\"argument\">[file]</code> is specified then ~/.vimperatorrc is written unless this file already exists. " +
                  "The special version will overwrite <code class=\"argument\">[file]</code> if it exists.<br/>" +
                  "WARNING: this differs from Vim's behaviour which defaults to writing the file in the current directory."
        }
    ));
    addDefaultCommand(new vimperator.Command(["noh[lsearch]"],
        function(args)
        {
            vimperator.search.clear();
        },
        {
            short_help: "Remove the search highlighting",
            help: "The document highlighting is turned back on when another search command is used or the " +
                  "<code class=\"option\">'hlsearch'</code> option is set."
        }
    ));
    addDefaultCommand(new vimperator.Command(["norm[al]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            vimperator.events.feedkeys(args);
        },
        {
            usage: ["norm[al][!] {commands}"],
            short_help: "Execute Normal mode commands",
            help: "Example: <code class=\"command\">:normal 20j</code> scrolls 20 lines down."
        }
    ));
    // TODO: remove duplication in :map
    addDefaultCommand(new vimperator.Command(["no[remap]"],
        // 0 args -> list all maps
        // 1 arg  -> list the maps starting with args
        // 2 args -> map arg1 to arg*
        function(args)
        {
            if (!args)
            {
                vimperator.mappings.list(vimperator.modes.NORMAL);
                return;
            }

            var matches = args.match(/^([^ ]+)(?:\s+(.+))?$/);
            var [lhs, rhs] = [matches[1], matches[2]];

            if (rhs)
            {
                if (/^:/.test(rhs))
                {
                    vimperator.mappings.add(
                        new vimperator.Map([vimperator.modes.NORMAL], [lhs], function() { vimperator.execute(rhs); }, { rhs: rhs })
                    );
                }
                else
                {
                    // NOTE: we currently only allow one normal mode command in {rhs}
                    var map = vimperator.mappings.getDefaultMap(vimperator.modes.NORMAL, rhs);

                    // create a new Map for {lhs} with the same action as
                    // {rhs}...until we have feedkeys().
                    // NOTE: Currently only really intended for static use (e.g.
                    // from the RC file) since {rhs} is evaluated when the map
                    // is created not at runtime
                    if (map)
                        vimperator.mappings.add(
                            new vimperator.Map([vimperator.modes.NORMAL], [lhs], map.action, { flags: map.flags, rhs: rhs })
                        );
                    else
                        vimperator.echoerr("E475: Invalid argument: " + "{rhs} must be a existing singular mapping");
                }
            }
            else
            {
                // FIXME: no filtering for now
                vimperator.mappings.list(vimperator.modes.NORMAL, lhs);
            }
        },
        {
            usage: ["no[remap] {lhs} {rhs}", "no[remap] {lhs}", "no[remap]"],
            short_help: "Map the key sequence {lhs} to {rhs}",
            help: "No remapping of the <code class=\"argument\">{rhs}</code> is performed.<br/>NOTE: :noremap does not yet work as reliably as :map."
        }
    ));
    addDefaultCommand(new vimperator.Command(["o[pen]", "e[dit]"],
        function(args, special)
        {
            if (args)
            {
                vimperator.open(args);
            }
            else
            {
                if (special)
                    BrowserReloadSkipCache();
                else
                    BrowserReload();
            }
        },
        {
            usage: ["o[pen] [url] [, url]"],
            short_help: "Open one or more URLs in the current tab",
            help: "Multiple URLs can be separated with \", \". Note that the space after the comma is required.<br/>" +
                  "Each token is analyzed and in this order:<br/>" +
                  "<ol>" +
                  "<li>Transformed to a relative URL of the current location if it starts with . or .. or ...;<br/>" +
                  "... is special and moves up the directory hierarchy as far as possible." +
                  "<ul><li><code class=\"command\">:open ...</code> with current location <code>\"http://www.example.com/dir1/dir2/file.html\"</code> opens <code>\"http://www.example.com\"</code></li>" +
                  "<li><code class=\"command\">:open ./foo.html</code> with current location <code>\"http://www.example.com/dir1/dir2/file.html\"</code> opens <code>\"http://www.example.com/dir1/dir2/foo.html\"</code></li></ul></li>" +
                  "<li>Opened with the specified search engine if the token looks like a search string " +
                  "and the first word is the name of a search engine (<code class=\"command\">:open wikipedia linus torvalds</code> " +
                  "opens the wikipedia entry for linus torvalds). The short name of a search engine is automatically guessed from its name. " +
                  "If you want to set a custom name, open the <var>$FIREFOX_PROFILE</var>/searchplugins/*.xml file of the search engine, and add/change " +
                  "&lt;Alias&gt;myalias&lt;/Alias&gt;</li>" +
                  "<li>Opened with the default search engine or keyword (specified with the <code class=\"option\">'defsearch'</code> option) " +
                  "if the first word is no search engine (<code class=\"command\">:open linus torvalds</code> opens a Google search for linux torvalds).</li>" +
                  "<li>Passed directly to Firefox in all other cases (<code class=\"command\">:open www.osnews.com, www.slashdot.org</code> " +
                  "opens OSNews in the current, and Slashdot in a new background tab).</li>" +
                  "</ol>" +
                  "You can use <code class=\"command\">:open -tags linux torvalds&lt;Tab&gt;</code> to complete bookmarks " +
                  "with tag \"linux\" and which contain \"torvalds\". Note that -tags support is only available for tab completion, not for the actual command.<br/>" +
                  "The items which are completed on <code class=\"mapping\">&lt;Tab&gt;</code> are specified in the <code class=\"option\">'complete'</code> option.<br/>" +
                  "Without argument, reloads the current page.<br/>" +
                  "Without argument but with <code class=\"command\">!</code>, reloads the current page skipping the cache.",
            completer: function(filter) { return vimperator.completion.get_url_completions(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["pc[lose]"],
        function() { vimperator.previewwindow.hide(); },
        {
            short_help: "Close preview window on bottom of screen"
        }
    ));
    addDefaultCommand(new vimperator.Command(["pref[erences]", "prefs"],
        function(args, special, count, modifiers)
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
        },
        {
            usage: ["pref[erences][!]"],
            short_help: "Show Browser Preferences",
            help: "You can change the browser preferences from this dialog. " +
                  "Be aware that not all Firefox preferences work, because Vimperator overrides some keybindings and changes Firefox's GUI.<br/>" +
                  "<code class=\"command\">:prefs!</code> opens about:config in the current tab where you can change advanced Firefox preferences."
        }
    ));
    addDefaultCommand(new vimperator.Command(["qma[rk]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            var matches1 = args.match(/([a-zA-Z0-9])\s+(.+)/);
            var matches2 = args.match(/([a-zA-Z0-9])\s*$/);

            if (matches1 && matches1[1])
                vimperator.quickmarks.add(matches1[1], matches1[2]);
            else if (matches2 && matches2)
                vimperator.quickmarks.add(matches2[1], vimperator.buffer.URL);
            else
                vimperator.echoerr("E488: Trailing characters");
        },
        {
            usage: ["qma[rk] {a-zA-Z0-9} [url]"],
            short_help: "Mark a URL with a letter for quick access",
            help: "You can also mark whole groups like this: <br/>"+
                  "<code class=\"command\">:qmark f http://forum1.com, http://forum2.com, imdb some artist</code>"
        }
    ));
    addDefaultCommand(new vimperator.Command(["qmarks"],
        function(args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z0-9]/.test(args))
            {
                vimperator.echoerr("E283: No QuickMarks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z0-9]/g, '');
            vimperator.quickmarks.list(filter);
        },
        {
            usage: ["qmarks [arg]"],
            short_help: "Show all QuickMarks",
            help: "If <code class=\"argument\">[arg]</code> is specified then limit the list to those QuickMarks mentioned."
        }
    ));
    addDefaultCommand(new vimperator.Command(["q[uit]"],
        function() { vimperator.tabs.remove(getBrowser().mCurrentTab, 1, false, 1); },
        {
            short_help: "Quit current tab",
            help: "If this is the last tab in the window, close the window. If this was the " +
                  "last window, close Vimperator. When quitting Vimperator, the session is not stored."
        }
    ));
    addDefaultCommand(new vimperator.Command(["quita[ll]", "qa[ll]"],
        function() { vimperator.quit(false); },
        {
            short_help: "Quit Vimperator",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is not stored."
        }
    ));
    addDefaultCommand(new vimperator.Command(["redr[aw]"],
        function()
        {
            var wu = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor).
                            getInterface(Components.interfaces.nsIDOMWindowUtils);
            wu.redraw();
        },
        {
            short_help: "Redraw the screen",
            help: "Useful to update the screen halfway executing a script or function."
        }
    ));
    addDefaultCommand(new vimperator.Command(["re[load]"],
        function(args, special) { vimperator.tabs.reload(getBrowser().mCurrentTab, special); },
        {
            usage: ["re[load][!]"],
            short_help: "Reload current page",
            help: "Forces reloading of the current page. If <code class=\"command\">!</code> is given, skip the cache."
        }
    ));
    addDefaultCommand(new vimperator.Command(["reloada[ll]"],
        function(args, special) { vimperator.tabs.reloadAll(special); },
        {
            usage: ["reloada[ll][!]"],
            short_help: "Reload all pages",
            help: "Forces reloading of all pages. If <code class=\"command\">!</code> is given, skip the cache."
        }
    ));
    addDefaultCommand(new vimperator.Command(["res[tart]"],
        function() { vimperator.restart(); },
        {
            short_help: "Force the browser to restart",
            help: "Useful when installing extensions."
        }
    ));
    addDefaultCommand(new vimperator.Command(["sav[eas]", "w[rite]"],
        function() { saveDocument(window.content.document); },
        {
            short_help: "Save current web page to disk",
            help: "Opens the original Firefox \"Save page as...\" dialog.<br/>" +
                  "There, you can save the current web page to disk with various options."
        }
    ));
    addDefaultCommand(new vimperator.Command(["se[t]"],
        function(args, special, count, modifiers)
        {
            if (special)
            {
                vimperator.echo("This WILL show all non-default about:config options");
                return;
            }

            var only_non_default = false; //used for :set to print non-default options
            if (!args)
            {
                args = "all?"
                only_non_default = true;
            }

            //                               1        2       3    4  5      6
            var matches = args.match(/^\s*(no|inv)?([a-z]+)([?&!])?(([+-])?=(.*))?/);
            if (!matches)
            {
                vimperator.echoerr("E518: Unknown option: " + args);
                return;
            }

            var no = false;
            if (matches[1] == "no")
                no = true;

            var opt = matches[2];

            var all = false;
            if (opt == "all")
                all = true;

            var option = vimperator.options.get(opt);
            if (!option && !all)
            {
                vimperator.echoerr("E518: Unknown option: " + opt);
                return;
            }

            var get = false;
            if (all || matches[3] == "?" || (option.type != "boolean" && matches[4] === undefined))
                get = true;

            var reset = false;
            if (matches[3] == "&")
                reset = true;

            var invert = false;
            if (matches[1] == "inv" || matches[3] == "!")
                invert = true;

            var oper = matches[5];

            var val = matches[6];
            if (val === undefined)
                val = "";

            // reset a variable to its default value
            // TODO: remove the value from about:config instead of setting it to the current default value
            if (reset)
            {
                if (all)
                {
                    for (let opt in vimperator.options)
                        opt.value = opt.default_value;
                }
                else
                {
                    option.value = option.default_value;
                }
            }
            // read access
            else if (get)
            {
                if (all)
                {
                    vimperator.options.list(only_non_default);
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
            else
            {
                var type = option.type;
                if (type == "boolean")
                {
                    if (matches[4])
                        vimperator.echoerr("E474: Invalid argument: " + option.name + "=" + val);
                    else if (invert)
                        option.value = !option.value;
                    else
                        option.value = !no;
                }
                else if (type == "number")
                {
                    var num = parseInt(val, 10);
                    if (isNaN(num))
                        vimperator.echoerr("E521: Number required after =: " + option.name + "=" + val);
                    else
                    {
                        var cur_val = option.value;
                        if (oper == '+') num = cur_val + num;
                        if (oper == '-') num = cur_val - num;
                        // FIXME
                        if (option.validator != null && option.validator.call(this, num) == false)
                            vimperator.echoerr("E474: Invalid argument: " + option.name + "=" + val); // FIXME: need to be able to specify unique parse error messages
                        else // all checks passed, execute option handler
                            option.value = num;
                    }
                }
                else if (type == "charlist" || type == "stringlist" || type == "string")
                {
                    var cur_val = option.value;
                    if (type == "charlist" || type == "string")
                    {
                        if (oper == '+' && !cur_val.match(val))
                            val = cur_val + val;
                        if (oper == '-') val = cur_val.replace(val, '');
                    }
                    else
                    {
                        if (oper == '+' && !cur_val.match(val) && cur_val.length > 0)
                                val = cur_val + ',' + val;
                        if (oper == '-')
                        {
                            val = cur_val.replace(new RegExp(',?' + val), '');
                            val = val.replace(/^,?/, '');
                        }
                    }
                    // FIXME
                    if (option.validator != null && option.validator.call(this, val) == false)
                        vimperator.echoerr("E474: Invalid argument: " + option.name + "=" + val);
                    else // all checks passed, execute option handler
                        option.value = val;
                }
                else
                    vimperator.echoerr("E685: Internal error: option format `" + type + "' not supported");
            }
        },
        {
            usage: ["se[t][!]", "se[t] {option}?", "se[t] [no]{option}", "se[t] {option}[+-]={value}", "se[t] {option}! | inv{option}", "se[t] {option}&"],
            short_help: "Set an option",
            help: "Permanently change an option. In contrast to Vim options are currently stored throughout sessions.<br/>" +
                  "<code class=\"command\">:set</code> without an argument shows all Vimperator options which differ from their default values.<br/>" +
                  "<code class=\"command\">:set!</code> without an argument shows all about:config preferences which differ from their default values.<br/>" +
                  "There are three types of options: boolean, number and string. " +
                  "Boolean options must be set with <code class=\"command\">:set option</code> and <code class=\"command\">:set nooption</code>. " +
                  "Number and string option types must be set with <code class=\"command\">:set option={value}</code>.<br/>" +
                  "<code class=\"command\">:set option!</code> and <code class=\"command\">:set invoption</code> invert the value of a boolean option.<br/>" +
                  "<code class=\"command\">:set option?</code> or <code class=\"command\">:set option</code>(for string and list options) shows the current value of an option.<br/>" +
                  "<code class=\"command\">:set option&amp;</code> resets an option to its default value.<br/>" +
                  "<code class=\"command\">:set option+={value}</code> and <code class=\"command\">:set option-={value}</code> adds/subtracts {value} to a number option and append/remove {value} to a string option.<br/>" +
                  "<code class=\"command\">:set all</code> shows the current value of all options and <code class=\"command\">:set all&amp;</code> resets all options to their default values.<br/>",
            completer: function(filter) { return vimperator.completion.get_options_completions(filter); }
        }
    ));
    // TODO: sclose instead?
    addDefaultCommand(new vimperator.Command(["sbcl[ose]"],
        function(args)
        {
            if (args)
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }

            if (document.getElementById("sidebar-box").hidden == false)
                toggleSidebar();
        },
        {
            short_help: "Close the sidebar window"
        }
    ));
    // TODO: sopen instead? Separate :sidebar from :sbopen and make them behave
    // more like :cw, :cope etc
    addDefaultCommand(new vimperator.Command(["sideb[ar]", "sb[ar]", "sbope[n]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            // do nothing if the requested sidebar is already open
            if (document.getElementById("sidebar-title").value == args)
            {
                document.getElementById("sidebar-box").contentWindow.focus();
                return;
            }
            
            var menu = document.getElementById("viewSidebarMenu")

            for (var i = 0; i < menu.childNodes.length; i++)
            {
                if (menu.childNodes[i].label == args)
                {
                    eval(menu.childNodes[i].getAttribute('oncommand'))
                    break;
                }
            }
        },
        {
            usage: ["sidebar {name}"],
            short_help: "Open the sidebar window",
            help: "<code class=\"argument\">{name}</code> is any of the menu items listed under the standard Firefox View->Sidebar " +
                  "menu. Add-ons, Preferences and Downloads are also available in the sidebar.",
            completer: function(filter) { return vimperator.completion.get_sidebar_completions(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["so[urce]"],
        function(args)
        {
            // FIXME: implement proper filename quoting
            //if (/[^\\]\s/.test(args))
            //{
            //    vimperator.echoerr("E172: Only one file name allowed");
            //    return;
            //}

            vimperator.source(args);
        },
        {
            usage: ["so[urce][!] {file}"],
            short_help: "Read Ex commands from {file}",
            help: "You can either source files which mostly contain Ex commands like <code class=\"command\">map &lt; gt</code> " +
                  "and put JavaScript code within a:<br/><code class=\"code\">" +
                  "js &lt;&lt;EOF<br/>hello = function() {<br/>&nbsp;&nbsp;alert(\"Hello world\");<br/>}<br/>EOF<br/></code> section.<br/>" +
                  "Or you can alternatively source a file which ends in .js, these files are automatically sourced as pure JavaScript files.<br/>" +
                  "NOTE: In both cases you must add functions to the global window object like shown above, functions written as:<br/>" +
                  "<code class=\"code\">function hello2() {<br/>&nbsp;&nbsp;alert(\"Hello world\");<br/>}<br/></code>are only available within the scope of the script. <br/><br/>" +
                  "The .vimperatorrc file in your home directory and any files in ~/.vimperator/plugin/ are always sourced at startup.<br/>" +
                  "~ is supported as a shortcut for the <var>$HOME</var> directory.<br/>" +
                  "If <code class=\"command\">!</code> is specified, errors are not printed.",
            completer: function(filter) { return vimperator.completion.get_file_completions(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["st[op]"],
        BrowserStop,
        {
            short_help: "Stop loading",
            help: "Stop loading current web page."
        }
    ));
    addDefaultCommand(new vimperator.Command(["tab"],
        function(args) { vimperator.execute(args, { inTab: true }); },
        {
            usage: ["tab {cmd}"],
            short_help: "Execute {cmd} and tell it to output in a new tab",
            help: "Works only for commands that support it, currently:" +
                  "<ul><li>:tab help</li>" +
                  "<li>:tab prefs[!]</li></ul>",
            completer: function(filter) { return vimperator.completion.get_command_completions(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["tabl[ast]"],
        function() { vimperator.tabs.select("$", false); },
        {
            short_help: "Switch to the last tab"
        }
    ));
    addDefaultCommand(new vimperator.Command(["tabm[ove]"],
        function(args, special) { vimperator.tabs.move(getBrowser().mCurrentTab, args, special); },
        {
            usage: ["tabm[ove] [N]", "tabm[ove][!] +N | -N"],
            short_help: "Move the current tab after tab N",
            help: "When N is 0 the current tab is made the first one.  Without N the current tab is made the last one. " +
                  "N can also be prefixed with '+' or '-' to indicate a relative movement. If <code class=\"command\">!</code> is specified the movement wraps around the start or end of the tab list."
        }
    ));
    addDefaultCommand(new vimperator.Command(["tabn[ext]", "tn[ext]"],
        function() { vimperator.tabs.select("+1", true); },
        {
            short_help: "Switch to the next tab",
            help: "Cycles to the first tab, when the last is selected."
        }
    ));
    addDefaultCommand(new vimperator.Command(["tabo[nly]"],
        function() { vimperator.tabs.keepOnly(getBrowser().mCurrentTab); },
        {
            short_help: "Close all other tabs"
        }
    ));
    addDefaultCommand(new vimperator.Command(["tabopen", "t[open]", "tabnew", "tabe[dit]"],
        function(args, special)
        {
            var where = special ? vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB;
            if (/\btabopen\b/.test(vimperator.options["activate"]))
                where = special ? vimperator.NEW_BACKGROUND_TAB : vimperator.NEW_TAB;

            if (args)
                vimperator.open(args, where);
            else
                vimperator.open("about:blank", where);
        },
        {
            usage: ["tabopen [url] [, url]"],
            short_help: "Open one or more URLs in a new tab",
            help: "Like <code class=\"command\">:open</code> but open URLs in a new tab.<br/>" +
                  "If used with <code class=\"command\">!</code>, the 'tabopen' value of the <code class=\"option\">'activate'</code> option is negated.",
            completer: function(filter) { return vimperator.completion.get_url_completions(filter); }
        }
    ));
    addDefaultCommand(new vimperator.Command(["tabp[revious]", "tp[revious]", "tabN[ext]", "tN[ext]"],
        function() { vimperator.tabs.select("-1", true); },
        {
            usage: ["tabp[revious]", "tabN[ext]"],
            short_help: "Switch to the previous tab",
            help: "Cycles to the last tab, when the first is selected."
        }
    ));
    addDefaultCommand(new vimperator.Command(["tabr[ewind]", "tabfir[st]"],
        function() { vimperator.tabs.select(0, false); },
        {
            usage: ["tabr[ewind]", "tabfir[st]"],
            short_help: "Switch to the first tab"
        }
    ));
    addDefaultCommand(new vimperator.Command(["time"],
        function(args, special, count)
        {
            if (!count || count < 1)
                count = 1;

            try
            {
                if (count > 1)
                {
                    var i = count;
                    var before_time = Date.now();

                    if (args && args[0] == ":")
                        while (i--)
                            vimperator.execute(args);
                    else
                        while (i--)
                            eval(args);

                    if (special)
                        return;

                    var after_time = Date.now();
                
                    if ((after_time - before_time) / count >= 100)
                        var each = "<td>  Each time:</td><td align=\"right\"><span style=\"color: green\">" +
                            ((after_time - before_time) / 1000.0 / count) +
                            "</span></td><td>sec</td>";
                    else
                        var each = "<td>  Each time:</td><td align=\"right\"><span style=\"color: green\">" +
                            ((after_time - before_time) / count) +
                            "</span></td><td>msec</td>";

                    if (after_time - before_time >= 100)
                        var total = "<td>  Total time:</td><td align=\"right\"><span style=\"color: red\">" +
                            ((after_time - before_time) / 1000.0) +
                            "</span></td><td>sec</td>";
                    else
                        var total = "<td>  Total time:</td><td align=\"right\"><span style=\"color: red\">" +
                            (after_time - before_time) + "</span></td><td>msec</td>";

                    var str = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                              "<table>" +
                              "<tr align=\"left\" class=\"hl-Title\"><th colspan=\"3\">Code execution summary</th></tr>" +
                              "<tr><td>  Executed:</td><td align=\"right\"><span style=\"color: green\">" + count + "</span></td><td>times</td></tr>" +
                              "<tr>" + each + "</tr>" +
                              "<tr>" + total + "</tr>" +
                              "</table>";

                    vimperator.commandline.echo(str, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
                }
                else
                {
                    var before_time = Date.now();
                    if (args && args[0] == ":")
                        vimperator.execute(args);
                    else
                        eval(args);

                    if (special)
                        return;

                    var after_time = Date.now();
                    
                    if (after_time - before_time >= 100)
                        vimperator.echo("Total time: " + ((after_time - before_time) / 1000.0) + " sec");
                    else
                        vimperator.echo("Total time: " + (after_time - before_time) + " msec");
                }
            }
            catch (e)
            {
                vimperator.echoerr(e);
            }
        },
        {
            usage: ["{count}time[!] {code|:command}"],
            short_help: "Profile a piece of code or a command",
            help: "Runs <code class=\"argument\">{code} {count}</code> times (default 1) and returns the elapsed time. " +
                  "<code class=\"argument\">{code}</code> is always passed to JavaScript's eval(), which might be slow, so take the results with a grain of salt.<br/>" +
                  "If <code class=\"argument\">{code}</code> starts with a :, it is executed as a vimperator command.<br/>" +
                  "Use the special version with [!] if you just want to run any command multiple times without showing profiling statistics."
        }
    ));
    addDefaultCommand(new vimperator.Command(["u[ndo]"],
        function(args, special, count)
        {
            if (count < 1)
                count = 1;

            if (args)
            {
                var ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
                var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
                for (var i = 0; i < undoItems.length; i++)
                {
                    if (undoItems[i].state.entries[0].url == args)
                    {
                        count = i+1;
                        break;
                    }
                }
            }
            undoCloseTab(count-1);
        },
        {
            usage: ["[count]u[ndo][!] [url]"],
            short_help: "Undo closing of a tab",
            help: "If a count is given, don't close the last but the <code class=\"argument\">[count]</code>th last tab. " +
                  "With <code class=\"argument\">[url]</code> restores the tab matching the url.",
            completer: function(filter)
            {
                // get closed-tabs from nsSessionStore
                var ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
                var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
                var completions = [];
                for (var i = 0; i < undoItems.length; i++)
                {
                    // undoItems[i].image is also available if need for favicons
                    var url = undoItems[i].state.entries[0].url;
                    var title = undoItems[i].title;
                    if (vimperator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return completions;
            }
        }
    ));
    addDefaultCommand(new vimperator.Command(["undoa[ll]"],
        function(args, special, count)
        {
            if (count || special)
                return vimperator.echoerr("E488: Trailing characters");

            var ss = Cc["@mozilla.org/browser/sessionstore;1"].getService(Ci.nsISessionStore);
            var undoItems = eval("(" + ss.getClosedTabData(window) + ")");
            for (var i = 0; i < undoItems.length; i++)
                undoCloseTab(); // doesn't work with i as the index to undoCloseTab
        },
        {
            short_help: "Undo closing of all closed tabs",
            help: "Firefox stores up to 10 closed tabs, even after a browser restart."
        }
    )),
    addDefaultCommand(new vimperator.Command(["unl[et]"],
        function(args, special)
        {
            if (!args)
                return vimperator.echoerr("E471: Argument required");

            var names = args.split(/ /);
            if (typeof names == 'string') names = [names];
            var length = names.length;
            for (var i = 0, name = names[i]; i < length; name = names[++i])
            {
                var reference = vimperator.variableReference(name);
                if (!reference[0])
                {
                    if (!special)
                        vimperator.echoerr("E108: No such variable: " + name);
                    return;
                }

                delete reference[0][reference[1]];
            }
        },
        {
            usage: ["unl[et][!] {name} ..."],
            short_help: "Deletes a variable.",
            help: "Deletes the variable <code class=\"argument\">{name}</code>." +
                  "Several variable names can be given."
        }
    ));
    addDefaultCommand(new vimperator.Command(["unm[ap]"],
        function(args)
        {
            if (!args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            var lhs = args;

            if (vimperator.mappings.hasMap(vimperator.modes.NORMAL, lhs))
                vimperator.mappings.remove(vimperator.modes.NORMAL, lhs);
            else
                vimperator.echoerr("E31: No such mapping");
        },
        {
            usage: ["unm[ap] {lhs}"],
            short_help: "Remove the mapping of {lhs}",
            help: ""
        }
    ));
    addDefaultCommand(new vimperator.Command(["ve[rsion]"],
        function(args, special)
        {
            if (special)
                vimperator.open("about:");
            else
            vimperator.echo(":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) +
                            "\nVimperator " + vimperator.version + " running on:\n" + navigator.userAgent);
        },
        {
            usage: ["ve[rsion][!]"],
            short_help: "Show version information",
            help: "You can show the Firefox version page with <code class=\"command\">:version!</code>."
        }
    ));
    addDefaultCommand(new vimperator.Command(["viu[sage]"],
        function(args, special, count, modifiers) { vimperator.help("mappings", special, null, modifiers); },
        {
            short_help: "Show help for normal mode commands"
        }
    ));
    addDefaultCommand(new vimperator.Command(["winc[lose]", "wc[lose]"],
        function(args)
        {
            window.close();
        },
        {
            usage: ["winc[ose] [url] [, url]"],
            short_help: "Close window",
        }
    ));
    addDefaultCommand(new vimperator.Command(["wino[pen]", "wo[pen]", "wine[dit]"],
        function(args)
        {
            if (args)
                vimperator.open(args, vimperator.NEW_WINDOW);
            else
                vimperator.open("about:blank", vimperator.NEW_WINDOW);
        },
        {
            usage: ["wino[pen] [url] [, url]"],
            short_help: "Open one or more URLs in a new window",
            help: "Like <code class=\"command\">:open</code> but open URLs in a new window.<br/>"
        }
    ));
    addDefaultCommand(new vimperator.Command(["wqa[ll]", "wq", "xa[ll]"],
        function() { vimperator.quit(true); },
        {
            usage: ["wqa[ll]", "xa[ll]"],
            short_help: "Save the session and quit",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
                  "<code class=\"command\">:wq</code> is different as in Vim, as it closes the window instead of just one tab by popular demand. Complain on the mailing list, if you want to change that."
        }
    ));
    addDefaultCommand(new vimperator.Command(["zo[om]"],
        function(args, special)
        {
            var level;

            if (!args)
            {
                level = 100;
            }
            else if (/^\d+$/.test(args))
            {
                level = parseInt(args);
            }
            else if (/^[+-]\d+$/.test(args))
            {
                if (special)
                    level = vimperator.buffer.fullZoom + parseInt(args);
                else
                    level = vimperator.buffer.textZoom + parseInt(args);

                // relative args shouldn't take us out of range
                if (level < 1)
                    level = 1;
                if (level > 2000)
                    level = 2000;
            }
            else
            {
                vimperator.echoerr("E488: Trailing characters");
                return;
            }

            if (special)
                vimperator.buffer.fullZoom = level;
            else
                vimperator.buffer.textZoom = level;
        },
        {
            usage: ["zo[om][!] [value]", "zo[om][!] +{value} | -{value}"],
            short_help: "Set zoom value of current web page",
            help: "If <code class=\"argument\">{value}</code> can be an absolute value between 1 and 2000% or a relative value if prefixed with - or +. " +
                  "If <code class=\"argument\">{value}</code> is omitted, zoom is reset to 100%.<br/>" +
                  "Normally this command operates on the text zoom, if used with <code class=\"argument\">[!]</code> it operates on full zoom."
        }
    ));
    addDefaultCommand(new vimperator.Command(["!", "run"],
        function(args, special)
        {
            // :!! needs to be treated specially as the command parser sets the special flag but removes the ! from args
            if (special)
                args = "!" + (args || "");

            // TODO: better escaping of ! to also substitute \\! correctly
            args = args.replace(/(^|[^\\])!/g, "$1" + last_run_command);
            last_run_command = args;

            var output = vimperator.system(args)
            if (output)
                vimperator.echo(vimperator.util.escapeHTML(output));
        },
        {
            usage: ["!{cmd}"],
            short_help: "Run a command",
            help: "Runs <code class=\"argument\">{cmd}</code> through system() and displays its output. " +
                  "Any '!' in <code class=\"argument\">{cmd}</code> is replaced with the previous external command. " +
                  "But not when there is a backslash before the '!', then that backslash is removed.<br/>" +
                  "Input redirection (< foo) not done, also do not run commands which require stdin or it will hang Firefox!"
        }
    ));
    //}}}
} //}}}

// takes a string like 'google bla, www.osnews.com'
// and returns an array ['www.google.com/search?q=bla', 'www.osnews.com']
String.prototype.toURLArray = function() // {{{
{
    var urls = this.split(/\s*\,\s+/);

    begin: for (var url = 0; url < urls.length; url++)
    {
        var new_url = vimperator.buffer.URL;
        var matches;

        // strip each 'URL' - makes things simpler later on
        urls[url] = urls[url].replace(/^\s+/, '').replace(/\s+$/, '');

        // FIXME: not really that good (doesn't handle .. in the middle)
        // check for ./ and ../ (or even .../) to go to a file in the upper directory
        if (matches = urls[url].match(/^(?:\.$|\.\/(\S*))/))
        {
            var tail = matches[1] ? matches[1] : "";
            urls[url] = new_url.replace(/(.+\/)[^\/]*/, "$1" + tail);  // NOTE: escape / in character sets so as not to break Vim syntax highlighting
            continue;
        }
        else if (matches = urls[url].match(/^(?:\.\.$|\.\.\/(\S*))/))
        {
            var tail = matches[1] ? matches[1] : "";
            urls[url] = new_url.replace(/(.+\/)[^\/]*/, "$1../" + tail);
            continue;
        }
        else if (matches = urls[url].match(/^(?:\.\.\.$|\.\.\.\/(\S*))/))
        {
            var location = window.content.document.location;
            var tail = matches[1] ? matches[1] : "";
            urls[url] = location.protocol + "//" + location.host + "/" + tail
            continue;
        }

        // if the string doesn't look like a valid URL (i.e. contains a space
        // or does not contain any of: .:/) try opening it with a search engine
        // or keyword bookmark
        if (/\s/.test(urls[url]) || !/[.:\/]/.test(urls[url]))
        {
            matches = urls[url].match(/^(\S+)(?:\s+(.+))?$/)

            var alias = matches[1];
            var text = matches[2] ? matches[2] : null;

            // TODO: it would be clearer if the appropriate call to
            // getSearchURL was made based on whether or not the first word was
            // indeed an SE alias rather than seeing if getSearchURL can
            // process the call usefully and trying again if it fails - much
            // like the comments below ;-)

            // check if the first word is a search engine
            var search_url = vimperator.bookmarks.getSearchURL(text, alias);
            if (search_url/* && search_url.length >= 1*/)
            {
                urls[url] = search_url;
                continue;
            }
            else // the first word was not a search engine, search for the whole string in the default engine
            {
                search_url = vimperator.bookmarks.getSearchURL(urls[url], null);
                if (search_url/* && search_url.length >= 1*/)
                {
                    urls[url] = search_url;
                    continue;
                }
            }
        }

        // if we are here let Firefox handle the url and hope it does
        // something useful with it :)
    }

    return urls;
} // }}}

// vim: set fdm=marker sw=4 ts=4 et:
