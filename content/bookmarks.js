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

// also includes methods for dealing with keywords and search engines
vimperator.Bookmarks = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService   = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                             .getService(Components.interfaces.nsINavHistoryService);
    const bookmarksService = Components.classes["@mozilla.org/browser/nav-bookmarks-service;1"]
                             .getService(Components.interfaces.nsINavBookmarksService);
    const taggingService   = Components.classes["@mozilla.org/browser/tagging-service;1"]
                              .getService(Components.interfaces.nsITaggingService);
    const searchService    = Components.classes["@mozilla.org/browser/search-service;1"]
                              .getService(Components.interfaces.nsIBrowserSearchService);
    const ioService        = Components.classes["@mozilla.org/network/io-service;1"]
                              .getService(Components.interfaces.nsIIOService);

    var bookmarks = null;
    var keywords = null;

    if (vimperator.options["preload"])
        setTimeout(function () { load(); }, 100);

    function load()
    {
        // update our bookmark cache
        bookmarks = []; // also clear our bookmark cache
        keywords  = [];

        var folders = [bookmarksService.toolbarFolder, bookmarksService.bookmarksMenuFolder, bookmarksService.unfiledBookmarksFolder];
        var query = historyService.getNewQuery();
        var options = historyService.getNewQueryOptions();
        while (folders.length > 0)
        {
            //comment out the next line for now; the bug hasn't been fixed; final version should include the next line
            //options.setGroupingMode(options.GROUP_BY_FOLDER);
            query.setFolders(folders, 1);
            var result = historyService.executeQuery(query, options);
            //result.sortingMode = options.SORT_BY_DATE_DESCENDING;
            result.sortingMode = options.SORT_BY_VISITCOUNT_DESCENDING;
            var rootNode = result.root;
            rootNode.containerOpen = true;

            folders.shift();
            // iterate over the immediate children of this folder
            for (var i = 0; i < rootNode.childCount; i++)
            {
                var node = rootNode.getChild(i);
                if (node.type == node.RESULT_TYPE_FOLDER)   // folder
                    folders.push(node.itemId);
                else if (node.type == node.RESULT_TYPE_URI) // bookmark
                {
                    var kw = bookmarksService.getKeywordForBookmark(node.itemId);
                    if (kw)
                        keywords.push([kw, node.title, node.uri]);

                    var count = {};
                    var tags = taggingService.getTagsForURI(ioService.newURI(node.uri, null, null), count);
                    bookmarks.push([node.uri, node.title, kw, tags]);
                }
            }

            // close a container after using it!
            rootNode.containerOpen = false;
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.options.add(["defsearch", "ds"],
        "Set the default search engine",
        "string", "google");
    vimperator.options.add(["preload"],
        "Speed up first time history/bookmark completion",
        "boolean", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = vimperator.config.browserModes || [vimperator.modes.NORMAL];
    
    vimperator.mappings.add(modes, ["a"],
        "Open a prompt to bookmark the current URL",
        function ()
        {
            var title = "";
            if (vimperator.buffer.title != vimperator.buffer.URL)
                title = " -title=\"" + vimperator.buffer.title + "\"";
            vimperator.commandline.open(":", "bmark " + vimperator.buffer.URL + title, vimperator.modes.EX);
        });

    vimperator.mappings.add(modes, ["A"],
        "Toggle bookmarked state of current URL",
        function () { vimperator.bookmarks.toggle(vimperator.buffer.URL); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.commands.add(["bma[rk]"],
        "Add a bookmark",
        function (args)
        {
            var res = vimperator.commands.parseArgs(args, this.args);
            if (!res)
                return;

            var url = res.args.length == 0 ? vimperator.buffer.URL : res.args[0];
            var title = vimperator.commands.getOption(res.opts, "-title", res.args.length == 0 ? vimperator.buffer.title : null);
            if (!title)
                title = url;
            var keyword = vimperator.commands.getOption(res.opts, "-keyword", null);
            var tags = vimperator.commands.getOption(res.opts, "-tags", []);

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
            args: [[["-title", "-t"],    vimperator.commands.OPTION_STRING],
                   [["-tags", "-T"],     vimperator.commands.OPTION_LIST],
                   [["-keyword", "-k"],  vimperator.commands.OPTION_STRING, function (arg) { return /\w/.test(arg); }]]
        });

    vimperator.commands.add(["bmarks"],
        "List or open multiple bookmarks",
        function (args, special)
        {
            var res = vimperator.commands.parseArgs(args, this.args);
            if (!res)
                return;

            var tags = vimperator.commands.getOption(res.opts, "-tags", []);
            vimperator.bookmarks.list(res.args.join(" "), tags, special);
        },
        {
            completer: function (filter) { return [0, vimperator.bookmarks.get(filter)]; },
            args: [[["-tags", "-T"], vimperator.commands.OPTION_LIST]]
        });

    vimperator.commands.add(["delbm[arks]"],
        "Delete a bookmark",
        function (args, special)
        {
            var url = args;
            if (!url)
                url = vimperator.buffer.URL;

            var deletedCount = vimperator.bookmarks.remove(url);
            vimperator.echo(deletedCount + " bookmark(s) with url `" + url + "' deleted", vimperator.commandline.FORCE_SINGLELINE);
        },
        {
            completer: function (filter) { return [0, vimperator.bookmarks.get(filter)]; }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        // if "bypassCache" is true, it will force a reload of the bookmarks database
        // on my PC, it takes about 1ms for each bookmark to load, so loading 1000 bookmarks
        // takes about 1 sec
        get: function (filter, tags, bypassCache)
        {
            if (!bookmarks || bypassCache)
                load();

            return vimperator.completion.filterURLArray(bookmarks, filter, tags);
        },

        // if starOnly = true it is saved in the unfiledBookmarksFolder, otherwise in the bookmarksMenuFolder
        add: function (starOnly, title, url, keyword, tags)
        {
            if (!bookmarks)
                load();

            // if no protocol specified, default to http://, isn't there a better way?
            if (!/^[\w-]+:/.test(url))
                url = "http://" + url;

            try
            {
                var uri = ioService.newURI(url, null, null);
                var id = bookmarksService.insertBookmark(
                         starOnly ? bookmarksService.unfiledBookmarksFolder : bookmarksService.bookmarksMenuFolder,
                         uri, -1, title);

                if (!id)
                    return false;

                if (keyword)
                {
                    bookmarksService.setKeywordForBookmark(id, keyword);
                    keywords.unshift([keyword, title, url]);
                }

                if (tags)
                    taggingService.tagURI(uri, tags);
            }
            catch (e)
            {
                vimperator.log(e);
                return false;
            }

            // update the display of our "bookmarked" symbol
            vimperator.statusline.updateUrl();

            //also update bookmark cache
            bookmarks.unshift([url, title, keyword, tags || []]);
            return true;
        },

        toggle: function (url)
        {
            if (!url)
                return;

            var count = this.remove(url);
            if (count > 0)
            {
                vimperator.commandline.echo("Removed bookmark: " + url, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_SINGLELINE);
            }
            else
            {
                var title = vimperator.buffer.title || url;
                var extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                this.add(true, title, url);
                vimperator.commandline.echo("Added bookmark: " + url + extra, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_SINGLELINE);
            }
        },

        isBookmarked: function (url)
        {
            try
            {
                var uri = ioService.newURI(url, null, null);
                var count = {};
                bookmarksService.getBookmarkIdsForURI(uri, count);
            }
            catch (e)
            {
                return false;
            }

            return count.value > 0;
        },

        // returns number of deleted bookmarks
        remove: function (url)
        {
            if (!url)
                return 0;

            var i = 0;
            try
            {
                var uri = ioService.newURI(url, null, null);
                var count = {};
                var bmarks = bookmarksService.getBookmarkIdsForURI(uri, count);

                for (; i < bmarks.length; i++)
                    bookmarksService.removeItem(bmarks[i]);
            }
            catch (e)
            {
                vimperator.log(e);
                return i;
            }


            // also update bookmark cache, if we removed at least one bookmark
            if (count.value > 0)
                load();

            // update the display of our "bookmarked" symbol
            vimperator.statusline.updateUrl();

            return count.value;
        },

        // TODO: add filtering
        // also ensures that each search engine has a Vimperator-friendly alias
        getSearchEngines: function ()
        {
            var searchEngines = [];
            var firefoxEngines = searchService.getVisibleEngines({ });
            for (var i in firefoxEngines)
            {
                var alias = firefoxEngines[i].alias;
                if (!alias || !/^[a-z0-9_-]+$/.test(alias))
                    alias = firefoxEngines[i].name.replace(/^\W*([a-zA-Z_-]+).*/, "$1").toLowerCase();
                if (!alias)
                    alias = "search"; // for search engines which we can't find a suitable alias

                // make sure we can use search engines which would have the same alias (add numbers at the end)
                var newAlias = alias;
                for (var j = 1; j <= 10; j++) // <=10 is intentional
                {
                    if (!searchEngines.some(function (item) { return (item[0] == newAlias); }))
                        break;

                    newAlias = alias + j;
                }
                // only write when it changed, writes are really slow
                if (firefoxEngines[i].alias != newAlias)
                    firefoxEngines[i].alias = newAlias;

                searchEngines.push([firefoxEngines[i].alias, firefoxEngines[i].description]);
            }

            return searchEngines;
        },

        // TODO: add filtering
        // format of returned array:
        // [keyword, helptext, url]
        getKeywords: function ()
        {
            if (!keywords)
                load();

            return keywords;
        },

        // if @param engineName is null, it uses the default search engine
        // @returns the url for the search string
        //          if the search also requires a postData, [url, postData] is returned
        getSearchURL: function (text, engineName)
        {
            var url = null;
            var postData = null;
            if (!engineName)
                engineName = vimperator.options["defsearch"];

            // we need to make sure our custom alias have been set, even if the user
            // did not :open <tab> once before
            this.getSearchEngines();

            // first checks the search engines for a match
            var engine = searchService.getEngineByAlias(engineName);
            if (engine)
            {
                if (text)
                {
                    var submission = engine.getSubmission(text, null);
                    url = submission.uri.spec;
                    postData = submission.postData;
                }
                else
                    url = engine.searchForm;
            }
            else // check for keyword urls
            {
                if (!keywords)
                    load();

                for (var i in keywords)
                {
                    if (keywords[i][0] == engineName)
                    {
                        if (text == null)
                            text = "";
                        url = keywords[i][2].replace(/%s/g, encodeURIComponent(text));
                        break;
                    }
                }
            }

            // if we came here, the engineName is neither a search engine or URL
            if (postData)
                return [url, postData];
            else
                return url; // can be null
        },

        // if openItems is true, open the matching bookmarks items in tabs rather than display
        list: function (filter, tags, openItems)
        {
            var items = this.get(filter, tags, false);
            if (items.length == 0)
            {
                if (filter.length > 0 || tags.length > 0)
                    vimperator.echoerr("E283: No bookmarks matching \"" + filter + "\"");
                else
                    vimperator.echoerr("No bookmarks set");

                return;
            }

            if (openItems)
            {
                // FIXME: use yes/no question
                if (items.length > 50)
                    return vimperator.echoerr("For now, you can only open a hard limit of 50 items at once");

                for (var i = 0; i < items.length; i++)
                    vimperator.open(items[i][0], vimperator.NEW_TAB);

                return;
            }

            var title, url, tags, keyword, extra;
            var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                "<table><tr align=\"left\" class=\"hl-Title\"><th>title</th><th>URL</th></tr>";
            for (var i = 0; i < items.length; i++)
            {
                title = vimperator.util.escapeHTML(items[i][1]);
                if (title.length > 50)
                    title = title.substr(0, 47) + "...";
                url = vimperator.util.escapeHTML(items[i][0]);
                keyword = items[i][2];
                tags = items[i][3].join(", ");

                extra = "";
                if (keyword)
                {
                    extra = "<span style=\"color: gray;\"> (keyword: <span style=\"color: red;\">" + vimperator.util.escapeHTML(keyword) + "</span>";
                    if (tags)
                        extra += " tags: <span style=\"color: blue;\">" + vimperator.util.escapeHTML(tags) + ")</span>";
                    else
                        extra += ")</span>";
                }
                else if (tags)
                {
                    extra = "<span style=\"color: gray;\"> (tags: <span style=\"color: blue;\">" + vimperator.util.escapeHTML(tags) + "</span>)</span>";
                }


                list += "<tr><td>" + title + "</td><td style=\"width: 100%\"><a href=\"#\" class=\"hl-URL\">" + url + "</a>" + extra + "</td></tr>";
            }
            list += "</table>";

            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        }

    };
    //}}}
}; //}}}

vimperator.History = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService   = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                             .getService(Components.interfaces.nsINavHistoryService);

    var history = null;

    if (vimperator.options["preload"])
        setTimeout(function () { load(); }, 100);

    function load()
    {
        history = [];

        // no query parameters will get all history
        // XXX default sorting is... ?
        var options = historyService.getNewQueryOptions();
        var query = historyService.getNewQuery();

        // execute the query
        var result = historyService.executeQuery(query, options);
        var rootNode = result.root;
        rootNode.containerOpen = true;
        // iterate over the immediate children of this folder
        for (var i = 0; i < rootNode.childCount; i++)
        {
            var node = rootNode.getChild(i);
            if (node.type == node.RESULT_TYPE_URI) // just make sure it's a bookmark
            {
                history.push([node.uri, node.title]);
            }
            else
                dump("History child " + node.itemId + ": " + node.title + " - " + node.type + "\n");
        }

        // close a container after using it!
        rootNode.containerOpen = false;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = vimperator.config.browserModes || [vimperator.modes.NORMAL];

    vimperator.mappings.add(modes,
        ["<C-o>"], "Go to an older position in the jump list",
        function (count) { vimperator.history.stepTo(-(count > 1 ? count : 1)); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes,
        ["<C-i>"], "Go to a newer position in the jump list",
        function (count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes,
        ["H", "<A-Left>", "<M-Left>"], "Go back in the browser history",
        function (count) { vimperator.history.stepTo(-(count > 1 ? count : 1)); },
        { flags: vimperator.Mappings.flags.COUNT });

    vimperator.mappings.add(modes,
        ["L", "<A-Right>", "<M-Right>"], "Go forward in the browser history",
        function (count) { vimperator.history.stepTo(count > 1 ? count : 1); },
        { flags: vimperator.Mappings.flags.COUNT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    vimperator.commands.add(["ba[ck]"],
        "Go back in the browser history",
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
        });

    vimperator.commands.add(["fo[rward]", "fw"],
        "Go forward in the browser history",
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
        });

    vimperator.commands.add(["hist[ory]", "hs"],
        "Show recently visited URLs",
        function (args, special) { vimperator.history.list(args, special); },
        { completer: function (filter) { return [0, vimperator.history.get(filter)]; } });
    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get: function (filter)
        {
            if (!history)
                load();

                return vimperator.completion.filterURLArray(history, filter);
        },

        // the history is automatically added to the Places global history
        // so just update our cached history here
        add: function (url, title)
        {
            if (!history)
                load();

            history = history.filter(function (elem) {
                return elem[0] != url;
            });

            history.unshift([url, title]);
            return true;
        },

        // TODO: better names?
        //       and move to vimperator.buffer.?
        stepTo: function (steps)
        {
            var index = getWebNavigation().sessionHistory.index + steps;

            if (index >= 0 && index < getWebNavigation().sessionHistory.count)
            {
                getWebNavigation().gotoIndex(index);
            }
            else
            {
                vimperator.beep();
            }
        },

        goToStart: function ()
        {
            var index = getWebNavigation().sessionHistory.index;

            if (index == 0)
            {
                vimperator.beep();
                return;
            }

            getWebNavigation().gotoIndex(0);
        },

        goToEnd: function ()
        {
            var index = getWebNavigation().sessionHistory.index;
            var max = getWebNavigation().sessionHistory.count - 1;

            if (index == max)
            {
                vimperator.beep();
                return;
            }

            getWebNavigation().gotoIndex(max);
        },

        // if openItems is true, open the matching history items in tabs rather than display
        list: function (filter, openItems)
        {
            var items = this.get(filter);
            if (items.length == 0)
            {
                if (filter.length > 0)
                    vimperator.echoerr("E283: No history matching \"" + filter + "\"");
                else
                    vimperator.echoerr("No history set");

                return;
            }

            if (openItems)
            {
                // FIXME: use yes/no question
                if (items.length > 50)
                    return vimperator.echoerr("For now, you can only open a hard limit of 50 items at once");

                for (var i = 0; i < items.length; i++)
                    vimperator.open(items[i][0], vimperator.NEW_TAB);

                return;
            }
            else
            {

                var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                           "<table><tr align=\"left\" class=\"hl-Title\"><th>title</th><th>URL</th></tr>";
                for (var i = 0; i < items.length; i++)
                {
                    var title = vimperator.util.escapeHTML(items[i][1]);
                    if (title.length > 50)
                        title = title.substr(0, 47) + "...";
                    var url = vimperator.util.escapeHTML(items[i][0]);
                    list += "<tr><td>" + title + "</td><td><a href=\"#\" class=\"hl-URL\">" + url + "</a></td></tr>";
                }
                list += "</table>";
                vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
            }
        }

    };
    //}}}
}; //}}}

vimperator.QuickMarks = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var qmarks = {};
    // TODO: move to a storage module
    var savedMarks = vimperator.options.getPref("extensions.vimperator.quickmarks", "").split("\n");

    // load the saved quickmarks -- TODO: change to sqlite
    for (var i = 0; i < savedMarks.length - 1; i += 2)
    {
        qmarks[savedMarks[i]] = savedMarks[i + 1];
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    var modes = vimperator.config.browserModes || [vimperator.modes.NORMAL];

    vimperator.mappings.add(modes,
        ["go"], "Jump to a QuickMark",
        function (arg) { vimperator.quickmarks.jumpTo(arg, vimperator.CURRENT_TAB); },
        { flags: vimperator.Mappings.flags.ARGUMENT });

    vimperator.mappings.add(modes,
        ["gn"], "Jump to a QuickMark in a new tab",
        function (arg)
        {
            vimperator.quickmarks.jumpTo(arg,
                /\bquickmark\b/.test(vimperator.options["activate"]) ?
                vimperator.NEW_TAB : vimperator.NEW_BACKGROUND_TAB);
        },
        { flags: vimperator.Mappings.flags.ARGUMENT });

    vimperator.mappings.add(modes,
        ["M"], "Add new QuickMark for current URL",
        function (arg)
        {
            if (/[^a-zA-Z0-9]/.test(arg))
            {
                vimperator.beep();
                return;
            }

            vimperator.quickmarks.add(arg, vimperator.buffer.URL);
        },
        { flags: vimperator.Mappings.flags.ARGUMENT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{
    
    vimperator.commands.add(["delqm[arks]"],
        "Delete the specified QuickMarks",
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
        });

    vimperator.commands.add(["qma[rk]"],
        "Mark a URL with a letter for quick access",
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
        });

    vimperator.commands.add(["qmarks"],
        "Show all QuickMarks",
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
        });
    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        add: function (qmark, location)
        {
            qmarks[qmark] = location;
        },

        remove: function (filter)
        {
            var pattern = new RegExp("[" + filter.replace(/\s+/g, "") + "]");

            for (var qmark in qmarks)
            {
                if (pattern.test(qmark))
                    delete qmarks[qmark];
            }
        },

        removeAll: function ()
        {
            qmarks = {};
        },

        jumpTo: function (qmark, where)
        {
            var url = qmarks[qmark];

            if (url)
                vimperator.open(url, where);
            else
                vimperator.echoerr("E20: QuickMark not set");
        },

        list: function (filter)
        {
            var marks = [];

            // TODO: should we sort these in a-zA-Z0-9 order?
            for (var mark in qmarks)
                marks.push([mark, qmarks[mark]]);
            marks.sort();

            if (marks.length == 0)
            {
                vimperator.echoerr("No QuickMarks set");
                return;
            }

            if (filter.length > 0)
            {
                marks = marks.filter(function (mark) {
                        if (filter.indexOf(mark[0]) > -1)
                            return mark;
                });
                if (marks.length == 0)
                {
                    vimperator.echoerr("E283: No QuickMarks matching \"" + filter + "\"");
                    return;
                }
            }

            var list = ":" + vimperator.util.escapeHTML(vimperator.commandline.getCommand()) + "<br/>" +
                       "<table><tr align=\"left\" class=\"hl-Title\"><th>QuickMark</th><th>URL</th></tr>";
            for (var i = 0; i < marks.length; i++)
            {
                list += "<tr><td>    " + marks[i][0] +
                        "</td><td style=\"color: green;\">" + vimperator.util.escapeHTML(marks[i][1]) + "</td></tr>";
            }
            list += "</table>";

            vimperator.commandline.echo(list, vimperator.commandline.HL_NORMAL, vimperator.commandline.FORCE_MULTILINE);
        },

        destroy: function ()
        {
            // save the quickmarks
            var savedQuickMarks = "";

            for (var i in qmarks)
            {
                savedQuickMarks += i + "\n";
                savedQuickMarks += qmarks[i] + "\n";
            }

            vimperator.options.setPref("extensions.vimperator.quickmarks", savedQuickMarks);
        }

    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
