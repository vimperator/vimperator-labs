// Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

const ConfigBase = Class(ModuleBase, {
    /**
     * @property {[["string", "string"]]} A sequence of names and descriptions
     *     of the autocommands available in this application. Primarily used
     *     for completion results.
     */
    autocommands: [],

    get browser() window.gBrowser,
    get tabbrowser() window.gBrowser,

    get browserModes() [modes.NORMAL],

    /**
     * @property {Object} Application specific defaults for option values. The
     *     property names must be the options' canonical names, and the values
     *     must be strings as entered via :set.
     */
    defaults: { toolbars: "" },

    /**
     * @property {[["string", "string", "function"]]} An array of
     *    dialogs available via the :dialog command.
     *  [0] name - The name of the dialog, used as the first
     *             argument to :dialog.
     *  [1] description - A description of the dialog, used in
     *                    command completion results for :dialog.
     *  [2] action - The function executed by :dialog.
     */
    dialogs: [],

    /**
     * @property {string[]} A list of features available in this
     *    application. Used extensively in feature test macros. Use
     *    liberator.has(feature) to check for a feature's presence
     *    in this array.
     */
    features: [],

    guioptions: {},

    hasTabbrowser: false,

    /**
     * @property {string} The name of the application that hosts the
     *     “liberated” application. E.g., "Firefox" or "Xulrunner".
     */
    hostApplication: null,

    /**
     * @property {function} Called on liberator startup to allow for any
     *     arbitrary application-specific initialization code.
     */
    init: function () {},

    /**
     * @property {Object} A map between key names for key events should be ignored,
     *     and a mask of the modes in which they should be ignored.
     */
    ignoreKeys: {}, // XXX: be aware you can't put useful values in here, as "modes.NORMAL" etc. are not defined at this time

    /**
     * @property {string} The ID of the application's main XUL window.
     */
    mainWindowId: document.documentElement.id,

    /**
     * @property {[[]]} An array of application specific mode specifications.
     *     The values of each mode are passed to modes.addMode during
     *     liberator startup.
     */
    modes: [],

    /**
     * @property {string} The name of “liberated” application.
     *    Required.
     */
    name: null,

    /**
     * @property {number} The height (px) that is available to the output
     *     window.
     */
    get outputHeight() config.browser.mPanelContainer.boxObject.height,

    /**
     * @property {[string]} A list of extra scripts in the liberator or
     *    application namespaces which should be loaded before liberator
     *    initialization.
     */
    scripts: [],

    /**
     * @property {Object} A list of toolbars which can be shown/hidden
     *    with :set toolbars
     */
    toolbars: {},

    /**
     * @property {string} The leaf name of any temp files created by
     *     {@link io.createTempFile}.
     */
    get tempFile() this.name.toLowerCase() + ".tmp"

});

// vim: set fdm=marker sw=4 ts=4 et:
