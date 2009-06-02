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

Copyright (c) 2006-2009 by Martin Stubenschrott <stubenschrott@vimperator.org>

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

const configbase = { //{{{
    /**
     * @property {[["string", "string"]]} A sequence of names and descriptions
     *     of the autocommands available in this application. Primarily used
     *     for completion results.
     */
    autocommands: [],

    get browserModes() [modes.NORMAL],

    /**
     * @property {object} Application specific defaults for option values. The
     *     property names must be the options' canonical names, and the values
     *     must be strings as entered via :set.
     */
    defaults: { guioptions: "rb" },

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
     * @property {[string]} A list of HTML help files available under
     *     chrome://liberator/locale/. Used to generate help tag indexes for
     *     the :help command.
     */
    helpFiles: [],

    /**
     * @property {function} Called on liberator startup to allow for any
     *     arbitrary application-specific initialization code.
     */
    init: function () {},

    /**
     * @property {object} A map between key names for key events should be ignored,
     *     and a mask of the modes in which they should be ignored.
     */
    ignoreKeys: {}, // XXX: be aware you can't put useful values in here, as "modes.NORMAL" etc. are not defined at this time

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
     * @property {[string]} A list of extra scripts in the liberator or
     *    application namespaces which should be loaded before liberator
     *    initialization.
     */
    scripts: []
}; //}}}

// vim: set fdm=marker sw=4 ts=4 et:
