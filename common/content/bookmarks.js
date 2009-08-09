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

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>

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

const DEFAULT_FAVICON = "chrome://mozapps/skin/places/defaultFavicon.png";

// Try to import older command line history, quick marks, etc.
liberator.registerObserver("load", function () {
    let branch = "extensions." + config.name.toLowerCase();
    if (!options.getPref(branch + ".commandline_cmd_history"))
        return;

    let store = storage["history-command"];
    let pref  = options.getPref(branch + ".commandline_cmd_history");
    for (let [k, v] in Iterator(pref.split("\n")))
        store.push(v);

    store = storage["quickmarks"];
    pref = options.getPref(branch + ".quickmarks")
                    .split("\n");
    while (pref.length > 0)
        store.set(pref.shift(), pref.shift());

    options.resetPref(branch + ".commandline_cmd_history");
    options.resetPref(branch + ".commandline_search_history");
    options.resetPref(branch + ".quickmarks");
});

// also includes methods for dealing with keywords and search engines
function Bookmarks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService   = PlacesUtils.history;
    const bookmarksService = PlacesUtils.bookmarks;
    const taggingService   = PlacesUtils.tagging;
    const faviconService   = services.get("favicon");

    // XXX for strange Firefox bug :(
    // Error: [Exception... "Component returned failure code: 0x8000ffff (NS_ERROR_UNEXPECTED) [nsIObserverService.addObserver]"
    //     nsresult: "0x8000ffff (NS_ERROR_UNEXPECTED)"
    //     location: "JS frame :: file://~firefox/components/nsTaggingService.js :: anonymous :: line 89"
    //     data: no]
    // Source file: file://~firefox/components/nsTaggingService.js
    taggingService.getTagsForURI(window.makeURI("http://mysterious.bug"), {});

    const Bookmark = new Struct("url", "title", "icon", "keyword", "tags", "id");
    const Keyword = new Struct("keyword", "title", "icon", "url");
    Bookmark.defaultValue("icon", function () getFavicon(this.url));
    Bookmark.prototype.__defineGetter__("extra", function () [
                            ["keyword", this.keyword,         "Keyword"],
                            ["tags",    this.tags.join(", "), "Tag"]
                        ].filter(function (item) item[1]));

    const storage = modules.storage;
    function Cache(name, store)
    {
        const rootFolders = [bookmarksService.toolbarFolder, bookmarksService.bookmarksMenuFolder, bookmarksService.unfiledBookmarksFolder];
        const sleep = liberator.sleep; // Storage objects are global to all windows, 'liberator' isn't.

        let bookmarks = [];
        let self = this;

        this.__defineGetter__("name",  function () name);
        this.__defineGetter__("store", function () store);
        this.__defineGetter__("bookmarks", function () this.load());

        this.__defineGetter__("keywords",
            function () [new Keyword(k.keyword, k.title, k.icon, k.url) for ([,k] in Iterator(self.bookmarks)) if (k.keyword)]);

        this.__iterator__ = function () (val for ([,val] in Iterator(self.bookmarks)));

        function loadBookmark(node)
        {
            let uri = util.newURI(node.uri);
            let keyword = bookmarksService.getKeywordForBookmark(node.itemId);
            let tags = taggingService.getTagsForURI(uri, {}) || [];
            let bmark = new Bookmark(node.uri, node.title, node.icon && node.icon.spec, keyword, tags, node.itemId);

            bookmarks.push(bmark);

            return bmark;
        }

        function readBookmark(id)
        {
            return {
                itemId: id,
                uri:    bookmarksService.getBookmarkURI(id).spec,
                title:  bookmarksService.getItemTitle(id)
            };
        }

        function deleteBookmark(id)
        {
            let length = bookmarks.length;
            bookmarks = bookmarks.filter(function (item) item.id != id);
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

        // since we don't use a threaded bookmark loading (by set preload)
        // anymore, is this loading synchronization still needed? --mst
        let loading = false;
        this.load = function load()
        {
            if (loading)
            {
                while (loading)
                    sleep(10);
                return bookmarks;
            }

            // update our bookmark cache
            bookmarks = [];
            loading = true;

            let folders = rootFolders.slice();
            let query = historyService.getNewQuery();
            let options = historyService.getNewQueryOptions();
            while (folders.length > 0)
            {
                query.setFolders(folders, 1);
                folders.shift();
                let result = historyService.executeQuery(query, options);
                let folder = result.root;
                folder.containerOpen = true;

                // iterate over the immediate children of this folder
                for (let i = 0; i < folder.childCount; i++)
                {
                    let node = folder.getChild(i);
                    if (node.type == node.RESULT_TYPE_FOLDER)   // folder
                        folders.push(node.itemId);
                    else if (node.type == node.RESULT_TYPE_URI) // bookmark
                        loadBookmark(node);
                }

                // close a container after using it!
                folder.containerOpen = false;
            }
            this.__defineGetter__("bookmarks", function () bookmarks);
            loading = false;
            return bookmarks;
        };

        var observer = {
            onBeginUpdateBatch: function onBeginUpdateBatch() {},
            onEndUpdateBatch:   function onEndUpdateBatch() {},
            onItemVisited:      function onItemVisited() {},
            onItemMoved:        function onItemMoved() {},
            onItemAdded: function onItemAdded(itemId, folder, index)
            {
                // liberator.dump("onItemAdded(" + itemId + ", " + folder + ", " + index + ")\n");
                if (bookmarksService.getItemType(itemId) == bookmarksService.TYPE_BOOKMARK)
                {
                    if (rootFolders.indexOf(findRoot(itemId)) >= 0)
                    {
                        let bmark = loadBookmark(readBookmark(itemId));
                        storage.fireEvent(name, "add", bmark);
                    }
                }
            },
            onItemRemoved: function onItemRemoved(itemId, folder, index)
            {
                // liberator.dump("onItemRemoved(" + itemId + ", " + folder + ", " + index + ")\n");
                if (deleteBookmark(itemId))
                    storage.fireEvent(name, "remove", itemId);
            },
            onItemChanged: function onItemChanged(itemId, property, isAnnotation, value)
            {
                if (isAnnotation)
                    return;
                // liberator.dump("onItemChanged(" + itemId + ", " + property + ", " + value + ")\n");
                let bookmark = bookmarks.filter(function (item) item.id == itemId)[0];
                if (bookmark)
                {
                    if (property == "tags")
                        value = taggingService.getTagsForURI(util.newURI(bookmark.url), {});
                    if (property in bookmark)
                        bookmark[property] = value;
                    storage.fireEvent(name, "change", itemId);
                }
            },
            QueryInterface: function QueryInterface(iid)
            {
                if (iid.equals(Ci.nsINavBookmarkObserver) || iid.equals(Ci.nsISupports))
                    return this;
                throw Cr.NS_ERROR_NO_INTERFACE;
            }
        };

        bookmarksService.addObserver(observer, false);
    }

    function getFavicon(uri)
    {
        try
        {
            return faviconService.getFaviconImageForPage(util.newURI(uri)).spec;
        }
        catch (e)
        {
            return "";
        }
    }

    let bookmarkObserver = function (key, event, arg)
    {
        if (event == "add")
            autocommands.trigger("BookmarkAdd", arg);
        statusline.updateUrl();
    };

    var cache = storage.newObject("bookmark-cache", Cache, false);
    storage.addObserver("bookmark-cache", bookmarkObserver, window);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["defsearch", "ds"],
        "Set the default search engine",
        "string", "google",
        {
            completer: function completer(context)
            {
                completion.search(context, true);
                context.completions = [["", "Don't perform searches by default"]].concat(context.completions);
            },
            validator: Option.validateCompleter
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;

    mappings.add(myModes, ["a"],
        "Open a prompt to bookmark the current URL",
        function ()
        {
            let title = "";
            let keyword = "";
            let tags = "";

            let bmarks = bookmarks.get(buffer.URL).filter(function (bmark) bmark.url == buffer.URL);

            if (bmarks.length == 1)
            {
                let bmark = bmarks[0];

                title = " -title=\"" + bmark.title + "\"";
                if (bmark.keyword)
                    keyword = " -keyword=\"" + bmark.keyword + "\"";
                if (bmark.tags.length > 0)
                    tags = " -tags=\"" + bmark.tags.join(", ") + "\"";
            }
            else
            {
                if (buffer.title != buffer.URL)
                    title = " -title=\"" + buffer.title + "\"";
            }

            commandline.open(":", "bmark " + buffer.URL + title + keyword + tags, modes.EX);
        });

    mappings.add(myModes, ["A"],
        "Toggle bookmarked state of current URL",
        function () { bookmarks.toggle(buffer.URL); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["ju[mps]"],
        "Show jumplist",
        function ()
        {
            let sh = history.session;
            let list = template.jumps(sh.index, sh);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        },
        { argCount: "0" });

    // TODO: Clean this up.
    function tags(context, args)
    {
        let filter = context.filter;
        let have = filter.split(",");

        args.completeFilter = have.pop();

        let prefix = filter.substr(0, filter.length - args.completeFilter.length);
        let tags = util.Array.uniq(util.Array.flatten([b.tags for ([k, b] in Iterator(cache.bookmarks))]));

        return [[prefix + tag, tag] for ([i, tag] in Iterator(tags)) if (have.indexOf(tag) < 0)];
    }

    function title(context, args)
    {
        if (!args.bang)
            return [[content.document.title, "Current Page Title"]];
        context.keys.text = "title";
        context.keys.description = "url";
        return bookmarks.get(args.join(" "), args["-tags"], null, { keyword: args["-keyword"], title: context.filter });
    }

    function keyword(context, args)
    {
        if (!args.bang)
            return [];
        context.keys.text = "keyword";
        return bookmarks.get(args.join(" "), args["-tags"], null, { keyword: context.filter, title: args["-title"] });
    }

    commands.add(["bma[rk]"],
        "Add a bookmark",
        function (args)
        {
            let url = args.length == 0 ? buffer.URL : args[0];
            let title = args["-title"] || (args.length == 0 ? buffer.title : null);
            let keyword = args["-keyword"] || null;
            let tags =    args["-tags"] || [];

            if (bookmarks.add(false, title, url, keyword, tags, args.bang))
            {
                let extra = (title == url) ? "" : " (" + title + ")";
                liberator.echomsg("Added bookmark: " + url + extra, 1, commandline.FORCE_SINGLELINE);
            }
            else
                liberator.echoerr("Exxx: Could not add bookmark `" + title + "'", commandline.FORCE_SINGLELINE);
        },
        {
            argCount: "?",
            bang: true,
            completer: function (context, args)
            {
                if (!args.bang)
                {
                    context.completions = [[content.document.documentURI, "Current Location"]];
                    return;
                }
                completion.bookmark(context, args["-tags"], { keyword: args["-keyword"], title: args["-title"] });
            },
            options: [[["-title", "-t"],    commands.OPTION_STRING, null, title],
                      [["-tags", "-T"],     commands.OPTION_LIST, null, tags],
                      [["-keyword", "-k"],  commands.OPTION_STRING, function (arg) /\w/.test(arg)]]
        });

    commands.add(["bmarks"],
        "List or open multiple bookmarks",
        function (args)
        {
            bookmarks.list(args.join(" "), args["-tags"] || [], args.bang, args["-max"]);
        },
        {
            bang: true,
            completer: function completer(context, args)
            {
                context.quote = null;
                context.filter = args.join(" ");
                completion.bookmark(context, args["-tags"]);
            },
            options: [[["-tags", "-T"], commands.OPTION_LIST, null, tags],
                      [["-max", "-m"], commands.OPTION_INT]]
        });

    commands.add(["delbm[arks]"],
        "Delete a bookmark",
        function (args)
        {
            if (args.bang)
            {
                commandline.input("This will delete all bookmarks. Would you like to continue? (yes/[no]) ",
                    function (resp)
                    {
                        if (resp && resp.match(/^y(es)?$/i))
                        {
                            bookmarks.get("").forEach(function (bmark) { bookmarks.remove(bmark.url); });
                            liberator.echomsg("All bookmarks deleted", 1, commandline.FORCE_SINGLELINE);
                        }
                    });
            }
            else
            {
                let url = args.string || buffer.URL;
                let deletedCount = bookmarks.remove(url);

                liberator.echomsg(deletedCount + " bookmark(s) with url `" + url + "' deleted", 1, commandline.FORCE_SINGLELINE);
            }

        },
        {
            argCount: "?",
            bang: true,
            completer: function completer(context) completion.bookmark(context),
            literal: 0
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMPLETIONS /////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    completion.bookmark = function bookmark(context, tags, extra) {
        context.title = ["Bookmark", "Title"];
        context.format = bookmarks.format;
        for (let val in Iterator(extra || []))
        {
            let [k, v] = val; // Need block scope here for the closure
            if (v)
                context.filters.push(function (item) this._match(v, item[k]));
        }
        // Need to make a copy because set completions() checks instanceof Array,
        // and this may be an Array from another window.
        context.completions = Array.slice(storage["bookmark-cache"].bookmarks);
        completion.urls(context, tags);
    };

    completion.search = function search(context, noSuggest) {
        let [, keyword, space, args] = context.filter.match(/^\s*(\S*)(\s*)(.*)$/);
        let keywords = bookmarks.getKeywords();
        let engines = bookmarks.getSearchEngines();

        context.title = ["Search Keywords"];
        context.completions = keywords.concat(engines);
        context.keys = { text: 0, description: 1, icon: 2 };

        if (!space || noSuggest)
            return;

        context.fork("suggest", keyword.length + space.length, this, "searchEngineSuggest",
                keyword, true);

        let item = keywords.filter(function (k) k.keyword == keyword)[0];
        if (item && item.url.indexOf("%s") > -1)
            context.fork("keyword/" + keyword, keyword.length + space.length, null, function (context) {
                context.format = history.format;
                context.title = [keyword + " Quick Search"];
                // context.background = true;
                context.compare = CompletionContext.Sort.unsorted;
                context.generate = function () {
                    let [begin, end] = item.url.split("%s");

                    return history.get({ uri: window.makeURI(begin), uriIsPrefix: true }).map(function (item) {
                        let rest = item.url.length - end.length;
                        let query = item.url.substring(begin.length, rest);
                        if (item.url.substr(rest) == end && query.indexOf("&") == -1)
                        {
                            item.url = decodeURIComponent(query);
                            return item;
                        }
                    }).filter(util.identity);
                };
            });
    };

    completion.searchEngineSuggest = function searchEngineSuggest(context, engineAliases, kludge) {
        if (!context.filter)
            return;

        let engineList = (engineAliases || options["suggestengines"] || "google").split(",");

        let completions = [];
        engineList.forEach(function (name) {
            let engine = services.get("browserSearch").getEngineByAlias(name);
            if (!engine)
                return;
            let [,word] = /^\s*(\S+)/.exec(context.filter) || [];
            if (!kludge && word == name) // FIXME: Check for matching keywords
                return;
            let ctxt = context.fork(name, 0);

            ctxt.title = [engine.description + " Suggestions"];
            ctxt.compare = CompletionContext.Sort.unsorted;
            ctxt.incomplete = true;
            bookmarks.getSuggestions(name, ctxt.filter, function (compl) {
                ctxt.incomplete = false;
                ctxt.completions = compl;
            });
        });
    };

    completion.addUrlCompleter("S", "Suggest engines", completion.searchEngineSuggest);
    completion.addUrlCompleter("b", "Bookmarks", completion.bookmark);
    completion.addUrlCompleter("s", "Search engines and keyword URLs", completion.search);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get format() ({
            anchored: false,
            title: ["URL", "Info"],
            keys: { text: "url", description: "title", icon: "icon", extra: "extra", tags: "tags" },
            process: [template.icon, template.bookmarkDescription]
        }),

        // if "bypassCache" is true, it will force a reload of the bookmarks database
        // on my PC, it takes about 1ms for each bookmark to load, so loading 1000 bookmarks
        // takes about 1 sec
        get: function get(filter, tags, maxItems, extra)
        {
            return completion.runCompleter("bookmark", filter, maxItems, tags, extra);
        },

        // if starOnly = true it is saved in the unfiledBookmarksFolder, otherwise in the bookmarksMenuFolder
        // FIXME: tags are not updated differentially
        add: function add(starOnly, title, url, keyword, tags, force)
        {
            try
            {
                let uri = util.createURI(url);
                if (!force)
                {
                    for (let bmark in cache)
                    {
                        if (bmark[0] == uri.spec)
                        {
                            var id = bmark[5];
                            if (title)
                                bookmarksService.setItemTitle(id, title);
                            break;
                        }
                    }
                }
                if (id == undefined)
                    id = bookmarksService.insertBookmark(
                             bookmarksService[starOnly ? "unfiledBookmarksFolder" : "bookmarksMenuFolder"],
                             uri, -1, title || url);
                if (!id)
                    return false;

                if (keyword)
                    bookmarksService.setKeywordForBookmark(id, keyword);
                if (tags)
                {
                    // TODO: presumably this needs to be done in two Places transactions *double yawn* --djk
                    //taggingService.untagURI(uri, null);
                    taggingService.tagURI(uri, tags);
                }
            }
            catch (e)
            {
                liberator.log(e, 0);
                return false;
            }

            return true;
        },

        toggle: function toggle(url)
        {
            if (!url)
                return;

            let count = this.remove(url);
            if (count > 0)
                commandline.echo("Removed bookmark: " + url, commandline.HL_NORMAL, commandline.FORCE_SINGLELINE);
            else
            {
                let title = buffer.title || url;
                let extra = "";
                if (title != url)
                    extra = " (" + title + ")";
                this.add(true, title, url);
                commandline.echo("Added bookmark: " + url + extra, commandline.HL_NORMAL, commandline.FORCE_SINGLELINE);
            }
        },

        isBookmarked: function isBookmarked(url)
        {
            try
            {
                let uri = util.newURI(url);
                return (bookmarksService.getBookmarkedURIFor(uri) != null);
            }
            catch (e)
            {
                return false;
            }
        },

        // returns number of deleted bookmarks
        remove: function remove(url)
        {
            if (!url)
                return 0;

            let i = 0;
            try
            {
                let uri = util.newURI(url);
                var count = {};
                let bmarks = bookmarksService.getBookmarkIdsForURI(uri, count);

                for (; i < bmarks.length; i++)
                    bookmarksService.removeItem(bmarks[i]);
            }
            catch (e)
            {
                liberator.log(e, 0);
                return i;
            }

            // update the display of our "bookmarked" symbol
            statusline.updateUrl();

            return count.value;
        },

        getFavicon: function (url) getFavicon(url),

        // TODO: add filtering
        // also ensures that each search engine has a Liberator-friendly alias
        getSearchEngines: function getSearchEngines()
        {
            let searchEngines = [];
            for (let [,engine] in Iterator(services.get("browserSearch").getVisibleEngines({})))
            {
                let alias = engine.alias;
                if (!alias || !/^[a-z0-9_-]+$/.test(alias))
                    alias = engine.name.replace(/^\W*([a-zA-Z_-]+).*/, "$1").toLowerCase();
                if (!alias)
                    alias = "search"; // for search engines which we can't find a suitable alias

                // make sure we can use search engines which would have the same alias (add numbers at the end)
                let newAlias = alias;
                for (let j = 1; j <= 10; j++) // <=10 is intentional
                {
                    if (!searchEngines.some(function (item) item[0] == newAlias))
                        break;

                    newAlias = alias + j;
                }
                // only write when it changed, writes are really slow
                if (engine.alias != newAlias)
                    engine.alias = newAlias;

                searchEngines.push([engine.alias, engine.description, engine.iconURI && engine.iconURI.spec]);
            }

            return searchEngines;
        },

        getSuggestions: function getSuggestions(engineName, query, callback)
        {
            const responseType = "application/x-suggestions+json";

            let engine = services.get("browserSearch").getEngineByAlias(engineName);
            if (engine && engine.supportsResponseType(responseType))
                var queryURI = engine.getSubmission(query, responseType).uri.spec;
            if (!queryURI)
                return [];

            function process(resp)
            {
                let results = [];
                try
                {
                    results = services.get("json").decode(resp.responseText)[1];
                    results = [[item, ""] for ([k, item] in Iterator(results)) if (typeof item == "string")];
                }
                catch (e) {}
                if (!callback)
                    return results;
                callback(results);
            }

            let resp = util.httpGet(queryURI, callback && process);
            if (!callback)
                return process(resp);
        },

        // TODO: add filtering
        // format of returned array:
        // [keyword, helptext, url]
        getKeywords: function getKeywords()
        {
            return cache.keywords;
        },

        // full search string including engine name as first word in @param text
        // if @param useDefSearch is true, it uses the default search engine
        // @returns the url for the search string
        //          if the search also requires a postData, [url, postData] is returned
        getSearchURL: function getSearchURL(text, useDefsearch)
        {
            let url = null;
            let postData = {};
            let searchString = (useDefsearch ? options["defsearch"] + " " : "") + text;

            // we need to make sure our custom alias have been set, even if the user
            // did not :open <tab> once before
            this.getSearchEngines();

            // ripped from Firefox
            if (!window.getShortcutOrURI)
                window.getShortcutOrURI = function (aURL, aPostDataRef) {
                    var shortcutURL = null;
                    var keyword = aURL;
                    var param = "";
                    var searchService = Cc['@mozilla.org/browser/search-service;1'].getService(Ci.nsIBrowserSearchService);
                    var offset = aURL.indexOf(" ");
                    if (offset > 0)
                    {
                        keyword = aURL.substr(0, offset);
                        param = aURL.substr(offset + 1);
                    }
                    if (!aPostDataRef)
                        aPostDataRef = {};
                    var engine = searchService.getEngineByAlias(keyword);
                    if (engine)
                    {
                        var submission = engine.getSubmission(param, null);
                        aPostDataRef.value = submission.postData;
                        return submission.uri.spec;
                    }
                    [shortcutURL, aPostDataRef.value] = PlacesUtils.getURLAndPostDataForKeyword(keyword);
                    if (!shortcutURL)
                        return aURL;
                    var postData = "";
                    if (aPostDataRef.value)
                        postData = unescape(aPostDataRef.value);
                    if (/%s/i.test(shortcutURL) || /%s/i.test(postData))
                    {
                        var charset = "";
                        const re = /^(.*)\&mozcharset=([a-zA-Z][_\-a-zA-Z0-9]+)\s*$/;
                        var matches = shortcutURL.match(re);
                        if (matches)
                            [, shortcutURL, charset] = matches;
                        else
                        {
                            try
                            {
                                charset = PlacesUtils.history.getCharsetForURI(makeURI(shortcutURL));
                            }
                            catch (e) {}
                        }
                        var encodedParam = "";
                        if (charset)
                            encodedParam = escape(convertFromUnicode(charset, param));
                        else
                            encodedParam = encodeURIComponent(param);
                        shortcutURL = shortcutURL.replace(/%s/g, encodedParam).replace(/%S/g, param);
                        if (/%s/i.test(postData))
                            aPostDataRef.value = getPostDataStream(postData, param, encodedParam, "application/x-www-form-urlencoded");
                    }
                    else if (param)
                    {
                        aPostDataRef.value = null;
                        return aURL;
                    }
                    return shortcutURL;
                }

            url = window.getShortcutOrURI(searchString, postData);

            if (url == searchString)
                url = null;

            if (postData && postData.value)
                return [url, postData.value];
            else
                return url; // can be null
        },

        // if openItems is true, open the matching bookmarks items in tabs rather than display
        list: function list(filter, tags, openItems, maxItems)
        {
            // FIXME: returning here doesn't make sense
            //   Why the hell doesn't it make sense? --Kris
            // Because it unconditionally bypasses the final error message
            // block and does so only when listing items, not opening them. In
            // short it breaks the :bmarks command which doesn't make much
            // sense to me but I'm old-fashioned. --djk
            if (!openItems)
                return completion.listCompleter("bookmark", filter, maxItems, tags);
            let items = completion.runCompleter("bookmark", filter, maxItems, tags);

            if (items.length)
                return liberator.open(items.map(function (i) i.url), liberator.NEW_TAB);

            if (filter.length > 0 && tags.length > 0)
                liberator.echoerr("E283: No bookmarks matching tags: \"" + tags + "\" and string: \"" + filter + "\"");
            else if (filter.length > 0)
                liberator.echoerr("E283: No bookmarks matching string: \"" + filter + "\"");
            else if (tags.length > 0)
                liberator.echoerr("E283: No bookmarks matching tags: \"" + tags + "\"");
            else
                liberator.echoerr("No bookmarks set");
        }
    };
    //}}}
}; //}}}

function History() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const historyService = PlacesUtils.history;

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;

    mappings.add(myModes,
        ["<C-o>"], "Go to an older position in the jump list",
        function (count) { history.stepTo(-Math.max(count, 1)); },
        { count: true });

    mappings.add(myModes,
        ["<C-i>"], "Go to a newer position in the jump list",
        function (count) { history.stepTo(Math.max(count, 1)); },
        { count: true });

    mappings.add(myModes,
        ["H", "<A-Left>", "<M-Left>"], "Go back in the browser history",
        function (count) { history.stepTo(-Math.max(count, 1)); },
        { count: true });

    mappings.add(myModes,
        ["L", "<A-Right>", "<M-Right>"], "Go forward in the browser history",
        function (count) { history.stepTo(Math.max(count, 1)); },
        { count: true });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["ba[ck]"],
        "Go back in the browser history",
        function (args)
        {
            let url = args.literalArg;

            if (args.bang)
                history.goToStart();
            else
            {
                if (url)
                {
                    let sh = history.session;
                    if (/^\d+(:|$)/.test(url) && sh.index - parseInt(url) in sh)
                        return void window.getWebNavigation().gotoIndex(sh.index - parseInt(url));

                    for (let [i, ent] in Iterator(sh.slice(0, sh.index).reverse()))
                        if (ent.URI.spec == url)
                            return void window.getWebNavigation().gotoIndex(i);
                    liberator.echoerr("Exxx: URL not found in history");
                }
                else
                    history.stepTo(-Math.max(args.count, 1));
            }
        },
        {
            argCount: "?",
            bang: true,
            completer: function completer(context)
            {
                let sh = history.session;

                context.anchored = false;
                context.completions = sh.slice(0, sh.index).reverse();
                context.keys = { text: function (item) (sh.index - item.index) + ": " + item.URI.spec, description: "title", icon: "icon" };
                context.compare = CompletionContext.Sort.unsorted;
                context.filters = [CompletionContext.Filter.textDescription];
            },
            count: true,
            literal: 0
        });

    commands.add(["fo[rward]", "fw"],
        "Go forward in the browser history",
        function (args)
        {
            let url = args.literalArg;

            if (args.bang)
                history.goToEnd();
            else
            {
                if (url)
                {
                    let sh = history.session;
                    if (/^\d+(:|$)/.test(url) && sh.index + parseInt(url) in sh)
                        return void window.getWebNavigation().gotoIndex(sh.index + parseInt(url));

                    for (let [i, ent] in Iterator(sh.slice(sh.index + 1)))
                        if (ent.URI.spec == url)
                            return void window.getWebNavigation().gotoIndex(i);
                    liberator.echoerr("Exxx: URL not found in history");
                }
                else
                    history.stepTo(Math.max(args.count, 1));
            }
        },
        {
            argCount: "?",
            bang: true,
            completer: function completer(context)
            {
                let sh = history.session;

                context.anchored = false;
                context.completions = sh.slice(sh.index + 1);
                context.keys = { text: function (item) (item.index - sh.index) + ": " + item.URI.spec, description: "title", icon: "icon" };
                context.compare = CompletionContext.Sort.unsorted;
                context.filters = [CompletionContext.Filter.textDescription];
            },
            count: true,
            literal: 0
        });

    commands.add(["hist[ory]", "hs"],
        "Show recently visited URLs",
        function (args) { history.list(args.join(" "), args.bang, args["-max"] || 1000); },
        {
            bang: true,
            completer: function (context) { context.quote = null; completion.history(context); },
            // completer: function (filter) completion.history(filter)
            options: [[["-max", "-m"], options.OPTION_INT]]
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMPLETIONS /////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    completion.history = function _history(context, maxItems) {
        context.format = history.format;
        context.title = ["History"]
        context.compare = CompletionContext.Sort.unsorted;
        //context.background = true;
        if (context.maxItems == null)
            context.maxItems = 100;
        context.regenerate = true;
        context.generate = function () history.get(context.filter, this.maxItems);
    };

    completion.addUrlCompleter("h", "History", completion.history);

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        get format() bookmarks.format,

        get service() historyService,

        get: function get(filter, maxItems)
        {
            // no query parameters will get all history
            let query = historyService.getNewQuery();
            let options = historyService.getNewQueryOptions();

            if (typeof filter == "string")
                filter = { searchTerms: filter };
            for (let [k, v] in Iterator(filter))
                query[k] = v;
            options.sortingMode = options.SORT_BY_DATE_DESCENDING;
            options.resultType = options.RESULTS_AS_URI;
            if (maxItems > 0)
                options.maxResults = maxItems;

            // execute the query
            let root = historyService.executeQuery(query, options).root;
            root.containerOpen = true;
            let items = util.map(util.range(0, root.childCount), function (i) {
                let node = root.getChild(i);
                return {
                    url: node.uri,
                    title: node.title,
                    icon: node.icon ? node.icon.spec : DEFAULT_FAVICON
                };
            });
            root.containerOpen = false; // close a container after using it!

            return items;
        },

        get session()
        {
            let sh = window.getWebNavigation().sessionHistory;
            let obj = [];
            obj.index = sh.index;
            obj.__iterator__ = function() util.Array.iteritems(this)
            for (let i in util.range(0, sh.count))
            {
                obj[i] = { index: i, __proto__: sh.getEntryAtIndex(i, false) };
                util.memoize(obj[i], "icon",
                    function (obj) services.get("favicon").getFaviconImageForPage(obj.URI).spec);
            }
            return obj;
        },

        // TODO: better names
        stepTo: function stepTo(steps)
        {
            let start = 0;
            let end = window.getWebNavigation().sessionHistory.count - 1;
            let current = window.getWebNavigation().sessionHistory.index;

            if (current == start && steps < 0 || current == end && steps > 0)
                liberator.beep();
            else
            {
                let index = util.Math.constrain(current + steps, start, end);
                window.getWebNavigation().gotoIndex(index);
            }
        },

        goToStart: function goToStart()
        {
            let index = window.getWebNavigation().sessionHistory.index;

            if (index > 0)
                window.getWebNavigation().gotoIndex(0);
            else
                liberator.beep();

        },

        goToEnd: function goToEnd()
        {
            let sh = window.getWebNavigation().sessionHistory;
            let max = sh.count - 1;

            if (sh.index < max)
                window.getWebNavigation().gotoIndex(max);
            else
                liberator.beep();

        },

        // if openItems is true, open the matching history items in tabs rather than display
        list: function list(filter, openItems, maxItems)
        {
            // FIXME: returning here doesn't make sense
            //   Why the hell doesn't it make sense? --Kris
            // See comment at bookmarks.list --djk
            if (!openItems)
                return completion.listCompleter("history", filter, maxItems);
            let items = completion.runCompleter("history", filter, maxItems);

            if (items.length)
                return liberator.open(items.map(function (i) i.url), liberator.NEW_TAB);

            if (filter.length > 0)
                liberator.echoerr("E283: No history matching \"" + filter + "\"");
            else
                liberator.echoerr("No history set");
        }
    };
    //}}}
}; //}}}

