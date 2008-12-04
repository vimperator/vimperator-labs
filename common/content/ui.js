/***** BEGIN LICENSE BLOCK ***** {{{
Version: MPL 1.1/GPL 2.0/LGPL 2.1

The contents of this file are subject to the Mozilla Public License Version
1.1 (the "License"); you may not use this file except in compliance with
the License. You may obtain a copy of the License at
http://www.mozilla.org/MPL/

Software distributed under the License is distributed on an "AS IS" basis,
WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
for the specific language governing rights and limitations under the
License.

(c) 2006-2008: Martin Stubenschrott <stubenschrott@gmx.net>

Alternatively, the contents of this file may be used under the terms of
either the GNU General Public License Version 2 or later (the "GPL"), or
the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
in which case the provisions of the GPL or the LGPL are applicable instead
of those above. If you wish to allow use of your version of this file only
under the terms of either the GPL or the LGPL, and not to allow others to
use your version of this file under the terms of the MPL, indicate your
decision by deleting the provisions above and replace them with the notice
and other provisions required by the GPL or the LGPL. If you do not delete
the provisions above, a recipient may use your version of this file under
the terms of any one of the MPL, the GPL or the LGPL.
}}} ***** END LICENSE BLOCK *****/

/*
 * This class is used for prompting of user input and echoing of messages
 *
 * it consists of a prompt and command field
 * be sure to only create objects of this class when the chrome is ready
 */
