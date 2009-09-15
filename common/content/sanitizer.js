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

// TODO:
//   - should all storage items with the privateData flag be sanitizeable? i.e.
//     local-marks, url-marks, quick-marks, macros. Bookmarks et al aren't
//     sanitizeable in FF.
//   - add warning for TIMESPAN_EVERYTHING?
//   - respect privacy.clearOnShutdown et al or recommend VimperatorLeave autocommand?
//   - add support for :set sanitizeitems=all like 'eventignore'?
//   - integrate with the Clear Private Data dialog?

// FIXME:
//   - finish FF 3.0 support if we're going to support that in Vimperator 2.2

function Sanitizer() //{{{
{
    ////////////////////////////////////////////////////////////////////////////////
    ////////////////////// PRIVATE SECTION /////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    const local = {}; // XXX: is there some reason liberator.loadModule doesn't create modules with new?
    services.get("subscriptLoader").loadSubScript("chrome://browser/content/sanitize.js", local);
    const Sanitizer = local.Sanitizer;

    var prefToArgMap = {
        cache: "cache",
        cookies: "cookies",
        offlineApps: "offlineapps",
        history: "history",
        formdata: "formdata",
        downloads: "downloads",
        passwords: "passwords",
        sessions: "sessions",
        siteSettings: "sitesettings",
        commandLine: "commandline"
    };

    function prefToArg(pref) prefToArgMap[pref.replace(/.*\./, "")]
    function argToPref(arg) [p for ([p, a] in Iterator(prefToArgMap)) if (a == arg)][0]

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// OPTIONS /////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    options.add(["sanitizeitems", "si"],
        "The default list of private items to sanitize",
        "stringlist", "history,formdata,cookies,cache,sessions,commandline",
        {
            setter: function (values)
            {
                for (let [, pref] in Iterator(sanitizer.prefNames))
                {
                    options.setPref(pref, false);

                    for (let [, value] in Iterator(values.split(",")))
                    {
                        if (prefToArg(pref) == value)
                        {
                            options.setPref(pref, true);
                            break;
                        }
                    }
                }

                return values;
            },
            getter: function () sanitizer.prefNames.filter(function (pref) options.getPref(pref)).map(prefToArg).join(","),
            completer: function (value) [
                ["cache", "Cache"],
                ["cookies", "Cookies"],
                ["offlineapps", "Offline website data"],
                ["history", "Browsing history"],
                ["formdata", "Saved form and search history"],
                ["downloads", "Download history"],
                ["passwords", "Saved passwords"],
                ["sessions", "Authenticated sessions"],
                ["sitesettings", "Site preferences"],
                ["commandline", "Command-line history"]
            ],
            validator: Option.validateCompleter
        });

    options.add(["sanitizetimespan", "sts"],
        "The default sanitizer time span",
        "number", 1,
        {
            setter: function (value)
            {
                options.setPref("privacy.sanitize.timeSpan", value);
                return value;
            },
            getter: function () options.getPref("privacy.sanitize.timeSpan", this.defaultValue),
            completer: function (value) [
                ["0", "Everything"],
                ["1", "Last hour"],
                ["2", "Last two hours"],
                ["3", "Last four hours"],
                ["4", "Today"]
            ],
            validator: Option.validateCompleter
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// COMMANDS ////////////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    commands.add(["sa[nitize]"],
        "Clear private data",
        function (args)
        {
            if (options['private'])
                return void liberator.echomsg("Cannot sanitize items in private mode");

            let timespan = args["-timespan"] || options["sanitizetimespan"];

            sanitizer.range = Sanitizer.getClearRange(timespan);
            sanitizer.ignoreTimespan = !sanitizer.range;

            if (args.bang)
            {
                if (args.length > 0)
                    return void liberator.echoerr("E488: Trailing characters");

                liberator.log("Sanitizing all items in 'sanitizeitems'...");

                let errors = sanitizer.sanitize();

                if (errors)
                {
                    for (let item in errors)
                        liberator.echoerr("Error sanitizing " + item + ": " + errors[item]);
                }
            }
            else
            {
                if (args.length == 0)
                    return void liberator.echoerr("E471: Argument required");

                for (let [, item] in Iterator(args.map(argToPref)))
                {
                    liberator.log("Sanitizing " + item + " items...");

                    if (sanitizer.canClearItem(item))
                    {
                        try
                        {
                            sanitizer.clearItem(item);
                        }
                        catch (e)
                        {
                            liberator.echoerr("Error sanitizing " + item + ": " + e);
                        }
                    }
                    else
                        liberator.echomsg("Cannot sanitize " + item);
                }
            }
        },
        {
            argCount: "*", // FIXME: should be + and 0
            bang: true,
            completer: function (context) {
                context.title = ["Privacy Item", "Description"];
                context.completions = options.get("sanitizeitems").completer();
            },
            options: [
                [["-timespan", "-t"],
                 commands.OPTION_INT,
                 function (arg) /^[0-4]$/.test(arg),
                 function () options.get("sanitizetimespan").completer()]
             ]
        });

    /////////////////////////////////////////////////////////////////////////////}}}
    ////////////////////// PUBLIC SECTION //////////////////////////////////////////
    /////////////////////////////////////////////////////////////////////////////{{{

    var self = new Sanitizer();

    // TODO: remove this version test
    if (/^1.9.1/.test(services.get("xulAppInfo").platformVersion))
        self.prefDomain = "privacy.cpd.";
    else
        self.prefDomain = "privacy.item.";

    self.prefDomain2 = "extensions.liberator.privacy.cpd.";
    self.items.commandLine = {
        canClear: true,
        clear: function ()
        {
            let stores = ["command", "search"];

            if (self.range)
            {
                stores.forEach(function (store) {
                    storage["history-" + store].mutate("filter", function (item) {
                        let timestamp = item.timestamp * 1000;
                        return timestamp < self.range[0] || timestamp > self.range[1];
                    });
                });
            }
            else
                stores.forEach(function (store) { storage["history-" + store].truncate(0); });
        }
    };

    // FIXME
    // create liberator-specific sanitize prefs
    if (options.getPref(self.prefDomain2 + "commandLine") == null)
        options.setPref(self.prefDomain2 + "commandLine", false)

    self.getClearRange = Sanitizer.getClearRange;

    // Largely ripped from from browser/base/content/sanitize.js so we can override
    // the pref strategy without stepping on the global prefs namespace.
    self.sanitize = function () {
        const prefService = services.get("pref");
        let branch = prefService.getBranch(this.prefDomain);
        let branch2 = prefService.getBranch(this.prefDomain2);
        let errors = null;

        function prefSet(name)
        {
            try
            {
                return branch.getBoolPref(name);
            }
            catch (e)
            {
                return branch2.getBoolPref(name);
            }
        }

        // Cache the range of times to clear
        if (this.ignoreTimespan)
            var range = null;  // If we ignore timespan, clear everything
        else
            range = this.range || Sanitizer.getClearRange();

        for (let itemName in this.items)
        {
            let item = this.items[itemName];
            item.range = range;

            if ("clear" in item && item.canClear && prefSet(itemName))
            {
                liberator.log("Sanitizing " + itemName + " items...");
                // Some of these clear() may raise exceptions (see bug #265028)
                // to sanitize as much as possible, we catch and store them,
                // rather than fail fast.
                // Callers should check returned errors and give user feedback
                // about items that could not be sanitized
                try
                {
                    item.clear();
                }
                catch (e)
                {
                    if (!errors)
                        errors = {};
                    errors[itemName] = e;
                    dump("Error sanitizing " + itemName + ": " + e + "\n");
                }
            }
        }

        return errors;
    };

    self.__defineGetter__("prefNames", function () {
        let ret = [];

        [self.prefDomain, self.prefDomain2].forEach(function (branch) {
            ret = ret.concat(services.get("pref").getBranch(branch).getChildList("", {}).map(function (pref) branch + pref));
        });

        return ret;
    });
    //}}}

    return self;

} //}}}

// vim: set fdm=marker sw=4 ts=4 et:
