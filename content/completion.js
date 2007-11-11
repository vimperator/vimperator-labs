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

vimperator.Completion = function () // {{{
{
    // The completion substrings, used for showing the longest common match
    var g_substrings = [];

    // function uses smartcase
    // list = [ [['com1', 'com2'], 'text'], [['com3', 'com4'], 'text'] ]
    function build_longest_common_substring(list, filter) //{{{
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

                if (g_substrings.length == 0)
                {
                    var last_index = item.lastIndexOf(filter);
                    var length = item.length;
                    for (var k = item.indexOf(filter); k != -1 && k <= last_index; k = item.indexOf(filter, k + 1))
                    {
                        for (var l = k + filter.length; l <= length; l++)
                            g_substrings.push(list[i][0][j].substring(k, l));
                    }
                }
                else
                {
                    g_substrings = g_substrings.filter(function ($_) {
                        return list[i][0][j].indexOf($_) >= 0;
                    });
                }
                filtered.push([list[i][0][j], list[i][1]]);
                break;
            }
        }
        return filtered;
    } //}}}

    /* this function is case sensitive and should be documented about input and output ;) */
    function build_longest_starting_substring(list, filter) //{{{
    {
        var filtered = [];
        for (var i = 0; i < list.length; i++)
        {
            for (var j = 0; j < list[i][0].length; j++)
            {
                if (list[i][0][j].indexOf(filter) != 0)
                    continue;

                if (g_substrings.length == 0)
                {
                    var length = list[i][0][j].length;
                    for (var k = filter.length; k <= length; k++)
                        g_substrings.push(list[i][0][j].substring(0, k));
                }
                else
                {
                    g_substrings = g_substrings.filter(function ($_) {
                        return list[i][0][j].indexOf($_) == 0;
                    });
                }
                filtered.push([list[i][0][j], list[i][1]]);
                break;
            }
        }
        return filtered;
    } //}}}

    return {
        /*
         * returns the longest common substring
         * used for the 'longest' setting for wildmode
         */
        get_longest_substring: function () //{{{
        {
            if (g_substrings.length == 0)
                return "";

            var longest = g_substrings[0];
            for (var i = 1; i < g_substrings.length; i++)
            {
                if (g_substrings[i].length > longest.length)
                    longest = g_substrings[i];
            }
            return longest;
        }, //}}}

        /*
         * filter a list of urls
         *
         * may consist of searchengines, filenames, bookmarks and history,
         * depending on the 'complete' option
         * if the 'complete' argument is passed like "h", it temporarily overrides the complete option
         */
        get_url_completions: function (filter, complete) //{{{
        {
            var completions = [];
            g_substrings = [];

            var cpt = complete || vimperator.options["complete"];
            // join all completion arrays together
            for (var i = 0; i < cpt.length; i++)
            {
                if (cpt[i] == "s")
                    completions = completions.concat(this.get_search_completions(filter));
                else if (cpt[i] == "b")
                    completions = completions.concat(vimperator.bookmarks.get(filter));
                else if (cpt[i] == "h")
                    completions = completions.concat(vimperator.history.get(filter));
                else if (cpt[i] == "f")
                    completions = completions.concat(this.get_file_completions(filter, true));
            }

            return completions;
        }, //}}}

        get_search_completions: function (filter) //{{{
        {
            var engines = vimperator.bookmarks.getSearchEngines().concat(vimperator.bookmarks.getKeywords());

            if (!filter) return engines.map(function (engine) {
                return [engine[0], engine[1]];
            });
            var mapped = engines.map(function (engine) {
                return [[engine[0]], engine[1]];
            });
            return build_longest_common_substring(mapped, filter);
        }, //}}}

        // TODO: support file:// and \ or / path separators on both platforms
        get_file_completions: function (filter)
        {
            // this is now also used as part of the url completion, so the
            // substrings shouldn't be cleared for that case
            if (!arguments[1])
                g_substrings = [];

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


            return build_longest_starting_substring(mapped, filter);
        },

        get_help_completions: function (filter) //{{{
        {
            var help_array = [[["introduction"], "Introductory text"],
                              [["initialization"], "Initialization and startup"],
                              [["mappings"], "Normal mode commands"],
                              [["commands"], "Ex commands"],
                              [["options"], "Configuration options"]]; // TODO: hardcoded until we have proper 'pages'
            g_substrings = [];
            for (var command in vimperator.commands)
                help_array.push([command.long_names.map(function ($_) { return ":" + $_; }), command.short_help]);
            options = this.get_options_completions(filter, true);
            help_array = help_array.concat(options.map(function ($_) {
                return [
                        $_[0].map(function ($_) { return "'" + $_ + "'"; }),
                        $_[1]
                    ];
            }));
            for (var map in vimperator.mappings)
                help_array.push([map.names, map.short_help]);

            if (!filter) return help_array.map(function ($_) {
                return [$_[0][0], $_[1]]; // unfiltered, use the first command
            });

            return build_longest_common_substring(help_array, filter);
        }, //}}}

        get_command_completions: function (filter) //{{{
        {
            g_substrings = [];
            var completions = [];
            if (!filter)
            {
                for (var command in vimperator.commands)
                    completions.push([command.name, command.short_help]);
                return completions;
            }

            for (var command in vimperator.commands)
                completions.push([command.long_names, command.short_help]);
            return build_longest_starting_substring(completions, filter);
        }, //}}}

        get_options_completions: function (filter, unfiltered) //{{{
        {
            g_substrings = [];
            var options_completions = [];
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
                    options.push([option.names, option.short_help]);
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
                    options.push([prefix + option.name, option.short_help]);
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
                            options_completions.push([filter + "=" + option.value, ""]);
                            return options_completions;
                    }
                }
                return options_completions;
            }

            // can't use b_l_s_s, since this has special requirements (the prefix)
            var filter_length = filter.length;
            for (var option in vimperator.options)
            {
                if (prefix && option.type != "boolean")
                    continue;

                for (var j = 0; j < option.names.length; j++)
                {
                    if (option.names[j].indexOf(filter) != 0)
                        continue;

                    if (g_substrings.length == 0)
                    {
                        var length = option.names[j].length;
                        for (var k = filter_length; k <= length; k++)
                            g_substrings.push(prefix + option.names[j].substring(0, k));
                    }
                    else
                    {
                        g_substrings = g_substrings.filter(function ($_) {
                            return option.names[j].indexOf($_) == 0;
                        });
                    }
                    options_completions.push([prefix + option.names[j], option.short_help]);
                    break;
                }
            }

            return options_completions;
        }, //}}}

        get_buffer_completions: function (filter) //{{{
        {
            g_substrings = [];
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
            if (!filter) return items.map(function ($_) {
                return [$_[0][0], $_[1]];
            });
            return build_longest_common_substring(items, filter);
        }, //}}}

        get_sidebar_completions: function (filter) //{{{
        {
            g_substrings = [];
            var menu = document.getElementById("viewSidebarMenu");
            var nodes = [];

            for (var i = 0; i < menu.childNodes.length; i++)
                nodes.push([menu.childNodes[i].label, ""]);

            if (!filter)
                return nodes;

            var mapped = nodes.map(function (node) {
                return [[node[0]], node[1]];
            });

            return build_longest_common_substring(mapped, filter);
        }, //}}}

        javascript: function (str) // {{{
        {
            g_substrings = [];
            var matches = str.match(/^(.*?)(\s*\.\s*)?(\w*)$/);
            var object = "window";
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
            object = matches[1].substr(start+1) || "window";

            var completions = [];
            try
            {
                completions = eval(
                    "var comp = [];" +
                    "var type = '';" +
                    "var value = '';" +
                    "var obj = eval(" + object + ");" +
                    "for (var i in obj) {" +
                    "     try { type = typeof(obj[i]); } catch (e) { type = 'unknown type'; };" +
                    "     if (type == 'number' || type == 'string' || type == 'boolean') {" +
                    "          value = obj[i];" +
                    "          comp.push([[i], type + ': ' + value]); }" +
                    // The problem with that is that you complete vimperator.
                    // but can't press <Tab> to complete sub items
                    // so it's better to complete vimperator and the user can do
                    // .<tab> to get the sub items
                    //"     else if (type == 'function') {" +
                    //"          comp.push([[i+'('], type]); }" +
                    //"     else if (type == 'object') {" +
                    //"          comp.push([[i+'.'], type]); }" +
                    "     else {" +
                    "          comp.push([[i], type]); }" +
                    "} comp;");
            }
            catch (e)
            {
                completions = [];
            }

            return build_longest_starting_substring(completions, filter);
        }, // }}}

        // discard all entries in the 'urls' array, which don't match 'filter
        // urls must be of type [["url", "title"], [...]] or optionally
        //                      [["url", "title", keyword, [tags]], [...]]
        filterURLArray: function (urls, filter, tags) //{{{
        {
            var filtered = [];
            // completions which don't match the url but just the description
            // list them add the end of the array
            var additional_completions = [];

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

            /*
             * Longest Common Subsequence
             * This shouldn't use build_longest_common_substring
             * for performance reasons, so as not to cycle through the urls twice
             */
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
                        additional_completions.push(urls[i]);

                    continue;
                }

                // TODO: refactor out? And just build if wildmode contains longest?
                if (g_substrings.length == 0)   // Build the substrings
                {
                    var last_index = url.lastIndexOf(filter);
                    var url_length = url.length;
                    if (last_index >= 0 && last_index < url_length) // do not build substrings, if we don't match filter
                    {
                        for (var k = url.indexOf(filter); k != -1 && k <= last_index; k = url.indexOf(filter, k + 1))
                        {
                            for (var l = k + filter.length; l <= url_length; l++)
                                g_substrings.push(url.substring(k, l));
                        }
                    }
                }
                else
                {
                    g_substrings = g_substrings.filter(function ($_) {
                        return url.indexOf($_) >= 0;
                    });
                }

                filtered.push(urls[i]);
            }

            return filtered.concat(additional_completions);
        }, //}}}

        // generic helper function which checks if the given "items" array pass "filter"
        // items must be an array of strings
        match: function (items, filter, case_sensitive)
        {
            if (typeof(filter) != "string" || !items)
                return false;

            var items_str = items.join(" ");
            if (!case_sensitive)
            {
                filter = filter.toLowerCase();
                items_str = items_str.toLowerCase();
            }

            if (filter.split(/\s+/).every(function (str) { return items_str.indexOf(str) > -1; }))
                return true;

            return false;
        },

        exTabCompletion: function (str) //{{{
        {
            var [count, cmd, special, args] = vimperator.commands.parseCommand(str);
            var completions = [];
            var start = 0;

            // if there is no space between the command name and the cursor
            // then get completions of the command name
            var matches = str.match(/^(:*\d*)\w*$/);
            if (matches)
            {
                completions = this.get_command_completions(cmd);
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
        } //}}}

    };
}; // }}}

// vim: set fdm=marker sw=4 ts=4 et:
