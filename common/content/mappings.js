// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
// Copyright (c) 2007-2009 by Doug Kearns <dougkearns@gmail.com>
// Copyright (c) 2008-2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

/**
 * A class representing key mappings. Instances are created by the
 * {@link Mappings} class.
 *
 * @param {number[]} modes The modes in which this mapping is active.
 * @param {string[]} keys The key sequences which are bound to
 *     <b>action</b>.
 * @param {string} description A short one line description of the key mapping.
 * @param {function} action The action invoked by each key sequence.
 * @param {Object} extraInfo An optional extra configuration hash. The
 *     following properties are supported.
 *         arg          - see {@link Map#arg}
 *         count        - see {@link Map#count}
 *         motion       - see {@link Map#motion}
 *         route        - see {@link Map#route}
 *         noremap      - see {@link Map#noremap}
 *         rhs          - see {@link Map#rhs}
 *         silent       - see {@link Map#silent}
 *         matchingUrls - see {@link Map#matchingUrls}
 * @optional
 * @private
 */
const Map = Class("Map", {
    init: function (modes, keys, description, action, extraInfo) {
        modes = Array.concat(modes).map(function (m) isobject(m) ? m.mask : m);

        this.modes = modes;
        this.names = keys.map(events.canonicalKeys);
        this.action = action;
        this.description = description;

        if (extraInfo)
            update(this, extraInfo);

        if (this.matchingUrls)
            this.matchingUrls = this.matchingUrls instanceof RegExp ? this.matchingUrls
                                                                    : RegExp(this.matchingUrls);
    },

    /** @property {number[]} All of the modes for which this mapping applies. */
    modes: null,
    /** @property {string[]} All of this mapping's names (key sequences). */
    names: null,
    /** @property {function (number)} The function called to execute this mapping. */
    action: null,
    /** @property {string} This mapping's description, as shown in :viusage. */
    description: "",

    /** @property {boolean} Whether this mapping accepts an argument. */
    arg: false,
    /** @property {boolean} Whether this mapping accepts a count. */
    count: false,
    /**
     * @property {boolean} Whether the mapping accepts a motion mapping
     *     as an argument.
     */
    motion: false,
    /**
     * @property {boolean} Whether the mapping's key events should be
     *     propagated to the host application.
     */
    // TODO: I'm not sure this is the best name but it reflects that which it replaced. --djk
    route: false,
    /** @property {boolean} Whether the RHS of the mapping should expand mappings recursively. */
    noremap: false,
    /** @property {boolean} Whether any output from the mapping should be echoed on the command line. */
    silent: false,
    /** @property {string} The literal RHS expansion of this mapping. */
    rhs: null,
    /** @property {RegExp} URL matching pattern for URL local mapping. */
    matchingUrls: null,
    /**
     * @property {boolean} Specifies whether this is a user mapping. User
     *     mappings may be created by plugins, or directly by users. Users and
     *     plugin authors should create only user mappings.
     */
    user: false,

    /**
     * Returns whether this mapping can be invoked by a key sequence matching
     * <b>name</b>.
     *
     * @param {string} name The name to query.
     * @returns {boolean}
     */
    hasName: function (name) this.names.indexOf(name) >= 0,

    /**
     * Execute the action for this mapping.
     *
     * @param {string} motion The motion argument if accepted by this mapping.
     *     E.g. "w" for "dw"
     * @param {number} count The associated count. E.g. "5" for "5j"
     * @default -1
     * @param {string} argument The normal argument if accepted by this
     *     mapping. E.g. "a" for "ma"
     */
    execute: function (motion, count, argument) {
        let args = [];

        if (this.motion)
            args.push(motion);
        if (this.count)
            args.push(count);
        if (this.arg)
            args.push(argument);

        let self = this;
        function repeat() self.action.apply(self, args);
        if (this.names[0] != ".") // FIXME: Kludge.
            mappings.repeat = repeat;

        return liberator.trapErrors(repeat);
    }

});

/**
 * @instance mappings
 */
const Mappings = Module("mappings", {
    requires: ["modes"],

    init: function () {
        this._main = []; // default mappings
        this._user = []; // user created mappings
    },

    _matchingUrlsTest: function (map, patternOrUrl) {
        if (!patternOrUrl)
            return !map.matchingUrls;
        if (patternOrUrl instanceof RegExp)
            return map.matchingUrls && (patternOrUrl.toString() == map.matchingUrls.toString());
        return !map.matchingUrls || map.matchingUrls.test(patternOrUrl);
    },

    _addMap: function (map) {
        let where = map.user ? this._user : this._main;
        map.modes.forEach(function (mode) {
            if (!(mode in where))
                where[mode] = [];
            // URL local mappings should be searched first.
            where[mode][map.matchingUrls ? 'unshift' : 'push'](map);
        });
    },

    _getMap: function (mode, cmd, patternOrUrl, stack) {
        let maps = stack[mode] || [];

        for (let [, map] in Iterator(maps)) {
            if (map.hasName(cmd) && this._matchingUrlsTest(map, patternOrUrl))
                return map;
        }

        return null;
    },

    _removeMap: function (mode, cmd, patternOrUrl) {
        let maps = this._user[mode] || [];
        let names;

        for (let [i, map] in Iterator(maps)) {
            if (!this._matchingUrlsTest(map, patternOrUrl))
                continue;
            for (let [j, name] in Iterator(map.names)) {
                if (name == cmd) {
                    map.names.splice(j, 1);
                    if (map.names.length == 0)
                        maps.splice(i, 1);
                    return;
                }
            }
        }
    },

    _expandLeader: function (keyString) keyString.replace(/<Leader>/i, mappings.getMapLeader()),

    // Return all mappings present in all @modes
    _mappingsIterator: function (modes, stack) {
        modes = modes.slice();
        return (map for ([i, map] in Iterator(stack[modes.shift()]))
            if (modes.every(function (mode) stack[mode].some(
                        function (m) m.rhs == map.rhs && m.names[0] == map.names[0]))))
    },

    // NOTE: just normal mode for now
    /** @property {Iterator(Map)} @private */
    __iterator__: function () this._mappingsIterator([modes.NORMAL], this._main),

    // used by :mkvimperatorrc to save mappings
    /**
     * Returns a user-defined mappings iterator for the specified
     * <b>mode</b>.
     *
     * @param {number} mode The mode to return mappings from.
     * @returns {Iterator(Map)}
     */
    getUserIterator: function (mode) this._mappingsIterator(mode, this._user),

    addMode: function (mode) {
        if (!(mode in this._user || mode in this._main)) {
            this._main[mode] = [];
            this._user[mode] = [];
        }
    },

    /**
     * Adds a new default key mapping.
     *
     * @param {number[]} modes The modes that this mapping applies to.
     * @param {string[]} keys The key sequences which are bound to
     *     <b>action</b>.
     * @param {string} description A description of the key mapping.
     * @param {function} action The action invoked by each key sequence.
     * @param {Object} extra An optional extra configuration hash.
     * @optional
     */
    add: function (modes, keys, description, action, extra) {
        this._addMap(Map(modes, keys, description, action, extra));
    },

    /**
     * Adds a new user-defined key mapping.
     *
     * @param {number[]} modes The modes that this mapping applies to.
     * @param {string[]} keys The key sequences which are bound to
     *     <b>action</b>.
     * @param {string} description A description of the key mapping.
     * @param {function} action The action invoked by each key sequence.
     * @param {Object} extra An optional extra configuration hash (see
     *     {@link Map#extraInfo}).
     * @optional
     */
    addUserMap: function (modes, keys, description, action, extra) {
        keys = keys.map(this._expandLeader);
        extra = extra || {};
        extra.user = true;
        let map = Map(modes, keys, description || "User defined mapping", action, extra);

        // remove all old mappings to this key sequence
        for (let [, name] in Iterator(map.names)) {
            for (let [, mode] in Iterator(map.modes))
                this._removeMap(mode, name, map.matchingUrls);
        }

        this._addMap(map);
    },

    /**
     * Returns the map from <b>mode</b> named <b>cmd</b>.
     *
     * @param {number} mode The mode to search.
     * @param {string} cmd The map name to match.
     * @param {RegExp|string} URL matching pattern or URL.
     * @returns {Map}
     */
    get: function (mode, cmd, patternOrUrl) {
        mode = mode || modes.NORMAL;
        return this._getMap(mode, cmd, patternOrUrl, this._user) || this._getMap(mode, cmd, patternOrUrl, this._main);
    },

    /**
     * Returns the default map from <b>mode</b> named <b>cmd</b>.
     *
     * @param {number} mode The mode to search.
     * @param {string} cmd The map name to match.
     * @param {RegExp|string} URL matching pattern or URL.
     * @returns {Map}
     */
    getDefault: function (mode, cmd, patternOrUrl) {
        mode = mode || modes.NORMAL;
        return this._getMap(mode, cmd, patternOrUrl, this._main);
    },

    /**
     * Returns an array of maps with names starting with but not equal to
     * <b>prefix</b>.
     *
     * @param {number} mode The mode to search.
     * @param {string} prefix The map prefix string to match.
     * @param {string} URL or URL matching pattern
     * @param {RegExp|string} URL matching pattern or URL.
     * @returns {Map[]}
     */
    getCandidates: function (mode, prefix, patternOrUrl) {
        let mappings = this._user[mode].concat(this._main[mode]);
        let matches = [];

        for (let [, map] in Iterator(mappings)) {
            if (!this._matchingUrlsTest(map, patternOrUrl))
                continue;
            for (let [, name] in Iterator(map.names)) {
                if (name.indexOf(prefix) == 0 && name.length > prefix.length) {
                    // for < only return a candidate if it doesn't look like a <c-x> mapping
                    if (prefix != "<" || !/^<.+>/.test(name))
                        matches.push(map);
                }
            }
        }

        return matches;
    },

    /*
     * Returns the map leader string used to replace the special token
     * "<Leader>" when user mappings are defined.
     *
     * @returns {string}
     */
    // FIXME: property
    getMapLeader: function () {
        let leaderRef = liberator.variableReference("mapleader");
        return leaderRef[0] ? leaderRef[0][leaderRef[1]] : "\\";
    },

    /**
     * Returns whether there is a user-defined mapping <b>cmd</b> for the
     * specified <b>mode</b>.
     *
     * @param {number} mode The mode to search.
     * @param {string} cmd The candidate key mapping.
     * @param {regexpr/string} cmd The candidate key mapping.
     * @returns {boolean}
     */
    hasMap:
        function (mode, cmd, patternOrUrl)
            let (self = this)
                this._user[mode].some(function (map) map.hasName(cmd) && self._matchingUrlsTest(map, patternOrUrl)),

    /**
     * Remove the user-defined mapping named <b>cmd</b> for <b>mode</b>.
     *
     * @param {number} mode The mode to search.
     * @param {string} cmd The map name to match.
     */
    remove: function (mode, cmd) {
        this._removeMap(mode, cmd);
    },

    /**
     * Remove all user-defined mappings for <b>mode</b>.
     *
     * @param {number} mode The mode to remove all mappings from.
     */
    removeAll: function (mode) {
        this._user[mode] = [];
    },

    /**
     * Lists all user-defined mappings matching <b>filter</b> for the
     * specified <b>modes</b>.
     *
     * @param {number[]} modes An array of modes to search.
     * @param {string} filter The filter string to match.
     */
    list: function (modes, filter) {
        let modeSign = "";

        // TODO: Vim hides "nv" in a :map and "v" and "n" in :vmap and
        //       :nmap respectively if the map is not exclusive.
        modes.forEach(function (mode) {
            for (let m in modules.modes.mainModes)
                if (mode == m.mask && modeSign.indexOf(m.char) == -1)
                    modeSign += m.char;
        });

        let maps = this._mappingsIterator(modes, this._user);
        if (filter)
            maps = [map for (map in maps) if (map.names[0] == filter)];

        let list = <table>
                {
                    template.map(maps, function (map)
                        template.map(map.names, function (name)
                        <tr>
                            <td>{modeSign} {name}</td>
                            <td>{map.noremap ? "*" : " "}</td>
                            <td>{map.rhs || "function () { ... }"}</td>
                        </tr>))
                }
                </table>;

        // TODO: Move this to an ItemList to show this automatically
        if (list.*.length() == list.text().length()) {
            liberator.echomsg("No mapping found");
            return;
        }
        commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
    }
}, {
}, {
    commands: function () {
        function addMapCommands(ch, modes, modeDescription) {
            // 0 args -> list all maps
            // 1 arg  -> list the maps starting with args
            // 2 args -> map arg1 to arg*
            function map(args, modes, noremap) {
                if (!args.length) {
                    mappings.list(modes);
                    return;
                }

                let [lhs, rhs] = args;

                if (!rhs) // list the mapping
                    mappings.list(modes, mappings._expandLeader(lhs));
                else {
                    // this matches Vim's behaviour
                    if (/^<Nop>$/i.test(rhs))
                        noremap = true;

                    mappings.addUserMap(modes, [lhs],
                        "User defined mapping",
                        function (count) { events.feedkeys((count || "") + this.rhs, this.noremap, this.silent); },
                        {
                            count: true,
                            rhs: events.canonicalKeys(rhs),
                            noremap: !!noremap,
                            silent: "<silent>" in args,
                            matchingUrls: args["-urls"]
                        });
                }
            }

            modeDescription = modeDescription ? " in " + modeDescription + " mode" : "";

            // :map, :noremap => NORMAL + VISUAL modes
            function isMultiMode(map, cmd) {
                return map.modes.indexOf(modules.modes.NORMAL) >= 0
                    && map.modes.indexOf(modules.modes.VISUAL) >= 0
                    && /^[nv](nore)?map$/.test(cmd);
            }

            function regexpValidator(expr) {
                try {
                    RegExp(expr);
                    return true;
                }
                catch (e) {}
                return false;
            }

            const opts = {
                    completer: function (context, args) completion.userMapping(context, args, modes),
                    options: [
                        [["<silent>", "<Silent>"],  commands.OPTION_NOARG],
                        [["-urls", "-u"],  commands.OPTION_STRING, regexpValidator],
                    ],
                    literal: 1,
                    serial: function () {
                        function options (map) {
                            let opts = {};
                            if (map.silent)
                                opts["<silent>"] = null;
                            if (map.matchingUrls)
                                opts["-urls"] = map.matchingUrls.source;
                            return opts;
                        }

                        let noremap = this.name.indexOf("noremap") > -1;
                        return [
                            {
                                command: this.name,
                                options: options(map),
                                arguments: [map.names[0]],
                                literalArg: map.rhs
                            }
                            for (map in mappings._mappingsIterator(modes, mappings._user))
                            if (map.rhs && map.noremap == noremap && !isMultiMode(map, this.name))
                        ];
                    }
            };

            commands.add([ch ? ch + "m[ap]" : "map"],
                "Map a key sequence" + modeDescription,
                function (args) { map(args, modes, false); },
                opts);

            commands.add([ch + "no[remap]"],
                "Map a key sequence without remapping keys" + modeDescription,
                function (args) { map(args, modes, true); },
                opts);

            commands.add([ch + "mapc[lear]"],
                "Remove all mappings" + modeDescription,
                function () { modes.forEach(function (mode) { mappings.removeAll(mode); }); },
                { argCount: "0" });

            commands.add([ch + "unm[ap]"],
                "Remove a mapping" + modeDescription,
                function (args) {
                    args = args[0];

                    let found = false;
                    for (let [, mode] in Iterator(modes)) {
                        if (mappings.hasMap(mode, args)) {
                            mappings.remove(mode, args);
                            found = true;
                        }
                    }
                    if (!found)
                        liberator.echoerr("E31: No such mapping");
                },
                {
                    argCount: "1",
                    completer: function (context, args) completion.userMapping(context, args, modes)
                });
        }

        addMapCommands("",  [modes.NORMAL, modes.VISUAL], "");

        for (let mode in modes.mainModes)
            if (mode.char && !commands.get(mode.char + "map"))
                addMapCommands(mode.char,
                               [m.mask for (m in modes.mainModes) if (m.char == mode.char)],
                               [mode.disp.toLowerCase()]);
    },
    completion: function () {
        JavaScript.setCompleter(this.get,
            [
                null,
                function (context, obj, args) {
                    let mode = args[0];
                    return util.Array.flatten(
                    [
                        [[name, map.description] for ([i, name] in Iterator(map.names))]
                        for ([i, map] in Iterator(mappings._user[mode].concat(mappings._main[mode])))
                    ]);
                }
            ]);

        completion.userMapping = function userMapping(context, args, modes) {
            // FIXME: have we decided on a 'standard' way to handle this clash? --djk
            modes = modes || [modules.modes.NORMAL];

            if (args.completeArg == 0) {
                let maps = [[m.names[0], ""] for (m in mappings.getUserIterator(modes))];
                context.completions = maps;
            }
        };
    },
    modes: function () {
        for (let mode in modes) {
            this._main[mode] = [];
            this._user[mode] = [];
        }
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
