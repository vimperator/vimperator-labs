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

        get: function (index) this.store.get(index),

        add: function (str)
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

        add: function (message)
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
    var completions = [];
    // for the example command "open sometext| othertext" (| is the cursor pos):
    var completionStartIndex = 0;  // will be 5 because we want to complete arguments for the :open command
    var completionPrefix = "";     // will be: "open sometext"
    var completionPostfix = "";    // will be: " othertext"
    var completionIndex = UNINITIALIZED;

    var wildIndex = 0;  // keep track how often we press <Tab> in a row
    var startHints = false; // whether we're waiting to start hints mode

    var statusTimer = new util.Timer(5, 100, function () {
        if (completionIndex >= completions.length)
            statusline.updateProgress("");
        else
            statusline.updateProgress("match " + (completionIndex + 1) + " of " + completions.length);
    });
    var autocompleteTimer = new util.Timer(201, 300, function (command) {
        if (events.feedingKeys)
            return;
        let [start, compl] = completion.ex(command);
        commandline.setCompletions(compl, start);
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

    liberator.registerCallback("change", modes.EX, function (command) {
        if (options.get("wildoptions").has("auto"))
            autocompleteTimer.tell(command);
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
            commandWidget.inputField.editor
                         .selection.getRangeAt(0)
                         .startContainer.parentNode
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
        var output = <div class={"ex-command-output " + highlightGroup} style={"min-width: " + commandlineWidget.scrollWidth + "px"}>{template.maybeXML(str)}</div>;
        XML.ignoreWhitespace = true;

        lastMowOutput = output;

        // FIXME: need to make sure an open MOW is closed when commands
        //        that don't generate output are executed
        if (outputContainer.collapsed)
            doc.body.innerHTML = "";

        doc.body.appendChild(util.xmlToDom(output, doc));

        var availableHeight = 250;
        try
        {
            availableHeight = getBrowser().mPanelContainer != undefined ?
                getBrowser().mPanelContainer.boxObject.height : getBrowser().boxObject.height;
        }
        catch (e) {}
        var contentHeight = doc.height;
        var height = contentHeight < availableHeight ? contentHeight : availableHeight;

        outputContainer.height = height + "px";
        outputContainer.collapsed = false;

        if (options["more"] && win.scrollMaxY > 0)
        {
            // start the last executed command's output at the top of the screen
            var elements = doc.getElementsByClassName("ex-command-output");
            elements[elements.length - 1].scrollIntoView(true);

            if (win.scrollY >= win.scrollMaxY)
                setLine("Press ENTER or type command to continue", commandline.HL_QUESTION, true);
            else
                setLine("-- More --", commandline.HL_MOREMSG, true);
        }
        else
        {
            win.scrollTo(0, contentHeight);
            setLine("Press ENTER or type command to continue", commandline.HL_QUESTION, true);
        }

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
        "charlist", "sfbh",
        {
            completer: function (filter)
            {
                return [
                    ["s", "Search engines and keyword URLs"],
                    ["f", "Local files"],
                    ["b", "Bookmarks"],
                    ["h", "History"],
                    ["l", "Firefox location bar entries (bookmarks and history sorted in an intelligent way)"],
                    ["S", "Suggest engines"]
                ];
            },
            validator: function (value) !/[^sfbhSl]/.test(value)
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
             completer: function (value)
             {
                 let ss = Components.classes["@mozilla.org/browser/search-service;1"]
                                    .getService(Components.interfaces.nsIBrowserSearchService);
                 let engines = ss.getEngines({})
                                 .filter(function (engine) engine.supportsResponseType("application/x-suggestions+json"));

                 return engines.map(function (engine) [engine.alias, engine.description]);
             },
             validator: function (value)
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
            validator: function (value)
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
            completer: function (filter)
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
            validator: function (value)
            {
                return value.split(",").every(
                    function (item) /^(full|longest|list|list:full|list:longest|)$/.test(item)
                );
            }
        });

    options.add(["wildoptions", "wop"],
        "Change how command line completion is done",
        "stringlist", "",
        {
            completer: function (value)
            {
                return [
                    ["auto", "Automatically show completions while you are typing"],
                    ["sort", "Always sort the completion list"]
                ];
            },
            validator: function (value)
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
            description: "Display a string at the bottom of the window",
            action: liberator.echo
        },
        {
            name: "echoe[rr]",
            description: "Display an error string at the bottom of the window",
            action: liberator.echoerr
        },
        {
            name: "echom[sg]",
            description: "Display a message at the bottom of the window saving it in the message history",
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
            { completer: function (filter) completion.javascript(filter) });
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

        // not yet used
        FORCE_MULTILINE    : 1 << 0,
        FORCE_SINGLELINE   : 1 << 1,
        DISALLOW_MULTILINE : 1 << 2, // if an echo() should try to use the single line
                                     // but output nothing when the MOW is open; when also
                                     // FORCE_MULTILINE is given, FORCE_MULTILINE takes precedence
        APPEND_TO_MESSAGES : 1 << 3, // add the string to the message history

        get autocompleteTimer() autocompleteTimer,

        get mode() (modes.extended == modes.EX) ? "cmd" : "search",

        get silent() silent,
        set silent(val) {
            silent = val;
            if (silent)
                storage.styles.addSheet("silent-mode", "chrome://*", "#liberator-commandline > * { opacity: 0 }", true, true);
            else
                storage.styles.removeSheet("silent-mode", null, null, null, true);
        },

        getCommand: function ()
        {
            return commandWidget.value;
        },

        open: function (prompt, cmd, extendedMode)
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

            // open the completion list automatically if wanted
            if (/\s/.test(cmd) &&
                options.get("wildoptions").has("auto") >= 0 &&
                extendedMode == modes.EX)
                autocompleteTimer.tell(cmd);
        },

        // normally used when pressing esc, does not execute a command
        close: function ()
        {
            var res = liberator.triggerCallback("cancel", currentExtendedMode);
            inputHistory.add(this.getCommand());
            statusline.updateProgress(""); // we may have a "match x of y" visible
            this.clear();
        },

        clear: function ()
        {
            multilineInputWidget.collapsed = true;
            outputContainer.collapsed = true;
            autocompleteTimer.reset();
            completionList.hide();
            completions = [];
            this.resetCompletions();

            setLine("", this.HL_NORMAL);
        },

        // liberator.echo uses different order of flags as it omits the hightlight group, change v.commandline.echo argument order? --mst
        echo: function (str, highlightGroup, flags)
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
        input: function (prompt, callback, extra)
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
        inputMultiline: function (untilRegexp, callbackFunc)
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

        onEvent: function (event)
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
                    autocompleteTimer.reset();
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
                    // always reset our completion history so up/down keys will start with new values
                    historyIndex = UNINITIALIZED;

                    // TODO: call just once, and not on each <Tab>
                    var wim = options["wildmode"].split(",");
                    var hasList = false;
                    var longest = false;
                    var full = false;
                    var wildType = wim[wildIndex++] || wim[wim.length - 1];
                    if (wildType == "list" || wildType == "list:full" || wildType == "list:longest")
                        hasList = true;
                    if (wildType == "longest" || wildType == "list:longest")
                        longest = true;
                    else if (wildType == "full" || wildType == "list:full")
                        full = true;

                    // we need to build our completion list first
                    if (completionIndex == UNINITIALIZED)
                    {
                        completionStartIndex = 0;
                        completionIndex = -1;
                        completionPrefix = command.substring(0, commandWidget.selectionStart);
                        completionPostfix = command.substring(commandWidget.selectionStart);
                        var res = liberator.triggerCallback("complete", currentExtendedMode, completionPrefix);
                        if (res)
                            [completionStartIndex, completions] = res;

                        // sort the completion list
                        if (options.get("wildoptions").has("sort"))
                            completions.sort(function (a, b) String.localeCompare(a[0], b[0]));

                        completionList.setItems(completions);
                    }

                    if (completions.length == 0)
                    {
                        liberator.beep();
                        // prevent tab from moving to the next field:
                        event.preventDefault();
                        event.stopPropagation();
                        return false;
                    }

                    if (full)
                    {
                        if (event.shiftKey)
                        {
                            completionIndex--;
                            if (completionIndex < -1)
                                completionIndex = completions.length - 1;
                        }
                        else
                        {
                            completionIndex++;
                            if (completionIndex > completions.length)
                                completionIndex = 0;
                        }

                        statusTimer.tell();
                    }

                    // the following line is not inside if (hasList) for list:longest,full
                    completionList.selectItem(completionIndex);
                    if (hasList)
                        completionList.show();

                    if ((completionIndex == -1 || completionIndex >= completions.length) && !longest) // wrapped around matches, reset command line
                    {
                        if (full && completions.length > 1)
                            setCommand(completionPrefix + completionPostfix);
                    }
                    else
                    {
                        var compl = null;
                        if (longest && completions.length > 1)
                            compl = completion.getLongestSubstring();
                        else if (full)
                            compl = completions[completionIndex][0];
                        else if (completions.length == 1)
                            compl = completions[0][0];

                        if (compl)
                        {
                            setCommand(command.substring(0, completionStartIndex) + compl + completionPostfix);
                            commandWidget.selectionStart = commandWidget.selectionEnd = completionStartIndex + compl.length;
                            if (longest)
                                liberator.triggerCallback("change", currentExtendedMode, this.getCommand());

                            // Start a new completion in the next iteration. Useful for commands like :source
                            // RFC: perhaps the command can indicate whether the completion should be restarted
                            // Needed for :source to grab another set of completions after a file/directory has been filled out
                            // if (completions.length == 1 && !full)
                            //     completionIndex = UNINITIALIZED;
                        }
                    }
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

        onMultilineInputEvent: function (event)
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
        onMultilineOutputEvent: function (event)
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
                if (showMoreHelpPrompt)
                    setLine("-- More -- SPACE/d/j: screen/page/line down, b/u/k: up, q: quit", this.HL_MOREMSG);
                else if (showMorePrompt || (options["more"] && isScrollable() && !atEnd()))
                    setLine("-- More --", this.HL_MOREMSG);
                else
                    setLine("Press ENTER or type command to continue", this.HL_QUESTION);
            }
        },

        highlight: function (start, end, type)
        {
            // FIXME: Kludge.
            try // Firefox <3.1 doesn't have repaintSelection
            {
                const selType = Components.interfaces.nsISelectionController["SELECTION_" + type];
                let editor = document.getElementById("liberator-commandline-command")
                                     .inputField.editor;
                let sel = editor.selectionController.getSelection(selType);
                sel.removeAllRanges();

                let range = editor.selection.getRangeAt(0).cloneRange();
                let n = this.getCommand().indexOf(" ") + 1;
                let node = range.startContainer;
                range.setStart(node, start + n);
                range.setEnd(node, end + n);
                sel.addRange(range);
                editor.selectionController.repaintSelection(selType);
            }
            catch (e) {}
        },

        // to allow asynchronous adding of completions
        setCompletions: function (compl, start)
        {
            if (liberator.mode != modes.COMMAND_LINE)
                return;

            /* Only hide if not pending.
            if (compl.length == 0)
                return completionList.hide();
            */

            completionList.setItems(compl);

            if (completionIndex >= 0 && completionIndex < compl.length && completionIndex < completions.length)
            {
                if (compl[completionIndex][0] != completions[completionIndex][0])
                    completionIndex = -1;
            }
            else
                completionIndex = -1;

            completions = compl;
            completionList.selectItem(completionIndex);
            if (options.get("wildoptions").has("auto"))
                completionList.show();

            var command = this.getCommand();
            completionPrefix = command.substring(0, commandWidget.selectionStart);
            completionPostfix = command.substring(commandWidget.selectionStart);

            if (typeof start == "number")
                completionStartIndex = start;
        },

        resetCompletions: function ()
        {
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
 *
 * TODO: get rid off "completion" variables, we are dealing with variables after all
 */
function ItemList(id) //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const CONTEXT_LINES = 3;
    var maxItems = 20;
    var minItems = 2;
    var incrementalFill = true; // make display faster, but does not show scrollbar
    var completionElements = [];

    var iframe = document.getElementById(id);
    if (!iframe)
    {
        liberator.log("No iframe with id: " + id + " found, strange things may happen!"); // "The truth is out there..." -- djk
        return;
    }

    var doc = iframe.contentDocument;
    var container = iframe.parentNode;

    doc.body.id = id + "-content";
    doc.body.appendChild(doc.createTextNode(""));

    var completions = []; // a reference to the Array of completions
    var startIndex = -1;  // The index of the first displayed item
    var endIndex = -1;    // The index one *after* the last displayed item
    var selIndex = -1;    // The index of the currently selected element
    var completionBody = null;
    var minHeight = 0;

    function autoSize()
    {
        minHeight = Math.max(minHeight, completionBody.getBoundingClientRect().bottom);
        container.height = minHeight;
    }
    doc.body.addEventListener("DOMSubtreeModified", autoSize, true);

    // TODO: temporary, to be changed/removed
    function createRow([b, c, a], dom)
    {
        /* Kludge until we have completion contexts. */
        let map = completion.filterMap;
        if (map)
        {
            b = map[0] ? map[0](b) : b;
            c = map[1] ? map[1](c) : c;
        }
        /* Obviously, ItemList shouldn't know or care about this. */
        let filter = completion.filterString;
        if (filter)
        {
            b = template.highlightFilter(b, filter);
            c = template.highlightFilter(c, filter);
        }

        if (typeof a == "function")
            a = a();

        let row =
            <ul class="hl-CompItem">
                <li class="hl-CompIcon">{a ? <img src={a}/> : <></>}</li>
                <li class="hl-CompResult">{b}</li>
                <li class="hl-CompDesc">{c}</li>
            </ul>;

        if (dom)
            return util.xmlToDom(row, doc);
        return row;
    }

    /**
     * uses the entries in completions to fill the listbox
     * does incremental filling to speed up things
     *
     * @param offset: start at this index and show maxItems
     */
    function fill(offset)
    {
        let diff = offset - startIndex;
        if (offset == null || offset - startIndex == 0 || offset < 0 || completions.length && offset >= completions.length)
            return;

        startIndex = offset;
        endIndex = Math.min(startIndex + maxItems, completions.length);

        if (selIndex > -1 && Math.abs(diff) == 1) /* Scroll one position */
        {
            let tbody = completionBody;

            if (diff == 1) /* Scroll down */
            {
                let item = completions[endIndex - 1];
                let row = createRow(item, true);
                tbody.removeChild(tbody.firstChild);
                tbody.appendChild(row);
            }
            else /* Scroll up */
            {
                let item = completions[offset];
                let row = createRow(item, true);
                tbody.removeChild(tbody.lastChild);
                tbody.insertBefore(row, tbody.firstChild);
            }
            return;
        }


        // do a full refill of the list:
        XML.ignoreWhitespace = true;
        let minWidth = document.getElementById("liberator-commandline").scrollWidth;
        let div = <div class="ex-command-output hl-Normal"
                       style={"white-space: normal; min-width: " + minWidth + "px"}>
                      <span class="hl-Title">Completions:</span>
                      <div class="hl-Completions">
                      {
                          template.map(util.range(offset, endIndex), function (i)
                          createRow(completions[i]))
                      }
                      </div>
                      <div class="hl-Completions">
                      {
                          template.map(util.range(0, maxItems), function (i)
                          <ul><li class="hl-NonText">~</li></ul>)
                      }
                      </div>;
                  </div>;

        let dom = util.xmlToDom(div, doc);
        completionBody = dom.getElementsByClassName("hl-Completions")[0];
        //completionElements = completionBody.childNodes;
        completionElements = dom.getElementsByClassName("hl-CompItem");
        doc.body.replaceChild(dom, doc.body.firstChild);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        clear: function () { this.setItems([]); doc.body.innerHTML = ""; },
        hide: function () { container.collapsed = true; },
        show: function show()
        {
            /* FIXME: Should only happen with autocomplete,
             * possibly only with async entries.
             */
            if (container.collapsed)
            {
                minHeight = 0;
                autoSize();
                setTimeout(function () { fill(null); }, 0);
            }
            container.collapsed = false;
        },
        visible: function () !container.collapsed,

        // if @param selectedItem is given, show the list and select that item
        setItems: function setItems(items, selectedItem)
        {
            startIndex = endIndex = selIndex = -1;
            completions = items || [];
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

            if (index == -1 || index == completions.length) // wrapped around
            {
                if (selIndex >= 0)
                    completionElements[selIndex - startIndex].removeAttribute("selected");
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

            newOffset = Math.min(newOffset, completions.length - maxItems);
            newOffset = Math.max(newOffset, 0);

            if (selIndex > -1)
                completionElements[selIndex - startIndex].removeAttribute("selected");

            fill(newOffset);
            selIndex = index;
            completionElements[index - startIndex].setAttribute("selected", "true");

            return;
        },

        onEvent: function (event)
        {
            return false;
        }

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
            setter: function (value)
            {
                if (value == 0)
                    document.getElementById("status-bar").collapsed = true;
                else if (value == 1)
                    liberator.echo("show status line only with > 1 window not implemented yet");
                else
                    document.getElementById("status-bar").collapsed = false;

                return value;
            },
            completer: function (filter)
            {
                return [
                    ["0", "Never display status line"],
                    ["1", "Display status line only if there are multiple windows"],
                    ["2", "Always display status line"]
                ];
            },
            validator: function (value) value >= 0 && value <= 2
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        setClass: function (type)
        {
            const highlightGroup = {
                secure:   "StatusLineSecure",
                broken:   "StatusLineBroken",
                insecure: "StatusLine"
            };

            statusBar.setAttribute("class", "chromeclass-status hl-" + highlightGroup[type]);
        },

        // update all fields of the statusline
        update: function ()
        {
            this.updateUrl();
            this.updateInputBuffer();
            this.updateProgress();
            this.updateTabCount();
            this.updateBufferPosition();
        },

        // if "url" is ommited, build a usable string for the URL
        updateUrl: function (url)
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

        updateInputBuffer: function (buffer)
        {
            if (!buffer || typeof buffer != "string")
                buffer = "";

            inputBufferWidget.value = buffer;
        },

        updateProgress: function (progress)
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
        updateTabCount: function (currentIndex, totalTabs)
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
        updateBufferPosition: function (percent)
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
