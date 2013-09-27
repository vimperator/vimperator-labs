// Copyright (c) 2006-2010 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/** @scope modules */

/**
 * @param {String} name
 * @param {String} description
 * @param {String|TemplateXML} node
 *      String     : the id attribute value of the existing node
 *      TemplateXML: a TemplateXML instance. e.g) xml`<xul:label ...>`
 * @param {Function} updater
 * @param {Object} extraInfo
 */
const StatusField = Class("StatusField", {
    init: function (name, description, node, updater, extraInfo) {
        this.name = name;
        this.description = description;
        if (typeof updater === "function")
            this._updater = updater;

        if (typeof node === "string") {
            this.node = document.getElementById(node);
            if (!this.node)
                throw new Error('the element is not found: "' + node + '"');
        }
        else if (node instanceof TemplateXML) {
            this.node = util.xmlToDom(node, document);
            this.node.setAttribute("id", "liberator-status-" + name);
            statusline._statuslineWidget.appendChild(this.node);
        }
        else
            throw new TypeError("the argument node must be String or TemplateXML: " + node);

        this.node.hidden = true;
        if (extraInfo)
            update(this, extraInfo);
    },
    /**
     * field position starting 0.
     * if set -1, this field will be hidden.
     * @type {Number}
     */
    get position () {
        if (this.node.hasAttribute("liberatorPosition"))
            return parseInt(this.node.getAttribute("libeatorPosition"), 10);

        this.node.setAttribute("liberatorPosition", -1);
        return -1;
    },
    set position (val) {
        if (typeof val !== "number")
            return false;

        this.node.hidden = (val === -1);
        this.node.setAttribute("liberatorPosition", val);
        return true;
    },
    update: function (value) {
        if (this._updater)
            this._updater(this.node, value);
    },
    destroy: function () {
        this.node.parentNode.removeChild(this.node);
    },
});

