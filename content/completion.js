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

vimperator.Completion = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // the completion substrings, used for showing the longest common match
    var substrings = [];

    // function uses smartcase
    // list = [ [['com1', 'com2'], 'text'], [['com3', 'com4'], 'text'] ]
    function buildLongestCommonSubstring(list, filter)
    {
        var filtered = [];
        var ignorecase = false;
        if (filter == filter.toLowerCase())
            ignorecase = true;

        for (var i = 0; i < list.length; i++)
        {
            for (var j = 0; j < list[i][0].length; j++)
            {
                var item = list[i][0][j];
                if (ignorecase)
                    item = item.toLowerCase();

                if (item.indexOf(filter) == -1)
                    continue;

                if (substrings.length == 0)
                {
                    var lastIndex = item.lastIndexOf(filter);
                    var length = item.length;
                    for (var k = item.indexOf(filter); k != -1 && k <= lastIndex; k = item.indexOf(filter, k + 1))
                    {
                        for (var l = k + filter.length; l <= length; l++)
                            substrings.push(list[i][0][j].substring(k, l));
                    }
                }
                else
                {
                    substrings = substrings.filter(function ($_) {
                        return list[i][0][j].indexOf($_) >= 0;
                    });
                }
                filtered.push([list[i][0][j], list[i][1]]);
                break;
            }
        }
        return filtered;
    }

    // this function is case sensitive and should be documented about input and output ;)
    function buildLongestStartingSubstring(list, filter)
    {
        var filtered = [];
        for (var i = 0; i < list.length; i++)
        {
            for (var j = 0; j < list[i][0].length; j++)
            {
                if (list[i][0][j].indexOf(filter) != 0)
                    continue;

                if (substrings.length == 0)
                {
                    var length = list[i][0][j].length;
                    for (var k = filter.length; k <= length; k++)
                        substrings.push(list[i][0][j].substring(0, k));
                }
                else
                {
                    substrings = substrings.filter(function ($_) {
                        return list[i][0][j].indexOf($_) == 0;
                    });
                }
                filtered.push([list[i][0][j], list[i][1]]);
                break;
            }
        }
        return filtered;
    }

    /* discard all entries in the 'urls' array, which don't match 'filter */
    function filterUrlArray(urls, filter)
    {
        var filtered = [];
        // completions which don't match the url but just the description
        // list them add the end of the array
        var additionalCompletions = [];

        if (!filter) return urls.map(function ($_) {
            return [$_[0], $_[1]];
        });

        var ignorecase = false;
        if (filter == filter.toLowerCase())
            ignorecase = true;

        /*
         * Longest Common Subsequence
         * This shouldn't use buildLongestCommonSubstring
         * for performance reasons, so as not to cycle through the urls twice
         */
        for (var i = 0; i < urls.length; i++)
        {
            var url = urls[i][0] || "";
            var title = urls[i][1] || "";
            if (ignorecase)
            {
                url = url.toLowerCase();
                title = title.toLowerCase();
            }

            if (url.indexOf(filter) == -1)
            {
                if (title.indexOf(filter) != -1)
                    additionalCompletions.push([ urls[i][0], urls[i][1] ]);
                continue;
            }
            if (substrings.length == 0)   // Build the substrings
            {
                var lastIndex = url.lastIndexOf(filter);
                var urlLength = url.length;
                for (var k = url.indexOf(filter); k != -1 && k <= lastIndex; k = url.indexOf(filter, k + 1))
                {
                    for (var l = k + filter.length; l <= urlLength; l++)
                        substrings.push(url.substring(k, l));
                }
            }
            else
            {
                substrings = substrings.filter(function ($_) {
                    return url.indexOf($_) >= 0;
                });
            }
            filtered.push([urls[i][0], urls[i][1]]);
        }

        return filtered.concat(additionalCompletions);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        /*
         * returns the longest common substring
         * used for the 'longest' setting for wildmode
         */
        getLongestSubstring: function ()
        {
            if (substrings.length == 0)
                return "";

            var longest = substrings[0];
            for (var i = 1; i < substrings.length; i++)
            {
                if (substrings[i].length > longest.length)
                    longest = substrings[i];
            }
            return longest;
        },

        /*
         * filter a list of urls
         *
         * may consist of searchengines, filenames, bookmarks and history,
         * depending on the 'complete' option
         * if the 'complete' argument is passed like "h", it temporarily overrides the complete option
         */
        url: function (filter, complete)
        {
            var completions = [];
            substrings = [];

            var cpt = complete || vimperator.options["complete"];
            // join all completion arrays together
            for (var i = 0; i < cpt.length; i++)
            {
                if (cpt[i] == "s")
                    completions = completions.concat(this.search(filter));
                else if (cpt[i] == "b")
                    completions = completions.concat(this.bookmark(filter));
                else if (cpt[i] == "h")
                    completions = completions.concat(this.history(filter));
                else if (cpt[i] == "f")
                    completions = completions.concat(this.file(filter, true));
            }

            return completions;
        },

        search: function (filter)
        {
            var engines = vimperator.bookmarks.getSearchEngines().concat(vimperator.bookmarks.getKeywords());

            if (!filter) return engines.map(function (engine) {
                return [engine[0], engine[1]];
            });
            var mapped = engines.map(function (engine) {
                return [[engine[0]], engine[1]];
            });
            return buildLongestCommonSubstring(mapped, filter);
        },

        history: function (filter)
        {
            var items = vimperator.history.get();
            return filterUrlArray(items, filter);
        },

        bookmark: function (filter)
        {
            var bookmarks = vimperator.bookmarks.get();
            return filterUrlArray(bookmarks, filter);
        },

        // TODO: support file:// and \ or / path separators on both platforms
        file: function (filter)
        {
            // this is now also used as part of the url completion, so the
            // substrings shouldn't be cleared for that case
            if (!arguments[1])
                substrings = [];

            var matches = filter.match(/^(.*[\/\\])(.*?)$/);
            var dir;

            if (!matches || !(dir = matches[1]))
                return [];

            var compl = matches[2] || "";

            var files = [], mapped = [];
            try
            {
                files = vimperator.io.readDirectory(dir);
                mapped = files.map(function (file) {
                    return [[file.path], file.isDirectory() ? "Directory" : "File"];
                });
            }
            catch (e)
            {
                return [];
            }


            return buildLongestStartingSubstring(mapped, filter);
        },

        help: function (filter)
        {
            var helpArray = [[["introduction"], "Introductory text"],
                             [["initialization"], "Initialization and startup"],
                             [["mappings"], "Normal mode commands"],
                             [["commands"], "Ex commands"],
                             [["options"], "Configuration options"]]; // TODO: hardcoded until we have proper 'pages'
            substrings = [];
            for (var command in vimperator.commands)
                helpArray.push([command.longNames.map(function ($_) { return ":" + $_; }), command.shortHelp]);
            options = this.option(filter, true);
            helpArray = helpArray.concat(options.map(function ($_) {
                return [
                        $_[0].map(function ($_) { return "'" + $_ + "'"; }),
                        $_[1]
                    ];
            }));
            for (var map in vimperator.mappings)
                helpArray.push([map.names, map.shortHelp]);

            if (!filter) return helpArray.map(function ($_) {
                return [$_[0][0], $_[1]]; // unfiltered, use the first command
            });

            return buildLongestCommonSubstring(helpArray, filter);
        },

        command: function (filter)
        {
            substrings = [];
            var completions = [];
            if (!filter)
            {
                for (var command in vimperator.commands)
                    completions.push([command.name, command.shortHelp]);
                return completions;
            }

            for (var command in vimperator.commands)
                completions.push([command.longNames, command.shortHelp]);
            return buildLongestStartingSubstring(completions, filter);
        },

        option: function (filter, unfiltered)
        {
            substrings = [];
            var optionsCompletions = [];
            var prefix = filter.match(/^no|inv/) || "";

            if (prefix)
                filter = filter.replace(prefix, "");

            if (unfiltered)
            {
                var options = [];
                for (var option in vimperator.options)
                {
                    if (prefix && option.type != "boolean")
                        continue;
                    options.push([option.names, option.shortHelp]);
                }
                return options;
            }

            if (!filter)
            {
                var options = [];
                for (var option in vimperator.options)
                {
                    if (prefix && option.type != "boolean")
                        continue;
                    options.push([prefix + option.name, option.shortHelp]);
                }
                return options;
            }
            // check if filter ends with =, then complete current value
            else if (filter.length > 0 && filter.lastIndexOf("=") == filter.length - 1)
            {
                filter = filter.substr(0, filter.length - 1);
                for (var option in vimperator.options)
                {
                    if (option.hasName(filter))
                    {
                            optionsCompletions.push([filter + "=" + option.value, ""]);
                            return optionsCompletions;
                    }
                }
                return optionsCompletions;
            }

            // can't use b_l_s_s, since this has special requirements (the prefix)
            var filterLength = filter.length;
            for (var option in vimperator.options)
            {
                if (prefix && option.type != "boolean")
                    continue;

                for (var j = 0; j < option.names.length; j++)
                {
                    if (option.names[j].indexOf(filter) != 0)
                        continue;

                    if (substrings.length == 0)
                    {
                        var length = option.names[j].length;
                        for (var k = filterLength; k <= length; k++)
                            substrings.push(prefix + option.names[j].substring(0, k));
                    }
                    else
                    {
                        substrings = substrings.filter(function ($_) {
                            return option.names[j].indexOf($_) == 0;
                        });
                    }
                    optionsCompletions.push([prefix + option.names[j], option.shortHelp]);
                    break;
                }
            }

            return optionsCompletions;
        },

        buffer: function (filter)
        {
            substrings = [];
            var items = [];
            var num = getBrowser().browsers.length;
            var title, url;

            for (var i = 0; i < num; i++)
            {
                try
                {
                    title = getBrowser().getBrowserAtIndex(i).contentDocument.getElementsByTagName("title")[0].text;
                }
                catch (e)
                {
                    title = "";
                }

                url = getBrowser().getBrowserAtIndex(i).contentDocument.location.href;

                if (title.indexOf(filter) == -1 && url.indexOf(filter) == -1)
                    continue;

                if (title.indexOf(filter) != -1 || url.indexOf(filter) != -1)
                {
                    if (title == "")
                        title = "(Untitled)";
                    items.push([[(i + 1) + ": " + title, (i + 1) + ": " + url], url]);
                }
            }
            if (!filter) return items.map(function ($_) {
                return [$_[0][0], $_[1]];
            });
            return buildLongestCommonSubstring(items, filter);
        },

        sidebar: function (filter)
        {
            substrings = [];
            var menu = document.getElementById("viewSidebarMenu");
            var nodes = [];

            for (var i = 0; i < menu.childNodes.length; i++)
                nodes.push([menu.childNodes[i].label, ""]);

            if (!filter)
                return nodes;

            var mapped = nodes.map(function (node) {
                return [[node[0]], node[1]];
            });

            return buildLongestCommonSubstring(mapped, filter);
        },

        javascript: function (str) // {{{
        {
            substrings = [];
            var matches = str.match(/^(.*?)(\s*\.\s*)?(\w*)$/);
            var objects = [];
            var filter = matches[3] || "";
            var start = matches[1].length - 1;
            if (matches[2])
            {
                var brackets = 0, parentheses = 0;
                outer:
                for (; start >= 0; start--)
                {
                    switch (matches[1][start])
                    {
                        case ";":
                        case "{":
                            break outer;

                        case "]":
                            brackets--;
                            break;
                        case "[":
                            brackets++;
                            break;
                        case ")":
                            parentheses--;
                            break;
                        case "(":
                            parentheses++;
                            break;
                    }
                    if (brackets > 0 || parentheses > 0)
                        break outer;
                }
            }

            if (matches[1].substr(start+1))
            {
                objects.push(matches[1].substr(start+1));
            }
            else
            {
                objects.push("vimperator");
                objects.push("window");
            }

            var completions = [];
            try
            {
                for (var o = 0; o < objects.length; o++)
                {
                    completions = completions.concat(eval(
                        "var comp = [];" +
                        "var type = '';" +
                        "var value = '';" +
                        "var obj = eval('with(vimperator){" + objects[o] + "}');" +
                        "for (var i in obj) {" +
                        "     try { type = typeof(obj[i]); } catch (e) { type = 'unknown type'; };" +
                        "     if (type == 'number' || type == 'string' || type == 'boolean') {" +
                        "          value = obj[i];" +
                        "          comp.push([[i], type + ': ' + value]); }" +
                        "     else {" +
                        "          comp.push([[i], type]); }" +
                        "} comp;"
                    ));
                }
            }
            catch (e)
            {
                completions = [];
            }

            return buildLongestStartingSubstring(completions, filter);
        }, // }}}

        // helper function which checks if the given arguments pass "filter"
        // items must be an array of strings
        // if caseSensitive == true, be sure to pass filter already in lowercased version
        match: function (filter, items, caseSensitive)
        {
            if (typeof filter != "string" || !items)
                return false;

            if (caseSensitive)
            {
                for (var i = 0; i < items.length; i++)
                {
                    if (items[i].toLowerCase().indexOf(filter) > -1)
                        return true;
                }
            }
            else
            {
                for (var i = 0; i < items.length; i++)
                {
                    if (items[i].indexOf(filter) > -1)
                        return true;
                }
            }
            return false;
        },

        exTabCompletion: function (str)
        {
            var [count, cmd, special, args] = vimperator.commands.parseCommand(str);
            var completions = [];
            var start = 0;

            // if there is no space between the command name and the cursor
            // then get completions of the command name
            var matches = str.match(/^(:*\d*)\w*$/);
            if (matches)
            {
                completions = this.command(cmd);
                start = matches[1].length;
            }
            else // dynamically get completions as specified with the command's completer function
            {
                var command = vimperator.commands.get(cmd);
                if (command && command.completer)
                {
                    matches = str.match(/^:*\d*\w+\s+/);
                    start = matches ? matches[0].length : 0;

                    // TODO: maybe we should move these checks to the complete functions
                    if (command.hasName("open") || command.hasName("tabopen") || command.hasName("winopen"))
                    {
                        var skip = args.match(/^(.*,\s+)(.*)/); // start after the last ", "
                        if (skip)
                        {
                            start += skip[1].length;
                            args = skip[2];
                        }
                    }
                    else if (command.hasName("echo") || command.hasName("echoerr") || command.hasName("javascript"))
                    {
                        var skip = args.match(/^(.*?)(\w*)$/); // start at beginning of the last word
                        if (skip)
                            start += skip[1].length;
                    }

                    completions = command.completer.call(this, args);
                }
            }
            return [start, completions];
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
