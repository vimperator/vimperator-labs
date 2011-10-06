// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
// Copyright (c) 2007-2009 by Doug Kearns <dougkearns@gmail.com>
// Copyright (c) 2008-2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.


/** @scope modules */

/**
 * @instance events
 */
const Events = Module("events", {
    requires: ["autocommands", "config"],

    init: function () {
        const self = this;

        this._fullscreen = window.fullScreen;
        this._lastFocus = null;
        this._currentMacro = "";
        this._lastMacro = "";

        this.sessionListeners = [];

        this._macros = storage.newMap("macros", { store: true, privateData: true });

        // NOTE: the order of ["Esc", "Escape"] or ["Escape", "Esc"]
        //       matters, so use that string as the first item, that you
        //       want to refer to within liberator's source code for
        //       comparisons like if (key == "<Esc>") { ... }
        this._keyTable = {
            add: ["Plus", "Add"],
            back_space: ["BS"],
            delete: ["Del"],
            escape: ["Esc", "Escape"],
            insert: ["Insert", "Ins"],
            left_shift: ["LT", "<"],
            return: ["Return", "CR", "Enter"],
            right_shift: [">"],
            space: ["Space", " "],
            subtract: ["Minus", "Subtract"]
        };

        this._code_key = {};
        this._key_code = {};

        for (let [k, v] in Iterator(KeyEvent))
            if (/^DOM_VK_(?![A-Z0-9]$)/.test(k)) {
                k = k.substr(7).toLowerCase();
                let names = [k.replace(/(^|_)(.)/g, function (m, n1, n2) n2.toUpperCase())
                              .replace(/^NUMPAD/, "k")];
                if (k in this._keyTable)
                    names = this._keyTable[k];
                this._code_key[v] = names[0];
                for (let [, name] in Iterator(names))
                    this._key_code[name.toLowerCase()] = v;
            }

        // HACK: as Gecko does not include an event for <, we must add this in manually.
        if (!("<" in this._key_code)) {
            this._key_code["<"] = 60;
            this._key_code["lt"] = 60;
            this._code_key[60] = "lt";
        }

        this._input = {
            buffer: "",                // partial command storage
            pendingMotionMap: null,    // e.g. "d{motion}" if we wait for a motion of the "d" command
            pendingArgMap: null,       // pending map storage for commands like m{a-z}
            count: null                // parsed count from the input buffer
        };

        // load all macros
        // setTimeout needed since io. is loaded after events.
        setTimeout(function () {
            try {
                let dirs = io.getRuntimeDirectories("macros");

                if (dirs.length > 0) {
                    for (let [, dir] in Iterator(dirs)) {
                         liberator.log("Sourcing macros directory: " + dir.path);

                        for (let file in dir.iterDirectory()) {
                            if (file.exists() && !file.isDirectory() && file.isReadable() &&
                                /^[\w_-]+(\.vimp)?$/i.test(file.leafName)) {
                                let name = file.leafName.replace(/\.vimp$/i, "");
                                this._macros.set(name, file.read().split("\n")[0]);

                                liberator.echomsg("Macro " + name + " added: " + this._macros.get(name));
                            }
                        }
                    }
                }
                else
                    liberator.log("No user macros directory found");
            }
            catch (e) {
                // thrown if directory does not exist
                liberator.log("Error sourcing macros directory: " + e);
            }
        }, 100);

        function wrapListener(method) {
            return function (event) {
                try {
                    self[method](event);
                }
                catch (e) {
                    if (e.message == "Interrupted")
                        liberator.echoerr("Interrupted");
                    else
                        liberator.echoerr("Processing " + event.type + " event: " + (e.echoerr || e));
                    liberator.echoerr(e);
                }
            };
        }

        this._wrappedOnKeyPress = wrapListener("onKeyPress");
        this._wrappedOnKeyUpOrDown = wrapListener("onKeyUpOrDown");
        this.addSessionListener(window, "keypress", this.closure._wrappedOnKeyPress, true);
        this.addSessionListener(window, "keydown", this.closure._wrappedOnKeyUpOrDown, true);
        this.addSessionListener(window, "keyup", this.closure._wrappedOnKeyUpOrDown, true);

        this._activeMenubar = false;
        this.addSessionListener(window, "popupshown", this.closure.onPopupShown, true);
        this.addSessionListener(window, "popuphidden", this.closure.onPopupHidden, true);
        this.addSessionListener(window, "DOMMenuBarActive", this.closure.onDOMMenuBarActive, true);
        this.addSessionListener(window, "DOMMenuBarInactive", this.closure.onDOMMenuBarInactive, true);
        this.addSessionListener(window, "resize", this.closure.onResize, true);

    },

    destroy: function () {
        liberator.log("Removing all event listeners");
        for (let args in values(this.sessionListeners))
            args[0].removeEventListener.apply(args[0], args.slice(1));
    },

    /**
     * Adds an event listener for this session and removes it on
     * liberator shutdown.
     *
     * @param {Element} target The element on which to listen.
     * @param {string} event The event to listen for.
     * @param {function} callback The function to call when the event is received.
     * @param {boolean} capture When true, listen during the capture
     *      phase, otherwise during the bubbling phase.
     */
    addSessionListener: function (target, event, callback, capture) {
        let args = Array.slice(arguments, 0);
        target.addEventListener.apply(target, args.slice(1));
        this.sessionListeners.push(args);
    },

    /**
     * @property {boolean} Whether synthetic key events are currently being
     *     processed.
     */
    feedingKeys: false,

    /**
     * Initiates the recording of a key event macro.
     *
     * @param {string} macro The name for the macro.
     */
    startRecording: function (macro) {
        // TODO: ignore this like Vim?
        liberator.assert(/[a-zA-Z0-9]/.test(macro), "Invalid register name: '" + macro + "'");

        modes.isRecording = true;

        if (/[A-Z]/.test(macro)) { // uppercase (append)
            this._currentMacro = macro.toLowerCase();
            if (!this._macros.get(this._currentMacro))
                this._macros.set(this._currentMacro, ""); // initialize if it does not yet exist
        }
        else {
            this._currentMacro = macro;
            this._macros.set(this._currentMacro, "");
        }
    },

    /**
     * Replays a macro.
     *
     * @param {string} The name of the macro to replay.
     * @returns {boolean}
     */
    playMacro: function (macro) {
        let res = false;
        if (!/[a-zA-Z0-9@]/.test(macro) && macro.length == 1) {
            liberator.echoerr("Invalid macro name: " + macro);
            return false;
        }

        if (macro == "@") { // use lastMacro if it's set
            if (!this._lastMacro) {
                liberator.echoerr("No previously used macro");
                return false;
            }
        }
        else {
            if (macro.length == 1)
                this._lastMacro = macro.toLowerCase(); // XXX: sets last played macro, even if it does not yet exist
            else
                this._lastMacro = macro; // e.g. long names are case sensitive
        }

        if (this._macros.get(this._lastMacro)) {
            // make sure the page is stopped before starting to play the macro
            try {
                window.getWebNavigation().stop(nsIWebNavigation.STOP_ALL);
            }
            catch (e) {}

            buffer.loaded = 1; // even if not a full page load, assume it did load correctly before starting the macro
            modes.isReplaying = true;
            res = events.feedkeys(this._macros.get(this._lastMacro), { noremap: true });
            modes.isReplaying = false;
        }
        else {
            liberator.echoerr("Macro not set: " + this._lastMacro);
        }
        return res;
    },

    /**
     * Returns all macros matching <b>filter</b>.
     *
     * @param {string} filter A regular expression filter string. A null
     *     filter selects all macros.
     */
    getMacros: function (filter) {
        if (!filter)
            return this._macros;

        let re = RegExp(filter);
        return ([macro, keys] for ([macro, keys] in this._macros) if (re.test(macro)));
    },

    /**
     * Deletes all macros matching <b>filter</b>.
     *
     * @param {string} filter A regular expression filter string. A null
     *     filter deletes all macros.
     */
    deleteMacros: function (filter) {
        let re = RegExp(filter);

        for (let [item, ] in this._macros) {
            if (re.test(item) || !filter)
                this._macros.remove(item);
        }
    },

    /**
     * Pushes keys onto the event queue from liberator. It is similar to
     * Vim's feedkeys() method, but cannot cope with 2 partially-fed
     * strings, you have to feed one parsable string.
     *
     * @param {string} keys A string like "2<C-f>" to push onto the event
     *     queue. If you want "<" to be taken literally, prepend it with a
     *     "\\".
     * @param {boolean} noremap Allow recursive mappings.
     * @param {boolean} silent Whether the command should be echoed to the
     *     command line.
     * @returns {boolean}
     */
    feedkeys: function (keys, noremap, quiet) {
        let doc = window.document;
        let view = window.document.defaultView;

        let wasFeeding = this.feedingKeys;
        this.feedingKeys = true;
        this.duringFeed = this.duringFeed || [];
        let wasQuiet  = commandline.quiet;
        if (quiet)
            commandline.quiet = quiet;

        try {
            feed: {
                liberator.threadYield(1, true);
                for (let [, evt_obj] in Iterator(events.fromString(keys))) {
                    let elem = liberator.focus || config.browser.contentWindow;
                    let evt = events.create(doc, "keypress", evt_obj);

                    if (typeof noremap == "object")
                        for (let [k, v] in Iterator(noremap))
                            evt[k] = v;
                    else
                        evt.noremap = !!noremap;
                    evt.isMacro = true;
                    // A special hack for liberator-specific key names.
                    if (evt_obj.liberatorString || evt_obj.liberatorShift) {
                        evt.liberatorString = evt_obj.liberatorString; // for key-less keypress events e.g. <Nop>
                        evt.liberatorShift = evt_obj.liberatorShift; // for untypable shift keys e.g. <S-1>
                        events.onKeyPress(evt);
                    }

                    else
                        elem.dispatchEvent(evt);

                    if (!this.feedingKeys)
                        break feed;

                    // Stop feeding keys if page loading failed.
                    if (modes.isReplaying && !this.waitForPageLoad())
                        break feed;
                }
                return true;
            }
        }
        finally {
            this.feedingKeys = wasFeeding;
            if (quiet)
                commandline.quiet = wasQuiet;

            if (this.duringFeed.length) {
                let duringFeed = this.duringFeed;
                this.duringFeed = [];
                for (let [, evt] in Iterator(duringFeed))
                    evt.target.dispatchEvent(evt);
            }
        }
    },

    /**
     * Creates an actual event from a pseudo-event object.
     *
     * The pseudo-event object (such as may be retrieved from events.fromString)
     * should have any properties you want the event to have.
     *
     * @param {Document} doc  The DOM document to associate this event with
     * @param {Type} type  The type of event (keypress, click, etc.)
     * @param {Object} opts  The pseudo-event.
     */
    create: function (doc, type, opts) {
        var DEFAULTS = {
            Key: {
                type: type,
                bubbles: true, cancelable: true,
                view: doc.defaultView,
                ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
                keyCode: 0, charCode: 0
            },
            Mouse: {
                type: type,
                bubbles: true, cancelable: true,
                view: doc.defaultView,
                detail: 1,
                screenX: 0, screenY: 0,
                clientX: 0, clientY: 0,
                ctrlKey: false, altKey: false, shiftKey: false, metaKey: false,
                button: 0,
                relatedTarget: null
            }
        };
        const TYPES = {
            click: "Mouse", mousedown: "Mouse", mouseup: "Mouse",
            mouseover: "Mouse", mouseout: "Mouse",
            keypress: "Key", keyup: "Key", keydown: "Key"
        };
        var t = TYPES[type];
        var evt = doc.createEvent(t + "Events");
        evt["init" + t + "Event"].apply(evt,
                [v for ([k, v] in Iterator(util.extend(DEFAULTS[t], opts)))]);
        return evt;
    },

    /**
     * Converts a user-input string of keys into a canonical
     * representation.
     *
     * <C-A> maps to <C-a>, <C-S-a> maps to <C-S-A>
     * <C- > maps to <C-Space>, <S-a> maps to A
     * << maps to <lt><lt>
     *
     * <S-@> is preserved, as in vim, to allow untypable key-combinations
     * in macros.
     *
     * canonicalKeys(canonicalKeys(x)) == canonicalKeys(x) for all values
     * of x.
     *
     * @param {string} keys Messy form.
     * @returns {string} Canonical form.
     */
    canonicalKeys: function (keys) {
        return events.fromString(keys).map(events.closure.toString).join("");
    },

    /**
     * Converts an event string into an array of pseudo-event objects.
     *
     * These objects can be used as arguments to events.toString or
     * events.create, though they are unlikely to be much use for other
     * purposes. They have many of the properties you'd expect to find on a
     * real event, but none of the methods.
     *
     * Also may contain two "special" parameters, .liberatorString and
     * .liberatorShift these are set for characters that can never by
     * typed, but may appear in mappings, for example <Nop> is passed as
     * liberatorString, and liberatorShift is set when a user specifies
     * <S-@> where @ is a non-case-changable, non-space character.
     *
     * @param {string} keys The string to parse.
     * @returns {Array[Object]}
     */
    fromString: function (input) {
        let out = [];

        let re = RegExp("<.*?>?>|[^<]|<(?!.*>)", "g");
        let match;
        while ((match = re.exec(input))) {
            let evt_str = match[0];
            let evt_obj = { ctrlKey: false, shiftKey: false, altKey: false, metaKey: false,
                            keyCode: 0, charCode: 0, type: "keypress" };

            if (evt_str.length > 1) { // <.*?>
                let [match, modifier, keyname] = evt_str.match(/^<((?:[CSMA]-)*)(.+?)>$/i) || [false, '', ''];
                modifier = modifier.toUpperCase();
                keyname = keyname.toLowerCase();

                if (keyname && !(keyname.length == 1 && modifier.length == 0 ||  // disallow <> and <a>
                    !(keyname.length == 1 || this._key_code[keyname] || keyname == "nop" || /mouse$/.test(keyname)))) { // disallow <misteak>
                    evt_obj.ctrlKey  = /C-/.test(modifier);
                    evt_obj.altKey   = /A-/.test(modifier);
                    evt_obj.shiftKey = /S-/.test(modifier);
                    evt_obj.metaKey  = /M-/.test(modifier);

                    if (keyname.length == 1) { // normal characters
                        if (evt_obj.shiftKey) {
                            keyname = keyname.toUpperCase();
                            if (keyname == keyname.toLowerCase())
                                evt_obj.liberatorShift = true;
                        }

                        evt_obj.charCode = keyname.charCodeAt(0);
                    }
                    else if (keyname == "nop") {
                        evt_obj.liberatorString = "<Nop>";
                    }
                    else if (/mouse$/.test(keyname)) { // mouse events
                        evt_obj.type = (/2-/.test(modifier) ? "dblclick" : "click");
                        evt_obj.button = ["leftmouse", "middlemouse", "rightmouse"].indexOf(keyname);
                        delete evt_obj.keyCode;
                        delete evt_obj.charCode;
                    }
                    else { // spaces, control characters, and <
                        evt_obj.keyCode = this._key_code[keyname];
                        evt_obj.charCode = 0;
                    }
                }
                else { // an invalid sequence starting with <, treat as a literal
                    out = out.concat(events.fromString("<lt>" + evt_str.substr(1)));
                    continue;
                }
            }
            else // a simple key (no <...>)
                evt_obj.charCode = evt_str.charCodeAt(0);

            // TODO: make a list of characters that need keyCode and charCode somewhere
            if (evt_obj.keyCode == 32 || evt_obj.charCode == 32)
                evt_obj.charCode = evt_obj.keyCode = 32; // <Space>
            if (evt_obj.keyCode == 60 || evt_obj.charCode == 60)
                evt_obj.charCode = evt_obj.keyCode = 60; // <lt>

            out.push(evt_obj);
        }
        return out;
    },

    /**
     * Converts the specified event to a string in liberator key-code
     * notation. Returns null for an unknown event.
     *
     * E.g. pressing ctrl+n would result in the string "<C-n>".
     *
     * @param {Event} event
     * @returns {string}
     */
    toString: function (event) {
        if (!event)
            return "[instance events]";

        if (event.liberatorString)
            return event.liberatorString;

        let key = null;
        let modifier = "";

        if (event.ctrlKey)
            modifier += "C-";
        if (event.altKey)
            modifier += "A-";
        if (event.metaKey)
            modifier += "M-";

        if (/^key/.test(event.type)) {
            let charCode = event.type == "keyup" ? 0 : event.charCode;
            if (charCode == 0) {
                if (event.shiftKey)
                    modifier += "S-";

                if (event.keyCode in this._code_key)
                    key = this._code_key[event.keyCode];
            }
            // [Ctrl-Bug] special handling of mysterious <C-[>, <C-\\>, <C-]>, <C-^>, <C-_> bugs (OS/X)
            //            (i.e., cntrl codes 27--31)
            // ---
            // For more information, see:
            //     [*] Vimp FAQ: http://vimperator.org/trac/wiki/Vimperator/FAQ#WhydoesntC-workforEscMacOSX
            //     [*] Referenced mailing list msg: http://www.mozdev.org/pipermail/vimperator/2008-May/001548.html
            //     [*] Mozilla bug 416227: event.charCode in keypress handler has unexpected values on Mac for Ctrl with chars in "[ ] _ \"
            //         https://bugzilla.mozilla.org/show_bug.cgi?query_format=specific&order=relevance+desc&bug_status=__open__&id=416227
            //     [*] Mozilla bug 432951: Ctrl+'foo' doesn't seem same charCode as Meta+'foo' on Cocoa
            //         https://bugzilla.mozilla.org/show_bug.cgi?query_format=specific&order=relevance+desc&bug_status=__open__&id=432951
            // ---
            //
            // The following fixes are only activated if liberator.has("MacUnix").
            // Technically, they prevent mappings from <C-Esc> (and
            // <C-C-]> if your fancy keyboard permits such things<?>), but
            // these <C-control> mappings are probably pathological (<C-Esc>
            // certainly is on Windows), and so it is probably
            // harmless to remove the has("MacUnix") if desired.
            //
            else if (liberator.has("MacUnix") && event.ctrlKey && charCode >= 27 && charCode <= 31) {
                if (charCode == 27) { // [Ctrl-Bug 1/5] the <C-[> bug
                    key = "Esc";
                    modifier = modifier.replace("C-", "");
                }
                else // [Ctrl-Bug 2,3,4,5/5] the <C-\\>, <C-]>, <C-^>, <C-_> bugs
                    key = String.fromCharCode(charCode + 64);
            }
            // a normal key like a, b, c, 0, etc.
            else if (charCode > 0) {
                key = String.fromCharCode(charCode);

                if (key in this._key_code) {
                    // a named charcode key (<Space> and <lt>) space can be shifted, <lt> must be forced
                    if ((key.match(/^\s$/) && event.shiftKey) || event.liberatorShift)
                        modifier += "S-";

                    key = this._code_key[this._key_code[key]];
                }
                else {
                    // a shift modifier is only allowed if the key is alphabetical and used in a C-A-M- mapping in the uppercase,
                    // or if the shift has been forced for a non-alphabetical character by the user while :map-ping
                    if ((key != key.toLowerCase() && (event.ctrlKey || event.altKey || event.metaKey)) || event.liberatorShift)
                        modifier += "S-";
                    else if  (modifier.length == 0)
                        return key;
                }
            }
            if (key == null)
                return null;
        }
        else if (event.type == "click" || event.type == "dblclick") {
            if (event.shiftKey)
                modifier += "S-";
            if (event.type == "dblclick")
                modifier += "2-";

            switch (event.button) {
            case 0:
                key = "LeftMouse";
                break;
            case 1:
                key = "MiddleMouse";
                break;
            case 2:
                key = "RightMouse";
                break;
            }
        }

        if (key == null)
            return null;

        return "<" + modifier + key + ">";
    },

    /**
     * Whether <b>key</b> is a key code defined to accept/execute input on
     * the command line.
     *
     * @param {string} key The key code to test.
     * @returns {boolean}
     */
    isAcceptKey: function (key) key == "<Return>" || key == "<C-j>" || key == "<C-m>",

    /**
     * Whether <b>key</b> is a key code defined to reject/cancel input on
     * the command line.
     *
     * @param {string} key The key code to test.
     * @returns {boolean}
     */
    isCancelKey: function (key) key == "<Esc>" || key == "<C-[>" || key == "<C-c>",

    /**
     * Waits for the current buffer to successfully finish loading. Returns
     * true for a successful page load otherwise false.
     *
     * @returns {boolean}
     */
    waitForPageLoad: function () {
        liberator.threadYield(true); // clear queue

        if (buffer.loaded == 1)
            return true;

        const maxWaitTime = 25;
        let start = Date.now();
        let end = start + (maxWaitTime * 1000); // maximum time to wait - TODO: add option
        let now;
        while (now = Date.now(), now < end) {
            liberator.threadYield();

            if (!events.feedingKeys)
                return false;

            if (buffer.loaded > 0) {
                liberator.sleep(250);
                break;
            }
            else
                liberator.echomsg("Waiting for page to load...");
        }
        modes.show();

        let ret = (buffer.loaded == 1);
        if (!ret)
            liberator.echoerr("Page did not load completely in " + maxWaitTime + " seconds. Macro stopped.");

        // sometimes the input widget had focus when replaying a macro
        // maybe this call should be moved somewhere else?
        // liberator.focusContent(true);

        return ret;
    },

    // argument "event" is deliberately not used, as i don't seem to have
    // access to the real focus target
    // Huh? --djk
    onFocusChange: function (event) {
        // command line has it's own focus change handler
        if (liberator.mode == modes.COMMAND_LINE)
            return;

        function hasHTMLDocument(win) win && win.document && win.document instanceof HTMLDocument

        let win  = window.document.commandDispatcher.focusedWindow;
        let elem = window.document.commandDispatcher.focusedElement;

        if (win && win.top == content && liberator.has("tabs"))
            tabs.localStore.focusedFrame = win;

        try {
            if (elem && elem.readOnly)
                return;

            if ((elem instanceof HTMLInputElement && /^(text|password|datetime|datetime-local|date|month|time|week|number|range|email|url|search|tel|color)$/.test(elem.type)) ||
                (elem instanceof HTMLSelectElement)) {
                liberator.mode = modes.INSERT;
                if (hasHTMLDocument(win))
                    buffer.lastInputField = elem;
                return;
            }
            if (elem instanceof HTMLEmbedElement || elem instanceof HTMLObjectElement) {
                liberator.mode = modes.EMBED;
                return;
            }

            if (elem instanceof HTMLTextAreaElement || (elem && elem.contentEditable == "true")) {
                if (options["insertmode"])
                    modes.set(modes.INSERT);
                else if (elem.selectionEnd - elem.selectionStart > 0)
                    modes.set(modes.VISUAL, modes.TEXTAREA);
                else
                    modes.main = modes.TEXTAREA;
                if (hasHTMLDocument(win))
                    buffer.lastInputField = elem;
                return;
            }

            if (Editor.windowIsEditable(win)) {
                if (options["insertmode"])
                    modes.set(modes.INSERT);
                else if (win.getSelection().toString() != "")
                    modes.set(modes.VISUAL, modes.TEXTAREA);
                else
                    modes.main = modes.TEXTAREA;
                buffer.lastInputField = win;
                return;
            }

            if (config.focusChange) {
                config.focusChange(win);
                return;
            }

            let urlbar = document.getElementById("urlbar");
            if (elem == null && urlbar && urlbar.inputField == this._lastFocus)
                liberator.threadYield(true);

            if (liberator.mode & (modes.EMBED | modes.INSERT | modes.TEXTAREA | modes.VISUAL))
                 modes.reset();
        }
        finally {
            this._lastFocus = elem;
        }
    },

    onSelectionChange: function (event) {
        let couldCopy = false;
        let controller = document.commandDispatcher.getControllerForCommand("cmd_copy");
        if (controller && controller.isCommandEnabled("cmd_copy"))
            couldCopy = true;

        if (liberator.mode != modes.VISUAL) {
            if (couldCopy) {
                if ((liberator.mode == modes.TEXTAREA ||
                     (modes.extended & modes.TEXTAREA))
                        && !options["insertmode"])
                    modes.set(modes.VISUAL, modes.TEXTAREA);
                else if (liberator.mode == modes.CARET)
                    modes.set(modes.VISUAL, modes.CARET);
            }
        }
        // XXX: disabled, as i think automatically starting visual caret mode does more harm than help
        // else
        // {
        //     if (!couldCopy && modes.extended & modes.CARET)
        //         liberator.mode = modes.CARET;
        // }
    },

    /**
     *  The global escape key handler. This is called in ALL modes.
     */
    onEscape: function () {
        if (modes.passNextKey || modes.passAllKeys)
            return;

        // always clear the commandline. Even if we are in
        // NORMAL mode, we might have a commandline visible,
        // e.g. after pressing 'n' to show the last search
        // again.
        commandline.clear();

        switch (liberator.mode) {
            case modes.NORMAL:
                // clear any selection made
                let selection = Buffer.focusedWindow.getSelection();
                try { // a simple if (selection) does not seem to work
                    selection.collapseToStart();
                } catch (e) {}

                // also clear any focus rectangle
                if (liberator.focus)
                    liberator.focus.blur();

                // select only one message in Muttator
                if (liberator.has("mail") && !config.isComposeWindow) {
                    let i = gDBView.selection.currentIndex;
                    if (i == -1 && gDBView.rowCount >= 0)
                        i = 0;
                    gDBView.selection.select(i);
                }

                //modes.reset(); // TODO: Needed?
                break;

            case modes.VISUAL:
                if (modes.extended & modes.TEXTAREA)
                    liberator.mode = modes.TEXTAREA;
                else if (modes.extended & modes.CARET)
                    liberator.mode = modes.CARET;
                break;

            case modes.CARET:
                // setting this option will trigger an observer which will
                // take care of all other details like setting the NORMAL
                // mode
                options.setPref("accessibility.browsewithcaret", false);
                break;

            case modes.TEXTAREA:
                // TODO: different behaviour for text areas and other input
                // fields seems unnecessarily complicated. If the user
                // likes Vi-mode then they probably like it for all input
                // fields, if not they can enter it explicitly for only
                // text areas.  The mode name TEXTAREA is confusing and
                // would be better replaced with something indicating that
                // it's a Vi editing mode. Extended modes really need to be
                // displayed too. --djk
                function isInputField() {
                    let elem = liberator.focus;
                    return (elem instanceof HTMLInputElement && !/image/.test(elem.type));
                }

                if (options["insertmode"] || isInputField())
                    liberator.mode = modes.INSERT;
                else
                    modes.reset();
                break;

            case modes.INSERT:
                if ((modes.extended & modes.TEXTAREA))
                    liberator.mode = modes.TEXTAREA;
                else
                    modes.reset();
                break;

            default: // HINTS, CUSTOM or COMMAND_LINE
                modes.reset();
                break;
        }

        // clear any command output, if we have any
        modes.show();
    },

    // this keypress handler gets always called first, even if e.g.
    // the commandline has focus
    // TODO: ...help me...please...
    onKeyPress: function (event) {
        function isEscapeKey(key) key == "<Esc>" || key == "<C-[>";

        function killEvent() {
            event.preventDefault();
            event.stopPropagation();
        }

        function updateCount(value) {
            events._input.count = parseInt(value, 10);
            if (isNaN(events._input.count))
                events._input.count = null;
        }

        let key = events.toString(event);
        if (!key)
             return;

        let url = typeof(buffer) != "undefined" ? buffer.URL : "";

        if (modes.isRecording) {
            if (key == "q" && liberator.mode != modes.INSERT && liberator.mode != modes.TEXTAREA) { // TODO: should not be hardcoded
                modes.isRecording = false;
                liberator.echomsg("Recorded macro '" + this._currentMacro + "'");
                killEvent();
                return;
            }
            else if (!mappings.hasMap(liberator.mode, this._input.buffer + key, url))
                this._macros.set(this._currentMacro, this._macros.get(this._currentMacro) + key);
        }

        if (key == "<C-c>")
            liberator.interrupted = true;

        // feedingKeys needs to be separate from interrupted so
        // we can differentiate between a recorded <C-c>
        // interrupting whatever it's started and a real <C-c>
        // interrupting our playback.
        if (events.feedingKeys && !event.isMacro) {
            if (key == "<C-c>") {
                events.feedingKeys = false;
                if (modes.isReplaying) {
                    modes.isReplaying = false;
                    this.setTimeout(function () { liberator.echomsg("Canceled playback of macro '" + this._lastMacro + "'"); }, 100);
                }
            }
            else
                events.duringFeed.push(event);

            killEvent();
            return;
        }

        try {
            let stop = false;
            let win = document.commandDispatcher.focusedWindow;

            // special mode handling
            if (modes.isMenuShown) { // menus have their own command handlers
                stop = true;
            } else if (modes.passNextKey) { // handle Escape-one-key mode ('i')
                modes.passNextKey = false;
                stop = true;
            } else if (modes.passAllKeys) { // handle Escape-all-keys mode (Shift-Esc)
                if (key == "<S-Esc>" || key == "<Insert>") // FIXME: Don't hardcode!
                    modes.passAllKeys = false;
                stop = true;
            }

            if (stop) {
                this._input.buffer = "";
                return;
            }

            stop = true; // set to false if we should NOT consume this event but let the host app handle it

            // just forward event without checking any mappings when the MOW is open
            if (liberator.mode == modes.COMMAND_LINE && (modes.extended & modes.OUTPUT_MULTILINE)) {
                commandline.onMultilineOutputEvent(event);
                throw killEvent();
            }

            // XXX: ugly hack for now pass certain keys to the host app as
            // they are without beeping also fixes key navigation in combo
            // boxes, submitting forms, etc.
            // FIXME: breaks iabbr for now --mst
            if (key in config.ignoreKeys && (config.ignoreKeys[key] & liberator.mode)) {
                this._input.buffer = "";
                return;
            }

            // TODO: handle middle click in content area

            if (!isEscapeKey(key)) {
                // custom mode...
                if (liberator.mode == modes.CUSTOM) {
                    plugins.onEvent(event);
                    throw killEvent();
                }

                // All of these special cases for hint mode are driving
                // me insane! -Kris
                if (modes.extended & modes.HINTS) {
                    // under HINT mode, certain keys are redirected to hints.onEvent
                    if (key == "<Return>" || key == "<Tab>" || key == "<S-Tab>"
                        || key == mappings.getMapLeader()
                        || (key == "<BS>" && hints.previnput == "number")
                        || (hints._isHintNumber(key) && !hints.escNumbers)) {
                        hints.onEvent(event);
                        this._input.buffer = "";
                        throw killEvent();
                    }

                    // others are left to generate the 'input' event or handled by the host app
                    return;
                }
            }

            // FIXME (maybe): (is an ESC or C-] here): on HINTS mode, it enters
            // into 'if (map && !skipMap) below. With that (or however) it
            // triggers the onEscape part, where it resets mode. Here I just
            // return true, with the effect that it also gets to there (for
            // whatever reason).  if that happens to be correct, well..
            // XXX: why not just do that as well for HINTS mode actually?

            if (liberator.mode == modes.CUSTOM)
                return;

            let inputStr = this._input.buffer + key;
            let countStr = inputStr.match(/^[1-9][0-9]*|/)[0];
            let candidateCommand = inputStr.substr(countStr.length);
            let map = mappings[event.noremap ? "getDefault" : "get"](liberator.mode, candidateCommand, url);

            let candidates = mappings.getCandidates(liberator.mode, candidateCommand, url);
            if (candidates.length == 0 && !map) {
                map = this._input.pendingMap;
                this._input.pendingMap = null;
                if (map && map.arg)
                    this._input.pendingArgMap = map;
            }

            // counts must be at the start of a complete mapping (10j -> go 10 lines down)
            if (countStr && !candidateCommand) {
                // no count for insert mode mappings
                if (!modes.mainMode.count || modes.mainMode.input)
                    stop = false;
                else
                    this._input.buffer = inputStr;
            }
            else if (this._input.pendingArgMap) {
                this._input.buffer = "";
                let map = this._input.pendingArgMap;
                this._input.pendingArgMap = null;
                if (!isEscapeKey(key)) {
                    if (modes.isReplaying && !this.waitForPageLoad())
                        return;
                    map.execute(null, this._input.count, key);
                }
            }
            // only follow a map if there isn't a longer possible mapping
            // (allows you to do :map z yy, when zz is a longer mapping than z)
            else if (map && !event.skipmap && candidates.length == 0) {
                this._input.pendingMap = null;
                updateCount(countStr);
                this._input.buffer = "";
                if (map.arg) {
                    this._input.buffer = inputStr;
                    this._input.pendingArgMap = map;
                }
                else if (this._input.pendingMotionMap) {
                    if (!isEscapeKey(key))
                        this._input.pendingMotionMap.execute(candidateCommand, this._input.count, null);
                    this._input.pendingMotionMap = null;
                }
                // no count support for these commands yet
                else if (map.motion) {
                    this._input.pendingMotionMap = map;
                }
                else {
                    if (modes.isReplaying && !this.waitForPageLoad())
                        throw killEvent();

                    let ret = map.execute(null, this._input.count);
                    if (map.route && ret)
                        stop = false;
                }
            }
            else if (candidates.length > 0 && !event.skipmap) {
                updateCount(countStr);
                this._input.pendingMap = map;
                this._input.buffer += key;
            }
            else { // if the key is neither a mapping nor the start of one
                // the mode checking is necessary so that things like g<esc> do not beep
                if (this._input.buffer != "" && !event.skipmap &&
                    (liberator.mode & (modes.INSERT | modes.COMMAND_LINE | modes.TEXTAREA)))
                    events.feedkeys(this._input.buffer, { noremap: true, skipmap: true });

                this._input.buffer = "";
                this._input.pendingArgMap = null;
                this._input.pendingMotionMap = null;
                this._input.pendingMap = null;

                if (!isEscapeKey(key)) {
                    // allow key to be passed to the host app if we can't handle it
                    stop = false;

                    if (liberator.mode == modes.COMMAND_LINE) {
                        if (!(modes.extended & modes.INPUT_MULTILINE))
                            commandline.onEvent(event); // reroute event in command line mode
                    }
                    // beep on unrecognized keys
                    /*else if (!modes.mainMode.input)
                         liberator.beep();*/
                }
            }

            if (stop)
                killEvent();
        }
        catch (e) {
            if (e !== undefined)
                liberator.echoerr(e);
        }
        finally {
            let motionMap = (this._input.pendingMotionMap && this._input.pendingMotionMap.names[0]) || "";
            if (!(modes.extended & modes.HINTS))
                statusline.updateInputBuffer(motionMap + this._input.buffer);
        }
    },

    // this is need for sites like msn.com which focus the input field on keydown
    onKeyUpOrDown: function (event) {
        if (modes.passNextKey || modes.passAllKeys || Events.isInputElemFocused())
            return;
        event.stopPropagation();
    },

    onPopupShown: function (event) {
        if (event.originalTarget.localName == "tooltip" || event.originalTarget.id == "liberator-visualbell")
            return;
        modes.isMenuShown = true;
    },

    onPopupHidden: function () {
        // gContextMenu is set to NULL, when a context menu is closed
        if ((window.gContextMenu == null || !window.gContextMenu.shouldDisplay) && !this._activeMenubar)
            modes.isMenuShown = false;
    },

    onDOMMenuBarActive: function () {
        this._activeMenubar = true;
        modes.isMenuShown = true;
    },

    onDOMMenuBarInactive: function () {
        this._activeMenubar = false;
        modes.isMenuShown = false;
    },

    onResize: function (event) {
        if (window.fullScreen != this._fullscreen) {
            this._fullscreen = window.fullScreen;
            liberator.triggerObserver("fullscreen", this._fullscreen);
            autocommands.trigger("Fullscreen", { state: this._fullscreen });
        }
    }
}, {
    isInputElemFocused: function () {
        let elem = liberator.focus;
        return ((elem instanceof HTMLInputElement && !/image/.test(elem.type)) ||
                 elem instanceof HTMLTextAreaElement ||
                 elem instanceof HTMLObjectElement ||
                 elem instanceof HTMLEmbedElement);
    }
}, {
    commands: function () {
        commands.add(["delmac[ros]"],
            "Delete macros",
            function (args) {
                liberator.assert(!args.bang || !args.string, "Invalid argument");

                if (args.bang)
                    events.deleteMacros();
                else if (args.string)
                    events.deleteMacros(args.string);
                else
                    liberator.echoerr("Argument required");
            }, {
                bang: true,
                completer: function (context) completion.macro(context)
            });

        commands.add(["mac[ros]"],
            "List all macros",
            function (args) { completion.listCompleter("macro", args[0]); }, {
                argCount: "?",
                completer: function (context) completion.macro(context)
            });

        commands.add(["pl[ay]"],
            "Replay a recorded macro",
            function (args) { events.playMacro(args[0]); }, {
                argCount: "1",
                completer: function (context) completion.macro(context)
            });
    },
    mappings: function () {
        mappings.add(modes.all,
            ["<Esc>", "<C-[>"], "Focus content",
            function () { events.onEscape(); });

        // add the ":" mapping in all but insert mode mappings
        mappings.add(modes.matchModes({ extended: false, input: false }),
            [":"], "Enter command line mode",
            function () { commandline.open("", "", modes.EX); });

        // focus events
        mappings.add([modes.NORMAL, modes.PLAYER, modes.VISUAL, modes.CARET],
            ["<Tab>"], "Advance keyboard focus",
            function () { document.commandDispatcher.advanceFocus(); });

        mappings.add([modes.NORMAL, modes.PLAYER, modes.VISUAL, modes.CARET, modes.INSERT, modes.TEXTAREA],
            ["<S-Tab>"], "Rewind keyboard focus",
            function () { document.commandDispatcher.rewindFocus(); });

        mappings.add(modes.all,
            ["<S-Esc>", "<Insert>"], "Temporarily ignore all " + config.name + " key bindings",
            function () { modes.passAllKeys = !modes.passAllKeys; });

        mappings.add([modes.NORMAL],
            ["i"], "Ignore next key and send it directly to the webpage",
            function () { modes.passNextKey = true; });

        mappings.add(modes.all,
            ["<Nop>"], "Do nothing",
            function () { return; });

        // macros
        mappings.add([modes.NORMAL, modes.PLAYER, modes.MESSAGE],
            ["q"], "Record a key sequence into a macro",
            function (arg) { events.startRecording(arg); },
            { arg: true });

        mappings.add([modes.NORMAL, modes.PLAYER, modes.MESSAGE],
            ["@"], "Play a macro",
            function (count, arg) {
                if (count < 1) count = 1;
                while (count-- && events.playMacro(arg))
                    ;
            },
            { arg: true, count: true });
    }
});

// vim: set fdm=marker sw=4 ts=4 et:
