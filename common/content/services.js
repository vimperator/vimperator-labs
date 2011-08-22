// Copyright (c) 2008-2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the License.txt file included with this file.

/** @scope modules */

/**
 * Cached XPCOM services and classes.
 *
 * @constructor
 */
const Services = Module("services", {
    init: function () {
        this.classes = {};
        this.services = {
            "appStartup": {
                class_: "@mozilla.org/toolkit/app-startup;1",
                iface:  Ci.nsIAppStartup
            },
            "autoCompleteSearch": {
                class_: "@mozilla.org/autocomplete/search;1?name=history",
                iface:  Ci.nsIAutoCompleteSearch
            },
            "bookmarks": {
                class_: "@mozilla.org/browser/nav-bookmarks-service;1",
                iface:  Ci.nsINavBookmarksService
            },
            "browserSearch": {
                class_: "@mozilla.org/browser/search-service;1",
                iface:  Ci.nsIBrowserSearchService
            },
            "cache": {
                class_: "@mozilla.org/network/cache-service;1",
                iface:  Ci.nsICacheService
            },
            "console": {
                class_: "@mozilla.org/consoleservice;1",
                iface:  Ci.nsIConsoleService
            },
            "liberator:": {
                class_: "@mozilla.org/network/protocol;1?name=liberator"
            },
            "debugger": {
                class_: "@mozilla.org/js/jsd/debugger-service;1",
                iface:  Ci.jsdIDebuggerService
            },
            "directory": {
                class_: "@mozilla.org/file/directory_service;1",
                iface:  Ci.nsIProperties
            },
            "downloadManager": {
                class_: "@mozilla.org/download-manager;1",
                iface:  Ci.nsIDownloadManager
            },
            "environment": {
                class_: "@mozilla.org/process/environment;1",
                iface:  Ci.nsIEnvironment
            },
            "favicon": {
                class_: "@mozilla.org/browser/favicon-service;1",
                iface:  Ci.nsIFaviconService
            },
            "history": {
                class_: "@mozilla.org/browser/nav-history-service;1",
                iface:  [Ci.nsINavHistoryService, Ci.nsIBrowserHistory]
            },
            "io": {
                class_: "@mozilla.org/network/io-service;1",
                iface:  Ci.nsIIOService
            },
            "livemark": {
                class_: "@mozilla.org/browser/livemark-service;2",
                iface:  Ci.nsILivemarkService
            },
            "observer": {
                class_: "@mozilla.org/observer-service;1",
                iface:  Ci.nsIObserverService
            },
            "pref": {
                class_: "@mozilla.org/preferences-service;1",
                iface:  [Ci.nsIPrefService, Ci.nsIPrefBranch, Ci.nsIPrefBranch2]
            },
            "privateBrowsing": {
                class_: "@mozilla.org/privatebrowsing;1",
                iface:  Ci.nsIPrivateBrowsingService
            },
            "profile": {
                class_: "@mozilla.org/toolkit/profile-service;1",
                iface:  Ci.nsIToolkitProfileService
            },
            "rdf": {
                class_: "@mozilla.org/rdf/rdf-service;1",
                iface:  Ci.nsIRDFService
            },
            "sessionStore": {
                class_: "@mozilla.org/browser/sessionstore;1",
                iface:  Ci.nsISessionStore
            },
            "subscriptLoader": {
                class_: "@mozilla.org/moz/jssubscript-loader;1",
                iface:  Ci.mozIJSSubScriptLoader
            },
            "threadManager": {
                class_: "@mozilla.org/thread-manager;1",
                iface:  Ci.nsIThreadManager
            },
            "windowMediator": {
                class_: "@mozilla.org/appshell/window-mediator;1",
                iface:  Ci.nsIWindowMediator
            },
            "windowWatcher": {
                class_: "@mozilla.org/embedcomp/window-watcher;1",
                iface:  Ci.nsIWindowWatcher
            },
            "xulAppInfo": {
                class_: "@mozilla.org/xre/app-info;1",
                iface:  Ci.nsIXULAppInfo
            }
        };

        this.addClass("file",       "@mozilla.org/file/local;1",                 Ci.nsILocalFile);
        this.addClass("file:",      "@mozilla.org/network/protocol;1?name=file", Ci.nsIFileProtocolHandler);
        this.addClass("find",       "@mozilla.org/embedcomp/rangefind;1",        Ci.nsIFind);
        this.addClass("process",    "@mozilla.org/process/util;1",               Ci.nsIProcess);
        this.addClass("timer",     "@mozilla.org/timer;1",                      Ci.nsITimer);
    },

    _create: function (classes, ifaces, meth) {
        try {
            let res = Cc[classes][meth || "getService"]();
            if (!ifaces)
                return res.wrappedJSObject;
            ifaces = Array.concat(ifaces);
            ifaces.forEach(function (iface) res.QueryInterface(iface));
            return res;
        }
        catch (e) {
            // liberator.log() is not defined at this time, so just dump any error
            dump("Service creation failed for '" + classes + "': " + e + "\n");
            return null;
        }
    },

    /**
     * Adds a new XPCOM service to the cache.
     *
     * @param {string} name The service's cache key.
     * @param {string} class The class's contract ID.
     * @param {nsISupports|nsISupports[]} ifaces The interface or array of
     *     interfaces implemented by this service.
     * @param {string} meth The name of the function used to instanciate
     *     the service.
     */
    add: function (name, class_, ifaces, meth) {
        this.services[name] = {"class_": class_, "iface": ifaces, "meth": meth};
    },

    /**
     * Adds a new XPCOM class to the cache.
     *
     * @param {string} name The class's cache key.
     * @param {string} class The class's contract ID.
     * @param {nsISupports|nsISupports[]} ifaces The interface or array of
     *     interfaces implemented by this class.
     */
    addClass: function (name, class_, ifaces) {
        const self = this;
        return this.classes[name] = function () self._create(class_, ifaces, "createInstance");
    },

    /**
     * Returns the cached service with the specified name.
     *
     * @param {string} name The service's cache key.
     */
    get: function (name) {
        if (!this.services[name]["reference"]) {
            var currentService = this.services[name];

            this.services[name]["reference"] = this._create(currentService["class_"], currentService["iface"], currentService["meth"]);
        }

        return this.services[name]["reference"];
    },

    /**
     * Returns a new instance of the cached class with the specified name.
     *
     * @param {string} name The class's cache key.
     */
    create: function (name) this.classes[name]()
}, {
}, {
    completion: function () {
        JavaScript.setCompleter(this.get, [function () services.services]);
        JavaScript.setCompleter(this.create, [function () [[c, ""] for (c in services.classes)]]);

    }
});

// vim: set fdm=marker sw=4 ts=4 et:
