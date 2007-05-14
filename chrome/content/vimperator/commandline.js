// XXX: remove!
function save_history()
{
    set_pref("comp_history", comp_history.join("\n"));
}

function load_history()
{
    var hist = get_pref("comp_history", "");
    comp_history = hist.split("\n");
}

function multiliner(line, prev_match, heredoc)
{
    var end = true;
    var match = tokenize_ex(line, prev_match[4]);
    if (prev_match[3] === undefined) prev_match[3] = '';
    if (match[4] === null)
    {
        focusContent(false, true); // also sets tab_index to -1
        execute_command.apply(this, match);
    }
    else
    {
        if (match[4] === false)
        {
            prev_match[3] = prev_match[3].replace(new RegExp('<<\s*' + prev_match[4]), heredoc.replace(/\n$/, ''));
            focusContent(false, true); // also sets comp_tab_index to -1
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
}



/*
 * This class is used for prompting of user input and echoing of messages
 *
 * it consists of a prompt and command field
 * be sure to only create objects of this class when the chrome is ready
 */
function CommandLine ()
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////
    const UNINITIALIZED = -2; // notifies us, if we need to start history/tab-completion from the beginning
    const HISTORY_SIZE = 500;

    var completionlist = new CompletionList();
    var completions = new Array();

    var history = new Array();
    var history_index = UNINITIALIZED;
    var history_start = "";

    // for the example command "open sometext| othertext" (| is the cursor pos)
    var completion_start_index = 0;  // will be 5 because we want to complete arguments for the :open command
    var completion_prefix = ""       // will be: "open sometext"
	var completion_postfix = "";     // will be: " othertext"

    var wild_index = 0;  // keep track how often we press <Tab> in a row
    var completion_index = UNINITIALIZED;

    // The prompt for the current command, for example : or /. Can be blank
    var prompt_widget = document.getElementById('new-vim-commandbar-prompt');
    // The command bar which contains the current command
    var command_widget = document.getElementById('new-vim-commandbar');

    function setNormalStyle()
    {
	command_widget.inputField.setAttribute("style","font-family: monospace;");
    }
    function setErrorStyle()
    {
	command_widget.inputField.setAttribute("style", "font-family: monospace; color:white; background-color:red; font-weight: bold");
    }

    // Sets the prompt - for example, : or /
    function setPrompt(prompt)
    {
	if (typeof(prompt) != "string")
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

    function addToHistory(str)
    {
	// first remove all old history elements which have this string
	history = history.filter(function(elem) {
		return elem != str;
		});
	// add string to the command line history
	if (str.length >= 1 && history.push(str) > HISTORY_SIZE)
	    history.shift();
    }

    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////////

    this.getCommand = function()
    {
	return command_widget.value;
    };

    /**
     * All arguments can be ommited and will be defaulted to ""
     */
    this.open = function(prompt, cmd, minor_mode)
    {
	if (!prompt)
	    prompt = "";
	if (!cmd)
	    cmd = "";
	if (minor_mode)
	    setCurrentMode(minor_mode);

	setNormalStyle();
	setPrompt(prompt);
	setCommand(cmd);
	history_index = UNINITIALIZED;
	completion_index = UNINITIALIZED;
	command_widget.focus();
    };

    this.echo = function(str)
    {
	setNormalStyle();
	setPrompt("");
	setCommand(str);
    };

    this.echoErr = function(str)
    {
	setErrorStyle();
	setPrompt("");
	setCommand(str);
    };

    this.clear = function()
    {
	setPrompt(" "); // looks faster than an empty string
	setCommand("");
	setNormalStyle();
    };


    this.onEvent = function(event)
    {
	//var end = false;
	var command = this.getCommand();

	if(event.type == "blur")
	{
	    // when we do a command_widget.focus() we get a blur event immediately,
	    // so check if the target is the actualy input field
	    if (event.target == command_widget.inputField)
	    {
		addToHistory(command);
		completionlist.hide();
	    }
	}
	else if(event.type == "input")
	{
	    vimperator.triggerCallback("change", command);
	}
	else if(event.type == "keypress")
	{
	    var key = keyToString(event);
	    /* user pressed ENTER to carry out a command */
	    if (key == "<Return>" || key == "<C-j>" || key == "<C-m>")
	    {
		//				try {
		//					[prev_match, heredoc, end] = multiliner(command, prev_match, heredoc);
		//				} catch(e) {
		//					logObject(e);
		//					echoerr(e.name + ": " + e.message);
		//					prev_match = new Array(5);
		//					heredoc = '';
		//					return;
		//				}
		//				if (!end)
		//					command_line.value = "";

		// the command is saved in the blur() handler
		focusContent();
		var res = vimperator.triggerCallback("submit", command);
		return res;
	    }
	    /* user pressed ESCAPE to cancel this prompt */
	    else if (key == "<Esc>" || key == "<C-[>")
	    {
		var res = vimperator.triggerCallback("cancel");
		addToHistory(command);
		this.clear();
		focusContent(true, true);
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
			beep();
			break;
		    }
		    if (history_index >= history.length + 1)
		    {
			history_index = history.length;
			beep();
			break;
		    }

		    if (history[history_index].indexOf(history_start) == 0)
		    {
			setCommand(history[history_index]);
			return;
		    }
		}
		beep();
	    }

	    /* user pressed TAB to get completions of a command */
	    else if (key == "<Tab>" || key == "<S-Tab>")
	    {
		//always reset our completion history so up/down keys will start with new values
		history_index = UNINITIALIZED;

		// we need to build our completion list first
		if (completion_index == UNINITIALIZED) 
		{
		    // FIXME: completions.clear();
		    completion_start_index = 0;

		    completion_index = -1;
		    wild_index = 0;

		    completion_prefix = command.substring(0, command_widget.selectionStart);
		    completion_postfix = command.substring(command_widget.selectionStart);
		    var res = vimperator.triggerCallback("complete", completion_prefix);
		    if (res)
			[completion_start_index, completions] = res;

		    // Sort the completion list
		    if (get_pref('wildoptions').match(/\bsort\b/))
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
		// we could also return when no completion is found
		// but we fall through to the cleanup anyway
		if (completions.length == 0)
		{
		    beep();
		    // prevent tab from moving to the next field
		    event.preventDefault();
		    event.stopPropagation();
		    return;
		}

		var wim = get_pref('wildmode').split(/,/);
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
		    completionlist.show(completions);

		if (full)
		{
		    if (event.shiftKey)
		    {
			completion_index--;
			if(completion_index < -1)
			    completion_index = completions.length -1;
		    }
		    else
		    {
			completion_index++;
			if(completion_index >= completions.length)
			    completion_index = -1;
		    }

		    showStatusbarMessage("match " + (completion_index+1).toString() + " of " + completions.length.toString(), STATUSFIELD_PROGRESS);
		    // if the list is hidden, this function does nothing
		    completionlist.selectItem(completion_index);
		}


		if (completion_index == -1 && !longest) // wrapped around matches, reset command line
		{
		    if (full && completions.length > 1)
		    {
			setCommand(completion_prefix + completion_postfix);
			//completion_list.selectedIndex = -1;
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
		if(command.length == 0)
		{
		    this.clear();
		    focusContent();
		}
	    }
	    else // any other key
	    {
		// reset the tab completion
		completion_index = history_index = UNINITIALIZED;
	    }
	}
    }
    logMessage("CommandLine initialized.");
}

function CompletionList()
{
	const MAX_ITEMS = 10;
	const CONTEXT_LINES = 3;

	var completions = null; // a reference to the Array of completions
    var completion_widget = document.getElementById("vim-completion");
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
			var items = completion_widget.getElementsByTagName("listitem");
			if (items.length > 0)
				completion_widget.insertBefore(item, items[0]);
			else
				completion_widget.appendChild(item);
		}
		else
			completion_widget.appendChild(item);
	}

	/**
	 * uses the entries in completions to fill the listbox
	 * @param startindex: start at this index and show MAX_ITEMS
	 * @returns the number of items
	 */
	function fill(startindex)
	{
		var complength = completions.length;

		// remove all old items first
		var items = completion_widget.getElementsByTagName("listitem");
		while (items.length > 0) { completion_widget.removeChild(items[0]);}

		// find start index
		if (startindex + MAX_ITEMS > complength)
			startindex = complength - MAX_ITEMS;
		if (startindex < 0)
			startindex = 0;

		list_offset = startindex;
		list_index = -1;

		for(i = startindex; i < complength && i < startindex + MAX_ITEMS; i++)
		{
			addItem(completions[i], false);
		}

		return (i-startindex);
	}

	////////////////////////////////////////////////////////////////////////////////
	////////////////////// PUBLIC SECTION //////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////
this.len = function() {alert(completions.length);};
	this.show = function(compl)
	{
		completions = compl;
		fill(0);

		var length = completions.length;
		if (length > MAX_ITEMS)
			length = MAX_ITEMS;
		if (length > 1)
		{
			completion_widget.setAttribute("rows", length.toString());
			completion_widget.hidden = false;
			return true;
		}
		else
		{
			completion_widget.hidden = true;
			return false;
		}
	}

	this.hide = function()
	{
		completion_widget.hidden = true;
	}

	/**
	 * select index, refill list if necessary
	 */
 	this.selectItem = function(index)
 	{
		if(completion_widget.hidden)
			return;

		// find start index
		var new_offset = 0;
		if (index >= list_offset + MAX_ITEMS - CONTEXT_LINES)
			new_offset = index - MAX_ITEMS + CONTEXT_LINES + 1;
		else if (index <= list_offset + CONTEXT_LINES)
			new_offset = index - CONTEXT_LINES;
		else
			new_offset = list_offset;

		if (new_offset + MAX_ITEMS > completions.length)
			new_offset = completions.length - MAX_ITEMS;
		if (new_offset < 0)
			new_offset = 0;

		// for speed reason: just remove old item, and add the new one at the end of the list
		var items = completion_widget.getElementsByTagName("listitem");
		if (new_offset == list_offset + 1)
		{
			completion_widget.removeChild(items[0]);
			addItem(completions[index + CONTEXT_LINES], false);
		}
		else if (new_offset == list_offset - 1)
		{
            completion_widget.removeChild(items[items.length-1]);
			addItem(completions[index - CONTEXT_LINES], true);
		}
		else if (new_offset == list_offset)
		{
			// do nothing
		}
		else
			fill(new_offset);

		list_offset = new_offset;
		completion_widget.selectedIndex = index - list_offset;
	}
}

// function PreviewWindow()
// {
//     var completion_widget = document.getElementById("vim-preview_window");
// }
// PreviewWindow.protoype = new CompletionList;
// var pw = new PreviewWindow();

// vim: set fdm=marker sw=4 ts=4 et:
