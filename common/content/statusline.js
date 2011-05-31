// Copyright (c) 2006-2010 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/** @scope modules */

const StatusLine = Module("statusline", {
    init: function () {
        // our status bar fields
        this._statusfields = {};
        this._statuslineWidget = document.getElementById("liberator-status");
    },

    // update all fields of the statusline
    update: function update() {
        let text = "";
        let statusfields = this._statusfields;
        options.get("status").values.forEach(function(field) {
            if (statusfields[field])
                text += " " + statusfields[field];
            });

        this._statuslineWidget.value = text;
    },

    /**
     * Update the URL displayed in the status line
     *
     * @param {string} url The URL to display.
     * @default buffer.URL
     */
    updateUrl: function updateUrl(url) {
        if (typeof(buffer) == "undefined") // quick hack to make the muttator compose work, needs more thought
            return;

        if (url == null)
            // TODO: this probably needs a more general solution.
            url = util.losslessDecodeURI(buffer.URL);

        // make it even more Vim-like
        if (url == "about:blank") {
            if (!buffer.title)
                url = "[No Name]";
        }
        else {
            url = url.replace(RegExp("^liberator://help/(\\S+)#(.*)"), function (m, n1, n2) n1 + " " + decodeURIComponent(n2) + " [Help]")
                     .replace(RegExp("^liberator://help/(\\S+)"), "$1 [Help]");
        }

        this.updateField("location", url);
    },

    updateBookmark: function updateBookmark(url) {
        if (typeof(buffer) == "undefined") // quick hack to make the muttator compose work, needs more thought
            return;

        // if no url is given as the argument, use the current page
        if (url == null)
            url = buffer.URL;

        let bookmark = "";
        if ((modules.bookmarks) && (bookmarks.isBookmarked(url)))
            bookmark = "\u2764";

        this.updateField("bookmark", bookmark);
    },

    updateHistory: function updateHistory() {
        let history = "";
        if (window.getWebNavigation) {
            let sh = window.getWebNavigation().sessionHistory;
            if (sh && sh.index > 0)
                history += "<";
            if (sh && sh.index < sh.count - 1)
                history += ">";
        }

        this.updateField("history", history);
     },

    /**
     * Set the contents of the status line's input buffer to the given
     * string. Used primarily when a key press requires further input
     * before being processed, including mapping counts and arguments,
     * along with multi-key mappings.
     *
     * @param {string} buffer
     */
    updateInputBuffer: function updateInputBuffer(buffer) {
        if (!buffer || typeof buffer != "string")
            buffer = "";

        this.updateField("input", buffer);
    },

    /**
     * Display the correct tabcount (e.g., [1/5]) on the status bar.
     *
     * @param {bool} delayed When true, update count after a
     *      brief timeout. Useful in the many cases when an
     *      event that triggers an update is broadcast before
     *      the tab state is fully updated.
     */
    updateTabCount: function updateTabCount(delayed) {
        if (liberator.has("tabs")) {
            if (delayed) {
                this.setTimeout(function () this.updateTabCount(false), 0);
                return;
            }

            this.updateField("tabcount", "[" + (tabs.index() + 1) + "/" + tabs.count + "]");
        }
    },

    /**
     * Display the main content's vertical scroll position in the status
     * bar.
     *
     * @param {number} percent The position, as a percentage. @optional
     */
    updateBufferPosition: function updateBufferPosition(percent) {
        if (!percent || typeof percent != "number") {
            let win = document.commandDispatcher.focusedWindow;
            if (!win)
                return;
            percent = win.scrollMaxY == 0 ? -1 : win.scrollY / win.scrollMaxY;
        }

        let bufferPositionStr = "";
        percent = Math.round(percent * 100);
        if (percent < 0)
            bufferPositionStr = "All";
        else if (percent == 0)
            bufferPositionStr = "Top";
        else if (percent < 10)
            bufferPositionStr = " " + percent + "%";
        else if (percent >= 100)
            bufferPositionStr = "Bot";
        else
            bufferPositionStr = percent + "%";

        this.updateField("position", bufferPositionStr);
    },

    /**
     * Set any field in the statusbar
     *
     * @param fieldname
     * @param value
     */
    updateField: function updateField(fieldname, value) {
        this._statusfields[fieldname] = value;
        this.update();
    }

}, {
}, {
    options: function () {
        options.add(["status"],
            "Define which information to show in the status bar",
            "stringlist", "input,location,bookmark,history,tabcount,position",
            {
                setter: function setter(value) {
                    statusline.update();
                    return value;
                },
                completer: function completer(context) [
                    ["input",    "Any partially entered key mapping"],
                    ["location", "The currently loaded URL"],
                    ["history",  "The backward / forward history indicators"],
                    ["bookmark", "The bookmark indicator (heart)"],
                    ["tabcount", "The number of currently selected tab and total number of tabs"],
                    ["position", "The vertical scroll position"]
                ],
                validator: function (value) {
                    return true; // we allow all values for now for easy extendability of 'status' by plugins
                }
            });
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
