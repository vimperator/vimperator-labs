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

    const UNINITIALIZED = -2; // notifies us, if we need to start history/tab-completion from the beginning

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

    var completionList = new ItemList("liberator-completions");
    var completions = { start: 0, items: [] };
    var completionContext = null;
    // for the example command "open sometext| othertext" (| is the cursor pos):
    var completionPrefix = "";     // will be: "open sometext"
    var completionPostfix = "";    // will be: " othertext"
    var completionIndex = UNINITIALIZED;

    var wildIndex = 0;  // keep track how often we press <Tab> in a row
    var startHints = false; // whether we're waiting to start hints mode

    var statusTimer = new util.Timer(5, 100, function statusTell() {
        if (completionIndex >= completions.items.length)
            statusline.updateProgress("");
        else
            statusline.updateProgress("match " + (completionIndex + 1) + " of " + completions.items.length);
    });
    var autocompleteTimer = new util.Timer(201, 300, function autocompleteTell(tabPressed) {
        if (events.feedingKeys)
            return;
        completionContext.reset();
        completionContext.fork("ex", 0, completion, "ex");
        commandline.setCompletions(completionContext.allItems);
    });

    var tabTimer = new util.Timer(10, 10, function tabTell(event) {
        let command = commandline.getCommand();

        // always reset our completion history so up/down keys will start with new values
        historyIndex = UNINITIALIZED;

        // TODO: call just once, and not on each <Tab>
        let wildmode = options.get("wildmode");
        let wildType = wildmode.values[Math.min(wildIndex++, wildmode.values.length - 1)];

        let hasList = wildmode.checkHas(wildType, "list");
        let longest = wildmode.checkHas(wildType, "longest");
        let full = !longest && wildmode.checkHas(wildType, "full");

        // we need to build our completion list first
        if (completionIndex == UNINITIALIZED)
        {
            completionIndex = -1;
            completionPrefix = command.substring(0, commandWidget.selectionStart);
            completionPostfix = command.substring(commandWidget.selectionStart);
            completions = liberator.triggerCallback("complete", currentExtendedMode, completionPrefix);

            completionList.setItems(completionContext);
        }

        if (completions.items.length == 0)
        {
            // Wait for items to come available
            // TODO: also use that code when we DO have completions but too few
            let end = Date.now() + 5000;
            while (completionContext.incomplete && completions.items.length == 0 && Date.now() < end)
            {
                liberator.threadYield();
                completions = completionContext.allItems;
            }

            if (completions.items.length == 0) // still not more matches
            {
                liberator.beep();
                return;
            }
        }

        if (full)
        {
            if (event.shiftKey)
            {
                completionIndex--;
                if (completionIndex < -1)
                    completionIndex = completions.items.length - 1;
            }
            else
            {
                completionIndex++;
                if (completionIndex > completions.items.length)
                    completionIndex = 0;
            }

            statusTimer.tell();
        }

        // the following line is not inside if (hasList) for list:longest,full
        completionList.selectItem(completionIndex);
        if (hasList)
            completionList.show();

        if ((completionIndex == -1 || completionIndex >= completions.items.length) && !longest) // wrapped around matches, reset command line
        {
            if (full)
                setCommand(completionPrefix + completionPostfix);
        }
        else
        {
            var compl = null;
            if (longest && completions.items.length > 1)
                compl = completions.longestSubstring;
            else if (full)
                compl = completions.items[completionIndex].text;
            else if (completions.items.length == 1)
                compl = completions.items[0].text;

            if (compl)
            {
                setCommand(command.substring(0, completions.start) + compl + completionPostfix);
                commandWidget.selectionStart = commandWidget.selectionEnd = completions.start + compl.length;
                if (longest)
                    liberator.triggerCallback("change", currentExtendedMode, commandline.getCommand());

                // Start a new completion in the next iteration. Useful for commands like :source
                // RFC: perhaps the command can indicate whether the completion should be restarted
                //      -> should be doable now, since the completion items are objects
                // Needed for :source to grab another set of completions after a file/directory has been filled out
                // if (completions.length == 1 && !full)
                //     completionIndex = UNINITIALIZED;
            }
        }
    });

    // the containing box for the promptWidget and commandWidget
    var commandlineWidget = document.getElementById("liberator-commandline");
    // the prompt for the current command, for example : or /. Can be blank
    var promptWidget = document.getElementById("liberator-commandline-prompt");
    // the command bar which contains the current command
    var commandWidget = document.getElementById("liberator-commandline-command");
    commandWidget.inputField.QueryInterface(Components.interfaces.nsIDOMNSEditableElement);

    // the widget used for multiline output
    var multilineOutputWidget = document.getElementById("liberator-multiline-output");
    multilineOutputWidget.contentDocument.body.id = "liberator-multiline-output-content";
    var outputContainer = multilineOutputWidget.parentNode;

    // the widget used for multiline intput
    var multilineInputWidget = document.getElementById("liberator-multiline-input");

    // we need to save the mode which were in before opening the command line
    // this is then used if we focus the command line again without the "official"
    // way of calling "open"
    var currentExtendedMode = null;     // the extended mode which we last openend the command line for
    var currentPrompt = null;
    var currentCommand = null;

    // save the arguments for the inputMultiline method which are needed in the event handler
    var multilineRegexp = null;
    var multilineCallback = null;

    // callback for prompt mode
    var promptSubmitCallback = null;
    var promptChangeCallback = null;
    var promptCompleter = null;

    liberator.registerCallback("submit", modes.EX, function (command) { liberator.execute(command); });
    liberator.registerCallback("complete", modes.EX, function (str) {
        completionContext.reset();
        completionContext.tabPressed = true;
        completionContext.fork("ex", 0, completion, "ex");
        return completionContext.allItems;
    });
    liberator.registerCallback("change", modes.EX, function (command) {
        completion.cancel(); // cancel any previous completion function
        if (options.get("wildoptions").has("auto"))
            autocompleteTimer.tell(false);
        else
            completionIndex = UNINITIALIZED;
    });

    function closePrompt(value)
    {
        let callback = promptSubmitCallback;
        promptSubmitCallback = null;
        currentExtendedMode = null;
        commandline.clear();
        if (callback)
            callback(value);
    }
    liberator.registerCallback("cancel", modes.PROMPT, closePrompt);
    liberator.registerCallback("submit", modes.PROMPT, closePrompt);
    liberator.registerCallback("change", modes.PROMPT,
        function (str) { if (promptChangeCallback) return promptChangeCallback(str); });
    liberator.registerCallback("complete", modes.PROMPT,
        function (str) { if (promptCompleter) return promptCompleter(str); });

    function setHighlightGroup(group)
    {
        commandlineWidget.setAttribute("class", group);
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
        promptWidget.setAttribute("class", highlightGroup || commandline.HL_NORMAL);
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
            setMultiline(<span class="hl-Message">{str}</span>, highlightGroup);
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
        XML.ignoreWhitespace = typeof str == "xml";
        var output = util.xmlToDom(<div class={"ex-command-output " + highlightGroup}>{template.maybeXML(str)}</div>, doc);
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
            var elements = doc.getElementsByClassName("ex-command-output");
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

        multilineInputWidget.setAttribute("rows", lines.toString());
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

    // TODO: doesn't belong in ui.js
    options.add(["complete", "cpt"],
        "Items which are completed at the :[tab]open prompt",
        "charlist", "sfl",
        {
            completer: function completer(filter) [k for each (k in completion.urlCompleters)],
            validator: function validator(value) Array.every(value, function (v) v in completion.urlCompleters)
        });

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
             validator: function validator(value)
             {
                 let ss = Components.classes["@mozilla.org/browser/search-service;1"]
                                    .getService(Components.interfaces.nsIBrowserSearchService);

                 return value.split(",").every(function (alias) {
                     let engine = ss.getEngineByAlias(alias);
                     return engine && engine.supportsResponseType("application/x-suggestions+json");
                 });
             }
         });

    options.add(["wildignore", "wig"],
        "List of file patterns to ignore when completing files",
        "stringlist", "",
        {
            validator: function validator(value)
            {
                // TODO: allow for escaping the ","
                try
                {
                    new RegExp("^(" + value.replace(",", "|", "g") + ")$");
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
                    ["",              "Complete only the first match"],
                    ["full",          "Complete the next full match"],
                    ["longest",       "Complete to longest common string"],
                    ["list",          "If more than one match, list all matches"],
                    ["list:full",     "List all and complete first match"],
                    ["list:longest",  "List all and complete common string"]
                ];
            },
            validator: function validator(value)
            {
                let self = this;
                return value.split(",").every(function (opt)
                    self.completer().some(function ([key]) key == opt))
            },
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
                    ["auto", "Automatically show completions while you are typing"],
                    ["sort", "Always sort the completion list"]
                ];
            },
            validator: function validator(value)
            {
                return value.split(",").every(function (item) /^(sort|auto|)$/.test(item));
            }
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
                literal: true
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
                    list += <div class={message.highlight + " hl-Message"}>{message.str}</div>;

                liberator.echo(list, commandline.FORCE_MULTILINE);
            }
        },
        { argCount: "0" });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        HL_NORMAL     : "hl-Normal",
        HL_ERRORMSG   : "hl-ErrorMsg",
        HL_MODEMSG    : "hl-ModeMsg",
        HL_MOREMSG    : "hl-MoreMsg",
        HL_QUESTION   : "hl-Question",
        HL_INFOMSG    : "hl-InfoMsg",
        HL_WARNINGMSG : "hl-WarningMsg",
        HL_LINENR     : "hl-LineNr",

        FORCE_MULTILINE    : 1 << 0,
        FORCE_SINGLELINE   : 1 << 1,
        DISALLOW_MULTILINE : 1 << 2, // if an echo() should try to use the single line
                                     // but output nothing when the MOW is open; when also
                                     // FORCE_MULTILINE is given, FORCE_MULTILINE takes precedence
        APPEND_TO_MESSAGES : 1 << 3, // add the string to the message history

        get completionContext() completionContext,

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
            completionIndex = UNINITIALIZED;

            modes.set(modes.COMMAND_LINE, currentExtendedMode);
            setHighlightGroup(this.HL_NORMAL);
            setPrompt(currentPrompt);
            setCommand(currentCommand);

            commandWidget.focus();

            completionContext = CompletionContext(commandWidget.inputField.editor);
            completionContext.onUpdate = function ()
            {
                commandline.setCompletions(this.allItems);
            };
            // open the completion list automatically if wanted
            if (/\s/.test(cmd) &&
                options.get("wildoptions").has("auto") &&
                extendedMode == modes.EX)
                    autocompleteTimer.tell(false);
        },

        // normally used when pressing esc, does not execute a command
        close: function close()
        {
            var res = liberator.triggerCallback("cancel", currentExtendedMode);
            inputHistory.add(this.getCommand());
            statusline.updateProgress(""); // we may have a "match x of y" visible
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
            var focused = document.commandDispatcher.focusedElement;
            if (focused && focused == commandWidget.inputField || focused == multilineInputWidget.inputField)
                return false;
            if (silent)
                return false;

            highlightGroup = highlightGroup || this.HL_NORMAL;

            if (flags & this.APPEND_TO_MESSAGES)
                messageHistory.add({ str: str, highlight: highlightGroup });

            // if we are modifing the GUI while we are not in the main thread
            // Firefox will hang up
            var threadManager = Components.classes["@mozilla.org/thread-manager;1"]
                                          .getService(Components.interfaces.nsIThreadManager);
            if (!threadManager.isMainThread)
                return false;

            var where = setLine;
            if (flags & this.FORCE_MULTILINE)
                where = setMultiline;
            else if (flags & this.FORCE_SINGLELINE)
                where = function () setLine(str, highlightGroup, true);
            else if (flags & this.DISALLOW_MULTILINE)
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
            setPrompt(prompt + " ", this.HL_QUESTION);
            setCommand(extra.default || "");
            commandWidget.focus();
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
            var command = this.getCommand();

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
                liberator.triggerCallback("change", currentExtendedMode, command);
            }
            else if (event.type == "keypress")
            {
                if (!currentExtendedMode)
                    return true;

                var key = events.toString(event);
                //liberator.log("command line handling key: " + key + "\n");

                // user pressed ENTER to carry out a command
                // user pressing ESCAPE is handled in the global onEscape
                //   FIXME: <Esc> should trigger "cancel" event
                if (events.isAcceptKey(key))
                {
                    let mode = currentExtendedMode; // save it here, as setMode() resets it
                    currentExtendedMode = null; /* Don't let modes.pop trigger "cancel" */
                    inputHistory.add(command);
                    modes.pop(!commandline.silent);
                    this.resetCompletions();
                    completionList.hide();
                    liberator.focusContent(false);
                    statusline.updateProgress(""); // we may have a "match x of y" visible
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
                    completionIndex = UNINITIALIZED;

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
                var key = events.toString(event);
                if (events.isAcceptKey(key))
                {
                    var text = multilineInputWidget.value.substr(0, multilineInputWidget.selectionStart);
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
            var win = multilineOutputWidget.contentWindow;

            var showMoreHelpPrompt = false;
            var showMorePrompt = false;
            var closeWindow = false;
            var passEvent = false;

            function isScrollable() !win.scrollMaxY == 0;
            function atEnd() win.scrollY / win.scrollMaxY >= 1;

            var key = events.toString(event);

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
                    if (event.originalTarget.className == "hl-URL buffer-list")
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
                        var where = /\btabopen\b/.test(options["activate"]) ?
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
            outputContainer.collapsed = false;
        },

        // to allow asynchronous adding of completions
        setCompletions: function setCompletions(newCompletions)
        {
            if (liberator.mode != modes.COMMAND_LINE)
                return;

            // don't show an empty result, if we are just waiting for data to arrive
            // FIXME: Maybe. CompletionContext
            //if (newCompletions.incompleteResult && newCompletions.items.length == 0)
            //    return;

            completionList.setItems(completionContext);

            // try to keep the old item selected
            if (completionIndex >= 0 && completionIndex < newCompletions.items.length && completionIndex < completions.items.length)
            {
                if (newCompletions.items[completionIndex][0] != completions.items[completionIndex][0])
                    completionIndex = -1;
            }
            else
                completionIndex = -1;

            let oldStart = completions.start;
            completions = newCompletions;
            if (typeof completions.start != "number")
                completions.start = oldStart;

            completionList.selectItem(completionIndex);
            if (options.get("wildoptions").has("auto"))
                completionList.show();

            // why do we have to set that here? Without that, we lose the
            // prefix when wrapping around searches
            // with that, we SOMETIMES have problems with <tab> followed by <s-tab> in :open completions
            var command = this.getCommand();
            completionPrefix = command.substring(0, commandWidget.selectionStart);
            completionPostfix = command.substring(commandWidget.selectionStart);
        },

        // TODO: does that function need to be public?
        resetCompletions: function resetCompletions()
        {
            autocompleteTimer.reset();
            completion.cancel();
            completions = { start: completions.start, items: [] };
            completionIndex = historyIndex = UNINITIALIZED;
            wildIndex = 0;
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
    doc.body.style.borderTop = "1px solid black"; // FIXME: For cases where completions/MOW are shown at once. Should use :highlight.

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
        div.style.minWidth = undefined;
        // FIXME: Belongs elsewhere.
        commandline.updateOutputHeight(false);
    }

    function getCompletion(index) completionElements[index - startIndex];

    function init()
    {
        div = dom(
            <div class="ex-command-output hl-Normal" style="white-space: nowrap">
                <div class="hl-Completions" key="noCompletions"><span class="hl-Title">No Completions</span></div>
                <div key="completions"/>
                <div class="hl-Completions">
                {
                    template.map(util.range(0, maxItems), function (i)
                    <ul><li class="hl-CompTitle hl-NonText">~</li></ul>)
                }
                </div>
            </div>, divNodes);
        doc.body.replaceChild(div, doc.body.firstChild);

        items.contextList.forEach(function init_eachContext(context) {
            if (!context.items.length)
                return;
            context.cache.nodes = {};
            dom(<div key="root">
                    <div class="hl-Completions">
                        {context.createRow(context.title || [], "hl-CompTitle")}
                    </div>
                    <div key="up" class="hl-CompLess"/>
                    <div key="items"/>
                    <div key="down" class="hl-CompMore"/>
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

        let stuff = dom(<div class="hl-Completions"/>);

        startIndex = offset;
        endIndex = Math.min(startIndex + maxItems, items.allItems.items.length);

        let off = 0;
        function getRows(context)
        {
            function fix(n) Math.max(0, Math.min(len, n));
            let len = context.items.length;
            let start = off;
            off += len;
            return [fix(offset - start), fix(endIndex - start)];
        }

        items.contextList.forEach(function fill_eachContext(context) {
            let nodes = context.cache.nodes;
            if (!nodes)
                return;
            let dom = nodes.root
            let [start, end] = getRows(context);
            let d = stuff.cloneNode(true);
            for (let [,row] in Iterator(context.getRows(start, end, doc)))
                d.appendChild(row);
            dom.replaceChild(d, nodes.items);
            nodes.items = d;
            nodes.up.style.display = (start == 0) ? "none" : "block";
            nodes.down.style.display = (end == context.items.length) ? "none" : "block";
        });

        divNodes.noCompletions.style.display = (off > 0) ? "none" : "block";

        completionElements = div.getElementsByClassName("hl-CompItem");

        autoSize();
        return true;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        clear: function clear() { this.setItems(); doc.body.innerHTML = ""; },
        hide: function hide() { container.collapsed = true; },
        show: function show()
        {
            /* FIXME: Should only happen with autocomplete,
             * possibly only with async entries.
             */
            if (container.collapsed)
            {
                minHeight = 0;
                setTimeout(function () { fill(null); }, 0);
            }
            container.collapsed = false;
        },
        visible: function visible() !container.collapsed,

        // if @param selectedItem is given, show the list and select that item
        setItems: function setItems(newItems, selectedItem)
        {
            startIndex = endIndex = selIndex = -1;
            items = newItems;
            init();
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

            let len = items.allItems.items.length;
            if (index == -1 || index == len) // wrapped around
            {
                if (selIndex >= 0)
                    getCompletion(selIndex).removeAttribute("selected");
                else // list is shown the first time
                    fill(0);
                selIndex = -1;
                return;
            }

            // find start index
            let newOffset = startIndex;
            if (index >= endIndex - CONTEXT_LINES)
                newOffset = index + CONTEXT_LINES - maxItems + 1;
            else if (index <= startIndex + CONTEXT_LINES)
                newOffset = index - CONTEXT_LINES;

            newOffset = Math.min(newOffset, len - maxItems);
            newOffset = Math.max(newOffset, 0);

            if (selIndex > -1)
                getCompletion(selIndex).removeAttribute("selected");

            let res = fill(newOffset);
            selIndex = index;
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
            validator: function validator(value) value >= 0 && value <= 2
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

            statusBar.setAttribute("class", "chromeclass-status hl-" + highlightGroup[type]);
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
                var title = buffer.title;
                if (!title)
                    url = "[No Name]";
            }
            else
            {
                url = url.replace(RegExp("^chrome://liberator/locale/(\\S+\\.html)$"), "$1 [Help]");
            }

            // when session information is available, add [+] when we can go backwards
            if (config.name == "Vimperator")
            {
                var sh = getWebNavigation().sessionHistory;
                var modified = "";
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
                var progressStr = "";
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
                var win = document.commandDispatcher.focusedWindow;
                if (!win)
                    return;
                percent = win.scrollMaxY == 0 ? -1 : win.scrollY / win.scrollMaxY;
            }

            var bufferPositionStr = "";
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
