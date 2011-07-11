// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


const DEFAULT_FAVICON = "chrome://mozapps/skin/places/defaultFavicon.png";

// also includes methods for dealing with keywords and search engines
const Bookmarks = Module("bookmarks", {
    requires: ["autocommands", "config", "liberator", "storage", "services"],

    init: function () {
        const faviconService   = services.get("favicon");
        const bookmarksService = services.get("bookmarks");
        const historyService   = services.get("history");
        const tagging          = PlacesUtils.tagging;

        this.getFavicon = getFavicon;
        function getFavicon(uri) {
            try {
                return faviconService.getFaviconImageForPage(util.newURI(uri)).spec;
            }
            catch (e) {
                return "";
            }
        }

        // Fix for strange Firefox bug:
        // Error: [Exception... "Component returned failure code: 0x8000ffff (NS_ERROR_UNEXPECTED) [nsIObserverService.addObserver]"
        //     nsresult: "0x8000ffff (NS_ERROR_UNEXPECTED)"
        //     location: "JS frame :: file://~firefox/components/nsTaggingService.js :: anonymous :: line 89"
        //     data: no]
        // Source file: file://~firefox/components/nsTaggingService.js
        tagging.getTagsForURI(window.makeURI("http://mysterious.bug"), {});

        const Bookmark = Struct("url", "title", "icon", "keyword", "tags", "id");
        const Keyword = Struct("keyword", "title", "icon", "url");
        Bookmark.defaultValue("icon", function () getFavicon(this.url));
        Bookmark.prototype.__defineGetter__("extra", function () [
                                ["keyword", this.keyword,         "Keyword"],
                                ["tags",    this.tags.join(", "), "Tag"]
                            ].filter(function (item) item[1]));

        const storage = modules.storage;
        function Cache(name, store) {
            const rootFolders = [bookmarksService.toolbarFolder, bookmarksService.bookmarksMenuFolder, bookmarksService.unfiledBookmarksFolder];
            const sleep = liberator.sleep; // Storage objects are global to all windows, 'liberator' isn't.

            let bookmarks = [];
            let self = this;

            this.__defineGetter__("name",  function () name);
            this.__defineGetter__("store", function () store);
            this.__defineGetter__("bookmarks", function () this.load());

            this.__defineGetter__("keywords",
                function () [Keyword(k.keyword, k.title, k.icon, k.url) for ([, k] in Iterator(self.bookmarks)) if (k.keyword)]);

            this.__iterator__ = function () (val for ([, val] in Iterator(self.bookmarks)));

            function loadBookmark(node) {
                if (node.uri == null) // How does this happen?
                    return false;
                let uri = util.newURI(node.uri);
                let keyword = bookmarksService.getKeywordForBookmark(node.itemId);
                let tags = tagging.getTagsForURI(uri, {}) || [];
                let bmark = Bookmark(node.uri, node.title, node.icon && node.icon.spec, keyword, tags, node.itemId);

                bookmarks.push(bmark);
                return bmark;
            }

            function readBookmark(id) {
                return {
                    itemId: id,
                    uri:    bookmarksService.getBookmarkURI(id).spec,
                    title:  bookmarksService.getItemTitle(id)
                };
            }

            function deleteBookmark(id) {
                let length = bookmarks.length;
                bookmarks = bookmarks.filter(function (item) item.id != id);
                return bookmarks.length < length;
            }

            this.findRoot = function findRoot(id) {
                do {
                    var root = id;
                    id = bookmarksService.getFolderIdForItem(id);
                } while (id != bookmarksService.placesRoot && id != root);
                return root;
            };

            this.isBookmark = function (id) rootFolders.indexOf(self.findRoot(id)) >= 0;

            this.isRegularBookmark = function findRoot(id) {
                do {
                    var root = id;
                    if (services.get("livemark") && services.get("livemark").isLivemark(id))
                        return false;
                    id = bookmarksService.getFolderIdForItem(id);
                } while (id != bookmarksService.placesRoot && id != root);
                return rootFolders.indexOf(root) >= 0;
            };

            // since we don't use a threaded bookmark loading (by set preload)
            // anymore, is this loading synchronization still needed? --mst
            let loading = false;
            this.load = function load() {
                if (loading) {
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
                while (folders.length > 0) {
                    query.setFolders(folders, 1);
                    folders.shift();
                    let result = historyService.executeQuery(query, options);
                    let folder = result.root;
                    folder.containerOpen = true;

                    // iterate over the immediate children of this folder
                    for (let i = 0; i < folder.childCount; i++) {
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
                onItemAdded: function onItemAdded(itemId, folder, index) {
                    if (bookmarksService.getItemType(itemId) == bookmarksService.TYPE_BOOKMARK) {
                        if (self.isBookmark(itemId)) {
                            let bmark = loadBookmark(readBookmark(itemId));
                            storage.fireEvent(name, "add", bmark);
                            statusline.updateBookmark();
                        }
                    }
                },
                onItemRemoved: function onItemRemoved(itemId, folder, index) {
                    if (deleteBookmark(itemId)) {
                        storage.fireEvent(name, "remove", itemId);
                        statusline.updateBookmark();
                    }
                },
                onItemChanged: function onItemChanged(itemId, property, isAnnotation, value) {
                    if (isAnnotation)
                        return;

                    let bookmark = bookmarks.filter(function (item) item.id == itemId)[0];
                    if (bookmark) {
                        if (property == "tags")
                            value = tagging.getTagsForURI(util.newURI(bookmark.url), {});
                        if (property in bookmark)
                            bookmark[property] = value;
                        storage.fireEvent(name, "change", itemId);
                    }
                },
                QueryInterface: function QueryInterface(iid) {
                    if (iid.equals(Ci.nsINavBookmarkObserver) || iid.equals(Ci.nsISupports))
                        return this;
                    throw Cr.NS_ERROR_NO_INTERFACE;
                }
            };

            bookmarksService.addObserver(observer, false);
        }

        let bookmarkObserver = function (key, event, arg) {
            if (event == "add")
                autocommands.trigger("BookmarkAdd", arg);
        };

        this._cache = storage.newObject("bookmark-cache", Cache, { store: false });
        storage.addObserver("bookmark-cache", bookmarkObserver, window);
    },

    get format() ({
        anchored: false,
        title: ["URL", "Info"],
        keys: { text: "url", description: "title", icon: "icon", extra: "extra", tags: "tags", keyword: "keyword" },
        process: [template.icon, template.bookmarkDescription]
    }),

    // TODO: why is this a filter? --djk
    get: function get(filter, tags, maxItems, extra) {
        return completion.runCompleter("bookmark", filter, maxItems, tags, extra);
    },

    // if starOnly = true it is saved in the unfiledBookmarksFolder, otherwise in the bookmarksMenuFolder
    add: function add(starOnly, title, url, keyword, tags, force) {
        try {
            let uri = util.createURI(url);
            if (!force) {
                for (let bmark in this._cache) {
                    if (bmark[0] == uri.spec) {
                        var id = bmark[5];
                        if (title)
                            services.get("bookmarks").setItemTitle(id, title);
                        break;
                    }
                }
            }
            if (id == undefined)
                id = services.get("bookmarks").insertBookmark(
                         services.get("bookmarks")[starOnly ? "unfiledBookmarksFolder" : "bookmarksMenuFolder"],
                         uri, -1, title || url);
            if (!id)
                return false;

            if (keyword)
                services.get("bookmarks").setKeywordForBookmark(id, keyword);
            if (tags) {
                PlacesUtils.tagging.untagURI(uri, null);
                PlacesUtils.tagging.tagURI(uri, tags);
            }
        }
        catch (e) {
            liberator.echoerr(e);
            return false;
        }

        return true;
    },

    toggle: function toggle(url) {
        if (!url)
            return;

        let count = this.remove(url);
        if (count > 0)
            liberator.echomsg("Removed bookmark: " + url);
        else {
            let title = buffer.title || url;
            let extra = "";
            if (title != url)
                extra = " (" + title + ")";
            this.add(true, title, url);
            liberator.echomsg("Added bookmark: " + url);
        }
    },

    isBookmarked: function isBookmarked(url) {
        try {
            return services.get("bookmarks").getBookmarkIdsForURI(makeURI(url), {})
                                   .some(this._cache.isRegularBookmark);
        }
        catch (e) {
            return false;
        }
    },

    // returns number of deleted bookmarks
    remove: function remove(url) {
        try {
            let uri = util.newURI(url);
            let bmarks = services.get("bookmarks").getBookmarkIdsForURI(uri, {}).filter(this._cache.isRegularBookmark);
            bmarks.forEach(services.get("bookmarks").removeItem);
            return bmarks.length;
        }
        catch (e) {
            liberator.echoerr(e);
            return 0;
        }
    },

    // TODO: add filtering
    // also ensures that each search engine has a Liberator-friendly alias
    getSearchEngines: function getSearchEngines() {
        let searchEngines = [];
        for (let [, engine] in Iterator(services.get("browserSearch").getVisibleEngines({}))) {
            let alias = engine.alias;
            if (!alias || !/^[a-z0-9_-]+$/.test(alias))
                alias = engine.name.replace(/^\W*([a-zA-Z_-]+).*/, "$1").toLowerCase();
            if (!alias)
                alias = "search"; // for search engines which we can't find a suitable alias

            // make sure we can use search engines which would have the same alias (add numbers at the end)
            let newAlias = alias;
            for (let j = 1; j <= 10; j++) { // <=10 is intentional
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

    getSuggestions: function getSuggestions(engineName, query, callback) {
        const responseType = "application/x-suggestions+json";

        let engine = services.get("browserSearch").getEngineByAlias(engineName);
        if (engine && engine.supportsResponseType(responseType))
            var queryURI = engine.getSubmission(query, responseType).uri.spec;
        if (!queryURI)
            return [];

        function process(resp) {
            let results = [];
            try {
                results = JSON.parse(resp.responseText)[1];
                results = [[item, ""] for ([k, item] in Iterator(results)) if (typeof item == "string")];
            }
            catch (e) {}
            if (!callback)
                return results;
            return callback(results);
        }

        let resp = util.httpGet(queryURI, callback && process);
        if (!callback)
            return process(resp);
        return null;
    },

    // TODO: add filtering
    // format of returned array:
    // [keyword, helptext, url]
    getKeywords: function getKeywords() {
        return this._cache.keywords;
    },

    // full search string including engine name as first word in @param text
    // if @param useDefSearch is true, it uses the default search engine
    // @returns the url for the search string
    //          if the search also requires a postData, [url, postData] is returned
    getSearchURL: function getSearchURL(text, useDefsearch) {
        let searchString = (useDefsearch ? options["defsearch"] + " " : "") + text;

        // we need to make sure our custom alias have been set, even if the user
        // did not :open <tab> once before
        this.getSearchEngines();

        // ripped from Firefox
        function getShortcutOrURI(url) {
            var keyword = url;
            var param = "";
            var offset = url.indexOf(" ");
            if (offset > 0) {
                keyword = url.substr(0, offset);
                param = url.substr(offset + 1);
            }

            var engine = services.get("browserSearch").getEngineByAlias(keyword);
            if (engine) {
                var submission = engine.getSubmission(param, null);
                return [submission.uri.spec, submission.postData];
            }

            let [shortcutURL, postData] = PlacesUtils.getURLAndPostDataForKeyword(keyword);
            if (!shortcutURL)
                return [url, null];

            let data = window.unescape(postData || "");
            if (/%s/i.test(shortcutURL) || /%s/i.test(data)) {
                var charset = "";
                var matches = shortcutURL.match(/^(.*)\&mozcharset=([a-zA-Z][_\-a-zA-Z0-9]+)\s*$/);
                if (matches)
                    [, shortcutURL, charset] = matches;
                else {
                    try {
                        charset = services.get("history").getCharsetForURI(window.makeURI(shortcutURL));
                    }
                    catch (e) {}
                }
                var encodedParam;
                if (charset)
                    encodedParam = escape(window.convertFromUnicode(charset, param));
                else
                    encodedParam = encodeURIComponent(param);
                shortcutURL = shortcutURL.replace(/%s/g, encodedParam).replace(/%S/g, param);
                if (/%s/i.test(data))
                    postData = window.getPostDataStream(data, param, encodedParam, "application/x-www-form-urlencoded");
            }
            else if (param)
                return [shortcutURL, null];
            return [shortcutURL, postData];
        }

        let [url, postData] = getShortcutOrURI(searchString);

        if (url == searchString)
            return null;
        if (postData)
            return [url, postData];
        return url; // can be null
    },

    // if openItems is true, open the matching bookmarks items in tabs rather than display
    list: function list(filter, tags, openItems, maxItems, keyword) {
        // FIXME: returning here doesn't make sense
        //   Why the hell doesn't it make sense? --Kris
        // Because it unconditionally bypasses the final error message
        // block and does so only when listing items, not opening them. In
        // short it breaks the :bmarks command which doesn't make much
        // sense to me but I'm old-fashioned. --djk
        let kw = (keyword == "") ? undefined : {keyword:keyword};
        if (!openItems)
            return completion.listCompleter("bookmark", filter, maxItems, tags, kw, CompletionContext.Filter.textAndDescription);
        let items = completion.runCompleter("bookmark", filter, maxItems, tags, kw, CompletionContext.Filter.textAndDescription);

        if (items.length)
            return liberator.open(items.map(function (i) i.url), liberator.NEW_TAB);

        if (filter.length > 0 && tags.length > 0)
            liberator.echoerr("No bookmarks matching tags: \"" + tags + "\" and string: \"" + filter + "\"");
        else if (filter.length > 0)
            liberator.echoerr("No bookmarks matching string: \"" + filter + "\"");
        else if (tags.length > 0)
            liberator.echoerr("No bookmarks matching tags: \"" + tags + "\"");
        else
            liberator.echoerr("No bookmarks set");
        return null;
    }
}, {
}, {
    commands: function () {
        commands.add(["ju[mps]"],
            "Show jumplist",
            function () {
                // TODO: Make url clicking work again. Old code: <td><a href={val.URI.spec} highlight="URL jump-list">{val.URI.spec}</a></td>
                let sh = history.session;
                let jumps = [[idx == sh.index ? ">" : "", Math.abs(idx - sh.index), val.title, val.URI.spec] for ([idx, val] in Iterator(sh))];
                let list = template.tabular([{ header: "Jump", style: "color: red", colspan: 2 }, { header: "", style: "text-align: right", highlight: "Number" },
                    { header: "Title", style: "width: 250px; max-width: 500px; overflow: hidden" },
                    { header: "URL", highlight: "URL jump-list" }],
                    jumps);

                commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
            },
            { argCount: "0" });

        // TODO: Clean this up.
        function tags(context, args) {
            let filter = context.filter;
            let have = filter.split(",");

            args.completeFilter = have.pop();

            let prefix = filter.substr(0, filter.length - args.completeFilter.length);
            let tags = util.Array.uniq(util.Array.flatten([b.tags for ([k, b] in Iterator(bookmarks._cache.bookmarks))]));

            return [[prefix + tag, tag] for ([i, tag] in Iterator(tags)) if (have.indexOf(tag) < 0)];
        }

        function title(context, args) {
            if (!args.bang)
                return [[content.document.title, "Current Page Title"]];
            context.keys.text = "title";
            context.keys.description = "url";
            return bookmarks.get(args.join(" "), args["-tags"], null, { keyword: args["-keyword"], title: context.filter });
        }

        function keyword(context, args) {
            let keywords = util.Array.uniq(util.Array.flatten([b.keyword for ([k, b] in Iterator(bookmarks._cache.keywords))]));
            return [[kw, kw] for ([i, kw] in Iterator(keywords)) ];
        }

        commands.add(["bma[rk]"],
            "Add a bookmark",
            function (args) {
                let url = args.length == 0 ? buffer.URL : args[0];
                let title = args["-title"] || (args.length == 0 ? buffer.title : null);
                let keyword = args["-keyword"] || null;
                let tags =    args["-tags"] || [];

                if (bookmarks.add(false, title, url, keyword, tags, args.bang)) {
                    let extra = (title == url) ? "" : " (" + title + ")";
                    liberator.echomsg("Added bookmark: " + url + extra);
                }
                else
                    liberator.echoerr("Could not add bookmark: " + title);
            }, {
                argCount: "?",
                bang: true,
                completer: function (context, args) {
                    if (!args.bang) {
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
            function (args) {
                bookmarks.list(args.join(" "), args["-tags"] || [], args.bang, args["-max"], args["-keyword"] || []);
            },
            {
                bang: true,
                completer: function completer(context, args) {
                    context.quote = null;
                    context.filter = args.join(" ");
                    context.filters = [CompletionContext.Filter.textAndDescription];
                    let kw = (args["-keyword"]) ? {keyword: args["-keyword"]} : undefined;
                    completion.bookmark(context, args["-tags"], kw);
                },
                options: [[["-tags", "-T"],    commands.OPTION_LIST, null, tags],
                          [["-max", "-m"],     commands.OPTION_INT],
                          [["-keyword", "-k"], commands.OPTION_STRING, null, keyword]]
            });

        commands.add(["delbm[arks]"],
            "Delete a bookmark",
            function (args) {
                if (args.bang) {
                    commandline.input("This will delete all bookmarks. Would you like to continue? (yes/[no]) ",
                        function (resp) {
                            if (resp && resp.match(/^y(es)?$/i)) {
                                bookmarks._cache.bookmarks.forEach(function (bmark) { services.get("bookmarks").removeItem(bmark.id); });
                                liberator.echomsg("All bookmarks deleted");
                            }
                        });
                }
                else {
                    let url = args.string || buffer.URL;
                    let deletedCount = bookmarks.remove(url);

                    liberator.echomsg("Deleted " + deletedCount + " bookmark(s) with url: " + url.quote());
                }

            },
            {
                argCount: "?",
                bang: true,
                completer: function completer(context) completion.bookmark(context),
                literal: 0
            });
    },
    mappings: function () {
        var myModes = config.browserModes;

        mappings.add(myModes, ["a"],
            "Open a prompt to bookmark the current URL",
            function () {
                let options = {};

                let bmarks = bookmarks.get(buffer.URL).filter(function (bmark) bmark.url == buffer.URL);

                if (bmarks.length == 1) {
                    let bmark = bmarks[0];

                    options["-title"] = bmark.title;
                    if (bmark.keyword)
                        options["-keyword"] = bmark.keyword;
                    if (bmark.tags.length > 0)
                        options["-tags"] = bmark.tags.join(", ");
                }
                else {
                    if (buffer.title != buffer.URL)
                        options["-title"] = buffer.title;
                }

                commandline.open("",
                    commands.commandToString({ command: "bmark", options: options, arguments: [buffer.URL], bang: bmarks.length > 1 }),
                    modes.EX);
            });

        mappings.add(myModes, ["A"],
            "Toggle bookmarked state of current URL",
            function () { bookmarks.toggle(buffer.URL); });
    },
    options: function () {
        options.add(["defsearch", "ds"],
            "Set the default search engine",
            "string", "google",
            {
                completer: function completer(context) {
                    completion.search(context, true);
                    context.completions = [["", "Don't perform searches by default"]].concat(context.completions);
                }
            });
    },
    completion: function () {
        completion.bookmark = function bookmark(context, tags, extra) {
            context.title = ["Bookmark", "Title"];
            context.format = bookmarks.format;
            for (let val in Iterator(extra || [])) {
                let [k, v] = val; // Need block scope here for the closure
                if (v)
                    context.filters.push(function (item) this._match(v, item[k] || ""));
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
            if (item && item.url.indexOf("%s") > -1) {
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
                            if (item.url.substr(rest) == end && query.indexOf("&") == -1) {
                                query = query.replace(/#.*/, "");
                                // Countermeasure for "Error: malformed URI sequence".
                                try {
                                    item.url = decodeURIComponent(query);
                                }
                                catch (e) {
                                    item.url = query;
                                }
                                return item;
                            }
                            return null;
                        }).filter(util.identity);
                    };
                });
            }
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
                let [, word] = /^\s*(\S+)/.exec(context.filter) || [];
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
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
