// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.

/** @scope modules */

const StatusLine = Module("statusline", {
    init: function () {
        this._statusBar = document.getElementById("status-bar");
        this._statusBar.collapsed = true; // it is later restored unless the user sets laststatus=0

        // our status bar fields
        this._statuslineWidget     = document.getElementById("liberator-statusline");
        this._urlWidget            = document.getElementById("liberator-statusline-field-url");
        this._inputBufferWidget    = document.getElementById("liberator-statusline-field-inputbuffer");
        this._progressWidget       = document.getElementById("liberator-statusline-field-progress");
        this._tabCountWidget       = document.getElementById("liberator-statusline-field-tabcount");
        this._bufferPositionWidget = document.getElementById("liberator-statusline-field-bufferposition");
    },

    /**
     * Update the status bar to indicate how secure the website is:
     * extended - Secure connection with Extended Validation(EV) certificate.
     * secure -   Secure connection with valid certificate.
     * broken -   Secure connection with invalid certificate, or
     *            mixed content.
     * insecure - Insecure connection.
     *
     * @param {'extended'|'secure'|'broken'|'insecure'} type
     */
    setClass: function setClass(type) {
        const highlightGroup = {
            extended: "StatusLineExtended",
            secure:   "StatusLineSecure",
            broken:   "StatusLineBroken",
            insecure: "StatusLine"
        };

        this._statusBar.setAttributeNS(NS.uri, "highlight", highlightGroup[type]);
    },

    // update all fields of the statusline
    update: function update() {
        this.updateUrl();
        this.updateInputBuffer();
        this.updateProgress();
        this.updateTabCount();
        this.updateBufferPosition();
    },

    /**
     * Update the URL displayed in the status line. Also displays status
     * icons, [+-♥], when there are next and previous pages in the
     * current tab's history, and when the current URL is bookmarked,
     * respectively.
     *
     * @param {string} url The URL to display.
     * @default buffer.URL
     */
    updateUrl: function updateUrl(url) {
        // ripped from Firefox; modified
        function losslessDecodeURI(url) {
            // 1. decodeURI decodes %25 to %, which creates unintended
            //    encoding sequences.
            url = url.split("%25").map(decodeURI).join("%25");
            // 2. Re-encode whitespace so that it doesn't get eaten away
            //    by the location bar (bug 410726).
            url = url.replace(/[\r\n\t]/g, encodeURIComponent);

            // Encode invisible characters (soft hyphen, zero-width space, BOM,
            // line and paragraph separator, word joiner, invisible times,
            // invisible separator, object replacement character) (bug 452979)
            url = url.replace(/[\v\x0c\x1c\x1d\x1e\x1f\u00ad\u200b\ufeff\u2028\u2029\u2060\u2062\u2063\ufffc]/g,
                encodeURIComponent);

            // Encode bidirectional formatting characters.
            // (RFC 3987 sections 3.2 and 4.1 paragraph 6)
            url = url.replace(/[\u200e\u200f\u202a\u202b\u202c\u202d\u202e]/g,
                encodeURIComponent);
            return url;
        };

        if (url == null)
            // TODO: this probably needs a more general solution.
            url = losslessDecodeURI(buffer.URL);

        // make it even more Vim-like
        if (url == "about:blank") {
            if (!buffer.title)
                url = "[No Name]";
        }
        else {
            url = url.replace(RegExp("^liberator://help/(\\S+)#(.*)"), function (m, n1, n2) n1 + " " + decodeURIComponent(n2) + " [Help]")
                     .replace(RegExp("^liberator://help/(\\S+)"), "$1 [Help]");
        }

        // when session information is available, add [+] when we can go
        // backwards, [-] when we can go forwards
        let modified = "";
        if (window.getWebNavigation) {
            let sh = window.getWebNavigation().sessionHistory;
            if (sh && sh.index > 0)
                modified += "+";
            if (sh && sh.index < sh.count -1)
                modified += "-";
        }
        if (modules.bookmarks) {
            if (bookmarks.isBookmarked(buffer.URL))
                modified += "\u2764"; // a heart symbol: ❤
                //modified += "\u2665"; // a heart symbol: ♥
        }

        if (modified)
            url += " [" + modified + "]";

        this._urlWidget.value = url;
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

        this._inputBufferWidget.value = buffer;
    },

    /**
     * Update the page load progress bar.
     *
     * @param {string|number} progress The current progress, as follows:
     *    A string          - Displayed literally.
     *    A ratio 0 < n < 1 - Displayed as a progress bar.
     *    A number n <= 0   - Displayed as a "Loading" message.
     *    Any other number  - The progress is cleared.
     */
    updateProgress: function updateProgress(progress) {
        if (!progress)
            progress = "";

        if (typeof progress == "string")
            this._progressWidget.value = progress;
        else if (typeof progress == "number") {
            let progressStr = "";
            if (progress <= 0)
                progressStr = "[ Loading...         ]";
            else if (progress < 1) {
                progress = Math.floor(progress * 20);
                progressStr = "["
                    + "====================".substr(0, progress)
                    + ">"
                    + "                    ".substr(0, 19 - progress)
                    + "]";
            }
            this._progressWidget.value = progressStr;
        }
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
            if (delayed)
                return void setTimeout(function () statusline.updateTabCount(false), 0);

            // update the ordinal which is used for numbered tabs
            if (options.get("guioptions").has("n", "N"))
                for (let [i, tab] in util.Array.iteritems(getBrowser().mTabs))
                    tab.setAttribute("ordinal", i + 1);

            this._tabCountWidget.value = "[" + (tabs.index() + 1) + "/" + tabs.count + "]";
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

        this._bufferPositionWidget.value = bufferPositionStr;
    }

}, {
}, {
    options: function () {
        options.add(["laststatus", "ls"],
            "Show the status line",
            "number", 2,
            {
                setter: function setter(value) {
                    if (value == 0)
                        document.getElementById("status-bar").collapsed = true;
                    else if (value == 1)
                        liberator.echoerr("show status line only with > 1 window not implemented yet");
                    else
                        document.getElementById("status-bar").collapsed = false;

                    return value;
                },
                completer: function completer(context) [
                    ["0", "Never display status line"],
                    ["1", "Display status line only if there are multiple windows"],
                    ["2", "Always display status line"]
                ],
                validator: Option.validateCompleter
            });
    },
});

// vim: set fdm=marker sw=4 ts=4 et:
