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

// XXX: move somehere else!
function multiliner(line, prev_match, heredoc) //{{{
{
    var end = true;
    var match = tokenize_ex(line, prev_match[4]);
    if (prev_match[3] === undefined) prev_match[3] = '';
    if (match[4] === null)
    {
        vimperator.focusContent();
        execute_command.apply(this, match);
    }
    else
    {
        if (match[4] === false)
        {
            prev_match[3] = prev_match[3].replace(new RegExp('<<\s*' + prev_match[4]), heredoc.replace(/\n$/, ''));
            vimperator.focusContent(); // also sets comp_tab_index to -1
            execute_command.apply(this, prev_match);
            prev_match = new Array(5);
            prev_match[3] = '';
            heredoc = '';
        }
        else
        {
            end = false;
            if (!prev_match[3])
            {
                prev_match[0] = match[0];
                prev_match[1] = match[1];
                prev_match[2] = match[2];
                prev_match[3] = match[3];
                prev_match[4] = match[4];
            }
            else
            {
                heredoc += match[3] + '\n';
            }
        }
    }
    return [prev_match, heredoc, end];
} //}}}

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
    const HISTORY_SIZE = 500;

    var completionlist = new InformationList("vimperator-completion", { min_items: 2, max_items: 10 });
    var completions = new Array();

    var history = new Array();
    var history_index = UNINITIALIZED;
    var history_start = "";

    // for the example command "open sometext| othertext" (| is the cursor pos):
    var completion_start_index = 0;  // will be 5 because we want to complete arguments for the :open command
    var completion_prefix = ""       // will be: "open sometext"
    var completion_postfix = "";     // will be: " othertext"

    var wild_index = 0;  // keep track how often we press <Tab> in a row
    var completion_index = UNINITIALIZED;

    // The prompt for the current command, for example : or /. Can be blank
    var prompt_widget = document.getElementById('vimperator-commandline-prompt');
    // The command bar which contains the current command
    var command_widget = document.getElementById('vimperator-commandline-command');
    // The widget used for multiline in-/output
    var multiline_widget = document.getElementById("vimperator-multiline");
    multiline_widget.contentDocument.body.setAttribute("style", "margin: 0px; font-family: -moz-fixed;"); // get rid of the default border

    // we need to save the mode which were in before opening the command line
    // this is then used if we focus the command line again without the "official"
    // way of calling "open"
    var cur_extended_mode = null;     // the extended mode which we last openend the command line for
    var cur_prompt = null;
    var cur_command = null;
    var old_mode = null; // when we leave the command prompt this mode is restored
    var old_extended_mode = null;

    // an ugly hack that we allow the :echo(err) commands after hitting enter
    // and before the blur() event gets fired
    var echo_allowed = false;

    // load the commandline history
    var hist = Options.getPref("commandline_history", "");
    history = hist.split("\n");

    // TODO: these styles should be moved to the .css file
    function setNormalStyle()
    {
        command_widget.inputField.setAttribute("style","font-family: monospace;");
    }
    function setMessageStyle()
    {
        command_widget.inputField.setAttribute("style", "font-family: monospace; color:magenta; font-weight: bold");
    }
    function setErrorStyle()
    {
        command_widget.inputField.setAttribute("style", "font-family: monospace; color:white; background-color:red; font-weight: bold");
    }

    // Sets the prompt - for example, : or /
    function setPrompt(prompt)
    {
        if (typeof prompt != "string")
            prompt = "";

        prompt_widget.value = prompt;
        if (prompt)
        {
            // Initially (in the xul) the prompt is 'collapsed', this makes
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

    // Sets the command - e.g. 'tabopen', 'open http://example.com/'
    function setCommand(cmd)
    {
        command_widget.value = cmd;
    }

    function setMultiline(cmd)
    {
        // TODO: we should retain any previous command output like Vim
        if (!multiline_widget.collapsed)
            multiline_widget.collapsed = true;

        cmd = cmd.replace(/\n|\\n/g, "<br/>") + "<br/><span style=\"color: green;\">Press ENTER or type command to continue</span>";
        multiline_widget.contentDocument.body.innerHTML = cmd;

        // TODO: resize upon a window resize
        var available_height = getBrowser().mPanelContainer.boxObject.height;
        var content_height = multiline_widget.contentDocument.height;
        var height = content_height < available_height ? content_height : available_height;

        multiline_widget.style.height = height + "px";
        multiline_widget.collapsed = false;
        multiline_widget.contentWindow.scrollTo(0, content_height); // scroll to the end when 'nomore' is set
    }

    function addToHistory(str)
    {
        if (str.length < 1)
            return;

        // first remove all old history elements which have this string
        history = history.filter(function(elem) {
                return elem != str;
        });
        // add string to the command line history
        if (history.push(str) > HISTORY_SIZE) //remove the first 10% of the history
            history = history.slice(HISTORY_SIZE / 10);
    }

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    this.getCommand = function()
    {
        return command_widget.value;
    };

    /**
     * All arguments can be ommited and will be defaulted to "" or null
     */
    this.open = function(prompt, cmd, ext_mode)
    {
        // save the current prompts, we need it later if the command widget
        // receives focus without calling the this.open() method
        cur_prompt = prompt || "";
        cur_command = cmd || "";
        cur_extended_mode = ext_mode || null;

        setNormalStyle();
        history_index = UNINITIALIZED;
        completion_index = UNINITIALIZED;

        // the command_widget.focus() method calls setPrompt() and setCommand()
        // this is done, because for follow-mouse window managers, we receive
        // blur and focus events once the user leaves the Firefox window with the mouse
        command_widget.focus();
    };

    // FIXME: flags not yet really functional --mst
    this.echo = function(str, flags)
    {
        var focused = document.commandDispatcher.focusedElement;
        if (!echo_allowed && focused && focused == command_widget.inputField)
            return false;

        setNormalStyle();
        if (flags || str.indexOf("\n") > -1 || str.indexOf("\\n") > -1 || str.indexOf("<br>") > -1 || str.indexOf("<br/>") > -1)
        {
            setMultiline(str);
        }
        else
        {
            multiline_widget.collapsed = true;
            setPrompt("");
            setCommand(str);
        }
        cur_extended_mode = null;
        return true;
    };

    this.echoErr = function(str)
    {
        var focused = document.commandDispatcher.focusedElement;
        if (!echo_allowed && focused && focused == command_widget.inputField)
            return false;

        setErrorStyle();
        setPrompt("");
        setCommand(str);
        cur_extended_mode = null;
        return true;
    };

    // this will prompt the user for a string
    // vimperator.commandline.input("(s)ave or (o)pen the file?")
    this.input = function(str)
    {
        // TODO: unfinished, need to find out how/if we can block the execution of code
        // to make this code synchronous or at least use a callback
        setPrompt("");
        setMessageStyle();
        setCommand(str);
        return "not implemented";
    };

    // reads a multi line input and returns the string once the last line matches
    // param until_regex
    this.readMultiline = function(until_regex, callback_func)
    {
        // save the mode, because we need to restore it on blur()
//        [old_mode, old_extended_mode] = vimperator.getMode();
//        vimperator.setMode(vimperator.modes.COMMAND_LINE, vimperator.modes.READ_MULTLINE, true);

        multiline_widget.collapsed = false;
        multiline_widget.contentDocument.body.innerHTML = "";
        multiline_widget.contentDocument.designMode = "on";
        multiline_widget.contentWindow.focus(); // FIXME: does not work
    };

    this.clear = function()
    {
        setPrompt(" "); // looks faster than an empty string
        setCommand("");
        setNormalStyle();
    };

    this.onEvent = function(event)
    {
        var command = this.getCommand();

        if (event.type == "blur")
        {
            // when we do a command_widget.focus() we get a blur event immediately,
            // so check if the target is the actualy input field
            if (event.target == command_widget.inputField)
            {
                var silent = false;
                if (old_mode == vimperator.modes.NORMAL)
                    silent = true;
                vimperator.setMode(old_mode || vimperator.modes.NORMAL, old_extended_mode || null, silent);
                cur_command = command;

                // don't add the echoed command to the history, on pressing <cr>, the
                // command is saved right into the kepress handler
                if (!echo_allowed)
                    addToHistory(command);

                completionlist.hide();
                vimperator.statusline.updateProgress(""); // we may have a "match x of y" visible
            }
        }
        else if (event.type == "focus")
        {
            // if we manually click into the command line, don't open it
            if (event.target == command_widget.inputField && cur_extended_mode != null)
            {
                // save the mode, because we need to restore it on blur()
                [old_mode, old_extended_mode] = vimperator.getMode();
                vimperator.setMode(vimperator.modes.COMMAND_LINE, cur_extended_mode);

                setPrompt(cur_prompt);
                setCommand(cur_command);
            }
            else
            {
                //event.stopPropagation(); // XXX: doesnt seem to work
                //event.preventDefault();  // so we need to use the hack below --mst

                // NOTE: echo_allowed is a misleading name here, actually this flag is set
                // so that we don't save a history entry if the user clicks into the text field
                echo_allowed = true;
                event.target.blur();
                echo_allowed = false;
                return false;
            }
        }
        else if (event.type == "input")
        {
            vimperator.triggerCallback("change", command);
        }
        else if (event.type == "keypress")
        {
            var key = event.toString();
            /* user pressed ENTER to carry out a command */
            if (key == "<Return>" || key == "<C-j>" || key == "<C-m>")
            {
                //              FIXME: move to execute() in commands.js
                //              var end = false;
                //              try {
                //                  [prev_match, heredoc, end] = multiliner(command, prev_match, heredoc);
                //              } catch(e) {
                //                  logObject(e);
                //                  echoerr(e.name + ": " + e.message);
                //                  prev_match = new Array(5);
                //                  heredoc = '';
                //                  return;
                //              }
                //              if (!end)
                //                  command_line.value = "";

                echo_allowed = true;
                addToHistory(command);
                var res = vimperator.triggerCallback("submit", command);
                vimperator.focusContent();
                echo_allowed = false;
                return res;
            }
            /* user pressed ESCAPE to cancel this prompt */
            else if (key == "<Esc>" || key == "<C-[>" || key == "<C-c>")
            {
                var res = vimperator.triggerCallback("cancel");
                // the command history item is saved in the blur() handler
                vimperator.focusContent();
                this.clear();
                return res;
            }

            /* user pressed UP or DOWN arrow to cycle history completion */
            else if (key == "<Up>" || key == "<Down>")
            {
                //always reset the tab completion if we use up/down keys
                completion_index = UNINITIALIZED;

                /* save 'start' position for iterating through the history */
                if (history_index == UNINITIALIZED)
                {
                    history_index = history.length;
                    history_start = command;
                }

                while (history_index >= -1 && history_index <= history.length)
                {
                    key == "<Up>" ? history_index-- : history_index++;
                    if (history_index == history.length) // user pressed DOWN when there is no newer history item
                    {
                        setCommand(history_start);
                        return;
                    }
                    // cannot go past history start/end
                    if (history_index <= -1)
                    {
                        history_index = 0;
                        vimperator.beep();
                        break;
                    }
                    if (history_index >= history.length + 1)
                    {
                        history_index = history.length;
                        vimperator.beep();
                        break;
                    }

                    if (history[history_index].indexOf(history_start) == 0)
                    {
                        setCommand(history[history_index]);
                        return;
                    }
                }
                vimperator.beep();
            }

            /* user pressed TAB to get completions of a command */
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
                    var res = vimperator.triggerCallback("complete", completion_prefix);
                    if (res)
                        [completion_start_index, completions] = res;

                    // Sort the completion list
                    if (vimperator.options["wildoptions"].match(/\bsort\b/))
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

                    vimperator.statusline.updateProgress("match " + (completion_index+1).toString() + " of " + completions.length.toString());
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
                        var compl = get_longest_substring();
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
                    this.clear();
                    vimperator.focusContent();
                }
            }
            else // any other key
            {
                // reset the tab completion
                completion_index = history_index = UNINITIALIZED;
            }
        }
    }

    // it would be better if we had a destructor in javascript ...
    this.destroy = function()
    {
        Options.setPref("commandline_history", history.join("\n"));
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
        while (items.length > 0) { widget.removeChild(items[0]);}

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

    // use names for the color or "transparent" to remove color information
    this.setColor = function(color)
    {
        if (!color)
            color = "transparent";
        statusline_widget.setAttribute("style", "background-color: " + color);
    };
    this.setClass = function(type)
    {
        statusline_widget.setAttribute("class", "status_" + type);
    };

    this.updateUrl = function(url)
    {
        if (!url || typeof url != "string")
            url = getCurrentLocation();

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

        tabcount_widget.value = "[" + cur_index.toString() + "/" + total_tabs.toString() + "]";
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
        else if (percent < 10)    bufferposition_str = " " + percent.toString() + "%";
        else if (percent >= 100)  bufferposition_str = "Bot";
        else                      bufferposition_str = percent.toString() + "%";

        bufferposition_widget.value = bufferposition_str;
    };
    //}}}
} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