const StatusLine = Module("statusline", {
    init: function () {
        // our status bar fields
        this._statusfields = {};
        this._statuslineWidget = document.getElementById("liberator-status");
    },

    /**
     * @see StatusField
     */
    addField: function (name, description, node, updater, extraInfo) {
        if (name in this._statusfields)
            return this._statusfields[name];

        try {
            var field = new StatusField(name, description, node, updater, extraInfo);
            Object.defineProperty(this, name, { value: field, configurable: true, enumerable: true });
        }
        catch (e) {
            Cu.reportError(e);
            return null;
        }
        return this._statusfields[name] = field;
    },

    removeField: function (name) {
        if (name in this._statusfields) {
            this._statusfields[name].destroy();
            return delete this._statusfields[name] && delete this[name];
        }
        return false;
    },

    sortFields: function (fieldNames) {
        if (!fieldNames)
            fieldNames = options.get("status").values;

        for (var name of Object.keys(this._statusfields))
            this._statusfields[name].position = fieldNames.indexOf(name);

        Cc["@mozilla.org/xul/xul-sort-service;1"]
            .getService(Ci.nsIXULSortService)
            .sort(this._statuslineWidget, "liberatorPosition", "integer ascending");
    },

    // update all fields of the statusline
    update: function update() {
        let statusfields = this._statusfields;
        let fieldNames = options.get("status").values;
        this.sortFields(fieldNames);
        for (let field of fieldNames) {
            if (field in statusfields)
                statusfields[field].update();
        }
    },

    /**
     * Set any field in the statusbar
     *
     * @param {String} fieldname
     * @param {any} value
     */
    updateField: function updateField (fieldname, value) {
        var field = this._statusfields[fieldname];
        if (field)
            field.update(value);
    },
}, {
}, {
    statusline: function () {
        statusline.addField("input", "Any partially entered key mapping", "liberator-status-input",
            /**
             * Set the contents of the status line's input buffer to the given
             * string. Used primarily when a key press requires further input
             * before being processed, including mapping counts and arguments,
             * along with multi-key mappings.
             *
             * @param {Element} node
             * @param {string} buffer
             */
            function updateInputBuffer (node, buffer) {
                if (!buffer || typeof buffer != "string")
                    buffer = "";

                node.value = buffer;
            });
        statusline.addField("ssl", "The currently SSL status", "liberator-status-ssl",
            function updateSSLState (node, state) {
                var className = "";
                if (!state) {
                    let securityUI = config.tabbrowser.securityUI;
                    if (securityUI)
                        state = securityUI.state || 0;
                }
                const WPL = Components.interfaces.nsIWebProgressListener;
                if (state & WPL.STATE_IDENTITY_EV_TOPLEVEL)
                    className = "verifiedIdentity";
                else if (state & WPL.STATE_IS_SECURE)
                    className = "verifiedDomain";
                else if (state & WPL.STATE_IS_BROKEN) {
                    if ((state & WPL.STATE_LOADED_MIXED_ACTIVE_CONTENT) &&
                        options.getPref("security.mixed_content.block_active_content", false))
                        className = "mixedActiveContent";
                }

                node.className = className;
            }, {
                openPopup: function (anchor) {
                    var handler = window.gIdentityHandler;
                    if (typeof handler === "undefiend") // Thunderbird has none
                        return;

                    handler._identityPopup.hidden = false;
                    handler.setPopupMessages(handler._identityBox.className);
                    handler._identityPopup.openPopup(anchor);
                },
            });
        statusline.addField("location", "The currently loaded URL", "liberator-status-location",
            /**
             * Update the URL displayed in the status line
             *
             * @param {Element} node
             * @param {string} url The URL to display.
             * @default buffer.URL
             */
            function updateUrl (node, url) {
                if (typeof(buffer) == "undefined") // quick hack to make the muttator compose work, needs more thought
                    return;

                if (url == null)
                    // TODO: this probably needs a more general solution.
                    url = services.get("textToSubURI").unEscapeURIForUI(buffer.charset, buffer.URL);

                // make it even more Vim-like
                if (url == "about:blank") {
                    if (!buffer.title)
                        url = "[No Name]";
                }
                else {
                    url = url.replace(RegExp("^liberator://help/(\\S+)#(.*)"), function (m, n1, n2) n1 + " " + decodeURIComponent(n2) + " [Help]")
                             .replace(RegExp("^liberator://help/(\\S+)"), "$1 [Help]");
                }

                node.value = url;
            });
        statusline.addField("history", "The backward / forward history indicators", "liberator-status-history",
            function updateHistory (node) {
                let history = "";
                if (window.getWebNavigation) {
                    let sh = window.getWebNavigation().sessionHistory;
                    if (sh && sh.index > 0)
                        history += "<";
                    if (sh && sh.index < sh.count - 1)
                        history += ">";
                }
                node.value = history;
            });
        statusline.addField("bookmark", "The bookmark indicator (heart)", "liberator-status-bookmark",
            function updateBookmark (node, url) {
                if (typeof(buffer) == "undefined") // quick hack to make the muttator compose work, needs more thought
                    return;

                // if no url is given as the argument, use the current page
                if (url == null)
                    url = buffer.URL;

                let bookmark = "";
                if ((modules.bookmarks) && (bookmarks.isBookmarked(url)))
                    bookmark = "\u2764";

                node.value = bookmark;
            });
        statusline.addField("tabcount", "The number of currently selected tab and total number of tabs", "liberator-status-tabcount",
            /**
             * Display the correct tabcount (e.g., [1/5]) on the status bar.
             *
             * @param {Element} node
             * @param {bool} delayed When true, update count after a
             *      brief timeout. Useful in the many cases when an
             *      event that triggers an update is broadcast before
             *      the tab state is fully updated.
             */
            function updateTabCount (node, delayed) {
                if (liberator.has("tabs")) {
                    if (delayed) {
                        window.setTimeout(function() updateTabCount(node, false), 0);
                        return;
                    }

                    node.value = "[" + (tabs.index() + 1) + "/" + tabs.count + "]";
                }
            });
        statusline.addField("position", "The vertical scroll position", "liberator-status-position",
            /**
             * Display the main content's vertical scroll position in the status
             * bar.
             *
             * @param {Element} node
             * @param {number} percent The position, as a percentage. @optional
             */
            function updateBufferPosition (node, percent) {
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

                node.value = bufferPositionStr;
            });

    },
    options: function () {
        options.add(["status"],
            "Define which information to show in the status bar",
            "stringlist", "input,location,bookmark,history,tabcount,position",
            {
                setter: function setter(value) {
                    statusline.sortFields(this.values);
                    return value;
                },
                completer: function completer(context) {
                    var fields = statusline._statusfields;
                    return [[name, fields[name].description] for (name of Object.keys(fields))];
                },
            });
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
