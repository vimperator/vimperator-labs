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

    var completionlist = new liberator.InformationList("liberator-completion", { minItems: 2, maxItems: 10 });
    var completions = [];

    // TODO: clean this up when it's not 3am...
    var history = {
        get size() { return liberator.options["history"]; },

        get mode() { return (liberator.modes.extended == liberator.modes.EX) ? "cmd" : "search"; },

        cmd: null,    // ex command history

        search: null, // text search history

        get: function () { return this[this.mode]; },

        set: function (lines) { this[this.mode] = lines; },

        load: function ()
        {
            // TODO: move to storage module
            this.cmd = liberator.options.getPref("extensions.vimperator.commandline_cmd_history", "").split("\n");
            this.search = liberator.options.getPref("extensions.vimperator.commandline_search_history", "").split("\n");
        },

        save: function ()
        {
            liberator.options.setPref("extensions.vimperator.commandline_cmd_history", this.cmd.join("\n"));
            liberator.options.setPref("extensions.vimperator.commandline_search_history", this.search.join("\n"));
        },

        add: function (str)
        {
            if (!str)
                return;

            var lines = this.get();

            // remove all old history lines which have this string
            lines = lines.filter(function (line) {
                    return line != str;
            });

            // add string to the command line history
            if (lines.push(str) > this.size) // remove the first 10% of the history
                lines = lines.slice(this.size / 10);

            this.set(lines);
        }
    };
    history.load();

    var historyIndex = UNINITIALIZED;
    var historyStart = "";

    // for the example command "open sometext| othertext" (| is the cursor pos):
    var completionStartIndex = 0;  // will be 5 because we want to complete arguments for the :open command
    var completionPrefix = "";      // will be: "open sometext"
    var completionPostfix = "";     // will be: " othertext"

    var wildIndex = 0;  // keep track how often we press <Tab> in a row
    var completionIndex = UNINITIALIZED;

    // the containing box for the promptWidget and commandWidget
    var commandlineWidget = document.getElementById("liberator-commandline");
    // the prompt for the current command, for example : or /. Can be blank
    var promptWidget = document.getElementById("liberator-commandline-prompt");
    // the command bar which contains the current command
    var commandWidget = document.getElementById("liberator-commandline-command");

    // the widget used for multiline output
    var multilineOutputWidget = document.getElementById("liberator-multiline-output");
    multilineOutputWidget.contentDocument.body.setAttribute("style", "margin: 0px; font-family: -moz-fixed;"); // get rid of the default border
    multilineOutputWidget.contentDocument.body.innerHTML = "";

    // the widget used for multiline intput
    var multilineInputWidget = document.getElementById("liberator-multiline-input");

    // we need to save the mode which were in before opening the command line
    // this is then used if we focus the command line again without the "official"
    // way of calling "open"
    var currentExtendedMode = null;     // the extended mode which we last openend the command line for
    var currentPrompt = null;
    var currentCommand = null;
    var oldMode = null; // when we leave the command prompt this mode is restored
    var oldExtendedMode = null;

    // save the arguments for the inputMultiline method which are needed in the event handler
    var multilineRegexp = null;
    var multilineCallback = null;

    function setHighlightGroup(group)
    {
        commandlineWidget.setAttribute("class", group);
    }

    // sets the prompt - for example, : or /
    function setPrompt(pmt)
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
        multilineInputWidget.collapsed = true;

        var output = "<div class=\"ex-command-output " + highlightGroup + "\">" + str + "</div>";
        if (!multilineOutputWidget.collapsed)
        {
            // FIXME: need to make sure an open MOW is closed when commands
            //        that don't generate output are executed
            output = multilineOutputWidget.contentDocument.body.innerHTML + output;
            multilineOutputWidget.collapsed = true;
        }

        var id = liberator.config.mainWindowID || "main-window";
        var fontSize = document.defaultView.getComputedStyle(document.getElementById(id), null).getPropertyValue("font-size");
        multilineOutputWidget.contentDocument.body.setAttribute("style", "font-size: " + fontSize);

        multilineOutputWidget.contentDocument.body.innerHTML = output;
        multilineOutputWidget.contentDocument.body.id = "liberator-multiline-output-content";

        var stylesheet = multilineOutputWidget.contentDocument.createElement("link");
        stylesheet.setAttribute("rel", "Stylesheet");
        stylesheet.setAttribute("href", "chrome://" + liberator.config.name.toLowerCase() + "/skin/vimperator.css");
        multilineOutputWidget.contentDocument.getElementsByTagName("head")[0].appendChild(stylesheet);

        var availableHeight = 250;
        try
        {
            availableHeight = getBrowser().mPanelContainer != undefined ?
                getBrowser().mPanelContainer.boxObject.height : getBrowser().boxObject.height;
        }
        catch (e) {}
        var contentHeight = multilineOutputWidget.contentDocument.height;
        var height = contentHeight < availableHeight ? contentHeight : availableHeight;

        multilineOutputWidget.height = height + "px";
        multilineOutputWidget.collapsed = false;

        if (liberator.options["more"] && multilineOutputWidget.contentWindow.scrollMaxY > 0)
        {
            // start the last executed command's output at the top of the screen
            var elements = multilineOutputWidget.contentDocument.getElementsByClassName("ex-command-output");
            elements[elements.length - 1].scrollIntoView(true);

            if (multilineOutputWidget.contentWindow.scrollY >= multilineOutputWidget.contentWindow.scrollMaxY)
                setLine("Press ENTER or type command to continue", liberator.commandline.HL_QUESTION);
            else
                setLine("-- More --", liberator.commandline.HL_QUESTION);
        }
        else
        {
            multilineOutputWidget.contentWindow.scrollTo(0, contentHeight);
            setLine("Press ENTER or type command to continue", liberator.commandline.HL_QUESTION);
        }

        multilineOutputWidget.contentWindow.focus();

        liberator.modes.set(liberator.modes.COMMAND_LINE, liberator.modes.OUTPUT_MULTILINE);
    }

    function autosizeMultilineInputWidget()
    {
        // XXX: faster/better method?

        var lines = 0;
        var str = multilineInputWidget.value;
        for (var i = 0; i < str.length; i++)
        {
            if (str[i] == "\n")
                lines++;
        }
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
            // TODO: move to liberator.eval()?
            // with (liberator) means, liberator is the default namespace "inside" eval
            arg = eval("with(liberator){" + arg + "}");
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

    liberator.options.add(["history", "hi"],
        "Number of Ex commands and search patterns to store in the commandline history",
        "number", 500);

    liberator.options.add(["more"],
        "Pause the message list window when more than one screen of listings is displayed",
        "boolean", true);

    liberator.options.add(["complete", "cpt"],
        "Items which are completed at the :[tab]open prompt",
        "charlist", "sfbh",
        {
            validator: function (value) { return !/[^sfbhS]/.test(value); }
        });

    liberator.options.add(["suggestengines"],
         "Engine Alias which has a feature of suggest",
         "stringlist", "google",
         {
         	validator: function (value)
         	{
         		var ss = Components.classes["@mozilla.org/browser/search-service;1"]
         		           .getService(Components.interfaces.nsIBrowserSearchService);
         		return value.split(",").every(function (item)
         		{
         			var e = ss.getEngineByAlias(item);
         			return (e && e.supportsResponseType("application/x-suggestions+json")) ? true : false;
         		});
         	}
         });

    liberator.options.add(["showmode", "smd"],
        "Show the current mode in the command line",
        "boolean", true);

    liberator.options.add(["wildmode", "wim"],
        "Define how command line completion works",
        "stringlist", "list:full",
        {
            validator: function (value)
            {
                return value.split(",").every(function (item) { return /^(full|longest|list|list:full|list:longest|)$/.test(item); });
            }
        });

    liberator.options.add(["wildoptions", "wop"],
        "Change how command line completion is done",
        "stringlist", "",
        {
            validator: function (value) { return /^(sort|)$/.test(value); }
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// MAPPINGS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var modes = [liberator.modes.COMMAND_LINE];

    liberator.mappings.add(modes,
        ["<Space>"], "Expand command line abbreviation",
        function () { return liberator.editor.expandAbbreviation("c"); },
        { flags: liberator.Mappings.flags.ALLOW_EVENT_ROUTING });

    liberator.mappings.add(modes,
        ["<C-]>", "<C-5>"], "Expand command line abbreviation",
        function () { liberator.editor.expandAbbreviation("c"); });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    liberator.commands.add(["ec[ho]"],
        "Display a string at the bottom of the window",
        function (args)
        {
            var res = echoArgumentToString(args, true);
            if (res != null)
                liberator.echo(res);
        },
        { completer: function (filter) { return liberator.completion.javascript(filter); } });

    liberator.commands.add(["echoe[rr]"],
        "Display an error string at the bottom of the window",
        function (args)
        {
            var res = echoArgumentToString(args, false);
            if (res != null)
                liberator.echoerr(res);
        },
        { completer: function (filter) { return liberator.completion.javascript(filter); } });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        HL_NORMAL  : "hl-Normal",
        HL_ERRORMSG: "hl-ErrorMsg",
        HL_MODEMSG : "hl-ModeMsg",
        HL_MOREMSG : "hl-MoreMsg",
        HL_QUESTION: "hl-Question",
        HL_WARNING : "hl-Warning",

        // not yet used
        FORCE_MULTILINE    : 1 << 0,
        FORCE_SINGLELINE   : 1 << 1,
        DISALLOW_MULTILINE : 1 << 2, // if an echo() should try to use the single line,
                                           // but output nothing when the MOW is open; when also
                                           // FORCE_MULTILINE is given, FORCE_MULTILINE takes precedence
        APPEND_TO_MESSAGES : 1 << 3, // will show the string in :messages

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

            // save the mode, because we need to restore it
            oldMode = liberator.mode;
            oldExtendedMode = liberator.mode.extended;
            liberator.modes.set(liberator.modes.COMMAND_LINE, currentExtendedMode);
            setHighlightGroup(this.HL_NORMAL);
            setPrompt(currentPrompt);
            setCommand(currentCommand);

            commandWidget.focus();
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
            multilineOutputWidget.collapsed = true;
            completionlist.hide();

            setLine("", this.HL_NORMAL);
        },

        // TODO: add :messages entry
        // liberator.echo uses different order of flags as it omits the hightlight group, change v.commandline.echo argument order? --mst
        echo: function (str, highlightGroup, flags)
        {
            // if we are modifing the GUI while we are not in the main thread
            // Firefox will hang up
            var threadManager = Components.classes["@mozilla.org/thread-manager;1"].
                                getService(Components.interfaces.nsIThreadManager);
            if (!threadManager.isMainThread)
                return false;

            var focused = document.commandDispatcher.focusedElement;
            if (focused && focused == commandWidget.inputField || focused == multilineInputWidget.inputField)
                return false;

            highlightGroup = highlightGroup || this.HL_NORMAL;

            var where = setLine;
            if (flags & this.FORCE_MULTILINE)
                where = setMultiline;
            else if (flags & this.FORCE_SINGLELINE)
                where = setLine;
            else if (!multilineOutputWidget.collapsed)
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
        input: function (str)
        {
            // TODO: unfinished, need to find out how/if we can block the execution of code
            // to make this code synchronous or at least use a callback
            setLine(str, this.HL_QUESTION);
            commandWidget.focus();
            return "not implemented";
        },

        // reads a multi line input and returns the string once the last line matches
        // @param untilRegexp
        inputMultiline: function (untilRegexp, callbackFunc)
        {
            // save the mode, because we need to restore it
            oldMode = liberator.mode;
            oldExtendedMode = liberator.mode.extended;
            liberator.modes.set(liberator.modes.COMMAND_LINE, liberator.modes.INPUT_MULTILINE);

            // save the arguments, they are needed in the event handler onEvent
            multilineRegexp = untilRegexp;
            multilineCallback = callbackFunc;

            multilineInputWidget.collapsed = false;
            multilineInputWidget.value = "";
            autosizeMultilineInputWidget();

            setTimeout(function () {
                multilineInputWidget.focus();
            }, 10);
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
                if (liberator.events.isAcceptKey(key))
                {
                    var mode = currentExtendedMode; // save it here, as setMode() resets it
                    history.add(command);
                    liberator.modes.reset(true); //FIXME: use mode stack
                    completionlist.hide();
                    liberator.focusContent(false);
                    liberator.statusline.updateProgress(""); // we may have a "match x of y" visible
                    return liberator.triggerCallback("submit", mode, command);
                }

                // user pressed UP or DOWN arrow to cycle history completion
                else if (key == "<Up>" || key == "<Down>")
                {
                    var lines = history.get();

                    event.preventDefault();
                    event.stopPropagation();

                    // always reset the tab completion if we use up/down keys
                    completionIndex = UNINITIALIZED;

                    // save 'start' position for iterating through the history
                    if (historyIndex == UNINITIALIZED)
                    {
                        historyIndex = lines.length;
                        historyStart = command;
                    }

                    // search the history for the first item matching the current
                    // commandline string
                    while (historyIndex >= -1 && historyIndex <= lines.length)
                    {
                        key == "<Up>" ? historyIndex-- : historyIndex++;

                        // user pressed DOWN when there is no newer history item
                        if (historyIndex == lines.length)
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
                        else if (historyIndex >= lines.length + 1)
                        {
                            historyIndex = lines.length;
                            liberator.beep();
                            break;
                        }

                        if (lines[historyIndex].indexOf(historyStart) == 0)
                        {
                            setCommand(lines[historyIndex]);
                            liberator.triggerCallback("change", currentExtendedMode, this.getCommand());
                            break;
                        }
                    }
                }

                // user pressed TAB to get completions of a command
                else if (key == "<Tab>" || key == "<S-Tab>")
                {
                    //always reset our completion history so up/down keys will start with new values
                    historyIndex = UNINITIALIZED;

                    // we need to build our completion list first
                    if (completionIndex == UNINITIALIZED)
                    {
                        completionStartIndex = 0;
                        completionIndex = -1;
                        wildIndex = 0;

                        completionPrefix = command.substring(0, commandWidget.selectionStart);
                        completionPostfix = command.substring(commandWidget.selectionStart);
                        var res = liberator.triggerCallback("complete", currentExtendedMode, completionPrefix);
                        if (res)
                            [completionStartIndex, completions] = res;

                        // sort the completion list
                        if (/\bsort\b/.test(liberator.options["wildoptions"]))
                        {
                            completions.sort(function (a, b) {
                                    if (a[0] < b[0])
                                        return -1;
                                    else if (a[0] > b[0])
                                        return 1;
                                    else
                                        return 0;
                            });
                        }
                    }

                    if (completions.length == 0)
                    {
                        liberator.beep();
                        // prevent tab from moving to the next field:
                        return false;
                    }

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

                    // show the list
                    if (hasList)
                    {
                        if (completionIndex < 0)
                            completionlist.show(completions);
                        else
                            completionlist.show();
                    }

                    if (full)
                    {
                        if (event.shiftKey)
                        {
                            completionIndex--;
                            if (completionIndex < -1)
                                completionIndex = completions.length -1;
                        }
                        else
                        {
                            completionIndex++;
                            if (completionIndex >= completions.length)
                                completionIndex = -1;
                        }

                        liberator.statusline.updateProgress("match " + (completionIndex + 1) + " of " + completions.length);
                        // if the list is hidden, this function does nothing
                        completionlist.selectItem(completionIndex);
                    }

                    if (completionIndex == -1 && !longest) // wrapped around matches, reset command line
                    {
                        if (full && completions.length > 1)
                        {
                            setCommand(completionPrefix + completionPostfix);
                        }
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
                            if (completions.length == 1 && !full)
                                completionIndex = UNINITIALIZED;
                        }
                    }

                    // prevent tab from moving to the next field
                    event.preventDefault();
                    event.stopPropagation();
                }
                else if (key == "<BS>")
                {
                    // reset the tab completion
                    completionIndex = historyIndex = UNINITIALIZED;

                    // and blur the command line if there is no text left
                    if (command.length == 0)
                    {
                        liberator.triggerCallback("cancel", currentExtendedMode);
                        liberator.modes.reset(); // FIXME: use mode stack
                    }
                }
                else // any other key
                {
                    // reset the tab completion
                    completionIndex = historyIndex = UNINITIALIZED;
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
                        liberator.modes.set(oldMode, oldExtendedMode);
                        multilineInputWidget.collapsed = true;
                        multilineCallback.call(this, text);
                    }
                }
                else if (liberator.events.isCancelKey(key))
                {
                    liberator.modes.set(oldMode, oldExtendedMode);
                    multilineInputWidget.collapsed = true;
                }
            }
            else if (event.type == "blur")
            {
                if (liberator.modes.extended & liberator.modes.INPUT_MULTILINE)
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

            function isScrollable() { return !win.scrollMaxY == 0; }

            function atEnd() { return win.scrollY / win.scrollMaxY >= 1; }

            var key = liberator.events.toString(event);

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

                // XXX: what's that for? --mst
                case "<S-LeftMouse>":
                    if (/^(end|more(-help)?)-prompt$/.test(event.target.id))
                        ; // fall through
                    else
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
                liberator.modes.reset();
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

        // it would be better if we had a destructor in javascript ...
        destroy: function ()
        {
            history.save();
        }

    };
    //}}}
}; //}}}

/**
 * The list which is used for the completion box, the preview window and the buffer preview window
 *
 * @param id: the id of the the XUL widget which we want to fill
 * @param options: an optional hash which modifies the behavior of the list
 */
liberator.InformationList = function (id, options) //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const CONTEXT_LINES = 3;
    var maxItems = 10;
    var minItems = 1;
    var incrementalFill = true; // make display faster, but does not show scrollbar

    if (options)
    {
        if (options.maxItems) maxItems = options.maxItems;
        if (options.minItems) minItems = options.minItems;
        if (options.incrementalFill) incrementalFill = options.incrementalFill;
    }

    var widget = document.getElementById(id);
    var completions = null; // a reference to the Array of completions
    var listOffset = 0; // how many items is the displayed list shifted from the internal tab index
    var listIndex = 0;  // listOffset + listIndex = completions[item]

    // add a single completion item to the list
    function addItem(completionItem, atBeginning)
    {
        var item  = document.createElement("listitem");
        var cell1 = document.createElement("listcell");
        var cell2 = document.createElement("listcell");

        cell1.setAttribute("label", completionItem[0]);
        cell2.setAttribute("label", completionItem[1]);
        cell2.setAttribute("style", "color:green; font-family: sans");

        item.appendChild(cell1);
        item.appendChild(cell2);
        if (atBeginning == true)
        {
            var items = widget.getElementsByTagName("listitem");
            if (items.length > 0)
                widget.insertBefore(item, items[0]);
            else
                widget.appendChild(item);
        }
        else
            widget.appendChild(item);
    }

    /**
     * uses the entries in completions to fill the listbox
     *
     * @param startindex: start at this index and show maxItems
     * @returns the number of items
     */
    function fill(startindex)
    {
        var complength = completions.length;

        // remove all old items first
        var items = widget.getElementsByTagName("listitem");
        while (items.length > 0)
        {
            widget.removeChild(items[0]);
        }

        if (!incrementalFill)
        {
            for (i in completions)
                addItem(completions[i], false);
            return complength;
        }

        // find start index
        if (startindex + maxItems > complength)
            startindex = complength - maxItems;
        if (startindex < 0)
            startindex = 0;

        listOffset = startindex;
        listIndex = -1;

        for (var i = startindex; i < complength && i < startindex + maxItems; i++)
        {
            addItem(completions[i], false);
        }

        return (i-startindex);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    return {

        /**
         * Show the completion list window
         *
         * @param compl: if null, only show the list with current entries, otherwise
         *          use entries of 'compl' to fill the list.
         *          Required format: [["left", "right"], ["another"], ["completion"]]
         */
        show: function (compl)
        {
            //maxItems = liberator.options["previewheight"];

            if (compl)
            {
                completions = compl;
                fill(0);
            }

            var length = completions.length;
            if (length > maxItems)
                length = maxItems;
            if (length >= minItems)
            {
                widget.setAttribute("rows", length.toString());
                widget.hidden = false;
                return true;
            }
            else
            {
                widget.hidden = true;
                return false;
            }
        },

        hide: function ()
        {
            widget.hidden = true;
        },

        visible: function ()
        {
            return !widget.hidden;
        },

        /**
         * select index, refill list if necessary
         */
        selectItem: function (index)
        {
            if (widget.hidden)
                return;

            if (!incrementalFill)
            {
                widget.selectedIndex = index;
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

            // for speed reason: just remove old item, and add the new one at the end of the list
            var items = widget.getElementsByTagName("listitem");
            if (newOffset == listOffset + 1)
            {
                widget.removeChild(items[0]);
                addItem(completions[index + CONTEXT_LINES], false);
            }
            else if (newOffset == listOffset - 1)
            {
                widget.removeChild(items[items.length-1]);
                addItem(completions[index - CONTEXT_LINES], true);
            }
            else if (newOffset == listOffset)
            {
                // do nothing
            }
            else
                fill(newOffset);

            listOffset = newOffset;
            widget.selectedIndex = index - listOffset;
        },

        onEvent: function (event)
        {
            var listcells = document.getElementsByTagName("listcell");
            // 2 columns for now, use the first column
            var index = (widget.selectedIndex * 2) + 0;
            var val = listcells[index].getAttribute("label");
            if (val && event.button == 0 && event.type == "dblclick") // left double click
                liberator.open(val);
            else if (val && event.button == 1) // middle click
                liberator.open(val, liberator.NEW_TAB);
            else
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
            },
            validator: function (value) { return (value >= 0 && value <= 2); }
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
                var matches = url.match(/^chrome:\/\/vimperator\/locale\/(\S+)$/);
                if (matches && matches[1])
                    url = matches[1] + " [Help]";
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
                if (liberator.bookmarks.isBookmarked(url))
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
                progressWidget.value = progress;
            else if (typeof progress == "number")
            {
                var progressStr = "";
                if (progress <= 0)
                    progressStr = "[ Loading...         ]";
                else if (progress < 1)
                {
                    progressStr = "[";
                    var done = Math.floor(progress * 20);
                    for (var i = 0; i < done; i++)
                        progressStr += "=";

                    progressStr += ">";

                    for (var i = 19; i > done; i--)
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
