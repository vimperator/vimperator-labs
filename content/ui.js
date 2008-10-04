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
liberator.CommandLine = function () //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const UNINITIALIZED = -2; // notifies us, if we need to start history/tab-completion from the beginning

    liberator.storage.newArray("history-search", true);
    liberator.storage.newArray("history-command", true);

    var history = {
        get mode() (liberator.modes.extended == liberator.modes.EX) ? "command" : "search",

        get store() liberator.storage["history-" + this.mode],

        get length() this.store.length,

        get: function (index) this.store.get(index),

        add: function (str)
        {
            if (!str)
                return;

            this.store.mutate('filter', function (line) line != str);
            this.store.push(str);
            this.store.truncate(liberator.options["history"], true);
        }
    };

    var historyIndex = UNINITIALIZED;
    var historyStart = "";

    var messageHistory = {
        _messages: [],
        get messages()
        {
            let max = liberator.options["messages"];

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

            if (this._messages.length >= liberator.options["messages"])
                this._messages.shift();

            this._messages.push(message);
        }
    };
    var lastMowOutput = null;

    var completionList = new liberator.ItemList("liberator-completions");
    var completions = [];
    // for the example command "open sometext| othertext" (| is the cursor pos):
    var completionStartIndex = 0;  // will be 5 because we want to complete arguments for the :open command
    var completionPrefix = "";     // will be: "open sometext"
    var completionPostfix = "";    // will be: " othertext"
    var completionIndex = UNINITIALIZED;

    var wildIndex = 0;  // keep track how often we press <Tab> in a row
    var startHints = false; // whether we're waiting to start hints mode

    var statusTimer = new liberator.util.Timer(50, 100, function ()
        liberator.statusline.updateProgress("match " + (completionIndex + 1) + " of " + completions.length));
    var autocompleteTimer = new liberator.util.Timer(50, 100, function (command) {
            var res = liberator.completion.ex(command);
            liberator.commandline.setCompletions(res[1], res[0]);
        });

    // the containing box for the promptWidget and commandWidget
    var commandlineWidget = document.getElementById("liberator-commandline");
    // the prompt for the current command, for example : or /. Can be blank
    var promptWidget = document.getElementById("liberator-commandline-prompt");
    // the command bar which contains the current command
    var commandWidget = document.getElementById("liberator-commandline-command");

    // the widget used for multiline output
    var multilineOutputWidget = document.getElementById("liberator-multiline-output");
    multilineOutputWidget.setAttribute("src",
        liberator.util.blankDocument("liberator-multiline-output-content"));

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
    var promptCallback = null;
    var promptCompleter = null;

    liberator.registerCallback("change", liberator.modes.EX, function (command) {
        if (liberator.options["wildoptions"].indexOf("auto") >= 0)
            autocompleteTimer.tell(command);
        else
            completionIndex = UNINITIALIZED;
    });

    function closePrompt(value)
    {
        let callback = promptCallback;
        promptCallback = null;
        currentExtendedMode = null;
        liberator.commandline.clear();
        if (callback)
            callback(value);
    }
    liberator.registerCallback("cancel", liberator.modes.PROMPT, closePrompt);
    liberator.registerCallback("submit", liberator.modes.PROMPT, closePrompt);
    liberator.registerCallback("complete", liberator.modes.PROMPT,
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
        promptWidget.setAttribute("class", highlightGroup || liberator.commandline.HL_NORMAL);
    }

    // sets the command - e.g. 'tabopen', 'open http://example.com/'
    function setCommand(cmd)
    {
        commandWidget.value = cmd;
    }

    function setLine(str, highlightGroup)
    {
        setHighlightGroup(highlightGroup);
        setPrompt("");
        setCommand(str);
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
        var output = <div class={"ex-command-output " + highlightGroup}>{liberator.template.maybeXML(str)}</div>;
        XML.ignoreWhiteSpace = true;

        lastMowOutput = output;

        // FIXME: need to make sure an open MOW is closed when commands
        //        that don't generate output are executed
        if (outputContainer.collapsed)
            doc.body.innerHTML = "";

        XML.prettyPrinting = false;
        doc.body.appendChild(liberator.util.xmlToDom(output, doc));

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

        if (liberator.options["more"] && win.scrollMaxY > 0)
        {
            // start the last executed command's output at the top of the screen
            var elements = doc.getElementsByClassName("ex-command-output");
            elements[elements.length - 1].scrollIntoView(true);

            if (win.scrollY >= win.scrollMaxY)
                setLine("Press ENTER or type command to continue", liberator.commandline.HL_QUESTION);
            else
                setLine("-- More --", liberator.commandline.HL_QUESTION);
        }
        else
        {
            win.scrollTo(0, contentHeight);
            setLine("Press ENTER or type command to continue", liberator.commandline.HL_QUESTION);
        }

        win.focus();

        startHints = false;
        liberator.modes.push(liberator.modes.COMMAND_LINE, liberator.modes.OUTPUT_MULTILINE);
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
            liberator.echoerr(e.toString());
            return null;
        }

        if (typeof arg === "object")
            arg = liberator.util.objectToString(arg, useColor);
        else if (typeof arg === "function")
            arg = liberator.util.escapeHTML(arg.toString());
        else if (typeof arg === "number" || typeof arg === "boolean")
            arg = "" + arg;
        else if (typeof arg === "undefined")
            arg = "undefined";

        return arg;
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    // TODO: doesn't belong in ui.js
    liberator.options.add(["complete", "cpt"],
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

    liberator.options.add(["history", "hi"],
        "Number of Ex commands and search patterns to store in the command-line history",
        "number", 500,
        {
            validator: function (value) value >= 0
        });

    liberator.options.add(["messages", "msgs"],
        "Number of messages to store in the message history",
        "number", 100,
        {
            validator: function (value) value >= 0
        });

    liberator.options.add(["more"],
        "Pause the message list window when more than one screen of listings is displayed",
        "boolean", true);

    liberator.options.add(["showmode", "smd"],
        "Show the current mode in the command line",
        "boolean", true);

    liberator.options.add(["suggestengines"],
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

    liberator.options.add(["wildignore", "wig"],
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

    liberator.options.add(["wildmode", "wim"],
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

    liberator.options.add(["wildoptions", "wop"],
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

    var modes = [liberator.modes.COMMAND_LINE];

    // TODO: move "<Esc>", "<C-[" here from mappings
    liberator.mappings.add(modes,
        ["<C-c>"], "Focus content",
        function () { liberator.events.onEscape(); });

    liberator.mappings.add(modes,
        ["<Space>"], "Expand command line abbreviation",
        function ()
        {
            liberator.commandline.resetCompletions();
            return liberator.editor.expandAbbreviation("c");
        },
        { flags: liberator.Mappings.flags.ALLOW_EVENT_ROUTING });

    liberator.mappings.add(modes,
        ["<C-]>", "<C-5>"], "Expand command line abbreviation",
        function () { liberator.editor.expandAbbreviation("c"); });

    // FIXME: Should be "g<" but that doesn't work unless it has a non-null
    // rhs, getCandidates broken?
    liberator.mappings.add([liberator.modes.NORMAL],
        ["gm"], "Redisplay the last command output",
        function ()
        {
            if (lastMowOutput)
                liberator.commandline.echo(lastMowOutput,
                    liberator.commandline.HL_NORMAL, liberator.commandline.FORCE_MULTILINE);
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
        liberator.commands.add([command.name],
            command.description,
            function (args)
            {
                var str = echoArgumentToString(args, true);
                if (str != null)
                    command.action(str);
            },
            {
                completer: function (filter) liberator.completion.javascript(filter)
            });
    });

    liberator.commands.add(["mes[sages]"],
        "Display previously given messages",
        function ()
        {
            // TODO: color messages
            //     : are all messages single line? Some display an aggregation
            //       of single line messages at least. E.g. :source
            let list = messageHistory.messages.join("\n");

            liberator.commandline.echo(list);
        }, { argCount: "0" });

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

        get mode() (liberator.modes.extended == liberator.modes.EX) ? "cmd" : "search",

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

            liberator.modes.push(liberator.modes.COMMAND_LINE, currentExtendedMode);
            setHighlightGroup(this.HL_NORMAL);
            setPrompt(currentPrompt);
            setCommand(currentCommand);

            commandWidget.focus();

            // open the completion list automatically if wanted
            if (/\s/.test(cmd) &&
                liberator.options["wildoptions"].indexOf("auto") >= 0 &&
                extendedMode == liberator.modes.EX)
            {
                var [start, compl] = liberator.completion.ex(cmd);
                this.setCompletions(compl, start);
            }
        },

        // normally used when pressing esc, does not execute a command
        close: function ()
        {
            var res = liberator.triggerCallback("cancel", currentExtendedMode);
            history.add(this.getCommand());
            liberator.statusline.updateProgress(""); // we may have a "match x of y" visible
            this.clear();
        },

        clear: function ()
        {
            multilineInputWidget.collapsed = true;
            outputContainer.collapsed = true;
            completionList.hide();
            completions = [];
            this.resetCompletions();

            setLine("", this.HL_NORMAL);
        },

        // liberator.echo uses different order of flags as it omits the hightlight group, change v.commandline.echo argument order? --mst
        echo: function (str, highlightGroup, flags)
        {
            // if we are modifing the GUI while we are not in the main thread
            // Firefox will hang up
            var threadManager = Components.classes["@mozilla.org/thread-manager;1"]
                                          .getService(Components.interfaces.nsIThreadManager);
            if (!threadManager.isMainThread)
                return false;

            var focused = document.commandDispatcher.focusedElement;
            if (focused && focused == commandWidget.inputField || focused == multilineInputWidget.inputField)
                return false;

            highlightGroup = highlightGroup || this.HL_NORMAL;

            if (flags & this.APPEND_TO_MESSAGES)
                messageHistory.add(str);

            var where = setLine;
            if (flags & this.FORCE_MULTILINE)
                where = setMultiline;
            else if (flags & this.FORCE_SINGLELINE)
                where = setLine;
            else if (!outputContainer.collapsed)
            {
                if (flags & this.DISALLOW_MULTILINE)
                    where = null;
                else
                    where = setMultiline;
            }
            else if (/\n|<br\/?>/.test(str))
                where = setMultiline;

            if (where)
                where(str, highlightGroup);

            currentExtendedMode = null;

            return true;
        },

        // this will prompt the user for a string
        // liberator.commandline.input("(s)ave or (o)pen the file?")
        input: function (prompt, callback, extra)
        {
            extra = extra || {};

            promptCallback = callback;
            promptCompleter = extra.completer;
            liberator.modes.push(liberator.modes.COMMAND_LINE, liberator.modes.PROMPT);
            currentExtendedMode = liberator.modes.PROMPT;
            setPrompt(prompt + " ", this.HL_QUESTION);
            setCommand(extra.default || "");
            commandWidget.focus();
        },

        // reads a multi line input and returns the string once the last line matches
        // @param untilRegexp
        inputMultiline: function (untilRegexp, callbackFunc)
        {
            // save the mode, because we need to restore it
            liberator.modes.push(liberator.modes.COMMAND_LINE, liberator.modes.INPUT_MULTILINE);

            // save the arguments, they are needed in the event handler onEvent
            multilineRegexp = untilRegexp;
            multilineCallback = callbackFunc;

            multilineInputWidget.collapsed = false;
            multilineInputWidget.value = "";
            autosizeMultilineInputWidget();

            setTimeout(function () multilineInputWidget.focus(), 10);
        },

        onEvent: function (event)
        {
            var command = this.getCommand();

            if (event.type == "blur")
            {
                // prevent losing focus, there should be a better way, but it just didn't work otherwise
                setTimeout(function () {
                    if (liberator.mode == liberator.modes.COMMAND_LINE &&
                        !(liberator.modes.extended & liberator.modes.INPUT_MULTILINE) &&
                        !(liberator.modes.extended & liberator.modes.OUTPUT_MULTILINE))
                                commandWidget.inputField.focus();
                }, 0);
            }
            else if (event.type == "focus")
            {
                if (!currentExtendedMode && event.target == commandWidget.inputField)
                    event.target.blur();
            }
            else if (event.type == "input")
            {
                liberator.triggerCallback("change", currentExtendedMode, command);
            }
            else if (event.type == "keypress")
            {
                if (!currentExtendedMode)
                    return true;

                var key = liberator.events.toString(event);
                //liberator.log("command line handling key: " + key + "\n");

                // user pressed ENTER to carry out a command
                // user pressing ESCAPE is handled in the global onEscape
                //   FIXME: <Esc> should trigger "cancel" event
                if (liberator.events.isAcceptKey(key))
                {
                    var mode = currentExtendedMode; // save it here, as setMode() resets it
                    currentExtendedMode = null; /* Don't let modes.pop trigger "cancel" */
                    history.add(command);
                    liberator.modes.pop(true);
                    completionList.hide();
                    liberator.focusContent(false);
                    liberator.statusline.updateProgress(""); // we may have a "match x of y" visible
                    return liberator.triggerCallback("submit", mode, command);
                }

                // user pressed UP or DOWN arrow to cycle history completion
                else if (key == "<Up>" || key == "<Down>")
                {
                    event.preventDefault();
                    event.stopPropagation();

                    // always reset the tab completion if we use up/down keys
                    completionIndex = UNINITIALIZED;

                    // save 'start' position for iterating through the history
                    if (historyIndex == UNINITIALIZED)
                    {
                        historyIndex = history.length;
                        historyStart = command;
                    }

                    // search the history for the first item matching the current
                    // commandline string
                    while (historyIndex >= -1 && historyIndex <= history.length)
                    {
                        key == "<Up>" ? historyIndex-- : historyIndex++;

                        // user pressed DOWN when there is no newer history item
                        if (historyIndex == history.length)
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
                        else if (historyIndex >= history.length + 1)
                        {
                            historyIndex = history.length;
                            liberator.beep();
                            break;
                        }

                        if (history.get(historyIndex).indexOf(historyStart) == 0)
                        {
                            setCommand(history.get(historyIndex));
                            liberator.triggerCallback("change", currentExtendedMode, this.getCommand());
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
                    var wim = liberator.options["wildmode"].split(/,/);
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
                        if (/\bsort\b/.test(liberator.options["wildoptions"]))
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

                        // FIXME: this innocent looking line is the source of a big performance
                        // problem, when keeping <Tab> pressed down, so disable it for now
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
                            compl = liberator.completion.getLongestSubstring();
                        else if (full)
                            compl = completions[completionIndex][0];
                        else if (completions.length == 1)
                            compl = completions[0][0];

                        if (compl)
                        {
                            setCommand(command.substring(0, completionStartIndex) + compl + completionPostfix);
                            commandWidget.selectionStart = commandWidget.selectionEnd = completionStartIndex + compl.length;

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
                        liberator.modes.pop(); // FIXME: use mode stack
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
                var key = liberator.events.toString(event);
                if (liberator.events.isAcceptKey(key))
                {
                    var text = multilineInputWidget.value.substr(0, multilineInputWidget.selectionStart);
                    if (text.match(multilineRegexp))
                    {
                        text = text.replace(multilineRegexp, "");
                        liberator.modes.pop();
                        multilineInputWidget.collapsed = true;
                        multilineCallback.call(this, text);
                    }
                }
                else if (liberator.events.isCancelKey(key))
                {
                    liberator.modes.pop();
                    multilineInputWidget.collapsed = true;
                }
            }
            else if (event.type == "blur")
            {
                if (liberator.modes.extended & liberator.modes.INPUT_MULTILINE)
                    setTimeout(function () multilineInputWidget.inputField.focus(), 0);
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

            function isScrollable() { return !win.scrollMaxY == 0; }
            function atEnd() { return win.scrollY / win.scrollMaxY >= 1; }

            var key = liberator.events.toString(event);

            if (startHints)
            {
                liberator.statusline.updateInputBuffer("");
                startHints = false;
                liberator.hints.show(liberator.modes.EXTENDED_HINT, key, undefined, win);
                return;
            }

            switch (key)
            {
                case "<Esc>":
                    closeWindow = true;
                    break; // handled globally in events.js:onEscape()

                case ":":
                    liberator.commandline.open(":", "", liberator.modes.EX);
                    return;

                // down a line
                case "j":
                case "<Down>":
                    if (liberator.options["more"] && isScrollable())
                        win.scrollByLines(1);
                    else
                        passEvent = true;
                    break;

                case "<C-j>":
                case "<C-m>":
                case "<Return>":
                    if (liberator.options["more"] && isScrollable() && !atEnd())
                        win.scrollByLines(1);
                    else
                        closeWindow = true; // don't propagate the event for accept keys
                    break;

                // up a line
                case "k":
                case "<Up>":
                case "<BS>":
                    if (liberator.options["more"] && isScrollable())
                        win.scrollByLines(-1);
                    else if (liberator.options["more"] && !isScrollable())
                        showMorePrompt = true;
                    else
                        passEvent = true;
                    break;

                // half page down
                case "d":
                    if (liberator.options["more"] && isScrollable())
                        win.scrollBy(0, win.innerHeight / 2);
                    else
                        passEvent = true;
                    break;

                // TODO: <LeftMouse> on the prompt line should scroll one page
                case "<LeftMouse>":
                    if (event.originalTarget.className == "hl-URL buffer-list")
                    {
                        liberator.tabs.select(parseInt(event.originalTarget.parentNode.parentNode.firstChild.textContent, 10) - 1);
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
                        var where = /\btabopen\b/.test(liberator.options["activate"]) ?
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
                    if (liberator.options["more"] && isScrollable())
                        win.scrollByPages(1);
                    else
                        passEvent = true;
                    break;

                case "<Space>":
                case "<PageDown>":
                    if (liberator.options["more"] && isScrollable() && !atEnd())
                        win.scrollByPages(1);
                    else
                        passEvent = true;
                    break;

                // half page up
                case "u":
                    // if (more and scrollable)
                    if (liberator.options["more"] && isScrollable())
                        win.scrollBy(0, -(win.innerHeight / 2));
                    else
                        passEvent = true;
                    break;

                // page up
                case "b":
                    if (liberator.options["more"] && isScrollable())
                        win.scrollByPages(-1);
                    else if (liberator.options["more"] && !isScrollable())
                        showMorePrompt = true;
                    else
                        passEvent = true;
                    break;

                case "<PageUp>":
                    if (liberator.options["more"] && isScrollable())
                        win.scrollByPages(-1);
                    else
                        passEvent = true;
                    break;

                // top of page
                case "g":
                    if (liberator.options["more"] && isScrollable())
                        win.scrollTo(0, 0);
                    else if (liberator.options["more"] && !isScrollable())
                        showMorePrompt = true;
                    else
                        passEvent = true;
                    break;

                // bottom of page
                case "G":
                    if (liberator.options["more"] && isScrollable() && !atEnd())
                        win.scrollTo(0, win.scrollMaxY);
                    else
                        passEvent = true;
                    break;

                // copy text to clipboard
                case "<C-y>":
                    liberator.util.copyToClipboard(win.getSelection());
                    break;

                // close the window
                case "q":
                    closeWindow = true;
                    break;

                case ";":
                    liberator.statusline.updateInputBuffer(";");
                    startHints = true;
                    break;

                // unmapped key
                default:
                    if (!liberator.options["more"] || !isScrollable() || atEnd() || liberator.events.isCancelKey(key))
                        passEvent = true;
                    else
                        showMoreHelpPrompt = true;
            }

            if (passEvent || closeWindow)
            {
                // FIXME: use mode stack
                liberator.modes.pop();
                this.clear();

                if (passEvent)
                    liberator.events.onKeyPress(event);
            }
            else // set update the prompt string
            {
                if (showMoreHelpPrompt)
                    setLine("-- More -- SPACE/d/j: screen/page/line down, b/u/k: up, q: quit", this.HL_MOREMSG);
                else if (showMorePrompt || (liberator.options["more"] && isScrollable() && !atEnd()))
                    setLine("-- More --", this.HL_MOREMSG);
                else
                    setLine("Press ENTER or type command to continue", this.HL_QUESTION);
            }
        },

        // to allow asynchronous adding of completions, broken
        // since the completion -> ItemList rewrite
        setCompletions: function (compl, start)
        {
            if (liberator.mode != liberator.modes.COMMAND_LINE)
                return;

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
liberator.ItemList = function (id) //{{{
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

    var doc;
    var container = iframe.parentNode;

    iframe.setAttribute("src", liberator.util.blankDocument(id + "-content"));

    var completions = []; // a reference to the Array of completions
    var listOffset = -1;  // how many items is the displayed list shifted from the internal tab index
    var listIndex = -1;   // listOffset + listIndex = completions[item]
    var selectedElement = null;

    // FIXME: ItemList shouldn't know of favicons of course, so also temporary
    try
    {
        var faviconService = Components.classes["@mozilla.org/browser/favicon-service;1"].getService(Components.interfaces.nsIFaviconService);
        const ioService    = Components.classes["@mozilla.org/network/io-service;1"]
                                       .getService(Components.interfaces.nsIIOService);
    }
    catch (e) {} // for muttator!

    // TODO: temporary, to be changed/removed
    function createRow(b, c, dom)
    {
        try
        {
            let uri = ioService.newURI(b, null, null);
            var a = faviconService.getFaviconImageForPage(uri).spec;
        }
        catch (e) {}

        let row =
            <tr class="liberator-compitem">
                <td style="width: 16px"/>
                <td style="width: 45%; overflow: hidden">{b}</td>
                <td style="color: gray">{c}</td>
            </tr>

        if (a)
            row.td[0].* = <img width="16px" height="16px" src={a}/>;

        if (dom)
            return liberator.util.xmlToDom(row, doc);
        return row;
    }

    function autoSize()
    {
        function getHeight()
        {
            if (completionElements.length == 0)
                return doc.height;

            var wanted = Math.min(maxItems + listOffset,
                                  completionElements.length);
            return completionElements[wanted - 1].getBoundingClientRect().bottom;
        }

        var height = getHeight();
        if (height == 0) // sometimes we don't have the correct size at this point
            setTimeout(function () container.height = getHeight(), 10);
        else
            container.height = height;
    }

    /**
     * uses the entries in completions to fill the listbox
     * does incremental filling to speed up things
     *
     * @param offset: start at this index and show maxItems
     */
    function fill(offset)
    {
        if (listOffset == offset || offset < 0 || offset >= completions.length && completions.length)
            return;

        if (listIndex > -1 && offset == listOffset + 1)
        {
            listOffset = offset;
            var row = createRow(completions[offset + maxItems - 1][0], completions[offset + maxItems - 1][1], true);
            var e = doc.getElementsByTagName("tbody");
            e = e[e.length - 1];

            e.removeChild(e.firstChild);
            e.appendChild(row);
            completionElements = e.children;
            return;
        }
        else if (listIndex > -1 && offset == listOffset - 1)
        {
            listOffset = offset;
            var row = createRow(completions[offset][0], completions[offset][1], true);
            var e = doc.getElementsByTagName("tbody");
            e = e[e.length - 1];

            e.removeChild(e.lastChild);
            e.insertBefore(row, e.firstChild);
            completionElements = e.children;
            return;
        }

        listOffset = offset;

        // do a full refill of the list:
        doc.body.innerHTML = "";

        let div = <div class="ex-command-output hl-Normal">
                      <span class="hl-Title" style="font-weight: bold">Completions:</span>
                      <table width="100%" style="table-layout: fixed; width: 100%"><tbody/></table>
                  </div>;
        let tbody = div..tbody;

        for (let i in liberator.util.range(offset, Math.min(offset + maxItems,
                                                            completions.length)))
        {
            let elem = completions[i];
            tbody.* += createRow(elem[0], elem[1]);
        }

        doc.body.appendChild(liberator.util.xmlToDom(div, doc));

        completionElements = doc.getElementsByClassName("liberator-compitem");
        autoSize();
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        clear: function () { this.setItems([]); doc.body.innerHTML = ""; },
        hide: function () { container.collapsed = true; },
        show: function () { container.collapsed = false; },
        visible: function () { return !container.collapsed; },

        // if @param selectedItem is given, show the list and select that item
        setItems: function (items, selectedItem)
        {
            doc = iframe.contentDocument;
            listOffset = listIndex = -1;
            completions = items || [];
            if (typeof(selectedItem) == "number")
            {
                this.selectItem(selectedItem);
                this.show();
            }
        },

        // select index, refill list if necessary
        selectItem: function (index)
        {
            //if (container.collapsed) // fixme
            //    return;

            if (index == -1 || index == completions.length) // wrapped around
            {
                if (listIndex >= 0)
                    completionElements[listIndex - listOffset].style.backgroundColor = "";
                else // list is shown the first time
                    fill(0);

                listIndex = index;
                return;
            }

            // find start index
            var newOffset = 0;
            if (index >= listOffset + maxItems - CONTEXT_LINES)
                newOffset = index - maxItems + CONTEXT_LINES + 1;
            else if (index <= listOffset + CONTEXT_LINES)
                newOffset = index - CONTEXT_LINES;
            else
                newOffset = listOffset;

            if (newOffset + maxItems > completions.length)
                newOffset = completions.length - maxItems;
            if (newOffset < 0)
                newOffset = 0;

            fill(newOffset);

            if (selectedElement)
                selectedElement.style.backgroundColor = "";
            selectedElement = completionElements[index - newOffset];
            selectedElement.style.backgroundColor = "yellow";

            listIndex = index;
            return;
        },

        onEvent: function (event)
        {
            return false;
        }

    };
    //}}}
}; //}}}

liberator.StatusLine = function () //{{{
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

    liberator.options.add(["laststatus", "ls"],
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
            var highlightGroup;

            switch (type)
            {
                case "secure":
                    highlightGroup = "hl-StatusLineSecure";
                    break;
                case "broken":
                    highlightGroup = "hl-StatusLineBroken";
                    break;
                case "insecure":
                    highlightGroup = "hl-StatusLine";
                    break;
            }

            statusBar.setAttribute("class", "chromeclass-status " + highlightGroup);
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

            url = liberator.buffer.URL;

            // make it even more vim-like
            if (url == "about:blank")
            {
                var title = liberator.buffer.title;
                if (!title)
                    url = "[No Name]";
            }
            else
            {
                url = url.replace(new RegExp("^chrome://" + liberator.config.name.toLowerCase() + "/locale/(\\S+)\\.html$"), "$1 [Help]");
            }

            // when session information is available, add [+] when we can go backwards
            if (liberator.config.name == "Vimperator")
            {
                var sh = getWebNavigation().sessionHistory;
                var modified = "";
                if (sh.index > 0)
                    modified += "+";
                if (sh.index < sh.count -1)
                    modified += "-";
                if (liberator.bookmarks.isBookmarked(liberator.buffer.URL))
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
                    progressStr = "[";
                    var done = Math.floor(progress * 20);
                    for (let i = 0; i < done; i++)
                        progressStr += "=";

                    progressStr += ">";

                    for (let i = 19; i > done; i--)
                        progressStr += " ";

                    progressStr += "]";
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

            if (!currentIndex || typeof currentIndex != "number")
                currentIndex = liberator.tabs.index() + 1;
            if (!totalTabs || typeof currentIndex != "number")
                totalTabs = liberator.tabs.count;

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
