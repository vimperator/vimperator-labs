// Copyright (c) 2008-2009 by Kris Maglione <maglione.k at Gmail>
//
// This work is licensed for reuse under an MIT license. Details are
// given in the LICENSE.txt file included with this file.

/** @scope modules */

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cr = Components.results;
const Cu = Components.utils;

/**
 * Cached XPCOM services and classes.
 *
 * @constructor
 */
const Services = Module("services", {
    init: function () {
        this.classes = {};
        this.services = {};

        this.add("appStartup",          "@mozilla.org/toolkit/app-startup;1",               Ci.nsIAppStartup);
        this.add("autoCompleteSearch",  "@mozilla.org/autocomplete/search;1?name=history",  Ci.nsIAutoCompleteSearch);
        this.add("bookmarks",           "@mozilla.org/browser/nav-bookmarks-service;1",     Ci.nsINavBookmarksService);
        this.add("browserSearch",       "@mozilla.org/browser/search-service;1",            Ci.nsIBrowserSearchService);
        this.add("cache",               "@mozilla.org/network/cache-service;1",             Ci.nsICacheService);
        this.add("console",             "@mozilla.org/consoleservice;1",                    Ci.nsIConsoleService);
        this.add("liberator:",          "@mozilla.org/network/protocol;1?name=liberator");
        this.add("directory",           "@mozilla.org/file/directory_service;1",            Ci.nsIProperties);
        this.add("downloadManager",     "@mozilla.org/download-manager;1",                  Ci.nsIDownloadManager);
        this.add("environment",         "@mozilla.org/process/environment;1",               Ci.nsIEnvironment);
        this.add("extensionManager",    "@mozilla.org/extensions/manager;1",                Ci.nsIExtensionManager);
        this.add("favicon",             "@mozilla.org/browser/favicon-service;1",           Ci.nsIFaviconService);
        this.add("history",             "@mozilla.org/browser/global-history;2",            [Ci.nsIGlobalHistory3, Ci.nsINavHistoryService, Ci.nsIBrowserHistory]);
        this.add("io",                  "@mozilla.org/network/io-service;1",                Ci.nsIIOService);
        this.add("json",                "@mozilla.org/dom/json;1",                          Ci.nsIJSON, "createInstance");
        this.add("livemark",            "@mozilla.org/browser/livemark-service;2",          Ci.nsILivemarkService);
        this.add("observer",            "@mozilla.org/observer-service;1",                  Ci.nsIObserverService);
        this.add("pref",                "@mozilla.org/preferences-service;1",               [Ci.nsIPrefService, Ci.nsIPrefBranch, Ci.nsIPrefBranch2]);
        this.add("profile",             "@mozilla.org/toolkit/profile-service;1",           Ci.nsIToolkitProfileService);
        this.add("rdf",                 "@mozilla.org/rdf/rdf-service;1",                   Ci.nsIRDFService);
        this.add("sessionStore",        "@mozilla.org/browser/sessionstore;1",              Ci.nsISessionStore);
        this.add("subscriptLoader",     "@mozilla.org/moz/jssubscript-loader;1",            Ci.mozIJSSubScriptLoader);
        this.add("threadManager",       "@mozilla.org/thread-manager;1",                    Ci.nsIThreadManager);
        this.add("windowMediator",      "@mozilla.org/appshell/window-mediator;1",          Ci.nsIWindowMediator);
        this.add("windowWatcher",       "@mozilla.org/embedcomp/window-watcher;1",          Ci.nsIWindowWatcher);
        this.add("xulAppInfo",          "@mozilla.org/xre/app-info;1",                      Ci.nsIXULAppInfo);

        this.addClass("file",       "@mozilla.org/file/local;1",                 Ci.nsILocalFile);
        this.addClass("file:",      "@mozilla.org/network/protocol;1?name=file", Ci.nsIFileProtocolHandler);
        this.addClass("find",       "@mozilla.org/embedcomp/rangefind;1",        Ci.nsIFind);
        this.addClass("process",    "@mozilla.org/process/util;1",               Ci.nsIProcess);
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
    add: function (name, class, ifaces, meth) {
        return this.services[name] = this._create(class, ifaces, meth);
    },

    /**
     * Adds a new XPCOM class to the cache.
     *
     * @param {string} name The class's cache key.
     * @param {string} class The class's contract ID.
     * @param {nsISupports|nsISupports[]} ifaces The interface or array of
     *     interfaces implemented by this class.
     */
    addClass: function (name, class, ifaces) {
        const self = this;
        return this.classes[name] = function () self._create(class, ifaces, "createInstance");
    },

    /**
     * Returns the cached service with the specified name.
     *
     * @param {string} name The service's cache key.
     */
    get: function (name) this.services[name],

    /**
     * Returns a new instance of the cached class with the specified name.
     *
     * @param {string} name The class's cache key.
     */
    create: function (name) this.classes[name]()
});

// vim: set fdm=marker sw=4 ts=4 et:
