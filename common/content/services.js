/***** BEGIN LICENSE BLOCK ***** {{{
 Copyright © 2008-2009 by Kris Maglione <maglione.k at Gmail>
 Distributable under the terms of the MIT license, which allows
 for sublicensing under any compatible license, including the MPL,
 GPL, and MPL. Anyone who changes this file is welcome to relicense
 it under any or all of those licenseses.
}}} ***** END LICENSE BLOCK *****/

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
function Services()
{
    const classes = {};
    const services = {};

    function create(classes, ifaces, meth)
    {
        ifaces = Array.concat(ifaces);
        try
        {
            let res = Cc[classes][meth || "getService"](ifaces.shift());
            ifaces.forEach(function (iface) res.QueryInterface(iface));
            return res;
        }
        catch (e)
        {
            // liberator.log() is not defined at this time, so just dump any error
            dump("Service creation failed for '" + classes + "': " + e);
        }
    }

    const self = {
        /* @property {Object} A map of all cached services. */
        get services() services,

        /* @property {Object} A map of all cached classes. */
        get classes() classes,

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
        add: function (name, class, ifaces, meth)
        {
            return services[name] = create(class, ifaces, meth);
        },

        /**
         * Adds a new XPCOM class to the cache.
         *
         * @param {string} name The class's cache key.
         * @param {string} class The class's contract ID.
         * @param {nsISupports|nsISupports[]} ifaces The interface or array of
         *     interfaces implemented by this class.
         */
        addClass: function (name, class, ifaces)
        {
            return classes[name] = function () create(class, ifaces, "createInstance");
        },

        /**
         * Returns the cached service with the specified name.
         *
         * @param {string} name The service's cache key.
         */
        get: function (name) services[name],

        /**
         * Returns a new instance of the cached class with the specified name.
         *
         * @param {string} name The class's cache key.
         */
        create: function (name) classes[name]()
    };

    self.add("appStartup",          "@mozilla.org/toolkit/app-startup;1",       Ci.nsIAppStartup);
    self.add("autoCompleteSearch",  "@mozilla.org/autocomplete/search;1?name=history", Ci.nsIAutoCompleteSearch);
    self.add("browserSearch",       "@mozilla.org/browser/search-service;1",    Ci.nsIBrowserSearchService);
    self.add("cache",               "@mozilla.org/network/cache-service;1",     Ci.nsICacheService);
    self.add("commandLineHandler",  "@mozilla.org/commandlinehandler/general-startup;1?type=liberator", Ci.nsICommandLineHandler);
    self.add("console",             "@mozilla.org/consoleservice;1",            Ci.nsIConsoleService);
    self.add("directory",           "@mozilla.org/file/directory_service;1",    Ci.nsIProperties);
    self.add("environment",         "@mozilla.org/process/environment;1",       Ci.nsIEnvironment);
    self.add("extensionManager",    "@mozilla.org/extensions/manager;1",        Ci.nsIExtensionManager);
    self.add("favicon",             "@mozilla.org/browser/favicon-service;1",   Ci.nsIFaviconService);
    self.add("json",                "@mozilla.org/dom/json;1",                  Ci.nsIJSON, "createInstance");
    self.add("observer",            "@mozilla.org/observer-service;1",          Ci.nsIObserverService);
    self.add("io",                  "@mozilla.org/network/io-service;1",        Ci.nsIIOService);
    self.add("pref",                "@mozilla.org/preferences-service;1",       [Ci.nsIPrefService, Ci.nsIPrefBranch, Ci.nsIPrefBranch2]);
    self.add("profile",             "@mozilla.org/toolkit/profile-service;1",   Ci.nsIToolkitProfileService);
    self.add("rdf",                 "@mozilla.org/rdf/rdf-service;1",           Ci.nsIRDFService);
    self.add("sessionStore",        "@mozilla.org/browser/sessionstore;1",      Ci.nsISessionStore);
    self.add("subscriptLoader",     "@mozilla.org/moz/jssubscript-loader;1",    Ci.mozIJSSubScriptLoader);
    self.add("threadManager",       "@mozilla.org/thread-manager;1",            Ci.nsIThreadManager);
    self.add("windowMediator",      "@mozilla.org/appshell/window-mediator;1",  Ci.nsIWindowMediator);
    self.add("windowWatcher",       "@mozilla.org/embedcomp/window-watcher;1",  Ci.nsIWindowWatcher);
    self.add("bookmarks",           "@mozilla.org/browser/nav-bookmarks-service;1", Ci.nsINavBookmarksService);

    self.addClass("file",       "@mozilla.org/file/local;1",            Ci.nsILocalFile);
    self.addClass("find",       "@mozilla.org/embedcomp/rangefind;1",   Ci.nsIFind);
    self.addClass("process",    "@mozilla.org/process/util;1",          Ci.nsIProcess);

    return self;
};

var services = Services();

// vim: set fdm=marker sw=4 ts=4 et:
