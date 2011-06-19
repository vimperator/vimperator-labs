// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/** @scope modules */

/**
 * This class is used for prompting of user input and echoing of messages.
 *
 * It consists of a prompt and command field be sure to only create objects of
 * this class when the chrome is ready.
 */
const CommandLine = Module("commandline", {
    requires: ["config", "liberator", "modes", "services", "storage", "template", "util"],

    init: function () {
        const self = this;

        this._callbacks = {};

        storage.newArray("history-search", { store: true, privateData: true });
        storage.newArray("history-command", { store: true, privateData: true });

        // Really inideal.
        let services = modules.services; // Storage objects are global to all windows, 'modules' isn't.
        storage.newObject("sanitize", function () {
            ({
                CLEAR: "browser:purge-session-history",
                QUIT:  "quit-application",
                init: function () {
                    services.get("observer").addObserver(this, this.CLEAR, false);
                    services.get("observer").addObserver(this, this.QUIT, false);
                },
                observe: function (subject, topic, data) {
                    switch (topic) {
                    case this.CLEAR:
                        ["search", "command"].forEach(function (mode) {
                            CommandLine.History(null, mode).sanitize();
                        });
                        break;
                    case this.QUIT:
                        services.get("observer").removeObserver(this, this.CLEAR);
                        services.get("observer").removeObserver(this, this.QUIT);
                        break;
                    }
                }
            }).init();
        }, { store: false });
        storage.addObserver("sanitize",
            function (key, event, value) {
                autocommands.trigger("Sanitize", {});
            }, window);

        this._messageHistory = { //{{{
            _messages: [],
            get messages() {
                let max = options["messages"];

                // resize if 'messages' has changed
                if (this._messages.length > max)
                    this._messages = this._messages.splice(this._messages.length - max);

                return this._messages;
            },

            get length() this._messages.length,

            clear: function clear() {
                this._messages = [];
            },

            add: function add(message) {
                if (!message)
                    return;

                if (this._messages.length >= options["messages"])
                    this._messages.shift();

                this._messages.push(message);
            }
        }; //}}}

        this._lastMowOutput = null;

        this._silent = false;
        this._quiet = false;
        this._lastEcho = null;

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// TIMERS //////////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        this._statusTimer = new Timer(5, 100, function statusTell() {
            if (self._completions == null)
                return;
        });

        this._autocompleteTimer = new Timer(200, 500, function autocompleteTell(tabPressed) {
            if (!events.feedingKeys && self._completions && options["autocomplete"]) {
                self._completions.complete(true, false);
                self._completions.itemList.show();
            }
        });

        // This timer just prevents <Tab>s from queueing up when the
        // system is under load (and, thus, giving us several minutes of
        // the completion list scrolling). Multiple <Tab> presses are
        // still processed normally, as the time is flushed on "keyup".
        this._tabTimer = new Timer(0, 0, function tabTell(event) {
            if (self._completions)
                self._completions.tab(event.shiftKey);
        });

        /////////////////////////////////////////////////////////////////////////////}}}
        ////////////////////// VARIABLES ///////////////////////////////////////////////
        /////////////////////////////////////////////////////////////////////////////{{{

        this._completionList = ItemList("liberator-completions");
        this._completions = null;
        this._history = null;

        this._startHints = false; // whether we're waiting to start hints mode
        this._lastSubstring = "";

        // the label for showing the mode message
        this._modeWidget = document.getElementById("liberator-mode");
        // the containing box for the this._promptWidget and this._commandWidget
        this._commandlineWidget = document.getElementById("liberator-commandline");
        // the text part of the prompt for the current command, for example "Find" or "Follow hint". Can be blank
        this._promptWidget = document.getElementById("liberator-commandline-prompt-text");
        // the command bar which contains the current command
        this._commandWidget = document.getElementById("liberator-commandline-command");

        this._messageBox = document.getElementById("liberator-message");
        // this._messageBox.addEventListener("transitionend", this.close.bind(this), false);

        this._commandWidget.inputField.QueryInterface(Ci.nsIDOMNSEditableElement);

        // the widget used for multiline output
        this._multilineOutputWidget = document.getElementById("liberator-multiline-output");
        this._outputContainer = this._multilineOutputWidget.parentNode;

        this._multilineOutputWidget.contentDocument.body.id = "liberator-multiline-output-content";

        // the widget used for multiline intput
        this._multilineInputWidget = document.getElementById("liberator-multiline-input");

        // the widget used for bottombar
        this._bottomBarWidget = document.getElementById("liberator-bottombar");

        // we need to save the mode which we were in before opening the command line
        // this is then used if we focus the command line again without the "official"
        // way of calling "open"
        this._currentExtendedMode = null;     // the extended mode which we last openend the command line for
        this._currentPrompt = null;
        this._currentCommand = null;

        // save the arguments for the inputMultiline method which are needed in the event handler
        this._multilineRegexp = null;
        this._multilineCallback = null;

        this._input = {};

        this._commandlineDisplayTimeoutID = null;

        this.registerCallback("submit", modes.EX, function (command) {
            if (self._commandlineDisplayTimeoutID) {
                window.clearTimeout(self._commandlineDisplayTimeoutID);
                self._commandlineDisplayTimeoutID = null;
            }

            commands.repeat = command;
            liberator.trapErrors(function () liberator.execute(command));
            //if (!(modes.main == modes.COMMAND_LINE) && !commandline._commandlineWidget.classList.contains("hidden"))
            //    this.close();
        });
        this.registerCallback("complete", modes.EX, function (context) {
            context.fork("ex", 0, completion, "ex");
        });
        this.registerCallback("change", modes.EX, function (command) {
            self._autocompleteTimer.tell(false);
        });

        this.registerCallback("cancel", modes.PROMPT, cancelPrompt);
        this.registerCallback("submit", modes.PROMPT, closePrompt);
        this.registerCallback("change", modes.PROMPT, function (str) {
            if (self._input.complete)
                self._autocompleteTimer.tell(false);
            if (self._input.change)
                self._input.change.call(commandline, str);
        });
        this.registerCallback("complete", modes.PROMPT, function (context) {
            if (self._input.complete)
                context.fork("input", 0, commandline, self._input.complete);
        });

        this.hide();
        this._setHighlightGroup(this.HL_NORMAL);

        function cancelPrompt(value) {
            let callback = self._input.cancel;
            self._input = {};
            if (callback)
                callback.call(self, value != null ? value : commandline.command);
        }

        function closePrompt(value) {
            let callback = self._input.submit;
            self._input = {};
            if (callback)
                callback.call(self, value != null ? value : commandline.command);
        }
    },

    /**
     * Highlight the messageBox according to <b>group</b>.
     */
    _setHighlightGroup: function (group) {
        this._messageBox.setAttributeNS(NS.uri, "highlight", group);
        // also the underlying element needs to take on our color group
        // otherwise e.g. a red background doesn't stretch the whole width
        document.getElementById('liberator-statusline').setAttributeNS(NS.uri, "highlight", group);
    },

    /**
     * Determines whether the command line should be visible.
     *
     * @returns {boolean}
     */
    _commandShown: function () modes.main == modes.COMMAND_LINE &&
        !(modes.extended & (modes.INPUT_MULTILINE | modes.OUTPUT_MULTILINE)),

    /**
     * Set the command-line prompt.
     *
     * @param {string} val
     * @param {string} highlightGroup
     */
    _setPrompt: function (val, highlightGroup) {
        this._promptWidget.value = val;
        this._promptWidget.collapsed = (val == "");
        this._promptWidget.style.maxWidth = "-moz-calc(1em * " + val.length + ")";
    },

    /**
     * Set the command-line input value. The caret is reset to the
     * end of the line.
     *
     * @param {string} cmd
     */
    _setCommand: function (cmd) {
        this._commandWidget.value = cmd;
        this._commandWidget.selectionStart = cmd.length;
        this._commandWidget.selectionEnd = cmd.length;
    },

    /**
     * Display a message in the command-line area.
     *
     * @param {string} str
     * @param {string} highlightGroup
     * @param {boolean} forceSingle If provided, don't let over-long
     *     messages move to the MOW.
     */
    _echoLine: let (timeID = null) function (str, highlightGroup, forceSingle) {
        if (timeID) {
            window.clearTimeout(timeID);
            timeID = null;
        }
        if (this._messageBox.classList.contains("liberator-hiding"))
            this._messageBox.classList.remove("liberator-hiding");

        this._setHighlightGroup(highlightGroup);
        this._messageBox.value = str;
        if (str && options["messagetimeout"] != -1 &&
            [this.HL_INFOMSG, this.HL_WARNINGMSG].indexOf(highlightGroup) != -1)
            timeID = this.setTimeout(function(){ this._messageBox.classList.add("liberator-hiding"); },
                options["messagetimeout"]);

        liberator.triggerObserver("echoLine", str, highlightGroup, forceSingle);

        //if (!this._commandShown())
            ;//commandline.hide();

        /*let field = this._messageBox.inputField;
        if (!forceSingle && field.editor.rootElement.scrollWidth > field.scrollWidth)
            this._echoMultiline(<span highlight="Message">{str}</span>, highlightGroup);*/
    },

    /**
     * Display a multiline message.
     *
     * @param {string} str
     * @param {string} highlightGroup
     */
    // TODO: resize upon a window resize
    _echoMultiline: function (str, highlightGroup) {
        let doc = this._multilineOutputWidget.contentDocument;
        let win = this._multilineOutputWidget.contentWindow;

        liberator.triggerObserver("echoMultiline", str, highlightGroup);

        // If it's already XML, assume it knows what it's doing.
        // Otherwise, white space is significant.
        // The problem elsewhere is that E4X tends to insert new lines
        // after interpolated data.
        XML.ignoreWhitespace = typeof str != "xml";
        this._lastMowOutput = <div class="ex-command-output" style="white-space: nowrap" highlight={highlightGroup}>{template.maybeXML(str)}</div>;
        let output = util.xmlToDom(this._lastMowOutput, doc);
        XML.ignoreWhitespace = true;

        // FIXME: need to make sure an open MOW is closed when commands
        //        that don't generate output are executed
        //if (this._outputContainer.collapsed)
        doc.body.innerHTML = "";

        doc.body.appendChild(output);

        commandline.updateOutputHeight(true);

        if (win.scrollMaxY > 0) {
            // start the last executed command's output at the top of the screen
            let elements = doc.getElementsByClassName("ex-command-output");
            elements[elements.length - 1].scrollIntoView(true);
        }
        else
            win.scrollTo(0, doc.body.clientHeight);

        win.focus();

        this._startHints = false;
        modes.set(modes.COMMAND_LINE, modes.OUTPUT_MULTILINE);
    },

    /**
     * Ensure that the multiline input widget is the correct size.
     */
    _autosizeMultilineInputWidget: function () {
        let lines = this._multilineInputWidget.value.split("\n").length - 1;

        this._multilineInputWidget.setAttribute("rows", Math.max(lines, 1));
    },

    HL_NORMAL:     "Normal",
    HL_ERRORMSG:   "ErrorMsg",
    HL_MODEMSG:    "ModeMsg",
    HL_MOREMSG:    "MoreMsg",
    HL_QUESTION:   "Question",
    HL_INFOMSG:    "InfoMsg",
    HL_WARNINGMSG: "WarningMsg",
    HL_LINENR:     "LineNr",

    FORCE_MULTILINE    : 1 << 0,
    FORCE_SINGLELINE   : 1 << 1,
    DISALLOW_MULTILINE : 1 << 2, // if an echo() should try to use the single line
                                 // but output nothing when the MOW is open; when also
                                 // FORCE_MULTILINE is given, FORCE_MULTILINE takes precedence
    APPEND_TO_MESSAGES : 1 << 3, // add the string to the message this._history

    get completionContext() this._completions.context,

    get mode() (modes.extended == modes.EX) ? "cmd" : "search",

    get silent() this._silent,
    set silent(val) {
        this._silent = val;
        this._quiet = this._quiet;
    },
    get quiet() this._quiet,
    set quiet(val) {
        this._quiet = val;
        Array.forEach(document.getElementById("liberator-commandline").childNodes, function (node) {
            node.style.opacity = this._quiet || this._silent ? "0" : "";
        });
    },

    // @param type can be:
    //  "submit": when the user pressed enter in the command line
    //  "change"
    //  "cancel"
    //  "complete"
    registerCallback: function (type, mode, func) {
        if (!(type in this._callbacks))
            this._callbacks[type] = {};
        this._callbacks[type][mode] = func;
    },

    triggerCallback: function (type, mode, data) {
        if (type && mode && this._callbacks[type] && this._callbacks[type][mode])
            //this._callbacks[type][mode].call(this, data);
            this._callbacks[type][mode](data);
    },

    runSilently: function (func, self) {
        let wasSilent = this._silent;
        this._silent = true;
        try {
            func.call(self);
        }
        finally {
            this._silent = wasSilent;
        }
    },

    get command() {
        try {
            // The long path is because of complications with the
            // completion preview.
            return this._commandWidget.inputField.editor.rootElement.firstChild.textContent;
        }
        catch (e) {
            return this._commandWidget.value;
        }
    },
    set command(cmd) this._commandWidget.value = cmd,

    get message() this._messageBox.value,

    get messages() this._messageHistory,

    /**
     * Removes any previous output from the command line
     */
    clear: function() {
        this._commandWidget.value = "";
        this._echoLine(""); // this also resets a possible background color from echoerr()
    },

    /**
     * Show a mode message like "INSERT" in the command line
     */
    setModeMessage: function(message, style) {
        // we shouldn't need this check, but the XUL caching may not see this
        // widget until the cache is rebuilt! So at least we don't break modes completely
        if (this._modeWidget) {
            this._modeWidget.collapsed = !message;
            this._modeWidget.value = message;
        }
    },

    /**
     * Open the command line. The main mode is set to
     * COMMAND_LINE, the extended mode to <b>extendedMode</b>.
     * Further, callbacks defined for <b>extendedMode</b> are
     * triggered as appropriate (see {@link #registerCallback}).
     *
     * @param {string} prompt
     * @param {string} cmd
     * @param {number} extendedMode
     */
    open: function open(prompt, cmd, extendedMode) {
        if (this._commandlineDisplayTimeoutID) {
            window.clearTimeout(this._commandlineDisplayTimeoutID);
            this._commandlineDisplayTimeoutID = null;
        }

        // save the current prompts, we need it later if the command widget
        // receives focus without calling the this.open() method
        this._currentPrompt = prompt || "";
        this._currentCommand = cmd || "";
        this._currentExtendedMode = extendedMode || null;

        this._setPrompt(this._currentPrompt);
        this._setCommand(this._currentCommand);

        modes.set(modes.COMMAND_LINE, this._currentExtendedMode);

        this.show();

        this._history = CommandLine.History(this._commandWidget.inputField, (modes.extended == modes.EX) ? "command" : "search");
        this._completions = CommandLine.Completions(this._commandWidget.inputField);

        // open the completion list automatically if wanted
        if (cmd.length)
            commandline.triggerCallback("change", this._currentExtendedMode, cmd);
    },

    /**
     * Closes the command line. This is ordinarily triggered automatically
     * by a mode change. Will not hide the command line immediately if
     * called directly after a successful command, otherwise it will.
     */
    close: function close() {
        let mode = this._currentExtendedMode;
        this._currentExtendedMode = null;
        commandline.triggerCallback("cancel", mode); // FIXME

        if (this._history) {
            this._history.save();
            this._history = null;
        }

        // The completion things must be always reset
        this.resetCompletions(); // cancels any asynchronous completion still going on, must be before we set completions = null
        this._completionList.hide();
        this._completions = null;

        // liberator.log('closing with : ' + modes.main + "/" + modes.extended);
        // don't have input and output widget open at the same time
        if (modes.extended & modes.INPUT_MULTILINE)
            this._outputContainer.collapsed = true;
        else if (modes.extended & modes.OUTPUT_MULTILINE) {
            this._multilineInputWidget.collapsed = true;
            liberator.focusContent();
        } else {
            liberator.focusContent();
            this._multilineInputWidget.collapsed = true;
            this._outputContainer.collapsed = true;
            this.hide();
            //modes.pop(true);
            modes.reset();
        }
    },

    /**
     * Hides the command line, and shows any status messages that
     * are under it.
     */
    hide: function hide() {
        // liberator.log('hiding commandline');
        this._commandlineWidget.classList.add("hidden");
        this._commandWidget.blur();

        // needed for the sliding animation of the prompt text to be shown correctly
        // on subsequent calls
        this._setPrompt("");
    },

    /**
     * Make the command line visible, hiding the status messages below
     *
     * @param {string} text: Optionally set the command line's text to this string
     */
    show: function (text, prompt) {
        if (typeof(text) === "string")
            this._setCommand(text);
        if (typeof(prompt) === "string")
            this._setPrompt(prompt);

        this._commandlineWidget.classList.remove("hidden");
        this._commandWidget.focus();
    },


    /**
     * Output the given string onto the command line. With no flags, the
     * message will be shown in the status line if it's short enough to
     * fit, and contains no new lines, and isn't XML. Otherwise, it will be
     * shown in the MOW.
     *
     * @param {string} str
     * @param {string} highlightGroup The Highlight group for the
     *     message.
     * @default "Normal"
     * @param {number} flags Changes the behavior as follows:
     *   commandline.APPEND_TO_MESSAGES - Causes message to be added to the
     *          messages history, and shown by :messages.
     *   commandline.FORCE_SINGLELINE   - Forbids the command from being
     *          pushed to the MOW if it's too long or of there are already
     *          status messages being shown.
     *   commandline.DISALLOW_MULTILINE - Cancels the operation if the MOW
     *          is already visible.
     *   commandline.FORCE_MULTILINE    - Forces the message to appear in
     *          the MOW.
     */
    echo: function echo(str, highlightGroup, flags) {
        if ((flags & this.FORCE_SINGLELINE) && (flags & this.FORCE_MULTILINE))
            return liberator.echoerr("Conflicted flags argument for echo(): FORCE_SINGLELINE | FORCE_MULTILINE");

        // liberator.echo uses different order of flags as it omits the highlight group,
        // change commandline.echo argument order? --mst
        if (this._silent)
            return;

        highlightGroup = highlightGroup || this.HL_NORMAL;

        if (flags & this.APPEND_TO_MESSAGES)
            this._messageHistory.add({ str: str, highlight: highlightGroup });

        // The DOM isn't threadsafe. It must only be accessed from the main thread.
        liberator.callInMainThread(function () {
            if ((flags & this.DISALLOW_MULTILINE) && !this._outputContainer.collapsed)
                return;

            let single = flags & (this.FORCE_SINGLELINE | this.DISALLOW_MULTILINE);
            let action = this._echoLine;

            // TODO: this is all a bit convoluted - clean up.
            // assume that FORCE_MULTILINE output is fully styled
            if (!(flags & this.FORCE_MULTILINE) && !single && (!this._outputContainer.collapsed || this._messageBox.value == this._lastEcho)) {
                highlightGroup += " Message";
                action = this._echoMultiline;
            }

            if ((flags & this.FORCE_MULTILINE) || (/\n/.test(str) || typeof str == "xml") && !(flags & this.FORCE_SINGLELINE))
                action = this._echoMultiline;

            if (single)
                this._lastEcho = null;
            else {
                if (this._messageBox.value == this._lastEcho)
                    this._echoMultiline(<span highlight="Message">{this._lastEcho}</span>,
                        this._messageBox.getAttributeNS(NS.uri, "highlight"));
                this._lastEcho = (action == this._echoLine) && str;
            }

            if (action)
                action.call(this, str, highlightGroup, single);
        }, this);
    },

    /**
     * Prompt the user. Sets modes.main to COMMAND_LINE, which the user may
     * pop at any time to close the prompt.
     *
     * @param {string} prompt The input prompt to use.
     * @param {function(string)} callback
     * @param {Object} extra
     * @... {function} onChange - A function to be called with the current
     *     input every time it changes.
     * @... {function(CompletionContext)} completer - A completion function
     *     for the user's input.
     * @... {string} promptHighlight - The HighlightGroup used for the
     *     prompt. @default "Question"
     * @... {string} default - The initial value that will be returned
     *     if the user presses <CR> straightaway. @default ""
     */
    input: function _input(prompt, callback, extra) {
        extra = extra || {};

        this._input = {
            submit: callback,
            change: extra.onChange,
            complete: extra.completer,
            cancel: extra.onCancel
        };

        modes.set(modes.COMMAND_LINE, modes.PROMPT);
        this._currentExtendedMode = modes.PROMPT;

        this._setPrompt(prompt, extra.promptHighlight || this.HL_QUESTION);
        this._setCommand(extra.default || "");
        // this._commandlineWidget.collapsed = false;
        this.show();
        this._commandWidget.focus();

        this._completions = CommandLine.Completions(this._commandWidget.inputField);
    },

    /**
     * Get a multiline input from a user, up to but not including the line
     * which matches the given regular expression. Then execute the
     * callback with that string as a parameter.
     *
     * @param {RegExp} untilRegexp
     * @param {function(string)} callbackFunc
     */
    // FIXME: Buggy, especially when pasting. Shouldn't use a RegExp.
    inputMultiline: function inputMultiline(untilRegexp, callbackFunc) {
        modes.set(modes.COMMAND_LINE, modes.INPUT_MULTILINE);
        //this._currentExtendedMode = modes.PROMPT; // like in input: ?

        // save the arguments, they are needed in the event handler onEvent
        this._multilineRegexp = untilRegexp;
        this._multilineCallback = callbackFunc;

        this._multilineInputWidget.collapsed = false;
        this._multilineInputWidget.value = "";
        this._autosizeMultilineInputWidget();

        this.setTimeout(function () { this._multilineInputWidget.focus(); }, 10);
    },

    /**
     * Handles all command-line events. All key events are passed here when
     * COMMAND_LINE mode is active, as well as all input, keyup, focus, and
     * blur events sent to the command-line XUL element.
     *
     * @param {Event} event
     * @private
     */
    onEvent: function onEvent(event) {
        let command = this.command;

        if (event.type == "blur") {
            // prevent losing focus, there should be a better way, but it just didn't work otherwise
            this.setTimeout(function () {
                if (this._commandShown() && event.originalTarget == this._commandWidget.inputField)
                    this._commandWidget.inputField.focus();
            }, 0);
        }
        else if (event.type == "focus") {
            if (!this._commandShown() && event.target == this._commandWidget.inputField) {
                event.target.blur();
                liberator.beep();
            }
        }
        else if (event.type == "input") {
            this.resetCompletions();
            commandline.triggerCallback("change", this._currentExtendedMode, command);
        }
        else if (event.type == "keypress") {
            let key = events.toString(event);
            if (this._completions)
                this._completions.previewClear();
            if (!this._currentExtendedMode)
                return;

            // user pressed <Enter> to carry out a command
            // user pressing <Esc> is handled in the global onEscape
            //   FIXME: <Esc> should trigger "cancel" event
            if (events.isAcceptKey(key)) {
                //let currentExtendedMode = this._currentExtendedMode;
                //this._currentExtendedMode = null; // Don't let modes.pop trigger "cancel"
                commandline.triggerCallback("submit", this._currentExtendedMode, command);
                this.close();
            }
            // user pressed <Up> or <Down> arrow to cycle this._history completion
            else if (/^<(Up|Down|S-Up|S-Down|PageUp|PageDown)>$/.test(key)) {
                // prevent tab from moving to the next field
                event.preventDefault();
                event.stopPropagation();

                liberator.assert(this._history);
                this._history.select(/Up/.test(key), !/(Page|S-)/.test(key));
            }
            // user pressed <Tab> to get completions of a command
            else if (/^<(Tab|S-Tab)>$/.test(key)) {
                // prevent tab from moving to the next field
                event.preventDefault();
                event.stopPropagation();

                this._tabTimer.tell(event);
            }
            else if (key == "<BS>") {
                // reset the tab completion
                //this.resetCompletions();

                // and blur the command line if there is no text left
                if (command.length == 0) {
                    commandline.triggerCallback("cancel", this._currentExtendedMode);
                    //modes.pop();
                    modes.reset();
                }
            }
            else { // any other key
                //this.resetCompletions();
            }
            // allow this event to be handled by the host app
        }
        else if (event.type == "keyup") {
            let key = events.toString(event);
            if (/^<(Tab|S-Tab)>$/.test(key))
                this._tabTimer.flush();
        }
    },

    /**
     * Multiline input events, they will come straight from
     * #liberator-multiline-input in the XUL.
     *
     * @param {Event} event
     */
    onMultilineInputEvent: function onMultilineInputEvent(event) {
        if (event.type == "keypress") {
            let key = events.toString(event);
            if (events.isAcceptKey(key)) {
                let text = this._multilineInputWidget.value.substr(0, this._multilineInputWidget.selectionStart);
                if (text.match(this._multilineRegexp)) {
                    text = text.replace(this._multilineRegexp, "");
                    modes.reset();
                    this._multilineInputWidget.collapsed = true;
                    this._multilineCallback.call(this, text);
                }
            }
            else if (events.isCancelKey(key)) {
                modes.reset();
                this._multilineInputWidget.collapsed = true;
            }
        }
        else if (event.type == "blur") {
            if (modes.extended & modes.INPUT_MULTILINE)
                this.setTimeout(function () { this._multilineInputWidget.inputField.focus(); }, 0);
        }
        else if (event.type == "input")
            this._autosizeMultilineInputWidget();
        return true;
    },

    /**
     * Handle events when we are in multiline output mode, these come from
     * liberator when modes.extended & modes.MULTILINE_OUTPUT and also from
     * #liberator-multiline-output in the XUL.
     *
     * @param {Event} event
     */
    onMultilineOutputEvent: function onMultilineOutputEvent(event) {
        let win = this._multilineOutputWidget.contentWindow;
        let key = events.toString(event);

        if (event.type == "click" && event.target instanceof HTMLAnchorElement) {
            function openLink(where) {
                event.preventDefault();
                // FIXME: Why is this needed? --djk
                if (event.target.getAttribute("href") == "#")
                    liberator.open(event.target.textContent, where);
                else
                    liberator.open(event.target.href, where);
            }

            switch (key) {
                case "<LeftMouse>":
                    if (event.originalTarget.getAttributeNS(NS.uri, "highlight") == "URL buffer-list") {
                        event.preventDefault();
                        tabs.select(parseInt(event.originalTarget.parentNode.parentNode.firstChild.textContent, 10) - 1, false, true);
                    }
                    else
                        openLink(liberator.CURRENT_TAB);
                    break;
                case "<MiddleMouse>":
                case "<C-LeftMouse>":
                case "<C-M-LeftMouse>":
                    openLink(liberator.NEW_BACKGROUND_TAB);
                    break;
                case "<S-MiddleMouse>":
                case "<C-S-LeftMouse>":
                case "<C-M-S-LeftMouse>":
                    openLink(liberator.NEW_TAB);
                    break;
                case "<S-LeftMouse>":
                    openLink(liberator.NEW_WINDOW);
                    break;
            }

            return;
        }

        if (this._startHints) {
            statusline.updateInputBuffer("");
            this._startHints = false;
            hints.show(key, undefined, win);
            return;
        }

        function isScrollable() { if (win.scrollMaxY == 0) liberator.beep(); return !win.scrollMaxY == 0; }
        function atEnd() win.scrollY / win.scrollMaxY >= 1;

        let showHelp = false;
        switch (key) {
            // close the window
            case "<Esc>":
            case "q":
                modes.reset();
                return; // handled globally in events.js:onEscape()

            // reopen command line
            case ":":
                commandline.open("", "", modes.EX);
                break;

            // extended hint modes
            case ";":
                statusline.updateInputBuffer(";");
                this._startHints = true;
                break;

            // down a line
            case "j":
            case "<Down>":
            case "<C-j>":
            case "<C-m>":
            case "<Return>":
                if (isScrollable())
                    win.scrollByLines(1);
                break;

            // up a line
            case "k":
            case "<Up>":
            case "<BS>":
                if (isScrollable())
                    win.scrollByLines(-1);
                break;

            // half page down
            case "d":
                if (isScrollable())
                    win.scrollBy(0, win.innerHeight / 2);
                break;

            // half page up
            case "u":
                if (isScrollable())
                    win.scrollBy(0, -(win.innerHeight / 2));
                break;

            // page down
            case "f":
            case "<C-f>":
            case "<Space>":
            case "<PageDown>":
                if (isScrollable())
                    win.scrollByPages(1);
                break;

            // page up
            case "b":
            case "<C-f>":
            case "<PageUp>":
                if (isScrollable())
                    win.scrollByPages(-1);
                break;

            // top of page
            case "g":
            case "<Home>":
                if (isScrollable())
                    win.scrollTo(0, 0);
                break;

            // bottom of page
            case "G":
            case "<End>":
                if (isScrollable())
                    win.scrollTo(0, win.scrollMaxY);
                break;

            // unmapped key -> show Help
            default:
                showHelp = true;
        }

        if (showHelp) {
            this.hide(); // hide the command line
            this._echoLine("SPACE/d/j: screen/page/line down | b/u/k: screen/page/line up | HOME/g: top | END/G: bottom | ;f: follow hint | ESC/q: quit", this.HL_MOREMSG, true);
        } else {
            this.show();
        }
    },

    getSpaceNeeded: function getSpaceNeeded() {
        let rect = this._commandlineWidget.getBoundingClientRect();
        let offset = rect.bottom - window.innerHeight;
        return Math.max(0, offset);
    },

    /**
     * Changes the height of the message window to fit in the available space.
     *
     * @param {boolean} open If true, the widget will be opened if it's not
     *     already so.
     */
    updateOutputHeight: function updateOutputHeight(open) {
        if (!open && this._outputContainer.collapsed)
            return;

        let doc = this._multilineOutputWidget.contentDocument;

        // xxx:
        //let availableHeight = config.outputHeight;
        //if (!this._outputContainer.collapsed)
        //    availableHeight += parseFloat(this._outputContainer.height);
        doc.body.style.minWidth = this._commandlineWidget.scrollWidth + "px";
        this._outputContainer.style.bottom = this.bottombarPosition;
        this._outputContainer.style.maxHeight =
            (this._outputContainer.height = Math.min(doc.body.clientHeight, config.outputHeight)) + "px";
        doc.body.style.minWidth = "";
        this._outputContainer.collapsed = false;
    },

    resetCompletions: function resetCompletions() {
        if (this._completions) {
            this._completions.context.cancelAll();
            this._completions.wildIndex = -1;
            this._completions.previewClear();
        }
        if (this._history)
            this._history.reset();
    },

    // related floatbox
    get bottombarPosition() (document.documentElement.boxObject.height - this._bottomBarWidget.boxObject.y) + "px",
}, {
    /**
     * A class for managing the history of an input field.
     *
     * @param {HTMLInputElement} inputField
     * @param {string} mode The mode for which we need history.
     */
    History: Class("History", {
        init: function (inputField, mode) {
            this.mode = mode;
            this.input = inputField;
            this.store = storage["history-" + mode];
            this.reset();
        },
        /**
         * Reset the history index to the first entry.
         */
        reset: function () {
            this.index = null;
        },
        /**
         * Save the last entry to the permanent store. All duplicate entries
         * are removed and the list is truncated, if necessary.
         */
        save: function () {
            if (events.feedingKeys)
                return;
            let str = this.input.value;
            if (/^\s*$/.test(str))
                return;
            this.store.mutate("filter", function (line) (line.value || line) != str);
            this.store.push({ value: str, timestamp: Date.now(), privateData: this.checkPrivate(str) });
            this.store.truncate(options["history"], true);
        },
        /**
         * @property {function} Returns whether a data item should be
         * considered private.
         */
        checkPrivate: function (str) {
            // Not really the ideal place for this check.
            if (this.mode == "command")
                return (commands.get(commands.parseCommand(str)[1]) || {}).privateData;
            return false;
        },
        /**
         * Removes any private data from this history.
         */
        sanitize: function (timespan) {
            let range = [0, Number.MAX_VALUE];
            if (liberator.has("sanitizer") && (timespan || options["sanitizetimespan"]))
                range = sanitizer.getClearRange(timespan || options["sanitizetimespan"]);

            const self = this;
            this.store.mutate("filter", function (item) {
                let timestamp = (item.timestamp || Date.now()/1000) * 1000;
                return !line.privateData || timestamp < self.range[0] || timestamp > self.range[1];
            });
        },
        /**
         * Replace the current input field value.
         *
         * @param {string} val The new value.
         */
        replace: function (val) {
            this.input.value = val;
            commandline.triggerCallback("change", this._currentExtendedMode, val);
        },

        /**
         * Move forward or backward in history.
         *
         * @param {boolean} backward Direction to move.
         * @param {boolean} matchCurrent Search for matches starting
         *      with the current input value.
         */
        select: function (backward, matchCurrent) {
            // always reset the tab completion if we use up/down keys
            commandline._completions.reset();

            let diff = backward ? -1 : 1;

            if (this.index == null) {
                this.original = this.input.value;
                this.index = this.store.length;
            }

            // search the this._history for the first item matching the current
            // commandline string
            while (true) {
                this.index += diff;
                if (this.index < 0 || this.index > this.store.length) {
                    this.index = util.Math.constrain(this.index, 0, this.store.length);
                    liberator.beep();
                    // I don't know why this kludge is needed. It
                    // prevents the caret from moving to the end of
                    // the input field.
                    if (this.input.value == "") {
                        this.input.value = " ";
                        this.input.value = "";
                    }
                    break;
                }

                let hist = this.store.get(this.index);
                // user pressed DOWN when there is no newer this._history item
                if (!hist)
                    hist = this.original;
                else
                    hist = (hist.value || hist);

                if (!matchCurrent || hist.substr(0, this.original.length) == this.original) {
                    this.replace(hist);
                    break;
                }
            }
        }
    }),

    /**
     * A class for tab completions on an input field.
     *
     * @param {Object} input
     */
    Completions: Class("Completions", {
        init: function (input) {
            this.context = CompletionContext(input);
            this.context.onUpdate = this.closure._reset;
            this.editor = input.editor;
            this.selected = null;
            this.wildmode = options.get("wildmode");
            this.itemList = commandline._completionList;
            this.itemList.setItems(this.context);
            this.reset();
        },

        UP: {},
        DOWN: {},
        PAGE_UP: {},
        PAGE_DOWN: {},
        RESET: null,

        get completion() {
            let str = commandline.command;
            return str.substring(this.prefix.length, str.length - this.suffix.length);
        },
        set completion(completion) {
            this.previewClear();

            // Change the completion text.
            // The second line is a hack to deal with some substring
            // preview corner cases.
            let (str = this.prefix + completion + this.suffix) {
                commandline._commandWidget.value = str;
                this.editor.selection.focusNode.textContent = str;
            }

            // Reset the caret to one position after the completion.
            this.caret = this.prefix.length + completion.length;
        },

        get caret() commandline._commandWidget.selectionEnd,
        set caret(offset) {
            commandline._commandWidget.selectionStart = offset;
            commandline._commandWidget.selectionEnd = offset;
        },

        get start() this.context.allItems.start,

        get items() this.context.allItems.items,

        get substring() this.context.longestAllSubstring,

        get wildtype() this.wildtypes[this.wildIndex] || "",

        get type() ({
            list:    this.wildmode.checkHas(this.wildtype, "list"),
            longest: this.wildmode.checkHas(this.wildtype, "longest"),
            first:   this.wildmode.checkHas(this.wildtype, ""),
            full:    this.wildmode.checkHas(this.wildtype, "full")
        }),

        complete: function complete(show, tabPressed) {
            this.context.reset();
            this.context.tabPressed = tabPressed;
            commandline.triggerCallback("complete", commandline._currentExtendedMode, this.context);
            this.context.updateAsync = true;
            this.reset(show, tabPressed);
            this.wildIndex = 0;
        },

        preview: function preview() {
            this.previewClear();
            if (this.wildIndex < 0 || this.suffix || !this.items.length)
                return;

            let substring = "";
            switch (this.wildtype.replace(/.*:/, "")) {
            case "":
                substring = this.items[0].text;
                break;
            case "longest":
                if (this.items.length > 1) {
                    substring = this.substring;
                    break;
                }
                // Fallthrough
            case "full":
                let item = this.items[this.selected != null ? this.selected + 1 : 0];
                if (item)
                    substring = item.text;
                break;
            }

            // Don't show 1-character substrings unless we've just hit backspace
            if (substring.length < 2 && (!this._lastSubstring || this._lastSubstring.indexOf(substring) != 0))
                return;
            this._lastSubstring = substring;

            let value = this.completion;
            if (util.compareIgnoreCase(value, substring.substr(0, value.length)))
                return;
            substring = substring.substr(value.length);
            this.removeSubstring = substring;

            let node = util.xmlToDom(<span highlight="Preview">{substring}</span>,
                document);
            let start = this.caret;
            this.editor.insertNode(node, this.editor.rootElement, 1);
            this.caret = start;
        },

        previewClear: function previewClear() {
            let node = this.editor.rootElement.firstChild;
            if (node && node.nextSibling) {
                try {
                    this.editor.deleteNode(node.nextSibling);
                }
                catch (e) {
                    node.nextSibling.textContent = "";
                }
            }
            else if (this.removeSubstring) {
                let str = this.removeSubstring;
                let cmd = commandline._commandWidget.value;
                if (cmd.substr(cmd.length - str.length) == str)
                    commandline._commandWidget.value = cmd.substr(0, cmd.length - str.length);
            }
            delete this.removeSubstring;
        },

        reset: function reset(show) {
            this.wildIndex = -1;

            this.prefix = this.context.value.substring(0, this.start);
            this.value  = this.context.value.substring(this.start, this.caret);
            this.suffix = this.context.value.substring(this.caret);

            if (show) {
                this.itemList.reset();
                this.selected = null;
                this.wildIndex = 0;
            }

            this.wildtypes = this.wildmode.values;
            this.preview();
        },

        // FIXME: having reset() and _reset() really sucks!
        _reset: function _reset() {
            this.prefix = this.context.value.substring(0, this.start);
            this.value  = this.context.value.substring(this.start, this.caret);
            this.suffix = this.context.value.substring(this.caret);

            if (this.selected >= this.items.length)
                this.selected = null;

            this.itemList.reset();
            this.itemList.selectItem(this.selected);

            this.preview();
        },

        select: function select(idx) {
            switch (idx) {
            case this.UP:
                if (this.selected == null)
                    idx = -2;
                else
                    idx = this.selected - 1;
                break;
            case this.DOWN:
                if (this.selected == null)
                    idx = 0;
                else
                    idx = this.selected + 1;
                break;
            case this.RESET:
                idx = null;
                break;
            default:
                idx = util.Math.constrain(idx, 0, this.items.length - 1);
                break;
            }

            if (idx == -1 || this.items.length && idx >= this.items.length || idx == null) {
                // Wrapped. Start again.
                this.selected = null;
                this.completion = this.value;
            }
            else {
                // Wait for contexts to complete if necessary.
                // FIXME: Need to make idx relative to individual contexts.
                let list = this.context.contextList;
                if (idx == -2)
                    list = list.slice().reverse();
                let n = 0;
                try {
                    this.waiting = true;
                    for (let [, context] in Iterator(list)) {
                        function done() !(idx >= n + context.items.length || idx == -2 && !context.items.length);
                        while (context.incomplete && !done())
                            liberator.threadYield(false, true);

                        if (done())
                            break;

                        n += context.items.length;
                    }
                }
                finally {
                    this.waiting = false;
                }

                // See previous FIXME. This will break if new items in
                // a previous context come in.
                if (idx < 0)
                    idx = this.items.length - 1;
                if (this.items.length == 0)
                    return;

                this.selected = idx;
                this.completion = this.items[idx].text;
            }

            this.itemList.selectItem(idx);
        },

        tabs: [],

        tab: function tab(reverse) {
            commandline._autocompleteTimer.flush();
            // Check if we need to run the completer.
            if (this.context.waitingForTab || this.wildIndex == -1)
                this.complete(true, true);

            this.tabs.push(reverse);
            if (this.waiting)
                return;

            while (this.tabs.length) {
                reverse = this.tabs.shift();
                switch (this.wildtype.replace(/.*:/, "")) {
                case "":
                    this.select(0);
                    break;
                case "longest":
                    if (this.items.length > 1) {
                        if (this.substring && this.substring != this.completion)
                            this.completion = this.substring;
                        break;
                    }
                    // Fallthrough
                case "full":
                    this.select(reverse ? this.UP : this.DOWN);
                    break;
                }

                if (this.type.list)
                    this.itemList.show();

                this.wildIndex = util.Math.constrain(this.wildIndex + 1, 0, this.wildtypes.length - 1);
                this.preview();

                commandline._statusTimer.tell();
            }

            if (this.items.length == 0)
                liberator.beep();
        }
    }),

    /**
     * eval() a JavaScript expression and return a string suitable
     * to be echoed.
     *
     * @param {string} arg
     * @param {boolean} useColor When true, the result is a
     *     highlighted XML object.
     */
    echoArgumentToString: function (arg, useColor) {
        if (!arg)
            return "";

        try {
            arg = liberator.eval(arg);
        }
        catch (e) {
            liberator.echoerr(e);
            return null;
        }

        if (typeof arg === "object")
            arg = util.objectToString(arg, useColor);
        else
            arg = String(arg);

        if (typeof arg == "string" && /\n/.test(arg))
            arg = <span highlight="CmdOutput">{arg}</span>;

        return arg;
    }
}, {
    commands: function () {
        [
            {
                name: "ec[ho]",
                description: "Echo the expression",
                action: liberator.echo
            },
            {
                name: "echoe[rr]",
                description: "Echo the expression as an error message",
                action: liberator.echoerr
            },
            {
                name: "echom[sg]",
                description: "Echo the expression as an informational message",
                action: liberator.echomsg
            }
        ].forEach(function (command) {
            commands.add([command.name],
                command.description,
                function (args) {
                    let str = CommandLine.echoArgumentToString(args.string, true);
                    if (str != null)
                        command.action(str);
                }, {
                    completer: function (context) completion.javascript(context),
                    literal: 0
                });
        });

        commands.add(["mes[sages]"],
            "Display previously given messages",
            function () {
                if (commandline._messageHistory.length == 0)
                    liberator.echomsg("No previous messages");
                // TODO: are all messages single line? Some display an aggregation
                //       of single line messages at least. E.g. :source
                /*if (commandline._messageHistory.length == 1) {
                    let message = commandline._messageHistory.messages[0];
                    commandline.echo(message.str, message.highlight, commandline.FORCE_SINGLELINE);
                }*/
                else { //if (commandline._messageHistory.length > 1) {
                    XML.ignoreWhitespace = false;
                    let list = template.map(commandline._messageHistory.messages, function (message)
                        <div highlight={message.highlight + " Message"}>{message.str}</div>);
                    liberator.echo(list, commandline.FORCE_MULTILINE);
                }
            },
            { argCount: "0" });

        commands.add(["messc[lear]"],
            "Clear the :messages list",
            function () { commandline._messageHistory.clear(); },
            { argCount: "0" });

        commands.add(["sil[ent]"],
            "Run a command silently",
            function (args) {
                commandline.runSilently(function () liberator.execute(args[0], null, true));
            }, {
                completer: function (context) completion.ex(context),
                literal: 0
            });
    },
    mappings: function () {
        var myModes = [modes.COMMAND_LINE];

        // TODO: move "<Esc>", "<C-[>" here from mappings
        mappings.add(myModes,
            ["<C-c>"], "Focus content",
            function () {
                let controller = window.document.commandDispatcher.getControllerForCommand("cmd_copy");
                if (controller && controller.isCommandEnabled("cmd_copy"))
                    controller.doCommand("cmd_copy");
                else
                    events.onEscape();
            });

        // Any "non-keyword" character triggers abbreviation expansion
        // TODO: Add "<CR>" and "<Tab>" to this list
        //       At the moment, adding "<Tab>" breaks tab completion. Adding
        //       "<CR>" has no effect.
        // TODO: Make non-keyword recognition smarter so that there need not
        //       be two lists of the same characters (one here and a regex in
        //       mappings.js)
        mappings.add(myModes,
            ["<Space>", '"', "'"], "Expand command line abbreviation",
            function () {
                commandline.resetCompletions();
                return editor.expandAbbreviation(modes.COMMAND_LINE);
            },
            { route: true });

        mappings.add(myModes,
            ["<C-]>", "<C-5>"], "Expand command line abbreviation",
            function () { editor.expandAbbreviation(modes.COMMAND_LINE); });

        mappings.add([modes.NORMAL],
            ["g<"], "Redisplay the last command output",
            function () {
                let lastMowOutput = commandline._lastMowOutput;
                liberator.assert(lastMowOutput);
                commandline._echoMultiline(lastMowOutput, commandline.HL_NORMAL);
            });
    },
    options: function () {
        options.add(["autocomplete", "ac"],
            "Automatically list completions while typing",
            "boolean", true);

        options.add(["complete", "cpt"],
            "Items which are completed at the :open prompts",
            "charlist", typeof(config.defaults["complete"]) == "string" ? config.defaults["complete"] : "slf",
            {
                completer: function (context) array(values(completion.urlCompleters))
            });

        options.add(["history", "hi"],
            "Number of Ex commands and search patterns to store in the command-line this._history",
            "number", 500,
            { validator: function (value) value >= 0 });

        options.add(["maxitems"],
            "Maximum number of items to display at once",
            "number", 20,
            { validator: function (value) value >= 1 });

        options.add(["messages", "msgs"],
            "Number of messages to store in the message this._history",
            "number", 100,
            { validator: function (value) value >= 0 });

        options.add(["messagetimeout", "mto"],
            "Automatically hide messages after a timeout (in ms)",
            "number", 10000,
            {
                completer: function (context) [
                    ["-1",  "Keep forever"],
                    ["0",   "Close immediately"],
                ],
                validator: function (value) value >= -1
            });

        options.add(["showmode", "smd"],
            "Show the current mode in the command line",
            "boolean", true);

        options.add(["suggestengines"],
             "Engine Alias which has a feature of suggest",
             "stringlist", "google",
             {
                 completer: function completer(value) {
                     let engines = services.get("browserSearch").getEngines({})
                                           .filter(function (engine) engine.supportsResponseType("application/x-suggestions+json"));

                     return engines.map(function (engine) [engine.alias, engine.description]);
                 }
             });

        options.add(["wildmode", "wim"],
            "Define how command line completion works",
            "stringlist", "list:full",
            {
                completer: function (context) [
                    // Why do we need ""?
                    ["",              "Complete only the first match"],
                    ["full",          "Complete the next full match"],
                    ["longest",       "Complete to longest common string"],
                    ["list",          "If more than one match, list all matches"],
                    ["list:full",     "List all and complete first match"],
                    ["list:longest",  "List all and complete common string"]
                ],
                checkHas: function (value, val) {
                    let [first, second] = value.split(":", 2);
                    return first == val || second == val;
                }
            });

            let idList = ["liberator-multiline-output", "liberator-completions"];
            function floatBox(id) document.getElementById(id).parentNode

            let animation = "animation";
            options.add(["animations", "ani"], "enabled animation", "boolean", false, {
                setter: function (value) {
                    let attr = value ? "add" : "remove";
                    idList.forEach(function (id) {
                        floatBox(id).classList[attr](animation);
                    });
                    return value;
                },
                getter: function () floatBox(idList[0]).classList.contains(animation),
            });
    },
    styles: function () {
        let fontSize = util.computedStyle(document.getElementById(config.mainWindowId)).fontSize;
        styles.registerSheet("chrome://liberator/skin/liberator.css");
        let error = styles.addSheet(true, "font-size", "chrome://liberator/content/buffer.xhtml",
            "body { font-size: " + fontSize + "; }");
    }
});

/**
 * The list which is used for the completion box (and QuickFix window in
 * future).
 *
 * @param {string} id The id of the <iframe> which will display the list. It
 *     must be in its own container element, whose height it will update as
 *     necessary.
 */
const ItemList = Class("ItemList", {
    init: function (id) {
        this._completionElements = [];

        var iframe = document.getElementById(id);
        if (!iframe) {
            liberator.echoerr("No iframe with id: " + id + " found, strange things may happen!"); // "The truth is out there..." -- djk
            return;
        }

        this._doc = iframe.contentDocument;
        this._container = iframe.parentNode;

        this._doc.body.id = id + "-content";
        this._doc.body.appendChild(this._doc.createTextNode(""));

        this._items = null;
        this._startIndex = -1;  // The index of the first displayed item
        this._endIndex = -1;    // The index one *after* the last displayed item
        this._selIndex = -1;    // The index of the currently selected element
        this._div = null;
        this._divNodes = {};
        this._minHeight = 0;
    },

    _dom: function (xml, map) util.xmlToDom(xml, this._doc, map),

    _autoSize: function () {
        if (this._container.collapsed)
            this._div.style.minWidth = document.getElementById("liberator-commandline").scrollWidth + "px";

        this._minHeight = Math.max(this._minHeight, this._divNodes.completions.getBoundingClientRect().bottom);
        this._container.style.maxHeight = this._minHeight + "px";
        this._container.height = this._minHeight;

        if (this._container.collapsed)
            this._div.style.minWidth = "";

        // FIXME: Belongs elsewhere.
        commandline.updateOutputHeight(false);
        this.setTimeout(function () { this._container.height -= commandline.getSpaceNeeded(); }, 0);
    },

    // Our dotted separator does not look good in combination with
    // the completion window visible
    // FIXME: Probably not the right thing to do for some themes
    //        Rather set a pseudo style which can be handled with :highlight
    _updateSeparatorVisibility: function () {
        let mowVisible = !(document.getElementById("liberator-multiline-output").parentNode.collapsed);
        let separator = document.getElementById("liberator-separator");
        separator.collapsed = this.visible() && !mowVisible;
    },

    _getCompletion: function (index) this._completionElements.snapshotItem(index - this._startIndex),

    _init: function () {
        this._div = this._dom(
            <div class="ex-command-output" highlight="Normal" style="white-space: nowrap">
                <div highlight="Completions" key="noCompletions"><span highlight="Title">No Completions</span></div>
                <div key="completions"/>
                <div highlight="Completions">
                {
                    template.map(util.range(0, options["maxitems"] * 2), function (i)
                    <span highlight="CompItem">
                        <li highlight="NonText">~</li>
                    </span>)
                }
                </div>
            </div>, this._divNodes);
        this._doc.body.replaceChild(this._div, this._doc.body.firstChild);
        //div.scrollIntoView(true);

        this._items.contextList.forEach(function init_eachContext(context) {
            delete context.cache.nodes;
            if (!context.items.length && !context.message && !context.incomplete)
                return;
            context.cache.nodes = [];
            this._dom(<div key="root" highlight="CompGroup">
                    <div highlight="Completions">
                        { context.createRow(context.title || [], "CompTitle") }
                    </div>
                    <div key="message" highlight="CompMsg"/>
                    <div key="items" highlight="Completions"/>
                    <div key="waiting" highlight="CompMsg">{ItemList.WAITING_MESSAGE}</div>
                </div>, context.cache.nodes);
            this._divNodes.completions.appendChild(context.cache.nodes.root);
        }, this);

        setTimeout(this.closure._autoSize, 0);
    },

    /**
     * Uses the entries in "items" to fill the listbox and does incremental
     * filling to speed up things.
     *
     * @param {number} offset Start at this index and show options["maxitems"].
     */
    _fill: function (offset) {
        XML.ignoreWhiteSpace = false;
        let diff = offset - this._startIndex;
        if (this._items == null || offset == null || diff == 0 || offset < 0)
            return false;

        this._startIndex = offset;
        this._endIndex = Math.min(this._startIndex + options["maxitems"], this._items.allItems.items.length);

        let haveCompletions = false;
        let off = 0;
        let end = this._startIndex + options["maxitems"];
        function getRows(context) {
            function fix(n) util.Math.constrain(n, 0, len);
            let len = context.items.length;
            let start = off;
            end -= !!context.message + context.incomplete;
            off += len;

            let s = fix(offset - start), e = fix(end - start);
            return [s, e, context.incomplete && e >= offset && off - 1 < end];
        }

        this._items.contextList.forEach(function fill_eachContext(context) {
            let nodes = context.cache.nodes;
            if (!nodes)
                return;
            haveCompletions = true;

            let root = nodes.root;
            let items = nodes.items;
            let [start, end, waiting] = getRows(context);

            if (context.message)
                nodes.message.textContent = context.message;
            nodes.message.style.display = context.message ? "block" : "none";
            nodes.waiting.style.display = waiting ? "block" : "none";

            for (let [i, row] in Iterator(context.getRows(start, end, this._doc)))
                nodes[i] = row;
            for (let [i, row] in util.Array.iteritems(nodes)) {
                if (!row)
                    continue;
                let display = (i >= start && i < end);
                if (display && row.parentNode != items) {
                    do {
                        var next = nodes[++i];
                        if (next && next.parentNode != items)
                            next = null;
                    }
                    while (!next && i < end)
                    items.insertBefore(row, next);
                }
                else if (!display && row.parentNode == items)
                    items.removeChild(row);
            }
        }, this);

        this._divNodes.noCompletions.style.display = haveCompletions ? "none" : "block";

        this._completionElements = util.evaluateXPath("//xhtml:div[@liberator:highlight='CompItem']", this._doc);

        return true;
    },

    clear: function clear() { this.setItems(); this._doc.body.innerHTML = ""; },
    hide: function hide() {
        this._container.collapsed = true;
        this._updateSeparatorVisibility();
    },
    show: function show() {
        this._container.style.bottom = commandline.bottombarPosition;
        this._container.collapsed = false;
        this._updateSeparatorVisibility();
    },
    visible: function visible() !this._container.collapsed,

    reset: function () {
        this._startIndex = this._endIndex = this._selIndex = -1;
        this._div = null;
        this.selectItem(-1);
    },

    // if @param selectedItem is given, show the list and select that item
    setItems: function setItems(newItems, selectedItem) {
        if (this._container.collapsed)
            this._minHeight = 0;
        this._startIndex = this._endIndex = this._selIndex = -1;
        this._items = newItems;
        this.reset();
        if (typeof selectedItem == "number") {
            this.selectItem(selectedItem);
            this.show();
        }
    },

    // select index, refill list if necessary
    selectItem: function selectItem(index) {
        if (this._div == null)
            this._init();

        let sel = this._selIndex;
        let len = this._items.allItems.items.length;
        let newOffset = this._startIndex;
        let maxItems = options["maxitems"];
        let contextLines = Math.min(3, parseInt((maxItems - 1) / 2));

        if (index == -1 || index == null || index == len) { // wrapped around
            if (this._selIndex < 0)
                newOffset = 0;
            this._selIndex = -1;
            index = -1;
        }
        else {
            if (index <= this._startIndex + contextLines)
                newOffset = index - contextLines;
            if (index >= this._endIndex - contextLines)
                newOffset = index + contextLines - maxItems + 1;

            newOffset = Math.min(newOffset, len - maxItems);
            newOffset = Math.max(newOffset, 0);

            this._selIndex = index;
        }

        if (sel > -1)
            this._getCompletion(sel).removeAttribute("selected");
        this._fill(newOffset);
        if (index >= 0)
            this._getCompletion(index).setAttribute("selected", "true");
    },

    onEvent: function onEvent(event) false
}, {
    WAITING_MESSAGE: "Generating results..."
});

// vim: set fdm=marker sw=4 ts=4 et:
