function Map(mode, cmd, action, extra_info)
{
    if (!mode || (!cmd || !cmd.length) || !action) return;
    if (!extra_info) extra_info = {};
    this.mode = mode;
    this.cmd = cmd;
    this.action = action;
    this.flags = extra_info.flags || 0;

    if (extra_info.usage)
        this.usage = extra_info.usage;
    else
    {
        var usage = "";
        if (flags & vimperator.mappings.flags.COUNT)
            usage = "{count}";

        usage += cmd;
        if (flags & vimperator.mappings.flags.ARGUMENT)
            usage += " {arg}";
    }

    if (extra_info.help)
        this.help = extra_info.help;
    if (extra_info.short)
        this.short = extra_info.short;

    this.execute: function() {
        this.cmd.call(this);
    }
}

function Mappings()
{
    this.main = [];
    this.user = [];
    this.flags = {
        MOTION:		1 << 1;
        COUNT:		1 << 2;
        ARGUMENT:	1 << 3;
    };

    this.add: function(map)
    {
        if (!map) return;
        if (!this.user[map.mode])
            this.user[map.mode] = [];

        this.user[map.mode].push(map);
        return this;
    }
    
    this.remove: function(map)
    {
        var index;
        
        if (!map || !(index = this.user[map.mode].indexOf(map)))
            return;

        this.user[map.mode].splice(index, 1);
        return this;
    }
    
    this.get: function(mode, cmd)
    {
        if (!mode || !cmd) return;
        var map = getFrom(mode, cmd, this.user);
        if (!map) map  = getFrom(mode, cmd, this.main);
        return map;
    }

    function addDefaults(map)
    {
        if (!map) return;
        if (!this.main[map.mode])
            this.main[map.mode] = [];

        this.main[map.mode].push(map);
        return this;
    }

    function getFrom(mode, cmd, stack)
    {
        if (!stack || !stack[mode] || !stack[mode].length)
            return;

        var substack = stack[mode];
        var stack_length = substack.length;
        for (var i = 0; i < stack_length; i++)
        {
            for (var j = 0; j < substack[i].cmd.length; j++)
            if (substack[i].cmd[j] == cmd)
                return substack[i];
        }
    }

    /* Default mappings
     * Normal mode
     * */
    addDefaults(new Map(vimperator.mode.NORMAL, ["]f"], focusNextFrame, {short: "Focus next frame", help:
		"Flashes the next frame in order with a red color, to quickly show where keyboard focus is.<br/>"+
		"This may not work correctly for frames with lots of CSS code."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["b"], function (args) { vimperator.commandline.open(":", "buffer ", vimperator.modes.EX); }, {
		short: "Open a prompt to switch buffers", help: 
		"Typing the corresponding number opens switches to this buffer."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["B"], toggleBufferList, {short: "Toggle buffer list", help:
		"Toggles the display of the buffer list which shows all opened tabs."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["d"], function(count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, false, 0); }, {
		short: "Delete current buffer (=tab)", flags: this.flags.COUNT, help: 
		"Count WILL be supported in future releases, then <code class=\"mapping\">2d</code> removes two tabs and the one the right is selected."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["D"], function(count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, true, 0); }, {
		short: "Delete current buffer (=tab)", flags: this.flags.COUNT, help: 
		"Count WILL be supported in future releases, then <code class=\"mapping\">2d</code> removes two tabs and the one the right is selected."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["gh"], BrowserHome, {short: "Go home", help:
		"Opens the homepage in the current tab."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["gH"], BrowserHome, {short: "Go home in a new tab", help:
		"Opens the homepage in a new tab."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["gP"], function(count) { openURLsInNewTab(readFromClipboard(), false); }, {
		short: "Open (put) an URL based on the current clipboard contents in a new buffer",
		help:  "Works like <code class=\"mapping\">P</code>, but inverts the <code class=\"setting\">'activate'</code> setting."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["gt", "<C-n>", "<C-Tab>"],
	    function(count) { vimperator.tabs.select(count > 0 ? count -1: "+1", count > 0 ? false : true); }, {
		short: "Go to the next tab", flags: this.flags.COUNT,
		help:  "Cycles to the first tab, when the last is selected.<br/>Count is supported, <code class=\"mapping\">3gt</code> goes to the third tab."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["gT", "<C-p>", "<C-S-Tab>"],
	    function(count) { vimperator.tabs.select(count > 0 ? count -1: "-1", count > 0 ? false : true); }, {
		short: "Go to the previous tab", flags: this.flags.COUNT,
		help:  "Cycles to the last tab, when the first is selected.<br/>Count is supported, <code class=\"mapping\">3gT</code> goes to the third tab."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["m"], set_location_mark, {short: "Set mark at the cursor position", usage: "m{a-zA-Z}",
		help: "Marks a-z are local to the buffer, whereas A-Z are valid between buffers", flags: this.flags.ARGUMENT
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["o"], function(count) { vimperator.commandline.open(":", "open ", vimperator.modes.EX) }, {
		short: "Open one or more URLs in the current tab",
		help:  "See <code class=\"command\">:open</code> for more details."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["O"],
	    function(count) { vimperator.commandline.open(":", "open " + getCurrentLocation(), vimperator.modes.EX); }, {
		short: "Open one ore more URLs in the current tab, based on current location",
		help:  "Works like <code class=\"mapping\">o</code>, but preselects current URL in the <code class=\"command\">:open</code> query."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["p", "<MiddleMouse>"],
	    function(count) { openURLs(readFromClipboard()); }, {
		short: "Open (put) an URL based on the current clipboard contents in the current buffer",
		help:  "You can also just select some non-URL text, and search for it with the default search engine or keyword (specified by the <code class=\"setting\">'defsearch'</code> setting) with <code class=\"mapping\">p</code>."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["P"],
	    function(count) { openURLsInNewTab(readFromClipboard(), true); }, {
		short: "Open (put) an URL based on the current clipboard contents in a new buffer",
		help: "Works like <code class=\"mapping\">p</code>, but opens a new tab.<br/>" +
        "Whether the new buffer is activated, depends on the <code class=\"setting\">'activate'</code> setting."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["r"], function(count) { reload(getBrowser().mCurrentTab, false); }, {
        short: "Reload", help:  "Forces reloading of the current page."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["R"], function(count) { reload(getBrowser().mCurrentTab, true); }, {
        short: "Reload while skipping the cache", help:  "Forces reloading of the current page skipping the cache."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["t"], function(count) { vimperator.commandline.open(":", "tabopen ", vimperator.modes.EX); }, {
        short: "Open one or more URLs in a new tab",
        help:  "Like <code class=\"mapping\">o</code> but open URLs in a new tab.<br/>"+
        "See <code class=\"command\">:tabopen</code> for more details."
    }));
    addDefaults(new Map(vimperator.mode.NORMAL, ["T"],
        function(count) { vimperator.commandline.open(":", "tabopen " + getCurrentLocation(), vimperator.modes.EX); }, {
        short: "Open one ore more URLs in a new tab, based on current location",
        help: "Works like <code class=\"mapping\">t</code>, but preselects current URL in the <code class=\"command\">:tabopen</code> query.",
    }));

    var normal_maps = [
	[ 
	    ["u"],
	    ["{count}u"],
	    "Undo closing of a tab",
	    "If a count is given, don't close the last but the n'th last tab.",
	    function(count) { execute_command(count, 'undo', false, ''); },
	    this.flags.COUNT
	],
	[ 
	    ["y"],
	    ["y"],
	    "Yank current location to the clipboard",
	    "Under UNIX the location is also put into the selection, which can be pasted with the middle mouse button.",
	    yankCurrentLocation
	],
	[
	    ["Y"],
	    ["Y"],
	    "Copy selected text",
	    "The currently selected text is copied to the system clipboard.",
	    yankCurrentSelection,
	    null
	],
	[ 
	    ["zi", "+"],
	    ["zi", "+"],
	    "Zoom in current web page by 25%",
	    "Currently no count supported.",
	    function(count) { zoom_in(1); }
	],
	[ 
	    ["zI"],
	    ["zI"],
	    "Zoom in current web page by 100%",
	    "Currently no count supported.",
	    function(count) { zoom_in(4); }
	],
	[ 
	    ["zo", "-"],
	    ["zo", "-"],
	    "Zoom out current web page by 25%",
	    "Currently no count supported.",
	    function(count) { zoom_in(-1); }
	],
	[ 
	    ["zO"],
	    ["zO"],
	    "Zoom out current web page by 100%",
	    "Currently no count supported.",
	    function(count) { zoom_in(-4); }
	],
	[ 
	    ["zz"],
	    ["{count}zz"],
	    "Set zoom value of the webpage",
	    "Zoom value can be between 25 and 500%. If it is omitted, zoom is reset to 100%.",
	    zoom_to,
	    this.flags.COUNT
	],
	[ 
	    ["ZQ"],
	    ["ZQ"],
	    "Quit and don't save the session",
	    "Works like <code class=\"command\">:qall</code>.",
	    function(count) { quit(false); }
	],
	[ 
	    ["ZZ"],
	    ["ZZ"],
	    "Quit and save the session",
	    "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
	    "Works like <code class=\"command\">:xall</code>.",
	    function(count) { quit(true); }
	],

	/* scrolling commands */
	[ 
	    ["0", "^"],
	    ["0", "^"],
	    "Scroll to the absolute left of the document",
	    "Unlike in vim, <code class=\"mapping\">0</code> and <code class=\"mapping\">^</code> work exactly the same way.",
	    function(count) { scrollBufferAbsolute(0, -1); }
	],
	[ 
	    ["$"],
	    ["$"],
	    "Scroll to the absolute right of the document",
	    null,
	    function(count) { scrollBufferAbsolute(100, -1); }
	],
	[ 
	    ["gg", "<Home>"],
	    ["{count}gg", "{count}<Home>"],
	    "Goto the top of the document",
	    "Count is supported, <code class=\"mapping\">35gg</code> vertically goes to 35% of the document.",
	    function(count) { scrollBufferAbsolute(-1, count >  0 ? count : 0); },
	    this.flags.COUNT
	],
	[ 
	    ["G", "<End>"],
	    ["{count}G", "{count}<End>"],
	    "Goto the end of the document",
	    "Count is supported, <code class=\"mapping\">35G</code> vertically goes to 35% of the document.",
	    function(count) { scrollBufferAbsolute(-1, count >= 0 ? count : 100); },
	    this.flags.COUNT
	],
	[ 
	    ["h", "<Left>"],
	    ["{count}h", "{count}<Left>"],
	    "Scroll document to the left",
	    "Count is supported: <code class=\"mapping\">10h</code> will move 10 times as much to the left.<br/>"+
	    "If the document cannot scroll more, a beep is emmited (unless <code class=\"setting\">'beep'</code> is turned off).",
	    function(count) { scrollBufferRelative(-1, 0); },
	    this.flags.COUNT
	],
	[ 
	    ["j", "<Down>", "<C-e>"],
	    ["{count}j", "{count}<Down>", "{count}<C-e>"],
	    "Scroll document down",
	    "Count is supported: <code class=\"mapping\">10j</code> will move 10 times as much down.<br/>"+
	    "If the document cannot scroll more, a beep is emmited (unless <code class=\"setting\">'beep'</code> is turned off).",
	    function(count) { scrollBufferRelative(0, 1); },
	    this.flags.COUNT
	],
	[ 
	    ["k", "<Up>", "<C-y>"],
	    ["{count}k", "{count}<Up>", "{count}<C-y>"],
	    "Scroll document up",
	    "Count is supported: <code class=\"mapping\">10k</code> will move 10 times as much up.<br/>"+
	    "If the document cannot scroll more, a beep is emmited (unless <code class=\"setting\">'beep'</code> is turned off).",
	    function(count) { scrollBufferRelative(0, -1); },
	    this.flags.COUNT
	],
	[ 
	    ["l", "<Right>"],
	    ["{count}l", "{count}<Right>"],
	    "Scroll document to the right",
	    "Count is supported: <code class=\"mapping\">10l</code> will move 10 times as much to the right.<br/>"+
	    "If the document cannot scroll more, a beep is emmited (unless <code class=\"setting\">'beep'</code> is turned off).",
	    function(count) { scrollBufferRelative(1, 0); },
	    this.flags.COUNT
	],
	[ 
	    ["<C-b>", "<C-u>", "<PageUp>", "<S-Space>"],
	    ["<C-b>"],
	    "Scroll up a full page of the current document",
	    "No count support for now.",
	    function(count) { goDoCommand('cmd_scrollPageUp'); }
	],
	[ 
	    ["<C-f>", "<C-d>", "<PageDown>", "<Space>"],
	    ["<C-f>"],
	    "Scroll down a full page of the current document",
	    "No count support for now,",
	    function(count) { goDoCommand('cmd_scrollPageDown'); }
	],

	/* history manipulation and jumplist */
	[ 
	    ["<C-o>"],
	    ["{count}<C-o>"],
	    "Go to an older position in the jump list",
	    "The jump list is just the browser history for now",
	    function(count) { stepInHistory(count > 0 ? -1 * count : -1); },
	    this.flags.COUNT
	],
	[ 
	    ["<C-i>"],
	    ["{count}<C-i>"],
	    "Go to a newer position in the jump list",
	    "The jump list is just the browser history for now",
	    function(count) { stepInHistory(count > 0 ? count : 1); },
	    this.flags.COUNT
	],
	[ 
	    ["H", "<A-Left>", "<M-Left>"],
	    ["{count}H", "{count}<A-Left>", "{count}<M-Left>"],
	    "Go back in the browser history",
	    "Count is supported, <code class=\"mapping\">3H</code> goes back 3 steps.",
	    function(count) { stepInHistory(count > 0 ? -1 * count : -1); },
	    this.flags.COUNT
	],
	[ 
	    ["L", "<A-Right>", "<M-Right>"],
	    ["{count}L", "{count}<A-Right>", "{count}<M-Right>"],
	    "Go forward in the browser history",
	    "Count is supported, <code class=\"mapping\">3L</code> goes forward 3 steps.",
	    function(count) { stepInHistory(count > 0 ? count : 1); },
	    this.flags.COUNT
	],
	[ 
	    ["gu", "<BS>"],
	    ["{count}gu", "{count}<BS>"],
	    "Go to parent directory",
	    "Count is supported, <code class=\"mapping\">2gu</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> would open <code>http://www.example.com/dir1/</code>.",
	    goUp,
	    this.flags.COUNT
	],
	[ 
	    ["gU", "<C-BS>"],
	    ["gU", "<C-BS>"],
	    "Go to the root of the website",
	    "<code class=\"mapping\">gU</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> opens <code>http://www.example.com/</code>.<br/>"+
	    "When browsing a local directory, it goes to the root document.",
	    function(count) { openURLs("..."); }
	],

	/* hint managment */
	[ 
	    ["f"],
	    ["f"],
	    "Start QuickHint mode",
	    "In QuickHint mode, every hintable item (according to the <code class=\"setting\">'hinttags'</code> XPath query) is assigned a label.<br/>"+
	    "If you then press the keys for a label, it is followed as soon as it can be uniquely identified and this mode is stopped. Or press <code class=\"mapping\">&lt;Esc&gt;</code> to stop this mode.<br/>"+
	    "If you write the hint in ALLCAPS, the hint is followed in a background tab.",
	    function(count) { hah.enableHahMode(vimperator.modes.QUICK_HINT); }
	],
	[ 
	    ["F"],
	    ["F"],
	    "Start AlwaysHint mode",
	    "In AlwaysHint mode, every hintable item (according to the <code class=\"setting\">'hinttags'</code> XPath query) is assigned a label.<br/>"+
	    "If you then press the keys for a label, it is followed as soon as it can be uniquely identified. Labels stay active after following a hint in this mode, press <code class=\"mapping\">&lt;Esc&gt;</code> to stop this mode.<br/>"+
	    "This hint mode is especially useful for browsing large sites like Forums as hints are automatically regenerated when switching to a new document.<br/>"+
	    "Also, most <code class=\"mapping\">Ctrl</code>-prefixed shortcut keys are available in this mode for navigation.",
	    function(count) { hah.enableHahMode(vimperator.modes.ALWAYS_HINT); }
	],
	[ 
	    [";"],
	    [";"],
	    "Start ExtendedHint mode",
	    "ExtendedHint mode is useful, since in this mode you can yank link locations, or open them in a new window.<br/>"+
	    "E.g., if you want to yank the location of hint <code>AB</code>, press <code class=\"mapping\">;</code> to start this hint mode.<br/>"+
	    "Then press <code>AB</code> to select the hint. Now press <code class=\"mapping\">y</code> to yank its location.<br/>"+
	    "Actions for selected hints in ExtendedHint mode are:<br/>"+
	    "<ul><li><code class=\"mapping\">y</code> to yank its location</li>"+
	    "    <li><code class=\"mapping\">Y</code> to yank its text description</li>"+
	    "    <li><code class=\"mapping\">o</code> to open its location in the current tab</li>"+
	    "    <li><code class=\"mapping\">t</code> to open its location in a new tab</li>"+
	    "    <li><code class=\"mapping\">O</code> to open its location in an <code class=\"command\">:open</code> query (not implemented yet)</li>"+
	    "    <li><code class=\"mapping\">T</code> to open its location in an <code class=\"command\">:tabopen</code> query (not implemented yet)</li>"+
	    "    <li><code class=\"mapping\">s</code> to save its destination (not implemented yet)</li>"+
	    "    <li><code class=\"mapping\">&lt;C-w&gt;</code> to open its destination in a new window</li>"+
	    "</ul>"+
	    "Multiple hints can be seperated by commas where it makes sense. <code class=\"mapping\">;ab,ac,adt</code> opens <code>AB</code>, <code>AC</code> and <code>AD</code> in a new tab.<br/>"+
	    "Hintable elements for this mode can be set in the <code class=\"setting\">'extendedhinttags'</code> XPath string.",
	    function(count) { hah.enableHahMode(vimperator.modes.EXTENDED_HINT); }
	],

	/* search managment */
	[
	    ["g/"],
	    ["g/"],
	    "Search forward for a pattern",
	    "",
	    function(count) { vimperator.search.openSearchDialog(); }
	],
	[ 
	    ["n"],
	    ["n"],
	    "Find next",
	    "Repeat the last \"/\" 1 time (until count is supported).",
	    function(count) { vimperator.search.findNext(); }
	],
	[ 
	    ["N"],
	    ["N"],
	    "Find previous",
	    "Repeat the last \"/\" 1 time (until count is supported) in the opposite direction.",
	    function(count) { vimperator.search.findPrevious(); }
	],

	/* vimperator managment */
	[ 
	    ["<F1>"],
	    ["<F1>"],
	    "Open help window",
	    "The default section is shown, if you need help for a specific topic, try <code class=\"command\">:help &lt;F1&gt;</code> (jumping to a specific section not implemented yet).",
	    function(count) { help(null); }
	],
	[ 
	    [":"],
	    [":"],
	    "Start command line mode",
	    "In command line mode, you can perform extended commands, which may require arguments.",
	    function(count) { vimperator.commandline.open(":", "", vimperator.modes.EX); }
	],
	[ 
	    ["I"],
	    ["I"],
	    "Disable vimperator keys",
	    "Starts an 'ignorekeys' mode, where all keys except <code class=\"mapping\">&lt;Esc&gt;</code> are passed to the next event handler.<br/>"+
	    "This is especially useful, if JavaScript controlled forms like the RichEdit form fields of GMail don't work anymore.<br/>" +
	    "To exit this mode, press <code class=\"mapping\">&lt;Esc&gt;</code>. If you also need to pass <code class=\"mapping\">&lt;Esc&gt;</code>"+
	    "in this mode to the webpage, prepend it with <code class=\"mapping\">&lt;C-v&gt;</code>.",
	    function(count) { vimperator.addMode(null, vimperator.modes.ESCAPE_ALL_KEYS);}
	],
	[ 
	    ["<C-v>"], // if you ever add/remove keys here, also check them in the onVimperatorKeypress() function
	    ["<C-v>"],
	    "Escape next key",
	    "If you need to pass a certain key to a javascript form field or another extension prefix the key with <code class=\"mapping\">&lt;C-v&gt;</code>.<br/>"+
	    "Also works to unshadow Firefox shortcuts like <code class=\"mapping\">&lt;C-o&gt;</code> which are otherwise hidden in Vimperator.<br/>"+
	    "When in 'ignorekeys' mode (activated by <code class=\"mapping\">&lt;I&gt;</code>), <code class=\"mapping\">&lt;C-v&gt;</code> will pass the next key to Vimperator instead of the webpage.",
	    function(count) { vimperator.addMode(null, vimperator.modes.ESCAPE_ONE_KEY); }
	],
	[ 
	    ["<C-c>"],
	    ["<C-c>"],
	    "Stop loading",
	    "Stops loading the current webpage.",
	    BrowserStop
	],
	[ 
	    ["<Esc>", "<C-[>"], // if you ever add/remove keys here, also check them in the onVimperatorKeypress() function
	    ["<Esc>", "<C-[>"],
	    "Cancel any operation",
	    "Exits any command line or hint mode and returns to browser mode.<br/>"+
	    "Also focuses the web page, in case a form field has focus and eats our key presses.",
	    onEscape
	]
    ];
    var hint_maps = [
	/* hint action keys */
	["o",          "hah.openHints(false, false);", true, false],
	["t",          "hah.openHints(true,  false);", true, false],
	["<C-w>",      "hah.openHints(false, true );", true, false],
	["s",          "vimperator.echoerr('Saving of links not yet implemented');", true, false],
	["y",          "hah.yankUrlHints();", true, false],
	["Y",          "hah.yankTextHints();", true, false],
	[",",          "g_inputbuffer+=','; hah.setCurrentState(0);", false, true],
	[":",          "vimperator.commandline.open(':', '', vimperator.modes.EX);", false, true],
	/* movement keys */
	["<C-e>",      "scrollBufferRelative(0, 1);",        false, true],
	["<C-y>",      "scrollBufferRelative(0, -1);",       false, true],
	["<Home>",     "scrollBufferAbsolute(-1, 0);",       false, true],
	["<End>",      "scrollBufferAbsolute(-1, 100);",     false, true],
	["<C-b>",      "goDoCommand('cmd_scrollPageUp');",   false, true],
	["<PageUp>",   "goDoCommand('cmd_scrollPageUp');",   false, true],
	["<C-f>",      "goDoCommand('cmd_scrollPageDown');", false, true],
	["<PageDown>", "goDoCommand('cmd_scrollPageDown');", false, true],
	["<Left>",     "scrollBufferRelative(-1, 0);",       false, true],
	["<Down>",     "scrollBufferRelative(0, 1);",        false, true],
	["<Up>",       "scrollBufferRelative(0, -1);",       false, true],
	["<Right>",    "scrollBufferRelative(1, 0);",        false, true],
	/* tab managment */
	["<C-n>",      "vimperator.tabs.select('+1', true)",       true,  true], // same as gt, but no count supported
	["<C-p>",      "vimperator.tabs.select('-1', true)",       true,  true],
	/* navigation */
	["<C-o>",      "stepInHistory(g_count > 0 ? -1 * g_count : -1);", false, true],
	["<C-i>",      "stepInHistory(g_count > 0 ? g_count : 1);",       false, true],
	["<C-h>",      "stepInHistory(g_count > 0 ? -1 * g_count : -1);", false, true],
	["<C-l>",      "stepInHistory(g_count > 0 ? g_count : 1);",       false, true],
	["<C-d>",      "vimperator.tabs.remove(getBrowser().mCurrentTab, g_count, false, 0);",                  true,  true],
	/* cancel hint mode keys */
	["<C-c>",      "", true, true],
	["<C-g>",      "", true, true],
	["<C-[>",      "", true, true],
	["<Esc>",      "", true, true]
    ];
}

// vim: set fdm=marker sw=4 ts=4 et:
