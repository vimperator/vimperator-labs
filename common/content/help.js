
const win = Components.classes["@mozilla.org/embedcomp/window-watcher;1"]
                      .getService(Components.interfaces.nsIWindowWatcher)
                      .activeWindow;
const liberator = win.liberator;

let page = liberator.findHelp(decodeURIComponent(document.location.search.substr(1)));
let url = page ? "chrome://liberator/locale/" + page : content.history.previous;

win.getBrowser().loadURIWithFlags(url, Components.interfaces.nsIWebNavigation.LOAD_FLAGS_REPLACE_HISTORY, null, null, null);

// vim: set fdm=marker sw=4 ts=4 et:
