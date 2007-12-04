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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // returns the longest common substring
        // used for the 'longest' setting for wildmode
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

        dialog: function (filter)
        {
            substrings = [];
            var nodes = [
                ["about",            "About Firefox"],
                ["addbookmark",      "Add bookmarks for the current page"],
                ["addons",           "Manage Add-ons"],
                ["bookmarks",        "List your bookmarks"],
                ["checkupdates",     "Check for updates"],
                ["cleardata",        "Clear private data"],
                ["console",          "JavaScript console"],
                ["customizetoolbar", "Customize the Toolbar"],
                ["dominspector",     "DOM Inspector"],
                ["downloads",        "Manage Downloads"],
                ["history",          "List your history"],
                ["import",           "Import Preferences, Bookmarks, History, etc. from other browsers"],
                ["openfile",         "Open the file selector dialog"],
                ["pageinfo",         "Show information about the current page"],
                ["pagesource",       "View page source"],
                ["places",           "Places Organizer: Manage your bookmarks and history"],
                ["preferences",      "Show Firefox preferences dialog"],
                ["printpreview",     "Preview the page before printing"],
                ["printsetup",       "Setup the page size and orientation before printing"],
                ["print",            "Show print dialog"],
                ["saveframe",        "Save frame to disk"],
                ["savepage",         "Save page to disk"],
                ["searchengines",    "Manage installed search engines"]
            ];

            if (!filter)
                return [0, nodes];

            var mapped = nodes.map(function (node) {
                return [[node[0]], node[1]];
            });

            return [0, buildLongestCommonSubstring(mapped, filter)];
        },

        // filter a list of urls
        //
        // may consist of search engines, filenames, bookmarks and history,
        // depending on the 'complete' option
        // if the 'complete' argument is passed like "h", it temporarily overrides the complete option
        url: function (filter, complete)
        {
            var completions = [];
            substrings = [];

            var start = 0;
            var skip = filter.match(/^(.*,\s+)(.*)/); // start after the last ", "
            if (skip)
            {
                start += skip[1].length;
                filter = skip[2];
            }

            var cpt = complete || vimperator.options["complete"];
            // join all completion arrays together
            for (var i = 0; i < cpt.length; i++)
            {
                if (cpt[i] == "s")
                    completions = completions.concat(this.search(filter)[1]);
                else if (cpt[i] == "f")
                    completions = completions.concat(this.file(filter, false)[1]);
                else if (cpt[i] == "b")
                    completions = completions.concat(vimperator.bookmarks.get(filter));
                else if (cpt[i] == "h")
                    completions = completions.concat(vimperator.history.get(filter));
            }

            return [start, completions];
        },

        search: function (filter)
        {
            var engines = vimperator.bookmarks.getSearchEngines().concat(vimperator.bookmarks.getKeywords());

            if (!filter)
                return [0, engines];

            var mapped = engines.map(function (engine) {
                return [[engine[0]], engine[1]];
            });
            return [0, buildLongestCommonSubstring(mapped, filter)];
        },

        // TODO: support file:// and \ or / path separators on both platforms
        // TODO: sort directories first
        // if "tail" is true, only return names without any directory components
        file: function (filter, tail)
        {
            // this is now also used as part of the url completion, so the
            // substrings shouldn't be cleared for that case
            if (!arguments[1])
                substrings = [];

            var dir = "", compl = "";
            var matches = filter.match(/^(.*[\/\\])?(.*?)$/);
            if (matches)
            {
                dir = matches[1] || ""; // "" is expanded inside readDirectory to the current dir
                compl = matches[2] || "";
            }
            var files = [], mapped = [];

            try
            {
                files = vimperator.io.readDirectory(dir);
                mapped = files.map(function (file) {
                    return [[tail ? file.leafName : (dir + file.leafName)], file.isDirectory() ? "Directory" : "File"];
                });
            }
            catch (e)
            {
                return [];
            }

            if (tail)
                return [dir.length, buildLongestStartingSubstring(mapped, compl)];
            else
                return [0, buildLongestStartingSubstring(mapped, filter)];
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

            // unfiltered, use the first command
            if (!filter)
                return [0, helpArray.map(function ($_) { return [$_[0][0], $_[1]]; })];

            return [0, buildLongestCommonSubstring(helpArray, filter)];
        },

        command: function (filter)
        {
            substrings = [];
            var completions = [];
            if (!filter)
            {
                for (var command in vimperator.commands)
                    completions.push([command.name, command.shortHelp]);
                return [0, completions];
            }

            for (var command in vimperator.commands)
                completions.push([command.longNames, command.shortHelp]);

            return [0, buildLongestStartingSubstring(completions, filter)];
        },

        option: function (filter, unfiltered)
        {
            substrings = [];
            var optionCompletions = [];
            var prefix = filter.match(/^no|inv/) || "";

            if (prefix)
                filter = filter.replace(prefix, "");

            // needed for help-completions, don't return [start, options], just options
            // FIXME: doesn't belong here to be honest (rather v.options.get(filter)) --mst
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
                return [0, options];
            }
            // check if filter ends with =, then complete current value
            else if (filter.length > 0 && filter.lastIndexOf("=") == filter.length - 1)
            {
                filter = filter.substr(0, filter.length - 1);
                for (var option in vimperator.options)
                {
                    if (option.hasName(filter))
                        return [filter.length + 1, [[option.value, ""]]];
                }
                return [0, optionCompletions];
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
                    optionCompletions.push([prefix + option.names[j], option.shortHelp]);
                    break;
                }
            }

            return [0, optionCompletions];
        },

        // FIXME: items shouldn't be [[[a], b]], but [[a, b]] and only mapped if at all for bLCS --mst
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
                    title = getBrowser().getBrowserAtIndex(i).contentDocument.title;
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

            if (!filter)
                return [0, items.map(function ($_) { return [$_[0][0], $_[1]]; })];

            return [0, buildLongestCommonSubstring(items, filter)];
        },

        sidebar: function (filter)
        {
            substrings = [];
            var menu = document.getElementById("viewSidebarMenu");
            var nodes = [];

            for (var i = 0; i < menu.childNodes.length; i++)
                nodes.push([menu.childNodes[i].label, ""]);

            if (!filter)
                return [0, nodes];

            var mapped = nodes.map(function (node) {
                return [[node[0]], node[1]];
            });

            return [0, buildLongestCommonSubstring(mapped, filter)];
        },

        javascript: function (str)
        {
            substrings = [];
            var matches = str.match(/^(.*?)(\s*\.\s*)?(\w*)$/);
            var objects = [];
            var filter = matches[3] || "";
            var start = matches[1].length - 1;
            var offset = matches[1] ? matches[1].length : 0;
            offset += matches[2] ? matches[2].length : 0;

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

            return [offset, buildLongestStartingSubstring(completions, filter)];
        },

        // discard all entries in the 'urls' array, which don't match 'filter
        // urls must be of type [["url", "title"], [...]] or optionally
        //                      [["url", "title", keyword, [tags]], [...]]
        filterURLArray: function (urls, filter, tags)
        {
            var filtered = [];
            // completions which don't match the url but just the description
            // list them add the end of the array
            var additionalCompletions = [];

            if (urls.length == 0)
                return [];

            var hasTags = urls[0].length >= 4;
            // TODO: create a copy of urls?
            if (!filter && (!hasTags || !tags))
                return urls;

            tags = tags || [];

            // TODO: use ignorecase and smartcase settings
            var ignorecase = true;
            if (filter != filter.toLowerCase() || tags.join(",") != tags.join(",").toLowerCase())
                ignorecase = false;

            if (ignorecase)
            {
                filter = filter.toLowerCase();
                tags = tags.map(function (t) { return t.toLowerCase(); });
            }

            // Longest Common Subsequence
            // This shouldn't use buildLongestCommonSubstring for performance
            // reasons, so as not to cycle through the urls twice
            outer:
            for (var i = 0; i < urls.length; i++)
            {
                var url   = urls[i][0] || "";
                var title = urls[i][1] || "";
                var tag   = urls[i][3] || [];

                if (ignorecase)
                {
                    url = url.toLowerCase();
                    title = title.toLowerCase();
                    tag = tag.map(function (t) { return t.toLowerCase(); });
                }

                // filter on tags
                for (var j = 0; j < tags.length; j++)
                {
                    if (!tags[j])
                        continue;

                    if (tag.indexOf(tags[j]) == -1)
                        continue outer;
                }

                if (url.indexOf(filter) == -1)
                {
                    // no direct match of filter in the url, but still accept this item
                    // if _all_ tokens of filter match either the url or the title
                    if (filter.split(/\s+/).every(function (token) {
                        return (url.indexOf(token) > -1 || title.indexOf(token) > -1);
                    }))
                        additionalCompletions.push(urls[i]);

                    continue;
                }

                // TODO: refactor out? And just build if wildmode contains longest?
                if (substrings.length == 0)   // Build the substrings
                {
                    var lastIndex = url.lastIndexOf(filter);
                    var urlLength = url.length;
                    if (lastIndex >= 0 && lastIndex < urlLength) // do not build substrings, if we don't match filter
                    {
                        for (var k = url.indexOf(filter); k != -1 && k <= lastIndex; k = url.indexOf(filter, k + 1))
                        {
                            for (var l = k + filter.length; l <= urlLength; l++)
                                substrings.push(url.substring(k, l));
                        }
                    }
                }
                else
                {
                    substrings = substrings.filter(function ($_) {
                        return url.indexOf($_) >= 0;
                    });
                }

                filtered.push(urls[i]);
            }

            return filtered.concat(additionalCompletions);
        },

        // generic helper function which checks if the given "items" array pass "filter"
        // items must be an array of strings
        match: function (items, filter, caseSensitive)
        {
            if (typeof filter != "string" || !items)
                return false;

            var itemsStr = items.join(" ");
            if (!caseSensitive)
            {
                filter = filter.toLowerCase();
                itemsStr = itemsStr.toLowerCase();
            }

            if (filter.split(/\s+/).every(function (str) { return itemsStr.indexOf(str) > -1; }))
                return true;

            return false;
        },

        // FIXME: rename
        // TODO: get completions for "nested" command lines like ":time :js <tab>" or ":tab :he<tab>"
        exTabCompletion: function (str)
        {
            var [count, cmd, special, args] = vimperator.commands.parseCommand(str);
            var completions = [];
            var start = 0;
            var exLength = 0;

            // if there is no space between the command name and the cursor
            // then get completions of the command name
            var matches = str.match(/^(:*\d*)\w*$/);
            if (matches)
                return [matches[1].length, this.command(cmd)[1]];

            // dynamically get completions as specified with the command's completer function
            var command = vimperator.commands.get(cmd);
            if (command && command.completer)
            {
                matches = str.match(/^:*\d*\w+!?\s+/);
                exLength = matches ? matches[0].length : 0;
                [start, completions] = command.completer.call(this, args);
            }
            return [exLength + start, completions];
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
