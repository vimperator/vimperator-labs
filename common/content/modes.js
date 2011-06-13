// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/** @scope modules */

const Modes = Module("modes", {
    requires: ["config", "util"],

    init: function () {
        this._main = 1;     // NORMAL
        this._extended = 0; // NONE

        this._lastShown = null;

        this._passNextKey = false;
        this._passAllKeys = false;
        this._isRecording = false;
        this._isReplaying = false; // playing a macro

        this._modeStack = [];

        this._mainModes = [this.NONE];
        this._lastMode = 0;
        this._modeMap = {};

        // main modes, only one should ever be active
        this.addMode("NORMAL",   { char: "n", display: -1 });
        this.addMode("INSERT",   { char: "i", input: true });
        this.addMode("VISUAL",   { char: "v", display: function () "VISUAL" + (editor.getVisualMode() ? " " + editor.getVisualMode() : "") });
        this.addMode("COMMAND_LINE", { char: "c", input: true, display: -1 });
        this.addMode("CARET"); // text cursor is visible
        this.addMode("TEXTAREA", { char: "i" });
        this.addMode("EMBED",    { input: true });
        this.addMode("CUSTOM",   { display: function () plugins.mode });
        // this._extended modes, can include multiple modes, and even main modes
        this.addMode("EX", true);
        this.addMode("HINTS", true);
        this.addMode("INPUT_MULTILINE", true);
        this.addMode("OUTPUT_MULTILINE", true);
        this.addMode("SEARCH_FORWARD", true);
        this.addMode("SEARCH_BACKWARD", true);
        this.addMode("SEARCH_VIEW_FORWARD", true);
        this.addMode("SEARCH_VIEW_BACKWARD", true);
        this.addMode("LINE", true); // linewise visual mode
        this.addMode("PROMPT", true);

        config.modes.forEach(function (mode) { this.addMode.apply(this, mode); }, this);
    },

    _getModeMessage: function () {
        if (this._passNextKey)
            return "IGNORE";
        else if (this._passAllKeys)
            return "IGNORE ALL KEYS (Press <S-Esc> or <Insert> to exit)";

        // when recording or replaying a macro
        if (modes.isRecording)
            return "RECORDING";
        else if (modes.isReplaying)
            return "REPLAYING";

        if (this._main in this._modeMap && typeof this._modeMap[this._main].display === "function")
            return this._modeMap[this._main].display();

        return ""; // default mode message
    },

    // NOTE: Pay attention that you don't run into endless loops
    // Usually you should only indicate to leave a special mode like HINTS
    // by calling modes.reset() and adding the stuff which is needed
    // for its cleanup here
    _handleModeChange: function (oldMode, newMode, oldExtended) {
        switch (oldMode) {
            case modes.TEXTAREA:
            case modes.INSERT:
                editor.unselectText();
                break;

            case modes.VISUAL:
                if (newMode == modes.CARET) {
                    try { // clear any selection made; a simple if (selection) does not work
                        let selection = Buffer.focusedWindow.getSelection();
                        selection.collapseToStart();
                    }
                    catch (e) {}
                }
                else
                    editor.unselectText();
                break;

            case modes.CUSTOM:
                plugins.stop();
                break;

            case modes.COMMAND_LINE:
                // clean up for HINT mode
                if (oldExtended & modes.HINTS)
                    hints.hide();
                commandline.close();
                break;
        }

        if (newMode == modes.NORMAL) {
            // disable caret mode when we want to switch to normal mode
            if (options.getPref("accessibility.browsewithcaret"))
                options.setPref("accessibility.browsewithcaret", false);

            if (oldMode == modes.COMMAND_LINE)
                liberator.focusContent(false); // when coming from the commandline, we might want to keep the focus (after a Search, e.g.)
            else
                liberator.focusContent(true); // unfocus textareas etc.
        }
    },

    NONE: 0,

    __iterator__: function () util.Array.itervalues(this.all),

    get all() this._mainModes.slice(),

    get mainModes() (mode for ([k, mode] in Iterator(modes._modeMap)) if (!mode.extended && mode.name == k)),

    get mainMode() this._modeMap[this._main],

    addMode: function (name, extended, options) {
        let disp = name.replace("_", " ", "g");
        this[name] = 1 << this._lastMode++;
        if (typeof extended == "object") {
            options = extended;
            extended = false;
        }
        this._modeMap[name] = this._modeMap[this[name]] = util.extend({
            extended: extended,
            count: true,
            input: false,
            mask: this[name],
            name: name,
            disp: disp
        }, options);
        this._modeMap[name].display = this._modeMap[name].display || function () disp;
        if (!extended)
            this._mainModes.push(this[name]);
        if ("mappings" in modules)
            mappings.addMode(this[name]);
    },

    getMode: function (name) this._modeMap[name],

    getCharModes: function (chr) [m for (m in values(this._modeMap)) if (m.char == chr)],

    matchModes: function (obj) [m for (m in values(this._modeMap)) if (array(keys(obj)).every(function (k) obj[k] == (m[k] || false)))],

    // show the current mode string in the command line
    show: function () {
        if (options["showmode"])
            commandline.setModeMessage(this._getModeMessage());
    },

    // add/remove always work on the this._extended mode only
    add: function (mode) {
        this._extended |= mode;
        this.show();
    },

    // helper function to set both modes in one go
    // if silent == true, you also need to take care of the mode handling changes yourself
    set: function (mainMode, extendedMode, silent, stack) {
        silent = (silent || this._main == mainMode && this._extended == extendedMode);
        // if a this._main mode is set, the this._extended is always cleared
        let oldMain = this._main, oldExtended = this._extended;
        if (typeof extendedMode === "number")
            this._extended = extendedMode;
        if (typeof mainMode === "number") {
            this._main = mainMode;
            if (!extendedMode)
                this._extended = modes.NONE;

            if (this._main != oldMain) {
                this._handleModeChange(oldMain, mainMode, oldExtended);
                liberator.triggerObserver("modeChange", [oldMain, oldExtended], [this._main, this._extended]);
                // liberator.log("Changing mode from " + oldMain + "/" + oldExtended + " to " + this._main + "/" + this._extended + "(" + this._getModeMessage() + ")");

                if (!silent)
                    this.show();
            }
        }

    },

    // TODO: Deprecate this in favor of addMode? --Kris
    //       Ya --djk
    setCustomMode: function (modestr, oneventfunc, stopfunc) {
        // TODO this.plugin[id]... ('id' maybe submode or what..)
        plugins.mode = modestr;
        plugins.onEvent = oneventfunc;
        plugins.stop = stopfunc;
    },

    // keeps recording state
    reset: function (silent) {
        this._modeStack = [];
        if (config.isComposeWindow)
            this.set(modes.COMPOSE, modes.NONE, silent);
        else
            this.set(modes.NORMAL, modes.NONE, silent);
    },

    remove: function (mode) {
        if (this._extended & mode) {
            this._extended &= ~mode;
            this.show();
        }
    },

    isMenuShown: false, // when a popup menu is active

    get passNextKey() this._passNextKey,
    set passNextKey(value) { this._passNextKey = value; this.show(); },

    get passAllKeys() this._passAllKeys,
    set passAllKeys(value) { this._passAllKeys = value; this.show(); },

    get isRecording()  this._isRecording,
    set isRecording(value) { this._isRecording = value; this.show(); },

    get isReplaying() this._isReplaying,
    set isReplaying(value) { this._isReplaying = value; this.show(); },

    get main() this._main,
    set main(value) { this.set(value); },

    get extended() this._extended,
    set extended(value) { this.set(null, value); }
});

// vim: set fdm=marker sw=4 ts=4 et:
