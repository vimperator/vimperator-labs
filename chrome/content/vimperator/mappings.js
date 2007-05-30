// TODO: document
function Map(mode, cmds, act, extra_info)
{
    if (!mode || (!cmds || !cmds.length) || !action)
        return null;

    if (!extra_info)
        extra_info = {};

    var action = act;
    var flags = extra_info.flags || 0;

    this.mode = mode;
    this.commands = cmds;

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
    if (extra_info.short_help)
        this.short_help = extra_info.short_help;

    // XXX: can we move this to Map.prototype.execute, or don't we have access to this in a prototype?
    this.execute = function() {
        action.call(this);
    }
}

function Mappings()
{
	////////////////////////////////////////////////////////////////////////////////
	////////////////////// PRIVATE SECTION /////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////
    var main = []; // array of default Map() objects
    var user = []; // array of objects created by :map

    function addDefaultMap(map)
    {
        if (!map)
            return false;

        if (!main[map.mode])
            main[map.mode] = [];

        main[map.mode].push(map);
        return true;
    }

    function getFrom(mode, cmd, stack)
    {
        if (!stack || !stack[mode] || !stack[mode].length)
            return;

        var substack = stack[mode];
        var stack_length = substack.length;
        for (var i = 0; i < stack_length; i++)
        {
            for (var j = 0; j < substack[i].commands.length; j++)
                if (substack[i].commands[j] == cmd)
                    return substack[i];
        }
    }

	////////////////////////////////////////////////////////////////////////////////
	////////////////////// PUBLIC SECTION //////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////

    this.flags = {
        MOTION:		1 << 0,
        COUNT:		1 << 1,
        ARGUMENT:	1 << 2
    };

    // add a user mapping
    this.add = function(map)
    {
        if (!map)
            return false;

        if (!user[map.mode])
            user[map.mode] = [];

        user[map.mode].push(map);
        return true;
    }

    this.remove = function(map)
    {
        var index;

        if (!map || !(index = user[map.mode].indexOf(map)))
            return false;

        user[map.mode].splice(index, 1);
        return true;
    }

    this.get = function(mode, cmd)
    {
        if (!mode || !cmd)
            return null;

        var map = getFrom(mode, cmd, user);
        if (!map)
            map = getFrom(mode, cmd, main);

        return map;
    }

    // same as this.get() but always returns an array of commands which start with "cmd"
    this.getAll = function(mode, cmd)
    {
        var matching = [];

        if (!mode || !cmd)
            return matching;

        // TODO: fill matching array with commands which start with cmd
        /*var map = getFrom(mode, cmd, user);
        if (!map)
            map = getFrom(mode, cmd, main);
        */

        return matching;
    }

	////////////////////////////////////////////////////////////////////////////////
	////////////////////// DEFAULT MAPPINGS ////////////////////////////////////////
	////////////////////////////////////////////////////////////////////////////////
    /* Default mappings
     * Normal mode
     * */
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["]f"], focusNextFrame,
        {
            short_help: "Focus next frame",
            help: "Flashes the next frame in order with a red color, to quickly show where keyboard focus is.<br/>" +
                  "This may not work correctly for frames with lots of CSS code."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["b"], function (args) { vimperator.commandline.open(":", "buffer ", vimperator.modes.EX); },
        {
            short_help: "Open a prompt to switch buffers",
            help: "Typing the corresponding number opens switches to this buffer."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["B"], toggleBufferList,
        {
            short_help: "Toggle buffer list",
            help: "Toggles the display of the buffer list which shows all opened tabs."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["d"], function(count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, false, 0); },
        {
            short_help: "Delete current buffer (=tab)",
            help: "Count WILL be supported in future releases, then <code class=\"mapping\">2d</code> removes two tabs and the one the right is selected.",
            flags: this.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["D"], function(count) { vimperator.tabs.remove(getBrowser().mCurrentTab, count, true, 0); },
        {
            short_help: "Delete current buffer (=tab)",
            help: "Count WILL be supported in future releases, then <code class=\"mapping\">2d</code> removes two tabs and the one the right is selected.",
            flags: this.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["gh"], BrowserHome,
        {
            short_help: "Go home",
            help: "Opens the homepage in the current tab."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["gH"], BrowserHome,
        {
            short_help: "Go home in a new tab",
            help: "Opens the homepage in a new tab."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["gP"], function(count) { openURLsInNewTab(readFromClipboard(), false); },
        {
            short_help: "Open (put) an URL based on the current clipboard contents in a new buffer",
            help: "Works like <code class=\"mapping\">P</code>, but inverts the <code class=\"setting\">'activate'</code> setting."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["gt", "<C-n>", "<C-Tab>"], function(count) { vimperator.tabs.select(count > 0 ? count -1: "+1", count > 0 ? false : true); },
        {
            short_help: "Go to the next tab",
            help: "Cycles to the first tab, when the last is selected.<br/>Count is supported, <code class=\"mapping\">3gt</code> goes to the third tab.",
            flags: this.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["gT", "<C-p>", "<C-S-Tab>"], function(count) { vimperator.tabs.select(count > 0 ? count -1: "-1", count > 0 ? false : true); },
        {
            short_help: "Go to the previous tab",
            help: "Cycles to the last tab, when the first is selected.<br/>Count is supported, <code class=\"mapping\">3gT</code> goes to the third tab.",
            flags: this.flags.COUNT
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["m"], set_location_mark,
        {
            short_help: "Set mark at the cursor position", usage: "m{a-zA-Z}",
            help: "Marks a-z are local to the buffer, whereas A-Z are valid between buffers.",
            flags: this.flags.ARGUMENT
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["o"], function(count) { vimperator.commandline.open(":", "open ", vimperator.modes.EX); },
        {
            short_help: "Open one or more URLs in the current tab",
            help: "See <code class=\"command\">:open</code> for more details."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["O"], function(count) { vimperator.commandline.open(":", "open " + getCurrentLocation(), vimperator.modes.EX); },
        {
            short_help: "Open one or more URLs in the current tab, based on current location",
            help: "Works like <code class=\"mapping\">o</code>, but preselects current URL in the <code class=\"command\">:open</code> query."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["p", "<MiddleMouse>"], function(count) { openURLs(readFromClipboard()); },
        {
            short_help: "Open (put) an URL based on the current clipboard contents in the current buffer",
            help: "You can also just select some non-URL text, and search for it with the default search engine or keyword (specified by the <code class=\"setting\">'defsearch'</code> setting) with <code class=\"mapping\">p</code>."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["P"], function(count) { openURLsInNewTab(readFromClipboard(), true); },
        {
            short_help: "Open (put) an URL based on the current clipboard contents in a new buffer",
            help: "Works like <code class=\"mapping\">p</code>, but opens a new tab.<br/>" +
                  "Whether the new buffer is activated, depends on the <code class=\"setting\">'activate'</code> setting."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["r"], function(count) { reload(getBrowser().mCurrentTab, false); },
        {
            short_help: "Reload",
            help: "Forces reloading of the current page."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["R"], function(count) { reload(getBrowser().mCurrentTab, true); },
        {
            short_help: "Reload while skipping the cache",
            help: "Forces reloading of the current page skipping the cache."
        }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["t"], function(count) { vimperator.commandline.open(":", "tabopen ", vimperator.modes.EX); },
        {
            short_help: "Open one or more URLs in a new tab",
            help: "Like <code class=\"mapping\">o</code> but open URLs in a new tab.<br/>" +
                  "See <code class=\"command\">:tabopen</code> for more details."
               }
    ));
    addDefaultMap(new Map(vimperator.mode.NORMAL, ["T"], function(count) { vimperator.commandline.open(":", "tabopen " + getCurrentLocation(), vimperator.modes.EX); },
        {
            short_help: "Open one ore more URLs in a new tab, based on current location",
            help: "Works like <code class=\"mapping\">t</code>, but preselects current URL in the <code class=\"command\">:tabopen</code> query."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["u"], function(count) { execute_command(count, 'undo', false, ''); },
        {
            short_help: "Undo closing of a tab",
            help: "If a count is given, don't close the last but the n'th last tab.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["y"], yankCurrentLocation,
        {
            short_help: "Yank current location to the clipboard",
            help: "Under UNIX the location is also put into the selection, which can be pasted with the middle mouse button."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["Y"], yankCurrentSelection,
        {
            short_help: "Copy selected text",
            help: "The currently selected text is copied to the system clipboard."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["zi", "+"], function(count) { zoom_in(1); },
        {
            short_help: "Zoom in current web page by 25%",
            help: "Currently no count supported."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["zI"], function(count) { zoom_in(4); },
        {
            short_help: "Zoom in current web page by 100%",
            help: "Currently no count supported."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["zo", "-"], function(count) { zoom_in(-1); },
        {
            short_help: "Zoom out current web page by 25%",
            help: "Currently no count supported."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["zO"], function(count) { zoom_in(-4); },
        {
            short_help: "Zoom out current web page by 100%",
            help: "Currently no count supported."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["zz"], zoom_to,
        {
            short_help: "Set zoom value of the webpage",
            help: "Zoom value can be between 25 and 500%. If it is omitted, zoom is reset to 100%.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["ZQ"], function(count) { quit(false); },
        {
            short_help: "Quit and don't save the session",
            help: "Works like <code class=\"command\">:qall</code>."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["ZZ"], function(count) { quit(true); },
        {
            short_help: "Quit and save the session",
            help: "Quit Vimperator, no matter how many tabs/windows are open. The session is stored.<br/>" +
                  "Works like <code class=\"command\">:xall</code>."
        }
    ));

	/* scrolling commands */
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["0", "^"], function(count) { scrollBufferAbsolute(0, -1); },
        {
            short_help: "Scroll to the absolute left of the document",
            help: "Unlike in vim, <code class=\"mapping\">0</code> and <code class=\"mapping\">^</code> work exactly the same way."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["$"], function(count) { scrollBufferAbsolute(100, -1); },
        {
            short_help: "Scroll to the absolute right of the document",
            help: null
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["gg", "<Home>"], function(count) { scrollBufferAbsolute(-1, count >  0 ? count : 0); },
        {
            short_help: "Goto the top of the document",
            help: "Count is supported, <code class=\"mapping\">35gg</code> vertically goes to 35% of the document.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["G", "<End>"], function(count) { scrollBufferAbsolute(-1, count >= 0 ? count : 100); },
        {
            short_help: "Goto the end of the document",
            help: "Count is supported, <code class=\"mapping\">35G</code> vertically goes to 35% of the document.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["h", "<Left>"], function(count) { scrollBufferRelative(-1, 0); },
        {
            short_help: "Scroll document to the left",
            help: "Count is supported: <code class=\"mapping\">10h</code> will move 10 times as much to the left.<br/>" +
                  "If the document cannot scroll more, a beep is emmited (unless <code class=\"setting\">'beep'</code> is turned off).",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["j", "<Down>", "<C-e>"], function(count) { scrollBufferRelative(0, 1); },
        {
            short_help: "Scroll document down",
            help: "Count is supported: <code class=\"mapping\">10j</code> will move 10 times as much down.<br/>" +
                  "If the document cannot scroll more, a beep is emmited (unless <code class=\"setting\">'beep'</code> is turned off).",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["k", "<Up>", "<C-y>"], function(count) { scrollBufferRelative(0, -1); },
        {
            short_help: "Scroll document up",
            help: "Count is supported: <code class=\"mapping\">10k</code> will move 10 times as much up.<br/>" +
                  "If the document cannot scroll more, a beep is emmited (unless <code class=\"setting\">'beep'</code> is turned off).",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["l", "<Right>"], function(count) { scrollBufferRelative(1, 0); },
        {
            short_help: "Scroll document to the right",
            help: "Count is supported: <code class=\"mapping\">10l</code> will move 10 times as much to the right.<br/>" +
                  "If the document cannot scroll more, a beep is emmited (unless <code class=\"setting\">'beep'</code> is turned off).",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["<C-b>", "<C-u>", "<PageUp>", "<S-Space>"], function(count) { goDoCommand('cmd_scrollPageUp'); },
        {
            short_help: "Scroll up a full page of the current document",
            help: "No count support for now."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["<C-f>", "<C-d>", "<PageDown>", "<Space>"], function(count) { goDoCommand('cmd_scrollPageDown'); },
        {
            short_help: "Scroll down a full page of the current document",
            help: "No count support for now."
        }
    ));

	/* history manipulation and jumplist */
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["<C-o>"], function(count) { stepInHistory(count > 0 ? -1 * count : -1); },
        {
            short_help: "Go to an older position in the jump list",
            help: "The jump list is just the browser history for now.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["<C-i>"], function(count) { stepInHistory(count > 0 ? count : 1); },
        {
            short_help: "Go to a newer position in the jump list",
            help: "The jump list is just the browser history for now.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["H", "<A-Left>", "<M-Left>"], function(count) { stepInHistory(count > 0 ? -1 * count : -1); },
        {
            short_help: "Go back in the browser history",
            help: "Count is supported, <code class=\"mapping\">3H</code> goes back 3 steps.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["L", "<A-Right>", "<M-Right>"], function(count) { stepInHistory(count > 0 ? count : 1); },
        {
            short_help: "Go forward in the browser history",
            help: "Count is supported, <code class=\"mapping\">3L</code> goes forward 3 steps.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["gu", "<BS>"], goUp,
        {
            short_help: "Go to parent directory",
            help: "Count is supported, <code class=\"mapping\">2gu</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> would open <code>http://www.example.com/dir1/</code>.",
            flags: this.flags.COUNT
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["gU", "<C-BS>"], function(count) { openURLs("..."); },
        {
            short_help: "Go to the root of the website",
            help: "<code class=\"mapping\">gU</code> on <code>http://www.example.com/dir1/dir2/file.htm</code> opens <code>http://www.example.com/</code>.<br/>" +
                  "When browsing a local directory, it goes to the root document."
        }
    ));

	/* hint managment */
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["f"], function(count) { hah.enableHahMode(vimperator.modes.QUICK_HINT); },
        {
            short_help: "Start QuickHint mode",
            help: "In QuickHint mode, every hintable item (according to the <code class=\"setting\">'hinttags'</code> XPath query) is assigned a label.<br/>" +
                  "If you then press the keys for a label, it is followed as soon as it can be uniquely identified and this mode is stopped. Or press <code class=\"mapping\">&lt;Esc&gt;</code> to stop this mode.<br/>" +
                  "If you write the hint in ALLCAPS, the hint is followed in a background tab."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["F"], function(count) { hah.enableHahMode(vimperator.modes.ALWAYS_HINT); },
        {
            short_help: "Start AlwaysHint mode",
            help: "In AlwaysHint mode, every hintable item (according to the <code class=\"setting\">'hinttags'</code> XPath query) is assigned a label.<br/>" +
                  "If you then press the keys for a label, it is followed as soon as it can be uniquely identified. Labels stay active after following a hint in this mode, press <code class=\"mapping\">&lt;Esc&gt;</code> to stop this mode.<br/>" +
                  "This hint mode is especially useful for browsing large sites like Forums as hints are automatically regenerated when switching to a new document.<br/>" +
                  "Also, most <code class=\"mapping\">Ctrl</code>-prefixed short_helpcut keys are available in this mode for navigation."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, [";"], function(count) { hah.enableHahMode(vimperator.modes.EXTENDED_HINT); },
        {
            short_help: "Start ExtendedHint mode",
            help: "ExtendedHint mode is useful, since in this mode you can yank link locations, or open them in a new window.<br/>" +
                  "E.g., if you want to yank the location of hint <code>AB</code>, press <code class=\"mapping\">;</code> to start this hint mode.<br/>" +
                  "Then press <code>AB</code> to select the hint. Now press <code class=\"mapping\">y</code> to yank its location.<br/>" +
                  "Actions for selected hints in ExtendedHint mode are:<br/>" +
                  "<ul><li><code class=\"mapping\">y</code> to yank its location</li>" +
                  "    <li><code class=\"mapping\">Y</code> to yank its text description</li>" +
                  "    <li><code class=\"mapping\">o</code> to open its location in the current tab</li>" +
                  "    <li><code class=\"mapping\">t</code> to open its location in a new tab</li>" +
                  "    <li><code class=\"mapping\">O</code> to open its location in an <code class=\"command\">:open</code> query (not implemented yet)</li>" +
                  "    <li><code class=\"mapping\">T</code> to open its location in an <code class=\"command\">:tabopen</code> query (not implemented yet)</li>" +
                  "    <li><code class=\"mapping\">s</code> to save its destination (not implemented yet)</li>" +
                  "    <li><code class=\"mapping\">&lt;C-w&gt;</code> to open its destination in a new window</li>" +
                  "</ul>" +
                  "Multiple hints can be seperated by commas where it makes sense. <code class=\"mapping\">;ab,ac,adt</code> opens <code>AB</code>, <code>AC</code> and <code>AD</code> in a new tab.<br/>" +
                  "Hintable elements for this mode can be set in the <code class=\"setting\">'extendedhinttags'</code> XPath string."
        }
    ));

	/* search managment */
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["g/"], function(count) { vimperator.search.openSearchDialog(); },
        {
            short_help: "Search forward for a pattern",
            help: ""
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["n"], function(count) { vimperator.search.findNext(); },
        {
            short_help: "Find next",
            help: "Repeat the last \"/\" 1 time (until count is supported)."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["N"], function(count) { vimperator.search.findPrevious(); },
        {
            short_help: "Find previous",
            help: "Repeat the last \"/\" 1 time (until count is supported) in the opposite direction."
        }
    ));

	/* vimperator managment */
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["<F1>"], function(count) { help(null); },
        {
            short_help: "Open help window",
            help: "The default section is shown, if you need help for a specific topic, try <code class=\"command\">:help &lt;F1&gt;</code> (jumping to a specific section not implemented yet)."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, [":"], function(count) { vimperator.commandline.open(":", "", vimperator.modes.EX); },
        {
            short_help: "Start command line mode",
            help: "In command line mode, you can perform extended commands, which may require arguments."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["I"], function(count) { vimperator.addMode(null, vimperator.modes.ESCAPE_ALL_KEYS);},
        {
            short_help: "Disable vimperator keys",
            help: "Starts an 'ignorekeys' mode, where all keys except <code class=\"mapping\">&lt;Esc&gt;</code> are passed to the next event handler.<br/>" +
                  "This is especially useful, if JavaScript controlled forms like the RichEdit form fields of GMail don't work anymore.<br/>"  +
                  "To exit this mode, press <code class=\"mapping\">&lt;Esc&gt;</code>. If you also need to pass <code class=\"mapping\">&lt;Esc&gt;</code>" +
                  "in this mode to the webpage, prepend it with <code class=\"mapping\">&lt;C-v&gt;</code>."
        }
    ));
    // if you ever add/remove keys here, also check them in the onVimperatorKeypress() function
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["<C-v>"], function(count) { vimperator.addMode(null, vimperator.modes.ESCAPE_ONE_KEY); },
        {
            short_help: "Escape next key",
            help: "If you need to pass a certain key to a javascript form field or another extension prefix the key with <code class=\"mapping\">&lt;C-v&gt;</code>.<br/>" +
                  "Also works to unshadow Firefox short_helpcuts like <code class=\"mapping\">&lt;C-o&gt;</code> which are otherwise hidden in Vimperator.<br/>" +
                  "When in 'ignorekeys' mode (activated by <code class=\"mapping\">&lt;I&gt;</code>), <code class=\"mapping\">&lt;C-v&gt;</code> will pass the next key to Vimperator instead of the webpage."
        }
    ));
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["<C-c>"], BrowserStop,
        {
            short_help: "Stop loading",
            help: "Stops loading the current webpage."
        }
    ));
    // if you ever add/remove keys here, also check them in the onVimperatorKeypress()
	addDefaultMap(new Map(vimperator.mode.NORMAL, ["<Esc>", "<C-[>"], onEscape,
        {
            short_help: "Cancel any operation",
            help: "Exits any command line or hint mode and returns to browser mode.<br/>" +
                  "Also focuses the web page, in case a form field has focus and eats our key presses.",
        }
    ));

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
