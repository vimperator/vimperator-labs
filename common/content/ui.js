// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.

/** @scope modules */

/**
 * This class is used for prompting of user input and echoing of messages.
 *
 * It consists of a prompt and command field be sure to only create objects of
 * this class when the chrome is ready.
 */
function CommandLine() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const callbacks = {};

    storage.newArray("history-search", true, { privateData: true });
    storage.newArray("history-command", true, { privateData: true });

    // Really inideal.
    let services = modules.services; // Storage objects are global to all windows, 'modules' isn't.
    storage.newObject("sanitize", function () {
        ({
            CLEAR: "browser:purge-session-history",
            init: function ()
            {
                services.get("observer").addObserver(this, this.CLEAR, false);
                services.get("observer").addObserver(this, "quit-application", false);
            },
            observe: function (subject, topic, data)
            {
                if (topic == this.CLEAR)
                {
                    ["search", "command"].forEach(function (mode) {
                        History(null, mode).sanitize();
                    });
                }
                else if (topic == "quit-application")
                {
                    services.get("observer").removeObserver(this, this.CLEAR);
                    services.get("observer").removeObserver(this, "quit-application");
                }
            }
        }).init();
    }, false);
    storage.addObserver("sanitize",
        function (key, event, value) {
            autocommands.trigger("Sanitize", {});
        }, window);

    var messageHistory = { // {{{
        _messages: [],
        get messages()
        {
            let max = options["messages"];

            // resize if 'messages' has changed
            if (this._messages.length > max)
                this._messages = this._messages.splice(this._messages.length - max);

            return this._messages;
        },

        get length() this._messages.length,

        clear: function clear()
        {
            this._messages = [];
        },

        add: function add(message)
        {
            if (!message)
                return;

            if (this._messages.length >= options["messages"])
                this._messages.shift();

            this._messages.push(message);
        }
    }; // }}}
    var lastMowOutput = null;

    var silent = false;
    var quiet = false;
    var keepCommand = false;
    var lastEcho = null;

    /**
     * A class for managing the history of an inputField.
     *
     * @param {HTMLInputElement} inputField
     * @param {string} mode The mode for which we need history.
     */
    function History(inputField, mode) // {{{
    {
        if (!(this instanceof arguments.callee))
            return new arguments.callee(inputField, mode);

        this.mode = mode;
        this.input = inputField;
        this.store = storage["history-" + mode];
        this.reset();
    }
    History.prototype = {
        /**
         * Reset the history index to the first entry.
         */
        reset: function ()
        {
            this.index = null;
        },
        /**
         * Save the last entry to the permanent store. All duplicate entries
         * are removed and the list is truncated, if necessary.
         */
        save: function ()
        {
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
        checkPrivate: function (str)
        {
            // Not really the ideal place for this check.
            if (this.mode == "command")
                return (commands.get(commands.parseCommand(str)[1]) || {}).privateData;
            return false;
        },
        /**
         * Removes any private data from this history.
         */
        sanitize: function (timespan)
        {
            let range = [0, Number.MAX_VALUE];
            if (liberator.has("sanitizer") && (timespan || options["sanitizetimespan"]))
                range = sanitizer.getClearRange(timespan || options["sanitizetimespan"]);

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
        replace: function (val)
        {
            this.input.value = val;
            commandline.triggerCallback("change", currentExtendedMode, val);
        },

        /**
         * Move forward or backward in history.
         *
         * @param {boolean} backward Direction to move.
         * @param {boolean} matchCurrent Search for matches starting
         *      with the current input value.
         */
        select: function (backward, matchCurrent)
        {
            // always reset the tab completion if we use up/down keys
            completions.reset();

            let diff = backward ? -1 : 1;

            if (this.index == null)
            {
                this.original = this.input.value;
                this.index = this.store.length;
            }

            // search the history for the first item matching the current
            // commandline string
            while (true)
            {
                this.index += diff;
                if (this.index < 0 || this.index > this.store.length)
                {
                    this.index = util.Math.constrain(this.index, 0, this.store.length);
                    liberator.beep();
                    // I don't know why this kludge is needed. It
                    // prevents the caret from moving to the end of
                    // the input field.
                    if (this.input.value == "")
                    {
                        this.input.value = " ";
                        this.input.value = "";
                    }
                    break;
                }

                let hist = this.store.get(this.index);
                // user pressed DOWN when there is no newer history item
                if (!hist)
                    hist = this.original;
                else
                    hist = (hist.value || hist);

                if (!matchCurrent || hist.substr(0, this.original.length) == this.original)
                {
                    this.replace(hist);
                    break;
                }
            }
        }
    }; // }}}

    /**
     * A class for tab completions on an input field.
     *
     * @param {Object} input
     */
    function Completions(input) // {{{
    {
        if (!(this instanceof arguments.callee))
            return new arguments.callee(input);

        let self = this;
        this.context = CompletionContext(input.editor);
        this.context.onUpdate = function ()
        {
            self._reset();
        };
        this.editor = input.editor;
        this.selected = null;
        this.wildmode = options.get("wildmode");
        this.itemList = completionList;
        this.itemList.setItems(this.context);
        this.reset();
    }
    Completions.prototype = {
        UP: {},
        DOWN: {},
        PAGE_UP: {},
        PAGE_DOWN: {},
        RESET: null,

        get completion()
        {
            let str = commandline.command;
            return str.substring(this.prefix.length, str.length - this.suffix.length);
        },
        set completion set_completion(completion)
        {
            this.previewClear();

            // Change the completion text.
            // The second line is a hack to deal with some substring
            // preview corner cases.
            commandWidget.value = this.prefix + completion + this.suffix;
            this.editor.selection.focusNode.textContent = commandWidget.value;

            // Reset the caret to one position after the completion.
            this.caret = this.prefix.length + completion.length;
        },

        get caret() this.editor.selection.focusOffset,
        set caret(offset)
        {
            commandWidget.selectionStart = offset;
            commandWidget.selectionEnd = offset;
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

        complete: function complete(show, tabPressed)
        {
            this.context.reset();
            this.context.tabPressed = tabPressed;
            commandline.triggerCallback("complete", currentExtendedMode, this.context);
            this.context.updateAsync = true;
            this.reset(show, tabPressed);
            this.wildIndex = 0;
        },

        preview: function preview()
        {
            this.previewClear();
            if (this.wildIndex < 0 || this.suffix || !this.items.length)
                return;

            let substring = "";
            switch (this.wildtype.replace(/.*:/, ""))
            {
                case "":
                    substring = this.items[0].text;
                    break;
                case "longest":
                    if (this.items.length > 1)
                    {
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
            if (substring.length < 2 && (!this.lastSubstring || this.lastSubstring.indexOf(substring) != 0))
                return;
            this.lastSubstring = substring;

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

        previewClear: function previewClear()
        {
            let node = this.editor.rootElement.firstChild;
            if (node && node.nextSibling)
                this.editor.deleteNode(node.nextSibling);
            else if (this.removeSubstring)
            {
                let str = this.removeSubstring;
                let cmd = commandWidget.value;
                if (cmd.substr(cmd.length - str.length) == str)
                    commandWidget.value = cmd.substr(0, cmd.length - str.length);
            }
            delete this.removeSubstring;
        },

        reset: function reset(show)
        {
            this.wildIndex = -1;

            this.prefix = this.context.value.substring(0, this.start);
            this.value  = this.context.value.substring(this.start, this.caret);
            this.suffix = this.context.value.substring(this.caret);

            if (show)
            {
                this.itemList.reset();
                this.selected = null;
                this.wildIndex = 0;
            }

            this.wildtypes = this.wildmode.values;
            this.preview();
        },

        _reset: function _reset()
        {
            this.prefix = this.context.value.substring(0, this.start);
            this.value  = this.context.value.substring(this.start, this.caret);
            this.suffix = this.context.value.substring(this.caret);

            this.itemList.reset();
            this.itemList.selectItem(this.selected);

            this.preview();
        },

        select: function select(idx)
        {
            switch (idx)
            {
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

            if (idx == -1 || this.items.length && idx >= this.items.length || idx == null)
            {
                // Wrapped. Start again.
                this.selected = null;
                this.completion = this.value;
            }
            else
            {
                // Wait for contexts to complete if necessary.
                // FIXME: Need to make idx relative to individual contexts.
                let list = this.context.contextList;
                if (idx == -2)
                    list = list.slice().reverse();
                let n = 0;
                try
                {
                    this.waiting = true;
                    for (let [, context] in Iterator(list))
                    {
                        function done() !(idx >= n + context.items.length || idx == -2 && !context.items.length);
                        while (context.incomplete && !done())
                            liberator.threadYield(false, true);

                        if (done())
                            break;

                        n += context.items.length;
                    }
                }
                finally
                {
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

        tab: function tab(reverse)
        {
            autocompleteTimer.flush();
            // Check if we need to run the completer.
            if (this.context.waitingForTab || this.wildIndex == -1)
                this.complete(true, true);

            this.tabs.push(reverse);
            if (this.waiting)
                return;

            while (this.tabs.length)
            {
                reverse = this.tabs.shift();
                switch (this.wildtype.replace(/.*:/, ""))
                {
                    case "":
                        this.select(0);
                        break;
                    case "longest":
                        if (this.items.length > 1)
                        {
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
                    completionList.show();

                this.wildIndex = util.Math.constrain(this.wildIndex + 1, 0, this.wildtypes.length - 1);
                this.preview();

                statusTimer.tell();
            }

            if (this.items.length == 0)
                liberator.beep();
        }
    }; // }}}

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// TIMERS //////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var statusTimer = new Timer(5, 100, function statusTell() {
        if (completions == null)
            return;
        if (completions.selected == null)
            statusline.updateProgress("");
        else
            statusline.updateProgress("match " + (completions.selected + 1) + " of " + completions.items.length);
    });

    var autocompleteTimer = new Timer(200, 500, function autocompleteTell(tabPressed) {
        if (!events.feedingKeys && completions && options.get("wildoptions").has("auto"))
        {
            completions.complete(true, false);
            completions.itemList.show();
        }
    });

    // This timer just prevents <Tab>s from queueing up when the
    // system is under load (and, thus, giving us several minutes of
    // the completion list scrolling). Multiple <Tab> presses are
    // still processed normally, as the time is flushed on "keyup".
    var tabTimer = new Timer(0, 0, function tabTell(event) {
        if (completions)
            completions.tab(event.shiftKey);
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// VARIABLES ///////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const completionList = new ItemList("liberator-completions");
    var completions = null;
    var history = null;

    var startHints = false; // whether we're waiting to start hints mode
    var lastSubstring = "";

    // the containing box for the promptWidget and commandWidget
    const commandlineWidget = document.getElementById("liberator-commandline");
    // the prompt for the current command, for example : or /. Can be blank
    const promptWidget = document.getElementById("liberator-commandline-prompt");
    // the command bar which contains the current command
    const commandWidget = document.getElementById("liberator-commandline-command");

    const messageBox = document.getElementById("liberator-message");

    commandWidget.inputField.QueryInterface(Ci.nsIDOMNSEditableElement);
    messageBox.inputField.QueryInterface(Ci.nsIDOMNSEditableElement);

    // the widget used for multiline output
    const multilineOutputWidget = document.getElementById("liberator-multiline-output");
    const outputContainer = multilineOutputWidget.parentNode;

    multilineOutputWidget.contentDocument.body.id = "liberator-multiline-output-content";

    // the widget used for multiline intput
    const multilineInputWidget = document.getElementById("liberator-multiline-input");

    // we need to save the mode which were in before opening the command line
    // this is then used if we focus the command line again without the "official"
    // way of calling "open"
    var currentExtendedMode = null;     // the extended mode which we last openend the command line for
    // modules.__defineGetter__("currentExtendedMode", function () _currentExtendedMode)
    // modules.__defineSetter__("currentExtendedMode", function (val) (liberator.dumpStack("currentExtendedMode = " + (val && modes.getMode(val).name)),
    //          _currentExtendedMode = val))
    var currentPrompt = null;
    var currentCommand = null;

    // save the arguments for the inputMultiline method which are needed in the event handler
    var multilineRegexp = null;
    var multilineCallback = null;

    /**
     * Highlight the messageBox according to <b>group</b>.
     */
    function setHighlightGroup(group)
    {
        messageBox.setAttributeNS(NS.uri, "highlight", group);
    }

    /**
     * Determines whether the command line should be visible.
     *
     * @returns {boolean}
     */
    function commandShown() modes.main == modes.COMMAND_LINE &&
            !(modes.extended & (modes.INPUT_MULTILINE | modes.OUTPUT_MULTILINE));

    /**
     * Set the command-line prompt.
     *
     * @param {string} val
     * @param {string} highlightGroup
     */
    function setPrompt(val, highlightGroup)
    {
        promptWidget.value = val;
        promptWidget.size = val.length;
        promptWidget.collapsed = (val == "");
        promptWidget.setAttributeNS(NS.uri, "highlight", highlightGroup || commandline.HL_NORMAL);
    }

    /**
     * Set the command-line input value. The caret is reset to the
     * end of the line.
     *
     * @param {string} cmd
     */
    function setCommand(cmd)
    {
        commandWidget.value = cmd;
        commandWidget.selectionStart = cmd.length;
        commandWidget.selectionEnd = cmd.length;
    }

    /**
     * Display a message in the command-line area.
     *
     * @param {string} str
     * @param {string} highlightGroup
     * @param {boolean} forceSingle If provided, don't let over-long
     *     messages move to the MOW.
     */
    function echoLine(str, highlightGroup, forceSingle)
    {
        setHighlightGroup(highlightGroup);
        messageBox.value = str;

        liberator.triggerObserver("echoLine", str, highlightGroup, forceSingle);

        if (!commandShown())
            commandline.hide();

        let field = messageBox.inputField;
        if (!forceSingle && field.editor.rootElement.scrollWidth > field.scrollWidth)
            echoMultiline(<span highlight="Message">{str}</span>, highlightGroup);
    }

    /**
     * Display a multiline message.
     *
     * @param {string} str
     * @param {string} highlightGroup
     */
    // TODO: resize upon a window resize
    function echoMultiline(str, highlightGroup)
    {
        let doc = multilineOutputWidget.contentDocument;
        let win = multilineOutputWidget.contentWindow;

        liberator.triggerObserver("echoMultiline", str, highlightGroup);

        // If it's already XML, assume it knows what it's doing.
        // Otherwise, white space is significant.
        // The problem elsewhere is that E4X tends to insert new lines
        // after interpolated data.
        XML.ignoreWhitespace = typeof str != "xml";
        lastMowOutput = <div class="ex-command-output" style="white-space: nowrap" highlight={highlightGroup}>{template.maybeXML(str)}</div>;
        let output = util.xmlToDom(lastMowOutput, doc);
        XML.ignoreWhitespace = true;

        // FIXME: need to make sure an open MOW is closed when commands
        //        that don't generate output are executed
        if (outputContainer.collapsed)
            doc.body.innerHTML = "";

        doc.body.appendChild(output);

        commandline.updateOutputHeight(true);

        if (options["more"] && win.scrollMaxY > 0)
        {
            // start the last executed command's output at the top of the screen
            let elements = doc.getElementsByClassName("ex-command-output");
            elements[elements.length - 1].scrollIntoView(true);
        }
        else
            win.scrollTo(0, doc.height);

        win.focus();

        startHints = false;
        modes.set(modes.COMMAND_LINE, modes.OUTPUT_MULTILINE);
        commandline.updateMorePrompt();
    }

    /**
     * Ensure that the multiline input widget is the correct size.
     */
    function autosizeMultilineInputWidget()
    {
        let lines = multilineInputWidget.value.split("\n").length - 1;

        multilineInputWidget.setAttribute("rows", Math.max(lines, 1));
    }

    /**
     * eval() a JavaScript expression and return a string suitable
     * to be echoed.
     *
     * @param {string} arg
     * @param {boolean} useColor When true, the result is a
     *     highlighted XML object.
     */
    function echoArgumentToString(arg, useColor)
    {
        if (!arg)
            return "";

        try
        {
            arg = liberator.eval(arg);
        }
        catch (e)
        {
            liberator.echoerr(e);
            return null;
        }

        if (typeof arg === "object")
            arg = util.objectToString(arg, useColor);
        else if (typeof arg == "string" && /\n/.test(arg))
            arg = <span highlight="CmdOutput">{arg}</span>;
        else
            arg = String(arg);

        return arg;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["history", "hi"],
        "Number of Ex commands and search patterns to store in the command-line history",
        "number", 500,
        { validator: function (value) value >= 0 });

    options.add(["maxitems"],
        "Maximum number of items to display at once",
        "number", 20,
        { validator: function (value) value >= 1 });

    options.add(["messages", "msgs"],
        "Number of messages to store in the message history",
        "number", 100,
        { validator: function (value) value >= 0 });

    options.add(["more"],
        "Pause the message list window when more than one screen of listings is displayed",
        "boolean", true);

    options.add(["showmode", "smd"],
        "Show the current mode in the command line",
        "boolean", true);

    options.add(["suggestengines"],
         "Engine Alias which has a feature of suggest",
         "stringlist", "google",
         {
             completer: function completer(value)
             {
                 let engines = services.get("browserSearch").getEngines({})
                                       .filter(function (engine) engine.supportsResponseType("application/x-suggestions+json"));

                 return engines.map(function (engine) [engine.alias, engine.description]);
             },
             validator: Option.validateCompleter
         });

    options.add(["complete", "cpt"],
        "Items which are completed at the :open prompts",
        "charlist", typeof(config.defaults["complete"]) == "string" ? config.defaults["complete"] : "slf",
        {
            completer: function (context) [k for each (k in completion.urlCompleters)],
            validator: Option.validateCompleter
        });

    options.add(["wildcase", "wic"],
        "Completion case matching mode",
        "string", "smart",
        {
            completer: function () [
                ["smart", "Case is significant when capital letters are typed"],
                ["match", "Case is always significant"],
                ["ignore", "Case is never significant"]
            ],
            validator: Option.validateCompleter
        });

    options.add(["wildignore", "wig"],
        "List of file patterns to ignore when completing files",
        "stringlist", "",
        {
            validator: function validator(values)
            {
                // TODO: allow for escaping the ","
                try
                {
                    RegExp("^(" + values.join("|") + ")$");
                    return true;
                }
                catch (e)
                {
                    return false;
                }
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
            validator: Option.validateCompleter,
            checkHas: function (value, val)
            {
                let [first, second] = value.split(":", 2);
                return first == val || second == val;
            }
        });

    options.add(["wildoptions", "wop"],
        "Change how command line completion is done",
        "stringlist", "",
        {
            completer: function completer(value)
            {
                return [
                    ["",     "Default completion that won't show or sort the results"],
                    ["auto", "Automatically show completions while you are typing"],
                    ["sort", "Always sort the completion list"]
                ];
            },
            validator: Option.validateCompleter
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var myModes = [modes.COMMAND_LINE];

    // TODO: move "<Esc>", "<C-[>" here from mappings
    mappings.add(myModes,
        ["<C-c>"], "Focus content",
        function () { events.onEscape(); });

    // Any "non-keyword" character triggers abbreviation expansion
    // TODO: Add "<CR>" and "<Tab>" to this list
    //       At the moment, adding "<Tab>" breaks tab completion. Adding
    //       "<CR>" has no effect.
    // TODO: Make non-keyword recognition smarter so that there need not
    //       be two lists of the same characters (one here and a regex in
    //       mappings.js)
    mappings.add(myModes,
        ["<Space>", '"', "'"], "Expand command line abbreviation",
        function ()
        {
            commandline.resetCompletions();
            return editor.expandAbbreviation("c");
        },
        { route: true });

    mappings.add(myModes,
        ["<C-]>", "<C-5>"], "Expand command line abbreviation",
        function () { editor.expandAbbreviation("c"); });

    mappings.add([modes.NORMAL],
        ["g<"], "Redisplay the last command output",
        function ()
        {
            if (lastMowOutput)
                echoMultiline(lastMowOutput, commandline.HL_NORMAL);
            else
                liberator.beep();
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

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
            function (args)
            {
                let str = echoArgumentToString(args.string, true);
                if (str != null)
                    command.action(str);
            },
            {
                completer: function (context) completion.javascript(context),
                literal: 0
            });
    });

    commands.add(["mes[sages]"],
        "Display previously given messages",
        function ()
        {
            // TODO: are all messages single line? Some display an aggregation
            //       of single line messages at least. E.g. :source
            if (messageHistory.length == 1)
            {
                let message = messageHistory.messages[0];
                commandline.echo(message.str, message.highlight, commandline.FORCE_SINGLELINE);
            }
            else if (messageHistory.length > 1)
            {
                XML.ignoreWhitespace = false;
                let list = template.map(messageHistory.messages, function (message)
                    <div highlight={message.highlight + " Message"}>{message.str}</div>);
                liberator.echo(list, commandline.FORCE_MULTILINE);
            }
        },
        { argCount: "0" });

    commands.add(["messc[lear]"],
        "Clear the message history",
        function () { messageHistory.clear(); },
        { argCount: "0" });

    commands.add(["sil[ent]"],
        "Run a command silently",
        function (args)
        {
            commandline.runSilently(function () liberator.execute(args[0], null, true));
        },
        {
            completer: function (context) completion.ex(context),
            literal: 0
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const self = {

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
        APPEND_TO_MESSAGES : 1 << 3, // add the string to the message history

        get completionContext() completions.context,

        get mode() (modes.extended == modes.EX) ? "cmd" : "search",

        get silent() silent,
        set silent(val)
        {
            silent = val;
            this.quiet = this.quiet;
        },
        get quiet() quiet,
        set quiet(val)
        {
            quiet = val;
            Array.forEach(document.getElementById("liberator-commandline").childNodes, function (node) {
                node.style.opacity = quiet || silent ? "0" : "";
            });
        },

        // @param type can be:
        //  "submit": when the user pressed enter in the command line
        //  "change"
        //  "cancel"
        //  "complete"
        registerCallback: function (type, mode, func)
        {
            if (!(type in callbacks))
                callbacks[type] = {};
            callbacks[type][mode] = func;
        },

        triggerCallback: function (type, mode, data)
        {
            if (callbacks[type] && callbacks[type][mode])
                callbacks[type][mode].call(this, data);
        },

        runSilently: function (func, self)
        {
            let wasSilent = this.silent;
            this.silent = true;
            try
            {
                func.call(self);
            }
            finally
            {
                this.silent = wasSilent;
            }
        },

        get command()
        {
            try
            {
                // The long path is because of complications with the
                // completion preview.
                return commandWidget.inputField.editor.rootElement.firstChild.textContent;
            }
            catch (e)
            {
                return commandWidget.value;
            }
        },
        set command(cmd) commandWidget.value = cmd,

        get message() messageBox.value,

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
        open: function open(prompt, cmd, extendedMode)
        {
            // save the current prompts, we need it later if the command widget
            // receives focus without calling the this.open() method
            currentPrompt = prompt || "";
            currentCommand = cmd || "";
            currentExtendedMode = extendedMode || null;
            keepCommand = false;

            setPrompt(currentPrompt);
            setCommand(currentCommand);
            commandlineWidget.collapsed = false;

            modes.set(modes.COMMAND_LINE, currentExtendedMode);

            commandWidget.focus();

            history = History(commandWidget.inputField, (modes.extended == modes.EX) ? "command" : "search");
            completions = Completions(commandWidget.inputField);

            // open the completion list automatically if wanted
            if (cmd.length)
                commandline.triggerCallback("change", currentExtendedMode, cmd);
        },

        /**
         * Closes the command line. This is ordinarily triggered automatically
         * by a mode change. Will not hide the command line immediately if
         * called directly after a successful command, otherwise it will.
         */
        close: function close()
        {
            let mode = currentExtendedMode;
            currentExtendedMode = null;
            commandline.triggerCallback("cancel", mode);

            if (history)
                history.save();

            this.resetCompletions(); // cancels any asynchronous completion still going on, must be before we set completions = null
            completions = null;
            history = null;

            statusline.updateProgress(""); // we may have a "match x of y" visible
            liberator.focusContent(false);

            multilineInputWidget.collapsed = true;
            completionList.hide();

            if (!keepCommand || this.silent || this.quiet)
            {
                outputContainer.collapsed = true;
                commandline.updateMorePrompt();
                this.hide();
            }
            if (!outputContainer.collapsed)
            {
                modes.set(modes.COMMAND_LINE, modes.OUTPUT_MULTILINE);
                commandline.updateMorePrompt();
            }
            keepCommand = false;
        },

        /**
         * Hides the command line, and shows any status messages that
         * are under it.
         */
        hide: function hide()
        {
            commandlineWidget.collapsed = true;
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
        echo: function echo(str, highlightGroup, flags)
        {
            // liberator.echo uses different order of flags as it omits the highlight group, change commandline.echo argument order? --mst
            if (silent)
                return;

            highlightGroup = highlightGroup || this.HL_NORMAL;

            if (flags & this.APPEND_TO_MESSAGES)
                messageHistory.add({ str: str, highlight: highlightGroup });

            // The DOM isn't threadsafe. It must only be accessed from the main thread.
            liberator.callInMainThread(function ()
            {
                if ((flags & this.DISALLOW_MULTILINE) && !outputContainer.collapsed)
                    return;

                let single = flags & (this.FORCE_SINGLELINE | this.DISALLOW_MULTILINE);
                let action = echoLine;

                // TODO: this is all a bit convoluted - clean up.
                // assume that FORCE_MULTILINE output is fully styled
                if (!(flags & this.FORCE_MULTILINE) && !single && (!outputContainer.collapsed || messageBox.value == lastEcho))
                {
                    highlightGroup += " Message";
                    action = echoMultiline;
                }

                if ((flags & this.FORCE_MULTILINE) || (/\n/.test(str) || typeof str == "xml") && !(flags & this.FORCE_SINGLELINE))
                    action = echoMultiline;

                if (single)
                    lastEcho = null;
                else
                {
                    if (messageBox.value == lastEcho)
                        echoMultiline(<span highlight="Message">{lastEcho}</span>,
                            messageBox.getAttributeNS(NS.uri, "highlight"));
                    lastEcho = (action == echoLine) && str;
                }

                if (action)
                    action(str, highlightGroup, single);
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
        input: function _input(prompt, callback, extra)
        {
            extra = extra || {};

            input = {
                submit: callback,
                change: extra.onChange,
                complete: extra.completer,
                cancel: extra.onCancel
            };

            modes.push(modes.COMMAND_LINE, modes.PROMPT);
            currentExtendedMode = modes.PROMPT;

            setPrompt(prompt, extra.promptHighlight || this.HL_QUESTION);
            setCommand(extra.default || "");
            commandlineWidget.collapsed = false;
            commandWidget.focus();

            completions = Completions(commandWidget.inputField);
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
        inputMultiline: function inputMultiline(untilRegexp, callbackFunc)
        {
            // Kludge.
            let cmd = !commandWidget.collapsed && this.command;
            modes.push(modes.COMMAND_LINE, modes.INPUT_MULTILINE);
            if (cmd != false)
                echoLine(cmd, this.HL_NORMAL);

            // save the arguments, they are needed in the event handler onEvent
            multilineRegexp = untilRegexp;
            multilineCallback = callbackFunc;

            multilineInputWidget.collapsed = false;
            multilineInputWidget.value = "";
            autosizeMultilineInputWidget();

            setTimeout(function () { multilineInputWidget.focus(); }, 10);
        },

        /**
         * Handles all command-line events. All key events are passed here when
         * COMMAND_LINE mode is active, as well as all input, keyup, focus, and
         * blur events sent to the command-line XUL element.
         *
         * @param {Event} event
         * @private
         */
        onEvent: function onEvent(event)
        {
            let command = this.command;

            if (event.type == "blur")
            {
                // prevent losing focus, there should be a better way, but it just didn't work otherwise
                setTimeout(function () {
                    if (commandShown() && event.originalTarget == commandWidget.inputField)
                        commandWidget.inputField.focus();
                }, 0);
            }
            else if (event.type == "focus")
            {
                if (!commandShown() && event.target == commandWidget.inputField)
                {
                    event.target.blur();
                    liberator.beep();
                }
            }
            else if (event.type == "input")
            {
                this.resetCompletions();
                commandline.triggerCallback("change", currentExtendedMode, command);
            }
            else if (event.type == "keypress")
            {
                let key = events.toString(event);
                if (completions)
                    completions.previewClear();
                if (!currentExtendedMode)
                    return;

                // user pressed <Enter> to carry out a command
                // user pressing <Esc> is handled in the global onEscape
                //   FIXME: <Esc> should trigger "cancel" event
                if (events.isAcceptKey(key))
                {
                    let mode = currentExtendedMode; // save it here, as modes.pop() resets it
                    keepCommand = true;
                    currentExtendedMode = null; // Don't let modes.pop trigger "cancel"
                    modes.pop(!this.silent);
                    commandline.triggerCallback("submit", mode, command);
                }
                // user pressed <Up> or <Down> arrow to cycle history completion
                else if (/^(<Up>|<Down>|<S-Up>|<S-Down>|<PageUp>|<PageDown>)$/.test(key))
                {
                    // prevent tab from moving to the next field
                    event.preventDefault();
                    event.stopPropagation();

                    if (history)
                        history.select(/Up/.test(key), !/(Page|S-)/.test(key));
                    else
                        liberator.beep();
                }
                // user pressed <Tab> to get completions of a command
                else if (key == "<Tab>" || key == "<S-Tab>")
                {
                    // prevent tab from moving to the next field
                    event.preventDefault();
                    event.stopPropagation();

                    tabTimer.tell(event);
                }
                else if (key == "<BS>")
                {
                    // reset the tab completion
                    //this.resetCompletions();

                    // and blur the command line if there is no text left
                    if (command.length == 0)
                    {
                        commandline.triggerCallback("cancel", currentExtendedMode);
                        modes.pop();
                    }
                }
                else // any other key
                {
                    //this.resetCompletions();
                }
                // allow this event to be handled by the host app
            }
            else if (event.type == "keyup")
            {
                let key = events.toString(event);
                if (key == "<Tab>" || key == "<S-Tab>")
                    tabTimer.flush();
            }
        },

        /**
         * Multiline input events, they will come straight from
         * #liberator-multiline-input in the XUL.
         *
         * @param {Event} event
         */
        onMultilineInputEvent: function onMultilineInputEvent(event)
        {
            if (event.type == "keypress")
            {
                let key = events.toString(event);
                if (events.isAcceptKey(key))
                {
                    let text = multilineInputWidget.value.substr(0, multilineInputWidget.selectionStart);
                    if (text.match(multilineRegexp))
                    {
                        text = text.replace(multilineRegexp, "");
                        modes.pop();
                        multilineInputWidget.collapsed = true;
                        multilineCallback.call(this, text);
                    }
                }
                else if (events.isCancelKey(key))
                {
                    modes.pop();
                    multilineInputWidget.collapsed = true;
                }
            }
            else if (event.type == "blur")
            {
                if (modes.extended & modes.INPUT_MULTILINE)
                    setTimeout(function () { multilineInputWidget.inputField.focus(); }, 0);
            }
            else if (event.type == "input")
                autosizeMultilineInputWidget();
            return true;
        },

        /**
         * Handle events when we are in multiline output mode, these come from
         * liberator when modes.extended & modes.MULTILINE_OUTPUT and also from
         * #liberator-multiline-output in the XUL.
         *
         * @param {Event} event
         */
        // FIXME: if 'more' is set and the MOW is not scrollable we should still
        // allow a down motion after an up rather than closing
        onMultilineOutputEvent: function onMultilineOutputEvent(event)
        {
            let win = multilineOutputWidget.contentWindow;

            let showMoreHelpPrompt = false;
            let showMorePrompt = false;
            let closeWindow = false;
            let passEvent = false;

            let key = events.toString(event);

            // TODO: Wouldn't multiple handlers be cleaner? --djk
            if (event.type == "click" && event.target instanceof HTMLAnchorElement)
            {
                function openLink(where)
                {
                    event.preventDefault();
                    // FIXME: Why is this needed? --djk
                    if (event.target.getAttribute("href") == "#")
                        liberator.open(event.target.textContent, where);
                    else
                        liberator.open(event.target.href, where);
                }

                switch (key)
                {
                    case "<LeftMouse>":
                        if (event.originalTarget.getAttributeNS(NS.uri, "highlight") == "URL buffer-list")
                        {
                            event.preventDefault();
                            tabs.select(parseInt(event.originalTarget.parentNode.parentNode.firstChild.textContent, 10) - 1);
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

            if (startHints)
            {
                statusline.updateInputBuffer("");
                startHints = false;
                hints.show(key, undefined, win);
                return;
            }

            function isScrollable() !win.scrollMaxY == 0;
            function atEnd() win.scrollY / win.scrollMaxY >= 1;

            switch (key)
            {
                case "<Esc>":
                    closeWindow = true;
                    break; // handled globally in events.js:onEscape()

                case ":":
                    commandline.open(":", "", modes.EX);
                    return;

                // down a line
                case "j":
                case "<Down>":
                    if (options["more"] && isScrollable())
                        win.scrollByLines(1);
                    else
                        passEvent = true;
                    break;

                case "<C-j>":
                case "<C-m>":
                case "<Return>":
                    if (options["more"] && isScrollable() && !atEnd())
                        win.scrollByLines(1);
                    else
                        closeWindow = true; // don't propagate the event for accept keys
                    break;

                // up a line
                case "k":
                case "<Up>":
                case "<BS>":
                    if (options["more"] && isScrollable())
                        win.scrollByLines(-1);
                    else if (options["more"] && !isScrollable())
                        showMorePrompt = true;
                    else
                        passEvent = true;
                    break;

                // half page down
                case "d":
                    if (options["more"] && isScrollable())
                        win.scrollBy(0, win.innerHeight / 2);
                    else
                        passEvent = true;
                    break;

                // TODO: <LeftMouse> on the prompt line should scroll one page
                // page down
                case "f":
                    if (options["more"] && isScrollable())
                        win.scrollByPages(1);
                    else
                        passEvent = true;
                    break;

                case "<Space>":
                case "<PageDown>":
                    if (options["more"] && isScrollable() && !atEnd())
                        win.scrollByPages(1);
                    else
                        passEvent = true;
                    break;

                // half page up
                case "u":
                    // if (more and scrollable)
                    if (options["more"] && isScrollable())
                        win.scrollBy(0, -(win.innerHeight / 2));
                    else
                        passEvent = true;
                    break;

                // page up
                case "b":
                    if (options["more"] && isScrollable())
                        win.scrollByPages(-1);
                    else if (options["more"] && !isScrollable())
                        showMorePrompt = true;
                    else
                        passEvent = true;
                    break;

                case "<PageUp>":
                    if (options["more"] && isScrollable())
                        win.scrollByPages(-1);
                    else
                        passEvent = true;
                    break;

                // top of page
                case "g":
                    if (options["more"] && isScrollable())
                        win.scrollTo(0, 0);
                    else if (options["more"] && !isScrollable())
                        showMorePrompt = true;
                    else
                        passEvent = true;
                    break;

                // bottom of page
                case "G":
                    if (options["more"] && isScrollable() && !atEnd())
                        win.scrollTo(0, win.scrollMaxY);
                    else
                        passEvent = true;
                    break;

                // copy text to clipboard
                case "<C-y>":
                    util.copyToClipboard(win.getSelection());
                    break;

                // close the window
                case "q":
                    closeWindow = true;
                    break;

                case ";":
                    statusline.updateInputBuffer(";");
                    startHints = true;
                    break;

                // unmapped key
                default:
                    if (!options["more"] || !isScrollable() || atEnd() || events.isCancelKey(key))
                        passEvent = true;
                    else
                        showMoreHelpPrompt = true;
            }

            if (passEvent || closeWindow)
            {
                modes.pop();

                if (passEvent)
                    events.onKeyPress(event);
            }
            else
                commandline.updateMorePrompt(showMorePrompt, showMoreHelpPrompt);
        },

        getSpaceNeeded: function getSpaceNeeded()
        {
            let rect = commandlineWidget.getBoundingClientRect();
            let offset = rect.bottom - window.innerHeight;
            return Math.max(0, offset);
        },

        /**
         * Update or remove the multiline output widget's "MORE" prompt.
         *
         * @param {boolean} force If true, "-- More --" is shown even if we're
         *     at the end of the output.
         * @param {boolean} showHelp When true, show the valid key sequences
         *     and what they do.
         */
        updateMorePrompt: function updateMorePrompt(force, showHelp)
        {
            if (outputContainer.collapsed)
                return echoLine("", this.HL_NORMAL);

            let win = multilineOutputWidget.contentWindow;
            function isScrollable() !win.scrollMaxY == 0;
            function atEnd() win.scrollY / win.scrollMaxY >= 1;

            if (showHelp)
                echoLine("-- More -- SPACE/d/j: screen/page/line down, b/u/k: up, q: quit", this.HL_MOREMSG, true);
            else if (force || (options["more"] && isScrollable() && !atEnd()))
                echoLine("-- More --", this.HL_MOREMSG, true);
            else
                echoLine("Press ENTER or type command to continue", this.HL_QUESTION, true);
        },

        /**
         * Changes the height of the multilineOutputWidget to fit in the
         * available space.
         *
         * @param {boolean} open If true, the widget will be opened if it's not
         *     already so.
         */
        updateOutputHeight: function updateOutputHeight(open)
        {
            if (!open && outputContainer.collapsed)
                return;

            let doc = multilineOutputWidget.contentDocument;

            availableHeight = config.outputHeight;
            if (!outputContainer.collapsed)
                availableHeight += parseFloat(outputContainer.height);
            doc.body.style.minWidth = commandlineWidget.scrollWidth + "px";
            outputContainer.height = Math.min(doc.height, availableHeight) + "px";
            doc.body.style.minWidth = "";
            outputContainer.collapsed = false;
        },

        resetCompletions: function resetCompletions()
        {
            if (completions)
            {
                completions.context.cancelAll();
                completions.wildIndex = -1;
                completions.previewClear();
            }
            if (history)
                history.reset();
        }
    };

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// CALLBACKS ///////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var input = {};

    self.registerCallback("submit", modes.EX, function (command) {
        commands.repeat = command;
        liberator.execute(command);
    });
    self.registerCallback("complete", modes.EX, function (context) {
        context.fork("ex", 0, completion, "ex");
    });
    self.registerCallback("change", modes.EX, function (command) {
        autocompleteTimer.tell(false);
    });

    self.registerCallback("cancel", modes.PROMPT, cancelPrompt);
    self.registerCallback("submit", modes.PROMPT, closePrompt);
    self.registerCallback("change", modes.PROMPT, function (str) {
        if (input.complete)
            autocompleteTimer.tell(false);
        if (input.change)
            return input.change.call(commandline, str);
    });
    self.registerCallback("complete", modes.PROMPT, function (context) {
        if (input.complete)
            context.fork("input", 0, commandline, input.complete);
    });

    function cancelPrompt(value)
    {
        let callback = input.cancel;
        input = {};
        if (callback)
            callback.call(commandline, value != null ? value : commandline.command);
    }

    function closePrompt(value)
    {
        let callback = input.submit;
        input = {};
        if (callback)
            callback.call(commandline, value != null ? value : commandline.command);
    }
    //}}}

    return self;

} //}}}

/**
 * The list which is used for the completion box (and QuickFix window in
 * future).
 *
 * @param {string} id The id of the <iframe> which will display the list. It
 *     must be in its own container element, whose height it will update as
 *     necessary.
 */
function ItemList(id) //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const WAITING_MESSAGE = "Generating results...";

    var completionElements = [];

    var iframe = document.getElementById(id);
    if (!iframe)
    {
        liberator.log("No iframe with id: " + id + " found, strange things may happen!"); // "The truth is out there..." -- djk
        return; // XXX
    }

    function dom(xml, map) util.xmlToDom(xml, doc, map);

    var doc = iframe.contentDocument;
    var container = iframe.parentNode;

    doc.body.id = id + "-content";
    doc.body.appendChild(doc.createTextNode(""));
    doc.body.style.borderTop = "1px solid black"; // FIXME: For cases where completions/MOW are shown at once, or ls=0. Should use :highlight.

    let gradient = template.gradient("GradientLeft", "GradientRight");

    var items = null;
    var startIndex = -1;  // The index of the first displayed item
    var endIndex = -1;    // The index one *after* the last displayed item
    var selIndex = -1;    // The index of the currently selected element
    var div = null;
    var divNodes = {};
    var minHeight = 0;

    function autoSize()
    {
        if (container.collapsed)
            div.style.minWidth = document.getElementById("liberator-commandline").scrollWidth + "px";
        minHeight = Math.max(minHeight, divNodes.completions.getBoundingClientRect().bottom);
        container.height = minHeight;
        if (container.collapsed)
            div.style.minWidth = "";
        // FIXME: Belongs elsewhere.
        commandline.updateOutputHeight(false);
        setTimeout(function () { container.height -= commandline.getSpaceNeeded() }, 0);
    }

    function getCompletion(index) completionElements.snapshotItem(index - startIndex);

    function init()
    {
        div = dom(
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
            </div>, divNodes);
        doc.body.replaceChild(div, doc.body.firstChild);
        //div.scrollIntoView(true);

        items.contextList.forEach(function init_eachContext(context) {
            delete context.cache.nodes;
            if (!context.items.length && !context.message && !context.incomplete)
                return;
            context.cache.nodes = [];
            dom(<div key="root" highlight="CompGroup">
                    <div highlight="Completions">
                        { context.createRow(context.title || [], "CompTitle") }
                    </div>
                    { gradient }
                    <div key="message" highlight="CompMsg"/>
                    <div key="up" highlight="CompLess"/>
                    <div key="items" highlight="Completions"/>
                    <div key="waiting" highlight="CompMsg">{WAITING_MESSAGE}</div>
                    <div key="down" highlight="CompMore"/>
                </div>, context.cache.nodes);
            divNodes.completions.appendChild(context.cache.nodes.root);
        });

        setTimeout(function () { autoSize(); }, 0);
    }

    /**
     * Uses the entries in "items" to fill the listbox and does incremental
     * filling to speed up things.
     *
     * @param {number} offset Start at this index and show options["maxitems"].
     */
    function fill(offset)
    {
        XML.ignoreWhiteSpace = false;
        let diff = offset - startIndex;
        if (items == null || offset == null || diff == 0 || offset < 0)
            return false;

        startIndex = offset;
        endIndex = Math.min(startIndex + options["maxitems"], items.allItems.items.length);

        let haveCompletions = false;
        let off = 0;
        let end = startIndex + options["maxitems"];
        function getRows(context)
        {
            function fix(n) util.Math.constrain(n, 0, len);
            let len = context.items.length;
            let start = off;
            end -= !!context.message + context.incomplete;
            off += len;

            let s = fix(offset - start), e = fix(end - start);
            return [s, e, context.incomplete && e >= offset && off - 1 < end];
        }

        items.contextList.forEach(function fill_eachContext(context) {
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
            nodes.up.style.opacity = "0";
            nodes.down.style.display = "none";

            for (let [i, row] in Iterator(context.getRows(start, end, doc)))
                nodes[i] = row;
            for (let [i, row] in util.Array.iteritems(nodes))
            {
                if (!row)
                    continue;
                let display = (i >= start && i < end);
                if (display && row.parentNode != items)
                {
                    do
                    {
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
            if (context.items.length == 0)
                return;
            nodes.up.style.opacity = (start == 0) ? "0" : "1";
            if (end != context.items.length)
                nodes.down.style.display = "block";
            else
                nodes.up.style.display = "block";
        });

        divNodes.noCompletions.style.display = haveCompletions ? "none" : "block";

        completionElements = buffer.evaluateXPath("//xhtml:div[@liberator:highlight='CompItem']", doc);

        return true;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        clear: function clear() { this.setItems(); doc.body.innerHTML = ""; },
        hide: function hide() { container.collapsed = true; },
        show: function show() { container.collapsed = false; },
        visible: function visible() !container.collapsed,

        reset: function ()
        {
            startIndex = endIndex = selIndex = -1;
            div = null;
            this.selectItem(-1);
        },

        // if @param selectedItem is given, show the list and select that item
        setItems: function setItems(newItems, selectedItem)
        {
            if (container.collapsed)
                minHeight = 0;
            startIndex = endIndex = selIndex = -1;
            items = newItems;
            this.reset();
            if (typeof selectedItem == "number")
            {
                this.selectItem(selectedItem);
                this.show();
            }
        },

        // select index, refill list if necessary
        selectItem: function selectItem(index)
        {
            //if (container.collapsed) // FIXME
            //    return;

            //let now = Date.now();

            if (div == null)
                init();

            let sel = selIndex;
            let len = items.allItems.items.length;
            let newOffset = startIndex;
            let maxItems = options["maxitems"];
            let contextLines = Math.min(3, parseInt((maxItems - 1) / 2));

            if (index == -1 || index == null || index == len) // wrapped around
            {
                if (selIndex < 0)
                    newOffset = 0;
                selIndex = -1;
                index = -1;
            }
            else
            {
                if (index <= startIndex + contextLines)
                    newOffset = index - contextLines;
                if (index >= endIndex - contextLines)
                    newOffset = index + contextLines - maxItems + 1;

                newOffset = Math.min(newOffset, len - maxItems);
                newOffset = Math.max(newOffset, 0);

                selIndex = index;
            }

            if (sel > -1)
                getCompletion(sel).removeAttribute("selected");
            fill(newOffset);
            if (index >= 0)
            {
                getCompletion(index).setAttribute("selected", "true");
                //getCompletion(index).scrollIntoView(false);
            }

            //if (index == 0)
            //    this.start = now;
            //if (index == Math.min(len - 1, 100))
            //    liberator.dump({ time: Date.now() - this.start });
        },

        onEvent: function onEvent(event) false
    };
    //}}}
} //}}}

function StatusLine() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var statusBar = document.getElementById("status-bar");
    statusBar.collapsed = true; // it is later restored unless the user sets laststatus=0

    // our status bar fields
    var statuslineWidget     = document.getElementById("liberator-statusline");
    var urlWidget            = document.getElementById("liberator-statusline-field-url");
    var inputBufferWidget    = document.getElementById("liberator-statusline-field-inputbuffer");
    var progressWidget       = document.getElementById("liberator-statusline-field-progress");
    var tabCountWidget       = document.getElementById("liberator-statusline-field-tabcount");
    var bufferPositionWidget = document.getElementById("liberator-statusline-field-bufferposition");

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["laststatus", "ls"],
        "Show the status line",
        "number", 2,
        {
            setter: function setter(value)
            {
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

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

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
        setClass: function setClass(type)
        {
            const highlightGroup = {
                extended: "StatusLineExtended",
                secure:   "StatusLineSecure",
                broken:   "StatusLineBroken",
                insecure: "StatusLine"
            };

            statusBar.setAttributeNS(NS.uri, "highlight", highlightGroup[type]);
        },

        // update all fields of the statusline
        update: function update()
        {
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
        updateUrl: function updateUrl(url)
        {
            // ripped from Firefox
            if (!window.losslessDecodeURI)
                window.losslessDecodeURI = function (aURI, aPostDataRef) {
                    var value = aURI.spec;
                    // Try to decode as UTF-8 if there's no encoding sequence that we would break.
                    if (!/%25(?:3B|2F|3F|3A|40|26|3D|2B|24|2C|23)/i.test(value))
                        try
                        {
                            value = decodeURI(value)
                            // 1. decodeURI decodes %25 to %, which creates unintended
                            //    encoding sequences. Re-encode it, unless it's part of
                            //    a sequence that survived decodeURI, i.e. one for:
                            //    ';', '/', '?', ':', '@', '&', '=', '+', '$', ',', '#'
                            //    (RFC 3987 section 3.2)
                            // 2. Re-encode whitespace so that it doesn't get eaten away
                            //    by the location bar (bug 410726).
                            .replace(/%(?!3B|2F|3F|3A|40|26|3D|2B|24|2C|23)|[\r\n\t]/ig,
                                encodeURIComponent);
                        }
                        catch (e) {}

                    // Encode invisible characters (soft hyphen, zero-width space, BOM,
                    // line and paragraph separator, word joiner, invisible times,
                    // invisible separator, object replacement character) (bug 452979)
                    value = value.replace(/[\v\x0c\x1c\x1d\x1e\x1f\u00ad\u200b\ufeff\u2028\u2029\u2060\u2062\u2063\ufffc]/g,
                        encodeURIComponent);

                    // Encode bidirectional formatting characters.
                    // (RFC 3987 sections 3.2 and 4.1 paragraph 6)
                    value = value.replace(/[\u200e\u200f\u202a\u202b\u202c\u202d\u202e]/g,
                        encodeURIComponent);
                    return value;
                };

            if (url == null)
                // TODO: this probably needs a more general solution.
                url = losslessDecodeURI(util.newURI(buffer.URL));

            // make it even more Vim-like
            if (url == "about:blank")
            {
                if (!buffer.title)
                    url = "[No Name]";
            }
            else
            {
                url = url.replace(RegExp("^chrome://liberator/locale/(\\S+\\.html)#(.*)"), function (m, n1, n2) n1 + " " + decodeURIComponent(n2) + " [Help]");
                url = url.replace(RegExp("^chrome://liberator/locale/(\\S+\\.html)"), "$1 [Help]");
            }

            // when session information is available, add [+] when we can go
            // backwards, [-] when we can go forwards
            let modified = "";
            if (window.getWebNavigation)
            {
                let sh = window.getWebNavigation().sessionHistory;
                if (sh.index > 0)
                    modified += "+";
                if (sh.index < sh.count -1)
                    modified += "-";
            }
            if (liberator.has("bookmarks"))
            {
                if (bookmarks.isBookmarked(buffer.URL))
                    modified += "\u2764"; // a heart symbol: ❤
                    //modified += "\u2665"; // a heart symbol: ♥
            }

            if (modified)
                url += " [" + modified + "]";

            urlWidget.value = url;
        },

        /**
         * Set the contents of the status line's input buffer to the given
         * string. Used primarily when a key press requires further input
         * before being processed, including mapping counts and arguments,
         * along with multi-key mappings.
         *
         * @param {string} buffer
         */
        updateInputBuffer: function updateInputBuffer(buffer)
        {
            if (!buffer || typeof buffer != "string")
                buffer = "";

            inputBufferWidget.value = buffer;
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
        updateProgress: function updateProgress(progress)
        {
            if (!progress)
                progress = "";

            if (typeof progress == "string")
                progressWidget.value = progress;
            else if (typeof progress == "number")
            {
                let progressStr = "";
                if (progress <= 0)
                    progressStr = "[ Loading...         ]";
                else if (progress < 1)
                {
                    progress = Math.floor(progress * 20);
                    progressStr = "["
                        + "====================".substr(0, progress)
                        + ">"
                        + "                    ".substr(0, 19 - progress)
                        + "]";
                }
                progressWidget.value = progressStr;
            }
        },

        /**
         * Display the correct tabcount (e.g., [1/5]) on the status bar.
         *
         * @param {number} currentIndex The 1-based index of the
         *     currently selected tab. @optional
         * @param {number} totalTabs The total number of tabs. @optional
         */
        updateTabCount: function updateTabCount(currentIndex, totalTabs)
        {
            if (!liberator.has("tabs"))
            {
                tabCountWidget = "";
                return;
            }

            // update the ordinal which is used for numbered tabs only when the user has
            // tab numbers set
            if (options.get("guioptions").has("n", "N"))
            {
                for (let [i, tab] in util.Array.iteritems(getBrowser().mTabs))
                    tab.setAttribute("ordinal", i + 1);
            }

            if (!currentIndex || typeof currentIndex != "number")
                currentIndex = tabs.index() + 1;
            if (!totalTabs || typeof currentIndex != "number")
                totalTabs = tabs.count;

            tabCountWidget.value = "[" + currentIndex + "/" + totalTabs + "]";
        },

        /**
         * Display the main content's vertical scroll position in the status
         * bar.
         *
         * @param {number} percent The position, as a percentage. @optional
         */
        updateBufferPosition: function updateBufferPosition(percent)
        {
            if (!percent || typeof percent != "number")
            {
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

            bufferPositionWidget.value = bufferPositionStr;
        }

    };
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
