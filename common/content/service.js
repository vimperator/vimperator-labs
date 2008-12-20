/** @scope modules */

let (cc = function (class, iface, meth) { try { return Cc[class][meth || "getService"](iface) } catch (e) {} })
{
    /**
     * Cached XPCOM services and instances.
     *
     * @singleton
     */
    const service = {
        appStartup:         cc("@mozilla.org/toolkit/app-startup;1", Ci.nsIAppStartup),
        autoCompleteSearch: cc("@mozilla.org/browser/global-history;2", Ci.nsIAutoCompleteSearch),
        browserSearch:      cc("@mozilla.org/browser/search-service;1", Ci.nsIBrowserSearchService),
        cache:              cc("@mozilla.org/network/cache-service;1", Ci.nsICacheService),
        console:            cc("@mozilla.org/consoleservice;1", Ci.nsIConsoleService),
        directory:          cc("@mozilla.org/file/directory_service;1", Ci.nsIProperties),
        environment:        cc("@mozilla.org/process/environment;1", Ci.nsIEnvironment),
        extensionManager:   cc("@mozilla.org/extensions/manager;1", Ci.nsIExtensionManager),
        io:                 cc("@mozilla.org/network/io-service;1", Ci.nsIIOService).QueryInterface(Ci.nsIIOService2),
        json:               cc("@mozilla.org/dom/json;1", Ci.nsIJSON, "createInstance"),
        observer:           cc("@mozilla.org/observer-service;1", Ci.nsIObserverService),
        profile:            cc("@mozilla.org/toolkit/profile-service;1", Ci.nsIToolkitProfileService),
        pref:               cc("@mozilla.org/preferences-service;1", Ci.nsIPrefService)
                                .QueryInterface(Ci.nsIPrefBranch).QueryInterface(Ci.nsIPrefBranch2),
        sessionStore:       cc("@mozilla.org/browser/sessionstore;1", Ci.nsISessionStore),
        subscriptLoader:    cc("@mozilla.org/moz/jssubscript-loader;1", Ci.mozIJSSubScriptLoader),
        threadManager:      cc("@mozilla.org/thread-manager;1", Ci.nsIThreadManager),
        windowMediator:     cc("@mozilla.org/appshell/window-mediator;1", Ci.nsIWindowMediator),
        windowWatcher:      cc("@mozilla.org/embedcomp/window-watcher;1", Ci.nsIWindowWatcher),
        getFile: function ()    Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile),
        getFind: function ()    Cc["@mozilla.org/embedcomp/rangefind;1"].createInstance(Ci.nsIFind),
        getProcess: function () Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess)
    };
};

