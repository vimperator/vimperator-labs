// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
// Copyright (c) 2007-2009 by Doug Kearns <dougkearns@gmail.com>
// Copyright (c) 2008-2010 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/** @scope modules */
Cu.import("resource://gre/modules/XPCOMUtils.jsm", modules);

const Point = Struct("x", "y");

/**
 * A class to manage the primary web content buffer. The name comes
 * from Vim's term, 'buffer', which signifies instances of open
 * files.
 * @instance buffer
 */
const Buffer = Module("buffer", {
    requires: ["config"],

    init: function () {
        this.pageInfo = {};

        this.addPageInfoSection("f", "Feeds", function (verbose) {
            let doc = config.browser.contentDocument;

            const feedTypes = {
                "application/rss+xml": "RSS",
                "application/atom+xml": "Atom",
                "text/xml": "XML",
                "application/xml": "XML",
                "application/rdf+xml": "XML"
            };

            function isValidFeed(data, principal, isFeed) {
                if (!data || !principal)
                    return false;

                if (!isFeed) {
                    var type = data.type && data.type.toLowerCase();
                    type = type.replace(/^\s+|\s*(?:;.*)?$/g, "");

                    isFeed = ["application/rss+xml", "application/atom+xml"].indexOf(type) >= 0 ||
                             // really slimy: general XML types with magic letters in the title
                             type in feedTypes && /\brss\b/i.test(data.title);
                }

                if (isFeed) {
                    try {
                        window.urlSecurityCheck(data.href, principal,
                                Ci.nsIScriptSecurityManager.DISALLOW_INHERIT_PRINCIPAL);
                    }
                    catch (e) {
                        isFeed = false;
                    }
                }

                if (type)
                    data.type = type;

                return isFeed;
            }

            let nFeed = 0;
            for (let link in util.evaluateXPath(["link[@href and (@rel='feed' or (@rel='alternate' and @type))]"], doc)) {
                let rel = link.rel.toLowerCase();
                let feed = { title: link.title, href: link.href, type: link.type || "" };
                if (isValidFeed(feed, doc.nodePrincipal, rel == "feed")) {
                    nFeed++;
                    let type = feedTypes[feed.type] || "RSS";
                    if (verbose)
                        yield [feed.title, xml`${template.highlightURL(feed.href, true)}<span class="extra-info">&#xa0;(${type})</span>`];
                }
            }

            if (!verbose && nFeed)
                yield nFeed + " feed" + (nFeed > 1 ? "s" : "");
        });

        this.addPageInfoSection("g", "Document", function (verbose) {
            let doc = config.browser.contentDocument;

            // get file size
            const ACCESS_READ = Ci.nsICache.ACCESS_READ;
            let cacheKey = doc.location.toString().replace(/#.*$/, "");

            for (let proto of ["HTTP", "FTP"]) {
                try {
                    var cacheEntryDescriptor = services.get("cache").createSession(proto, 0, true)
                                                       .openCacheEntry(cacheKey, ACCESS_READ, false);
                    break;
                }
                catch (e) {}
            }

            let pageSize = []; // [0] bytes; [1] kbytes
            if (cacheEntryDescriptor) {
                pageSize[0] = util.formatBytes(cacheEntryDescriptor.dataSize, 0, false);
                pageSize[1] = util.formatBytes(cacheEntryDescriptor.dataSize, 2, true);
                if (pageSize[1] == pageSize[0])
                    pageSize.length = 1; // don't output "xx Bytes" twice
            }

            let lastModVerbose = new Date(doc.lastModified).toLocaleString();
            let lastMod = new Date(doc.lastModified).toLocaleFormat("%x %X");

            if (lastModVerbose == "Invalid Date" || new Date(doc.lastModified).getFullYear() == 1970)
                lastModVerbose = lastMod = null;

            if (!verbose) {
                if (pageSize[0])
                    yield (pageSize[1] || pageSize[0]) + " bytes";
                yield lastMod;
                return;
            }

            yield ["Title", doc.title];
            yield ["URL", template.highlightURL(doc.location.toString(), true)];

            let ref = "referrer" in doc && doc.referrer;
            if (ref)
                yield ["Referrer", template.highlightURL(ref, true)];

            if (pageSize[0])
                yield ["File Size", pageSize[1] ? pageSize[1] + " (" + pageSize[0] + ")"
                                                : pageSize[0]];

            yield ["Mime-Type", doc.contentType];
            yield ["Encoding", doc.characterSet];
            yield ["Compatibility", doc.compatMode == "BackCompat" ? "Quirks Mode" : "Full/Almost Standards Mode"];
            if (lastModVerbose)
                yield ["Last Modified", lastModVerbose];
        });

        this.addPageInfoSection("m", "Meta Tags", function (verbose) {
            // get meta tag data, sort and put into pageMeta[]
            let metaNodes = config.browser.contentDocument.getElementsByTagName("meta");

            return Array.map(metaNodes, function (node) [(node.name || node.httpEquiv), template.highlightURL(node.content)])
                        .sort(function (a, b) util.compareIgnoreCase(a[0], b[0]));
        });
    },

    destroy: function () {
    },

    _triggerLoadAutocmd: function _triggerLoadAutocmd(name, doc) {
        let args = {
            url:   doc.location.href,
            title: doc.title
        };

        if (liberator.has("tabs")) {
            args.tab = tabs.getContentIndex(doc) + 1;
            args.doc = "tabs.getTab(" + (args.tab - 1) + ").linkedBrowser.contentDocument";
        }

        autocommands.trigger(name, args);
    },

    // called when the active document is scrolled
    _updateBufferPosition: function _updateBufferPosition() {
        statusline.updateField("position");
        // modes.show();
    },

    onDOMContentLoaded: function onDOMContentLoaded(event) {
        let doc = event.originalTarget;
        if (doc instanceof HTMLDocument && !doc.defaultView.frameElement)
            this._triggerLoadAutocmd("DOMLoad", doc);
    },

    // TODO: see what can be moved to onDOMContentLoaded()
    // event listener which is is called on each page load, even if the
    // page is loaded in a background tab
    onPageLoad: function onPageLoad(event) {
        if (event.originalTarget instanceof HTMLDocument) {
            let doc = event.originalTarget;
            // document is part of a frameset
            if (doc.defaultView.frameElement) {
                return;
            }

            // code which should happen for all (also background) newly loaded tabs goes here:

            // mark the buffer as loaded, we can't use buffer.loaded
            // since that always refers to the current buffer, while doc can be
            // any buffer, even in a background tab
            doc.pageIsFullyLoaded = 1;

            // code which is only relevant if the page load is the current tab goes here:
            if (doc == config.browser.contentDocument) {
                // we want to stay in command mode after a page has loaded
                // TODO: move somewhere else, as focusing can already happen earlier than on "load"
                if (options.focuscontent) {
                    setTimeout(function () {
                        let focused = liberator.focus;
                        if (focused && (focused.value != null) && focused.value.length == 0)
                            focused.blur();
                    }, 0);
                }
            }
            // else // background tab
            //     liberator.echomsg("Background tab loaded: " + doc.title || doc.location.href);

            this._triggerLoadAutocmd("PageLoad", doc);
        }
    },

    /**
     * @property {Object} The document loading progress listener.
     */
    progressListener: {
        QueryInterface: XPCOMUtils.generateQI([Ci.nsISupportsWeakReference, Ci.nsIWebProgressListener, Ci.nsIMsgStatusFeedback, Ci.nsIActivityMgrListener, Ci.nsIActivityListener]),

        // XXX: function may later be needed to detect a canceled synchronous openURL()
        onStateChange: function onStateChange(webProgress, request, flags, status) {
            onStateChange.superapply(this, arguments);
            // STATE_IS_DOCUMENT | STATE_IS_WINDOW is important, because we also
            // receive statechange events for loading images and other parts of the web page
            if (flags & (Ci.nsIWebProgressListener.STATE_IS_DOCUMENT | Ci.nsIWebProgressListener.STATE_IS_WINDOW)) {
                // This fires when the load event is initiated
                // only thrown for the current tab, not when another tab changes
                if (flags & Ci.nsIWebProgressListener.STATE_START) {
                    webProgress.DOMWindow.document.pageIsFullyLoaded = 0;
                    buffer.loaded = 0;

                    autocommands.trigger("PageLoadPre", { url: buffer.URL });

                    // don't reset mode if a frame of the frameset gets reloaded which
                    // is not the focused frame
                    if (document.commandDispatcher.focusedWindow == webProgress.DOMWindow) {
                        setTimeout(function () { modes.reset(false); },
                            liberator.mode == modes.HINTS ? 500 : 0);
                    }
                }
                else if (flags & Ci.nsIWebProgressListener.STATE_STOP) {
                    webProgress.DOMWindow.document.pageIsFullyLoaded = (status == 0 ? 1 : 2);
                    buffer.loaded = (status == 0 ? 1 : 2);
                }
            }
        },
        // for notifying the user about secure web pages
        onSecurityChange: function onSecurityChange(webProgress, request, state) {
            onSecurityChange.superapply(this, arguments);
            statusline.updateField("ssl", state);
        },
        onStatusChange: function onStatusChange(webProgress, request, status, message) {
            onStatusChange.superapply(this, arguments);
        },
        onProgressChange: function onProgressChange(webProgress, request, curSelfProgress, maxSelfProgress, curTotalProgress, maxTotalProgress) {
            onProgressChange.superapply(this, arguments);
        },
        // happens when the users switches tabs
        onLocationChange: function onLocationChange() {
            onLocationChange.superapply(this, arguments);
            statusline.updateField("location");
            statusline.updateField("bookmark");
            statusline.updateField("history");
            statusline.updateField("zoomlevel");

            // This is a bit scary but we trigger ignore mode when the new URL is in the list
            // of pages with ignored keys and then exit it on a new page but ONLY, if:
            // a) The new page hasn't ignore as well and
            // b) We initiated ignore mode, and not the user manually with <Insert>
            if (modules.ignoreKeys != undefined) {
                let ignoredKeyExceptions = ignoreKeys.hasIgnoredKeys(buffer.URL);
                if (ignoredKeyExceptions !== null)
                    modes.passAllKeysExceptSome(ignoredKeyExceptions);
                else if (modes._passKeysExceptions !== null)
                    modes.passAllKeys = false;
            }

            autocommands.trigger("LocationChange", { url: buffer.URL });

            // if this is not delayed we get the position of the old buffer
            setTimeout(function () { statusline.updateField("position"); }, 250);
        },
        // called at the very end of a page load
        asyncUpdateUI: function asyncUpdateUI() {
            asyncUpdateUI.superapply(this, arguments);
        },
        setOverLink: function setOverLink(link, b) {
            let ssli = options.showstatuslinks;

            if (ssli == 3) {
                setOverLink.superapply(this, arguments);
                return;
            }

            if (link && ssli) {
                if (ssli == 1) {
                    statusline.updateField("location", "Link: " + link);
                    statusline.updateField("bookmark", link);
                }
                else if (ssli == 2)
                    liberator.echo("Link: " + link, commandline.DISALLOW_MULTILINE);
            }

            if (link == "") {
                if (ssli == 1) {
                    statusline.updateField("location");
                    statusline.updateField("bookmark");
                }
                else if (ssli == 2)
                    modes.show();
            }
        },
    },

    /**
     * @property {Array} The alternative style sheets for the current
     *     buffer. Only returns style sheets for the 'screen' media type.
     */
    get alternateStyleSheets() {
        let stylesheets = window.getAllStyleSheets(config.browser.contentWindow);

        return stylesheets.filter(
            function (stylesheet) /^(screen|all|)$/i.test(stylesheet.media.mediaText) && !/^\s*$/.test(stylesheet.title)
        );
    },

    /**
     * @property {Array[Window]} All frames in the current buffer.
     */
    getAllFrames: function(win) {
        let frames = [];
        (function rec(frame) {
            if (frame.document.body instanceof HTMLBodyElement)
                frames.push(frame);
                Array.forEach(frame.frames, rec);
        })(win || config.browser.contentWindow);

        return frames;
    },

    /**
     * @property {Object} A map of page info sections to their
     *     content generating functions.
     */
    pageInfo: null,

    /**
     * @property {number} A value indicating whether the buffer is loaded.
     *     Values may be:
     *         0 - Loading.
     *         1 - Fully loaded.
     *         2 - Load failed.
     */
    get loaded() {
        let doc = config.browser.contentDocument;
        if (doc.pageIsFullyLoaded !== undefined)
            return doc.pageIsFullyLoaded;
        return 0; // in doubt return "loading"
    },
    set loaded(value) {
        config.browser.contentDocument.pageIsFullyLoaded = value;
    },

    /**
     * @property {Object} The local state store for the currently selected
     *     tab.
     */
    get localStore() {
        let content = config.browser.contentWindow;
        if (!content.liberatorStore)
            content.liberatorStore = {};
        return content.liberatorStore;
    },



    /**
     * @property {Node} The last focused input field in the buffer. Used
     *     by the "gi" key binding.
     */
    get lastInputField() config.browser.contentDocument.lastInputField || null,
    set lastInputField(value) { config.browser.contentDocument.lastInputField = value; },

    /**
     * @property {string} The current top-level document's URL.
     */
    get URL() window.content ? window.content.location.href : config.browser.currentURI.spec,

    /**
     * @property {string} The current top-level document's URL, sans any
     *     fragment identifier.
     */
    get URI() {
        let loc = config.browser.contentWindow.location;
        return loc.href.substr(0, loc.href.length - loc.hash.length);
    },

    /**
     * @property {String} The current document's character set
     */
    get charset() {
        try {
            return config.browser.docShell.charset;
        } catch (e) {
            return "UTF-8";
        }
    },

    /**
     * @property {number} The buffer's height in pixels.
     */
    get pageHeight() window.content ? window.content.innerHeight : config.browser.contentWindow.innerHeight,

    /**
     * @property {number} The current browser's text zoom level, as a
     *     percentage with 100 as 'normal'. Only affects text size.
     */
    get textZoom() config.browser.markupDocumentViewer.textZoom * 100,
    set textZoom(value) { Buffer.setZoom(value, false); },

    /**
     * @property {number} The current browser's zoom level, as a
     *     percentage with 100 as 'normal'.
     */
    get zoomLevel() {
        let v = config.browser.markupDocumentViewer;
        if (v == null)
            return this.ZoomManager.zoom * 100;

        return v[v.textZoom == 1 ? "fullZoom" : "textZoom"] * 100;
    },

    /**
     * @property {number} The current browser's text zoom level, as a
     *     percentage with 100 as 'normal'. Affects text size, as well as
     *     image size and block size.
     */
    get fullZoom() config.browser.markupDocumentViewer.fullZoom * 100,
    set fullZoom(value) { Buffer.setZoom(value, true); },

    /**
     * @property {string} The current document's title.
     */
    get title() config.browser.contentTitle,

    /**
     * @property {number} The buffer's horizontal scroll percentile.
     */
    get scrollXPercent() {
        let win = Buffer.findScrollableWindow();
        if (win.scrollMaxX > 0)
            return Math.round(win.scrollX / win.scrollMaxX * 100);
        else
            return 0;
    },

    /**
     * @property {number} The buffer's vertical scroll percentile.
     */
    get scrollYPercent() {
        let win = Buffer.findScrollableWindow();
        if (win.scrollMaxY > 0)
            return Math.round(win.scrollY / win.scrollMaxY * 100);
        else
            return 0;
    },

    /**
     * Adds a new section to the page information output.
     *
     * @param {string} option The section's value in 'pageinfo'.
     * @param {string} title The heading for this section's
     *     output.
     * @param {function} func The function to generate this
     *     section's output.
     */
    addPageInfoSection: function addPageInfoSection(option, title, func) {
        this.pageInfo[option] = [func, title];
    },

    /**
     * Returns the currently selected word. If the selection is
     * null, it tries to guess the word that the caret is
     * positioned in.
     *
     * NOTE: might change the selection
     *
     * @returns {string}
     */
    // FIXME: getSelection() doesn't always preserve line endings, see:
    // https://www.mozdev.org/bugs/show_bug.cgi?id=19303
    getCurrentWord: function () {
        function _getCurrentWord (win) {
            let elem = win.frameElement;
            if (elem && elem.getClientRects().length === 0)
                return;
            let selection = win.getSelection();
            if (selection.rangeCount <= 0)
                return;
            let range = selection.getRangeAt(0);
            if (selection.isCollapsed) {
                let selController = buffer.selectionController;
                let caretmode = selController.getCaretEnabled();
                selController.setCaretEnabled(true);
                // Only move backwards if the previous character is not a space.
                if (range.startOffset > 0 && !/\s/.test(range.startContainer.textContent[range.startOffset - 1]))
                    selController.wordMove(false, false);

                selController.wordMove(true, true);
                selController.setCaretEnabled(caretmode);
                return String.match(selection, /\w*/)[0];
            }
            if (util.computedStyle(range.startContainer).whiteSpace == "pre"
                && util.computedStyle(range.endContainer).whiteSpace == "pre")
                return String(range);
            return String(selection);
        }

        return util.Array.compact(buffer.getAllFrames().map(_getCurrentWord)).join("\n");
    },

    /**
     * Focuses the given element. In contrast to a simple
     * elem.focus() call, this function works for iframes and
     * image maps.
     *
     * @param {Node} elem The element to focus.
     */
    focusElement: function (elem) {
        if (elem instanceof HTMLFrameElement || elem instanceof HTMLIFrameElement)
            Buffer.focusedWindow = elem.contentWindow;
        else if (elem instanceof HTMLInputElement && elem.type == "file") {
            Buffer.openUploadPrompt(elem);
            buffer.lastInputField = elem;
        }
        else if (elem instanceof HTMLLabelElement && elem.control) {
            Buffer.focusElement(elem.control);
        }
        else {
            elem.focus();

            // for imagemap
            if (elem instanceof HTMLAreaElement) {
                let doc = config.browser.contentDocument;
                try {
                    let [x, y] = elem.getAttribute("coords").split(",").map(parseFloat);

                    elem.dispatchEvent(events.create(doc, "mouseover", { screenX: x, screenY: y }));
                }
                catch (e) {}
            }
        }
    },

    /**
     * Tries to guess links the like of "next" and "prev". Though it has a
     * singularly horrendous name, it turns out to be quite useful.
     *
     * @param {string} rel The relationship to look for. Looks for
     *     links with matching @rel or @rev attributes, and,
     *     failing that, looks for an option named rel +
     *     "pattern", and finds the last link matching that
     *     RegExp.
     */
    followDocumentRelationship: function (rel, ...synonyms) {
        let regexes = options.get(rel + "pattern").values
                             .map(function (re) RegExp(re, "i"));
        synonyms.unshift(rel);

        function followFrame(frame) {
            function* iter(elems) {
                for (let i = 0; i < elems.length; i++)
                    for (let rel of synonyms)
                        if (elems[i].rel.toLowerCase() == rel || elems[i].rev.toLowerCase() == rel)
                            yield elems[i];
            }

            // <link>s have higher priority than normal <a> hrefs
            let elems = frame.document.getElementsByTagName("link");
            for (let elem of iter(elems)) {
                liberator.open(elem.href);
                return true;
            }

            // no links? ok, look for hrefs
            elems = frame.document.getElementsByTagName("a");
            for (let elem of iter(elems)) {
                buffer.followLink(elem, liberator.CURRENT_TAB);
                return true;
            }

            let res = util.evaluateXPath(options.get("hinttags").value, frame.document);
            for (let regex of regexes) {
                for (let i in util.range(res.snapshotLength, 0, -1)) {
                    let elem = res.snapshotItem(i);
                    if (regex.test(elem.textContent) || regex.test(elem.title) ||
                            Array.some(elem.childNodes, function (child) regex.test(child.alt))) {
                        buffer.followLink(elem, liberator.CURRENT_TAB);
                        return true;
                    }
                }
            }
            return false;
        }

        let ret = followFrame(config.browser.contentWindow);
        if (!ret) {
            // only loop through frames (ordered by size) if the main content didn't match
            let frames = buffer.getAllFrames().slice(1)
                .sort( function(a, b) {
                    return ((b.scrollMaxX+b.innerWidth)*(b.scrollMaxY+b.innerHeight)) - ((a.scrollMaxX+a.innerWidth)*(a.scrollMaxY+a.innerHeight))
                } );
            ret = Array.some(frames, followFrame);
        }

        if (!ret)
            liberator.beep();
    },

    /**
     * Fakes a click on a link.
     *
     * @param {Node} elem The element to click.
     * @param {number} where Where to open the link. See
     *     {@link liberator.open}.
     */
    followLink: function (elem, where) {
        let doc = elem.ownerDocument;
        let view = doc.defaultView;
        let offsetX = 1;
        let offsetY = 1;

        if (elem instanceof HTMLFrameElement || elem instanceof HTMLIFrameElement) {
            elem.contentWindow.focus();
            return;
        }
        else if (elem instanceof HTMLAreaElement) { // for imagemap
            let coords = elem.getAttribute("coords").split(",");
            offsetX = Number(coords[0]) + 1;
            offsetY = Number(coords[1]) + 1;
        }
        else if (elem instanceof HTMLInputElement && elem.type == "file") {
            Buffer.openUploadPrompt(elem);
            return;
        }
        else if (elem instanceof HTMLLabelElement && elem.control) {
            buffer.followLink(elem.control, where);
            return;
        }

        let ctrlKey = false, shiftKey = false;
        switch (where) {
        case liberator.NEW_TAB:
        case liberator.NEW_BACKGROUND_TAB:
            ctrlKey = true;
            shiftKey = (where != liberator.NEW_BACKGROUND_TAB);
            break;
        case liberator.NEW_WINDOW:
            shiftKey = true;
            break;
        case liberator.CURRENT_TAB:
            break;
        default:
            liberator.echoerr("Invalid where argument for followLink(): " + where);
        }

        elem.focus();

        options.withContext(function () {
            options.setPref("browser.tabs.loadInBackground", true);
            ["mousedown", "mouseup", "click"].forEach(function (event) {
                elem.dispatchEvent(events.create(doc, event, {
                    screenX: offsetX, screenY: offsetY,
                    ctrlKey: ctrlKey, shiftKey: shiftKey, metaKey: ctrlKey
                }));
            });
        });
    },


    /**
     * @property {nsISelectionController} The current document's selection
     *     controller.
     */
    get selectionController() Buffer.focusedWindow
            .QueryInterface(Ci.nsIInterfaceRequestor)
            .getInterface(Ci.nsIWebNavigation)
            .QueryInterface(Ci.nsIDocShell)
            .QueryInterface(Ci.nsIInterfaceRequestor)
            .getInterface(Ci.nsISelectionDisplay)
            .QueryInterface(Ci.nsISelectionController),

    /**
     * Opens the appropriate context menu for <b>elem</b>.
     *
     * @param {Node} elem The context element.
     */
    openContextMenu: function (elem) {
        let menu = document.getElementById("contentAreaContextMenu");
        menu.showPopup(elem, -1, -1, "context", "bottomleft", "topleft");
    },

    /**
     * Saves a page link to disk.
     *
     * @param {HTMLAnchorElement} elem The page link to save.
     * @param {boolean} skipPrompt Whether to open the "Save Link As..."
     *     dialog.
     */
    saveLink: function (elem, skipPrompt) {
        let doc  = elem.ownerDocument;
        let url  = window.makeURLAbsolute(elem.baseURI, elem.href ? elem.href : elem.src);
        let text = elem.textContent;

        try {
            window.urlSecurityCheck(url, doc.nodePrincipal);
            // we always want to save that link relative to the current working directory
            options.setPref("browser.download.lastDir", io.getCurrentDirectory().path);
            window.saveURL(url, text, null, true, skipPrompt, makeURI(url, doc.characterSet), doc);
        }
        catch (e) {
            liberator.echoerr(e);
        }
    },

    /**
     * Scrolls to the bottom of the current buffer.
     */
    scrollBottom: function () {
        Buffer.scrollElemToPercent(null, null, 100);
    },

    /**
     * Scrolls the buffer laterally <b>cols</b> columns.
     *
     * @param {number} cols The number of columns to scroll. A positive
     *     value scrolls right and a negative value left.
     */
    scrollColumns: function (cols) {
        Buffer.scrollHorizontal(null, "columns", cols);
    },

    /**
     * Scrolls to the top of the current buffer.
     */
    scrollEnd: function () {
        Buffer.scrollElemToPercent(null, 100, null);
    },

    /**
     * Scrolls the buffer vertically <b>lines</b> rows.
     *
     * @param {number} lines The number of lines to scroll. A positive
     *     value scrolls down and a negative value up.
     */
    scrollLines: function (lines) {
        Buffer.scrollVertical(null, "lines", lines);
    },

    /**
     * Scrolls the buffer vertically <b>pages</b> pages.
     *
     * @param {number} pages The number of pages to scroll. A positive
     *     value scrolls down and a negative value up.
     */
    scrollPages: function (pages) {
        Buffer.scrollVertical(null, "pages", pages);
    },

    /**
     * Scrolls the buffer vertically 'scroll' lines.
     *
     * @param {boolean} direction The direction to scroll. If true then
     *     scroll down and if false scroll up.
     * @param {number} count The multiple of 'scroll' lines to scroll.
     * @optional
     */
    scrollByScrollSize: function (direction, count) {
        direction = direction ? 1 : -1;
        count = count || 1;
        let elem = Buffer.findScrollable(direction, false);

        if (options.scroll > 0)
            this.scrollLines(options.scroll * direction);
        else // scroll half a page down in pixels
            elem.scrollTop += Buffer.findScrollableWindow().innerHeight / 2 * direction;
    },

    _scrollByScrollSize: function _scrollByScrollSize(count, direction) {
        if (count > 0)
            options.scroll = count;
        buffer.scrollByScrollSize(direction);
    },

    /**
     * Scrolls the buffer to the specified screen percentiles.
     *
     * @param {number} x The horizontal page percentile.
     * @param {number} y The vertical page percentile.
     */
    scrollToPercent: function (x, y) {
        Buffer.scrollElemToPercent(null, x, y);
    },

    /**
     * Scrolls the buffer to the specified screen pixels.
     *
     * @param {number} x The horizontal pixel.
     * @param {number} y The vertical pixel.
     */
    scrollTo: function (x, y) {
        marks.add("'", true);
        config.browser.contentWindow.scrollTo(x, y);
    },

    /**
     * Scrolls the current buffer laterally to its leftmost.
     */
    scrollStart: function () {
        Buffer.scrollElemToPercent(null, 0, null);
    },

    /**
     * Scrolls the current buffer vertically to the top.
     */
    scrollTop: function () {
        Buffer.scrollElemToPercent(null, null, 0);
    },

    // TODO: allow callback for filtering out unwanted frames? User defined?
    /**
     * Shifts the focus to another frame within the buffer. Each buffer
     * contains at least one frame.
     *
     * @param {number} count The number of frames to skip through.
     * @param {boolean} forward The direction of motion.
     */
    shiftFrameFocus: function (count, forward) {
        let content = config.browser.contentWindow;
        if (!(content.document instanceof HTMLDocument))
            return;

        count = Math.max(count, 1);
        let frames = [];

        // find all frames - depth-first search
        (function findFrames(frame) {
            if (frame.document.body instanceof HTMLBodyElement)
                frames.push(frame);
            Array.forEach(frame.frames, findFrames);
        })(content);

        if (frames.length == 0) // currently top is always included
            return;

        // remove all unfocusable frames
        // TODO: find a better way to do this - walking the tree is too slow
        let start = document.commandDispatcher.focusedWindow;
        frames = frames.filter(function (frame) {
            frame.focus();
            return document.commandDispatcher.focusedWindow == frame;
        });
        start.focus();

        // find the currently focused frame index
        // TODO: If the window is a frameset then the first _frame_ should be
        //       focused.  Since this is not the current FF behaviour,
        //       we initialize current to -1 so the first call takes us to the
        //       first frame.
        let current = frames.indexOf(document.commandDispatcher.focusedWindow);

        // calculate the next frame to focus
        let next = current;
        if (forward) {
            next = current + count;

            if (next > frames.length - 1) {
                if (current == frames.length - 1)
                    liberator.beep();
                next = frames.length - 1; // still allow the frame indicator to be activated
            }
        }
        else {
            next = current - count;

            if (next < 0) {
                if (current == 0)
                    liberator.beep();
                next = 0; // still allow the frame indicator to be activated
            }
        }

        // focus next frame and scroll into view
        frames[next].focus();
        if (frames[next] != window.content)
            frames[next].frameElement.scrollIntoView(false);

        // add the frame indicator
        let doc = frames[next].document;
        let indicator = util.xmlToDom(xml`<div highlight="FrameIndicator"/>`, doc);
        doc.body.appendChild(indicator);

        setTimeout(function () { doc.body.removeChild(indicator); }, 500);

        // Doesn't unattach
        //doc.body.setAttributeNS(NS.uri, "activeframe", "true");
        //setTimeout(function () { doc.body.removeAttributeNS(NS.uri, "activeframe"); }, 500);
    },

    // similar to pageInfo
    // TODO: print more useful information, just like the DOM inspector
    /**
     * Displays information about the specified element.
     *
     * @param {Node} elem The element to query.
     */
    showElementInfo: function (elem) {
        liberator.echo(xml`Element:<br/>${util.objectToString(elem, true)}`, commandline.FORCE_MULTILINE);
    },

    /**
     * Displays information about the current buffer.
     *
     * @param {boolean} verbose Display more verbose information.
     * @param {string} sections A string limiting the displayed sections.
     * @default The value of 'pageinfo'.
     */
    showPageInfo: function (verbose, sections) {
        // Ctrl-g single line output
        if (!verbose) {
            let content = config.browser.contentWindow;
            let file = content.document.location.pathname.split("/").pop() || "[No Name]";
            let title = content.document.title || "[No Title]";

            let info = template.map2(xml, "gf",
                function (opt) template.map2(xml, buffer.pageInfo[opt][0](), util.identity, ", "),
                ", ");

            if (bookmarks.isBookmarked(this.URL))
                xml["+="](info, ", bookmarked");

            let pageInfoText = xml`${JSON.stringify(file)} [${info}] ${title}`;
            liberator.echo(pageInfoText, commandline.FORCE_SINGLELINE);
            return;
        }

        let option = sections || options.pageinfo;
        let list = template.map2(xml, option, function (option) {
            let opt = buffer.pageInfo[option];
            return opt ? template.table2(xml, opt[1], opt[0](true)) : undefined;
        }, xml`<br/>`);
        liberator.echo(template.genericOutput("Page Information", list), commandline.FORCE_MULTILINE);
    },

    /**
     * Opens a viewer to inspect the source of the currently selected
     * range.
     */
    viewSelectionSource: function () {
        // copied (and tuned somebit) from browser.jar -> nsContextMenu.js
        let focusedWindow = document.commandDispatcher.focusedWindow;
        if (focusedWindow == window)
            focusedWindow = config.browser.contentWindow;

        let docCharset = null;
        if (focusedWindow)
            docCharset = "charset=" + focusedWindow.document.characterSet;

        let reference = null;
        reference = focusedWindow.getSelection();

        let docUrl = null;
        window.openDialog("chrome://global/content/viewPartialSource.xul",
                "_blank", "scrollbars,resizable,chrome,dialog=no",
                docUrl, docCharset, reference, "selection");
    },

    /**
     * Opens a viewer to inspect the source of the current buffer or the
     * specified <b>url</b>. Either the default viewer or the configured
     * external editor is used.
     *
     * @param {string} url The URL of the source.
     * @default The current buffer.
     * @param {boolean} useExternalEditor View the source in the external editor.
     */
    viewSource: function (url, useExternalEditor) {
        url = url || buffer.URI;

        if (useExternalEditor)
            editor.editFileExternally(url);
        else {
            const PREFIX = "view-source:";
            if (url.startsWith(PREFIX))
                url = url.substr(PREFIX.length);
            else
                url = PREFIX + url;
            liberator.open(url, { hide: true });
        }
    },

    /**
     * Increases the zoom level of the current buffer.
     *
     * @param {number} steps The number of zoom levels to jump.
     * @param {boolean} fullZoom Whether to use full zoom or text zoom.
     */
    zoomIn: function (steps, fullZoom) {
        Buffer.bumpZoomLevel(steps, fullZoom);
    },

    /**
     * Decreases the zoom level of the current buffer.
     *
     * @param {number} steps The number of zoom levels to jump.
     * @param {boolean} fullZoom Whether to use full zoom or text zoom.
     */
    zoomOut: function (steps, fullZoom) {
        Buffer.bumpZoomLevel(-steps, fullZoom);
    }
}, {
    ZOOM_MIN: "ZoomManager" in window && Math.round(ZoomManager.MIN * 100),
    ZOOM_MAX: "ZoomManager" in window && Math.round(ZoomManager.MAX * 100),

    get focusedWindow() this.getFocusedWindow(),
    set focusedWindow(win) {
        if (win === document.commandDispatcher.focusedWindow) return;

        // XXX: if win has frame and win is not content's focus window, win.focus() cannot focus.
        var e = win.document.activeElement;
        if (e && e.contentWindow) {
            services.get("focus").clearFocus(win);
        }
        win.focus();
    },

    getFocusedWindow: function (win) {
        win = win || config.browser.contentWindow;
        let elem = win.document.activeElement;
        if (elem) {
            let doc;
            while (doc = elem.contentDocument) {
                elem = doc.activeElement;
            }
            return elem.ownerDocument.defaultView;
        } else
            return win;
    },

    setZoom: function setZoom(value, fullZoom, browser = config.tabbrowser.mCurrentBrowser) {
        liberator.assert(value >= Buffer.ZOOM_MIN || value <= Buffer.ZOOM_MAX,
            "Zoom value out of range (" + Buffer.ZOOM_MIN + " - " + Buffer.ZOOM_MAX + "%)");

        ZoomManager.useFullZoom = fullZoom;
        ZoomManager.zoom = value / 100;
        if ("FullZoom" in window)
            FullZoom._applyZoomToPref(browser);
        liberator.echomsg((fullZoom ? "Full" : "Text") + " zoom: " + value + "%");

        statusline.updateField("zoomlevel", value);
    },

    bumpZoomLevel: function bumpZoomLevel(steps, fullZoom) {
        let values = ZoomManager.zoomValues;
        let cur = values.indexOf(ZoomManager.snap(ZoomManager.zoom));
        let i = util.Math.constrain(cur + steps, 0, values.length - 1);

        if (i == cur && fullZoom == ZoomManager.useFullZoom)
            liberator.beep();

        Buffer.setZoom(Math.round(values[i] * 100), fullZoom);
    },

    checkScrollYBounds: function checkScrollYBounds(win, direction) {
        // NOTE: it's possible to have scrollY > scrollMaxY - FF bug?
        if (direction > 0 && win.scrollY >= win.scrollMaxY || direction < 0 && win.scrollY == 0)
            liberator.beep();
    },

    findScrollableWindow: function findScrollableWindow() {
        let win = this.focusedWindow;
        if (win && (win.scrollMaxX > 0 || win.scrollMaxY > 0))
            return win;

        win = config.browser.contentWindow;
        if (win.scrollMaxX > 0 || win.scrollMaxY > 0)
            return win;

        for (let frame in util.Array.itervalues(win.frames))
            if (frame.scrollMaxX > 0 || frame.scrollMaxY > 0)
                return frame;

        return win;
    },

    findScrollable: function findScrollable(dir = 0, horizontal) {
        let pos = "scrollTop", maxPos = "scrollTopMax", clientSize = "clientHeight";
        if (horizontal)
            pos = "scrollLeft", maxPos = "scrollLeftMax", clientSize = "clientWidth";

        function find(elem) {
            if (elem && !(elem instanceof Element))
                elem = elem.parentNode;

            for (; elem && elem.parentNode instanceof Element; elem = elem.parentNode) {
                if (elem[clientSize] == 0)
                    continue;
                if (dir < 0 && elem[pos] > 0 || dir > 0 && elem[pos] < elem[maxPos] || dir == 0 && elem[maxPos] > 0)
                    break;
            }
            return elem;
        }

        let win = this.focusedWindow;
        if (win.getSelection().rangeCount)
            var elem = find(win.getSelection().getRangeAt(0).startContainer);
        if (!(elem instanceof Element)) {
            let doc = Buffer.findScrollableWindow().document;
            elem = find(doc.body || doc.getElementsByTagName("body")[0] ||
                        doc.documentElement);
        }
        return elem;
    },

    scrollVertical: function scrollVertical(elem, increment, number) {
        elem = elem || Buffer.findScrollable(number, false);

        if (elem == null && buffer.loaded == 0) {
            liberator.echoerr("Page is still loading");
            return;
        }

        let fontSize = parseInt(util.computedStyle(elem).fontSize);
        if (increment == "lines")
            increment = fontSize;
        else if (increment == "pages")
            increment = elem.clientHeight - fontSize;
        else
            throw Error()

        elem.scrollTop += number * increment;
    },

    scrollHorizontal: function scrollHorizontal(elem, increment, number) {
        elem = elem || Buffer.findScrollable(number, true);

        if (elem == null && buffer.loaded == 0) {
            liberator.echoerr("Page is still loading");
            return;
        }

        let fontSize = parseInt(util.computedStyle(elem).fontSize);
        if (increment == "columns")
            increment = fontSize; // Good enough, I suppose.
        else if (increment == "pages")
            increment = elem.clientWidth - fontSize;
        else
            throw Error()

        elem.scrollLeft += number * increment;
    },

    scrollElemToPercent: function scrollElemToPercent(elem, horizontal, vertical) {
        elem = elem || Buffer.findScrollable();
        marks.add("'", true);

        if (horizontal != null)
            elem.scrollLeft = (elem.scrollWidth - elem.clientWidth) * (horizontal / 100);

        if (vertical != null)
            elem.scrollTop = (elem.scrollHeight - elem.clientHeight) * (vertical / 100);
    },

    scrollToPercent: function scrollToPercent(horizontal, vertical) {
        let win = Buffer.findScrollableWindow();
        let h, v;

        if (horizontal == null)
            h = win.scrollX;
        else
            h = win.scrollMaxX / 100 * horizontal;

        if (vertical == null)
            v = win.scrollY;
        else
            v = win.scrollMaxY / 100 * vertical;

        marks.add("'", true);
        win.scrollTo(h, v);
    },

    openUploadPrompt: function openUploadPrompt(elem) {
        commandline.input("Upload file: ", function (path) {
            let file = io.File(path);
            liberator.assert(file.exists());

            elem.value = file.path;
            elem.dispatchEvent(events.create(elem.ownerDocument, 'change', {}));
        }, {
            completer: completion.file,
            default: elem.value
        });
    }
}, {
    commands: function () {
        commands.add(["frameo[nly]"],
            "Show only the current frame's page",
            function (args) {
                liberator.open(buffer.localStore.focusedFrame.document.documentURI);
            },
            { argCount: "0" });

        commands.add(["ha[rdcopy]"],
            "Print current document",
            function (args) {
                let arg = args[0];

                // FIXME: arg handling is a bit of a mess, check for filename
                liberator.assert(!arg || arg[0] == ">" && !liberator.has("Windows"),
                    "Trailing characters");

                options.withContext(function () {
                    if (arg) {
                        options.setPref("print.print_to_file", "true");
                        options.setPref("print.print_to_filename", io.File(arg.substr(1)).path);
                        liberator.echomsg("Printing to file: " + arg.substr(1));
                    }
                    else
                        liberator.echomsg("Sending to printer...");

                    options.setPref("print.always_print_silent", args.bang);
                    options.setPref("print.show_print_progress", !args.bang);

                    config.browser.contentWindow.print();
                });

                if (arg)
                    liberator.echomsg("Printed: " + arg.substr(1));
                else
                    liberator.echomsg("Print job sent.");
            },
            {
                argCount: "?",
                literal: 0,
                bang: true
            });

        commands.add(["pa[geinfo]"],
            "Show various page information",
            function (args) { buffer.showPageInfo(true, args[0]); },
            {
                argCount: "?",
                completer: function (context) {
                    completion.optionValue(context, "pageinfo", "+", "");
                    context.title = ["Page Info"];
                }
            });

        commands.add(["pagest[yle]", "pas"],
            "Select the author style sheet to apply",
            function (args) {
                let arg = args.literalArg;

                let titles = buffer.alternateStyleSheets.map(function (stylesheet) stylesheet.title);

                liberator.assert(!arg || titles.indexOf(arg) >= 0,
                    "Invalid argument: " + arg);

                if (options.usermode)
                    options.usermode = false;

                window.stylesheetSwitchAll(config.browser.contentWindow, arg);
            },
            {
                argCount: "?",
                completer: function (context) completion.alternateStyleSheet(context),
                literal: 0
            });

        commands.add(["re[load]"],
            "Reload the current web page",
            function (args) { tabs.reload(config.browser.mCurrentTab, args.bang); },
            {
                bang: true,
                argCount: "0"
            });

        // TODO: we're prompted if download.useDownloadDir isn't set and no arg specified - intentional?
        commands.add(["sav[eas]", "w[rite]"],
            "Save current document to disk",
            function (args) {
                let doc = config.browser.contentDocument;
                let chosenData = null;
                let filename = args[0];

                if (filename) {
                    let file = io.File(filename);

                    if (file.exists() && file.isDirectory()) {
                        if (doc.doctype !== null) {
                            filename = OS.Path.join(filename, document.title + ".html");
                        } else {
                            filename = OS.Path.join(filename, filename = doc.location.pathname.split("/").pop());
                        }
                        file = io.File(filename)
                    }

                    liberator.assert(!file.exists() || args.bang, "File exists (add ! to override)");

                    chosenData = { file: file, uri: window.makeURI(doc.location.href, doc.characterSet) };
                }

                // if browser.download.useDownloadDir = false then the "Save As"
                // dialog is used with this as the default directory
                // TODO: if we're going to do this shouldn't it be done in setCWD or the value restored?
                options.setPref("browser.download.lastDir", io.getCurrentDirectory().path);

                try {
                    var contentDisposition = config.browser.contentWindow
                                                   .QueryInterface(Ci.nsIInterfaceRequestor)
                                                   .getInterface(Ci.nsIDOMWindowUtils)
                                                   .getDocumentMetadata("content-disposition");
                }
                catch (e) {}

                window.internalSave(doc.location.href, doc, null, contentDisposition,
                    doc.contentType, false, null, chosenData, doc.referrer ?
                    window.makeURI(doc.referrer) : null, doc, true);
            },
            {
                argCount: "?",
                bang: true,
                completer: function (context) completion.file(context)
            });

        commands.add(["st[op]"],
            "Stop loading the current web page",
            function () { tabs.stop(config.browser.mCurrentTab); },
            { argCount: "0" });

        commands.add(["vie[wsource]"],
            "View source code of current document",
            function (args) { buffer.viewSource(args[0], args.bang); },
            {
                argCount: "?",
                bang: true,
                completer: function (context) completion.url(context, "bhf")
            });

        commands.add(["zo[om]"],
            "Set zoom value of current web page",
            function (args) {
                let arg = args[0];
                let level;

                if (!arg)
                    level = 100;
                else if (/^\d+$/.test(arg))
                    level = parseInt(arg, 10);
                else if (/^[+-]\d+$/.test(arg)) {
                    if (args.bang)
                        level = buffer.fullZoom + parseInt(arg, 10);
                    else
                        level = buffer.textZoom + parseInt(arg, 10);

                    // relative args shouldn't take us out of range
                    level = util.Math.constrain(level, Buffer.ZOOM_MIN, Buffer.ZOOM_MAX);
                }
                else
                    liberator.assert(false, "Trailing characters");

                if (args.bang)
                    buffer.fullZoom = level;
                else
                    buffer.textZoom = level;
            },
            {
                argCount: "?",
                bang: true
            });
    },
    completion: function () {
        completion.alternateStyleSheet = function alternateStylesheet(context) {
            context.title = ["Stylesheet", "Location"];

            // unify split style sheets
            let styles = {};

            buffer.alternateStyleSheets.forEach(function (style) {
                if (!(style.title in styles))
                    styles[style.title] = [];

                styles[style.title].push(style.href || "inline");
            });
            context.completions = Object.keys(styles).map(s => [s, styles[s].join(", ")]);
        };

        const UNTITLED_LABEL = "(Untitled)";
        function getIndicator (tab) {
            if (tab == config.tabbrowser.mCurrentTab)
                return "%";
            else if (tab == tabs.alternate)
                return "#";
            return " ";
        }
        function getURLFromTab (tab) {
            if ("linkedBrowser" in tab) {
                if (tab.linkedBrowser.contentDocument) {
                    return tab.linkedBrowser.contentDocument.location.href;
                } else if (tab.linkedBrowser.lastURI.asciiSpec) {
                    return tab.linkedBrowser.lastURI.asciiSpec
                }
            } else {
                let i = config.tabbrowser.mTabContainer.getIndexOfItem(tab);
                let info = config.tabbrowser.tabInfo[i];
                return info.browser ?
                    info.browser.contentDocument.location.href :
                    info.mode.getBrowser(tab).contentDocument.location.href;
            }
        }

        function createItem (prefix, label, url, indicator, icon) {
            return {
                text: [prefix + label, prefix + url],
                url: template.highlightURL(url, true, "buffer-list"),
                indicator: indicator,
                icon: icon || DEFAULT_FAVICON
            };
        }

        function* generateTabs (tabs) {
            for (let i = 0, tab; tab = tabs[i]; i++) {
                let indicator = getIndicator(tab) + (tab.pinned ? "@" : " "),
                    label = tab.label || UNTITLED_LABEL,
                    url = getURLFromTab(tab),
                    index = ((tab._tPos || i) + 1) + ": ";
                let item = createItem(index, label, url, indicator, tab.image);
                if (!tab.pinned && tab._tabViewTabItem && tab._tabViewTabItem.parent) {
                    let groupName = tab._tabViewTabItem.parent.getTitle();
                    if (groupName) {
                        let prefix = groupName + "." + (i + 1) + ": ";
                        item.text.push(prefix + label, prefix + url);
                    }
                }
                yield item;
            }
        }
        function* generateGroupList (group, groupName) {
            let hasName = !!groupName;
            for (let [i, tabItem] in Iterator(group.getChildren())) {
                let index = (tabItem.tab._tPos + 1) + ": ",
                    label = tabItem.tab.label || UNTITLED_LABEL,
                    url = getURLFromTab(tabItem.tab);
                let item = createItem(index, label, url, getIndicator(tabItem.tab), tabItem.tab.image);
                if (hasName) {
                    let gPrefix = groupName + "." + (i + 1) + ": ";
                    item.text.push(gPrefix + label, gPrefix + url);
                }
                yield item;
            }
        }
        completion.buffer = function buffer(context, flags) {
            context.anchored = false;
            context.keys = { text: "text", description: "url", icon: "icon" };
            context.compare = CompletionContext.Sort.number;
            let process = context.process[0];
            context.process = [function (item, text)
                    xml`
                        <span highlight="Indicator" style="display: inline-block; width: 2ex; padding-right: 0.5ex; text-align: right">${item.item.indicator}</span>
                        ${ process.call(this, item, text) }
                    `];

            let tabs;
            if (!flags) {
                flags = this.buffer.VISIBLE;
                tabs = config.tabbrowser.mTabs;
            }

            if (flags & this.buffer.VISIBLE) {
                context.title = ["Buffers"];
                context.completions = Array.from(generateTabs(tabs || config.tabbrowser.visibleTabs));
            }

            if (!liberator.has("tabgroup") || !tabGroup.TV)
                return;

            let groups = tabGroup.tabView.GroupItems;
            if (flags & this.buffer.GROUPS) {
                let activeGroup = groups.getActiveGroupItem();
                let activeGroupId = activeGroup === null ? null : activeGroup.id;
                for (let group of groups.groupItems) {
                    if (group.id != activeGroupId) {
                        let groupName = group.getTitle();
                        context.fork("GROUP_" + group.id, 0, this, function (context) {
                            context.title = [groupName || UNTITLED_LABEL];
                            context.completions = Array.from(generateGroupList(group, groupName));
                        });
                    }
                }
            }
        };
        completion.buffer.ALL = 1 << 0 | 1 << 1 | 1 << 2;
        completion.buffer.VISIBLE = 1 << 0;
        completion.buffer.GROUPS  = 1 << 1;
    },
    events: function () {
        let browserWindow;
        if  (config.hostApplication == "Thunderbird") {
            browserWindow = "MsgStatusFeedback";
            let activityManager = Cc["@mozilla.org/activity-manager;1"].getService(Ci.nsIActivityManager);
            activityManager.removeListener(window.MsgStatusFeedback);
            this.progressListener = update(Object.create(window.MsgStatusFeedback), this.progressListener);
            statusFeedback.setWrappedStatusFeedback(this.progressListener);
            activityManager.addListener(this.progressListener);
        } else {
            browserWindow = "XULBrowserWindow";
            this.progressListener = update(Object.create(window.XULBrowserWindow), this.progressListener);
        }
        window[browserWindow] = this.progressListener;
        window.QueryInterface(Ci.nsIInterfaceRequestor)
              .getInterface(Ci.nsIWebNavigation)
              .QueryInterface(Ci.nsIDocShellTreeItem)
              .treeOwner
              .QueryInterface(Ci.nsIInterfaceRequestor)
              .getInterface(Ci.nsIXULWindow)
              .XULBrowserWindow = this.progressListener;

        try {
            config.browser.addProgressListener(this.progressListener);
        }
        catch (e) {} // Why? --djk

        let appContent = document.getElementById("appcontent");
        if (appContent) {
            events.addSessionListener(appContent, "DOMContentLoaded", this.closure.onDOMContentLoaded, true);
            events.addSessionListener(appContent, "load", this.closure.onPageLoad, true);
            events.addSessionListener(appContent, "scroll", this.closure._updateBufferPosition, false);
        }
    },
    mappings: function () {
        var myModes = config.browserModes;

        mappings.add(myModes, ["."],
            "Repeat the last key event",
            function (count) {
                if (mappings.repeat) {
                    for (let i of util.interruptibleRange(0, Math.max(count, 1), 100))
                        mappings.repeat();
                }
            },
            { count: true });

        mappings.add(myModes, ["c"],
            "Start caret mode",
            function () {
                if (Editor.windowIsEditable()) {
                    if (options.insertmode)
                        modes.set(modes.INSERT);
                    else if (Buffer.focusedWindow.getSelection().toString() != "")
                        modes.set(modes.VISUAL, modes.TEXTAREA);
                    else {
                        options.setPref("accessibility.browsewithcaret", true);
                        modes.main = modes.TEXTAREA;
                    }
                } else {
                    // setting this option notifies an observer which takes care of the
                    // mode setting
                    options.setPref("accessibility.browsewithcaret", true);
                }
            });

        mappings.add(myModes, ["<C-c>"],
            "Stop loading the current web page",
            function () {
                let controller = window.document.commandDispatcher.getControllerForCommand("cmd_copy");
                if (controller && controller.isCommandEnabled("cmd_copy")) {
                    controller.doCommand("cmd_copy");
                    // clear any selection made
                    let selection = Buffer.focusedWindow.getSelection();
                    try { // a simple if (selection) does not seem to work
                        selection.collapseToStart();
                    } catch (e) {}
                } else {
                    // stop loading page
                    tabs.stop(config.browser.mCurrentTab);
                }
            });

        // scrolling
        mappings.add(myModes, ["j", "<C-e>"],
            "Scroll document down",
            function (count) { buffer.scrollLines(Math.max(count, 1)); },
            { count: true });

        mappings.add(myModes, ["k", "<C-y>"],
            "Scroll document up",
            function (count) { buffer.scrollLines(-Math.max(count, 1)); },
            { count: true });

        mappings.add(myModes, ["h"], // <Left> is mapped implicitly by Firefox
            "Scroll document to the left",
            function (count) { buffer.scrollColumns(-Math.max(count, 1)); },
            { count: true });

        mappings.add(myModes, ["l"], // <Right> is mapped implicitly by Firefox
            "Scroll document to the right",
            function (count) { buffer.scrollColumns(Math.max(count, 1)); },
            { count: true });

        mappings.add(myModes, ["0", "^"],
            "Scroll to the absolute left of the document",
            function () { buffer.scrollStart(); });

        mappings.add(myModes, ["$"],
            "Scroll to the absolute right of the document",
            function () { buffer.scrollEnd(); });

        mappings.add(myModes, ["gg"], // <Home> is mapped implicitly by Firefox
            "Go to the top of the document",
            function (count) { buffer.scrollToPercent(buffer.scrollXPercent, Math.max(count, 0)); },
            { count: true });

        mappings.add(myModes, ["G"], // <End> is mapped implicitly by Firefox
            "Go to the end of the document",
            function (count) { buffer.scrollToPercent(buffer.scrollXPercent, count != null ? count : 100); },
            { count: true });

        mappings.add(myModes, ["%"],
            "Scroll to {count} percent of the document",
            function (count) {
                liberator.assert(count > 0 && count <= 100);
                buffer.scrollToPercent(buffer.scrollXPercent, count);
            },
            { count: true });

        mappings.add(myModes, ["<C-d>"],
            "Scroll window downwards in the buffer",
            function (count) { buffer._scrollByScrollSize(count, true); },
            { count: true });

        mappings.add(myModes, ["<C-u>"],
            "Scroll window upwards in the buffer",
            function (count) { buffer._scrollByScrollSize(count, false); },
            { count: true });

        mappings.add(myModes, ["<C-b>"], // <S-Space> and <PageUp> is mapped implicitly by Firefox
            "Scroll up a full page",
            function (count) { buffer.scrollPages(-Math.max(count, 1)); },
            { count: true });

        mappings.add(myModes, ["<C-f>",], // <Space> and <PageDown> is mapped implicitly by Firefox
            "Scroll down a full page",
            function (count) { buffer.scrollPages(Math.max(count, 1)); },
            { count: true });

        mappings.add(myModes, ["]f"],
            "Focus next frame",
            function (count) { buffer.shiftFrameFocus(Math.max(count, 1), true); },
            { count: true });

        mappings.add(myModes, ["[f"],
            "Focus previous frame",
            function (count) { buffer.shiftFrameFocus(Math.max(count, 1), false); },
            { count: true });

        mappings.add(myModes, ["]]"],
            "Follow the link labeled 'next' or '>' if it exists",
            function (count) { buffer.followDocumentRelationship("next"); },
            { count: true });

        mappings.add(myModes, ["[["],
            "Follow the link labeled 'prev', 'previous' or '<' if it exists",
            function (count) { buffer.followDocumentRelationship("prev", "previous"); },
            { count: true });

        mappings.add(myModes, ["gf"],
            "View source",
            function () { buffer.viewSource(null, false); });

        mappings.add(myModes, ["gF"],
            "View source with an external editor",
            function () { buffer.viewSource(null, true); });

        mappings.add(myModes, ["gi"],
            "Focus last used input field",
            function (count) {
                if (count < 1 && buffer.lastInputField)
                    buffer.focusElement(buffer.lastInputField);
                else {
                    let xpath = ["input[not(@type) or @type='text' or @type='password' or @type='file' or @type='datetime' or @type='datetime-local' or @type='date' or @type='month' or @type='time' or @type='week' or @type='number' or @type='range' or @type='email' or @type='url' or @type='search' or @type='tel' or @type='color']",
                                 "textarea[not(@disabled) and not(@readonly)]",
                                 "iframe"];

                    let elements = [];
                    for (let m in util.evaluateXPath(xpath)) {
                        if (m.getClientRects().length
                        && (!(m instanceof HTMLIFrameElement) || Editor.windowIsEditable(m.contentWindow)))
                            elements.push(m);
                    }

                    liberator.assert(elements.length > 0);
                    buffer.focusElement(elements[util.Math.constrain(count, 1, elements.length) - 1]);
                }
            },
            { count: true });

        mappings.add(myModes, ["gP"],
            "Open (put) a URL based on the current clipboard contents in a new buffer",
            function () {
                liberator.open(util.readFromClipboard(),
                    liberator[options.get("activate").has("paste") ? "NEW_BACKGROUND_TAB" : "NEW_TAB"]);
            });

        mappings.add(myModes, ["p", "<MiddleMouse>"],
            "Open (put) a URL based on the current clipboard contents in the current buffer",
            function () {
                let url = util.readFromClipboard();
                liberator.assert(url);
                liberator.open(url);
            });

        mappings.add(myModes, ["P"],
            "Open (put) a URL based on the current clipboard contents in a new buffer",
            function () {
                let url = util.readFromClipboard();
                liberator.assert(url);
                liberator.open(url, { from: "paste", where: liberator.NEW_TAB });
            });

        // reloading
        mappings.add(myModes, ["r"],
            "Reload the current web page",
            function () { tabs.reload(config.browser.mCurrentTab, false); });

        mappings.add(myModes, ["R"],
            "Reload while skipping the cache",
            function () { tabs.reload(config.browser.mCurrentTab, true); });

        // yanking
        mappings.add(myModes, ["Y"],
            "Copy selected text or current word",
            function () {
                let sel = buffer.getCurrentWord();
                liberator.assert(sel);
                util.copyToClipboard(sel, true);
            });

        // zooming
        mappings.add(myModes, ["zi", "+"],
            "Enlarge text zoom of current web page",
            function (count) { buffer.zoomIn(Math.max(count, 1), false); },
            { count: true });

        mappings.add(myModes, ["zm"],
            "Enlarge text zoom of current web page by a larger amount",
            function (count) { buffer.zoomIn(Math.max(count, 1) * 3, false); },
            { count: true });

        mappings.add(myModes, ["zo", "-"],
            "Reduce text zoom of current web page",
            function (count) { buffer.zoomOut(Math.max(count, 1), false); },
            { count: true });

        mappings.add(myModes, ["zr"],
            "Reduce text zoom of current web page by a larger amount",
            function (count) { buffer.zoomOut(Math.max(count, 1) * 3, false); },
            { count: true });

        mappings.add(myModes, ["zz"],
            "Set text zoom value of current web page",
            function (count) { buffer.textZoom = count > 1 ? count : 100; },
            { count: true });

        mappings.add(myModes, ["zI"],
            "Enlarge full zoom of current web page",
            function (count) { buffer.zoomIn(Math.max(count, 1), true); },
            { count: true });

        mappings.add(myModes, ["zM"],
            "Enlarge full zoom of current web page by a larger amount",
            function (count) { buffer.zoomIn(Math.max(count, 1) * 3, true); },
            { count: true });

        mappings.add(myModes, ["zO"],
            "Reduce full zoom of current web page",
            function (count) { buffer.zoomOut(Math.max(count, 1), true); },
            { count: true });

        mappings.add(myModes, ["zR"],
            "Reduce full zoom of current web page by a larger amount",
            function (count) { buffer.zoomOut(Math.max(count, 1) * 3, true); },
            { count: true });

        mappings.add(myModes, ["zZ"],
            "Set full zoom value of current web page",
            function (count) { buffer.fullZoom = count > 1 ? count : 100; },
            { count: true });

        // page info
        mappings.add(myModes, ["<C-g>"],
            "Print the current file name",
            function (count) { buffer.showPageInfo(false); },
            { count: true });

        mappings.add(myModes, ["g<C-g>"],
            "Print file information",
            function () { buffer.showPageInfo(true); commandline.show("pageinfo"); });
    },
    options: function () {
        options.add(["nextpattern"], // \u00BB is » (>> in a single char)
            "Patterns to use when guessing the 'next' page in a document sequence",
            "stringlist", "\\bnext\\b,^>$,^(>>|\u00BB)$,^(>|\u00BB),(>|\u00BB)$,\\bmore\\b");

        options.add(["prevpattern", "previouspattern"], // \u00AB is « (<< in a single char)
            "Patterns to use when guessing the 'previous' page in a document sequence",
            "stringlist", "\\bprev\\b|\\bprevious\\b,^<$,^(<<|\u00AB)$,^(<|\u00AB),(<|\u00AB)$");

        options.add(["pageinfo", "pa"],
            "Desired info in the :pageinfo output",
            "charlist", "gfm",
            {
                completer: function (context) {
                    return Object.keys(buffer.pageInfo).map(k => [k, buffer.pageInfo[k][1]]);
                }
            });

        options.add(["scroll", "scr"],
            "Number of lines to scroll with <C-u> and <C-d> commands",
            "number", 0,
            { validator: function (value) value >= 0 });

        options.add(["showstatuslinks", "ssli"],
            "Show the destination of the link under the cursor in the status bar",
            "number", 1,
            {
                completer: function (context) [
                    ["0", "Don't show link destination"],
                    ["1", "Show the link destination in the status line"],
                    ["2", "Show the link destination in the command line"],
                    ["3", "Show the link destination in the content area"]
                ]
            });

        // TODO: Fix the compose window
        if (!config.isComposeWindow) {
            options.add(["usermode", "um"],
                "Show current website with a minimal style sheet to make it easily accessible",
                "boolean", false,
                {
                    setter: function (value) config.browser.markupDocumentViewer.authorStyleDisabled = value,
                    getter: function () config.browser.markupDocumentViewer.authorStyleDisabled
                });
        }
    }
});

/* Expose Buffer constructor */
Object.defineProperty(modules, "Buffer", {
    value: Buffer,
    enumerable: true
});

// vim: set fdm=marker sw=4 ts=4 et:
