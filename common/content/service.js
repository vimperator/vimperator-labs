/** @scope modules */

let (cc = function (class, iface, meth) { try { return Components.classes[class][meth || "getService"](iface) } catch (e) {} })
{
   // var Ci = Components.interfaces; // quick fix for muttator, will change/remove service.js anyway after the vacation

    /**
     * Cached XPCOM services and instances.
     *
     * @singleton
     */
    const service = {
        appStartup:         cc("@mozilla.org/toolkit/app-startup;1", Components.interfaces.nsIAppStartup),
        autoCompleteSearch: cc("@mozilla.org/browser/global-history;2", Components.interfaces.nsIAutoCompleteSearch),
        browserSearch:      cc("@mozilla.org/browser/search-service;1", Components.interfaces.nsIBrowserSearchService),
        cache:              cc("@mozilla.org/network/cache-service;1", Components.interfaces.nsICacheService),
        console:            cc("@mozilla.org/consoleservice;1", Components.interfaces.nsIConsoleService),
        directory:          cc("@mozilla.org/file/directory_service;1", Components.interfaces.nsIProperties),
        environment:        cc("@mozilla.org/process/environment;1", Components.interfaces.nsIEnvironment),
        extensionManager:   cc("@mozilla.org/extensions/manager;1", Components.interfaces.nsIExtensionManager),
        json:               cc("@mozilla.org/dom/json;1", Components.interfaces.nsIJSON, "createInstance"),
        observer:           cc("@mozilla.org/observer-service;1", Components.interfaces.nsIObserverService),
        profile:            cc("@mozilla.org/toolkit/profile-service;1", Components.interfaces.nsIToolkitProfileService),
        sessionStore:       cc("@mozilla.org/browser/sessionstore;1", Components.interfaces.nsISessionStore),
        subscriptLoader:    cc("@mozilla.org/moz/jssubscript-loader;1", Components.interfaces.mozIJSSubScriptLoader),
        threadManager:      cc("@mozilla.org/thread-manager;1", Components.interfaces.nsIThreadManager),
        windowMediator:     cc("@mozilla.org/appshell/window-mediator;1", Components.interfaces.nsIWindowMediator),
        windowWatcher:      cc("@mozilla.org/embedcomp/window-watcher;1", Components.interfaces.nsIWindowWatcher),
        getFile: function ()    Cc["@mozilla.org/file/local;1"].createInstance(Components.interfaces.nsILocalFile),
        getFind: function ()    Cc["@mozilla.org/embedcomp/rangefind;1"].createInstance(Components.interfaces.nsIFind),
        getProcess: function () Cc["@mozilla.org/process/util;1"].createInstance(Components.interfaces.nsIProcess)
    };
};

