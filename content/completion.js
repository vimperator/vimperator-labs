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

liberator.Completion = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    try
    {
        var completionService = Components.classes["@mozilla.org/browser/global-history;2"]
                                          .getService(Components.interfaces.nsIAutoCompleteSearch);
    }
    catch (e) {}

    // the completion substrings, used for showing the longest common match
    var cacheFilter = {};
    var cacheResults = {};
    var substrings = [];
    var historyCache = [];
    var historyResult = null;
    var completionCache = [];

    var historyTimer = new liberator.util.Timer(50, 100, function () {
        let comp = [];
        for (let i in liberator.util.range(0, historyResult.matchCount))
            comp.push([historyResult.getValueAt(i),
                       historyResult.getCommentAt(i),
                       historyResult.getImageAt(i)]);

        //let foo = ["", "IGNORED", "FAILURE", "NOMATCH", "SUCCESS", "NOMATCH_ONGOING", "SUCCESS_ONGOING"];

        historyCache = comp;
        liberator.commandline.setCompletions(completionCache.concat(historyCache));
    });

    function Javascript()
    {
        const OFFSET = 0, CHAR = 1, STATEMENTS = 2, DOTS = 3, FULL_STATEMENTS = 4, FUNCTIONS = 5;
        let stack = [];
        let top = [];  /* The element on the top of the stack. */
        let last = ""; /* The last opening char pushed onto the stack. */
        let lastNonwhite = ""; /* Last non-whitespace character we saw. */
        let lastChar = "";     /* Last character we saw, used for \ escaping quotes. */
        let lastObjs = [];
        let lastKey = null;
        let compl = [];
        let str = "";

        let lastIdx = 0;
        let continuing = false;

        function iter(obj)
        {
            let iterator = (function ()
            {
                for (let k in obj)
                {
                    try
                    {
                        yield [k, obj[k]];
                        continue;
                    }
                    catch (e) {}
                    yield [k, "inaccessable"]
                }
            })();
            try
            {
                if ("__iterator__" in obj)
                {
                    let oldIter = obj.__iterator__;
                    delete obj.__iterator__;
                    iterator = Iterator(obj);
                    obj.__iterator__ = oldIter;
                }
            }
            catch (e) {}
            return iterator;
        }

        /* Search the object for strings starting with @key.
         * If @last is defined, key is a quoted string, it's
         * wrapped in @last after @offset characters are sliced
         * off of it and it's quoted.
         */
        function objectKeys(objects, key, last, offset)
        {
            if (!(objects instanceof Array))
                objects = [objects];

            if (key.indexOf(lastKey) != 0)
                continuing = false;
            if (continuing && objects != lastObjs)
            {
                for (let [k, v] in Iterator(objects))
                {
                    if (lastObjs[k] != v)
                    {
                        continuing = false;
                        break;
                    }
                }
            }

            lastKey = key;
            lastObjs = objects;

            liberator.dump("continuing: " + continuing + "\n");
            liberator.dump("key: " + key + "\nlastKey: " + lastKey + "\n");

            if (!continuing)
            {
                compl = [];
                for (let [,obj] in Iterator(objects))
                {
                    if (typeof obj == "string")
                        obj = eval("with (liberator) {" + obj + "}");
                    if (typeof obj != "object")
                        continue;

                    for (let [k, v] in iter(obj))
                    {
                        let type = typeof v;
                        if (["string", "number", "boolean"].indexOf(type) > -1)
                            type += ": " + String(v).replace("\n", "\\n", "g");
                        if (type == "function")
                            type += ": " + String(v).replace(/{(.|\n)*/, "{ ... }"); /* } vim */

                        compl.push([k, type]);
                    }
                }
                if (last != undefined)
                    compl.forEach(function (a) a[0] = liberator.util.escapeString(a[0].substr(offset), last));
                else
                    compl = compl.filter(function (a) /^[\w$][\w\d$]*$/.test(a[0]));
            }
            if (last != undefined)
                key = last + key.substr(offset)
            return buildLongestStartingSubstring(compl, key);
        }

        function eval(arg)
        {
            try
            {
                // liberator.dump("eval(" + liberator.util.escapeString(arg) + ")");
                return window.eval(arg);
            }
            catch(e) {}
            return null;
        }

        /* Get an element from the stack. If @n is negative,
         * count from the top of the stack, otherwise, the bottom.
         * If @m is provided, return the @mth value of element @o
         * of the stack entey at @n.
         */
        let get = function (n, m, o)
        {
            let a = stack[n >= 0 ? n : stack.length + n];
            if (m == undefined)
                return a;
            return a[o][a[o].length - m - 1];
        }

        function buildStack(start)
        {
            /* Push and pop the stack, maintaining references to 'top' and 'last'. */
            let push = function (arg)
            {
                top = [i, arg, [], [], [], []];
                if (arg)
                    top[STATEMENTS].push(firstNonwhite());
                last = top[CHAR];
                stack.push(top);
            }
            let pop = function (arg)
            {
                if (top[CHAR] != arg)
                    throw new Error("Invalid JS");
                top = get(-2);
                last = top[CHAR];
                let ret = stack.pop();
                return ret;
            }

            /* Find the first non-whitespace character fillowing i. */
            let firstNonwhite = function () {
                let j = i + 1;
                while (str[j] && /\s/.test(str[j]))
                    j++;
                return j;
            }

            let i = start, c = "";     /* Current index and character, respectively. */

            if (start == 0)
            {
                stack = [];
                push("");
            }

            /* Build a parse stack, discarding entries opening characters
             * match closing characters. The last open entry is used to
             * figure out what to complete.
             */
            let length = str.length;
            for (; i < length; lastChar = c, i++)
            {
                c = str[i];
                if (last == '"' || last == "'" || last == "/")
                {
                    if (lastChar == "\\")
                    {
                        c = "";
                        i++;
                    }
                    else if (c == last)
                        pop(c);
                }
                else
                {
                    switch (c)
                    {
                        case "(":
                            /* Function call, or if/while/for/... */
                            if (/\w/.test(lastNonwhite))
                                top[FUNCTIONS].push(i);
                        case '"':
                        case "'":
                        case "/":
                        case "{":
                            push(c);
                            break;
                        case "[":
                            if (/[\])"']/.test(lastNonwhite))
                                top[STATEMENTS].pop();
                            push(c);
                            break;
                        case ")": pop("("); break;
                        case "]": pop("["); break;
                        case "}": pop("{"); /* Fallthrough */
                        case ";":
                        case ",":
                            top[FULL_STATEMENTS].push(i);
                            break;
                        case ".":
                            top[DOTS].push(i);
                            if (/[\])"']/.test(lastNonwhite))
                                top[STATEMENTS].pop();
                            break;
                    }
                    /* Could do better. */
                    if (!/[\w\s.([]/.test(c))
                        top[STATEMENTS].push(i);
                    if (/\S/.test(c))
                        lastNonwhite = c;
                }
            }

            lastIdx = i;
            liberator.dump(liberator.util.objectToString(stack.map(function (a) json.encode(a))));
        }

        this.complete = function (string)
        {
            try
            {
                continuing = string.indexOf(str) == 0;
                str = string;
                buildStack(continuing ? lastIdx : 0);
            }
            catch (e)
            {
                liberator.dump(liberator.util.escapeString(str) + "\n" + e + "\n" + e.stack + "\n");
                return [0, []];
            }

            /* Okay, have parse stack. Figure out what we're completing. */

            /* Find any complete statements that we can eval. */
            let end = get(0, 0, FULL_STATEMENTS) || 0;
            let preEval = str.substring(0, end) + ";";

            /* In a string. */
            if (last == "'" || last == '"')
            {
                /* Stack:
                 *  [-1]: "...
                 *  [-2]: [...
                 *  [-3]: base statement
                 */

                /* Is this an object accessor? */
                if (get(-2)[CHAR] != "[" /* Are inside of []? */
                 || get(-3, 0, STATEMENTS) == get(-2)[OFFSET]) /* Okay. Is it an array literal? */
                    return [0, []]; /* No. Nothing to do. */

                /* 
                 * str = "foo[bar + 'baz"
                 * obj = "foo"
                 * key = "bar + ''"
                 */
                let string = str.substring(top[OFFSET] + 1);
                string = eval(last + string + last);

                let obj = preEval + str.substring(get(-3, 0, STATEMENTS), get(-2)[OFFSET]);
                let key = preEval + str.substring(get(-2)[OFFSET] + 1, top[OFFSET]) + "''";
                key = eval(key);
                return [top[OFFSET], objectKeys(obj, key + string, last, key.length)];
            }

            /* Is this an object reference? */
            if (top[DOTS].length)
            {
                let dot = get(-1, 0, DOTS);
                /*
                 * str = "foo.bar.baz"
                 * obj = "foo.bar"
                 * key = "baz"
                 */
                let key = str.substring(dot + 1);
                let obj = preEval + str.substring(get(-1, 0, STATEMENTS), dot);

                if (!/^(?:\w[\w\d]*)?$/.test(key))
                    return [0, []]; /* Not a word. Forget it. Can this even happen? */
                return [dot + 1, objectKeys(obj, key)];
            }

            /* Okay, assume it's an identifier and try to complete it from the window
             * and liberator objects.
             */
            let offset = get(-1, 0, STATEMENTS) || 0;
            let key = str.substring(offset);

            if (/^(?:\w[\w\d]*)?$/.test(key))
                return [offset, objectKeys([window, liberator], key)];
            return [0, []];
        }
    };
    let javascript = new Javascript();

    function buildSubstrings(str, filter)
    {
        if (filter == "")
            return;
        let length = filter.length;
        let start = 0;
        let idx;
        while ((idx = str.indexOf(filter, start)) > -1)
        {
            for (let end in liberator.util.range(idx + length, str.length + 1))
                substrings.push(str.substring(idx, end));
            start = idx + 1;
        }
    }

    // function uses smartcase
    // list = [ [['com1', 'com2'], 'text'], [['com3', 'com4'], 'text'] ]
    function buildLongestCommonSubstring(list, filter, favicon)
    {
        var filtered = [];

        var ignorecase = false;
        if (filter == filter.toLowerCase())
            ignorecase = true;

        var longest = false;
        if (liberator.options["wildmode"].indexOf("longest") >= 0)
            longest = true;

        for (let [,item] in Iterator(list))
        {
            var complist = item[0] instanceof Array ?  item[0]
                                                    : [item[0]];
            for (let [,compitem] in Iterator(complist))
            {
                let str = !ignorecase ? compitem : String(compitem).toLowerCase();

                if (str.indexOf(filter) == -1)
                    continue;

                filtered.push([compitem, item[1], favicon ? item[2] : null]);

                if (longest)
                {
                    if (substrings.length == 0)
                        buildSubstrings(str, filter);
                    else
                        substrings = substrings.filter(function (s) str.indexOf(s) >= 0);
                }
                break;
            }
        }
        if (liberator.options.get("wildoptions").has("sort"))
            filtered = filtered.sort(function (a, b) liberator.util.ciCompare(a[0], b[0]));;
        return filtered;
    }

    // this function is case sensitive
    function buildLongestStartingSubstring(list, filter, favicon)
    {
        var filtered = [];

        var longest = false;
        if (liberator.options["wildmode"].indexOf("longest") >= 0)
            longest = true;

        for (let [,item] in Iterator(list))
        {
            var complist = item[0] instanceof Array ?  item[0]
                                                    : [item[0]];
            for (let [,compitem] in Iterator(complist))
            {
                if (compitem.indexOf(filter) != 0)
                    continue;

                filtered.push([compitem, item[1], favicon ? item[2] : null]);

                if (longest)
                {
                    if (substrings.length == 0)
                    {
                        var length = compitem.length;
                        for (let k = filter.length; k <= length; k++)
                            substrings.push(compitem.substring(0, k));
                    }
                    else
                    {
                        substrings = substrings.filter(function (s) compitem.indexOf(s) == 0);
                    }
                }
                break;
            }
        }
        if (liberator.options.get("wildoptions").has("sort"))
            filtered = filtered.sort(function (a, b) liberator.util.ciCompare(a[0], b[0]));;
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
            for (let i = 1; i < substrings.length; i++)
            {
                if (substrings[i].length > longest.length)
                    longest = substrings[i];
            }
            return longest;
        },

        // generic filter function, also builds substrings needed
        // for :set wildmode=list:longest, if necessary
        filter: function (array, filter, matchFromBeginning, favicon)
        {
            if (!filter)
                return [[a[0], a[1], favicon ? a[2] : null] for each (a in array)];

            if (matchFromBeginning)
                return buildLongestStartingSubstring(array, filter, favicon);
            else
                return buildLongestCommonSubstring(array, filter, favicon);
        },

        cached: function (key, filter, generate, method)
        {
            let oldFilter = cacheFilter[key];
            cacheFilter[key] = filter;
            let results = cacheResults[key];
            if (!oldFilter || filter.indexOf(oldFilter) != 0)
                results = generate(filter);
            cacheResults[key] = this[method].apply(this, [results, filter].concat(Array.splice(arguments, 4)));
            return cacheResults[key];
        },

        autocommand: function (filter)
        {
            let autoCmds = liberator.config.autocommands;
            return [0, this.filter(autoCmds, filter)];
        },

        // FIXME: items shouldn't be [[[a], b]], but [[a, b]] and only mapped if at all for bLCS --mst
        buffer: function (filter)
        {
            var items = [];
            var num = getBrowser().browsers.length;
            var title, url;

            for (let i = 0; i < num; i++)
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

                if (title.indexOf(filter) == -1 && url.indexOf(filter) == -1 &&
                        (i + 1).toString().indexOf(filter) == -1)
                    continue;

                if (title.indexOf(filter) != -1 || url.indexOf(filter) != -1 ||
                        (i + 1).toString().indexOf(filter) != -1)
                {
                    if (title == "")
                        title = "(Untitled)";
                    items.push([[(i + 1) + ": " + title, (i + 1) + ": " + url], url]);
                }
            }

            if (!filter)
                return [0, items.map(function (i) [i[0][0], i[1]])];

            return [0, buildLongestCommonSubstring(items, filter)];
        },

        command: function (filter)
        {
            var completions = [];

            if (!filter)
            {
                for (let command in liberator.commands)
                    completions.push([command.name, command.description]);
                return [0, completions];
            }

            for (let command in liberator.commands)
                completions.push([command.longNames, command.description]);

            return [0, buildLongestStartingSubstring(completions, filter)];
        },

        // TODO: support file:// and \ or / path separators on both platforms
        // if "tail" is true, only return names without any directory components
        file: function (filter, tail)
        {
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
                files = liberator.io.readDirectory(dir, true);

                if (liberator.options["wildignore"])
                {
                    var wigRegexp = new RegExp("(^" + liberator.options["wildignore"].replace(",", "|", "g") + ")$");

                    files = files.filter(function (f) f.isDirectory() || !wigRegexp.test(f.leafName))
                }

                mapped = files.map(function (file) [tail ? file.leafName : (dir + file.leafName),
                                                    file.isDirectory() ? "Directory" : "File"]);
            }
            catch (e)
            {
                return [0, []];
            }

            if (tail)
                return [dir.length, buildLongestStartingSubstring(mapped, compl, true)];
            else
                return [0, buildLongestStartingSubstring(mapped, filter, true)];
        },

        javascript: function (str)
        {
            return javascript.complete(str);
        },

        macro: function (filter)
        {
            var macros = [item for (item in liberator.events.getMacros())];

            return [0, liberator.completion.filter(macros, filter)];
        },

        search: function (filter)
        {
            let results = this.cached("search", filter,
                function () Array.concat(liberator.bookmarks.getKeywords().map(function (k) [k[0], k[1], k[3]]),
                                         liberator.bookmarks.getSearchEngines()),
                "filter", false, true);
            return [0, results];
        },

        // XXX: Move to bookmarks.js?
        searchEngineSuggest: function (filter, engineAliases)
        {
            if (!filter)
                return [0, []];

            var engineList = (engineAliases || liberator.options["suggestengines"]).split(",");
            var responseType = "application/x-suggestions+json";
            var ss = Components.classes["@mozilla.org/browser/search-service;1"]
                               .getService(Components.interfaces.nsIBrowserSearchService);

            var completions = [];
            engineList.forEach(function (name) {
                var query = filter;
                var queryURI;
                var engine = ss.getEngineByAlias(name);
                var reg = new RegExp("^\s*(" + name + "\\s+)(.*)$");
                var matches = query.match(reg);
                if (matches)
                    query = matches[2];

                if (engine && engine.supportsResponseType(responseType))
                    queryURI = engine.getSubmission(query, responseType).uri.asciiSpec;
                else
                    return [0, []];

                var xhr = new XMLHttpRequest();
                xhr.open("GET", queryURI, false);
                xhr.send(null);

                var json = Components.classes["@mozilla.org/dom/json;1"]
                                     .createInstance(Components.interfaces.nsIJSON);
                var results = json.decode(xhr.responseText)[1];
                if (!results)
                    return [0, []];

                results.forEach(function (item) {
                    // make sure we receive strings, otherwise a man-in-the-middle attack
                    // could return objects which toString() method could be called to
                    // execute untrusted code
                    if (typeof item != "string")
                        return [0, []];

                    completions.push([(matches ? matches[1] : "") + item, engine.name + " suggestion"]);
                });
            });

            return [0, completions];
        },

        stylesheet: function (filter)
        {
            var completions = liberator.buffer.alternateStyleSheets.map(
                function (stylesheet) [stylesheet.title, stylesheet.href || "inline"]
            );

            // unify split style sheets
            completions.forEach(function (stylesheet) {
                for (let i = 0; i < completions.length; i++)
                {
                    if (stylesheet[0] == completions[i][0] && stylesheet[1] != completions[i][1])
                    {
                        stylesheet[1] += ", " + completions[i][1];
                        completions.splice(i, 1);
                    }
                }
            });

            return [0, this.filter(completions, filter)];
        },

        // filter a list of urls
        //
        // may consist of search engines, filenames, bookmarks and history,
        // depending on the 'complete' option
        // if the 'complete' argument is passed like "h", it temporarily overrides the complete option
        url: function (filter, complete)
        {
            var completions = [];
            var start = 0;
            var skip = filter.match("^(.*" + liberator.options["urlseparator"] + ")(.*)"); // start after the last 'urlseparator'
            if (skip)
            {
                start += skip[1].length;
                filter = skip[2];
            }

            var cpt = complete || liberator.options["complete"];
            var suggestEngineAlias = liberator.options["suggestengines"] || "google";
            // join all completion arrays together
            for (let c in liberator.util.arrayIter(cpt))
            {
                if (c == "s")
                    completions.push(this.search(filter)[1]);
                else if (c == "f")
                    completions.push(this.file(filter, false)[1]);
                else if (c == "S")
                    completions.push(this.searchEngineSuggest(filter, suggestEngineAlias)[1]);
                else if (c == "b")
                    completions.push(liberator.bookmarks.get(filter).map(function (a) [a[0], a[1], a[5]]));
                else if (c == "h")
                    completions.push(liberator.history.get(filter));
                else if (c == "l" && completionService) // add completions like Firefox's smart location bar
                {
                    completionService.stopSearch();
                    completionService.startSearch(filter, "", historyResult, {
                        onSearchResult: function (search, result) {
                            historyResult = result;
                            historyTimer.tell();
                            if (result.searchResult <= result.RESULT_SUCCESS)
                                historyTimer.flush();
                        }
                    });
                }
            }

            completionCache = liberator.util.flatten(completions);
            return [start, completionCache.concat(historyCache)];
        },

        userCommand: function (filter)
        {
            var commands = liberator.commands.getUserCommands();
            commands = commands.map(function (command) [command.name, ""]);
            return [0, this.filter(commands, filter)];
        },

        userMapping: function (filter, modes)
        {
            // TODO: add appropriate getters to l.mappings
            var mappings = [];

            for (let map in liberator.mappings.getUserIterator(modes))
                mappings.push([map.names[0], ""]);

            return [0, this.filter(mappings, filter)];
        },

        // discard all entries in the 'urls' array, which don't match 'filter
        // urls must be of type [["url", "title"], [...]] or optionally
        //                      [["url", "title", keyword, [tags]], [...]]
        filterURLArray: function (urls, filter, filterTags)
        {
            var filtered = [];
            // completions which don't match the url but just the description
            // list them at the end of the array
            var additionalCompletions = [];

            if (urls.length == 0)
                return [];

            var hasTags = urls[0].length >= 4;
            // TODO: create a copy of urls?
            if (!filter && (!hasTags || !filterTags))
                return urls;

            filterTags = filterTags || [];

            // TODO: use ignorecase and smartcase settings
            var ignorecase = (filter == filter.toLowerCase() && filterTags.every(function (t) t == t.toLowerCase()));

            if (ignorecase)
            {
                filter = filter.toLowerCase();
                filterTags = filterTags.map(String.toLowerCase);
            }

            // Longest Common Subsequence
            // This shouldn't use buildLongestCommonSubstring for performance
            // reasons, so as not to cycle through the urls twice
            let filterTokens = filter.split(/\s+/);
            for (let [,elem] in Iterator(urls))
            {
                var url   = elem[0] || "";
                var title = elem[1] || "";
                var tags  = elem[3] || [];
                if (ignorecase)
                {
                    url = url.toLowerCase();
                    title = title.toLowerCase();
                    tags = tags.map(String.toLowerCase);
                }

                // filter on tags
                if (filterTags.some(function (tag) tag && tags.indexOf(tag) == -1))
                        continue;

                if (url.indexOf(filter) == -1)
                {
                    // no direct match of filter in the url, but still accept this item
                    // if _all_ tokens of filter match either the url or the title
                    if (filterTokens.every(function (token) url.indexOf(token) > -1 || title.indexOf(token) > -1))
                        additionalCompletions.push(elem);
                    continue;
                }

                // TODO: refactor out? And just build if wildmode contains longest?
                //   Of course --Kris
                if (substrings.length == 0)   // Build the substrings
                    buildSubstrings(url, filter);
                else
                    substrings = substrings.filter(function (s) url.indexOf(s) >= 0);

                filtered.push(elem);
            }

            filtered = filtered.concat(additionalCompletions);
            if (liberator.options.get("wildoptions").has("sort"))
                filtered = filtered.sort(function (a, b) liberator.util.ciCompare(a[0], b[0]));;
            return filtered;
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

            if (filter.split(/\s+/).every(function (str) itemsStr.indexOf(str) > -1))
                return true;

            return false;
        },

        // provides completions for ex commands, including their arguments
        ex: function (str)
        {
            substrings = [];
            var [count, cmd, special, args] = liberator.commands.parseCommand(str);
            var completions = [];
            var start = 0;
            var exLength = 0;

            // if there is no space between the command name and the cursor
            // then get completions of the command name
            var matches = str.match(/^(:*\d*)\w*$/);
            if (matches)
                return [matches[1].length, this.command(cmd)[1]];

            // dynamically get completions as specified with the command's completer function
            var command = liberator.commands.get(cmd);
            if (command && command.completer)
            {
                matches = str.match(/^:*\d*\w+!?\s+/);
                exLength = matches ? matches[0].length : 0;
                [start, completions] = command.completer.call(this, args, special);
            }
            return [exLength + start, completions];
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
