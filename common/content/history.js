// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

const History = Module("history", {
    requires: ["config"],

    get format() bookmarks.format,

    get service() services.get("history"),

    get: function get(filter, maxItems) {
        // no query parameters will get all history
        let query = services.get("history").getNewQuery();
        let options = services.get("history").getNewQueryOptions();

        if (typeof filter == "string")
            filter = { searchTerms: filter };
        for (let [k, v] in Iterator(filter))
            query[k] = v;
        options.sortingMode = options.SORT_BY_DATE_DESCENDING;
        options.resultType = options.RESULTS_AS_URI;
        if (maxItems > 0)
            options.maxResults = maxItems;

        // execute the query
        let root = services.get("history").executeQuery(query, options).root;
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

    get session() {
        let sh = window.getWebNavigation().sessionHistory;
        let obj = [];
        obj.index = sh.index;
        obj.__iterator__ = function () util.Array.iteritems(this);
        for (let i in util.range(0, sh.count)) {
            obj[i] = { index: i, __proto__: sh.getEntryAtIndex(i, false) };
            util.memoize(obj[i], "icon",
                function (obj) services.get("favicon").getFaviconImageForPage(obj.URI).spec);
        }
        return obj;
    },

    // TODO: better names
    stepTo: function stepTo(steps) {
        let start = 0;
        let end = window.getWebNavigation().sessionHistory.count - 1;
        let current = window.getWebNavigation().sessionHistory.index;

        if (current == start && steps < 0 || current == end && steps > 0)
            liberator.beep();
        else {
            let index = util.Math.constrain(current + steps, start, end);
            window.getWebNavigation().gotoIndex(index);
        }
    },

    goToStart: function goToStart() {
        let index = window.getWebNavigation().sessionHistory.index;

        if (index > 0)
            window.getWebNavigation().gotoIndex(0);
        else
            liberator.beep();

    },

    goToEnd: function goToEnd() {
        let sh = window.getWebNavigation().sessionHistory;
        let max = sh.count - 1;

        if (sh.index < max)
            window.getWebNavigation().gotoIndex(max);
        else
            liberator.beep();

    },

    // if openItems is true, open the matching history items in tabs rather than display
    list: function list(filter, openItems, maxItems) {
        // FIXME: returning here doesn't make sense
        //   Why the hell doesn't it make sense? --Kris
        // See comment at bookmarks.list --djk
        if (!openItems)
            return completion.listCompleter("history", filter, maxItems, null, null, CompletionContext.Filter.textAndDescription);
        let items = completion.runCompleter("history", filter, maxItems, null, null, CompletionContext.Filter.textAndDescription);

        if (items.length)
            return liberator.open(items.map(function (i) i.url), liberator.NEW_TAB);

        if (filter.length > 0)
            liberator.echoerr("No matching history items for: " + filter);
        else
            liberator.echoerr("No history set");
        return null;
    }
}, {
}, {
    commands: function () {
        commands.add(["ba[ck]"],
            "Go back in the browser history",
            function (args) {
                let url = args.literalArg;

                if (args.bang)
                    history.goToStart();
                else {
                    if (url) {
                        let sh = history.session;
                        if (/^\d+(:|$)/.test(url) && sh.index - parseInt(url) in sh)
                            return void window.getWebNavigation().gotoIndex(sh.index - parseInt(url));

                        for (let [i, ent] in Iterator(sh.slice(0, sh.index).reverse()))
                            if (ent.URI.spec == url)
                                return void window.getWebNavigation().gotoIndex(i);
                        liberator.echoerr("URL not found in history: " + url);
                    }
                    else
                        history.stepTo(-Math.max(args.count, 1));
                }
                return null;
            },
            {
                argCount: "?",
                bang: true,
                completer: function completer(context) {
                    let sh = history.session;

                    context.anchored = false;
                    context.compare = CompletionContext.Sort.unsorted;
                    context.filters = [CompletionContext.Filter.textDescription];
                    context.completions = sh.slice(0, sh.index).reverse();
                    context.keys = { text: function (item) (sh.index - item.index) + ": " + item.URI.spec, description: "title", icon: "icon" };
                },
                count: true,
                literal: 0
            });

        commands.add(["fo[rward]", "fw"],
            "Go forward in the browser history",
            function (args) {
                let url = args.literalArg;

                if (args.bang)
                    history.goToEnd();
                else {
                    if (url) {
                        let sh = history.session;
                        if (/^\d+(:|$)/.test(url) && sh.index + parseInt(url) in sh)
                            return void window.getWebNavigation().gotoIndex(sh.index + parseInt(url));

                        for (let [i, ent] in Iterator(sh.slice(sh.index + 1)))
                            if (ent.URI.spec == url)
                                return void window.getWebNavigation().gotoIndex(i);
                        liberator.echoerr("URL not found in history: " + url);
                    }
                    else
                        history.stepTo(Math.max(args.count, 1));
                }
                return null;
            },
            {
                argCount: "?",
                bang: true,
                completer: function completer(context) {
                    let sh = history.session;

                    context.anchored = false;
                    context.compare = CompletionContext.Sort.unsorted;
                    context.filters = [CompletionContext.Filter.textDescription];
                    context.completions = sh.slice(sh.index + 1);
                    context.keys = { text: function (item) (item.index - sh.index) + ": " + item.URI.spec, description: "title", icon: "icon" };
                },
                count: true,
                literal: 0
            });

        commands.add(["hist[ory]", "hs"],
            "Show recently visited URLs",
            function (args) { 
                if (args["-remove"]) {
                    let items = completion.runCompleter("history", args.join(" "), args["-max"] || 1000);
                    if (items.length == 0)
                        liberator.echoerr("No matching history items for: " + args.join(" "));
                    else {
                        var browserHistory = Components.classes["@mozilla.org/browser/nav-history-service;1"]
                                            .getService(Components.interfaces.nsIBrowserHistory);
                        var urls = [];
                        items.map(function (i) { urls.push(makeURI(i.url)) });
                        browserHistory.removePages(urls, urls.length);
                        if (urls.length == 1)
                            liberator.echo("Removed history item " + urls[0].spec);
                        else
                            liberator.echo("Removed " + urls.length + " history items matching " + args.join(" "));
                    }
                } else 
                    history.list(args.join(" "), args.bang, args["-max"] || 1000);
            }, {
                bang: true,
                completer: function (context, args) {
                    context.filter = args.join(" ");
                    context.filters = [CompletionContext.Filter.textAndDescription];
                    context.quote = null;
                    completion.history(context);
                },
                options: [[["-max", "-m"], commands.OPTION_INT],
                          [["-remove", "-r"], commands.OPTION_NOARG]]
            });
    },
    completion: function () {
        completion.history = function _history(context, maxItems) {
            context.format = history.format;
            context.title = ["History"];
            context.compare = CompletionContext.Sort.unsorted;
            if (context.maxItems == null)
                context.maxItems = 100;
            context.regenerate = true;
            context.generate = function () history.get(context.filter, this.maxItems);
        };

        completion.addUrlCompleter("h", "History", completion.history);
    },
    mappings: function () {
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
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
