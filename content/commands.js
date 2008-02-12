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

vimperator.Command = function (specs, action, extraInfo) //{{{
{
    if (!specs || !action)
        return null;

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

    this.specs = specs;
    var expandedSpecs = parseSpecs(specs);
    this.shortNames = expandedSpecs.shortNames;
    this.longNames = expandedSpecs.longNames;

    // return the primary command name (the long name of the first spec listed)
    this.name = this.longNames[0];

    // return all command name aliases
    this.names = expandedSpecs.names;

    this.action = action;

    if (extraInfo)
    {
        this.help      = extraInfo.help || null;
        this.shortHelp = extraInfo.shortHelp || null;
        this.completer = extraInfo.completer || null;
        this.args       = extraInfo.args || [];
        this.isUserCommand = extraInfo.isUserCommand || false;
    }

};

vimperator.Command.prototype = {

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

vimperator.Commands = function () //{{{
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

    var exCommands = [];
    var lastRunCommand = ""; // updated whenever the users runs a command with :!

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
                                arg = parseInt(arg, 10);
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

    function commandsIterator()
    {
        for (var i = 0; i < exCommands.length; i++)
            yield exCommands[i];

        throw StopIteration;
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
                    if (exCommands[i].name.match("^"+name))
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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var commandManager = {

        __iterator__: function ()
        {
            return commandsIterator();
        },

        // FIXME 
        // TODO: should commands added this way replace existing commands?
        add: function (names, description, action, extra)
        {
            var extra = extra || {};
            if (!extra.shortHelp)
                extra.shortHelp = description;

            var command = new vimperator.Command(names, action, extra);
            if (!command)
                return false;

            for (var i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].name == command.name)
                {
                    //if (!replace)
                        return false; // never replace for now
                    //else
                    //    break;
                }
            }


            // add an alias, so that commands can be accessed with
            // vimperator.commands.zoom("130")
            this[command.name] = function (args, special, count, modifiers)
            {
                command.execute(args, special, count, modifiers);
            };

            exCommands.push(command);
            return true;
        },

        // TODO: will change it's interface/semantics later!
        addUserCommand: function (command, replace)
        {
            for (var i = 0; i < exCommands.length; i++)
            {
                if (exCommands[i].name == command.name)
                {
                    if (!replace)
                        return false;
                    else
                        break;
                }
            }

            // add an alias, so that commands can be accessed with
            // vimperator.commands.zoom("130")
            this[command.name] = function (args, special, count, modifiers)
            {
                command.execute(args, special, count, modifiers);
            };

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
    ////////////////////// DEFAULT COMMANDS ////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commandManager.addUserCommand(new vimperator.Command(["addo[ns]"],
        function () { vimperator.open("chrome://mozapps/content/extensions/extensions.xul", vimperator.NEW_TAB); },
        {
            shortHelp: "Show available Browser Extensions and Themes"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["ba[ck]"],
        function (args, special, count)
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
            shortHelp: "Go back in the browser history",
            completer: function (filter)
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
                return [0, completions];
            }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["beep"],
        function () { vimperator.beep(); },
        {
            shortHelp: "Play a system beep"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["bma[rk]"],
        function (args)
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

            if (vimperator.bookmarks.add(false, title, url, keyword, tags))
            {
                var extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                vimperator.echo("Added bookmark: " + url + extra, vimperator.commandline.FORCE_SINGLELINE);
            }
            else
                vimperator.echoerr("Exxx: Could not add bookmark `" + title + "'", vimperator.commandline.FORCE_SINGLELINE);
        },
        {
            shortHelp: "Add a bookmark",
            args: [[["-title", "-t"],    OPTION_STRING],
                   [["-tags", "-T"],     OPTION_LIST],
                   [["-keyword", "-k"],  OPTION_STRING, function (arg) { return /\w/.test(arg); }]]
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["bmarks"],
        function (args, special)
        {
            var res = parseArgs(args, this.args);
            if (!res)
                return;

            var tags = getOption(res.opts, "-tags", []);
            vimperator.bookmarks.list(res.args.join(" "), tags, special);
        },
        {
            shortHelp: "List or open multiple bookmarks",
            completer: function (filter) { return [0, vimperator.bookmarks.get(filter)]; },
            args: [[["-tags", "-T"],     OPTION_LIST]]
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["dia[log]"],
        function (args, special)
        {
            function viewPartialSource() 
            {
                // copied (and tuned somebit) from browser.jar -> nsContextMenu.js
                var focusedWindow = document.commandDispatcher.focusedWindow;
                if (focusedWindow == window)
                focusedWindow = content;

                var docCharset = null;
                if (focusedWindow)
                    docCharset = "charset=" + focusedWindow.document.characterSet;

                var reference = null;
                reference = focusedWindow.getSelection();

                var docUrl = null;
                window.openDialog("chrome://global/content/viewPartialSource.xul",
                        "_blank", "scrollbars,resizable,chrome,dialog=no",
                        docUrl, docCharset, reference, "selection");
            }

            try
            {
                switch (args)
                {
                case "about": openDialog("chrome://browser/content/aboutDialog.xul", "_blank", "chrome,dialog,modal,centerscreen"); break;
                case "addbookmark": PlacesCommandHook.bookmarkCurrentPage(true, PlacesUtils.bookmarksRootId); break;
                case "addons": BrowserOpenAddonsMgr(); break;
                case "bookmarks": openDialog("chrome://browser/content/bookmarks/bookmarksPanel.xul", "Bookmarks", "dialog,centerscreen,width=600,height=600"); break;
                case "checkupdates": checkForUpdates(); break;
                case "cleardata": Cc[GLUE_CID].getService(Ci.nsIBrowserGlue).sanitize(window || null); break;
                case "console": toJavaScriptConsole(); break;
                case "customizetoolbar": BrowserCustomizeToolbar(); break;
                case "dominspector": inspectDOMDocument(content.document); break;
                case "downloads": toOpenWindowByType('Download:Manager', 'chrome://mozapps/content/downloads/downloads.xul', 'chrome,dialog=no,resizable'); break;
                case "history": openDialog("chrome://browser/content/history/history-panel.xul", "History", "dialog,centerscreen,width=600,height=600"); break;
                case "import": BrowserImport(); break;
                case "openfile": BrowserOpenFileWindow(); break;
                case "pageinfo": BrowserPageInfo(); break;
                case "pagesource": BrowserViewSourceOfDocument(content.document); break;
                case "places": PlacesCommandHook.showPlacesOrganizer(ORGANIZER_ROOT_BOOKMARKS); break;
                case "preferences": openPreferences(); break;
                case "printpreview": PrintUtils.printPreview(onEnterPrintPreview, onExitPrintPreview); break;
                case "print": PrintUtils.print(); break;
                case "printsetup": PrintUtils.showPageSetup(); break;
                case "saveframe": saveFrameDocument(); break;
                case "savepage": saveDocument(window.content.document); break;
                case "searchengines": openDialog("chrome://browser/content/search/engineManager.xul", "_blank", "chrome,dialog,modal,centerscreen"); break;
                case "selectionsource": viewPartialSource(); break;
                case "": vimperator.echoerr("E474: Invalid argument"); break;
                default: vimperator.echoerr("Dialog '" + args + "' not available");
                }
            }
            catch (e)
            {
                vimperator.echoerr("Error opening '" + args + "': " + e);
            }
        },
        {
            shortHelp: "Open a Firefox dialog",
            completer: function (filter) { return vimperator.completion.dialog(filter); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["delbm[arks]"],
        function (args, special)
        {
            var url = args;
            if (!url)
                url = vimperator.buffer.URL;

            var deletedCount = vimperator.bookmarks.remove(url);
            vimperator.echo(deletedCount + " bookmark(s) with url `" + url + "' deleted", vimperator.commandline.FORCE_SINGLELINE);
        },
        {
            shortHelp: "Delete a bookmark",
            completer: function (filter) { return [0, vimperator.bookmarks.get(filter)]; }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["cd", "chd[ir]"],
        function (args)
        {
            if (!args)
                args = "~";

            if (vimperator.io.setCurrentDirectory(args))
                vimperator.echo(vimperator.io.getCurrentDirectory());
        },
        {
            shortHelp: "Change the current directory",
            completer: function (filter) { return vimperator.completion.file(filter, true); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["pw[d]"],
        function (args)
        {
            if (args)
                vimperator.echoerr("E488: Trailing characters");
            else
                vimperator.echo(vimperator.io.getCurrentDirectory());
        },
        {
            shortHelp: "Print the current directory name"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["com[mand]"],
        function (args, special)
        {
            if (args)
            {
                var res = args.match(/^(\w+)(?:\s+(.+))?$/);
                if (!res)
                {
                    vimperator.echoerr("E182: Invalid command name");
                    return false;
                }
                var [cmd, rep] = [res[1], res[2]]
            }

            if (rep)
            {
                if (!vimperator.commands.addUserCommand(new vimperator.Command([cmd], function (args, special, count, modifiers) { eval(rep) }, { isUserCommand: rep } ), special))
                    vimperator.echoerr("E174: Command already exists: add ! to replace it");
            }
            else
            {
                var cmdlist = getUserCommands(cmd);
                if (cmdlist.length > 0)
                {
                    var str = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                              "<table><tr align=\"left\" class=\"hl-Title\"><th>Name</th><th>Args</th><th>Definition</th></tr>";
                    for (var i = 0; i < cmdlist.length; i++)
                        str += "<tr><td>" + cmdlist[i].name + "</td><td>" + "*" + "</td><td>" + cmdlist[i].isUserCommand + "</td></tr>";
                    str += "</table>"
                    vimperator.commandline.echo(str, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
                }
                else
                    vimperator.echo("No user-defined commands found");
            }
        },
        {
            shortHelp: "Lists and defines commands" /*,
            args: [[["-nargs"],    OPTION_STRING, function (arg) { return /^(0|1|\*|\?|\+)$/.test(arg); }],
                   [["-bang"],     OPTION_NOARG],
                   [["-bar"],      OPTION_NOARG]] */
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["delm[arks]"],
        function (args, special)
        {
            if (!special && !args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }
            if (special && args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
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
            shortHelp: "Delete the specified marks"
        }

    ));
    commandManager.addUserCommand(new vimperator.Command(["delqm[arks]"],
        function (args, special)
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
                return;
            }

            if (special)
                vimperator.quickmarks.removeAll();
            else
                vimperator.quickmarks.remove(args);
        },
        {
            shortHelp: "Delete the specified QuickMarks"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["downl[oads]", "dl"],
        function () { vimperator.open("chrome://mozapps/content/downloads/downloads.xul", vimperator.NEW_TAB); },
        {
            shortHelp: "Show progress of current downloads"
        }
    ));

    // TODO: move helper function somewhere else?
    function argToString(arg, color)
    {
        if (!arg)
            return "";

        try
        {
            // TODO: move to vimperator.eval()?
            // with (vimperator) means, vimperator is the default namespace "inside" eval
            arg = eval("with(vimperator){" + arg + "}");
        }
        catch (e)
        {
            vimperator.echoerr(e.toString());
            return null;
        }

        if (typeof arg === "object")
            arg = vimperator.util.objectToString(arg, color);
        else if (typeof arg === "function")
            arg = vimperator.util.escapeHTML(arg.toString());
        else if (typeof arg === "number" || typeof arg === "boolean")
            arg = "" + arg;
        else if (typeof arg === "undefined")
            arg = "undefined";

        return arg;
    }
    commandManager.addUserCommand(new vimperator.Command(["ec[ho]"],
        function (args)
        {
            var res = argToString(args, true);
            if (res != null)
                vimperator.echo(res);
        },
        {
            shortHelp: "Display a string at the bottom of the window",
            completer: function (filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["echoe[rr]"],
        function (args)
        {
            var res = argToString(args, false);
            if (res != null)
                vimperator.echoerr(res);
        },
        {
            shortHelp: "Display an error string at the bottom of the window",
            completer: function (filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["exe[cute]"],
        function (args)
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
            shortHelp: "Execute the string that results from the evaluation of {expr1} as an Ex command."
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["exu[sage]"],
        function (args, special, count, modifiers)
        {
            var usage = "<table>";
            for (let command in vimperator.commands)
            {
                usage += "<tr><td style='color: magenta; padding-right: 20px'> :" +
                         vimperator.util.escapeHTML(command.name) + "</td><td>" +
                         vimperator.util.escapeHTML(command.shortHelp) + "</td></tr>";
            }
            usage += "</table>";

            vimperator.echo(usage, vimperator.commandline.FORCE_MULTILINE);
        },
        {
            shortHelp: "Show help for Ex commands"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["fo[rward]", "fw"],
        function (args, special, count)
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
            shortHelp: "Go forward in the browser history",
            completer: function (filter)
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
                return [0, completions];
            }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["ha[rdcopy]"],
        function () { getBrowser().contentWindow.print(); },
        {
            shortHelp: "Print current document"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["h[elp]"],
        function (args, special, count, modifiers)
        {
            function jumpToTag(file, tag)
            {
                vimperator.open("chrome://" + vimperator.config.name.toLowerCase() + "/locale/" + file);
                setTimeout(function() {
                    var elem = vimperator.buffer.getElement('@class="tag" and text()="' + tag + '"');
                    if (elem)
                        window.content.scrollTo(0, elem.getBoundingClientRect().top - 10); // 10px context
                    else
                        dump('no element: ' + '@class="tag" and text()="' + tag + '"\n' );
                }, 200);
            }

            if (!args)
            {
                vimperator.open("chrome://" + vimperator.config.name.toLowerCase() + "/locale/intro.html");
                return;
            }

            var [, items] = vimperator.completion.help(args);
            var partialMatch = -1;
            for (var i = 0; i < items.length; i++)
            {
                if (items[i][0] == args)
                {
                    jumpToTag(items[i][1], items[i][0]);
                    return;
                }
                else if (partialMatch == -1 && items[i][0].indexOf(args) > -1)
                {
                    partialMatch = i;
                }
            }

            if (partialMatch > -1)
                jumpToTag(items[partialMatch][1], items[partialMatch][0]);
            else
                vimperator.echoerr("E149: Sorry, no help for " + args);
        },
        {
            shortHelp: "Display help",
            completer: function (filter) { return vimperator.completion.help(filter); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["hist[ory]", "hs"],
        function (args, special) { vimperator.history.list(args, special); },
        {
            shortHelp: "Show recently visited URLs",
            completer: function (filter) { return [0, vimperator.history.get(filter)]; }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["javas[cript]", "js"],
        function (args, special)
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
                        function (code)
                        {
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
                        eval("with(vimperator){" + args + "}");
                    }
                    catch (e)
                    {
                        vimperator.echoerr(e.name + ": " + e.message);
                    }
                }
            }
        },
        {
            shortHelp: "Run any JavaScript command through eval()",
            completer: function (filter) { return vimperator.completion.javascript(filter); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["let"],
        function (args)
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

            var matches;
            // 1 - type, 2 - name, 3 - +-., 4 - expr
            if (matches = args.match(/([$@&])?([\w:]+)\s*([+-.])?=\s*(.+)/))
            {
                if (!matches[1])
                {
                    var reference = vimperator.variableReference(matches[2]);
                    if (!reference[0] && matches[3])
                    {
                        vimperator.echoerr("E121: Undefined variable: " + matches[2]);
                        return;
                    }

                    var expr = vimperator.eval(matches[4]);
                    if (typeof expr === undefined)
                    {
                        vimperator.echoerr("E15: Invalid expression: " + matches[4]);
                        return;
                    }
                    else
                    {
                        if (!reference[0])
                        {
                            if (reference[2] == "g")
                                reference[0] = vimperator.globalVariables;
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
                var reference = vimperator.variableReference(matches[1]);
                if (!reference[0])
                {
                    vimperator.echoerr("E121: Undefined variable: " + matches[1]);
                    return;
                }

                var value = reference[0][reference[1]];
                if (typeof value == "number")
                    var prefix = "#";
                else if (typeof value == "function")
                    var prefix = "*";
                else
                    var prefix = "";
                vimperator.echo(reference[1] + "\t\t" + prefix + value);
            }
        },
        {
            shortHelp: "Sets or lists a variable"
        }
    ));
    // code for abbreviations
    commandManager.addUserCommand(new vimperator.Command(["ab[breviate]"],
        function (args)
        {
            if (!args)
            {
                vimperator.editor.listAbbreviations("!", "");
                return;
            }

            var matches = args.match(/^([^\s]+)(?:\s+(.+))?$/);
            var [lhs, rhs] = [matches[1], matches[2]];
            if (rhs)
                vimperator.editor.addAbbreviation("!", lhs, rhs);
            else
                vimperator.editor.listAbbreviations("!", lhs);
        },
        {
            shortHelp: "Abbreviate a key sequence"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["ca[bbrev]"],
        function (args)
        {
            if (!args)
            {
                vimperator.editor.listAbbreviations("c", "");
                return;
            }

            var matches = args.match(/^([^\s]+)(?:\s+(.+))?$/);
            var [lhs, rhs] = [matches[1], matches[2]];
            if (rhs)
                vimperator.editor.addAbbreviation("c", lhs, rhs);
            else
                vimperator.editor.listAbbreviations("c", lhs);
        },
        {
            shortHelp: "Abbreviate a key sequence for Command-line mode"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["ia[bbrev]"],
        function (args)
        {
            if (!args)
            {
                vimperator.editor.listAbbreviations("i", "");
                return;
            }

            var matches = args.match(/^([^\s]+)(?:\s+(.+))?$/);
            var [lhs, rhs] = [matches[1], matches[2]];
            if (rhs)
                vimperator.editor.addAbbreviation("i", lhs, rhs);
            else
                vimperator.editor.listAbbreviations("i", lhs);
        },
        { shortHelp: "Abbreviate a key sequence for Insert mode" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["una[bbreviate]"],
        function (args) { vimperator.editor.removeAbbreviation("!", args); },
        { shortHelp: "Remove an abbreviation" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["cuna[bbrev]"],
        function (args) { vimperator.editor.removeAbbreviation("c", args); },
        { shortHelp: "Remove an abbreviation for Command-line mode" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["iuna[bbrev]"],
        function (args) { vimperator.editor.removeAbbreviation("i", args); },
        { shortHelp: "Remove an abbreviation for Insert mode" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["abc[lear]"],
        function (args) { vimperator.editor.removeAllAbbreviations("!"); },
        { shortHelp: "Remove all abbreviations" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["cabc[lear]"],
        function (args) { vimperator.editor.removeAllAbbreviations("c"); },
        { shortHelp: "Remove all abbreviations for Command-line mode" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["iabc[lear]"],
        function (args) { vimperator.editor.removeAllAbbreviations("i"); },
        { shortHelp: "Remove all abbreviations for Insert mode" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["au[tocmd]"],
        function (args, special) 
        {  
            if (!args)
            {
                if (special) // :au!
                    vimperator.autocommands.remove(null, null);
                else // :au
                    vimperator.autocommands.list(null, null);
            } 
            else
            {
                // (?:  ) means don't store; (....)? <-> exclamation marks makes the group optional
                var [all, asterix, auEvent, regex, cmds] =  args.match(/^(\*)?(?:\s+)?(\S+)(?:\s+)?(\S+)?(?:\s+)?(.+)?$/);

                if (cmds)
                {
                    vimperator.autocommands.add(auEvent, regex, cmds);
                }
                else if (regex) // e.g. no cmds provided
                {
                    if (special)
                        vimperator.autocommands.remove(auEvent, regex);
                    else
                        vimperator.autocommands.list(auEvent, regex);
                }
                else if (auEvent)
                {
                    if (asterix)
                        if (special)
                            vimperator.autocommands.remove(null, auEvent); // ':au! * auEvent'
                        else
                            vimperator.autocommands.list(null, auEvent);
                    else
                        if (special)
                            vimperator.autocommands.remove(auEvent, null);
                        else
                            vimperator.autocommands.list(auEvent, null);
                }
            }
        },
        {
            shortHelp: "Execute commands automatically on events",
            completer: function (filter) { return vimperator.completion.autocommands(filter); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["macros"],
        function (arg)
        {
            var str = "<table>";
            var macroRef = vimperator.events.getMacros(arg);
            for (var item in macroRef)
               str += "<tr><td> " + item + " &nbsp; </td><td>" + 
                      vimperator.util.escapeHTML(macroRef[item]) + "</td></tr>";

            str += "</table>";

            vimperator.echo(str, vimperator.commandline.FORCE_MULTILINE);
        },
        {
            shortHelp: "List macros matching a regex"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["delmac[ros]"],
        function (arg)
        {
            if (!arg)
                vimperator.echoerr("E474: Invalid argument");
            else
                vimperator.events.deleteMacros(arg);
        },
        {
            shortHelp: "Delete macros matching a regex"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["pl[ay]"],
        function (arg)
        {
            if (!arg)
                vimperator.echoerr("E474: Invalid argument");
            else
                vimperator.events.playMacro(arg);
        },
        {
            shortHelp: "Play a macro",
            completer: function (filter) { return vimperator.completion.macros(filter); }
        }
    ));
    // 0 args -> list all maps
    // 1 arg  -> list the maps starting with args
    // 2 args -> map arg1 to arg*
    function map(args, mode, noremap)
    {
        if (!args)
        {
            vimperator.mappings.list(mode);
            return;
        }

        // ?:\s+ <- don't remember; (...)? optional = rhs
        var [, lhs, rhs] = args.match(/(\S+)(?:\s+(.+))?/);
        var leaderRegexp = /<Leader>/i;

        if (leaderRegexp.test(lhs))
            lhs = lhs.replace(leaderRegexp, vimperator.events.getMapLeader());

        if (!rhs) // list the mapping
        {
            vimperator.mappings.list(mode, lhs);
        }
        else
        {
            for (var index = 0; index < mode.length; index++)
            {
                vimperator.mappings.addUserMap(new vimperator.Map([mode[index]], [lhs],
                        function (count) { vimperator.events.feedkeys((count > 1 ? count : "") + rhs, noremap); },
                        { flags: vimperator.Mappings.flags.COUNT, rhs: rhs, noremap: noremap}
                    ));
            }
        }
    }
    commandManager.addUserCommand(new vimperator.Command(["map"],
        function (args) { map(args, [vimperator.modes.NORMAL], false); },
        { shortHelp: "Map the key sequence {lhs} to {rhs}" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["cm[ap]"],
        function (args) { map(args, [vimperator.modes.COMMAND_LINE], false); },
        { shortHelp: "Map the key sequence {lhs} to {rhs} (in command-line mode)" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["im[ap]"],
        function (args) { map(args, [vimperator.modes.INSERT, vimperator.modes.TEXTAREA], false); },
        { shortHelp: "Map the key sequence {lhs} to {rhs} (in insert mode)" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["mapc[lear]"],
        function (args)
        {
            if (args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            vimperator.mappings.removeAll(vimperator.modes.NORMAL);
        },
        {
            shortHelp: "Remove all mappings"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["cmapc[lear]"],
        function (args)
        {
            if (args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            vimperator.mappings.removeAll(vimperator.modes.COMMAND_LINE);
        },
        {
            shortHelp: "Remove all mappings (in command-line mode)"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["imapc[lear]"],
        function (args)
        {
            if (args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            vimperator.mappings.removeAll(vimperator.modes.INSERT);
            vimperator.mappings.removeAll(vimperator.modes.TEXTAREA);
        },
        {
            shortHelp: "Remove all mappings (in insert mode)"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["ma[rk]"],
        function (args)
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
            shortHelp: "Mark current location within the web page"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["marks"],
        function (args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z]/.test(args))
            {
                vimperator.echoerr("E283: No marks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z]/g, "");
            vimperator.marks.list(filter);
        },
        {
            shortHelp: "Show all location marks of current web page"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["mkv[imperatorrc]"],
        function (args, special)
        {
            // TODO: "E172: Only one file name allowed"
            var filename;
            if (args)
                filename = args;
            else
                filename = (navigator.platform == "Win32") ? "~/_vimperatorrc" : "~/.vimperatorrc";

            var file = vimperator.io.getFile(filename);
            if (file.exists() && !special)
            {
                vimperator.echoerr("E189: \".vimperatorrc\" exists (add ! to override)");
                return;
            }

            var line = "\" " + vimperator.version + "\n";
            line += "\" Mappings\n";

            var mode = [[[vimperator.modes.NORMAL], ""], [[vimperator.modes.COMMAND_LINE], "c"],
                         [[vimperator.modes.INSERT, vimperator.modes.TEXTAREA], "i"]];
            for (var y = 0; y < mode.length; y++)
            {
                // NOTE: names.length is always 1 on user maps. If that changes, also fix getUserIterator and v.m.list
                for (var map in vimperator.mappings.getUserIterator(mode[y][0]))
                        line += mode[y][1] + (map.noremap ? "nore" : "") + "map " + map.names[0] + " " + map.rhs + "\n";
            }

            line += "\n\" Options\n";
            for (var option in vimperator.options)
            {
                // TODO: options should be queried for this info
                // TODO: string/list options might need escaping in future
                if (!/fullscreen|usermode/.test(option.name) && option.value != option.defaultValue)
                {
                    if (option.type == "boolean")
                        line += "set " + (option.value ? option.name : "no" + option.name) + "\n";
                    else
                        line += "set " + option.name + "=" + option.value + "\n";
                }
            }

            // :mkvimrc doesn't save autocommands, so we don't either - remove this code at some point
            // line += "\n\" Auto-Commands\n";
            // for (var item in vimperator.autocommands)
            //     line += "autocmd " + item + "\n";

            line += "\n\" Abbreviations\n";
            for (var abbrCmd in vimperator.editor.abbreviations)
                line += abbrCmd;

            // if (vimperator.events.getMapLeader() != "\\")
            //    line += "\nlet mapleader = \"" + vimperator.events.getMapLeader() + "\"\n";

            // source a user .vimperatorrc file
            line += "\nsource! " + filename + ".local\n";
            line += "\n\" vim: set ft=vimperator:";

            vimperator.io.writeFile(file, line);
        },
        {
            shortHelp: "Write current key mappings and changed options to [file]"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["noh[lsearch]"],
        function (args) { vimperator.search.clear(); },
        { shortHelp: "Remove the search highlighting" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["norm[al]"],
        function (args, special)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            vimperator.events.feedkeys(args, special);
        },
        {
            shortHelp: "Execute Normal mode commands"
        }
    ));
    // TODO: remove duplication in :map
    commandManager.addUserCommand(new vimperator.Command(["no[remap]"],
        function (args) { map(args, [vimperator.modes.NORMAL], true); },
        { shortHelp: "Map the key sequence {lhs} to {rhs}" }
    ));
    // XXX: TODO: remove duplication in :cmap
    commandManager.addUserCommand(new vimperator.Command(["cno[remap]"],
        function (args) { map(args, [vimperator.modes.COMMAND_LINE], true); },
        { shortHelp: "Map the key sequence {lhs} to {rhs} (in command-line mode)" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["ino[remap]"],
        function (args) { map(args, [vimperator.modes.INSERT, vimperator.modes.TEXTAREA], true); },
        { shortHelp: "Map the key sequence {lhs} to {rhs} (in insert mode)" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["o[pen]", "e[dit]"],
        function (args, special)
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
            shortHelp: "Open one or more URLs in the current tab",
            completer: function (filter) { return vimperator.completion.url(filter); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["pa[geinfo]"],
        function () { vimperator.buffer.showPageInfo(true); },
        { shortHelp: "Show various page information" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["pc[lose]"],
        function () { vimperator.previewwindow.hide(); },
        { shortHelp: "Close preview window on bottom of screen" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["pref[erences]", "prefs"],
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
        },
        {
            shortHelp: "Show Browser Preferences"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["qma[rk]"],
        function (args)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            var matches = args.match(/^([a-zA-Z0-9])(?:\s+(.+))?$/);
            if (!matches)
                vimperator.echoerr("E488: Trailing characters");
            else if (!matches[2])
                vimperator.quickmarks.add(matches[1], vimperator.buffer.URL);
            else
                vimperator.quickmarks.add(matches[1], matches[2]);
        },
        {
            shortHelp: "Mark a URL with a letter for quick access"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["qmarks"],
        function (args)
        {
            // ignore invalid mark characters unless there are no valid mark chars
            if (args && !/[a-zA-Z0-9]/.test(args))
            {
                vimperator.echoerr("E283: No QuickMarks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z0-9]/g, "");
            vimperator.quickmarks.list(filter);
        },
        {
            shortHelp: "Show all QuickMarks"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["q[uit]"],
        function () { vimperator.tabs.remove(getBrowser().mCurrentTab, 1, false, 1); },
        { shortHelp: "Quit current tab" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["quita[ll]", "qa[ll]"],
        function () { vimperator.quit(false); },
        { shortHelp: "Quit Vimperator", }
    ));
    commandManager.addUserCommand(new vimperator.Command(["redr[aw]"],
        function ()
        {
            var wu = window.QueryInterface(Components.interfaces.nsIInterfaceRequestor).
                            getInterface(Components.interfaces.nsIDOMWindowUtils);
            wu.redraw();
        },
        { shortHelp: "Redraw the screen", }
    ));
    commandManager.addUserCommand(new vimperator.Command(["re[load]"],
        function (args, special) { vimperator.tabs.reload(getBrowser().mCurrentTab, special); },
        { shortHelp: "Reload current page" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["reloada[ll]"],
        function (args, special) { vimperator.tabs.reloadAll(special); },
        { shortHelp: "Reload all pages" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["res[tart]"],
        function () { vimperator.restart(); },
        { shortHelp: "Force the browser to restart" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["sav[eas]", "w[rite]"],
        function (args, special)
        {
            var file = vimperator.io.getFile(args || ""); 
            // we always want to save that link relative to the current working directory
            vimperator.options.setPref("browser.download.lastDir", vimperator.io.getCurrentDirectory());
            //if (args)
            //{
            //    saveURL(vimperator.buffer.URL, args, null, true, special, // special == skipPrompt
            //            makeURI(vimperator.buffer.URL, content.document.characterSet));
            //}
            //else
            saveDocument(window.content.document, special);
        },
        {
            shortHelp: "Save current web page to disk"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["se[t]"],
        // TODO: support setting multiple options at once
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
            shortHelp: "Set an option",
            completer: function (filter, special) { return vimperator.completion.option(filter, special); }
        }
    ));
    // TODO: sclose instead?
    commandManager.addUserCommand(new vimperator.Command(["sbcl[ose]"],
        function (args)
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
            shortHelp: "Close the sidebar window"
        }
    ));
    // TODO: sopen instead? Separate :sidebar from :sbopen and make them behave
    // more like :cw, :cope etc
    commandManager.addUserCommand(new vimperator.Command(["sideb[ar]", "sb[ar]", "sbope[n]"],
        function (args)
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

            var menu = document.getElementById("viewSidebarMenu");

            for (var i = 0; i < menu.childNodes.length; i++)
            {
                if (menu.childNodes[i].label == args)
                {
                    eval(menu.childNodes[i].getAttribute("oncommand"));
                    break;
                }
            }
        },
        {
            shortHelp: "Open the sidebar window",
            completer: function (filter) { return vimperator.completion.sidebar(filter); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["so[urce]"],
        function (args, special)
        {
            // FIXME: implement proper filename quoting
            //if (/[^\\]\s/.test(args))
            //{
            //    vimperator.echoerr("E172: Only one file name allowed");
            //    return;
            //}

            vimperator.io.source(args, special);
        },
        {
            shortHelp: "Read Ex commands from {file}",
            completer: function (filter) { return vimperator.completion.file(filter, true); }
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["st[op]"],
        function() { BrowserStop(); },
        { shortHelp: "Stop loading" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["time"],
        function (args, special, count)
        {
            try
            {
                if (count > 1)
                {
                    var i = count;
                    var beforeTime = Date.now();

                    if (args && args[0] == ":")
                    {
                        while (i--)
                            vimperator.execute(args);
                    }
                    else
                    {
                        while (i--)
                            eval("with(vimperator){" + args + "}");
                    }

                    if (special)
                        return;

                    var afterTime = Date.now();

                    if ((afterTime - beforeTime) / count >= 100)
                    {
                        var each = ((afterTime - beforeTime) / 1000.0 / count);
                        var eachUnits = "sec";
                    }
                    else
                    {
                        var each = ((afterTime - beforeTime) / count);
                        var eachUnits = "msec";
                    }

                    if (afterTime - beforeTime >= 100)
                    {
                        var total = ((afterTime - beforeTime) / 1000.0);
                        var totalUnits = "sec";
                    }
                    else
                    {
                        var total = (afterTime - beforeTime);
                        var totalUnits = "msec";
                    }

                    var str = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                              "<table>" +
                              "<tr align=\"left\" class=\"hl-Title\"><th colspan=\"3\">Code execution summary</th></tr>" +
                              "<tr><td>  Executed:</td><td align=\"right\"><span style=\"color: green\">" + count + "</span></td><td>times</td></tr>" +
                              "<tr><td>  Average time:</td><td align=\"right\"><span style=\"color: green\">" + each.toFixed(2) + "</span></td><td>" + eachUnits + "</td></tr>" +
                              "<tr><td>  Total time:</td><td align=\"right\"><span style=\"color: red\">" + total.toFixed(2) + "</span></td><td>" + totalUnits + "</td></tr>" +
                              "</table>";

                    vimperator.commandline.echo(str, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
                }
                else
                {
                    var beforeTime = Date.now();
                    if (args && args[0] == ":")
                        vimperator.execute(args);
                    else
                        eval("with(vimperator){" + args + "}");

                    if (special)
                        return;

                    var afterTime = Date.now();

                    if (afterTime - beforeTime >= 100)
                        vimperator.echo("Total time: " + ((afterTime - beforeTime) / 1000.0).toFixed(2) + " sec");
                    else
                        vimperator.echo("Total time: " + (afterTime - beforeTime) + " msec");
                }
            }
            catch (e)
            {
                vimperator.echoerr(e);
            }
        },
        {
            shortHelp: "Profile a piece of code or a command"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["unl[et]"],
        function (args, special)
        {
            if (!args)
            {
                vimperator.echoerr("E471: Argument required");
                return;
            }

            var names = args.split(/ /);
            if (typeof names == "string") names = [names];
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
            shortHelp: "Deletes a variable."
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["unm[ap]"],
        function (args)
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
            shortHelp: "Remove the mapping of {lhs}"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["cunm[ap]"],
        function (args)
        {
            if (!args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            var lhs = args;

            if (vimperator.mappings.hasMap(vimperator.modes.COMMAND_LINE, lhs))
                vimperator.mappings.remove(vimperator.modes.COMMAND_LINE, lhs);
            else
                vimperator.echoerr("E31: No such mapping");
        },
        {
            shortHelp: "Remove the mapping of {lhs} (in command-line mode)"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["iunm[ap]"],
        function (args)
        {
            if (!args)
            {
                vimperator.echoerr("E474: Invalid argument");
                return;
            }

            var lhs = args;
            var flag = false;

            if (vimperator.mappings.hasMap(vimperator.modes.INSERT, lhs))
            {
                vimperator.mappings.remove(vimperator.modes.INSERT, lhs);
                flag = true;
            }
            if (vimperator.mappings.hasMap(vimperator.modes.TEXTAREA, lhs))
            {
                vimperator.mappings.remove(vimperator.modes.TEXTAREA, lhs);
                flag = true;
            }
            if (!flag)
                vimperator.echoerr("E31: No such mapping");
        },
        {
            shortHelp: "Remove the mapping of {lhs} (in insert mode)"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["ve[rsion]"],
        function (args, special)
        {
            if (special)
                vimperator.open("about:");
            else
                vimperator.echo(":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) +
                                "\nVimperator " + vimperator.version + " running on:\n" + navigator.userAgent);
        },
        {
            shortHelp: "Show version information"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["vie[wsource]"],
        function (args, special)
        {
            var url = args || vimperator.buffer.URL;
            if (special) // external editor
            {
                // TODO: make that a helper function
                // TODO: save return value in v:shell_error
                var newThread = Components.classes["@mozilla.org/thread-manager;1"].getService().newThread(0);
                var editor = vimperator.options["editor"];
                var args = editor.split(" "); // FIXME: too simple
                if (args.length < 1)
                {
                    vimperator.open("view-source:" + url)
                    vimperator.echoerr("no editor specified");
                    return;
                }

                var prog = args.shift();
                args.push(url)
                vimperator.callFunctionInThread(newThread, vimperator.io.run, [prog, args, true]);
            }
            else
            {
                vimperator.open("view-source:" + url)
            }
        },
        {
            shortHelp: "View source code of current document"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["viu[sage]"],
        function (args, special, count, modifiers)
        {
            var usage = "<table>";
            for (let mapping in vimperator.mappings)
            {
                usage += "<tr><td style='color: magenta; padding-right: 20px'> " +
                         vimperator.util.escapeHTML(mapping.names[0]) + "</td><td>" +
                         vimperator.util.escapeHTML(mapping.shortHelp || "") + "</td></tr>";
            }
            usage += "</table>";

            vimperator.echo(usage, vimperator.commandline.FORCE_MULTILINE);
        },
        {
            shortHelp: "Show help for normal mode commands"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["winc[lose]", "wc[lose]"],
        function (args) { window.close(); },
        { shortHelp: "Close window" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["wino[pen]", "wo[pen]", "wine[dit]"],
        function (args)
        {
            if (args)
                vimperator.open(args, vimperator.NEW_WINDOW);
            else
                vimperator.open("about:blank", vimperator.NEW_WINDOW);
        },
        {
            shortHelp: "Open one or more URLs in a new window"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["wqa[ll]", "wq", "xa[ll]"],
        function () { vimperator.quit(true); },
        { shortHelp: "Save the session and quit" }
    ));
    commandManager.addUserCommand(new vimperator.Command(["zo[om]"],
        function (args, special)
        {
            var level;

            if (!args)
            {
                level = 100;
            }
            else if (/^\d+$/.test(args))
            {
                level = parseInt(args, 10);
            }
            else if (/^[+-]\d+$/.test(args))
            {
                if (special)
                    level = vimperator.buffer.fullZoom + parseInt(args, 10);
                else
                    level = vimperator.buffer.textZoom + parseInt(args, 10);

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
            shortHelp: "Set zoom value of current web page"
        }
    ));
    commandManager.addUserCommand(new vimperator.Command(["!", "run"],
        function (args, special)
        {
            // :!! needs to be treated specially as the command parser sets the special flag but removes the ! from args
            if (special)
                args = "!" + (args || "");

            // TODO: better escaping of ! to also substitute \\! correctly
            args = args.replace(/(^|[^\\])!/g, "$1" + lastRunCommand);
            lastRunCommand = args;

            var output = vimperator.io.system(args);
            if (output)
                vimperator.echo(vimperator.util.escapeHTML(output));
        },
        {
            shortHelp: "Run a command"
        }
    ));
    //}}}

    return commandManager;
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
