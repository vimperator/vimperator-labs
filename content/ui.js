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

(c) 2006-2007: Martin Stubenschrott <stubenschrott@gmx.net>

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

    var completionlist = new InformationList("vimperator-completion", { min_items: 2, max_items: 10 });
    var completions = [];

    // TODO: clean this up when it's not 3am...
    var history = {
        SIZE: 500,

        get _mode() { return (vimperator.modes.extended == vimperator.modes.EX) ? "cmd" : "search"; },

        cmd: null,    // ex command history
        search: null, // text search history

        get: function() { return this[this._mode]; },
        set: function(lines) { this[this._mode] = lines; },

        load: function()
        {
            this.cmd = Options.getPref("commandline_cmd_history", "").split("\n");
            this.search = Options.getPref("commandline_search_history", "").split("\n");
        },

        save: function()
        {
            Options.setPref("commandline_cmd_history", this.cmd.join("\n"));
            Options.setPref("commandline_search_history", this.search.join("\n"));
        },

        add: function(str)
        {
            if (!str)
                return;

            var lines = this.get();

            // remove all old history lines which have this string
            lines = lines.filter(function(line) {
                    return line != str;
            });

            // add string to the command line history
            if (lines.push(str) > this.SIZE) // remove the first 10% of the history
                lines = lines.slice(this.SIZE / 10);

            this.set(lines);
        }
    };
    history.load();

    var history_index = UNINITIALIZED;
    var history_start = "";

    // for the example command "open sometext| othertext" (| is the cursor pos):
    var completion_start_index = 0;  // will be 5 because we want to complete arguments for the :open command
    var completion_prefix = ""       // will be: "open sometext"
    var completion_postfix = "";     // will be: " othertext"

    var wild_index = 0;  // keep track how often we press <Tab> in a row
    var completion_index = UNINITIALIZED;

    // the containing box for the prompt_widget and command_widget
    var commandline_widget = document.getElementById('vimperator-commandline');
    // the prompt for the current command, for example : or /. Can be blank
    var prompt_widget = document.getElementById('vimperator-commandline-prompt');
    // the command bar which contains the current command
    var command_widget = document.getElementById('vimperator-commandline-command');

    // the widget used for multiline output
    var multiline_output_widget = document.getElementById("vimperator-multiline-output");
    multiline_output_widget.contentDocument.body.setAttribute("style", "margin: 0px; font-family: -moz-fixed;"); // get rid of the default border
    multiline_output_widget.contentDocument.body.innerHTML = "";

    // the widget used for multiline intput
    var multiline_input_widget = document.getElementById("vimperator-multiline-input");

    // we need to save the mode which were in before opening the command line
    // this is then used if we focus the command line again without the "official"
    // way of calling "open"
    var cur_extended_mode = null;     // the extended mode which we last openend the command line for
    var cur_prompt = null;
    var cur_command = null;
    var old_mode = null; // when we leave the command prompt this mode is restored
    var old_extended_mode = null;

    // save the arguments for the inputMultiline method which are needed in the event handler
    var multiline_regexp = null;
    var multiline_callback = null;

    function setHighlightGroup(group)
    {
        commandline_widget.setAttribute("class", group);
    }

    // sets the prompt - for example, : or /
    function setPrompt(prompt)
    {
        if (typeof prompt != "string")
            prompt = "";

        prompt_widget.value = prompt;
        if (prompt)
        {
            // initially (in the xul) the prompt is 'collapsed', this makes
            // sure it's visible, then we toggle the display which works better
            prompt_widget.style.visibility = 'visible';
            prompt_widget.style.display = 'inline';
            prompt_widget.size = prompt.length;
        }
        else
        {
            prompt_widget.style.display = 'none';
        }
    }

    // sets the command - e.g. 'tabopen', 'open http://example.com/'
    function setCommand(cmd)
    {
        command_widget.hidden = false;
        command_widget.value = cmd;
    }

    // TODO: extract CSS
    //     : resize upon a window resize
    //     : echoed lines longer than v-c-c.width should wrap and use MOW
    function setMultiline(str)
    {
        multiline_input_widget.collapsed = true;

        var output = "<div class=\"ex-command-output\">" + str + "</div>";
        if (!multiline_output_widget.collapsed)
        {
            // FIXME: need to make sure an open MOW is closed when commands
            //        that don't generate output are executed
            output = multiline_output_widget.contentDocument.body.innerHTML + output;
            multiline_output_widget.collapsed = true;
        }

        var font_size = document.defaultView.getComputedStyle(document.getElementById("main-window"), null).getPropertyValue("font-size");
        multiline_output_widget.contentDocument.body.setAttribute("style", "font-size: " + font_size);

        multiline_output_widget.contentDocument.body.innerHTML = output;
        multiline_output_widget.contentDocument.body.id = "vimperator-multiline-output-content";

        var stylesheet = multiline_output_widget.contentDocument.createElement("link");
        stylesheet.setAttribute("rel", "Stylesheet");
        stylesheet.setAttribute("href", "chrome://vimperator/skin/vimperator.css");
        multiline_output_widget.contentDocument.getElementsByTagName("head")[0].appendChild(stylesheet);

        var available_height = getBrowser().mPanelContainer.boxObject.height;
        var content_height = multiline_output_widget.contentDocument.height;
        var height = content_height < available_height ? content_height : available_height;

        multiline_output_widget.height = height + "px";
        multiline_output_widget.collapsed = false;

        if (vimperator.options["more"] && multiline_output_widget.contentWindow.scrollMaxY > 0)
        {
            // start the last executed command's output at the top of the screen
            var elements = multiline_output_widget.contentDocument.getElementsByClassName("ex-command-output");
            elements[elements.length - 1].scrollIntoView(true);

            if (multiline_output_widget.contentWindow.scrollY >= multiline_output_widget.contentWindow.scrollMaxY)
                vimperator.commandline.echo("Press ENTER or type command to continue", vimperator.commandline.HL_QUESTION);
            else
                vimperator.commandline.echo("-- More --", vimperator.commandline.HL_MOREMSG);
        }
        else
        {
            multiline_output_widget.contentWindow.scrollTo(0, content_height);
            vimperator.commandline.echo("Press ENTER or type command to continue", vimperator.commandline.HL_QUESTION);
        }

        multiline_output_widget.contentWindow.focus();

        vimperator.modes.set(vimperator.modes.COMMAND_LINE, vimperator.modes.OUTPUT_MULTILINE);
    }

    function autosizeMultilineInputWidget()
    {
        // XXX: faster/better method?

        var lines = 0;
        var str = multiline_input_widget.value;
        for (var i = 0; i < str.length; i++)
        {
            if (str[i] == "\n")
                lines++;
        }
        if (lines == 0)
            lines = 1;
        multiline_input_widget.setAttribute("rows", lines.toString());
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.HL_NORMAL   = "hl-Normal";
    this.HL_ERRORMSG = "hl-ErrorMsg";
    this.HL_MODEMSG  = "hl-ModeMsg";
    this.HL_MOREMSG  = "hl-MoreMsg";
    this.HL_QUESTION = "hl-Question";
    this.HL_WARNING  = "hl-Warning";

    // not yet used
    this.FORCE_MULTILINE  =  1 << 0;
    this.FORCE_SINGLELINE  = 1 << 1;
    this.FORCE_ECHO  =       1 << 2; // also echoes if the commandline has focus

    this.getCommand = function()
    {
        return command_widget.value;
    };

    this.open = function(prompt, cmd, ext_mode)
    {
        // save the current prompts, we need it later if the command widget
        // receives focus without calling the this.open() method
        cur_prompt = prompt || "";
        cur_command = cmd || "";
        cur_extended_mode = ext_mode || null;

        setHighlightGroup(this.HL_NORMAL);
        history_index = UNINITIALIZED;
        completion_index = UNINITIALIZED;

        // save the mode, because we need to restore it
        old_mode = vimperator.mode;
        old_extended_mode = vimperator.mode.extended;
        vimperator.modes.set(vimperator.modes.COMMAND_LINE, cur_extended_mode);
        setPrompt(cur_prompt);
        setCommand(cur_command);

        command_widget.focus();
    };

    // normally used when pressing esc, does not execute a command
    this.close = function()
    {
        var res = vimperator.triggerCallback("cancel", cur_extended_mode);
        history.add(this.getCommand());
        //vimperator.modes.set(old_mode, old_extended_mode);
        vimperator.statusline.updateProgress(""); // we may have a "match x of y" visible
        this.clear();
    }

    // FIXME: flags not yet really functional --mst
    // multiline string don't obey highlight_group
    this.echo = function(str, highlight_group, flags)
    {
        var focused = document.commandDispatcher.focusedElement;
        if (focused && focused == command_widget.inputField || focused == multiline_input_widget.inputField)
            return false;

        if (typeof str != "string")
            str = "";

        highlight_group = highlight_group || this.HL_NORMAL;
        setHighlightGroup(highlight_group);
        if (flags /*|| !multiline_output_widget.collapsed*/ || /\n|<br\/?>/.test(str))
        {
            setMultiline(str);
        }
        else
        {
            if (!str)
                str = "";

            setPrompt(str);
            command_widget.hidden = true;

            // initially (in the xul) the prompt is 'collapsed', this makes
            // sure it's visible, then we toggle the display which works better
            prompt_widget.style.visibility = 'visible';
            prompt_widget.style.display = 'inline';
            prompt_widget.size = str.length;
        }
        cur_extended_mode = null;
        return true;
    };

    // this will prompt the user for a string
    // vimperator.commandline.input("(s)ave or (o)pen the file?")
    this.input = function(str)
    {
        // TODO: unfinished, need to find out how/if we can block the execution of code
        // to make this code synchronous or at least use a callback
        setHighlightGroup(this.HL_QUESTION);
        setPrompt(str);
        setCommand("");
        command_widget.focus();
        return "not implemented";
    };

    // reads a multi line input and returns the string once the last line matches
    // @param until_regexp
    this.inputMultiline = function(until_regexp, callback_func)
    {
        // save the mode, because we need to restore it
        old_mode = vimperator.mode;
        old_extended_mode = vimperator.mode.extended;
        vimperator.modes.set(vimperator.modes.COMMAND_LINE, vimperator.modes.INPUT_MULTILINE);

        // save the arguments, they are needed in the event handler onEvent
        multiline_regexp = until_regexp;
        multiline_callback = callback_func;

        multiline_input_widget.collapsed = false;
        multiline_input_widget.value = "";
        autosizeMultilineInputWidget();

        setTimeout(function() {
            multiline_input_widget.focus();
        }, 10);
    };

    this.clear = function()
    {
        multiline_input_widget.collapsed = true;
        multiline_output_widget.collapsed = true;
        completionlist.hide();

        this.echo("");
    };

    this.onEvent = function(event)
    {
        var command = this.getCommand();

        if (event.type == "blur")
        {
            // prevent losing focus, there should be a better way, but it just didn't work otherwise
            setTimeout(function() {
                if (vimperator.mode == vimperator.modes.COMMAND_LINE &&
                    !(vimperator.modes.extended & vimperator.modes.INPUT_MULTILINE) &&
                    !(vimperator.modes.extended & vimperator.modes.OUTPUT_MULTILINE))
                            command_widget.inputField.focus();
            }, 0);
        }
        else if (event.type == "focus")
        {
            if (!cur_extended_mode && event.target == command_widget.inputField)
                event.target.blur();
        }
        else if (event.type == "input")
        {
            vimperator.triggerCallback("change", cur_extended_mode, command);
        }
        else if (event.type == "keypress")
        {
            if (!cur_extended_mode)
                return;

            var key = vimperator.events.toString(event);

            // user pressed ENTER to carry out a command
            // user pressing ESCAPE is handled in the global onEscape
            if (vimperator.events.isAcceptKey(key))
            {
                var mode = cur_extended_mode; // save it here, as setMode() resets it
                history.add(command);
                vimperator.modes.reset(true); //FIXME: use mode stack
                completionlist.hide();
                vimperator.statusline.updateProgress(""); // we may have a "match x of y" visible
                return vimperator.triggerCallback("submit", mode, command);
            }


            // user pressed UP or DOWN arrow to cycle history completion
            else if (key == "<Up>" || key == "<Down>")
            {
                var lines = history.get();

                event.preventDefault();
                event.stopPropagation();

                // always reset the tab completion if we use up/down keys
                completion_index = UNINITIALIZED;

                // save 'start' position for iterating through the history
                if (history_index == UNINITIALIZED)
                {
                    history_index = lines.length;
                    history_start = command;
                }

                // search the history for the first item matching the current
                // commandline string
                while (history_index >= -1 && history_index <= lines.length)
                {
                    key == "<Up>" ? history_index-- : history_index++;

                    // user pressed DOWN when there is no newer history item
                    if (history_index == lines.length)
                    {
                        setCommand(history_start);
                        vimperator.triggerCallback("change", cur_extended_mode, this.getCommand());
                        return;
                    }

                    // cannot go past history start/end
                    if (history_index <= -1)
                    {
                        history_index = 0;
                        vimperator.beep();
                        break;
                    }
                    if (history_index >= lines.length + 1)
                    {
                        history_index = lines.length;
                        vimperator.beep();
                        break;
                    }

                    if (lines[history_index].indexOf(history_start) == 0)
                    {
                        setCommand(lines[history_index]);
                        vimperator.triggerCallback("change", cur_extended_mode, this.getCommand());
                        return;
                    }
                }
            }

            // user pressed TAB to get completions of a command
            else if (key == "<Tab>" || key == "<S-Tab>")
            {
                //always reset our completion history so up/down keys will start with new values
                history_index = UNINITIALIZED;

                // we need to build our completion list first
                if (completion_index == UNINITIALIZED)
                {
                    completion_start_index = 0;

                    completion_index = -1;
                    wild_index = 0;

                    completion_prefix = command.substring(0, command_widget.selectionStart);
                    completion_postfix = command.substring(command_widget.selectionStart);
                    var res = vimperator.triggerCallback("complete", cur_extended_mode, completion_prefix);
                    if (res)
                        [completion_start_index, completions] = res;

                    // sort the completion list
                    if (vimperator.options["wildoptions"].search(/\bsort\b/) > -1)
                    {
                        completions.sort(function(a, b) {
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
                    vimperator.beep();
                    // prevent tab from moving to the next field
                    event.preventDefault();
                    event.stopPropagation();
                    return;
                }

                var wim = vimperator.options["wildmode"].split(/,/);
                var has_list = false;
                var longest = false;
                var full = false;
                var wildtype = wim[wild_index++] || wim[wim.length - 1];
                if (wildtype == 'list' || wildtype == 'list:full' || wildtype == 'list:longest')
                    has_list = true;
                if (wildtype == 'longest' || wildtype == 'list:longest')
                    longest = true;
                else if (wildtype == 'full' || wildtype == 'list:full')
                    full = true;

                // show the list
                if (has_list)
                {
                    if (completion_index < 0)
                        completionlist.show(completions);
                    else
                        completionlist.show();
                }

                if (full)
                {
                    if (event.shiftKey)
                    {
                        completion_index--;
                        if (completion_index < -1)
                            completion_index = completions.length -1;
                    }
                    else
                    {
                        completion_index++;
                        if (completion_index >= completions.length)
                            completion_index = -1;
                    }

                    vimperator.statusline.updateProgress("match " + (completion_index + 1) + " of " + completions.length);
                    // if the list is hidden, this function does nothing
                    completionlist.selectItem(completion_index);
                }


                if (completion_index == -1 && !longest) // wrapped around matches, reset command line
                {
                    if (full && completions.length > 1)
                    {
                        setCommand(completion_prefix + completion_postfix);
                    }
                }
                else
                {
                    if (longest && completions.length > 1)
                        var compl = vimperator.completion.get_longest_substring();
                    else if (full)
                        var compl = completions[completion_index][0];
                    else if (completions.length == 1)
                        var compl = completions[0][0];
                    if (compl)
                    {
                        setCommand(command.substring(0, completion_start_index) + compl + completion_postfix);
                        command_widget.selectionStart = command_widget.selectionEnd = completion_start_index + compl.length;

                        // Start a new completion in the next iteration. Useful for commands like :source
                        // RFC: perhaps the command can indicate whether the completion should be restarted
                        // Needed for :source to grab another set of completions after a file/directory has been filled out
                        if (completions.length == 1 && !full)
                            completion_index = UNINITIALIZED;
                    }
                }

                // prevent tab from moving to the next field
                event.preventDefault();
                event.stopPropagation();
            }
            else if (key == "<BS>")
            {
                // reset the tab completion
                completion_index = history_index = UNINITIALIZED;

                // and blur the command line if there is no text left
                if (command.length == 0)
                {
                    vimperator.triggerCallback("cancel", cur_extended_mode);
                    vimperator.modes.reset(); // FIXME: use mode stack
                }
            }
            else // any other key
            {
                // reset the tab completion
                completion_index = history_index = UNINITIALIZED;
            }
        }
    }

    this.onMultilineInputEvent = function(event)
    {
        if (event.type == "keypress")
        {
            var key = vimperator.events.toString(event);
            if (vimperator.events.isAcceptKey(key))
            {
                var text = multiline_input_widget.value.substr(0, multiline_input_widget.selectionStart);
                if (text.match(multiline_regexp))
                {
                    text = text.replace(multiline_regexp, "");
                    vimperator.modes.set(old_mode, old_extended_mode);
                    multiline_input_widget.collapsed = true;
                    multiline_callback.call(this, text);
                }
            }
            else if (vimperator.events.isCancelKey(key))
            {
                vimperator.modes.set(old_mode, old_extended_mode);
                multiline_input_widget.collapsed = true;
            }
        }
        else if (event.type == "blur")
        {
            if (vimperator.modes.extended & vimperator.modes.INPUT_MULTILINE)
                setTimeout(function() { multiline_input_widget.inputField.focus(); }, 0);
        }
        else if (event.type == "input")
        {
            autosizeMultilineInputWidget();
        }
    }

    // FIXME: if 'more' is set and the MOW is not scrollable we should still
    // allow a down motion after an up rather than closing
    this.onMultilineOutputEvent = function(event)
    {
        var win = multiline_output_widget.contentWindow;

        var show_more_help_prompt = false;
        var show_more_prompt = false;
        var close_window = false;
        var pass_event = false;

        function isScrollable() { return !win.scrollMaxY == 0; }

        function atEnd() { return win.scrollY / win.scrollMaxY >= 1; }

        var key = vimperator.events.toString(event);

        switch (key)
        {
            case ":":
                vimperator.commandline.open(":", "", vimperator.modes.EX);
                return;

            // down a line
            case "j":
            case "<Down>":
                if (vimperator.options["more"] && isScrollable())
                    win.scrollByLines(1);
                else
                    pass_event = true;
                break;

            case "<C-j>":
            case "<C-m>":
            case "<Return>":
                if (vimperator.options["more"] && isScrollable() && !atEnd())
                    win.scrollByLines(1);
                else
                    close_window = true;; // don't propagate the event for accept keys
                break;

            // up a line
            case "k":
            case "<Up>":
            case "<BS>":
                if (vimperator.options["more"] && isScrollable())
                    win.scrollByLines(-1);
                else if (vimperator.options["more"] && !isScrollable())
                    show_more_prompt = true;
                else
                    pass_event = true;
                break;

            // half page down
            case "d":
                if (vimperator.options["more"] && isScrollable())
                    win.scrollBy(0, win.innerHeight / 2);
                else
                    pass_event = true;
                break;

            case "<LeftMouse>":
            case "<A-LeftMouse>":
            case "<C-LeftMouse>":
            case "<S-LeftMouse>":
                if (/^(end|more(-help)?)-prompt$/.test(event.target.id))
                    ; // fall through
                else
                    break;

            // page down
            case "f":
                if (vimperator.options["more"] && isScrollable())
                    win.scrollByPages(1);
                else
                    pass_event = true;
                break;

            case "<Space>":
            case "<PageDown>":
                if (vimperator.options["more"] && isScrollable() && !atEnd())
                    win.scrollByPages(1);
                else
                    pass_event = true;
                break;

            // half page up
            case "u":
                // if (more and scrollable)
                if (vimperator.options["more"] && isScrollable())
                    win.scrollBy(0, -(win.innerHeight / 2));
                else
                    pass_event = true;
                break;

            // page up
            case "b":
                if (vimperator.options["more"] && isScrollable())
                    win.scrollByPages(-1);
                else if (vimperator.options["more"] && !isScrollable())
                    show_more_prompt = true;
                else
                    pass_event = true;
                break;

            case "<PageUp>":
                if (vimperator.options["more"] && isScrollable())
                    win.scrollByPages(-1);
                else
                    pass_event = true;
                break;

            // top of page
            case "g":
                if (vimperator.options["more"] && isScrollable())
                    win.scrollTo(0, 0);
                else if (vimperator.options["more"] && !isScrollable())
                    show_more_prompt = true;
                else
                    pass_event = true;
                break;

            // bottom of page
            case "G":
                if (vimperator.options["more"] && isScrollable() && !atEnd())
                    win.scrollTo(0, win.scrollMaxY);
                else
                    pass_event = true;
                break;

            // copy text to clipboard
            case "<C-y>":
                vimperator.copyToClipboard(win.getSelection());
                break;

            // close the window
            case "q":
                close_window = true;;
                break;

            // unmapped key
            default:
                if (!vimperator.options["more"] || !isScrollable() || atEnd() || vimperator.events.isCancelKey(key))
                    pass_event = true;
                else
                    show_more_help_prompt = true;
        }

        if (pass_event || close_window)
        {
            // FIXME: use mode stack
            vimperator.modes.reset();
            this.clear();

            if (pass_event)
                vimperator.events.onKeyPress(event);
        }
        else // set update the prompt string
        {
            if (show_more_help_prompt)
                this.echo("-- More -- SPACE/d/j: screen/page/line down, b/u/k: up, q: quit", this.HL_MOREMSG);
            else if (show_more_prompt || (vimperator.options["more"] && isScrollable() && !atEnd()))
                this.echo("-- More --", this.HL_MOREMSG);
            else
                this.echo("Press ENTER or type command to continue", this.HL_QUESTION);
        }
    }

    // it would be better if we had a destructor in javascript ...
    this.destroy = function()
    {
        history.save();
    }
    //}}}
} //}}}

/**
 * The list which is used for the completion box, the preview window and the buffer preview window
 *
 * @param id: the id of the the XUL widget which we want to fill
 * @param options: an optional hash which modifies the behavior of the list
 */
function InformationList(id, options) //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const CONTEXT_LINES = 3;
    var max_items = 10;
    var min_items = 1;
    var incremental_fill = true; // make display faster, but does not show scrollbar

    if (options)
    {
        if (options.max_items) max_items = options.max_items;
        if (options.min_items) min_items = options.min_items;
        if (options.incremental_fill) incremental_fill = options.incremental_fill;
    }

    var widget = document.getElementById(id);
    var completions = null; // a reference to the Array of completions
    var list_offset = 0; // how many items is the displayed list shifted from the internal tab index
    var list_index = 0;  // list_offset + list_index = completions[item]

    // add a single completion item to the list
    function addItem(completion_item, at_beginning)
    {
        var item  = document.createElement("listitem");
        var cell1 = document.createElement("listcell");
        var cell2 = document.createElement("listcell");

        cell1.setAttribute("label", completion_item[0]);
        cell2.setAttribute("label", completion_item[1]);
        cell2.setAttribute("style", "color:green; font-family: sans");

        item.appendChild(cell1);
        item.appendChild(cell2);
        if (at_beginning == true)
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
     * @param startindex: start at this index and show max_items
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

        if (!incremental_fill)
        {
            for (i in completions)
                addItem(completions[i], false);
            return complength;
        }

        // find start index
        if (startindex + max_items > complength)
            startindex = complength - max_items;
        if (startindex < 0)
            startindex = 0;

        list_offset = startindex;
        list_index = -1;

        for (var i = startindex; i < complength && i < startindex + max_items; i++)
        {
            addItem(completions[i], false);
        }

        return (i-startindex);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    /**
     * Show the completion list window
     *
     * @param compl: if null, only show the list with current entries, otherwise
     *          use entries of 'compl' to fill the list.
     *          Required format: [["left", "right"], ["another"], ["completion"]]
     */
    this.show = function(compl)
    {
        //max_items = vimperator.options["previewheight"];

        if (compl)
        {
            completions = compl;
            fill(0);
        }

        var length = completions.length;
        if (length > max_items)
            length = max_items;
        if (length >= min_items)
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
    }

    this.hide = function()
    {
        widget.hidden = true;
    }

    this.visible = function()
    {
        return !widget.hidden;
    }

    /**
     * select index, refill list if necessary
     */
    this.selectItem = function(index)
    {
        if (widget.hidden)
            return;

        if (!incremental_fill)
        {
            widget.selectedIndex = index;
            return;
        }

        // find start index
        var new_offset = 0;
        if (index >= list_offset + max_items - CONTEXT_LINES)
            new_offset = index - max_items + CONTEXT_LINES + 1;
        else if (index <= list_offset + CONTEXT_LINES)
            new_offset = index - CONTEXT_LINES;
        else
            new_offset = list_offset;

        if (new_offset + max_items > completions.length)
            new_offset = completions.length - max_items;
        if (new_offset < 0)
            new_offset = 0;

        // for speed reason: just remove old item, and add the new one at the end of the list
        var items = widget.getElementsByTagName("listitem");
        if (new_offset == list_offset + 1)
        {
            widget.removeChild(items[0]);
            addItem(completions[index + CONTEXT_LINES], false);
        }
        else if (new_offset == list_offset - 1)
        {
            widget.removeChild(items[items.length-1]);
            addItem(completions[index - CONTEXT_LINES], true);
        }
        else if (new_offset == list_offset)
        {
            // do nothing
        }
        else
            fill(new_offset);

        list_offset = new_offset;
        widget.selectedIndex = index - list_offset;
    }

    this.onEvent = function(event)
    {
        var listcells = document.getElementsByTagName("listcell");
        // 2 columns for now, use the first column
        var index = (widget.selectedIndex * 2) + 0;
        var val = listcells[index].getAttribute("label");
        if (val && event.button == 0 && event.type == "dblclick") // left double click
            vimperator.open(val);
        else if (val && event.button == 1) // middle click
            vimperator.open(val, vimperator.NEW_TAB);
        else
            return false;
    }
    //}}}
} //}}}

function StatusLine() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var status_bar = document.getElementById("status-bar");

    // our status bar fields
    var statusline_widget     = document.getElementById("vimperator-statusline");
    var url_widget            = document.getElementById("vimperator-statusline-field-url");
    var inputbuffer_widget    = document.getElementById("vimperator-statusline-field-inputbuffer");
    var progress_widget       = document.getElementById("vimperator-statusline-field-progress");
    var tabcount_widget       = document.getElementById("vimperator-statusline-field-tabcount");
    var bufferposition_widget = document.getElementById("vimperator-statusline-field-bufferposition");

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.setClass = function(type)
    {
        var highlight_group;

        switch (type)
        {
            case "secure":
                highlight_group = "hl-StatusLineSecure";
                break;
            case "broken":
                highlight_group = "hl-StatusLineBroken";
                break;
            case "insecure":
                highlight_group = "hl-StatusLine";
                break;
        }

        status_bar.setAttribute("class", "chromeclass-status " + highlight_group);
    };

    this.updateUrl = function(url)
    {
        if (!url || typeof url != "string")
            url = vimperator.buffer.URL;

        url_widget.value = url;
    };

    this.updateInputBuffer = function(buffer)
    {
        if (!buffer || typeof buffer != "string")
            buffer = "";

        inputbuffer_widget.value = buffer;
    };

    this.updateProgress = function(progress)
    {
        if (!progress)
            progress = "";

        if (typeof progress == "string")
            progress_widget.value = progress;
        else if (typeof progress == "number")
        {
            var progress_str = "";
            if (progress <= 0)
                progress_str = "[ Loading...         ]";
            else if (progress < 1)
            {
                progress_str = "[";
                var done = Math.floor(progress * 20);
                for (i=0; i < done; i++)
                    progress_str += "=";

                progress_str += ">";

                for (i=19; i > done; i--)
                    progress_str += " ";

                progress_str += "]";
            }
            progress_widget.value = progress_str;
        }
    };

    // you can omit either of the 2 arguments
    this.updateTabCount = function(cur_index, total_tabs)
    {
        if (!cur_index || typeof cur_index != "number")
            cur_index = vimperator.tabs.index() + 1;
        if (!total_tabs || typeof cur_index != "number")
            total_tabs = vimperator.tabs.count();

        tabcount_widget.value = "[" + cur_index + "/" + total_tabs + "]";
    };

    // percent is given between 0 and 1
    this.updateBufferPosition = function(percent)
    {
        if (!percent || typeof percent != "number")
        {
            var win = document.commandDispatcher.focusedWindow;
            percent = win.scrollMaxY == 0 ? -1 : win.scrollY / win.scrollMaxY;
        }

        var bufferposition_str = "";
        percent = Math.round(percent*100);
        if (percent < 0)          bufferposition_str = "All";
        else if (percent == 0)    bufferposition_str = "Top";
        else if (percent < 10)    bufferposition_str = " " + percent + "%";
        else if (percent >= 100)  bufferposition_str = "Bot";
        else                      bufferposition_str = percent + "%";

        bufferposition_widget.value = bufferposition_str;
    };
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
