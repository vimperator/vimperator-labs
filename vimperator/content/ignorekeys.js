// Copyright (c) 2012 by Martin Stubenschrott <stubenschrott AT vimperator>

// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


const IgnoreKeys = Module("ignoreKeys", {
    requires: ["config", "storage"],

    init: function init() {
        this._ignoredKeys = storage.newMap("ignored-keys", { store: true, privateData: true });
    },

    add: function add(filter, exceptions) {
        if (!exceptions)
            exceptions = [];
        // TODO: Add a regular expression cache somewhere?
        this._ignoredKeys.set(filter, exceptions);
    },

    get: function get(filter) {
        let filtered = [];
        for (let [page, exceptions] in this._ignoredKeys) {
            if (!filter || page.indexOf(filter) >= 0)
                filtered.push([page, exceptions]);
        }

        return filtered;
    },

    hasIgnoredKeys: function isKeyIgnored(url) {
        for (let [page, exceptions] in this._ignoredKeys) {
            let re = RegExp(page);
            if (re.test(url))
                return exceptions;
        }
        return null;
    },

    isKeyIgnored: function isKeyIgnored(url, key) {
        // Don't cripple Vimperator ;) Later this will be part of a new "unignorekeys" option
        if (key === ":")
            return false;

        for (let [page, exceptions] in this._ignoredKeys) {
            let re = RegExp(page);
            if (re.test(url) && exceptions.indexOf(key) < 0)
                return true;
        }
        return false;
    },

    remove: function remove(filter) {
        if (!filter) {
            liberator.echoerr("Invalid filter");
            return;
        }

        for (let [page, ] in this._ignoredKeys) {
            if (filter === page)
                this._ignoredKeys.remove(page);
        }
    },

    clear: function clear() {
        this._ignoredKeys.clear();
    }

}, {
}, {
    mappings: function () {
        mappings.add([modes.NORMAL], ["I"],
            "Open an :ignorekeys prompt for the current domain or URL",
            function (count) {
                commandline.open("", "ignorekeys add ", modes.EX);
            },
            { count: false });
    },

    commands: function () {
        commands.add(["ignore[keys]"],
            "Ignore all (or most) " + config.name + " keys for certain URLs",
            function (args) {
                // Without argument, list current pages with ignored keys
                completion.listCompleter("ignorekeys");
            }, {
                subCommands: [
                    new Command(["add"], "Add an URL filter to the list of ignored keys",
                        function (args) { ignoreKeys.add(args[0], args["-except"] || []); },
                        {
                            argCount: "1",
                            options: [
                                [["-except", "-e"],  commands.OPTION_LIST, null, null],
                            ],
                            completer: function (context, args) {
                                let completions = [];
                                if (args.completeArg === 0) {
                                    if (buffer.URL)
                                        completions.unshift([util.escapeRegex(buffer.URL), "Current URL"]);
                                    if (content.document && content.document.domain)
                                        completions.unshift([util.escapeRegex(content.document.domain), "Current domain"]);
                                }

                                context.compare = CompletionContext.Sort.unsorted;
                                context.completions = completions;
                            }
                        }),

                    new Command(["clear"], "Clear all ignored pages",
                        function (args) { ignoreKeys.clear(); },
                        { argCount: 0 }),

                    new Command(["list", "ls"], "List pages with ignored keys",
                        function (args) {
                            let res = ignoreKeys.get(args.literalArg || "");
                            if (res.length === undefined || res.length === 0) {
                                if (!args.literalArg)
                                    liberator.echomsg("No ignored keys");
                                else
                                    liberator.echomsg("No ignored keys for pages matching " + args.literalArg);
                                return;
                            }

                            completion.listCompleter("ignorekeys", args.literalArg || "");
                        },
                        {
                            argCount: "?",
                            literal: 0
                        }),

                    new Command(["remove", "rm"], "Remove an URL filter from the list of ignored keys",
                        function (args) { ignoreKeys.remove(args.literalArg || ""); },
                        {
                            argCount: 1,
                            literal: 0,
                            completer: function (context, args) completion.ignorekeys(context, args.literalArg || ""),
                        })
                ]
            });
    },

    completion: function () {
        completion.ignorekeys = function (context) {
            context.title = ["URL filter", "Ignored keys"];
            context.anchored = false; // match the filter anywhere
            context.completions = ignoreKeys.get();
        };
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