function CommandLine() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const UNINITIALIZED = {}; // notifies us, if we need to start history/tab-completion from the beginning

    storage.newArray("history-search", true);
    storage.newArray("history-command", true);

    var inputHistory = {
        get mode() (modes.extended == modes.EX) ? "command" : "search",

        get store() storage["history-" + this.mode],

        get length() this.store.length,

        get: function get(index) this.store.get(index),

        add: function add(str)
        {
            if (!str)
                return;

            this.store.mutate('filter', function (line) line != str);
            this.store.push(str);
            this.store.truncate(options["history"], true);
        }
    };

    var historyIndex = UNINITIALIZED;
    var historyStart = "";

    var messageHistory = {
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

        add: function add(message)
        {
            if (!message)
                return;

            if (this._messages.length >= options["messages"])
                this._messages.shift();

            this._messages.push(message);
        }
    };
    var lastMowOutput = null;

    var silent = false;

    function Completions(context)
    {
        let self = this;
        context.onUpdate = function ()
        {
            self.reset(true);
        };
        this.context = context;
        this.editor = context.editor;
        this.selected = null;
        this.wildmode = options.get("wildmode");
        this.itemList = completionList;
        this.itemList.setItems(context);
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
            let str = commandline.getCommand();
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
            liberator.triggerCallback("complete", currentExtendedMode, this.context);
            this.reset(show, tabPressed);
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

            // highlight="Preview" won't work in the editor.
            let node = util.xmlToDom(<span style={highlight.get("Preview").value}>{substring}</span>,
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
            this.wildtypes = this.wildmode.values;
            this.wildIndex = -1;

            this.prefix = this.context.value.substr(0, this.start);
            this.value  = this.context.value.substr(this.start, this.context.caret);
            this.suffix = this.context.value.substr(this.context.caret);

            if (show)
            {
                this.itemList.reset();
                this.select(this.RESET);
                this.wildIndex = 0;
            }

            this.preview();
        },

        select: function select(idx)
        {
            switch (idx)
            {
                case this.UP:
                    if (this.selected == null)
                        idx = this.items.length - 1;
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
                default:         idx = Math.max(0, Math.max(this.items.length - 1, idx));
            }
            this.itemList.selectItem(idx);
            if (idx < 0 || idx >= this.items.length || idx == null)
            {
                // Wrapped. Start again.
                this.selected = null;
                this.completion = this.value;
            }
            else
            {
                this.selected = idx;
                this.completion = this.items[idx].text;
            }
        },

        tab: function tab(reverse)
        {
            // Check if we need to run the completer.
            if (this.context.waitingForTab || this.wildIndex == -1)
                this.complete(true, true);

            if (this.items.length == 0)
            {
                // No items. Wait for any unfinished completers.
                let end = Date.now() + 5000;
                while (this.context.incomplete && this.items.length == 0 && Date.now() < end)
                    liberator.threadYield();

                if (this.items.length == 0)
                    return liberator.beep();
            }

            switch (this.wildtype.replace(/.*:/, ""))
            {
                case "":
                    this.select(0);
                    break;
                case "longest":
                    if (this.items.length > 1)
                    {
                        if (this.substring && this.substring != this.completion)
                        {
                            this.completion = this.substring;
                            liberator.triggerCallback("change", currentExtendedMode, commandline.getCommand());
                        }
                        break;
                    }
                    // Fallthrough
                case "full":
                    this.select(reverse ? this.UP : this.DOWN)
                    break;
            }

            if (this.type.list)
                completionList.show();

            this.wildIndex = Math.max(0, Math.min(this.wildtypes.length - 1, this.wildIndex + 1));
            this.preview();

            statusTimer.tell();
        }
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// TIMERS //////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var statusTimer = new util.Timer(5, 100, function statusTell() {
        if (completions.selected == null)
            statusline.updateProgress("");
        else
            statusline.updateProgress("match " + (completions.selected + 1) + " of " + completions.items.length);
    });

    var autocompleteTimer = new util.Timer(201, 300, function autocompleteTell(tabPressed) {
        if (events.feedingKeys || !completions)
            return;
        completions.complete(true, false);
        completions.itemList.show();
    });

    var tabTimer = new util.Timer(10, 10, function tabTell(event) {
        if (completions)
            completions.tab(event.shiftKey);
    });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// CALLBACKS ///////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // callback for prompt mode
    var promptSubmitCallback = null;
    var promptChangeCallback = null;
    var promptCompleter = null;

    liberator.registerCallback("submit", modes.EX, function (command) { liberator.execute(command); });
    liberator.registerCallback("complete", modes.EX, function (context) {
        context.fork("ex", 0, completion, "ex");
    });
    liberator.registerCallback("change", modes.EX, function (command) {
        if (options.get("wildoptions").has("auto"))
            autocompleteTimer.tell(false);
        else
            completions.reset();
    });

    liberator.registerCallback("cancel", modes.PROMPT, closePrompt);
    liberator.registerCallback("submit", modes.PROMPT, closePrompt);
    liberator.registerCallback("change", modes.PROMPT, function (str) {
        liberator.triggerCallback("change", modes.EX, str);
        if (promptChangeCallback)
            return promptChangeCallback.call(commandline, str);
    });
    liberator.registerCallback("complete", modes.PROMPT, function (context) {
        if (promptCompleter)
            context.fork("input", 0, commandline, promptCompleter);
    });

    function closePrompt(value)
    {
        let callback = promptSubmitCallback;
        promptSubmitCallback = null;
        if (callback)
            callback.call(commandline, value == null ? commandline.getCommand() : value);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// VARIABLES ///////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const completionList = new ItemList("liberator-completions");
    var completions = null;

    var wildIndex = 0;  // keep track how often we press <Tab> in a row
    var startHints = false; // whether we're waiting to start hints mode
    var lastSubstring = "";

    // the containing box for the promptWidget and commandWidget
    const commandlineWidget = document.getElementById("liberator-commandline");
    // the prompt for the current command, for example : or /. Can be blank
    const promptWidget = document.getElementById("liberator-commandline-prompt");
    // the command bar which contains the current command
    const commandWidget = document.getElementById("liberator-commandline-command");

    commandWidget.inputField.QueryInterface(Components.interfaces.nsIDOMNSEditableElement);

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
    var currentPrompt = null;
    var currentCommand = null;

    // save the arguments for the inputMultiline method which are needed in the event handler
    var multilineRegexp = null;
    var multilineCallback = null;

    function setHighlightGroup(group)
    {
        commandlineWidget.setAttributeNS(NS.uri, "highlight", group);
    }

    // sets the prompt - for example, : or /
    function setPrompt(pmt, highlightGroup)
    {
        promptWidget.value = pmt;

        if (pmt)
        {
            promptWidget.size = pmt.length;
            promptWidget.collapsed = false;
        }
        else
        {
            promptWidget.collapsed = true;
        }
        promptWidget.setAttributeNS(NS.uri, "highlight", highlightGroup || commandline.HL_NORMAL);
    }

    // sets the command - e.g. 'tabopen', 'open http://example.com/'
    function setCommand(cmd)
    {
        commandWidget.value = cmd;
    }

    function setLine(str, highlightGroup, forceSingle)
    {
        setHighlightGroup(highlightGroup);
        setPrompt("");
        setCommand(str);
        if (!forceSingle &&
            commandWidget.inputField.editor.rootElement
                         .scrollWidth > commandWidget.inputField.scrollWidth)
        {
            setCommand("");
            setMultiline(<span highlight="Message">{str}</span>, highlightGroup);
        }
    }

    // TODO: extract CSS
    //     : resize upon a window resize
    //     : echoed lines longer than v-c-c.width should wrap and use MOW
    function setMultiline(str, highlightGroup)
    {
        //outputContainer.collapsed = true;
        let doc = multilineOutputWidget.contentDocument;
        let win = multilineOutputWidget.contentWindow;

        /* If it's already XML, assume it knows what it's doing.
         * Otherwise, white space is significant.
         * The problem elsewhere is that E4X tends to insert new lines
         * after interpolated data.
         */
        XML.ignoreWhitespace = typeof str != "xml";
        let output = util.xmlToDom(<div class={"ex-command-output "} style="white-space: nowrap" highlight={highlightGroup}>{template.maybeXML(str)}</div>, doc);
        XML.ignoreWhitespace = true;

        lastMowOutput = output;

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
        {
            win.scrollTo(0, doc.height);
        }
        commandline.updateMorePrompt();

        win.focus();

        startHints = false;
        modes.set(modes.COMMAND_LINE, modes.OUTPUT_MULTILINE);
    }

    function autosizeMultilineInputWidget()
    {
        let lines = multilineInputWidget.value.split("\n").length - 1;

        if (lines == 0)
            lines = 1;

        multilineInputWidget.setAttribute("rows", String(lines));
    }

    // used for the :echo[err] commands
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
        else if (typeof arg != "xml")
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
                 let ss = Components.classes["@mozilla.org/browser/search-service;1"]
                                    .getService(Components.interfaces.nsIBrowserSearchService);
                 let engines = ss.getEngines({})
                                 .filter(function (engine) engine.supportsResponseType("application/x-suggestions+json"));

                 return engines.map(function (engine) [engine.alias, engine.description]);
             },
             validator: Option.validateCompleter
         });

    // TODO: these belong in ui.js
    options.add(["complete", "cpt"],
        "Items which are completed at the :[tab]open prompt",
        "charlist", "sfl",
        {
            completer: function completer(filter) [k for each (k in completion.urlCompleters)],
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
            completer: function completer(filter)
            {
                return [
                    // Why do we need ""?
                    ["",              "Complete only the first match"],
                    ["full",          "Complete the next full match"],
                    ["longest",       "Complete to longest common string"],
                    ["list",          "If more than one match, list all matches"],
                    ["list:full",     "List all and complete first match"],
                    ["list:longest",  "List all and complete common string"]
                ];
            },
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

    // TODO: move "<Esc>", "<C-[" here from mappings
    mappings.add(myModes,
        ["<C-c>"], "Focus content",
        function () { events.onEscape(); });

    mappings.add(myModes,
        ["<Space>"], "Expand command line abbreviation",
        function ()
        {
            commandline.resetCompletions();
            return editor.expandAbbreviation("c");
        },
        { flags: Mappings.flags.ALLOW_EVENT_ROUTING });

    mappings.add(myModes,
        ["<C-]>", "<C-5>"], "Expand command line abbreviation",
        function () { editor.expandAbbreviation("c"); });

    // FIXME: Should be "g<" but that doesn't work unless it has a non-null
    // rhs, getCandidates broken?
    mappings.add([modes.NORMAL],
        ["g."], "Redisplay the last command output",
        function ()
        {
            if (lastMowOutput)
                commandline.echo(lastMowOutput,
                    commandline.HL_NORMAL, commandline.FORCE_MULTILINE);
            else
                liberator.beep();
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var echoCommands = [
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
    ];

    echoCommands.forEach(function (command) {
        commands.add([command.name],
            command.description,
            function (args)
            {
                var str = echoArgumentToString(args.string, true);
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
            // FIXME: I retract my retraction, this command-line/MOW mismatch _is_ really annoying -- djk
            if (messageHistory.length == 1)
            {
                let message = messageHistory.messages[0];
                commandline.echo(message.str, message.highlight, commandline.FORCE_SINGLELINE);
            }
            else if (messageHistory.length > 1)
            {
                let list = <></>;

                for (let [,message] in Iterator(messageHistory.messages))
                    list += <div highlight={message.highlight + " Message"}>{message.str}</div>;

                liberator.echo(list, commandline.FORCE_MULTILINE);
            }
        },
        { argCount: "0" });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        HL_NORMAL     : "Normal",
        HL_ERRORMSG   : "ErrorMsg",
        HL_MODEMSG    : "ModeMsg",
        HL_MOREMSG    : "MoreMsg",
        HL_QUESTION   : "Question",
        HL_INFOMSG    : "InfoMsg",
        HL_WARNINGMSG : "WarningMsg",
        HL_LINENR     : "LineNr",

        FORCE_MULTILINE    : 1 << 0,
        FORCE_SINGLELINE   : 1 << 1,
        DISALLOW_MULTILINE : 1 << 2, // if an echo() should try to use the single line
                                     // but output nothing when the MOW is open; when also
                                     // FORCE_MULTILINE is given, FORCE_MULTILINE takes precedence
        APPEND_TO_MESSAGES : 1 << 3, // add the string to the message history

        get completionContext() completions.context,

        get mode() (modes.extended == modes.EX) ? "cmd" : "search",

        get silent() silent,
        set silent(val) {
            silent = val;
            if (silent)
                storage.styles.addSheet("silent-mode", "chrome://*", "#liberator-commandline > * { opacity: 0 }", true, true);
            else
                storage.styles.removeSheet("silent-mode", null, null, null, true);
        },

        getCommand: function getCommand()
        {
            try
            {
                return commandWidget.inputField.editor.rootElement.firstChild.textContent;
            }
            catch (e) {}
            return commandWidget.value;
        },

        open: function open(prompt, cmd, extendedMode)
        {
            // save the current prompts, we need it later if the command widget
            // receives focus without calling the this.open() method
            currentPrompt = prompt || "";
            currentCommand = cmd || "";
            currentExtendedMode = extendedMode || null;

            historyIndex = UNINITIALIZED;

            modes.set(modes.COMMAND_LINE, currentExtendedMode);
            setHighlightGroup(this.HL_NORMAL);
            setPrompt(currentPrompt);
            setCommand(currentCommand);

            commandWidget.focus();

            completions = new Completions(CompletionContext(commandWidget.inputField.editor));

            // open the completion list automatically if wanted
            if (/\s/.test(cmd) &&
                options.get("wildoptions").has("auto") &&
                extendedMode == modes.EX)
                    autocompleteTimer.tell(false);
        },

        // normally used when pressing esc, does not execute a command
        close: function close()
        {
            let mode = currentExtendedMode;
            currentExtendedMode = null;
            liberator.triggerCallback("cancel", mode);

            inputHistory.add(this.getCommand());
            statusline.updateProgress(""); // we may have a "match x of y" visible
            liberator.focusContent(false);

            this.clear();
        },

        clear: function clear()
        {
            multilineInputWidget.collapsed = true;
            outputContainer.collapsed = true;
            completionList.hide();
            this.resetCompletions();

            setLine("", this.HL_NORMAL);
        },

        // liberator.echo uses different order of flags as it omits the hightlight group, change v.commandline.echo argument order? --mst
        echo: function echo(str, highlightGroup, flags)
        {
            let focused = document.commandDispatcher.focusedElement;
            if (focused && focused == commandWidget.inputField || focused == multilineInputWidget.inputField)
                return false;
            if (silent)
                return false;
            if (modes.main == modes.COMMAND_LINE)
                return false;

            highlightGroup = highlightGroup || this.HL_NORMAL;

            if (flags & this.APPEND_TO_MESSAGES)
                messageHistory.add({ str: str, highlight: highlightGroup });

            liberator.callInMainThread(function () {
                let where = setLine;
                if (flags & commandline.FORCE_MULTILINE)
                    where = setMultiline;
                else if (flags & commandline.FORCE_SINGLELINE)
                    where = function () setLine(str, highlightGroup, true);
                else if (flags & commandline.DISALLOW_MULTILINE)
                {
                    if (!outputContainer.collapsed)
                        where = null;
                    else
                        where = function () setLine(str, highlightGroup, true);
                }
                else if (/\n|<br\/?>/.test(str))
                    where = setMultiline;

                if (where)
                    where(str, highlightGroup);

                currentExtendedMode = null;
            });

            return true;
        },

        // this will prompt the user for a string
        // commandline.input("(s)ave or (o)pen the file?")
        input: function input(prompt, callback, extra)
        {
            extra = extra || {};

            promptSubmitCallback = callback;
            promptChangeCallback = extra.onChange;
            promptCompleter = extra.completer;

            modes.push(modes.COMMAND_LINE, modes.PROMPT);
            currentExtendedMode = modes.PROMPT;

            setPrompt(prompt, extra.promptHighlight || this.HL_QUESTION);
            setCommand(extra.default || "");
            commandWidget.focus();

            completions = new Completions(CompletionContext(commandWidget.inputField.editor));
        },

        // reads a multi line input and returns the string once the last line matches
        // @param untilRegexp
        inputMultiline: function inputMultiline(untilRegexp, callbackFunc)
        {
            // save the mode, because we need to restore it
            modes.push(modes.COMMAND_LINE, modes.INPUT_MULTILINE);

            // save the arguments, they are needed in the event handler onEvent
            multilineRegexp = untilRegexp;
            multilineCallback = callbackFunc;

            multilineInputWidget.collapsed = false;
            multilineInputWidget.value = "";
            autosizeMultilineInputWidget();

            setTimeout(function () { multilineInputWidget.focus(); }, 10);
        },

        onEvent: function onEvent(event)
        {
            let command = this.getCommand();

            if (event.type == "blur")
            {
                // prevent losing focus, there should be a better way, but it just didn't work otherwise
                setTimeout(function () {
                    if (liberator.mode == modes.COMMAND_LINE &&
                        !(modes.extended & modes.INPUT_MULTILINE) &&
                        !(modes.extended & modes.OUTPUT_MULTILINE) &&
                        event.originalTarget == commandWidget.inputField)
                    {
                        commandWidget.inputField.focus();
                    }
                }, 0);
            }
            else if (event.type == "focus")
            {
                if (!currentExtendedMode && event.target == commandWidget.inputField)
                {
                    event.target.blur();
                    liberator.beep();
                }
            }
            else if (event.type == "input")
            {
                if (completions)
                    completions.previewClear();
                liberator.triggerCallback("change", currentExtendedMode, command);
            }
            else if (event.type == "keypress")
            {
                if (completions)
                    completions.previewClear();
                if (!currentExtendedMode)
                    return true;

                let key = events.toString(event);
                //liberator.log("command line handling key: " + key + "\n");

                // user pressed ENTER to carry out a command
                // user pressing ESCAPE is handled in the global onEscape
                //   FIXME: <Esc> should trigger "cancel" event
                if (events.isAcceptKey(key))
                {
                    let mode = currentExtendedMode; // save it here, as modes.pop() resets it
                    currentExtendedMode = null; /* Don't let modes.pop trigger "cancel" */
                    modes.pop();

                    return liberator.triggerCallback("submit", mode, command);
                }
                // user pressed UP or DOWN arrow to cycle history completion
                else if (/^(<Up>|<Down>|<S-Up>|<S-Down>|<PageUp>|<PageDown>)$/.test(key))
                {
                    function loadHistoryItem(index)
                    {
                        setCommand(inputHistory.get(historyIndex));
                        liberator.triggerCallback("change", currentExtendedMode, commandline.getCommand());
                    }

                    let previousItem = /Up/.test(key);
                    let matchCurrent = !/(Page|S-)/.test(key);

                    event.preventDefault();
                    event.stopPropagation();

                    // always reset the tab completion if we use up/down keys
                    completions.select(completions.RESET);

                    // save 'start' position for iterating through the history
                    if (historyIndex == UNINITIALIZED)
                    {
                        historyIndex = inputHistory.length;
                        historyStart = command;
                    }

                    // search the history for the first item matching the current
                    // commandline string
                    while (historyIndex >= -1 && historyIndex <= inputHistory.length)
                    {
                        previousItem ? historyIndex-- : historyIndex++;

                        // user pressed DOWN when there is no newer history item
                        if (historyIndex == inputHistory.length)
                        {
                            setCommand(historyStart);
                            liberator.triggerCallback("change", currentExtendedMode, this.getCommand());
                            break;
                        }

                        // cannot go past history start/end
                        if (historyIndex <= -1)
                        {
                            historyIndex = 0;
                            liberator.beep();
                            break;
                        }
                        else if (historyIndex >= inputHistory.length + 1)
                        {
                            historyIndex = inputHistory.length;
                            liberator.beep();
                            break;
                        }

                        if (matchCurrent)
                        {
                            if (inputHistory.get(historyIndex).indexOf(historyStart) == 0)
                            {
                                loadHistoryItem(historyIndex);
                                break;
                            }
                        }
                        else
                        {
                            loadHistoryItem(historyIndex);
                            break;
                        }
                    }
                }
                // user pressed TAB to get completions of a command
                else if (key == "<Tab>" || key == "<S-Tab>")
                {
                    tabTimer.tell(event);
                    // prevent tab from moving to the next field
                    event.preventDefault();
                    event.stopPropagation();
                    return false;
                }
                else if (key == "<BS>")
                {
                    // reset the tab completion
                    completionIndex = historyIndex = UNINITIALIZED;
                    completions.reset();

                    // and blur the command line if there is no text left
                    if (command.length == 0)
                    {
                        liberator.triggerCallback("cancel", currentExtendedMode);
                        modes.pop(); // FIXME: use mode stack
                    }
                }
                else // any other key
                {
                    this.resetCompletions();
                }
                return true; // allow this event to be handled by Firefox
            }
        },

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
            {
                autosizeMultilineInputWidget();
            }
            return true;
        },

        // FIXME: if 'more' is set and the MOW is not scrollable we should still
        // allow a down motion after an up rather than closing
        onMultilineOutputEvent: function onMultilineOutputEvent(event)
        {
            let win = multilineOutputWidget.contentWindow;

            let showMoreHelpPrompt = false;
            let showMorePrompt = false;
            let closeWindow = false;
            let passEvent = false;

            function isScrollable() !win.scrollMaxY == 0;
            function atEnd() win.scrollY / win.scrollMaxY >= 1;

            let key = events.toString(event);

            if (startHints)
            {
                statusline.updateInputBuffer("");
                startHints = false;
                hints.show(key, undefined, win);
                return;
            }

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
                case "<LeftMouse>":
                    if (event.originalTarget.getAttributeNS(NS.uri, "highlight") == "URL buffer-list")
                    {
                        tabs.select(parseInt(event.originalTarget.parentNode.parentNode.firstChild.textContent, 10) - 1);
                        closeWindow = true;
                        break;
                    }
                    else if (event.originalTarget.localName.toLowerCase() == "a")
                    {
                        liberator.open(event.originalTarget.textContent);
                        break;
                    }
                case "<A-LeftMouse>": // for those not owning a 3-button mouse
                case "<MiddleMouse>":
                    if (event.originalTarget.localName.toLowerCase() == "a")
                    {
                        let where = /\btabopen\b/.test(options["activate"]) ?
                                    liberator.NEW_TAB : liberator.NEW_BACKGROUND_TAB;
                        liberator.open(event.originalTarget.textContent, where);
                    }
                    break;

                // let firefox handle those to select table cells or show a context menu
                case "<C-LeftMouse>":
                case "<RightMouse>":
                case "<C-S-LeftMouse>":
                    break;

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
                // FIXME: use mode stack
                modes.pop();
                this.clear();

                if (passEvent)
                    events.onKeyPress(event);
            }
            else // set update the prompt string
            {
                commandline.updateMorePrompt(showMorePrompt, showMoreHelpPrompt);
            }
        },

        updateMorePrompt: function updateMorePrompt(force, showHelp)
        {
            if (modes.main == modes.COMMAND_LINE)
                return;
            let win = multilineOutputWidget.contentWindow;
            function isScrollable() !win.scrollMaxY == 0;
            function atEnd() win.scrollY / win.scrollMaxY >= 1;

            if (showHelp)
                setLine("-- More -- SPACE/d/j: screen/page/line down, b/u/k: up, q: quit", this.HL_MOREMSG);
            else if (force || (options["more"] && isScrollable() && !atEnd()))
                setLine("-- More --", this.HL_MOREMSG);
            else
                setLine("Press ENTER or type command to continue", this.HL_QUESTION);
        },

        updateOutputHeight: function updateOutputHeight(open)
        {
            if (!open && outputContainer.collapsed)
                return;

            let doc = multilineOutputWidget.contentDocument;
            outputContainer.collapsed = true;
            let availableHeight = 250;
            try
            {
                availableHeight = getBrowser().mPanelContainer ?
                    getBrowser().mPanelContainer.boxObject.height : getBrowser().boxObject.height;
            }
            catch (e) {}
            doc.body.style.minWidth = commandlineWidget.scrollWidth + "px";
            outputContainer.height = Math.min(doc.height, availableHeight) + "px";
            doc.body.style.minWidth = undefined;
            outputContainer.collapsed = false;
        },

        // TODO: does that function need to be public?
        resetCompletions: function resetCompletions()
        {
            autocompleteTimer.reset();
            if (completions)
            {
                completions.context.reset();
                completions.reset();
            }
            historyIndex = UNINITIALIZED;
            removeSuffix = "";
        }
    };
    //}}}
}; //}}}

/**
 * The list which is used for the completion box (and QuickFix window in future)
 *
 * @param id: the id of the the XUL <iframe> which we want to fill
 *            it MUST be inside a <vbox> (or any other html element,
 *            because otherwise setting the height does not work properly
 */
function ItemList(id) //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const CONTEXT_LINES = 3;
    var maxItems = 20;
    var completionElements = [];

    var iframe = document.getElementById(id);
    if (!iframe)
    {
        liberator.log("No iframe with id: " + id + " found, strange things may happen!"); // "The truth is out there..." -- djk
        return;
    }

    function dom(xml, map) util.xmlToDom(xml, doc, map);
    function elemToString(elem) elem.nodeType == elem.TEXT_NODE ? elem.data :
        "<" + [elem.localName].concat([a.name + "=" + a.value.quote() for (a in util.Array.iterator(elem.attributes))]).join(" ") + ">";
    var doc = iframe.contentDocument;
    var container = iframe.parentNode;

    doc.body.id = id + "-content";
    doc.body.appendChild(doc.createTextNode(""));
    doc.body.style.borderTop = "1px solid black"; // FIXME: For cases where completions/MOW are shown at once, or ls=0. Should use :highlight.

    let gradient =
        <div highlight="Gradient">
            <div style="height: 0px">
                <div highlight="GradientRight Gradient"
                     style="border: 0 !important; margin: 0 !important; padding: 0 !important;"/>
            </div>
            <table width="100%" style="height: 100%">
                <tr>
                    { template.map(util.range(0, 100), function (i)
                      <td highlight="GradientLeft" style={"opacity: " + (1 - i / 100)}/>) }
                </tr>
            </table>
        </div>;

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
            div.style.minWidth = undefined;
        // FIXME: Belongs elsewhere.
        commandline.updateOutputHeight(false);
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
                    template.map(util.range(0, maxItems * 2), function (i)
                    <span highlight="CompItem">
                        <li highlight="NonText">~</li>
                    </span>)
                }
                </div>
            </div>, divNodes);
        doc.body.replaceChild(div, doc.body.firstChild);

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
                    <div key="waiting" highlight="CompMsg">Waiting...</div>
                    <div key="down" highlight="CompMore"/>
                </div>, context.cache.nodes);
            divNodes.completions.appendChild(context.cache.nodes.root);
        });
    }

    /**
     * uses the entries in "items" to fill the listbox
     * does incremental filling to speed up things
     *
     * @param offset: start at this index and show maxItems
     */
    function fill(offset)
    {
        XML.ignoreWhiteSpace = false;
        let diff = offset - startIndex;
        if (items == null || offset == null || diff == 0 || offset < 0)
            return false;

        startIndex = offset;
        endIndex = Math.min(startIndex + maxItems, items.allItems.items.length);

        let haveCompletions = false;
        let off = 0;
        let end = startIndex + maxItems;
        function getRows(context)
        {
            function fix(n) Math.max(0, Math.min(len, n));
            end -= context.message + context.incomplete;
            let len = context.items.length;
            let start = off;
            off += len;
            let res = [fix(offset - start), fix(end - start)];
            res[2] = (context.incomplete && res[1] >= offset && off - 1 < end);
            return res;
        }

        items.contextList.forEach(function fill_eachContext(context) {
            let nodes = context.cache.nodes;
            if (!nodes)
                return;
            haveCompletions = true;

            let root = nodes.root
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
            for (let [i, row] in util.Array.iterator2(nodes))
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
                nodes.down.style.display = "block"
            else
                nodes.up.style.display = "block"
        });

        divNodes.noCompletions.style.display = haveCompletions ? "none" : "block";

        completionElements = buffer.evaluateXPath("//xhtml:div[@liberator:highlight='CompItem']", doc);

        autoSize();
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
            //if (container.collapsed) // fixme
            //    return;

            //let now = Date.now();

            if (div == null)
                init();

            let sel = selIndex;
            let len = items.allItems.items.length;
            let newOffset = startIndex;

            if (index == -1 || index == null || index == len) // wrapped around
            {
                if (selIndex < 0)
                    newOffset = 0;
                selIndex = -1;
                index = -1;
            }
            else
            {
                if (index <= startIndex + CONTEXT_LINES)
                    newOffset = index - CONTEXT_LINES;
                if (index >= endIndex - CONTEXT_LINES)
                    newOffset = index + CONTEXT_LINES - maxItems + 1;

                newOffset = Math.min(newOffset, len - maxItems);
                newOffset = Math.max(newOffset, 0);

                selIndex = index;
            }

            if (sel > -1)
                getCompletion(sel).removeAttribute("selected");
            fill(newOffset);
            if (index >= 0)
                getCompletion(index).setAttribute("selected", "true");

            //if (index == 0)
            //    this.start = now;
            //if (index == Math.min(len - 1, 100))
            //    liberator.dump({ time: Date.now() - this.start });
        },

        onEvent: function onEvent(event) false
    };
    //}}}
}; //}}}

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
                    liberator.echo("show status line only with > 1 window not implemented yet");
                else
                    document.getElementById("status-bar").collapsed = false;

                return value;
            },
            completer: function completer(filter)
            {
                return [
                    ["0", "Never display status line"],
                    ["1", "Display status line only if there are multiple windows"],
                    ["2", "Always display status line"]
                ];
            },
            validator: Option.validateCompleter
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        setClass: function setClass(type)
        {
            const highlightGroup = {
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

        // if "url" is ommited, build a usable string for the URL
        updateUrl: function updateUrl(url)
        {
            if (typeof url == "string")
            {
                urlWidget.value = url;
                return;
            }

            url = buffer.URL;

            // make it even more vim-like
            if (url == "about:blank")
            {
                if (!buffer.title)
                    url = "[No Name]";
            }
            else
            {
                url = url.replace(RegExp("^chrome://liberator/locale/(\\S+\\.html)$"), "$1 [Help]");
            }

            // when session information is available, add [+] when we can go backwards
            if (config.name == "Vimperator")
            {
                let sh = window.getWebNavigation().sessionHistory;
                let modified = "";
                if (sh.index > 0)
                    modified += "+";
                if (sh.index < sh.count -1)
                    modified += "-";
                if (bookmarks.isBookmarked(buffer.URL))
                    modified += "\u2764"; // a heart symbol: ❤
                    //modified += "\u2665"; // a heart symbol: ♥

                if (modified)
                    url += " [" + modified + "]";
            }

            urlWidget.value = url;
        },

        updateInputBuffer: function updateInputBuffer(buffer)
        {
            if (!buffer || typeof buffer != "string")
                buffer = "";

            inputBufferWidget.value = buffer;
        },

        updateProgress: function updateProgress(progress)
        {
            if (!progress)
                progress = "";

            if (typeof progress == "string")
            {
                progressWidget.value = progress;
            }
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
                        + "\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0\u00a0".substr(0, 19 - progress)
                        + "]";
                }
                progressWidget.value = progressStr;
            }
        },

        // you can omit either of the 2 arguments
        updateTabCount: function updateTabCount(currentIndex, totalTabs)
        {
            if (!liberator.has("tabs"))
            {
                tabCountWidget = "";
                return;
            }

            // update the ordinal which is used for numbered tabs only when the user has
            // tab numbers set, and the host application supports it
            if (config.hostApplication == "Firefox" &&
                (options.get("guioptions").has("n") || options.get("guioptions").has("N")))
            {
                for (let [i, tab] in Iterator(Array.slice(getBrowser().mTabs)))
                    tab.setAttribute("ordinal", i + 1);
            }

            if (!currentIndex || typeof currentIndex != "number")
                currentIndex = tabs.index() + 1;
            if (!totalTabs || typeof currentIndex != "number")
                totalTabs = tabs.count;

            tabCountWidget.value = "[" + currentIndex + "/" + totalTabs + "]";
        },

        // percent is given between 0 and 1
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
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
