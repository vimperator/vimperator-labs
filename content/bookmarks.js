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
liberator.Bookmarks = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService   = PlacesUtils.history;
    const bookmarksService = PlacesUtils.bookmarks;
    const taggingService   = PlacesUtils.tagging;
    const searchService    = Components.classes["@mozilla.org/browser/search-service;1"]
                                       .getService(Components.interfaces.nsIBrowserSearchService);
    const ioService        = Components.classes["@mozilla.org/network/io-service;1"]
                                       .getService(Components.interfaces.nsIIOService);

    function Cache(name, store, serial)
    {
        const properties = { uri: 0, title: 1, keyword: 2, tags: 3, id: 4 };
        const rootFolders = [bookmarksService.toolbarFolder, bookmarksService.bookmarksMenuFolder, bookmarksService.unfiledBookmarksFolder];

        var bookmarks = [];
        var self = this;

        this.__defineGetter__("name",  function () key);
        this.__defineGetter__("store", function () store);
        this.__defineGetter__("bookmarks", function () { this.load(); return bookmarks; });

        this.__defineGetter__("keywords",
            function () [[k[2], k[1], k[0]] for each (k in self.bookmarks) if (k[2])]);

        this.__iterator__ = (val for each (val in self.bookmarks));

        function loadBookmark(node)
        {
            var keyword = bookmarksService.getKeywordForBookmark(node.itemId);
            var tags = taggingService.getTagsForURI(ioService.newURI(node.uri, null, null), {});
            bookmarks.push([node.uri, node.title, keyword, tags, node.itemId]);
        }

        function readBookmark(id)
        {
            return {
                itemId:  id,
                uri:     bookmarksService.getBookmarkURI(id).spec,
                title:   bookmarksService.getItemTitle(id),
            };
        }

        function deleteBookmark(id)
        {
            var length = bookmarks.length;
            bookmarks = bookmarks.filter(function (item) item[properties.id] != id);
            return bookmarks.length < length;
        }

        function findRoot(id)
        {
            do
            {
                var root = id;
                id = bookmarksService.getFolderIdForItem(id);
            } while (id != bookmarksService.placesRoot && id != root);
            return root;
        }

        this.load = function load()
        {
            // liberator.dump("cache.load()\n");
            // update our bookmark cache
            bookmarks = [];
            this.__defineGetter__("bookmarks", function () bookmarks);

            var folders = rootFolders.concat([]);
            var query = historyService.getNewQuery();
            var options = historyService.getNewQueryOptions();
            while (folders.length > 0)
            {
                //comment out the next line for now; the bug hasn't been fixed; final version should include the next line
                //options.setGroupingMode(options.GROUP_BY_FOLDER);
                query.setFolders(folders, 1);
                folders.shift();
                var result = historyService.executeQuery(query, options);
                result.sortingMode = options.SORT_BY_VISITCOUNT_DESCENDING; /* This is silly. Results are still sorted by folder first. --Kris */
                var rootNode = result.root;
                rootNode.containerOpen = true;

                // iterate over the immediate children of this folder
                for (let i = 0; i < rootNode.childCount; i++)
                {
                    var node = rootNode.getChild(i);
                    if (node.type == node.RESULT_TYPE_FOLDER)   // folder
                        folders.push(node.itemId);
                    else if (node.type == node.RESULT_TYPE_URI) // bookmark
                        loadBookmark(node);
                }

                // close a container after using it!
                rootNode.containerOpen = false;
            }
        };

        var observer = {
            onBeginUpdateBatch: function () {},
            onEndUpdateBatch:   function () {},
            onItemVisited:      function () {},
            onItemMoved:        function () {},
            onItemAdded: function (itemId, folder, index)
            {
                // liberator.dump("onItemAdded(" + itemId + ", " + folder + ", " + index + ")\n");
                if (bookmarksService.getItemType(itemId) == bookmarksService.TYPE_BOOKMARK)
                {
                    if (rootFolders.indexOf(findRoot(itemId)) >= 0)
                    {
                        loadBookmark(readBookmark(itemId));
                        liberator.storage.fireEvent(name, "add", itemId);
                    }
                }
            },
            onItemRemoved: function (itemId, folder, index)
            {
                // liberator.dump("onItemRemoved(" + itemId + ", " + folder + ", " + index + ")\n");
                if (deleteBookmark(itemId))
                    liberator.storage.fireEvent(name, "remove", itemId);
            },
            onItemChanged: function (itemId, property, isAnnotation, value)
            {
                if (isAnnotation)
                    return;
                // liberator.dump("onItemChanged(" + itemId + ", " + property + ", " + value + ")\n");
                var bookmark = bookmarks.filter(function (item) item[properties.id] == itemId)[0];
                if (bookmark)
                {
                    if (property == "tags")
                        value = taggingService.getTagsForURI(ioService.newURI(bookmark[properties.uri], null, null), {});
                    if (property in properties)
                        bookmark[properties[property]] = value;
                    liberator.storage.fireEvent(name, "change", itemId);
                }
            },
            QueryInterface: function (iid) {
                if (iid.equals(Components.interfaces.nsINavBookmarkObserver) || iid.equals(Components.interfaces.nsISupports))
                    return this;
                throw Components.results.NS_ERROR_NO_INTERFACE;
            }
        };

        bookmarksService.addObserver(observer, false);
    }

    var cache = liberator.storage.newObject("bookmark-cache", Cache, false);
    liberator.storage.addObserver("bookmark-cache", function (key, event, arg)
    {
        if (event == "add")
            liberator.autocommands.trigger("BookmarkAdd", "");
        liberator.statusline.updateUrl();
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.options.add(["defsearch", "ds"],
        "Set the default search engine",
        "string", "google",
        {
            completer: function (filter)
            {
                return liberator.completion.url("", "s")[1];
            },
            validator: function (value)
            {
                return liberator.completion.url("", "s")[1].some(function (s) s[0] == value);
            }
        });

    liberator.options.add(["preload"],
        "Speed up first time history/bookmark completion",
        "boolean", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = liberator.config.browserModes || [liberator.modes.NORMAL];

    liberator.mappings.add(modes, ["a"],
        "Open a prompt to bookmark the current URL",
        function ()
        {
            var title = "";
            if (liberator.buffer.title != liberator.buffer.URL)
                title = " -title=\"" + liberator.buffer.title + "\"";
            liberator.commandline.open(":", "bmark " + liberator.buffer.URL + title, liberator.modes.EX);
        });

    liberator.mappings.add(modes, ["A"],
        "Toggle bookmarked state of current URL",
        function () { liberator.bookmarks.toggle(liberator.buffer.URL); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["ju[mps]"],
        "Show jumplist",
        function ()
        {
            var sh = getWebNavigation().sessionHistory;
            var list = ":" + (liberator.util.escapeHTML(liberator.commandline.getCommand()) || "jumps") + "<br/>" + "<table>";
            list += "<tr class=\"hl-Title\" align=\"left\"><th colspan=\"2\">jump</th><th>title</th><th>URI</th></tr>";
            var num = -sh.index;

            for (let i = 0; i < sh.count; i++)
            {
                var entry = sh.getEntryAtIndex(i, false);
                var uri = entry.URI.spec;
                var title = entry.title;
                var indicator = i == sh.index? "<span style=\"color: blue;\">&gt;</span>": " ";
                list += "<tr><td>" + indicator + "<td>" + Math.abs(num) + "</td><td style=\"width: 250px; max-width: 500px; overflow: hidden;\">" + title +
                        "</td><td><a href=\"#\" class=\"hl-URL jump-list\">" + uri + "</a></td></tr>";
                num++;
            }

            list += "</table>";

            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    liberator.commands.add(["bma[rk]"],
        "Add a bookmark",
        function (args)
        {
            var url = args.arguments.length == 0 ? liberator.buffer.URL : args.arguments[0];
            var title = args["-title"] || (args.arguments.length == 0 ? liberator.buffer.title : null);
            if (!title)
                title = url;
            var keyword = args["-keyword"] || null;
            var tags =    args["-tags"] || [];

            if (liberator.bookmarks.add(false, title, url, keyword, tags))
            {
                var extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                liberator.echo("Added bookmark: " + url + extra, liberator.commandline.FORCE_SINGLELINE);
            }
            else
                liberator.echoerr("Exxx: Could not add bookmark `" + title + "'", liberator.commandline.FORCE_SINGLELINE);
        },
        {
            options: [[["-title", "-t"],    liberator.commands.OPTION_STRING],
                      [["-tags", "-T"],     liberator.commands.OPTION_LIST],
                      [["-keyword", "-k"],  liberator.commands.OPTION_STRING, function (arg) { return /\w/.test(arg); }]],
            argCount: "?"
        });

    liberator.commands.add(["bmarks"],
        "List or open multiple bookmarks",
        function (args, special)
        {
            liberator.bookmarks.list(args.arguments.join(" "), args["-tags"] || [], special);
        },
        {
            completer: function (filter) { return [0, liberator.bookmarks.get(filter)]; },
            options: [[["-tags", "-T"], liberator.commands.OPTION_LIST]]
        });

    liberator.commands.add(["delbm[arks]"],
        "Delete a bookmark",
        function (args, special)
        {
            var url = args;
            if (!url)
                url = liberator.buffer.URL;

            var deletedCount = liberator.bookmarks.remove(url);
            liberator.echo(deletedCount + " bookmark(s) with url `" + url + "' deleted", liberator.commandline.FORCE_SINGLELINE);
        },
        {
            completer: function (filter) { return [0, liberator.bookmarks.get(filter)]; }
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
            if(bypassCache) // Is this really necessary anymore?
                cache.load();
            return liberator.completion.filterURLArray(cache.bookmarks, filter, tags);
        },

        // if starOnly = true it is saved in the unfiledBookmarksFolder, otherwise in the bookmarksMenuFolder
        add: function (starOnly, title, url, keyword, tags)
        {
            try
            {
                var uri = PlacesUIUtils.createFixedURI(url);
                var id = bookmarksService.insertBookmark(
                         bookmarksService[starOnly ? "unfiledBookmarksFolder" : "bookmarksMenuFolder"],
                         uri, -1, title);
                if (!id)
                    return false;

                if (keyword)
                    bookmarksService.setKeywordForBookmark(id, keyword);
                if (tags)
                    taggingService.tagURI(uri, tags);
            }
            catch (e)
            {
                liberator.log(e, 0);
                return false;
            }

            return true;
        },

        toggle: function (url)
        {
            if (!url)
                return;

            var count = this.remove(url);
            if (count > 0)
            {
                liberator.commandline.echo("Removed bookmark: " + url, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_SINGLELINE);
            }
            else
            {
                var title = liberator.buffer.title || url;
                var extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                this.add(true, title, url);
                liberator.commandline.echo("Added bookmark: " + url + extra, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_SINGLELINE);
            }
        },

        isBookmarked: function (url)
        {
            try
            {
                var uri = ioService.newURI(url, null, null);
                return (bookmarksService.getBookmarkedURIFor(uri) != null);
            }
            catch (e)
            {
                return false;
            }
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
                liberator.log(e, 0);
                return i;
            }

            // update the display of our "bookmarked" symbol
            liberator.statusline.updateUrl();

            return count.value;
        },

        // TODO: add filtering
        // also ensures that each search engine has a Vimperator-friendly alias
        getSearchEngines: function ()
        {
            var searchEngines = [];
            var firefoxEngines = searchService.getVisibleEngines({});
            for (let i in firefoxEngines)
            {
                var alias = firefoxEngines[i].alias;
                if (!alias || !/^[a-z0-9_-]+$/.test(alias))
                    alias = firefoxEngines[i].name.replace(/^\W*([a-zA-Z_-]+).*/, "$1").toLowerCase();
                if (!alias)
                    alias = "search"; // for search engines which we can't find a suitable alias

                // make sure we can use search engines which would have the same alias (add numbers at the end)
                var newAlias = alias;
                for (let j = 1; j <= 10; j++) // <=10 is intentional
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
            return cache.keywords;
        },

        // full search string including engine name as first word in @param text
        // if @param useDefSearch is true, it uses the default search engine
        // @returns the url for the search string
        //          if the search also requires a postData, [url, postData] is returned
        getSearchURL: function (text, useDefsearch)
        {
            var url = null;
            var aPostDataRef = {};
            var searchString = (useDefsearch? liberator.options["defsearch"] + " " : "") + text;

            // we need to make sure our custom alias have been set, even if the user
            // did not :open <tab> once before
            this.getSearchEngines();

            url = getShortcutOrURI(searchString, aPostDataRef);
            if (url == searchString)
                url = null;

            if (aPostDataRef && aPostDataRef.value)
                return [url, aPostDataRef.value];
            else
                return url; // can be null
        },

        // if openItems is true, open the matching bookmarks items in tabs rather than display
        list: function (filter, tags, openItems)
        {
            var items = this.get(filter, tags, false);
            if (items.length == 0)
            {
                if (filter.length > 0 && tags.length > 0)
                    liberator.echoerr("E283: No bookmarks matching tags: \"" + tags + "\" and string: \"" + filter + "\"");
                else if (filter.length > 0)
                    liberator.echoerr("E283: No bookmarks matching string: \"" + filter + "\"");
                else if (tags.length > 0)
                    liberator.echoerr("E283: No bookmarks matching tags: \"" + tags + "\"");
                else
                    liberator.echoerr("No bookmarks set");

                return;
            }

            if (openItems)
                return liberator.open([i[0] for each (i in items)], liberator.NEW_TAB);

            var title, url, tags, keyword, extra;
            var list = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                "<table><tr class=\"hl-Title\" align=\"left\"><th>title</th><th>URL</th></tr>";
            for (let i = 0; i < items.length; i++)
            {
                title = liberator.util.escapeHTML(liberator.util.clip(items[i][1], 50));
                url = liberator.util.escapeHTML(items[i][0]);
                keyword = items[i][2];
                tags = items[i][3].join(", ");

                extra = "";
                if (keyword)
                {
                    extra = "<span style=\"color: gray;\"> (keyword: <span style=\"color: red;\">" + liberator.util.escapeHTML(keyword) + "</span>";
                    if (tags)
                        extra += " tags: <span style=\"color: blue;\">" + liberator.util.escapeHTML(tags) + ")</span>";
                    else
                        extra += ")</span>";
                }
                else if (tags)
                {
                    extra = "<span style=\"color: gray;\"> (tags: <span style=\"color: blue;\">" + liberator.util.escapeHTML(tags) + "</span>)</span>";
                }

                list += "<tr><td>" + title + "</td><td style=\"width: 100%\"><a href=\"#\" class=\"hl-URL\">" + url + "</a>" + extra + "</td></tr>";
            }
            list += "</table>";

            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        },

        destroy: function ()
        {
            bookmarksService.removeObserver(observer, false);
        }
    };
    //}}}
}; //}}}

liberator.History = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                                     .getService(Components.interfaces.nsINavHistoryService);

    var history = [];
    var cachedHistory = []; // add pages here after loading the initial Places history

    if (liberator.options["preload"])
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
        for (let i = 0; i < rootNode.childCount; i++)
        {
            var node = rootNode.getChild(i);
            //liberator.dump("History child " + node.itemId + ": " + node.title + " - " + node.type + "\n");
            if (node.type == node.RESULT_TYPE_URI) // just make sure it's a bookmark
                history.push([node.uri, node.title || "[No title]"]);
        }

        // close a container after using it!
        rootNode.containerOpen = false;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = liberator.config.browserModes || [liberator.modes.NORMAL];

    liberator.mappings.add(modes,
        ["<C-o>"], "Go to an older position in the jump list",
        function (count) { liberator.history.stepTo(-(count > 1 ? count : 1)); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes,
        ["<C-i>"], "Go to a newer position in the jump list",
        function (count) { liberator.history.stepTo(count > 1 ? count : 1); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes,
        ["H", "<A-Left>", "<M-Left>"], "Go back in the browser history",
        function (count) { liberator.history.stepTo(-(count > 1 ? count : 1)); },
        { flags: liberator.Mappings.flags.COUNT });

    liberator.mappings.add(modes,
        ["L", "<A-Right>", "<M-Right>"], "Go forward in the browser history",
        function (count) { liberator.history.stepTo(count > 1 ? count : 1); },
        { flags: liberator.Mappings.flags.COUNT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["ba[ck]"],
        "Go back in the browser history",
        function (args, special, count)
        {
            if (special)
            {
                liberator.history.goToStart();
            }
            else
            {
                if (args)
                {
                    var sh = getWebNavigation().sessionHistory;
                    for (let i = sh.index - 1; i >= 0; i--)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                    liberator.echoerr("Exxx: URL not found in history");
                }
                else
                {
                    liberator.history.stepTo(count > 0 ? -1 * count : -1);
                }
            }
        },
        {
            completer: function (filter)
            {
                var sh = getWebNavigation().sessionHistory;
                var completions = [];
                for (let i = sh.index - 1; i >= 0; i--)
                {
                    var entry = sh.getEntryAtIndex(i, false);
                    var url = entry.URI.spec;
                    var title = entry.title;
                    if (liberator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return [0, completions];
            }
        });

    liberator.commands.add(["fo[rward]", "fw"],
        "Go forward in the browser history",
        function (args, special, count)
        {
            if (special)
            {
                liberator.history.goToEnd();
            }
            else
            {
                if (args)
                {
                    var sh = getWebNavigation().sessionHistory;
                    for (let i = sh.index + 1; i < sh.count; i++)
                    {
                        if (sh.getEntryAtIndex(i, false).URI.spec == args)
                        {
                            getWebNavigation().gotoIndex(i);
                            return;
                        }
                    }
                    liberator.echoerr("Exxx: URL not found in history");
                }
                else
                {
                    liberator.history.stepTo(count > 0 ? count : 1);
                }
            }
        },
        {
            completer: function (filter)
            {
                var sh = getWebNavigation().sessionHistory;
                var completions = [];
                for (let i = sh.index + 1; i < sh.count; i++)
                {
                    var entry = sh.getEntryAtIndex(i, false);
                    var url = entry.URI.spec;
                    var title = entry.title;
                    if (liberator.completion.match([url, title], filter, false))
                        completions.push([url, title]);
                }
                return [0, completions];
            }
        });

    liberator.commands.add(["hist[ory]", "hs"],
        "Show recently visited URLs",
        function (args, special) { liberator.history.list(args, special); },
        { completer: function (filter) { return [0, liberator.history.get(filter)]; } });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get: function (filter)
        {
            if (!history)
                load();

            return liberator.completion.filterURLArray(cachedHistory, filter).concat(
                   liberator.completion.filterURLArray(history, filter));
        },

        // the history is automatically added to the Places global history
        // so just update our cached history here
        add: function (url, title)
        {
            if (!history)
                load();

            // don' let cachedHistory grow too large
            if (cachedHistory.length > 1000)
            {
                history = cachedHistory.concat(history);
                cachedHistory = [];
            }
            else
                cachedHistory = cachedHistory.filter(function (elem) { return elem[0] != url; });

            cachedHistory.unshift([url, title || "[No title]"]);
            return true;
        },

        // TODO: better names?
        //       and move to liberator.buffer.?
        stepTo: function (steps)
        {
            var index = getWebNavigation().sessionHistory.index + steps;

            if (index >= 0 && index < getWebNavigation().sessionHistory.count)
            {
                getWebNavigation().gotoIndex(index);
            }
            else
            {
                liberator.beep();
            }
        },

        goToStart: function ()
        {
            var index = getWebNavigation().sessionHistory.index;

            if (index == 0)
            {
                liberator.beep();
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
                liberator.beep();
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
                    liberator.echoerr("E283: No history matching \"" + filter + "\"");
                else
                    liberator.echoerr("No history set");

                return;
            }

            if (openItems)
            {
                return liberator.open([i[0] for each (i in items)], liberator.NEW_TAB);
            }
            else
            {
                var list = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                           "<table><tr class=\"hl-Title\" align=\"left\"><th>title</th><th>URL</th></tr>";
                for (let i = 0; i < items.length; i++)
                {
                    var title = liberator.util.escapeHTML(liberator.util.clip(items[i][1], 50));
                    var url = liberator.util.escapeHTML(items[i][0]);
                    list += "<tr><td>" + title + "</td><td><a href=\"#\" class=\"hl-URL\">" + url + "</a></td></tr>";
                }
                list += "</table>";
                liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
            }
        }
    };
    //}}}
}; //}}}

liberator.QuickMarks = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var qmarks = liberator.storage.newMap("quickmarks", true);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = liberator.config.browserModes || [liberator.modes.NORMAL];

    liberator.mappings.add(modes,
        ["go"], "Jump to a QuickMark",
        function (arg) { liberator.quickmarks.jumpTo(arg, liberator.CURRENT_TAB); },
        { flags: liberator.Mappings.flags.ARGUMENT });

    liberator.mappings.add(modes,
        ["gn"], "Jump to a QuickMark in a new tab",
        function (arg)
        {
            liberator.quickmarks.jumpTo(arg,
                /\bquickmark\b/.test(liberator.options["activate"]) ?
                liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB);
        },
        { flags: liberator.Mappings.flags.ARGUMENT });

    liberator.mappings.add(modes,
        ["M"], "Add new QuickMark for current URL",
        function (arg)
        {
            if (/[^a-zA-Z0-9]/.test(arg))
            {
                liberator.beep();
                return;
            }

            liberator.quickmarks.add(arg, liberator.buffer.URL);
        },
        { flags: liberator.Mappings.flags.ARGUMENT });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["delqm[arks]"],
        "Delete the specified QuickMarks",
        function (args, special)
        {
            // TODO: finish arg parsing - we really need a proper way to do this. :)
            if (!special && !args)
            {
                liberator.echoerr("E471: Argument required");
                return;
            }

            if (special && args)
            {
                liberator.echoerr("E474: Invalid argument");
                return;
            }

            if (special)
                liberator.quickmarks.removeAll();
            else
                liberator.quickmarks.remove(args);
        });

    liberator.commands.add(["qma[rk]"],
        "Mark a URL with a letter for quick access",
        function (args)
        {
            var matches = args.string.match(/^([a-zA-Z0-9])(?:\s+(.+))?$/);
            if (!matches)
                liberator.echoerr("E488: Trailing characters");
            else if (!matches[2])
                liberator.quickmarks.add(matches[1], liberator.buffer.URL);
            else
                liberator.quickmarks.add(matches[1], matches[2]);
        },
        { argCount: "+" });

    liberator.commands.add(["qmarks"],
        "Show all QuickMarks",
        function (args)
        {
            // ignore invalid qmark characters unless there are no valid qmark chars
            if (args && !/[a-zA-Z0-9]/.test(args))
            {
                liberator.echoerr("E283: No QuickMarks matching \"" + args + "\"");
                return;
            }

            var filter = args.replace(/[^a-zA-Z0-9]/g, "");
            liberator.quickmarks.list(filter);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        add: function (qmark, location)
        {
            qmarks.set(qmark, location);
        },

        remove: function (filter)
        {
            var pattern = new RegExp("[" + filter.replace(/\s+/g, "") + "]");

            for (let [qmark,] in qmarks)
            {
                if (pattern.test(qmark))
                    qmarks.remove(qmark);
            }
        },

        removeAll: function ()
        {
            qmarks.clear();
        },

        jumpTo: function (qmark, where)
        {
            var url = qmarks.get(qmark);

            if (url)
                liberator.open(url, where);
            else
                liberator.echoerr("E20: QuickMark not set");
        },

        list: function (filter)
        {
            var marks = [key for ([key, val] in qmarks)];
            // This was a lot nicer without the lambda...
            var lowercaseMarks = marks.filter(function (x) /[a-z]/.test(x)).sort();
            var uppercaseMarks = marks.filter(function (x) /[A-Z]/.test(x)).sort();
            var numberMarks    = marks.filter(function (x) /[0-9]/.test(x)).sort();

            marks = Array.concat(lowercaseMarks, uppercaseMarks, numberMarks);

            if (marks.length == 0)
            {
                liberator.echoerr("No QuickMarks set");
                return;
            }

            if (filter.length > 0)
            {
                marks = marks.filter(function (qmark) filter.indexOf(qmark) >= 0)
                if (marks.length == 0)
                {
                    liberator.echoerr("E283: No QuickMarks matching \"" + filter + "\"");
                    return;
                }
            }

            var list = ":" + liberator.util.escapeHTML(liberator.commandline.getCommand()) + "<br/>" +
                       "<table><tr class=\"hl-Title\" align=\"left\"><th>QuickMark</th><th>URL</th></tr>";

            for (let i = 0; i < marks.length; i++)
            {
                list += "<tr><td>    " + marks[i] +
                        "</td><td style=\"color: green;\">" + liberator.util.escapeHTML(qmarks.get(marks[i])) + "</td></tr>";
            }

            list += "</table>";

            liberator.commandline.echo(list, liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
