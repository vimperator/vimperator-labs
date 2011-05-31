// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/**
 * @scope modules
 * @instance marks
 */
const Marks = Module("marks", {
    requires: ["config", "storage"],

    init: function init() {
        this._localMarks = storage.newMap("local-marks", { store: true, privateData: true });
        this._urlMarks = storage.newMap("url-marks", { store: false, privateData: true });

        this._pendingJumps = [];
    },

    /**
     * @property {Array} Returns all marks, both local and URL, in a sorted
     *     array.
     */
    get all() {
        // local marks
        let location = window.content.location.href;
        let lmarks = [i for (i in this._localMarkIter()) if (i[1].location == location)];
        lmarks.sort();

        // URL marks
        // FIXME: why does umarks.sort() cause a "Component is not available =
        // NS_ERROR_NOT_AVAILABLE" exception when used here?
        let umarks = [i for (i in this._urlMarks)];
        umarks.sort(function (a, b) a[0].localeCompare(b[0]));

        return lmarks.concat(umarks);
    },

    /**
     * Add a named mark for the current buffer, at its current position.
     * If mark matches [A-Z], it's considered a URL mark, and will jump to
     * the same position at the same URL no matter what buffer it's
     * selected from. If it matches [a-z'"], it's a local mark, and can
     * only be recalled from a buffer with a matching URL.
     *
     * @param {string} mark The mark name.
     * @param {boolean} silent Whether to output informative messages.
     */
    // TODO: add support for frameset pages
    add: function (mark, silent) {
        let win = window.content;
        let doc = win.document;

        if (!doc.body)
            return;
        if (doc.body instanceof HTMLFrameSetElement) {
            if (!silent)
                liberator.echoerr("Marks support for frameset pages not implemented yet");
            return;
        }

        let x = win.scrollMaxX ? win.pageXOffset / win.scrollMaxX : 0;
        let y = win.scrollMaxY ? win.pageYOffset / win.scrollMaxY : 0;
        let position = { x: x, y: y };

        if (Marks.isURLMark(mark)) {
            this._urlMarks.set(mark, { location: win.location.href, position: position, tab: tabs.getTab() });
            if (!silent)
                liberator.echomsg("Added URL mark: " + Marks.markToString(mark, this._urlMarks.get(mark)));
        }
        else if (Marks.isLocalMark(mark)) {
            // remove any previous mark of the same name for this location
            this._removeLocalMark(mark);
            if (!this._localMarks.get(mark))
                this._localMarks.set(mark, []);
            let vals = { location: win.location.href, position: position };
            this._localMarks.get(mark).push(vals);
            if (!silent)
                liberator.echomsg("Added local mark: " + Marks.markToString(mark, vals));
        }
    },

    /**
     * Remove all marks matching <b>filter</b>. If <b>special</b> is
     * given, removes all local marks.
     *
     * @param {string} filter A string containing one character for each
     *     mark to be removed.
     * @param {boolean} special Whether to delete all local marks.
     */
    // FIXME: Shouldn't special be replaced with a null filter?
    remove: function (filter, special) {
        if (special) {
            // :delmarks! only deletes a-z marks
            for (let [mark, ] in this._localMarks)
                this._removeLocalMark(mark);
        }
        else {
            for (let [mark, ] in this._urlMarks) {
                if (filter.indexOf(mark) >= 0)
                    this._removeURLMark(mark);
            }
            for (let [mark, ] in this._localMarks) {
                if (filter.indexOf(mark) >= 0)
                    this._removeLocalMark(mark);
            }
        }
    },

    /**
     * Jumps to the named mark. See {@link #add}
     *
     * @param {string} mark The mark to jump to.
     */
    jumpTo: function (mark) {
        let ok = false;

        if (Marks.isURLMark(mark)) {
            let slice = this._urlMarks.get(mark);
            if (slice && slice.tab && slice.tab.linkedBrowser) {
                if (slice.tab.parentNode != config.browser.tabContainer) {
                    this._pendingJumps.push(slice);
                    // NOTE: this obviously won't work on generated pages using
                    // non-unique URLs :(
                    liberator.open(slice.location, liberator.NEW_TAB);
                    return;
                }
                let index = tabs.index(slice.tab);
                if (index != -1) {
                    tabs.select(index, false, true);
                    let win = slice.tab.linkedBrowser.contentWindow;
                    if (win.location.href != slice.location) {
                        this._pendingJumps.push(slice);
                        win.location.href = slice.location;
                        return;
                    }
                    buffer.scrollToPercent(slice.position.x * 100, slice.position.y * 100);
                    ok = true;
                }
            }
        }
        else if (Marks.isLocalMark(mark)) {
            let win = window.content;
            let slice = this._localMarks.get(mark) || [];

            for (let [, lmark] in Iterator(slice)) {
                if (win.location.href == lmark.location) {
                    buffer.scrollToPercent(lmark.position.x * 100, lmark.position.y * 100);
                    ok = true;
                    break;
                }
            }
        }

        if (!ok)
            liberator.echoerr("Mark not set: " + mark);
    },

    /**
     * List all marks matching <b>filter</b>.
     *
     * @param {string} filter
     */
    list: function (filter) {
        let marks = this.all;

        liberator.assert(marks.length > 0, "No marks set");

        if (filter.length > 0) {
            marks = marks.filter(function (mark) filter.indexOf(mark[0]) >= 0);
            liberator.assert(marks.length > 0, "No matching marks for: " + filter.quote());
        }

        let list = template.tabular(
                [ { header: "Mark",   style: "padding-left: 2ex" },
                  { header: "Line",   style: "text-align: right" },
                  { header: "Column", style: "text-align: right" },
                  { header: "File",   highlight: "URL" }],
                ([mark[0],
                  Math.round(mark[1].position.x * 100) + "%",
                  Math.round(mark[1].position.y * 100) + "%",
                  mark[1].location]
                 for ([, mark] in Iterator(marks)))); 

        commandline.echo(list, commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
    },

    _onPageLoad: function _onPageLoad(event) {
        let win = event.originalTarget.defaultView;
        for (let [i, mark] in Iterator(this._pendingJumps)) {
            if (win && win.location.href == mark.location) {
                buffer.scrollToPercent(mark.position.x * 100, mark.position.y * 100);
                this._pendingJumps.splice(i, 1);
                return;
            }
        }
    },

    _removeLocalMark: function _removeLocalMark(mark) {
        let localmark = this._localMarks.get(mark);
        if (localmark) {
            let win = window.content;
            for (let [i, ] in Iterator(localmark)) {
                if (localmark[i].location == win.location.href) {
                    localmark.splice(i, 1);
                    if (localmark.length == 0) {
                        this._localMarks.remove(mark);
                        liberator.echomsg("Deleted local mark: " + Marks.markToString(mark, localmark[i]));
                    }
                    break;
                }
            }
        }
    },

    _removeURLMark: function _removeURLMark(mark) {
        let urlmark = this._urlMarks.get(mark);
        if (urlmark) {
            this._urlMarks.remove(mark);
            liberator.echomsg("Deleted URL mark: " + Marks.markToString(mark, urlmark));
        }
    },

    _localMarkIter: function _localMarkIter() {
        for (let [mark, value] in this._localMarks)
            for (let [, val] in Iterator(value))
                yield [mark, val];
    }

}, {
    markToString: function markToString(name, mark) {
        return name + ", " + mark.location +
                ", (" + Math.round(mark.position.x * 100) +
                "%, " + Math.round(mark.position.y * 100) + "%)" +
                (("tab" in mark) ? ", tab: " + tabs.index(mark.tab) : "");
    },

    isLocalMark: function isLocalMark(mark) /^['`a-z]$/.test(mark),

    isURLMark: function isURLMark(mark) /^[A-Z0-9]$/.test(mark)
}, {
    events: function () {
        let appContent = document.getElementById("appcontent");
        if (appContent)
            events.addSessionListener(appContent, "load", this.closure._onPageLoad, true);
    },
    mappings: function () {
        var myModes = config.browserModes;

        mappings.add(myModes,
            ["m"], "Set mark at the cursor position",
            function (arg) {
                liberator.assert(/^[a-zA-Z]$/.test(arg));
                marks.add(arg);
            },
            { arg: true });

        mappings.add(myModes,
            ["'", "`"], "Jump to the mark in the current buffer",
            function (arg) { marks.jumpTo(arg); },
            { arg: true });
    },

    commands: function () {
        commands.add(["delm[arks]"],
            "Delete the specified marks",
            function (args) {
                let special = args.bang;
                args = args.string;

                liberator.assert( special ||  args, "Argument required");
                liberator.assert(!special || !args, "Invalid argument");

                let matches = args.match(/(?:(?:^|[^a-zA-Z0-9])-|-(?:$|[^a-zA-Z0-9])|[^a-zA-Z0-9 -]).*/);
                // NOTE: this currently differs from Vim's behavior which
                // deletes any valid marks in the arg list, up to the first
                // invalid arg, as well as giving the error message.
                liberator.assert(!matches, "Invalid argument: " + matches[0]);

                // check for illegal ranges - only allow a-z A-Z 0-9
                if ((matches = args.match(/[a-zA-Z0-9]-[a-zA-Z0-9]/g))) {
                    for (let match in values(matches))
                        liberator.assert(/[a-z]-[a-z]|[A-Z]-[A-Z]|[0-9]-[0-9]/.test(match) &&
                                         match[0] <= match[2],
                            "Invalid argument: " + args.match(match + ".*")[0]);
                }

                marks.remove(args, special);
            },
            {
                bang: true,
                completer: function (context) completion.mark(context)
            });

        commands.add(["ma[rk]"],
            "Mark current location within the web page",
            function (args) {
                let mark = args[0];
                liberator.assert(mark.length <= 1, "Trailing characters");
                liberator.assert(/[a-zA-Z]/.test(mark),
                    "Mark must be a letter or forward/backward quote");

                marks.add(mark);
            },
            { argCount: "1" });

        commands.add(["marks"],
            "Show all location marks of current web page",
            function (args) {
                args = args.string;

                // ignore invalid mark characters unless there are no valid mark chars
                liberator.assert(!args || /[a-zA-Z]/.test(args),
                    "No matching marks for: " + args.quote());

                let filter = args.replace(/[^a-zA-Z]/g, "");
                marks.list(filter);
            });
    },

    completion: function () {
        completion.mark = function mark(context) {
            function percent(i) Math.round(i * 100);

            // FIXME: Line/Column doesn't make sense with %
            context.title = ["Mark", "Line Column File"];
            context.keys.description = function ([, m]) percent(m.position.y) + "% " + percent(m.position.x) + "% " + m.location;
            context.completions = marks.all;
        };
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
