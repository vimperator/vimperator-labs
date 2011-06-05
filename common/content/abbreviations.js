// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
// Copyright (c) 2010 by anekos <anekos@snca.net>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

const Abbreviation = Class("Abbreviation", {
    init: function (modes, lhs, rhs) {
        this.modes = modes;
        this.lhs = lhs;
        this.rhs = rhs;
    },

    equals: function (other) {
        return this.lhs == other.lhs && this.rhs == other.rhs;
    },

    modesEqual: function (modes) {
        return (modes.length === this.modes.length) &&
               (this.modes.every(function (m1) modes.some(function (m2) m1 === m2)));
    },

    get text() (this.rhs instanceof Function ? this.rhs() : this.rhs).toString(),

    inMode: function (mode) {
        return this.modes.some(function (_mode) _mode == mode);
    },

    inModes: function (modes) {
        let self = this;
        return modes.some(function (mode) self.inMode(mode));
    },

    removeMode: function (mode) {
        this.modes = this.modes.filter(function (m) m != mode);
    },

    get modeChar() Abbreviation.modeChar(this.modes)
}, {
    modeChar: function (_modes) {
        let result = "";
        for ([, mode] in Iterator(_modes))
            result += modes.getMode(mode).char;
        if (/^(ic|ci)$/.test(result))
            result = "!";
        return result;
    }
});

const Abbreviations = Module("abbreviations", {
    requires: ["config", "modes"],

    init: function () {
        this.abbrevs = {};

        // (summarized from Vim's ":help abbreviations")
        //
        // There are three types of abbreviations.
        //
        // full-id: Consists entirely of keyword characters.
        //          ("foo", "g3", "-1")
        //
        // end-id: Ends in a keyword character, but all other
        //         are not keyword characters.
        //         ("#i", "..f", "$/7")
        //
        // non-id: Ends in a non-keyword character, but the
        //         others can be of any type other than space
        //         and tab.
        //         ("def#", "4/7$")
        //
        // Example strings that cannot be abbreviations:
        //         "a.b", "#def", "a b", "_$r"
        //
        // For now, a keyword character is anything except for \s, ", or '
        // (i.e., whitespace and quotes). In Vim, a keyword character is
        // specified by the 'iskeyword' setting and is a much less inclusive
        // list.
        //
        // TODO: Make keyword definition closer to Vim's default keyword
        //       definition (which differs across platforms).

        let nonkw = "\\s\"'";
        let keyword = "[^" + nonkw + "]";
        let nonkeyword = "[" + nonkw + "]";

        let fullId = keyword + "+";
        let endId = nonkeyword + "+" + keyword;
        let nonId = "\\S*" + nonkeyword;

        // Used in add and expand
        this._match = fullId + "|" + endId + "|" + nonId;
    },

    /**
     * Adds a new abbreviation.
     *
     * @param {Abbreviation}
     * @returns {Abbreviation}
     */
    add: function (abbr) {
        if (!(abbr instanceof Abbreviation))
            abbr = Abbreviation.apply(null, arguments);

        for (let [, mode] in Iterator(abbr.modes)) {
            if (!this.abbrevs[mode])
                this.abbrevs[mode] = {};
            this.abbrevs[mode][abbr.lhs] = abbr;
        }

        return abbr;
    },

    /**
     * Returns matched abbreviation.
     *
     * @param {mode}
     * @param {string}
     */
    get: function (mode, lhs) {
        let abbrevs = this.abbrevs[mode];
        return abbrevs && abbrevs.hasOwnProperty(lhs) && abbrevs.propertyIsEnumerable(lhs) && abbrevs[lhs];
    },

    /**
     * The list of the abbreviations merged from each modes.
     */
    get merged() {
        let result = [];
        let lhses = [];
        let modes = [mode for (mode in this.abbrevs)];

        for (let [, mabbrevs] in Iterator(this.abbrevs))
            lhses = lhses.concat([key for (key in mabbrevs)]);
        lhses.sort();
        lhses = util.Array.uniq(lhses);

        for (let [, lhs] in Iterator(lhses)) {
            let exists = {};
            for (let [, mabbrevs] in Iterator(this.abbrevs)) {
                let abbr = mabbrevs[lhs];
                if (abbr && !exists[abbr.rhs]) {
                    exists[abbr.rhs] = 1;
                    result.push(abbr);
                }
            }
        }

        return result;
    },

    /**
     * Lists all abbreviations matching <b>modes</b> and <b>lhs</b>.
     *
     * @param {Array} list of mode.
     * @param {string} lhs The LHS of the abbreviation.
     */
    list: function (modes, lhs) {
        let list = this.merged.filter(function (abbr) (abbr.inModes(modes) && abbr.lhs.indexOf(lhs) == 0));

        if (!list.length)
            liberator.echomsg("No abbreviations found");
        else if (list.length == 1) {
            let head = list[0];
            liberator.echo(head.modeChar + "  " + head.lhs + "   " + head.rhs, commandline.FORCE_SINGLELINE); // 2 spaces, 3 spaces
        }
        else {
            list = list.map(function (abbr) [abbr.modeChar, abbr.lhs, abbr.rhs]);
            list = template.tabular([{ header: "Mode", style: "padding-left: 1ex"}, { header: "Abbreviation", highlight: "Mapping"}, "Expanded text"], list);
            commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
        }
    },

    /**
     * Remove the specified abbreviations.
     *
     * @param {Array} list of mode.
     * @param {string} lhs of abbreviation.
     * @returns {boolean} did the deleted abbreviation exist?
     */
    remove: function (modes, lhs) {
        let result = false;
        for (let [, mode] in Iterator(modes)) {
            if ((mode in this.abbrevs) && (lhs in this.abbrevs[mode])) {
                result = true;
                this.abbrevs[mode][lhs].removeMode(mode);
                delete this.abbrevs[mode][lhs];
            }
        }
        return result;
    },

    /**
     * Removes all abbreviations specified <b>modes<b>.
     *
     * @param {Array} list of mode.
     */
    removeAll: function (modes) {
        for (let [, mode] in modes) {
            if (!(mode in this.abbrevs))
                return;
            for (let [, abbr] in this.abbrevs[mode])
                abbr.removeMode(mode);
            delete this.abbrevs[mode];
        }
    }
}, {
}, {
    completion: function () {
        // TODO: shouldn't all of these have a standard signature (context, args, ...)? --djk
        completion.abbreviation = function abbreviation(context, args, modes) {
            if (args.completeArg == 0) {
                let abbrevs = abbreviations.merged.filter(function (abbr) abbr.inModes(modes));
                context.completions = [[abbr.lhs, abbr.rhs] for ([, abbr] in Iterator(abbrevs))];
            }
        };
    },

    commands: function () {
        function addAbbreviationCommands(modes, ch, modeDescription) {
            function splitArg (arg) {
                return arg.match(RegExp("^\\s*($|" + abbreviations._match + ")(?:\\s*$|\\s+(.*))"));
            }

            modeDescription = modeDescription ? " in " + modeDescription + " mode" : "";

            commands.add([ch ? ch + "a[bbrev]" : "ab[breviate]"],
                "Abbreviate a key sequence" + modeDescription,
                function (args) {
                    let matches = splitArg(args.literalArg);

                    liberator.assert(matches, "Invalid argument: " + args.literalArg);

                    let [, lhs, rhs] = matches;
                    if (rhs) {
                        if (args["-javascript"]) {
                            let expr = rhs;
                            rhs = function () liberator.eval(expr);
                            rhs.toString = function () expr;
                        }
                        abbreviations.add(modes, lhs, rhs);
                    }
                    else {
                        abbreviations.list(modes, lhs || "");
                    }
                }, {
                    options: [[["-javascript", "-j"], commands.OPTION_NOARG, null]],
                    completer: function (context, args) {
                        let [, lhs, rhs] = splitArg(args.literalArg);
                        if (rhs && args["-javascript"])
                            return completion.javascript(context);
                        completion.abbreviation(context, args, modes)
                    },
                    literal: 0,
                    serial: function () [ {
                            command: this.name,
                            arguments: [abbr.lhs],
                            literalArg: abbr.rhs,
                            options: abbr.rhs instanceof Function ? {"-javascript": null} : {}
                        }
                        for ([, abbr] in Iterator(abbreviations.merged))
                        if (abbr.modesEqual(modes))
                    ]
                });

            commands.add([ch ? ch + "una[bbrev]" : "una[bbreviate]"],
                "Remove an abbreviation" + modeDescription,
                function (args) {
                    let lhs = args.literalArg;
                    if (!lhs)
                        return liberator.echoerr("Invalid argument");
                    if (!abbreviations.remove(modes, lhs))
                        return liberator.echoerr("No such abbreviation: " + lhs);
                }, {
                    argCount: "1",
                    completer: function (context, args) completion.abbreviation(context, args, modes),
                    literal: 0
                });

            commands.add([ch + "abc[lear]"],
                "Remove all abbreviations" + modeDescription,
                function () { abbreviations.removeAll(modes); },
                { argCount: "0" });
        }

        addAbbreviationCommands([modes.INSERT, modes.COMMAND_LINE], "", "");
        addAbbreviationCommands([modes.INSERT], "i", "insert");
        addAbbreviationCommands([modes.COMMAND_LINE], "c", "command line");
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