function QuickMarks() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var qmarks = storage.newMap("quickmarks", true, { privateData: true });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = config.browserModes;

    mappings.add(myModes,
        ["go"], "Jump to a QuickMark",
        function (arg) { quickmarks.jumpTo(arg, liberator.CURRENT_TAB); },
        { arg: true });

    mappings.add(myModes,
        ["gn"], "Jump to a QuickMark in a new tab",
        function (arg)
        {
            quickmarks.jumpTo(arg,
                /\bquickmark\b/.test(options["activate"]) ?
                liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB);
        },
        { arg: true });

    mappings.add(myModes,
        ["M"], "Add new QuickMark for current URL",
        function (arg)
        {
            if (/[^a-zA-Z0-9]/.test(arg))
                return void liberator.beep();

            quickmarks.add(arg, buffer.URL);
        },
        { arg: true });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["delqm[arks]"],
        "Delete the specified QuickMarks",
        function (args)
        {
            // TODO: finish arg parsing - we really need a proper way to do this. :)
            if (!args.bang && !args.string)
                return void liberator.echoerr("E471: Argument required");

            if (args.bang && args.string)
                return void liberator.echoerr("E474: Invalid argument");

            if (args.bang)
                quickmarks.removeAll();
            else
                quickmarks.remove(args.string);
        },
        {
            bang: true,
            completer: function (context)
            {
                context.title = ["QuickMark", "URL"];
                context.completions = qmarks;
            }
        });

    commands.add(["qma[rk]"],
        "Mark a URL with a letter for quick access",
        function (args)
        {
            let matches = args.string.match(/^([a-zA-Z0-9])(?:\s+(.+))?$/);
            if (!matches)
                liberator.echoerr("E488: Trailing characters");
            else if (!matches[2])
                quickmarks.add(matches[1], buffer.URL);
            else
                quickmarks.add(matches[1], matches[2]);
        },
        { argCount: "+" });

    commands.add(["qmarks"],
        "Show all QuickMarks",
        function (args)
        {
            args = args.string;

            // ignore invalid qmark characters unless there are no valid qmark chars
            if (args && !/[a-zA-Z0-9]/.test(args))
                return void liberator.echoerr("E283: No QuickMarks matching \"" + args + "\"");

            let filter = args.replace(/[^a-zA-Z0-9]/g, "");
            quickmarks.list(filter);
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        add: function add(qmark, location)
        {
            qmarks.set(qmark, location);
            liberator.echomsg("Added Quick Mark '" + qmark + "': " + location, 1);
        },

        remove: function remove(filter)
        {
            let pattern = RegExp("[" + filter.replace(/\s+/g, "") + "]");

            for (let [qmark,] in qmarks)
            {
                if (pattern.test(qmark))
                    qmarks.remove(qmark);
            }
        },

        removeAll: function removeAll()
        {
            qmarks.clear();
        },

        jumpTo: function jumpTo(qmark, where)
        {
            let url = qmarks.get(qmark);

            if (url)
                liberator.open(url, where);
            else
                liberator.echoerr("E20: QuickMark not set");
        },

        list: function list(filter)
        {
            let marks = [k for ([k, v] in qmarks)];
            let lowercaseMarks = marks.filter(function (x) /[a-z]/.test(x)).sort();
            let uppercaseMarks = marks.filter(function (x) /[A-Z]/.test(x)).sort();
            let numberMarks    = marks.filter(function (x) /[0-9]/.test(x)).sort();

            marks = Array.concat(lowercaseMarks, uppercaseMarks, numberMarks);

            if (marks.length == 0)
                return void liberator.echoerr("No QuickMarks set");

            if (filter.length > 0)
            {
                marks = marks.filter(function (qmark) filter.indexOf(qmark) >= 0);
                if (marks.length == 0)
                    return void liberator.echoerr("E283: No QuickMarks matching \"" + filter + "\"");
            }

            let items = [[mark, qmarks.get(mark)] for ([k, mark] in Iterator(marks))];
            template.genericTable(items, { title: ["QuickMark", "URL"] });
        }
    };
    //}}}
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
