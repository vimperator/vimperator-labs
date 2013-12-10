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
        this.jsm = window.Services;
        this.services = {
            "autoCompleteSearch": {
                class_: "@mozilla.org/autocomplete/search;1?name=history",
                iface:  Ci.nsIAutoCompleteSearch
            },
            "bookmarks": {
                class_: "@mozilla.org/browser/nav-bookmarks-service;1",
                iface:  Ci.nsINavBookmarksService
            },
            "liberator:": {
                class_: "@mozilla.org/network/protocol;1?name=liberator"
            },
            "debugger": {
                class_: "@mozilla.org/js/jsd/debugger-service;1",
                iface:  Ci.jsdIDebuggerService
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
            "threadManager": {
                class_: "@mozilla.org/thread-manager;1",
                iface:  Ci.nsIThreadManager
            },
            "UUID": {
                class_: "@mozilla.org/uuid-generator;1",
                iface:  Ci.nsIUUIDGenerator
            },
            "textToSubURI": {
                class_: "@mozilla.org/intl/texttosuburi;1",
                iface: Ci.nsITextToSubURI
            },
            "io": {
                class_: "@mozilla.org/network/io-service;1",
                iface: Ci.nsIIOService
            },
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
        if (this.jsm.hasOwnProperty(name))
            return this.jsm[name];

        if (!this.services.hasOwnProperty(name))
            throw Error("Could not get service: " + name);

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
},
window.Services,
{
    completion: function () {
        JavaScript.setCompleter(this.get, [
            function () Object.keys(services.jsm).concat(Object.keys(services.services)).map(function(key) [key, ""])
        ]);
        JavaScript.setCompleter(this.create, [function () [[c, ""] for (c in services.classes)]]);

    }
});

// vim: set fdm=marker sw=4 ts=4 et:
